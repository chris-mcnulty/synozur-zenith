import { Router, type Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { ZENITH_ROLES, type Workspace, type InsertWorkspace, type ServicePlanTier } from "@shared/schema";
import { requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { requireFeature, getPlanFeatures } from "../services/feature-gate";
import { getAccessibleTenantConnectionIds } from "./scope-helpers";
import { logAccessDenied } from "../services/audit-logger";
import {
  getAppToken,
  fetchSiteGroupOwners,
  addGroupOwner,
  archiveSite,
  applySensitivityLabelToSite,
  removeSensitivityLabelFromSite,
  assignSensitivityLabelToGroup,
  removeSensitivityLabelFromGroup,
  getGroupIdForSite,
  applyRetentionLabelToSite,
} from "../services/graph";
import { getEffectiveClientSecret, evaluateAllPoliciesForWorkspace, getDelegatedTokenForRetention } from "../services/sharepoint-sync";
import { writeSitePropertyBag } from "../services/graph";
import { getUncachableSendGridClient } from "../services/sendgrid-client";
import { getDelegatedSpoToken } from "../routes-entra";
import { computeWritebackHash } from "../services/writeback-hash";

const router = Router();

const WRITE_BATCH = 5;
const MAX_BULK_SIZE = 5000;

interface RowResult {
  workspaceId: string;
  displayName: string;
  success: boolean;
  error?: string;
  errorCode?: string;
  tenantConnectionId?: string | null;
  graphPushed?: boolean;
  graphPushError?: string;
  writebackSkipped?: boolean;
  groupPushed?: boolean;
  groupPushError?: string;
}

interface AuditBase {
  userId: string | null;
  userEmail: string | null;
  organizationId: string | null;
  ipAddress: string | null;
}

function buildAuditBase(req: AuthenticatedRequest): AuditBase {
  return {
    userId: req.user?.id || null,
    userEmail: req.user?.email || null,
    organizationId: req.user?.organizationId || null,
    ipAddress: req.ip || null,
  };
}

async function recordRowAudit(
  base: AuditBase,
  action: string,
  workspaceId: string,
  tenantConnectionId: string | null,
  details: Record<string, unknown>,
  result: "SUCCESS" | "FAILURE",
): Promise<void> {
  try {
    await storage.createAuditEntry({
      ...base,
      action,
      resource: "workspace",
      resourceId: workspaceId,
      tenantConnectionId,
      details: { ...details, bulk: true },
      result,
    });
  } catch (err: any) {
    console.error(`[bulk-audit] Failed to write per-row audit for ${action}/${workspaceId}: ${err.message}`);
  }
}

interface BulkFilterSpec {
  search?: string;
  tenantConnectionId?: string;
  selectionMode?: "explicit" | "all-matching";
  totalMatching?: number;
  filters?: {
    type?: string;
    sensitivity?: string;
    metadata?: string;
    department?: string;
    size?: string;
    age?: string;
    status?: string;
    outcomes?: Record<string, string>;
  };
}

async function resolveWorkspaceIdsFromFilter(
  req: AuthenticatedRequest,
  filterCriteria: BulkFilterSpec,
  res: Response,
): Promise<{ ok: false } | { ok: true; workspaces: Map<string, Workspace> }> {
  const allowedIds = await getAccessibleTenantConnectionIds(req);
  const organizationId = req.user?.organizationId || null;

  const allWorkspaces = await storage.getWorkspaces(
    filterCriteria.search,
    filterCriteria.tenantConnectionId,
    filterCriteria.tenantConnectionId ? undefined : (organizationId ?? undefined),
  );

  const scopedWorkspaces = allowedIds !== null
    ? allWorkspaces.filter(ws => ws.tenantConnectionId && allowedIds.includes(ws.tenantConnectionId))
    : allWorkspaces;

  const f = filterCriteria.filters || {};
  let filtered = scopedWorkspaces;

  if (f.type && f.type !== "all") {
    filtered = filtered.filter(ws => ws.type.toLowerCase() === f.type!.toLowerCase());
  }

  if (f.sensitivity && f.sensitivity !== "all") {
    if (f.sensitivity === "__none__" || f.sensitivity === "__blank__") {
      filtered = filtered.filter(ws => !ws.sensitivityLabelId);
    } else if (f.sensitivity === "__not_blank__") {
      filtered = filtered.filter(ws => !!ws.sensitivityLabelId);
    } else {
      filtered = filtered.filter(ws => ws.sensitivityLabelId === f.sensitivity);
    }
  }

  if (f.department && f.department !== "all") {
    if (f.department === "__blank__") {
      filtered = filtered.filter(ws => !ws.department);
    } else if (f.department === "__not_blank__") {
      filtered = filtered.filter(ws => !!ws.department);
    } else {
      filtered = filtered.filter(ws => ws.department === f.department);
    }
  }

  if (f.size && f.size !== "all") {
    const MB = 1024 * 1024;
    const GB = 1024 * MB;
    if (f.size === "__blank__") {
      filtered = filtered.filter(ws => ws.storageUsedBytes == null);
    } else if (f.size === "__not_blank__") {
      filtered = filtered.filter(ws => ws.storageUsedBytes != null);
    } else {
      filtered = filtered.filter(ws => {
        const bytes = ws.storageUsedBytes ?? 0;
        switch (f.size) {
          case "lt10mb": return bytes < 10 * MB;
          case "10to100mb": return bytes >= 10 * MB && bytes < 100 * MB;
          case "100mbto1gb": return bytes >= 100 * MB && bytes < GB;
          case "gt1gb": return bytes >= GB;
          default: return true;
        }
      });
    }
  }

  if (f.age && f.age !== "all") {
    const now = Date.now();
    const DAY = 86400000;
    if (f.age === "__blank__") {
      filtered = filtered.filter(ws => !ws.siteCreatedDate);
    } else if (f.age === "__not_blank__") {
      filtered = filtered.filter(ws => !!ws.siteCreatedDate);
    } else {
      filtered = filtered.filter(ws => {
        if (!ws.siteCreatedDate) return false;
        const created = new Date(ws.siteCreatedDate).getTime();
        const age = now - created;
        switch (f.age) {
          case "lt30d": return age < 30 * DAY;
          case "1to6m": return age >= 30 * DAY && age < 180 * DAY;
          case "6to12m": return age >= 180 * DAY && age < 365 * DAY;
          case "gt1y": return age >= 365 * DAY;
          default: return true;
        }
      });
    }
  }

  if (f.status && f.status !== "all") {
    filtered = filtered.filter(ws => {
      const lockState = ws.lockState || "Unlock";
      const lifecycle = (ws as any).lifecycleState ?? undefined;
      switch (f.status) {
        case "active": return lockState === "Unlock" && !ws.isDeleted && !ws.isArchived && lifecycle !== "PendingArchive";
        case "locked": return lockState === "NoAccess";
        case "readonly": return lockState === "ReadOnly";
        case "noadd": return lockState === "NoAdditions";
        case "deleted": return ws.isDeleted === true;
        case "archived": return ws.isArchived === true && lifecycle !== "PendingArchive";
        case "pendingarchive": return lifecycle === "PendingArchive";
        case "pendingrestore": return lifecycle === "PendingRestore";
        default: return true;
      }
    });
  }

  if (f.metadata && f.metadata !== "all" && filterCriteria.tenantConnectionId) {
    try {
      const conn = await storage.getTenantConnection(filterCriteria.tenantConnectionId);
      if (conn) {
        const metaEntries = await storage.getDataDictionary(conn.tenantId, "required_metadata_field");
        const requiredKeys: string[] = metaEntries.length > 0
          ? metaEntries.map(e => e.value)
          : ["department", "costCenter"];
        filtered = filtered.filter(ws => {
          const filled = requiredKeys.filter(k => !!(ws as any)[k]).length;
          if (f.metadata === "complete") return filled === requiredKeys.length;
          if (f.metadata === "missing") return filled < requiredKeys.length;
          return true;
        });
      }
    } catch (err: any) {
      console.warn(`[bulk-filter] Could not resolve metadata filter: ${err.message}`);
    }
  }

  if (f.outcomes && Object.keys(f.outcomes).length > 0 && organizationId) {
    try {
      const orgOutcomes = await storage.getPolicyOutcomes(organizationId);
      const outcomeFieldMap = new Map(orgOutcomes.map(o => [o.key, o.workspaceField]));
      for (const [key, val] of Object.entries(f.outcomes)) {
        if (!val || val === "all") continue;
        const workspaceField = outcomeFieldMap.get(key);
        if (!workspaceField) continue;
        filtered = filtered.filter(ws => {
          const fieldVal = (ws as any)[workspaceField];
          if (val === "pass") return fieldVal === true;
          if (val === "fail") return fieldVal !== true;
          return true;
        });
      }
    } catch (err: any) {
      console.warn(`[bulk-filter] Could not resolve outcome filters: ${err.message}`);
    }
  }

  if (filtered.length === 0) {
    res.status(400).json({ message: "No workspaces match the specified filter" });
    return { ok: false };
  }

  if (filtered.length > MAX_BULK_SIZE) {
    res.status(400).json({
      message: `Filter matches ${filtered.length} workspaces, exceeding the bulk limit of ${MAX_BULK_SIZE}. Narrow your filter and try again.`,
    });
    return { ok: false };
  }

  const map = new Map<string, Workspace>();
  for (const ws of filtered) {
    map.set(ws.id, ws);
  }
  return { ok: true, workspaces: map };
}

async function loadAndValidateScope(
  req: AuthenticatedRequest,
  workspaceIds: string[],
  res: Response,
): Promise<{ ok: false } | { ok: true; workspaces: Map<string, Workspace> }> {
  if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
    res.status(400).json({ message: "workspaceIds array is required" });
    return { ok: false };
  }
  if (workspaceIds.length > MAX_BULK_SIZE) {
    res.status(400).json({ message: `Bulk operation limited to ${MAX_BULK_SIZE} workspaces per call` });
    return { ok: false };
  }

  const fetched = await Promise.all(workspaceIds.map(id => storage.getWorkspace(id)));
  const map = new Map<string, Workspace>();
  for (let i = 0; i < workspaceIds.length; i++) {
    const ws = fetched[i];
    if (ws) map.set(workspaceIds[i], ws);
  }

  const allowedIds = await getAccessibleTenantConnectionIds(req);
  if (allowedIds !== null) {
    for (const id of workspaceIds) {
      const ws = map.get(id);
      if (!ws?.tenantConnectionId || !allowedIds.includes(ws.tenantConnectionId)) {
        await logAccessDenied(req, "workspace", id, "Workspace tenant outside caller scope (bulk)");
        res.status(403).json({ message: "One or more workspaces are outside your organization scope" });
        return { ok: false };
      }
    }
  }

  return { ok: true, workspaces: map };
}

async function loadAndValidateScopeOrFilter(
  req: AuthenticatedRequest,
  workspaceIds: string[],
  filterCriteria: BulkFilterSpec | undefined,
  res: Response,
): Promise<{ ok: false } | { ok: true; workspaces: Map<string, Workspace> }> {
  if (filterCriteria?.selectionMode === "all-matching") {
    return resolveWorkspaceIdsFromFilter(req, filterCriteria, res);
  }
  return loadAndValidateScope(req, workspaceIds, res);
}

async function runBatched(
  ids: string[],
  batchSize: number,
  worker: (id: string) => Promise<RowResult>,
): Promise<RowResult[]> {
  const out: RowResult[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(id =>
        worker(id).catch((err: any) => ({
          workspaceId: id,
          displayName: "Unknown",
          success: false,
          error: err?.message || "Unhandled error",
        })),
      ),
    );
    out.push(...results);
  }
  return out;
}

