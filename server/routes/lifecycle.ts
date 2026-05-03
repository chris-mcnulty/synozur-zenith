/**
 * BL-007 — Site Lifecycle Review Queue API
 *
 * GET    /api/lifecycle/review        — paginated, filtered, sorted review queue
 * GET    /api/lifecycle/health        — org-wide health summary + 8-week trend
 * POST   /api/lifecycle/review/scan   — trigger a fresh compliance scan
 * GET    /api/lifecycle/scan/latest   — latest completed scan run for tenant/org
 * POST   /api/lifecycle/review/:workspaceId/email-owner — emit owner-email audit event
 *
 * Feature-gated: lifecycleReview (Standard+)
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/rbac";
import { requireFeature } from "../services/feature-gate";
import { storage } from "../storage";
import {
  getActiveOrgId,
  getAccessibleTenantConnectionIds,
} from "./scope-helpers";
import {
  evaluateCompliance,
  defaultDetectionRules,
  isCompliant,
  type ComplianceCriterion,
  type DetectionRules,
  type ComplianceWeights,
} from "../services/lifecycle-compliance";
import { buildRequiredFieldsByTenantId } from "../services/metadata-completeness";
import { logAuditEvent, AUDIT_ACTIONS } from "../services/audit-logger";
import {
  insertLifecycleComplianceSettingsSchema,
  LIFECYCLE_DETECTION_DEFAULTS,
  LIFECYCLE_WEIGHT_DEFAULTS,
  type LifecycleComplianceSettings,
} from "@shared/schema";
import { getUncachableSendGridClient } from "../services/sendgrid-client";

// Load detection rules + weights from per-org (and optionally per-tenant) settings,
// falling back to compiled-in defaults.
async function loadDetectionRules(
  organizationId: string,
  tenantConnectionId?: string | null,
): Promise<DetectionRules> {
  let row: LifecycleComplianceSettings | undefined;
  if (tenantConnectionId) {
    row = await storage.getLifecycleComplianceSettings({ organizationId, tenantConnectionId });
  }
  if (!row) {
    row = await storage.getLifecycleComplianceSettings({ organizationId, tenantConnectionId: null });
  }
  if (!row) return defaultDetectionRules();
  return {
    staleThresholdDays: row.staleThresholdDays,
    orphanedThresholdDays: row.orphanedThresholdDays,
    labelRequired: row.labelRequired,
    metadataRequired: row.metadataRequired,
    weights: {
      primarySteward: row.weightPrimarySteward,
      secondarySteward: row.weightSecondarySteward,
      sensitivityLabel: row.weightSensitivityLabel,
      metadata: row.weightMetadata,
      activity: row.weightActivity,
      sharingPosture: row.weightSharingPosture,
      retentionLabel: row.weightRetentionLabel,
    },
  };
}

function settingsToRules(row: LifecycleComplianceSettings): DetectionRules {
  return {
    staleThresholdDays: row.staleThresholdDays,
    orphanedThresholdDays: row.orphanedThresholdDays,
    labelRequired: row.labelRequired,
    metadataRequired: row.metadataRequired,
    weights: {
      primarySteward: row.weightPrimarySteward,
      secondarySteward: row.weightSecondarySteward,
      sensitivityLabel: row.weightSensitivityLabel,
      metadata: row.weightMetadata,
      activity: row.weightActivity,
      sharingPosture: row.weightSharingPosture,
      retentionLabel: row.weightRetentionLabel,
    },
  };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function renderRemediationEmail(args: {
  ownerDisplayName: string | null;
  workspaceName: string;
  siteUrl: string | null;
  score: number;
  failingCriteria: ComplianceCriterion[];
  passingCriteria: ComplianceCriterion[];
  replyTo: string | null;
}): { html: string; text: string; subject: string } {
  const { ownerDisplayName, workspaceName, siteUrl, score, failingCriteria, passingCriteria, replyTo } = args;
  const subject = `Action needed: governance review for ${workspaceName} (compliance ${score}%)`;
  const failingHtml = failingCriteria.length === 0
    ? `<p style="margin:0;color:#374151;">No failing criteria — thank you for keeping this workspace in good shape.</p>`
    : `<ul style="margin:0;padding-left:20px;color:#374151;">${failingCriteria.map(c =>
        `<li style="margin-bottom:10px;"><strong>${escapeHtml(c.label)}</strong><br/><span style="color:#6b7280;">${escapeHtml(c.remediation)}</span></li>`
      ).join("")}</ul>`;
  const failingText = failingCriteria.length === 0
    ? "No failing criteria."
    : failingCriteria.map(c => `- ${c.label}: ${c.remediation}`).join("\n");
  const passingText = passingCriteria.length === 0
    ? ""
    : `\n\nWhat's working well:\n${passingCriteria.map(c => `- ${c.label}`).join("\n")}`;

  const html = `<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;background:#f5f5f5;margin:0;padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;max-width:600px;margin:0 auto;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td style="background:#5b0fbc;color:#fff;padding:20px;border-radius:8px 8px 0 0;font-weight:600;">Zenith lifecycle remediation</td></tr>
  <tr><td style="padding:24px;">
    <p style="margin:0 0 12px;">Hi ${escapeHtml(ownerDisplayName || "there")},</p>
    <p style="margin:0 0 16px;color:#374151;">Your SharePoint workspace <strong>${escapeHtml(workspaceName)}</strong>${siteUrl ? ` (<a href="${escapeHtml(siteUrl)}" style="color:#5b0fbc;">${escapeHtml(siteUrl.replace(/^https?:\/\//, ""))}</a>)` : ""} was flagged in the latest lifecycle review.</p>
    <p style="margin:0 0 8px;color:#374151;">Current compliance score: <strong>${score}%</strong></p>
    <h3 style="margin:20px 0 8px;font-size:14px;color:#111827;">Items needing attention</h3>
    ${failingHtml}
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">This message was sent via Zenith governance. Reply directly to ${escapeHtml(replyTo || "your governance admin")} for follow-up.</p>
  </td></tr>
</table></body></html>`;

  const text = `Hi ${ownerDisplayName || "there"},

Your SharePoint workspace "${workspaceName}"${siteUrl ? ` (${siteUrl})` : ""} was flagged in the latest lifecycle review.

Current compliance score: ${score}%

Items needing attention:
${failingText}${passingText}

Reply to ${replyTo || "your governance admin"} for follow-up.`;

  return { html, text, subject };
}

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveScope(req: AuthenticatedRequest, requestedTenantId?: string) {
  const orgId = getActiveOrgId(req);
  if (!orgId) return { ok: false as const, status: 400, error: "No active organization" };

  const allowed = await getAccessibleTenantConnectionIds(req);
  let tenantIds: string[] | null = allowed; // null = platform owner global

  if (requestedTenantId) {
    if (allowed !== null && !allowed.includes(requestedTenantId)) {
      return { ok: false as const, status: 403, error: "Forbidden" };
    }
    tenantIds = [requestedTenantId];
  }
  return { ok: true as const, orgId, tenantIds, requestedTenantId: requestedTenantId ?? null };
}

async function loadWorkspaces(tenantIds: string[] | null, orgId: string) {
  if (tenantIds === null) {
    return storage.getWorkspaces();
  }
  if (tenantIds.length === 0) return [];
  const out: any[] = [];
  for (const id of tenantIds) {
    const list = await storage.getWorkspaces(undefined, id, orgId);
    out.push(...list);
  }
  return out;
}

// ---------------------------------------------------------------------------
// GET /api/lifecycle/review
// ---------------------------------------------------------------------------

const reviewQuery = z.object({
  tenantConnectionId: z.string().optional(),
  filter: z.enum(["all", "stale", "orphaned", "missingLabel", "missingMetadata", "externalUnclassified"]).optional(),
  search: z.string().optional(),
  sort: z.enum(["scoreAsc", "scoreDesc", "lastActivityAsc", "lastActivityDesc"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  staleThresholdDays: z.coerce.number().int().min(1).max(3650).optional(),
});

router.get(
  "/api/lifecycle/review",
  requireAuth(),
  requireFeature("lifecycleReview"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = reviewQuery.safeParse(req.query);
      if (!parsed.success) return res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      const q = parsed.data;

      const scope = await resolveScope(req, q.tenantConnectionId);
      if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

      const workspaces = await loadWorkspaces(scope.tenantIds, scope.orgId);
      const requiredFieldsByTenant = await buildRequiredFieldsByTenantId(workspaces);

      const baseRules = await loadDetectionRules(scope.orgId, q.tenantConnectionId ?? null);
      const rules: DetectionRules = {
        ...baseRules,
        staleThresholdDays: q.staleThresholdDays ?? baseRules.staleThresholdDays,
      };

      const evaluated = workspaces.map((w) => {
        const fields = w.tenantConnectionId ? (requiredFieldsByTenant[w.tenantConnectionId] || []) : [];
        const compliance = evaluateCompliance(w as any, fields, rules);
        return { workspace: w, compliance };
      });

      // Filter
      let filtered = evaluated;
      switch (q.filter) {
        case "stale": filtered = evaluated.filter(e => e.compliance.isStale); break;
        case "orphaned": filtered = evaluated.filter(e => e.compliance.isOrphaned); break;
        case "missingLabel": filtered = evaluated.filter(e => e.compliance.missingLabel); break;
        case "missingMetadata": filtered = evaluated.filter(e => e.compliance.missingMetadata); break;
        case "externalUnclassified": filtered = evaluated.filter(e => e.compliance.externallySharedUnclassified); break;
        default: break;
      }

      if (q.search) {
        const needle = q.search.toLowerCase();
        filtered = filtered.filter(e =>
          e.workspace.displayName.toLowerCase().includes(needle) ||
          (e.workspace.ownerDisplayName ?? "").toLowerCase().includes(needle) ||
          (e.workspace.ownerPrincipalName ?? "").toLowerCase().includes(needle)
        );
      }

      // Sort — default scoreAsc (most non-compliant first)
      const sortKey = q.sort ?? "scoreAsc";
      filtered.sort((a, b) => {
        switch (sortKey) {
          case "scoreAsc": return a.compliance.score - b.compliance.score;
          case "scoreDesc": return b.compliance.score - a.compliance.score;
          case "lastActivityAsc": return (a.compliance.daysSinceActivity ?? 99999) - (b.compliance.daysSinceActivity ?? 99999);
          case "lastActivityDesc": return (b.compliance.daysSinceActivity ?? -1) - (a.compliance.daysSinceActivity ?? -1);
        }
        return 0;
      });
      // For lastActivityDesc, oldest activity first
      if (sortKey === "lastActivityDesc") {
        filtered.sort((a, b) => (b.compliance.daysSinceActivity ?? -1) - (a.compliance.daysSinceActivity ?? -1));
      }

      const total = filtered.length;
      const start = (q.page - 1) * q.pageSize;
      const slice = filtered.slice(start, start + q.pageSize);

      const items = slice.map(({ workspace, compliance }) => ({
        id: workspace.id,
        displayName: workspace.displayName,
        type: workspace.type,
        siteUrl: workspace.siteUrl,
        tenantConnectionId: workspace.tenantConnectionId,
        ownerDisplayName: workspace.ownerDisplayName,
        ownerCount: Array.isArray((workspace as any).siteOwners) ? ((workspace as any).siteOwners?.length ?? 0) : (workspace.owners ?? 0),
        sensitivity: workspace.sensitivity,
        sensitivityLabelId: workspace.sensitivityLabelId,
        retentionLabelId: workspace.retentionLabelId,
        externalSharing: workspace.externalSharing,
        lastActivityDate: workspace.lastActivityDate,
        daysSinceActivity: compliance.daysSinceActivity,
        score: compliance.score,
        compliant: isCompliant(compliance.score),
        isStale: compliance.isStale,
        isOrphaned: compliance.isOrphaned,
        missingLabel: compliance.missingLabel,
        missingMetadata: compliance.missingMetadata,
        externallySharedUnclassified: compliance.externallySharedUnclassified,
        breakdown: compliance.breakdown,
      }));

      res.json({
        items,
        total,
        page: q.page,
        pageSize: q.pageSize,
        rules,
      });
    } catch (err: any) {
      console.error("[lifecycle] review error:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/lifecycle/health
// ---------------------------------------------------------------------------

router.get(
  "/api/lifecycle/health",
  requireAuth(),
  requireFeature("lifecycleReview"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
      const scope = await resolveScope(req, tenantConnectionId);
      if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

      const workspaces = await loadWorkspaces(scope.tenantIds, scope.orgId);
      const requiredFieldsByTenant = await buildRequiredFieldsByTenantId(workspaces);
      const rules = await loadDetectionRules(scope.orgId, tenantConnectionId ?? null);

      let totalScore = 0;
      let compliant = 0, stale = 0, orphaned = 0, missingLabel = 0, externallyShared = 0;
      for (const w of workspaces) {
        const fields = w.tenantConnectionId ? (requiredFieldsByTenant[w.tenantConnectionId] || []) : [];
        const c = evaluateCompliance(w as any, fields, rules);
        totalScore += c.score;
        if (isCompliant(c.score)) compliant++;
        if (c.isStale) stale++;
        if (c.isOrphaned) orphaned++;
        if (c.missingLabel) missingLabel++;
        if (c.externallySharedUnclassified) externallyShared++;
      }
      const total = workspaces.length;
      const averageScore = total === 0 ? 0 : Math.round(totalScore / total);
      const compliantPercent = total === 0 ? 0 : Math.round((compliant / total) * 100);

      // Build 8-week trend from historical scan runs.
      const history = await storage.getLifecycleScanRuns({
        organizationId: scope.orgId,
        tenantConnectionId: tenantConnectionId,
        limit: 60,
      });
      const completedRuns = history.filter(h => h.status === "completed");
      const trend = completedRuns
        .slice(0, 8)
        .reverse()
        .map(r => ({
          date: r.completedAt,
          averageScore: r.averageScore,
          compliantCount: r.compliantCount,
          workspacesScanned: r.workspacesScanned,
        }));

      // Compare current vs prior week (most recent vs 2nd most recent)
      const prior = completedRuns[1];
      const trendDelta = prior ? averageScore - prior.averageScore : 0;

      res.json({
        summary: {
          total,
          compliant,
          compliantPercent,
          stale,
          orphaned,
          missingLabel,
          externallyShared,
          averageScore,
          trendDelta,
        },
        trend,
        latestScan: completedRuns[0] ?? null,
      });
    } catch (err: any) {
      console.error("[lifecycle] health error:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/lifecycle/review/scan
// ---------------------------------------------------------------------------

router.post(
  "/api/lifecycle/review/scan",
  requireAuth(),
  requireFeature("lifecycleReview"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const tenantConnectionId = (req.body?.tenantConnectionId ?? req.query.tenantConnectionId) as string | undefined;
      const scope = await resolveScope(req, tenantConnectionId);
      if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

      const run = await storage.createLifecycleScanRun({
        organizationId: scope.orgId,
        tenantConnectionId: tenantConnectionId ?? null,
        status: "running",
        startedAt: new Date(),
        triggeredBy: req.user?.email ?? "manual",
      });

      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.LIFECYCLE_SCAN_STARTED,
        resource: "lifecycle_scan",
        resourceId: run.id,
        organizationId: scope.orgId,
        tenantConnectionId: tenantConnectionId ?? null,
        details: { tenantConnectionId: tenantConnectionId ?? null },
        result: "SUCCESS",
      });

      // Run the scan synchronously — it's fast (in-memory math over the
      // workspace inventory we already have in the DB).
      try {
        const workspaces = await loadWorkspaces(scope.tenantIds, scope.orgId);
        const requiredFieldsByTenant = await buildRequiredFieldsByTenantId(workspaces);
        const scanRules = await loadDetectionRules(scope.orgId, tenantConnectionId ?? null);

        let totalScore = 0;
        let compliantCount = 0, staleCount = 0, orphanedCount = 0, missingLabelCount = 0, externallySharedCount = 0;

        for (const w of workspaces) {
          const fields = w.tenantConnectionId ? (requiredFieldsByTenant[w.tenantConnectionId] || []) : [];
          const c = evaluateCompliance(w as any, fields, scanRules);
          totalScore += c.score;
          if (isCompliant(c.score)) compliantCount++;
          if (c.isStale) staleCount++;
          if (c.isOrphaned) orphanedCount++;
          if (c.missingLabel) missingLabelCount++;
          if (c.externallySharedUnclassified) externallySharedCount++;

          await storage.upsertWorkspaceComplianceScore({
            workspaceId: w.id,
            organizationId: scope.orgId,
            tenantConnectionId: w.tenantConnectionId ?? null,
            score: c.score,
            isStale: c.isStale,
            isOrphaned: c.isOrphaned,
            missingLabel: c.missingLabel,
            missingMetadata: c.missingMetadata,
            externallySharedUnclassified: c.externallySharedUnclassified,
            daysSinceActivity: c.daysSinceActivity,
            breakdown: c.breakdown,
            computedAt: new Date(),
            scanRunId: run.id,
          });
        }

        const averageScore = workspaces.length === 0 ? 0 : Math.round(totalScore / workspaces.length);
        const completed = await storage.updateLifecycleScanRun(run.id, {
          status: "completed",
          completedAt: new Date(),
          workspacesScanned: workspaces.length,
          averageScore,
          compliantCount,
          staleCount,
          orphanedCount,
          missingLabelCount,
          externallySharedCount: externallySharedCount,
        });

        await logAuditEvent(req, {
          action: AUDIT_ACTIONS.LIFECYCLE_SCAN_COMPLETED,
          resource: "lifecycle_scan",
          resourceId: run.id,
          organizationId: scope.orgId,
          tenantConnectionId: tenantConnectionId ?? null,
          details: {
            workspacesScanned: workspaces.length,
            averageScore,
            compliantCount,
            staleCount,
            orphanedCount,
          },
          result: "SUCCESS",
        });

        res.json({ ok: true, run: completed ?? run });
      } catch (innerErr: any) {
        await storage.updateLifecycleScanRun(run.id, {
          status: "failed",
          completedAt: new Date(),
          errorMessage: innerErr?.message ?? String(innerErr),
        });
        await logAuditEvent(req, {
          action: AUDIT_ACTIONS.LIFECYCLE_SCAN_FAILED,
          resource: "lifecycle_scan",
          resourceId: run.id,
          organizationId: scope.orgId,
          tenantConnectionId: tenantConnectionId ?? null,
          details: { error: innerErr?.message ?? String(innerErr) },
          result: "FAILURE",
        });
        throw innerErr;
      }
    } catch (err: any) {
      console.error("[lifecycle] scan error:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// GET /api/lifecycle/scan/latest
// ---------------------------------------------------------------------------

router.get(
  "/api/lifecycle/scan/latest",
  requireAuth(),
  requireFeature("lifecycleReview"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
      const scope = await resolveScope(req, tenantConnectionId);
      if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

      const latest = await storage.getLatestLifecycleScanRun({
        organizationId: scope.orgId,
        tenantConnectionId: tenantConnectionId ?? null,
      });
      res.json({ run: latest ?? null });
    } catch (err: any) {
      console.error("[lifecycle] scan latest error:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// POST /api/lifecycle/review/:workspaceId/email-owner
// (records an audit event for the owner-email remediation action)
// ---------------------------------------------------------------------------

router.post(
  "/api/lifecycle/review/:workspaceId/email-owner",
  requireAuth(),
  requireFeature("lifecycleReview"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const orgId = getActiveOrgId(req);
      if (!orgId) return res.status(400).json({ error: "No active organization" });

      const workspace = await storage.getWorkspace(String(req.params.workspaceId));
      if (!workspace) return res.status(404).json({ error: "Workspace not found" });

      const allowed = await getAccessibleTenantConnectionIds(req);
      if (allowed !== null && (!workspace.tenantConnectionId || !allowed.includes(workspace.tenantConnectionId))) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const recipient = workspace.ownerPrincipalName;
      const auditBase = {
        resource: "workspace" as const,
        resourceId: workspace.id,
        organizationId: orgId,
        tenantConnectionId: workspace.tenantConnectionId,
      };

      if (!recipient) {
        const err = "No owner email on file for this workspace.";
        await logAuditEvent(req, {
          ...auditBase,
          action: AUDIT_ACTIONS.LIFECYCLE_REMEDIATION_OWNER_EMAILED,
          details: { workspaceName: workspace.displayName, error: err },
          result: "FAILURE",
        });
        return res.status(400).json({ error: err });
      }

      // Compute compliance for templated remediation guidance.
      const requiredFieldsByTenant = await buildRequiredFieldsByTenantId([workspace as any]);
      const fields = workspace.tenantConnectionId ? (requiredFieldsByTenant[workspace.tenantConnectionId] || []) : [];
      const compliance = evaluateCompliance(workspace as any, fields, defaultDetectionRules());
      const failingCriteria = compliance.breakdown.filter(c => !c.pass);
      const passingCriteria = compliance.breakdown.filter(c => c.pass);

      const { html, text, subject } = renderRemediationEmail({
        ownerDisplayName: workspace.ownerDisplayName,
        workspaceName: workspace.displayName,
        siteUrl: workspace.siteUrl,
        score: compliance.score,
        failingCriteria,
        passingCriteria,
        replyTo: req.user?.email || null,
      });

      let sgClient: Awaited<ReturnType<typeof getUncachableSendGridClient>>;
      try {
        sgClient = await getUncachableSendGridClient();
      } catch (sgErr: any) {
        const message = sgErr?.message || "SendGrid not configured";
        await logAuditEvent(req, {
          ...auditBase,
          action: AUDIT_ACTIONS.LIFECYCLE_REMEDIATION_OWNER_EMAILED,
          details: {
            ownerEmail: recipient,
            ownerName: workspace.ownerDisplayName,
            workspaceName: workspace.displayName,
            error: message,
          },
          result: "FAILURE",
        });
        return res.status(502).json({ error: `Email delivery unavailable: ${message}` });
      }

      try {
        await sgClient.client.send({
          to: recipient,
          from: sgClient.fromEmail,
          ...(req.user?.email ? { replyTo: req.user.email } : {}),
          subject,
          html,
          text,
        });
      } catch (sendErr: any) {
        const message = sendErr?.message || "Failed to send email";
        await logAuditEvent(req, {
          ...auditBase,
          action: AUDIT_ACTIONS.LIFECYCLE_REMEDIATION_OWNER_EMAILED,
          details: {
            ownerEmail: recipient,
            ownerName: workspace.ownerDisplayName,
            workspaceName: workspace.displayName,
            score: compliance.score,
            error: message,
          },
          result: "FAILURE",
        });
        return res.status(502).json({ error: message });
      }

      await logAuditEvent(req, {
        ...auditBase,
        action: AUDIT_ACTIONS.LIFECYCLE_REMEDIATION_OWNER_EMAILED,
        details: {
          ownerEmail: recipient,
          ownerName: workspace.ownerDisplayName,
          workspaceName: workspace.displayName,
          score: compliance.score,
          failingCriteria: failingCriteria.map(c => c.key),
        },
        result: "SUCCESS",
      });

      res.json({
        ok: true,
        recipient,
        score: compliance.score,
        failingCriteria: failingCriteria.map(c => ({ key: c.key, label: c.label })),
      });
    } catch (err: any) {
      console.error("[lifecycle] email-owner error:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

// ---------------------------------------------------------------------------
// GET/PUT /api/lifecycle/settings — Org-level lifecycle compliance thresholds
// and per-criterion weights. Optional ?tenantConnectionId= to read/write
// per-tenant overrides; otherwise applies to the org default.
// ---------------------------------------------------------------------------

const settingsBody = z.object({
  staleThresholdDays: z.coerce.number().int().min(1).max(3650),
  orphanedThresholdDays: z.coerce.number().int().min(1).max(3650),
  labelRequired: z.boolean(),
  metadataRequired: z.boolean(),
  weightPrimarySteward: z.coerce.number().int().min(0).max(100),
  weightSecondarySteward: z.coerce.number().int().min(0).max(100),
  weightSensitivityLabel: z.coerce.number().int().min(0).max(100),
  weightMetadata: z.coerce.number().int().min(0).max(100),
  weightActivity: z.coerce.number().int().min(0).max(100),
  weightSharingPosture: z.coerce.number().int().min(0).max(100),
  weightRetentionLabel: z.coerce.number().int().min(0).max(100),
  tenantConnectionId: z.string().nullable().optional(),
});

function buildResponseRow(orgId: string, row: LifecycleComplianceSettings | undefined) {
  if (row) return { ...row, isDefault: false };
  return {
    organizationId: orgId,
    tenantConnectionId: null,
    staleThresholdDays: LIFECYCLE_DETECTION_DEFAULTS.staleThresholdDays,
    orphanedThresholdDays: LIFECYCLE_DETECTION_DEFAULTS.orphanedThresholdDays,
    labelRequired: LIFECYCLE_DETECTION_DEFAULTS.labelRequired,
    metadataRequired: LIFECYCLE_DETECTION_DEFAULTS.metadataRequired,
    weightPrimarySteward: LIFECYCLE_WEIGHT_DEFAULTS.primarySteward,
    weightSecondarySteward: LIFECYCLE_WEIGHT_DEFAULTS.secondarySteward,
    weightSensitivityLabel: LIFECYCLE_WEIGHT_DEFAULTS.sensitivityLabel,
    weightMetadata: LIFECYCLE_WEIGHT_DEFAULTS.metadata,
    weightActivity: LIFECYCLE_WEIGHT_DEFAULTS.activity,
    weightSharingPosture: LIFECYCLE_WEIGHT_DEFAULTS.sharingPosture,
    weightRetentionLabel: LIFECYCLE_WEIGHT_DEFAULTS.retentionLabel,
    updatedAt: null,
    updatedBy: null,
    isDefault: true,
  };
}

router.get(
  "/api/lifecycle/settings",
  requireAuth(),
  requireFeature("lifecycleReview"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const tenantConnectionId = (req.query.tenantConnectionId as string | undefined) ?? null;
      const scope = await resolveScope(req, tenantConnectionId ?? undefined);
      if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

      const row = await storage.getLifecycleComplianceSettings({
        organizationId: scope.orgId,
        tenantConnectionId,
      });
      res.json({
        settings: buildResponseRow(scope.orgId, row),
        defaults: {
          ...LIFECYCLE_DETECTION_DEFAULTS,
          weights: { ...LIFECYCLE_WEIGHT_DEFAULTS },
        },
      });
    } catch (err: any) {
      console.error("[lifecycle] settings get error:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

router.put(
  "/api/lifecycle/settings",
  requireAuth(),
  requireFeature("lifecycleReview"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const role = (req.user as any)?.role;
      if (role !== "platform_owner" && role !== "tenant_admin" && role !== "governance_admin") {
        return res.status(403).json({ error: "Forbidden — admin role required" });
      }

      const parsed = settingsBody.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      const b = parsed.data;

      const scope = await resolveScope(req, b.tenantConnectionId ?? undefined);
      if (!scope.ok) return res.status(scope.status).json({ error: scope.error });

      const saved = await storage.upsertLifecycleComplianceSettings({
        organizationId: scope.orgId,
        tenantConnectionId: b.tenantConnectionId ?? null,
        staleThresholdDays: b.staleThresholdDays,
        orphanedThresholdDays: b.orphanedThresholdDays,
        labelRequired: b.labelRequired,
        metadataRequired: b.metadataRequired,
        weightPrimarySteward: b.weightPrimarySteward,
        weightSecondarySteward: b.weightSecondarySteward,
        weightSensitivityLabel: b.weightSensitivityLabel,
        weightMetadata: b.weightMetadata,
        weightActivity: b.weightActivity,
        weightSharingPosture: b.weightSharingPosture,
        weightRetentionLabel: b.weightRetentionLabel,
        updatedBy: req.user?.email ?? null,
      } as any);

      await logAuditEvent(req, {
        action: "lifecycle.settings.updated",
        resource: "lifecycle_settings",
        resourceId: saved.id,
        organizationId: scope.orgId,
        tenantConnectionId: b.tenantConnectionId ?? null,
        details: {
          staleThresholdDays: b.staleThresholdDays,
          orphanedThresholdDays: b.orphanedThresholdDays,
          labelRequired: b.labelRequired,
          metadataRequired: b.metadataRequired,
          weights: {
            primarySteward: b.weightPrimarySteward,
            secondarySteward: b.weightSecondarySteward,
            sensitivityLabel: b.weightSensitivityLabel,
            metadata: b.weightMetadata,
            activity: b.weightActivity,
            sharingPosture: b.weightSharingPosture,
            retentionLabel: b.weightRetentionLabel,
          },
        },
        result: "SUCCESS",
      });

      res.json({ settings: { ...saved, isDefault: false } });
    } catch (err: any) {
      console.error("[lifecycle] settings put error:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

export default router;
