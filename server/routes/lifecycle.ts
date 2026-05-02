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
  type DetectionRules,
} from "../services/lifecycle-compliance";
import { buildRequiredFieldsByTenantId } from "../services/metadata-completeness";
import { logAuditEvent, AUDIT_ACTIONS } from "../services/audit-logger";

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

      const rules: DetectionRules = {
        ...defaultDetectionRules(),
        staleThresholdDays: q.staleThresholdDays ?? defaultDetectionRules().staleThresholdDays,
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
      const rules = defaultDetectionRules();

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
        const rules = defaultDetectionRules();

        let totalScore = 0;
        let compliantCount = 0, staleCount = 0, orphanedCount = 0, missingLabelCount = 0, externallySharedCount = 0;

        for (const w of workspaces) {
          const fields = w.tenantConnectionId ? (requiredFieldsByTenant[w.tenantConnectionId] || []) : [];
          const c = evaluateCompliance(w as any, fields, rules);
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

      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.LIFECYCLE_REMEDIATION_OWNER_EMAILED,
        resource: "workspace",
        resourceId: workspace.id,
        organizationId: orgId,
        tenantConnectionId: workspace.tenantConnectionId,
        details: {
          ownerEmail: workspace.ownerPrincipalName,
          ownerName: workspace.ownerDisplayName,
          workspaceName: workspace.displayName,
        },
        result: "SUCCESS",
      });

      res.json({ ok: true });
    } catch (err: any) {
      console.error("[lifecycle] email-owner error:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

export default router;