async function emitRollupAudit(
  req: AuthenticatedRequest,
  bulkAction: string,
  results: RowResult[],
  filterCriteria: unknown,
): Promise<string | null> {
  const succeeded = results.filter(r => r.success).length;
  const failed = results.length - succeeded;
  const tenantIds = Array.from(
    new Set(results.map(r => r.tenantConnectionId).filter((v): v is string => !!v)),
  );
  try {
    const entry = await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: "BULK_ACTION_APPLIED",
      resource: "workspace",
      resourceId: null,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: tenantIds.length === 1 ? tenantIds[0] : null,
      details: {
        bulkAction,
        count: results.length,
        succeeded,
        failed,
        filterCriteria: filterCriteria ?? null,
        workspaceIds: results.map(r => r.workspaceId),
        failedWorkspaces: results
          .filter(r => !r.success)
          .map(r => ({ id: r.workspaceId, name: r.displayName, error: r.error, errorCode: r.errorCode })),
      },
      result: failed === 0 ? "SUCCESS" : succeeded === 0 ? "FAILURE" : "PARTIAL",
      ipAddress: req.ip || null,
    });
    return entry?.id || null;
  } catch (err: any) {
    console.error(`[bulk-${bulkAction}] Failed to write rollup audit: ${err.message}`);
    return null;
  }
}

function buildResponse(action: string, results: RowResult[], rollupAuditId: string | null) {
  const succeeded = results.filter(r => r.success).length;
  const failed = results.length - succeeded;
  return {
    action,
    count: results.length,
    succeeded,
    failed,
    results: results.map(r => ({
      workspaceId: r.workspaceId,
      displayName: r.displayName,
      success: r.success,
      error: r.error,
      errorCode: r.errorCode,
      graphPushed: r.graphPushed,
      graphPushError: r.graphPushError,
      writebackSkipped: r.writebackSkipped,
      groupPushed: r.groupPushed,
      groupPushError: r.groupPushError,
    })),
    rollupAuditId,
  };
}

const baseBulkSchema = {
  workspaceIds: z.array(z.string()),
  filterCriteria: z.any().optional(),
};

// Apply Sensitivity Label — mirrors PATCH /api/workspaces/:id label logic.
const labelBodySchema = z.object({
  ...baseBulkSchema,
  payload: z.object({ sensitivityLabelId: z.string().nullable() }),
});

router.post(
  "/api/workspaces/bulk/label",
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const parsed = labelBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    }
    const { workspaceIds, payload, filterCriteria } = parsed.data;

    const validated = await loadAndValidateScopeOrFilter(req, workspaceIds, filterCriteria as BulkFilterSpec | undefined, res);
    if (!validated.ok) return;
    const { workspaces } = validated;
    const auditBase = buildAuditBase(req);
    const ACTION = "LABEL_ASSIGNED";

    interface TenantLabelContext {
      writeBackEnabled: boolean;
      labelValid: boolean;
      labelError?: string;
      spoHost?: string;
      spoToken?: string | null;
      spoTokenError?: string;
      graphToken?: string | null;
      graphTokenError?: string;
    }
    const tenantCtxCache = new Map<string, TenantLabelContext>();

    const getTenantLabelContext = async (tenantConnectionId: string): Promise<TenantLabelContext> => {
      const cached = tenantCtxCache.get(tenantConnectionId);
      if (cached) return cached;
      const ctx: TenantLabelContext = { writeBackEnabled: false, labelValid: false };
      const conn = await storage.getTenantConnection(tenantConnectionId);
      if (!conn) {
        ctx.labelError = "Tenant connection not found";
        tenantCtxCache.set(tenantConnectionId, ctx);
        return ctx;
      }
      const orgId = conn.organizationId || req.user?.organizationId;
      const org = orgId ? await storage.getOrganization(orgId) : null;
      const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
      ctx.writeBackEnabled = getPlanFeatures(plan).m365WriteBack;
      if (payload.sensitivityLabelId) {
        const labels = await storage.getSensitivityLabelsByTenantId(conn.tenantId);
        const target = labels.find(l => l.labelId === payload.sensitivityLabelId);
        if (!target) {
          ctx.labelError = "Sensitivity label not found in synced labels for this tenant";
        } else if (!target.appliesToGroupsSites) {
          ctx.labelError = `Label "${target.name}" does not apply to Groups & Sites`;
        } else {
          ctx.labelValid = true;
        }
      } else {
        ctx.labelValid = true;
      }
      ctx.spoHost = conn.domain.includes(".sharepoint.com")
        ? conn.domain
        : `${conn.domain.replace(/\..*$/, "")}.sharepoint.com`;
      if (ctx.writeBackEnabled && ctx.labelValid && req.user?.id) {
        // Delegated SPO token — required for applySensitivityLabelToSite (CSOM).
        try {
          ctx.spoToken = await getDelegatedSpoToken(req.user.id, ctx.spoHost!);
          if (!ctx.spoToken) {
            ctx.spoTokenError = "No delegated SharePoint token available — sign in via SSO with a SharePoint admin account to push labels.";
          }
        } catch (err: any) {
          ctx.spoTokenError = `Failed to acquire SharePoint token: ${err.message}`;
        }
        // App token (client credentials) — required for assignSensitivityLabelToGroup.
        try {
          const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
          const clientSecret = getEffectiveClientSecret(conn);
          ctx.graphToken = await getAppToken(conn.tenantId, clientId, clientSecret);
        } catch (err: any) {
          ctx.graphTokenError = `Failed to acquire Graph app token: ${err.message}`;
        }
      }
      tenantCtxCache.set(tenantConnectionId, ctx);
      return ctx;
    };

    const results = await runBatched(Array.from(workspaces.keys()), WRITE_BATCH, async (id) => {
      const ws = workspaces.get(id);
      if (!ws) {
        await recordRowAudit(auditBase, ACTION, id, null, { error: "Workspace not found", newLabelId: payload.sensitivityLabelId }, "FAILURE");
        return { workspaceId: id, displayName: "Unknown", success: false, error: "Workspace not found" };
      }
      const baseDetails = {
        workspaceName: ws.displayName,
        previousLabelId: ws.sensitivityLabelId || null,
        newLabelId: payload.sensitivityLabelId,
      };

      if (!ws.tenantConnectionId) {
        await recordRowAudit(auditBase, ACTION, ws.id, null, { ...baseDetails, error: "No tenant connection" }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: "No tenant connection" };
      }

      const ctx = await getTenantLabelContext(ws.tenantConnectionId);
      if (!ctx.labelValid) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, { ...baseDetails, error: ctx.labelError }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: ctx.labelError, tenantConnectionId: ws.tenantConnectionId };
      }

      let pushed = false;
      let pushError: string | undefined;
      let writebackSkipped = false;
      let groupPushed = false;
      let groupPushError: string | undefined;

      if (!ctx.writeBackEnabled) {
        writebackSkipped = true;
      } else if (ctx.spoTokenError) {
        pushError = ctx.spoTokenError;
      } else if (!ctx.spoToken) {
        pushError = "No SharePoint token available";
      } else if (!ws.siteUrl) {
        pushError = "Workspace has no siteUrl — cannot push label to M365";
      } else {
        try {
          const res = payload.sensitivityLabelId
            ? await applySensitivityLabelToSite(ctx.spoToken, ws.siteUrl, payload.sensitivityLabelId, req.user!.id)
            : ws.sensitivityLabelId
              ? await removeSensitivityLabelFromSite(ctx.spoToken, ws.siteUrl, req.user!.id)
              : { success: true } as const;
          pushed = !!res.success;
          if (!res.success) pushError = res.error;
        } catch (err: any) {
          pushError = err.message;
        }

        // For M365 group-connected workspaces, also apply or clear the label at
        // the group level via Graph so that the group and site stay in sync.
        // This is a best-effort secondary push: its failure is recorded in the
        // audit row and response but does not block the overall row success.
        if (pushed && ws.m365ObjectId) {
          if (!ctx.graphToken) {
            groupPushError = ctx.graphTokenError || "No Graph token available for group label sync";
          } else {
            // Resolve the actual M365 group ID from the site's drive owner.
            // ws.m365ObjectId is the Graph site ID, not the group ID.
            let resolvedGroupId: string | undefined;
            let resolveError: string | undefined;
            try {
              const grpIdResult = await getGroupIdForSite(ctx.graphToken, ws.m365ObjectId);
              resolvedGroupId = grpIdResult.groupId;
              resolveError = grpIdResult.error;
            } catch (err: any) {
              resolveError = err.message;
            }

            if (resolvedGroupId) {
              try {
                const grpRes = payload.sensitivityLabelId
                  ? await assignSensitivityLabelToGroup(ctx.graphToken, resolvedGroupId, payload.sensitivityLabelId)
                  : await removeSensitivityLabelFromGroup(ctx.graphToken, resolvedGroupId);
                groupPushed = !!grpRes.success;
                if (!grpRes.success) groupPushError = grpRes.error;
              } catch (err: any) {
                groupPushError = err.message;
              }
            } else {
              // Site has no associated M365 group — skip group push silently
              // (communication sites and classic sites are group-less).
              if (resolveError && resolveError !== "No M365 Group associated with this site") {
                groupPushError = resolveError;
              }
            }
          }
        }
      }

      // Hard-fail when writeback was attempted but failed; mirrors the
      // single-row 502 behaviour. When the plan does not include writeback,
      // we persist locally and report writebackSkipped on the row.
      if (ctx.writeBackEnabled && !pushed && !writebackSkipped) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          ...baseDetails,
          pushed: false,
          error: pushError,
        }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: pushError || "Label push failed", tenantConnectionId: ws.tenantConnectionId };
      }

      try {
        const updates: Partial<InsertWorkspace> = { sensitivityLabelId: payload.sensitivityLabelId };
        const merged = { ...ws, ...updates };
        const newHash = computeWritebackHash({
          sensitivityLabelId: merged.sensitivityLabelId,
          department: merged.department,
          costCenter: merged.costCenter,
          projectCode: merged.projectCode,
          propertyBag: merged.propertyBag,
        });
        updates.localHash = newHash;
        if (pushed) updates.spoSyncHash = newHash;
        await storage.updateWorkspace(ws.id, updates);
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          ...baseDetails,
          pushed,
          writebackSkipped,
          ...(pushError ? { pushError } : {}),
          ...(ws.m365ObjectId ? { groupPushed, ...(groupPushError ? { groupPushError } : {}) } : {}),
        }, "SUCCESS");
        return {
          workspaceId: ws.id,
          displayName: ws.displayName,
          success: true,
          tenantConnectionId: ws.tenantConnectionId,
          graphPushed: pushed,
          writebackSkipped,
          groupPushed: groupPushed || undefined,
          groupPushError,
        };
      } catch (err: any) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, { ...baseDetails, error: err.message }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: err.message, tenantConnectionId: ws.tenantConnectionId };
      }
    });

    const rollupAuditId = await emitRollupAudit(req, "apply_label", results, filterCriteria);
    res.json(buildResponse("apply_label", results, rollupAuditId));
  },
);

// 2. Set Retention Label ────────────────────────────────────────────────────
const retentionBodySchema = z.object({
  ...baseBulkSchema,
  payload: z.object({ retentionLabelId: z.string().nullable() }),
});

router.post(
  "/api/workspaces/bulk/retention",
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const parsed = retentionBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    }
    const { workspaceIds, payload, filterCriteria } = parsed.data;

    const validated = await loadAndValidateScopeOrFilter(req, workspaceIds, filterCriteria as BulkFilterSpec | undefined, res);
    if (!validated.ok) return;
    const { workspaces } = validated;
    const auditBase = buildAuditBase(req);
    const ACTION = "RETENTION_LABEL_ASSIGNED";

    // Per-tenant context: validate the chosen retention label, resolve its name
    // for the Graph API, and gate Graph writeback on the m365WriteBack feature.
    interface TenantRetentionContext {
      writeBackEnabled: boolean;
      labelValid: boolean;
      labelError?: string;
      labelName?: string | null;
      graphToken?: string | null;
      graphTokenError?: string;
    }
    const tenantRetCtxCache = new Map<string, TenantRetentionContext>();

    const getTenantRetentionContext = async (tenantConnectionId: string): Promise<TenantRetentionContext> => {
      const cached = tenantRetCtxCache.get(tenantConnectionId);
      if (cached) return cached;
      const ctx: TenantRetentionContext = { writeBackEnabled: false, labelValid: false };
      const conn = await storage.getTenantConnection(tenantConnectionId);
      if (!conn) {
        ctx.labelError = "Tenant connection not found";
        tenantRetCtxCache.set(tenantConnectionId, ctx);
        return ctx;
      }
      const orgId = conn.organizationId || req.user?.organizationId;
      const org = orgId ? await storage.getOrganization(orgId) : null;
      const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
      ctx.writeBackEnabled = getPlanFeatures(plan).m365WriteBack;

      if (payload.retentionLabelId === null) {
        ctx.labelValid = true;
        ctx.labelName = null;
      } else {
        const labels = await storage.getRetentionLabelsByTenantId(conn.tenantId);
        const target = labels.find(l => l.labelId === payload.retentionLabelId);
        if (!target) {
          ctx.labelError = "Retention label not found in synced labels for this tenant";
        } else {
          ctx.labelValid = true;
          ctx.labelName = target.name;
        }
      }

      if (ctx.writeBackEnabled && ctx.labelValid) {
        // Delegated Graph token — required for the drive/root/retentionLabel endpoint.
        // Falls back to any org-level token when the current user doesn't have one.
        try {
          const orgId = conn.organizationId || req.user?.organizationId;
          ctx.graphToken = await getDelegatedTokenForRetention(req.user?.id, orgId ?? undefined);
          if (!ctx.graphToken) {
            ctx.graphTokenError = "No delegated Graph token available — sign in via SSO to push retention labels to M365.";
          }
        } catch (err: any) {
          ctx.graphTokenError = `Failed to acquire Graph token: ${err.message}`;
        }
      }

      tenantRetCtxCache.set(tenantConnectionId, ctx);
      return ctx;
    };

    const results = await runBatched(Array.from(workspaces.keys()), WRITE_BATCH, async (id) => {
      const ws = workspaces.get(id);
      if (!ws) {
        await recordRowAudit(auditBase, ACTION, id, null, { error: "Workspace not found", newLabelId: payload.retentionLabelId }, "FAILURE");
        return { workspaceId: id, displayName: "Unknown", success: false, error: "Workspace not found" };
      }
      if (!ws.tenantConnectionId) {
        await recordRowAudit(auditBase, ACTION, ws.id, null, { workspaceName: ws.displayName, error: "No tenant connection" }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: "No tenant connection" };
      }

      const ctx = await getTenantRetentionContext(ws.tenantConnectionId);
      if (!ctx.labelValid) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          workspaceName: ws.displayName,
          newLabelId: payload.retentionLabelId,
          error: ctx.labelError,
        }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: ctx.labelError, tenantConnectionId: ws.tenantConnectionId };
      }

      const baseDetails = {
        workspaceName: ws.displayName,
        previousLabelId: ws.retentionLabelId || null,
        newLabelId: payload.retentionLabelId,
      };

      // ── Graph writeback ──────────────────────────────────────────────────
      let pushed = false;
      let pushError: string | undefined;
      let writebackSkipped = false;

      if (!ctx.writeBackEnabled) {
        writebackSkipped = true;
      } else if (ctx.graphTokenError) {
        pushError = ctx.graphTokenError;
      } else if (!ctx.graphToken) {
        pushError = "No Graph token available — cannot push retention label to M365";
      } else if (!ws.siteUrl) {
        pushError = "Workspace has no siteUrl — cannot push retention label to M365";
      } else {
        try {
          const result = await applyRetentionLabelToSite(ctx.graphToken, ws.siteUrl, ctx.labelName ?? null);
          pushed = !!result.success;
          if (!result.success) pushError = result.error;
        } catch (err: any) {
          pushError = err.message;
        }
      }

      // Hard-fail when writeback was attempted but failed, consistent with the
      // bulk label handler and the single-row 502 pattern.
      if (ctx.writeBackEnabled && !pushed && !writebackSkipped) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          ...baseDetails,
          pushed: false,
          error: pushError,
        }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: pushError || "Retention label push failed", tenantConnectionId: ws.tenantConnectionId };
      }

      // ── DB write ─────────────────────────────────────────────────────────
      try {
        const updates: Partial<InsertWorkspace> = { retentionLabelId: payload.retentionLabelId };
        await storage.updateWorkspace(ws.id, updates);
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          ...baseDetails,
          pushed,
          writebackSkipped,
          ...(pushError ? { pushError } : {}),
        }, "SUCCESS");
        return {
          workspaceId: ws.id,
          displayName: ws.displayName,
          success: true,
          tenantConnectionId: ws.tenantConnectionId,
          graphPushed: pushed,
          writebackSkipped,
          graphPushError: pushError,
        };
      } catch (err: any) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          ...baseDetails,
          error: err.message,
        }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: err.message, tenantConnectionId: ws.tenantConnectionId };
      }
    });

    const rollupAuditId = await emitRollupAudit(req, "set_retention", results, filterCriteria);
    res.json(buildResponse("set_retention", results, rollupAuditId));
  },
);

// 3. Apply Metadata Defaults ────────────────────────────────────────────────
const metadataBodySchema = z.object({
  ...baseBulkSchema,
  payload: z.object({
    department: z.string().nullable().optional(),
    costCenter: z.string().nullable().optional(),
    projectCode: z.string().nullable().optional(),
    mode: z.enum(["fillEmpty", "overwrite"]).default("fillEmpty"),
  }),
});

type MetadataField = "department" | "costCenter" | "projectCode";

router.post(
  "/api/workspaces/bulk/metadata",
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  requireFeature("m365WriteBack"),
  async (req: AuthenticatedRequest, res) => {
    const parsed = metadataBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    }
    const { workspaceIds, payload, filterCriteria } = parsed.data;

    const fields: MetadataField[] = [];
    if (payload.department !== undefined) fields.push("department");
    if (payload.costCenter !== undefined) fields.push("costCenter");
    if (payload.projectCode !== undefined) fields.push("projectCode");
    if (fields.length === 0) {
      return res.status(400).json({ message: "Provide at least one of department, costCenter, projectCode" });
    }

    const validated = await loadAndValidateScopeOrFilter(req, workspaceIds, filterCriteria as BulkFilterSpec | undefined, res);
    if (!validated.ok) return;
    const { workspaces } = validated;
    const auditBase = buildAuditBase(req);
    const ACTION = "METADATA_UPDATED";

    // Per-tenant context cache for plan gating + delegated SPO token, so the
    // bulk metadata path runs the same policy evaluation + property-bag
    // writeback that PATCH /api/workspaces/:id runs after a single-row edit.
    interface TenantWritebackContext {
      organizationId: string | null;
      tenantId: string;
      writeBackEnabled: boolean;
      spoToken: string | null;
      spoTokenError?: string;
    }
    const tenantWbCache = new Map<string, TenantWritebackContext>();
    const getTenantWritebackContext = async (tenantConnectionId: string): Promise<TenantWritebackContext | null> => {
      const cached = tenantWbCache.get(tenantConnectionId);
      if (cached) return cached;
      const conn = await storage.getTenantConnection(tenantConnectionId);
      if (!conn) return null;
      const orgId = conn.organizationId || req.user?.organizationId || null;
      const org = orgId ? await storage.getOrganization(orgId) : null;
      const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
      const writeBackEnabled = getPlanFeatures(plan).m365WriteBack;
      let spoToken: string | null = null;
      let spoTokenError: string | undefined;
      if (writeBackEnabled && req.user?.id) {
        const spoHost = conn.domain.includes(".sharepoint.com")
          ? conn.domain
          : `${conn.domain.replace(/\..*$/, "")}.sharepoint.com`;
        try {
          spoToken = await getDelegatedSpoToken(req.user.id, spoHost);
          if (!spoToken) spoTokenError = "No delegated SharePoint token available — sign in via SSO to enable auto-writeback";
        } catch (err: any) {
          spoTokenError = err.message;
        }
      }
      const ctx: TenantWritebackContext = {
        organizationId: orgId,
        tenantId: conn.tenantId,
        writeBackEnabled,
        spoToken,
        spoTokenError,
      };
      tenantWbCache.set(tenantConnectionId, ctx);
      return ctx;
    };

    const results = await runBatched(Array.from(workspaces.keys()), WRITE_BATCH, async (id) => {
      const ws = workspaces.get(id);
      if (!ws) {
        await recordRowAudit(auditBase, ACTION, id, null, { error: "Workspace not found", mode: payload.mode }, "FAILURE");
        return { workspaceId: id, displayName: "Unknown", success: false, error: "Workspace not found" };
      }
      try {
        const updates: Partial<InsertWorkspace> = {};
        const applied: Record<string, { previous: string | null; next: string | null }> = {};
        for (const field of fields) {
          const raw = payload[field];
          const newVal: string | null = raw === "" ? null : raw ?? null;
          const currentVal: string | null = ws[field] ?? null;
          const shouldWrite = payload.mode === "overwrite" || !currentVal;
          if (shouldWrite && currentVal !== newVal) {
            updates[field] = newVal;
            applied[field] = { previous: currentVal, next: newVal };
          }
        }
        if (Object.keys(updates).length === 0) {
          await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
            workspaceName: ws.displayName,
            mode: payload.mode,
            skipped: true,
            reason: payload.mode === "fillEmpty" ? "All target fields already populated" : "No changes",
          }, "SUCCESS");
          return { workspaceId: ws.id, displayName: ws.displayName, success: true, tenantConnectionId: ws.tenantConnectionId };
        }
        // Recompute localHash so the existing /api/workspaces/writeback/metadata
        // and tenant-wide writeback flows pick up the new values as dirty.
        const merged = { ...ws, ...updates };
        updates.localHash = computeWritebackHash({
          sensitivityLabelId: merged.sensitivityLabelId,
          department: merged.department,
          costCenter: merged.costCenter,
          projectCode: merged.projectCode,
          propertyBag: merged.propertyBag,
        });
        await storage.updateWorkspace(ws.id, updates);

        // Mirror PATCH /api/workspaces/:id: re-evaluate policies for the row
        // and, when m365WriteBack is granted, push any changed property-bag
        // keys to the site so policy outcomes stay in sync. Failures here do
        // not roll back the local update — they are recorded on the row's
        // audit detail just like the single-row endpoint does.
        let writeback: { attempted: boolean; skipped?: boolean; success?: boolean; error?: string } = { attempted: false };
        if (ws.tenantConnectionId) {
          try {
            const tCtx = await getTenantWritebackContext(ws.tenantConnectionId);
            if (tCtx?.organizationId) {
              const refreshed = await storage.getWorkspace(ws.id);
              if (refreshed) {
                const evalResult = await evaluateAllPoliciesForWorkspace(
                  refreshed,
                  tCtx.organizationId,
                  tCtx.tenantId,
                  "[bulk-metadata]",
                );
                if (evalResult.bagChanged && Object.keys(evalResult.changedBagKeys).length > 0 && refreshed.siteUrl) {
                  if (!tCtx.writeBackEnabled) {
                    writeback = { attempted: false, skipped: true };
                  } else if (!tCtx.spoToken) {
                    writeback = { attempted: true, success: false, error: tCtx.spoTokenError || "No SharePoint token" };
                  } else {
                    writeback.attempted = true;
                    const wbResult = await writeSitePropertyBag(tCtx.spoToken, refreshed.siteUrl, evalResult.changedBagKeys, req.user!.id);
                    writeback.success = wbResult.success;
                    if (!wbResult.success) writeback.error = wbResult.error;
                    if (wbResult.success) {
                      const after = await storage.getWorkspace(ws.id);
                      if (after) {
                        const wbHash = computeWritebackHash({
                          sensitivityLabelId: after.sensitivityLabelId,
                          department: after.department,
                          costCenter: after.costCenter,
                          projectCode: after.projectCode,
                          propertyBag: after.propertyBag,
                        });
                        const syncUpdates: Partial<InsertWorkspace> = { spoSyncHash: wbHash, localHash: wbHash };
                        await storage.updateWorkspace(ws.id, syncUpdates);
                      }
                    }
                  }
                }
              }
            }
          } catch (evalErr: any) {
            writeback = { attempted: true, success: false, error: `Policy evaluation error: ${evalErr.message}` };
          }
        }

        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          workspaceName: ws.displayName,
          mode: payload.mode,
          applied,
          writeback,
        }, "SUCCESS");
        return { workspaceId: ws.id, displayName: ws.displayName, success: true, tenantConnectionId: ws.tenantConnectionId };
      } catch (err: any) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          workspaceName: ws.displayName,
          mode: payload.mode,
          error: err.message,
        }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: err.message, tenantConnectionId: ws.tenantConnectionId };
      }
    });

    const rollupAuditId = await emitRollupAudit(req, "apply_metadata", results, filterCriteria);
    res.json(buildResponse("apply_metadata", results, rollupAuditId));
  },
);

// 4. Set Steward (Primary or Secondary) ─────────────────────────────────────
const ownerBodySchema = z.object({
  ...baseBulkSchema,
  payload: z.object({
    role: z.enum(["primary", "secondary"]),
    userPrincipalName: z.string().min(1),
    userId: z.string().optional(),
    displayName: z.string().optional(),
  }),
});

router.post(
  "/api/workspaces/bulk/owner",
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  requireFeature("ownershipManagement"),
  async (req: AuthenticatedRequest, res) => {
    const parsed = ownerBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    }
    const { workspaceIds, payload, filterCriteria } = parsed.data;

    const validated = await loadAndValidateScopeOrFilter(req, workspaceIds, filterCriteria as BulkFilterSpec | undefined, res);
    if (!validated.ok) return;
    const { workspaces } = validated;
    const auditBase = buildAuditBase(req);
    const ACTION = "WORKSPACE_OWNER_ADDED";

    const tokenByTenant = new Map<string, string>();
    const userIdByTenant = new Map<string, string>();
    const tenantContextError = new Map<string, string>();

    const ensureTenantContext = async (
      tenantConnectionId: string,
    ): Promise<{ token?: string; userId?: string; error?: string }> => {
      if (tenantContextError.has(tenantConnectionId)) {
        return { error: tenantContextError.get(tenantConnectionId) };
      }
      let token = tokenByTenant.get(tenantConnectionId);
      let resolvedUserId = userIdByTenant.get(tenantConnectionId);
      if (!token) {
        const conn = await storage.getTenantConnection(tenantConnectionId);
        if (!conn) {
          const err = "Tenant connection not found";
          tenantContextError.set(tenantConnectionId, err);
          return { error: err };
        }
        const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
        const clientSecret = getEffectiveClientSecret(conn);
        try {
          token = await getAppToken(conn.tenantId, clientId, clientSecret);
          tokenByTenant.set(tenantConnectionId, token);
        } catch (err: any) {
          const msg = `Failed to acquire Graph token: ${err.message}`;
          tenantContextError.set(tenantConnectionId, msg);
          return { error: msg };
        }
      }
      if (!resolvedUserId) {
        if (payload.userId) {
          resolvedUserId = payload.userId;
        } else {
          try {
            const lookup = await fetch(
              `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(payload.userPrincipalName)}?$select=id,displayName,userPrincipalName`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (lookup.ok) {
              const data = await lookup.json();
              resolvedUserId = data.id;
            } else {
              const msg = `User ${payload.userPrincipalName} not found in directory`;
              tenantContextError.set(tenantConnectionId, msg);
              return { error: msg };
            }
          } catch (err: any) {
            const msg = `Directory lookup failed: ${err.message}`;
            tenantContextError.set(tenantConnectionId, msg);
            return { error: msg };
          }
        }
        if (resolvedUserId) userIdByTenant.set(tenantConnectionId, resolvedUserId);
      }
      return { token, userId: resolvedUserId };
    };

    const results = await runBatched(Array.from(workspaces.keys()), WRITE_BATCH, async (id) => {
      const ws = workspaces.get(id);
      if (!ws) {
        await recordRowAudit(auditBase, ACTION, id, null, { error: "Workspace not found", role: payload.role, userPrincipalName: payload.userPrincipalName }, "FAILURE");
        return { workspaceId: id, displayName: "Unknown", success: false, error: "Workspace not found" };
      }
      const auditDetails = {
        workspaceName: ws.displayName,
        role: payload.role,
        userPrincipalName: payload.userPrincipalName,
      };
      if (!ws.tenantConnectionId) {
        await recordRowAudit(auditBase, ACTION, ws.id, null, { ...auditDetails, error: "No tenant connection" }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: "No tenant connection" };
      }
      if (!ws.m365ObjectId) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, { ...auditDetails, error: "No M365 site id" }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: "No M365 site id — sync the workspace first", tenantConnectionId: ws.tenantConnectionId };
      }
      if (ws.type === "COMMUNICATION_SITE") {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, { ...auditDetails, error: "Communication Site (no M365 group)" }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: "Communication Sites are not group-backed; owners cannot be managed", tenantConnectionId: ws.tenantConnectionId };
      }

      const ctx = await ensureTenantContext(ws.tenantConnectionId);
      if (ctx.error || !ctx.token || !ctx.userId) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, { ...auditDetails, error: ctx.error || "Tenant context unavailable" }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: ctx.error || "Tenant context unavailable", tenantConnectionId: ws.tenantConnectionId };
      }

      try {
        const ownersInfo = await fetchSiteGroupOwners(ctx.token, ws.m365ObjectId);
        const groupId = ownersInfo.groupId;
        if (!groupId) {
          const err = ownersInfo.error || "No M365 group for this site";
          await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, { ...auditDetails, error: err }, "FAILURE");
          return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: err, tenantConnectionId: ws.tenantConnectionId };
        }

        const addResult = await addGroupOwner(ctx.token, groupId, ctx.userId);
        const idempotent = !addResult.success && addResult.errorCode === "ALREADY_OWNER";
        if (!addResult.success && !idempotent) {
          await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, { ...auditDetails, errorCode: addResult.errorCode, error: addResult.error }, "FAILURE");
          return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: addResult.error || "Failed to add owner", errorCode: addResult.errorCode, tenantConnectionId: ws.tenantConnectionId };
        }

        if (payload.role === "primary") {
          const updates: Partial<InsertWorkspace> = {
            ownerPrincipalName: payload.userPrincipalName,
            ownerDisplayName: payload.displayName || payload.userPrincipalName,
          };
          await storage.updateWorkspace(ws.id, updates);
        }

        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          ...auditDetails,
          targetUserId: ctx.userId,
          idempotent,
        }, "SUCCESS");
        return { workspaceId: ws.id, displayName: ws.displayName, success: true, tenantConnectionId: ws.tenantConnectionId };
      } catch (err: any) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, { ...auditDetails, error: err.message }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: err.message, tenantConnectionId: ws.tenantConnectionId };
      }
    });

    const bulkAction = payload.role === "primary" ? "set_primary_steward" : "set_secondary_steward";
    const rollupAuditId = await emitRollupAudit(req, bulkAction, results, filterCriteria);
    res.json(buildResponse(bulkAction, results, rollupAuditId));
  },
);

// 5. Archive (lifecycle) ────────────────────────────────────────────────────
const archiveBodySchema = z.object({
  ...baseBulkSchema,
  payload: z.object({
    reason: z.string().trim().min(3, "Archive reason is required").max(500),
  }),
});

router.post(
  "/api/workspaces/bulk/archive",
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  requireFeature("m365WriteBack"),
  async (req: AuthenticatedRequest, res) => {
    const parsed = archiveBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    }
    const { workspaceIds, filterCriteria, payload } = parsed.data;
    const reason = payload.reason.trim();
    const archivedBy = req.user?.email || req.user?.id || null;

    const validated = await loadAndValidateScopeOrFilter(req, workspaceIds, filterCriteria as BulkFilterSpec | undefined, res);
    if (!validated.ok) return;
    const { workspaces } = validated;
    const auditBase = buildAuditBase(req);
    const ACTION = "WORKSPACE_ARCHIVED";

    const tokenByTenant = new Map<string, string>();
    const tenantTokenError = new Map<string, string>();

    const getTenantToken = async (tenantConnectionId: string): Promise<{ token?: string; error?: string }> => {
      if (tenantTokenError.has(tenantConnectionId)) {
        return { error: tenantTokenError.get(tenantConnectionId) };
      }
      const cached = tokenByTenant.get(tenantConnectionId);
      if (cached) return { token: cached };
      const conn = await storage.getTenantConnection(tenantConnectionId);
      if (!conn) {
        tenantTokenError.set(tenantConnectionId, "Tenant connection not found");
        return { error: "Tenant connection not found" };
      }
      const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
      const clientSecret = getEffectiveClientSecret(conn);
      try {
        const token = await getAppToken(conn.tenantId, clientId, clientSecret);
        tokenByTenant.set(tenantConnectionId, token);
        return { token };
      } catch (err: any) {
        const msg = `Failed to acquire Graph token: ${err.message}`;
        tenantTokenError.set(tenantConnectionId, msg);
        return { error: msg };
      }
    };

    const results = await runBatched(Array.from(workspaces.keys()), WRITE_BATCH, async (id) => {
      const ws = workspaces.get(id);
      if (!ws) {
        await recordRowAudit(auditBase, ACTION, id, null, { error: "Workspace not found" }, "FAILURE");
        return { workspaceId: id, displayName: "Unknown", success: false, error: "Workspace not found" };
      }
      if (ws.isArchived) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          workspaceName: ws.displayName,
          alreadyArchived: true,
        }, "SUCCESS");
        return { workspaceId: ws.id, displayName: ws.displayName, success: true, tenantConnectionId: ws.tenantConnectionId };
      }
      if (!ws.tenantConnectionId) {
        await recordRowAudit(auditBase, ACTION, ws.id, null, { workspaceName: ws.displayName, error: "No tenant connection" }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: "No tenant connection" };
      }
      if (!ws.m365ObjectId) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, { workspaceName: ws.displayName, error: "No M365 site id" }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: "No M365 site id — sync the workspace first", tenantConnectionId: ws.tenantConnectionId };
      }

      const tokenCtx = await getTenantToken(ws.tenantConnectionId);
      if (tokenCtx.error || !tokenCtx.token) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, { workspaceName: ws.displayName, error: tokenCtx.error }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: tokenCtx.error, tenantConnectionId: ws.tenantConnectionId };
      }

      try {
        const result = await archiveSite(tokenCtx.token, ws.m365ObjectId);
        if (!result.success) {
          await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
            workspaceName: ws.displayName,
            siteUrl: ws.siteUrl,
            error: result.error,
          }, "FAILURE");
          return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: result.error || "Archive failed", tenantConnectionId: ws.tenantConnectionId };
        }
        const updates: Partial<InsertWorkspace> = {
          isArchived: true,
          lockState: "Locked",
          lifecycleState: "PendingArchive",
          archiveReason: reason,
          archivedAt: new Date(),
          archivedBy,
        };
        await storage.updateWorkspace(ws.id, updates);
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          workspaceName: ws.displayName,
          siteUrl: ws.siteUrl,
          reason,
          lifecycleState: "PendingArchive",
          archivedBy,
        }, "SUCCESS");
        return { workspaceId: ws.id, displayName: ws.displayName, success: true, tenantConnectionId: ws.tenantConnectionId };
      } catch (err: any) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          workspaceName: ws.displayName,
          siteUrl: ws.siteUrl,
          error: err.message,
        }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: err.message, tenantConnectionId: ws.tenantConnectionId };
      }
    });

    const rollupAuditId = await emitRollupAudit(req, "archive", results, filterCriteria);
    res.json(buildResponse("archive", results, rollupAuditId));
  },
);

// 6. Email Owner ────────────────────────────────────────────────────────────
const emailBodySchema = z.object({
  ...baseBulkSchema,
  payload: z.object({
    subject: z.string().min(1).max(200),
    message: z.string().min(1).max(5000),
  }),
});

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function renderOwnerEmailHtml(ws: Workspace, message: string, replyTo: string | null): string {
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;background:#f5f5f5;margin:0;padding:24px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;max-width:600px;margin:0 auto;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
  <tr><td style="background:#5b0fbc;color:#fff;padding:20px;border-radius:8px 8px 0 0;font-weight:600;">Zenith governance notification</td></tr>
  <tr><td style="padding:24px;">
    <p style="margin:0 0 12px;">Hi ${escapeHtml(ws.ownerDisplayName || "there")},</p>
    <p style="margin:0 0 16px;color:#374151;">A governance admin sent you a message about your SharePoint site <strong>${escapeHtml(ws.displayName)}</strong>${ws.siteUrl ? ` (<a href="${escapeHtml(ws.siteUrl)}" style="color:#5b0fbc;">${escapeHtml(ws.siteUrl.replace(/^https?:\/\//, ""))}</a>)` : ""}.</p>
    <div style="background:#f9fafb;border-left:3px solid #5b0fbc;padding:12px 16px;border-radius:4px;color:#374151;white-space:pre-wrap;">${escapeHtml(message)}</div>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px;">This message was sent via Zenith. Reply directly to ${escapeHtml(replyTo || "your governance admin")} for follow-up.</p>
  </td></tr>
</table></body></html>`;
}

router.post(
  "/api/workspaces/bulk/email-owner",
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const parsed = emailBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    }
    const { workspaceIds, payload, filterCriteria } = parsed.data;

    const validated = await loadAndValidateScopeOrFilter(req, workspaceIds, filterCriteria as BulkFilterSpec | undefined, res);
    if (!validated.ok) return;
    const { workspaces } = validated;
    const auditBase = buildAuditBase(req);
    const ACTION = "OWNER_EMAILED";

    type MailMessage = Parameters<Awaited<ReturnType<typeof getUncachableSendGridClient>>["client"]["send"]>[0];
    let sgClient: { client: { send: (msg: MailMessage) => Promise<unknown> }; fromEmail: string } | null = null;
    let sgInitError: string | null = null;
    try {
      sgClient = await getUncachableSendGridClient();
    } catch (err: any) {
      sgInitError = err.message || "SendGrid not configured";
    }

    const results = await runBatched(Array.from(workspaces.keys()), WRITE_BATCH, async (id) => {
      const ws = workspaces.get(id);
      if (!ws) {
        await recordRowAudit(auditBase, ACTION, id, null, { error: "Workspace not found" }, "FAILURE");
        return { workspaceId: id, displayName: "Unknown", success: false, error: "Workspace not found" };
      }
      if (sgInitError || !sgClient) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          workspaceName: ws.displayName,
          error: sgInitError || "SendGrid unavailable",
        }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: sgInitError || "SendGrid unavailable", tenantConnectionId: ws.tenantConnectionId };
      }
      const recipient = ws.ownerPrincipalName;
      if (!recipient) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          workspaceName: ws.displayName,
          error: "No owner email on file",
        }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: "No owner email on file", tenantConnectionId: ws.tenantConnectionId };
      }
      try {
        await sgClient.client.send({
          to: recipient,
          from: sgClient.fromEmail,
          subject: payload.subject,
          html: renderOwnerEmailHtml(ws, payload.message, req.user?.email || null),
          text: `${payload.message}\n\nSite: ${ws.displayName}${ws.siteUrl ? ` (${ws.siteUrl})` : ""}`,
        });
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          workspaceName: ws.displayName,
          recipient,
          subject: payload.subject,
        }, "SUCCESS");
        return { workspaceId: ws.id, displayName: ws.displayName, success: true, tenantConnectionId: ws.tenantConnectionId };
      } catch (err: any) {
        await recordRowAudit(auditBase, ACTION, ws.id, ws.tenantConnectionId, {
          workspaceName: ws.displayName,
          recipient,
          error: err.message,
        }, "FAILURE");
        return { workspaceId: ws.id, displayName: ws.displayName, success: false, error: err.message, tenantConnectionId: ws.tenantConnectionId };
      }
    });

    const rollupAuditId = await emitRollupAudit(req, "email_owner", results, filterCriteria);
    res.json(buildResponse("email_owner", results, rollupAuditId));
  },
);

export default router;
