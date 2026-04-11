import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertWorkspaceSchema, insertProvisioningRequestSchema, type ServicePlanTier, ZENITH_ROLES } from "@shared/schema";
import { fetchSharePointSites, fetchSiteUsageReport, fetchSiteDriveOwner, fetchSiteAnalytics, fetchSiteGroupOwners, fetchSiteCollectionAdmins, getAppToken, writeSitePropertyBag, requestSiteReindex, fetchSitePropertyBag, fetchSensitivityLabels, fetchRetentionLabels, fetchHubSites, fetchSiteHubAssociation, fetchHubSitesViaSearch, applySensitivityLabelToSite, removeSensitivityLabelFromSite, joinHubSite, leaveHubSite, fetchSiteLockState, fetchSiteArchiveStatus, batchToggleNoScript, fetchSiteDocumentLibraries, enumerateSiteDocumentLibraries, fetchLibraryDetails, fetchSiteTelemetry, fetchContentTypes, createSharePointSite, createM365Group, createTeam, assignSensitivityLabelToGroup, resolveOwnerIds, archiveSite, unarchiveSite } from "../services/graph";
import { getPlanFeatures, requireFeature } from "../services/feature-gate";
import { refreshDelegatedToken, getDelegatedSpoToken } from "../routes-entra";
import { requireAuth, requireRole, requirePermission, type AuthenticatedRequest } from "../middleware/rbac";
import { computeWritebackHash, computeSpoSyncHash } from "../services/writeback-hash";
import { decryptToken } from "../utils/encryption";
import { evaluatePolicy, evaluationResultsToCopilotRules, formatPolicyBagValue, DEFAULT_COPILOT_READINESS_RULES, type EvaluationContext } from "../services/policy-engine";
import { BUILT_IN_TEMPLATES, getTemplateById, deriveRetentionPolicy, validateProvisioningPayload, validateGovernedName } from "../services/provisioning-templates";
import type { Workspace, PolicyOutcome, GovernancePolicy } from "@shared/schema";
import { getActiveOrgId, getOrgTenantConnectionIds, isWorkspaceInScope } from "./scope-helpers";

const router = Router();

function getEffectiveClientSecret(conn: { clientSecret?: string | null }): string {
  if (conn.clientSecret) {
    try {
      return decryptToken(conn.clientSecret);
    } catch {
      return conn.clientSecret;
    }
  }
  return process.env.AZURE_CLIENT_SECRET!;
}


interface PolicyEvalResult {
  bagChanged: boolean;
  changedBagKeys: Record<string, string>;
}

async function evaluateAllPoliciesForWorkspace(ws: Workspace, orgId: string, tenantId: string, logPrefix: string = "[policy-eval]"): Promise<PolicyEvalResult> {
  const policiesWithOutcomes = await storage.getActivePoliciesWithOutcomes(orgId);
  if (policiesWithOutcomes.length === 0) return { bagChanged: false, changedBagKeys: {} };

  const metaEntries = await storage.getDataDictionary(tenantId, "required_metadata_field");
  const context: EvaluationContext = { requiredMetadataFields: metaEntries.map(e => e.value) };

  const allRuleRecords: any[] = [];
  const updates: Record<string, any> = {};
  const existingBag = (ws.propertyBag as Record<string, string>) || {};
  let bagChanged = false;
  const changedBagKeys: Record<string, string> = {};

  for (const policy of policiesWithOutcomes) {
    const evaluation = evaluatePolicy(ws, policy, context);
    const ruleRecords = evaluationResultsToCopilotRules(ws.id, evaluation);
    allRuleRecords.push(...ruleRecords);

    if (policy.outcome?.workspaceField === "copilotReady" && ws.copilotReady !== evaluation.overallPass) {
      updates.copilotReady = evaluation.overallPass;
    }

    const effectiveBagKey = policy.propertyBagKey || policy.outcome?.propertyBagKey;
    if (effectiveBagKey) {
      const bagValue = formatPolicyBagValue(evaluation, policy.propertyBagValueFormat);
      if (existingBag[effectiveBagKey] !== bagValue) {
        existingBag[effectiveBagKey] = bagValue;
        bagChanged = true;
        changedBagKeys[effectiveBagKey] = bagValue;
        console.log(`${logPrefix} ${ws.displayName}: ${effectiveBagKey}=${bagValue}`);
      }
    }
  }

  await storage.setCopilotRules(ws.id, allRuleRecords);
  if (bagChanged) {
    updates.propertyBag = existingBag;
  }
  if (Object.keys(updates).length > 0) {
    await storage.updateWorkspace(ws.id, updates);
  }
  return { bagChanged, changedBagKeys };
}

async function getDelegatedTokenForRetention(currentUserId?: string, organizationId?: string): Promise<string | null> {
  const tryUser = async (userId: string): Promise<string | null> => {
    const delegated = await storage.getDecryptedGraphToken(userId, "graph");
    if (delegated?.token && delegated.expiresAt && delegated.expiresAt > new Date()) {
      return delegated.token;
    }
    const refreshed = await refreshDelegatedToken(userId);
    if (refreshed) return refreshed;
    return null;
  };

  if (currentUserId) {
    const token = await tryUser(currentUserId);
    if (token) return token;
  }

  if (organizationId) {
    const anyValid = await storage.getAnyValidDelegatedToken("graph", organizationId);
    if (anyValid) return anyValid.token;

    const { db } = await import("../db");
    const { graphTokens } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    const orgTokens = await db.select().from(graphTokens)
      .where(and(eq(graphTokens.organizationId, organizationId), eq(graphTokens.service, "graph")))
      .limit(5);
    for (const t of orgTokens) {
      if (t.refreshToken) {
        const refreshed = await refreshDelegatedToken(t.userId);
        if (refreshed) return refreshed;
      }
    }
  }

  return null;
}

async function getDelegatedSpoTokenForOrg(spoHost: string, currentUserId?: string, organizationId?: string): Promise<string | null> {
  if (currentUserId) {
    const token = await getDelegatedSpoToken(currentUserId, spoHost);
    if (token) return token;
  }
  if (organizationId) {
    const { db } = await import("../db");
    const { graphTokens } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    const orgTokens = await db.select().from(graphTokens)
      .where(and(eq(graphTokens.organizationId, organizationId), eq(graphTokens.service, "graph")))
      .limit(5);
    for (const t of orgTokens) {
      if (t.refreshToken) {
        const token = await getDelegatedSpoToken(t.userId, spoHost);
        if (token) return token;
      }
    }
  }
  return null;
}

// ── Workspaces (SharePoint Sites) ──
router.get("/api/workspaces/writeback-pending", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
  const orgId = req.activeOrganizationId || req.user?.organizationId || undefined;
  const workspaces = await storage.getWorkspaces(undefined, tenantConnectionId, orgId);
  const pending = workspaces.filter(ws =>
    ws.localHash && ws.spoSyncHash && ws.localHash !== ws.spoSyncHash && ws.siteUrl
  );
  res.json({
    count: pending.length,
    workspaces: pending.map(ws => ({ id: ws.id, displayName: ws.displayName, siteUrl: ws.siteUrl })),
  });
});

router.get("/api/workspaces", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const search = req.query.search as string | undefined;
  const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
  const pageParam = req.query.page as string | undefined;
  const pageSizeParam = req.query.pageSize as string | undefined;
  const allowedIds = await getOrgTenantConnectionIds(req);

  if (pageParam !== undefined) {
    const page = Math.max(1, parseInt(pageParam, 10) || 1);
    const pageSize = Math.min(500, Math.max(1, parseInt(pageSizeParam || "50", 10)));

    if (tenantConnectionId) {
      if (allowedIds && !allowedIds.includes(tenantConnectionId)) {
        return res.json({ items: [], total: 0, page, pageSize });
      }
      const result = await storage.getWorkspacesPaginated({ page, pageSize, search, tenantConnectionId });
      return res.json({ ...result, page, pageSize });
    }

    if (allowedIds) {
      if (allowedIds.length === 0) {
        return res.json({ items: [], total: 0, page, pageSize });
      }
      const result = await storage.getWorkspacesPaginated({ page, pageSize, search, tenantConnectionIds: allowedIds });
      return res.json({ ...result, page, pageSize });
    }

    const result = await storage.getWorkspacesPaginated({ page, pageSize, search });
    return res.json({ ...result, page, pageSize });
  }

  if (tenantConnectionId) {
    if (allowedIds && !allowedIds.includes(tenantConnectionId)) {
      return res.json([]);
    }
    const workspaces = await storage.getWorkspaces(search, tenantConnectionId);
    return res.json(workspaces);
  }
  if (allowedIds) {
    let allWorkspaces: Workspace[] = [];
    for (const id of allowedIds) {
      const ws = await storage.getWorkspaces(search, id);
      allWorkspaces = allWorkspaces.concat(ws);
    }
    return res.json(allWorkspaces);
  }
  const workspaces = await storage.getWorkspaces(search, tenantConnectionId);
  res.json(workspaces);
});

router.get("/api/workspaces/:id", requireAuth(), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  const workspace = await storage.getWorkspace(req.params.id);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });
  res.json(workspace);
});

router.get("/api/workspaces/:id/telemetry", requireAuth(), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  const records = await storage.getWorkspaceTelemetry(req.params.id, Number(req.query.limit) || 30);
  res.json(records);
});

router.post("/api/workspaces/:id/telemetry/snapshot", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  const workspace = await storage.getWorkspace(req.params.id);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });
  if (!workspace.tenantConnectionId) return res.status(400).json({ message: "No tenant connection" });

  const tenantConn = await storage.getTenantConnection(workspace.tenantConnectionId);
  if (tenantConn && !tenantConn.telemetryEnabled) {
    return res.status(403).json({ message: "Workspace Telemetry is disabled for this tenant. Enable it in Feature Settings before capturing snapshots." });
  }

  const conn = await storage.getTenantConnection(workspace.tenantConnectionId);
  if (!conn) return res.status(400).json({ message: "Tenant connection not found" });

  const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
  const clientSecret = getEffectiveClientSecret(conn);

  try {
    const token = await getAppToken(conn.tenantId, clientId, clientSecret);
    const graphSiteId = workspace.m365ObjectId || '';
    const telemetry = await fetchSiteTelemetry(token, graphSiteId);

    const record = await storage.createWorkspaceTelemetry({
      workspaceId: workspace.id,
      tenantConnectionId: workspace.tenantConnectionId,
      storageUsedBytes: telemetry.storageUsedBytes ?? null,
      storageTotalBytes: telemetry.storageTotalBytes ?? null,
      fileCount: telemetry.fileCount ?? null,
      listCount: telemetry.listCount ?? null,
      lastActivityDate: telemetry.lastActivityDate ? new Date(telemetry.lastActivityDate) : null,
    });
    res.json(record);
  } catch (err: any) {
    console.error(`[telemetry] Snapshot error for workspace ${req.params.id}:`, err);
    res.status(500).json({ message: err.message || "Failed to capture telemetry snapshot" });
  }
});

router.post("/api/workspaces", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const parsed = insertWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  if (!isPlatformOwner && parsed.data.tenantConnectionId) {
    const allowedIds = await getOrgTenantConnectionIds(req);
    if (allowedIds !== null && !allowedIds.includes(parsed.data.tenantConnectionId)) {
      return res.status(403).json({ message: "Tenant connection does not belong to your organization" });
    }
  }
  const workspace = await storage.createWorkspace(parsed.data);
  res.status(201).json(workspace);
});

router.patch("/api/workspaces/:id", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  const existing = await storage.getWorkspace(req.params.id);
  if (!existing) return res.status(404).json({ message: "Workspace not found" });

  const patchBodySchema = insertWorkspaceSchema.partial().extend({
    sensitivity: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL"]).optional(),
    externalSharing: z.boolean().optional(),
    copilotReady: z.boolean().optional(),
  });
  const bodyParsed = patchBodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ message: bodyParsed.error.message });
  }
  const body = bodyParsed.data;

  const effectiveSensitivity = 'sensitivity' in body ? body.sensitivity : existing.sensitivity;
  const effectiveExternalSharing = 'externalSharing' in body ? body.externalSharing : existing.externalSharing;
  const effectiveCopilotReady = 'copilotReady' in body ? body.copilotReady : existing.copilotReady;

  if (effectiveSensitivity === 'HIGHLY_CONFIDENTIAL') {
    if (effectiveExternalSharing === true) {
      await storage.createAuditEntry({
        userId: req.user?.id || null,
        userEmail: req.user?.email || null,
        action: 'SENSITIVITY_POLICY_VIOLATION',
        resource: 'workspace',
        resourceId: req.params.id,
        organizationId: req.user?.organizationId || null,
        tenantConnectionId: existing.tenantConnectionId || null,
        details: {
          workspaceName: existing.displayName,
          violation: 'external_sharing_on_highly_confidential',
          attemptedValue: true,
        },
        result: 'DENIED',
        ipAddress: req.ip || null,
      });
      return res.status(400).json({
        error: 'SENSITIVITY_POLICY_VIOLATION',
        message: 'External sharing cannot be enabled on Highly Confidential workspaces. Disable external sharing or change the sensitivity label first.',
      });
    }
    if (effectiveCopilotReady === true) {
      await storage.createAuditEntry({
        userId: req.user?.id || null,
        userEmail: req.user?.email || null,
        action: 'SENSITIVITY_POLICY_VIOLATION',
        resource: 'workspace',
        resourceId: req.params.id,
        organizationId: req.user?.organizationId || null,
        tenantConnectionId: existing.tenantConnectionId || null,
        details: {
          workspaceName: existing.displayName,
          violation: 'copilot_ready_on_highly_confidential',
          attemptedValue: true,
        },
        result: 'DENIED',
        ipAddress: req.ip || null,
      });
      return res.status(400).json({
        error: 'SENSITIVITY_POLICY_VIOLATION',
        message: 'Copilot Ready cannot be enabled on Highly Confidential workspaces. Change the sensitivity label first.',
      });
    }
  }

  const sensitivityLabelChanged = 'sensitivityLabelId' in body &&
    body.sensitivityLabelId !== existing.sensitivityLabelId;

  let labelSyncResult: { pushed: boolean; error?: string } | undefined;
  let labelWritebackSkipped = false;

  if (sensitivityLabelChanged && existing.tenantConnectionId && existing.m365ObjectId) {
    const labelConn = await storage.getTenantConnection(existing.tenantConnectionId);
    const labelOrgId = labelConn?.organizationId || req.activeOrganizationId || req.user?.organizationId;
    const labelOrg = await storage.getOrganization(labelOrgId);
    const plan = (labelOrg?.servicePlan || "TRIAL") as ServicePlanTier;
    const features = getPlanFeatures(plan);
    if (!features.m365WriteBack) {
      labelSyncResult = { pushed: false, error: `Sensitivity label writeback requires Standard plan or higher. Label saved in Zenith only.` };
      labelWritebackSkipped = true;
      console.log(`[label-push] Skipping sensitivity label CSOM for ${existing.displayName} — plan ${plan} does not include m365WriteBack`);
    } else {
      if (body.sensitivityLabelId && labelConn) {
        const labels = await storage.getSensitivityLabelsByTenantId(labelConn.tenantId);
        const targetLabel = labels.find(l => l.labelId === body.sensitivityLabelId);
        if (!targetLabel) {
          return res.status(400).json({ message: "Sensitivity label not found in synced labels." });
        }
        if (!targetLabel.appliesToGroupsSites) {
          return res.status(400).json({ message: `Label "${targetLabel.name}" does not apply to Groups & Sites. Choose a label with Groups & Sites scope.` });
        }
      }

      try {
        if (labelConn && existing.siteUrl) {
          const spoHost = labelConn.domain.includes('.sharepoint.com') ? labelConn.domain : `${labelConn.domain.replace(/\..*$/, '')}.sharepoint.com`;
          const spoToken = await getDelegatedSpoToken(req.user!.id, spoHost);
          if (!spoToken) {
            labelSyncResult = { pushed: false, error: "Could not acquire a SharePoint token for your account. Please sign out and sign back in with SSO. You must be a SharePoint administrator in the tenant to apply labels." };
            console.warn(`[label-push] No delegated SPO token for user ${req.user!.email} on ${existing.displayName}. Label saved locally.`);
          } else if (body.sensitivityLabelId) {
            const result = await applySensitivityLabelToSite(spoToken, existing.siteUrl, body.sensitivityLabelId, req.user!.id);
            labelSyncResult = { pushed: result.success, error: result.error };
            if (result.success) {
              console.log(`[label-push] Applied sensitivity label ${body.sensitivityLabelId} to ${existing.siteUrl} via CSOM for workspace ${existing.displayName}`);
            } else {
              console.error(`[label-push] Failed to apply label to ${existing.siteUrl}: ${result.error}`);
              return res.status(502).json({ message: `Failed to apply label to site: ${result.error}`, labelSyncResult });
            }
          } else if (existing.sensitivityLabelId) {
            const result = await removeSensitivityLabelFromSite(spoToken, existing.siteUrl, req.user!.id);
            labelSyncResult = { pushed: result.success, error: result.error };
            if (result.success) {
              console.log(`[label-push] Removed sensitivity label from ${existing.siteUrl} via CSOM for workspace ${existing.displayName}`);
            } else {
              console.error(`[label-push] Failed to remove label from ${existing.siteUrl}: ${result.error}`);
              return res.status(502).json({ message: `Failed to remove label from site: ${result.error}`, labelSyncResult });
            }
          } else {
            labelSyncResult = { pushed: true };
            console.log(`[label-push] No existing label to remove from ${existing.siteUrl}, skipping CSOM call`);
          }
        } else if (labelConn && !existing.siteUrl) {
          labelSyncResult = { pushed: false, error: "No site URL available for label push." };
          console.warn(`[label-push] No siteUrl for workspace ${existing.displayName}. Label saved locally.`);
        }
      } catch (err: any) {
        labelSyncResult = { pushed: false, error: err.message };
        console.error(`[label-push] Error pushing sensitivity label: ${err.message}`);
        return res.status(502).json({ message: `Error applying label to M365: ${err.message}`, labelSyncResult });
      }
    }
  }

  const writebackFields = ['sensitivityLabelId', 'department', 'costCenter', 'projectCode'];
  const hasWritebackChange = writebackFields.some(f => f in body);

  const updates = { ...body };
  if (hasWritebackChange) {
    const merged = { ...existing, ...body };
    updates.localHash = computeWritebackHash({
      sensitivityLabelId: merged.sensitivityLabelId,
      department: merged.department,
      costCenter: merged.costCenter,
      projectCode: merged.projectCode,
      propertyBag: merged.propertyBag,
    });
  }

  if (labelSyncResult?.pushed) {
    const propertyBagFields = ['department', 'costCenter', 'projectCode'];
    const hasPropertyBagChange = propertyBagFields.some(f => f in body && body[f] !== existing[f as keyof typeof existing]);
    if (hasPropertyBagChange) {
      updates.spoSyncHash = computeWritebackHash({
        sensitivityLabelId: body.sensitivityLabelId ?? existing.sensitivityLabelId,
        department: existing.department,
        costCenter: existing.costCenter,
        projectCode: existing.projectCode,
        propertyBag: existing.propertyBag,
      });
    } else {
      updates.spoSyncHash = updates.localHash || existing.spoSyncHash;
    }
  }

  const allowedTenantIds = await getOrgTenantConnectionIds(req);
  const workspace = allowedTenantIds !== null
    ? await storage.updateWorkspaceScoped(req.params.id, updates, allowedTenantIds)
    : await storage.updateWorkspace(req.params.id, updates);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });

  type WritebackResult = { attempted: boolean; skipped?: boolean; success?: boolean; error?: string };
  let writebackResult: WritebackResult = { attempted: false };
  try {
    if (existing.tenantConnectionId) {
      const conn = await storage.getTenantConnection(existing.tenantConnectionId);
      if (conn?.organizationId) {
        const evalResult = await evaluateAllPoliciesForWorkspace(workspace, conn.organizationId, conn.tenantId, "[workspace-update]");

        if (evalResult.bagChanged && workspace.siteUrl && Object.keys(evalResult.changedBagKeys).length > 0) {
          const wbOrg = await storage.getOrganization(conn.organizationId);
          const wbPlan = ((wbOrg?.servicePlan || "TRIAL") as ServicePlanTier);
          if (!getPlanFeatures(wbPlan).m365WriteBack) {
            writebackResult = { attempted: false, skipped: true };
            console.log(`[workspace-update] Auto-writeback skipped for ${workspace.displayName} — plan ${wbPlan} does not include m365WriteBack`);
          } else {
          console.log(`[workspace-update] Policy bag changed for ${workspace.displayName}, auto-writing back ${Object.keys(evalResult.changedBagKeys).length} keys`);
          writebackResult.attempted = true;
          try {
            const spoHost = conn.domain.includes('.sharepoint.com') ? conn.domain : `${conn.domain.replace(/\..*$/, '')}.sharepoint.com`;
            const spoToken = (req as any).session?.userId ? await getDelegatedSpoToken((req as any).session.userId, spoHost) : null;
            if (spoToken) {
              const wbResult = await writeSitePropertyBag(spoToken, workspace.siteUrl, evalResult.changedBagKeys, (req as any).session?.userId);
              writebackResult.success = wbResult.success;
              if (!wbResult.success) writebackResult.error = wbResult.error;
              if (wbResult.success) {
                const refreshedWs = await storage.getWorkspace(workspace.id);
                if (refreshedWs) {
                  const wbHash = computeWritebackHash({
                    sensitivityLabelId: refreshedWs.sensitivityLabelId,
                    department: refreshedWs.department,
                    costCenter: refreshedWs.costCenter,
                    projectCode: refreshedWs.projectCode,
                    propertyBag: refreshedWs.propertyBag,
                  });
                  await storage.updateWorkspace(workspace.id, { spoSyncHash: wbHash, localHash: wbHash } as any);
                }
                console.log(`[workspace-update] Auto-writeback succeeded for ${workspace.displayName}`);
              } else {
                console.warn(`[workspace-update] Auto-writeback failed for ${workspace.displayName}: ${wbResult.error}`);
              }
            } else {
              writebackResult.success = false;
              writebackResult.error = "No SPO token available — sign in via SSO to enable auto-writeback";
              console.warn(`[workspace-update] No SPO token for auto-writeback on ${workspace.displayName}`);
            }
          } catch (wbErr: any) {
            writebackResult.success = false;
            writebackResult.error = wbErr.message;
            console.error(`[workspace-update] Auto-writeback error: ${wbErr.message}`);
          }
          } // end else (m365WriteBack enabled)
        }
      }
    }
  } catch (evalErr: any) {
    console.error(`[workspace-update] Policy evaluation error: ${evalErr.message}`);
  }

  const finalWorkspace = await storage.getWorkspace(req.params.id);

  const metadataFields = ['department', 'costCenter', 'projectCode', 'description'];
  const hasMetadataChange = metadataFields.some(f => f in body && body[f] !== (existing as any)[f]);
  const hasSharingChange = 'externalSharing' in body && body.externalSharing !== existing.externalSharing;
  const hasArchiveChange = 'isArchived' in body && body.isArchived === true && !existing.isArchived;

  if (sensitivityLabelChanged) {
    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'LABEL_ASSIGNED',
      resource: 'workspace',
      resourceId: req.params.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: existing.tenantConnectionId || null,
      details: {
        workspaceName: existing.displayName,
        previousLabelId: existing.sensitivityLabelId,
        newLabelId: body.sensitivityLabelId,
        pushed: labelSyncResult?.pushed,
      },
      result: labelSyncResult?.pushed === false && labelSyncResult?.error ? 'FAILURE' : 'SUCCESS',
      ipAddress: req.ip || null,
    });
  }

  if (hasMetadataChange) {
    const changedFields: Record<string, { from: any; to: any }> = {};
    for (const f of metadataFields) {
      if (f in body && body[f] !== (existing as any)[f]) {
        changedFields[f] = { from: (existing as any)[f], to: body[f] };
      }
    }
    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'METADATA_UPDATED',
      resource: 'workspace',
      resourceId: req.params.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: existing.tenantConnectionId || null,
      details: { workspaceName: existing.displayName, changedFields },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });
  }

  if (hasSharingChange) {
    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'SHARING_CHANGED',
      resource: 'workspace',
      resourceId: req.params.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: existing.tenantConnectionId || null,
      details: {
        workspaceName: existing.displayName,
        previousValue: existing.externalSharing,
        newValue: body.externalSharing,
      },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });
  }

  if (hasArchiveChange) {
    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'SITE_ARCHIVED',
      resource: 'workspace',
      resourceId: req.params.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: existing.tenantConnectionId || null,
      details: {
        workspaceName: existing.displayName,
        siteUrl: existing.siteUrl,
      },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });
  }

  const hasSensitivityChange = 'sensitivity' in body && body.sensitivity !== existing.sensitivity;
  if (hasSensitivityChange) {
    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'SENSITIVITY_CHANGED',
      resource: 'workspace',
      resourceId: req.params.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: existing.tenantConnectionId || null,
      details: {
        workspaceName: existing.displayName,
        previousValue: existing.sensitivity,
        newValue: body.sensitivity,
      },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });
  }

  res.json({ ...(finalWorkspace || workspace), labelSyncResult, ...(writebackResult.attempted ? { autoWriteback: writebackResult } : {}), ...((writebackResult.skipped || labelWritebackSkipped) ? { writebackSkipped: true } : {}) });
});

router.get("/api/workspaces/:id/libraries", requireAuth(), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  try {
    const libraries = await storage.getDocumentLibraries(req.params.id);
    res.json(libraries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/tenants/:tenantConnectionId/libraries", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const allowedTenantIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.tenantConnectionId)) {
      return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
    }
    const libraries = await storage.getDocumentLibrariesByTenant(req.params.tenantConnectionId);
    const workspaces = await storage.getWorkspaces(undefined, req.params.tenantConnectionId);
    const wsMap = new Map(workspaces.map(w => [w.id, w]));
    const enriched = libraries.map(lib => ({
      ...lib,
      workspaceName: wsMap.get(lib.workspaceId)?.displayName || "Unknown",
      workspaceType: wsMap.get(lib.workspaceId)?.type || "Unknown",
      workspaceSiteUrl: wsMap.get(lib.workspaceId)?.siteUrl || null,
    }));
    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/tenants/:tenantConnectionId/libraries/stats", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const allowedTenantIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.tenantConnectionId)) {
      return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
    }
    const libraries = await storage.getDocumentLibrariesByTenant(req.params.tenantConnectionId);
    const totalLibraries = libraries.length;
    const totalItems = libraries.reduce((sum, l) => sum + (l.itemCount || 0), 0);
    const totalStorageBytes = libraries.reduce((sum, l) => sum + (l.storageUsedBytes || 0), 0);
    const withSensitivityLabel = libraries.filter(l => l.sensitivityLabelId).length;
    const hiddenCount = libraries.filter(l => l.hidden).length;
    const workspaceCount = new Set(libraries.map(l => l.workspaceId)).size;
    res.json({ totalLibraries, totalItems, totalStorageBytes, withSensitivityLabel, hiddenCount, workspaceCount });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/workspaces/:id", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const allowedTenantIds = await getOrgTenantConnectionIds(req);
  if (allowedTenantIds !== null) {
    const deleted = await storage.deleteWorkspaceScoped(req.params.id, allowedTenantIds);
    if (!deleted) return res.status(404).json({ message: "Workspace not found" });
    return res.status(204).send();
  }
  await storage.deleteWorkspace(req.params.id);
  res.status(204).send();
});

router.post("/api/workspaces/:id/archive", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), requireFeature("lifecycleAutomation"), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  const workspace = await storage.getWorkspace(req.params.id);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });
  if (workspace.isArchived) return res.status(400).json({ message: "Workspace is already archived" });
  if (!workspace.tenantConnectionId) return res.status(400).json({ message: "Workspace has no tenant connection" });
  if (!workspace.m365ObjectId) return res.status(400).json({ message: "Workspace has no Graph site ID — sync the workspace first" });

  const conn = await storage.getTenantConnection(workspace.tenantConnectionId);
  if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

  const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
  const clientSecret = getEffectiveClientSecret(conn);
  let graphToken: string;
  try {
    graphToken = await getAppToken(conn.tenantId, clientId, clientSecret);
  } catch (err: any) {
    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'SITE_ARCHIVED',
      resource: 'workspace',
      resourceId: workspace.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: workspace.tenantConnectionId,
      details: { workspaceName: workspace.displayName, siteUrl: workspace.siteUrl, error: `Failed to acquire Graph token: ${err.message}` },
      result: 'FAILURE',
      ipAddress: req.ip || null,
    });
    return res.status(502).json({ message: `Failed to acquire Graph token: ${err.message}` });
  }

  const result = await archiveSite(graphToken, workspace.m365ObjectId!);
  if (!result.success) {
    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'SITE_ARCHIVED',
      resource: 'workspace',
      resourceId: workspace.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: workspace.tenantConnectionId,
      details: { workspaceName: workspace.displayName, siteUrl: workspace.siteUrl, error: result.error },
      result: 'FAILURE',
      ipAddress: req.ip || null,
    });
    return res.status(502).json({ message: `Archive failed: ${result.error}` });
  }

  await storage.updateWorkspace(workspace.id, { isArchived: true, lockState: 'Locked' } as any);

  await storage.createAuditEntry({
    userId: req.user?.id || null,
    userEmail: req.user?.email || null,
    action: 'SITE_ARCHIVED',
    resource: 'workspace',
    resourceId: workspace.id,
    organizationId: req.user?.organizationId || null,
    tenantConnectionId: workspace.tenantConnectionId,
    details: { workspaceName: workspace.displayName, siteUrl: workspace.siteUrl },
    result: 'SUCCESS',
    ipAddress: req.ip || null,
  });

  res.json({ success: true, workspaceId: workspace.id });
});

router.post("/api/workspaces/:id/unarchive", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), requireFeature("lifecycleAutomation"), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  const workspace = await storage.getWorkspace(req.params.id);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });
  if (!workspace.isArchived) return res.status(400).json({ message: "Workspace is not archived" });
  if (!workspace.tenantConnectionId) return res.status(400).json({ message: "Workspace has no tenant connection" });
  if (!workspace.m365ObjectId) return res.status(400).json({ message: "Workspace has no Graph site ID — sync the workspace first" });

  const conn = await storage.getTenantConnection(workspace.tenantConnectionId);
  if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

  const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
  const clientSecret = getEffectiveClientSecret(conn);
  let graphToken: string;
  try {
    graphToken = await getAppToken(conn.tenantId, clientId, clientSecret);
  } catch (err: any) {
    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'SITE_UNARCHIVED',
      resource: 'workspace',
      resourceId: workspace.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: workspace.tenantConnectionId,
      details: { workspaceName: workspace.displayName, siteUrl: workspace.siteUrl, error: `Failed to acquire Graph token: ${err.message}` },
      result: 'FAILURE',
      ipAddress: req.ip || null,
    });
    return res.status(502).json({ message: `Failed to acquire Graph token: ${err.message}` });
  }

  const result = await unarchiveSite(graphToken, workspace.m365ObjectId!);
  if (!result.success) {
    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'SITE_UNARCHIVED',
      resource: 'workspace',
      resourceId: workspace.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: workspace.tenantConnectionId,
      details: { workspaceName: workspace.displayName, siteUrl: workspace.siteUrl, error: result.error },
      result: 'FAILURE',
      ipAddress: req.ip || null,
    });
    return res.status(502).json({ message: `Unarchive failed: ${result.error}` });
  }

  await storage.updateWorkspace(workspace.id, { isArchived: false, lockState: 'Unlock' } as any);

  await storage.createAuditEntry({
    userId: req.user?.id || null,
    userEmail: req.user?.email || null,
    action: 'SITE_UNARCHIVED',
    resource: 'workspace',
    resourceId: workspace.id,
    organizationId: req.user?.organizationId || null,
    tenantConnectionId: workspace.tenantConnectionId,
    details: { workspaceName: workspace.displayName, siteUrl: workspace.siteUrl },
    result: 'SUCCESS',
    ipAddress: req.ip || null,
  });

  res.json({ success: true, workspaceId: workspace.id });
});

router.post("/api/workspaces/:id/sync", requireRole(ZENITH_ROLES.OPERATOR, ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  try {
    const workspace = await storage.getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!workspace.tenantConnectionId) return res.status(400).json({ message: "Workspace has no tenant connection" });

    const connection = await storage.getTenantConnection(workspace.tenantConnectionId);
    if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

    const clientId = connection.clientId || process.env.AZURE_CLIENT_ID;
    const clientSecret = getEffectiveClientSecret(connection);
    if (!clientId || !clientSecret) {
      return res.status(503).json({ success: false, error: "Zenith app credentials not configured." });
    }

    const graphSiteId = workspace.m365ObjectId;
    if (!graphSiteId) return res.status(400).json({ message: "No M365 object ID on this workspace" });

    let token: string | null = null;
    try { token = await getAppToken(connection.tenantId, clientId, clientSecret); } catch {}
    if (!token) return res.status(503).json({ success: false, error: "Could not acquire Graph API token." });

    const siteRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${graphSiteId}?$select=id,displayName,webUrl,description,createdDateTime,lastModifiedDateTime,isPersonalSite,root,siteCollection`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    let siteData: any = null;
    let siteDeleted = false;
    if (siteRes.ok) {
      siteData = await siteRes.json();
    } else if (siteRes.status === 404) {
      siteDeleted = true;
    } else {
      const errText = await siteRes.text();
      return res.status(502).json({ success: false, error: `Graph API error ${siteRes.status}: ${errText}` });
    }

    const updates: Record<string, any> = {};

    if (siteDeleted) {
      updates.isDeleted = true;
      await storage.updateWorkspace(workspace.id, updates);
      return res.json({ success: true, siteDeleted: true, message: "Site no longer found in Microsoft 365 — marked as deleted." });
    }

    if (siteData) {
      updates.displayName = siteData.displayName || workspace.displayName;
      updates.siteUrl = siteData.webUrl || workspace.siteUrl;
      updates.description = siteData.description || null;
      updates.siteCreatedDate = siteData.createdDateTime || null;
      updates.lastContentModifiedDate = siteData.lastModifiedDateTime || null;
    }

    const siteUrl = siteData?.webUrl || workspace.siteUrl || "";
    const domain = siteUrl.match(/https?:\/\/([^/]+)/)?.[1] || "";

    let spoToken: string | null = null;
    if (domain) {
      const spoHost = domain.includes('.sharepoint.com') ? domain : `${domain.replace(/\..*$/, '')}.sharepoint.com`;
      try { spoToken = await getDelegatedSpoTokenForOrg(spoHost, req.session?.userId, connection.organizationId); } catch {}
    }

    const [driveResult, analyticsResult, groupOwnersResult, lockStateResult, archiveResult, propertyBagResult] = await Promise.allSettled([
      fetchSiteDriveOwner(token, graphSiteId),
      fetchSiteAnalytics(token, graphSiteId),
      fetchSiteGroupOwners(token, graphSiteId),
      spoToken && siteUrl ? fetchSiteLockState(spoToken, siteUrl) : Promise.resolve({ lockState: "Unknown", isArchived: false }),
      fetchSiteArchiveStatus(token, graphSiteId),
      spoToken && siteUrl ? fetchSitePropertyBag(spoToken, siteUrl) : Promise.resolve({ properties: {} }),
    ]);

    const warnings: string[] = [];
    const driveOwner = driveResult.status === 'fulfilled' ? driveResult.value : {} as any;
    const siteAnalytics = analyticsResult.status === 'fulfilled' ? analyticsResult.value : {} as any;
    const groupOwners = groupOwnersResult.status === 'fulfilled' ? groupOwnersResult.value : { owners: [] } as any;
    const lockStateData = lockStateResult.status === 'fulfilled' ? lockStateResult.value as any : { lockState: "Unknown", isArchived: false };
    const lockState = lockStateData.lockState;
    const archiveData = archiveResult.status === 'fulfilled' ? archiveResult.value : { isArchived: false, archiveStatus: null };
    const propertyBagData = propertyBagResult.status === 'fulfilled' ? propertyBagResult.value : { properties: {} };

    if (driveResult.status === 'rejected') warnings.push("Storage/drive data unavailable — your account may lack read permissions for this site.");
    if (analyticsResult.status === 'rejected') warnings.push("Analytics data unavailable — Reports.Read.All permission may be missing or your account may lack access.");
    if (groupOwnersResult.status === 'rejected') warnings.push("Group owners data unavailable — Group.Read.All permission may be missing.");
    if (lockStateResult.status === 'rejected') warnings.push("Lock state unavailable — SharePoint admin permissions required to read site lock state.");
    if (propertyBagResult.status === 'rejected') warnings.push("Property bag unavailable — SharePoint permissions may be insufficient.");
    else if (propertyBagData.error) warnings.push(`Property bag partially unavailable — ${propertyBagData.error}`);
    if (!spoToken) warnings.push("No SharePoint delegated token available — some data (lock state, property bags) could not be synced. Sign out and sign back in with SSO.");

    updates.ownerDisplayName = driveOwner.ownerDisplayName || workspace.ownerDisplayName || null;
    updates.ownerPrincipalName = driveOwner.ownerEmail || workspace.ownerPrincipalName || null;

    {
      const mergedOwners: Array<{ id?: string; displayName: string; mail?: string; userPrincipalName?: string }> = [];
      const seenEmails = new Set<string>();

      if (groupOwners.owners && groupOwners.owners.length > 0) {
        for (const o of groupOwners.owners) {
          const key = (o.mail || o.userPrincipalName || '').toLowerCase();
          if (key && !seenEmails.has(key)) {
            seenEmails.add(key);
            mergedOwners.push({ id: o.id, displayName: o.displayName || '', mail: o.mail, userPrincipalName: o.userPrincipalName });
          }
        }
      }

      if (spoToken && siteUrl) {
        const adminsResult = await fetchSiteCollectionAdmins(spoToken, siteUrl);
        if (adminsResult.admins.length > 0) {
          for (const a of adminsResult.admins) {
            const key = (a.mail || a.userPrincipalName || '').toLowerCase();
            if (key && !seenEmails.has(key)) {
              seenEmails.add(key);
              mergedOwners.push(a);
            }
          }
        }
        if (adminsResult.error) {
          warnings.push(`Site owners/admins partially unavailable: ${adminsResult.error}`);
        }
      }

      if (mergedOwners.length > 0) {
        updates.siteOwners = mergedOwners;
        updates.owners = mergedOwners.length;
      }
      console.log(`[single-sync] ${siteUrl}: groupOwners=${groupOwners.owners?.length || 0}, siteAdmins merged, total=${mergedOwners.length} => ${mergedOwners.map(o => o.displayName).join(', ')}`);
    }

    const storageUsed = driveOwner.storageUsedBytes ?? workspace.storageUsedBytes ?? null;
    const storageAlloc = driveOwner.storageAllocatedBytes ?? workspace.storageAllocatedBytes ?? null;
    updates.storageUsedBytes = storageUsed;
    updates.storageAllocatedBytes = storageAlloc;

    const activityDate = siteAnalytics.lastActivityDate || workspace.lastActivityDate || null;
    updates.lastActivityDate = activityDate;

    updates.isArchived = archiveData.isArchived;
    if (lockState !== "Unknown") {
      updates.lockState = lockState;
    } else if (archiveData.isArchived) {
      updates.lockState = "Locked";
      console.log(`[sync] ${siteUrl} → archived (${archiveData.archiveStatus}) via Graph archivalDetails`);
    } else {
      updates.lockState = workspace.lockState || "Unknown";
      if (updates.lockState === "Unknown") {
        warnings.push("Could not determine lock state — SPO REST API inaccessible and site is not archived.");
      }
    }
    updates.isDeleted = false;

    if (storageUsed != null) {
      const usedMB = Math.round(storageUsed / (1024 * 1024));
      updates.size = usedMB >= 1024 ? `${(usedMB / 1024).toFixed(1)} GB` : `${usedMB} MB`;
    }

    if (activityDate) {
      const d = new Date(activityDate);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) updates.lastActive = "Today";
      else if (diffDays === 1) updates.lastActive = "Yesterday";
      else if (diffDays <= 7) updates.lastActive = `${diffDays} days ago`;
      else if (diffDays <= 30) updates.lastActive = `${Math.floor(diffDays / 7)} weeks ago`;
      else updates.lastActive = `${Math.floor(diffDays / 30)} months ago`;
    }

    const siteType = inferSiteType(workspace.rootWebTemplate as string | undefined, siteData?.siteCollection?.root);
    updates.type = siteType;

    if (Object.keys(propertyBagData.properties).length > 0) {
      const existingBag = (workspace.propertyBag as Record<string, string>) || {};
      updates.propertyBag = { ...existingBag, ...propertyBagData.properties };
      console.log(`[single-sync] ${siteUrl} → merged ${Object.keys(propertyBagData.properties).length} property bag entries (total: ${Object.keys(updates.propertyBag).length})`);
    }

    const updated = await storage.updateWorkspace(workspace.id, updates);

    try {
      const connection2 = await storage.getTenantConnection(workspace.tenantConnectionId!);
      if (connection2?.organizationId) {
        const evalResult = await evaluateAllPoliciesForWorkspace(updated, connection2.organizationId, connection2.tenantId, "[single-sync]");

        if (evalResult.bagChanged && workspace.siteUrl && Object.keys(evalResult.changedBagKeys).length > 0) {
          console.log(`[single-sync] Policy bag changed for ${workspace.displayName}, auto-writing back ${Object.keys(evalResult.changedBagKeys).length} keys`);
          try {
            const spoHost2 = connection2.domain.includes('.sharepoint.com') ? connection2.domain : `${connection2.domain.replace(/\..*$/, '')}.sharepoint.com`;
            const spoToken2 = (req as any).session?.userId ? await getDelegatedSpoToken((req as any).session.userId, spoHost2) : null;
            if (spoToken2) {
              const wbResult = await writeSitePropertyBag(spoToken2, workspace.siteUrl, evalResult.changedBagKeys, (req as any).session?.userId);
              if (wbResult.success) {
                const refreshedWs = await storage.getWorkspace(workspace.id);
                if (refreshedWs) {
                  const wbHash = computeWritebackHash({
                    sensitivityLabelId: refreshedWs.sensitivityLabelId,
                    department: refreshedWs.department,
                    costCenter: refreshedWs.costCenter,
                    projectCode: refreshedWs.projectCode,
                    propertyBag: refreshedWs.propertyBag,
                  });
                  await storage.updateWorkspace(workspace.id, { spoSyncHash: wbHash, localHash: wbHash } as any);
                }
                console.log(`[single-sync] Auto-writeback succeeded for ${workspace.displayName}`);
              } else {
                console.warn(`[single-sync] Auto-writeback failed for ${workspace.displayName}: ${wbResult.error}`);
                warnings.push(`Policy writeback failed: ${wbResult.error}`);
              }
            } else {
              warnings.push("Policy outcome changed but auto-writeback skipped — no SPO token available");
            }
          } catch (wbErr: any) {
            console.error(`[single-sync] Auto-writeback error: ${wbErr.message}`);
            warnings.push(`Policy writeback error: ${wbErr.message}`);
          }
        }
      }
    } catch (evalErr: any) {
      console.error(`[single-sync] Policy evaluation error: ${evalErr.message}`);
    }

    let librarySyncCount = 0;
    if (token && workspace.m365ObjectId) {
      try {
        const libResult = await fetchSiteDocumentLibraries(token, workspace.m365ObjectId);
        for (const lib of libResult.libraries) {
          await storage.upsertDocumentLibrary({
            workspaceId: workspace.id,
            tenantConnectionId: workspace.tenantConnectionId!,
            m365ListId: lib.listId,
            displayName: lib.displayName,
            description: lib.description,
            webUrl: lib.webUrl,
            template: lib.template,
            itemCount: lib.itemCount,
            storageUsedBytes: lib.storageUsedBytes,
            sensitivityLabelId: lib.sensitivityLabelId,
            isDefaultDocLib: lib.isDefaultDocLib,
            hidden: lib.hidden,
            lastModifiedAt: lib.lastModifiedAt,
            createdGraphAt: lib.createdAt,
            lastSyncAt: new Date(),
          });
          librarySyncCount++;
        }
        if (libResult.error) warnings.push(`Document library sync partial: ${libResult.error}`);
        console.log(`[single-sync] Synced ${librarySyncCount} document libraries for ${workspace.displayName}`);
      } catch (libErr: any) {
        warnings.push(`Document library sync failed: ${libErr.message}`);
      }
    }

    const finalWorkspace = await storage.getWorkspace(workspace.id);
    res.json({ success: true, workspace: finalWorkspace, librariesSynced: librarySyncCount, warnings: warnings.length > 0 ? warnings : undefined });
  } catch (err: any) {
    console.error("[single-site-sync] Error:", err);
    res.status(500).json({ success: false, error: err.message || "Sync failed" });
  }
});

router.patch("/api/workspaces/bulk/update", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const { ids, updates } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "ids array is required" });
  }
  const allowedIds = await getOrgTenantConnectionIds(req);
  if (allowedIds !== null) {
    for (const wsId of ids) {
      if (!(await isWorkspaceInScope(req, wsId))) {
        return res.status(403).json({ message: "One or more workspaces are outside your organization scope" });
      }
    }
    await storage.bulkUpdateWorkspacesScoped(ids, updates, allowedIds);
  } else {
    await storage.bulkUpdateWorkspaces(ids, updates);
  }

  let policyEvalCount = 0;
  let writebackPendingCount = 0;
  try {
    for (const wsId of ids) {
      const ws = await storage.getWorkspace(wsId);
      if (!ws?.tenantConnectionId) continue;
      const conn = await storage.getTenantConnection(ws.tenantConnectionId);
      if (!conn?.organizationId) continue;
      const evalResult = await evaluateAllPoliciesForWorkspace(ws, conn.organizationId, conn.tenantId, "[bulk-update]");
      policyEvalCount++;

      if (evalResult.bagChanged && ws.siteUrl) {
        const refreshedWs = await storage.getWorkspace(wsId);
        if (refreshedWs) {
          const newLocalHash = computeWritebackHash({
            sensitivityLabelId: refreshedWs.sensitivityLabelId,
            department: refreshedWs.department,
            costCenter: refreshedWs.costCenter,
            projectCode: refreshedWs.projectCode,
            propertyBag: refreshedWs.propertyBag,
          });
          await storage.updateWorkspace(wsId, { localHash: newLocalHash } as any);
        }
        writebackPendingCount++;
      }
    }
  } catch (evalErr: any) {
    console.error(`[bulk-update] Policy evaluation error: ${evalErr.message}`);
  }

  if (writebackPendingCount > 0) {
    console.log(`[bulk-update] ${writebackPendingCount} workspaces have pending property bag writebacks`);
  }

  await storage.createAuditEntry({
    userId: req.user?.id || null,
    userEmail: req.user?.email || null,
    action: 'BULK_UPDATE',
    resource: 'workspace',
    resourceId: null,
    organizationId: req.user?.organizationId || null,
    details: { count: ids.length, fields: Object.keys(updates), workspaceIds: ids },
    result: 'SUCCESS',
    ipAddress: req.ip || null,
  });

  res.json({
    message: "Bulk update complete",
    count: ids.length,
    policyEvaluation: policyEvalCount > 0 ? { evaluated: policyEvalCount } : undefined,
    writebackPending: writebackPendingCount > 0 ? { count: writebackPendingCount, message: `${writebackPendingCount} workspace(s) have policy outcome changes that need to be written back to SharePoint.` } : undefined,
  });
});

router.patch("/api/workspaces/bulk/hub-assignment", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const { workspaceIds, hubSiteId } = req.body;
  if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
    return res.status(400).json({ message: "workspaceIds array is required" });
  }

  const allowedTenantIds = await getOrgTenantConnectionIds(req);
  const orgId = req.activeOrganizationId || req.user?.organizationId || undefined;
  const allWs = await storage.getWorkspaces(undefined, undefined, orgId);

  const allowedWsIds = new Set(allWs.map(ws => ws.id));
  const outOfScope = workspaceIds.filter((id: string) => !allowedWsIds.has(id));
  if (outOfScope.length > 0) {
    return res.status(403).json({ message: "One or more workspaces are outside your organization scope" });
  }

  if (hubSiteId) {
    const hubExists = allWs.some(ws => ws.isHubSite && ws.hubSiteId === hubSiteId);
    if (!hubExists) {
      return res.status(400).json({ message: "Invalid hub site ID — no hub site found with that identifier" });
    }
  }

  if (allowedTenantIds !== null) {
    await storage.bulkUpdateWorkspacesScoped(workspaceIds, { hubSiteId: hubSiteId || null }, allowedTenantIds);
  } else {
    await storage.bulkUpdateWorkspaces(workspaceIds, { hubSiteId: hubSiteId || null });
  }

  const spoSyncResults: { workspaceId: string; displayName: string; success: boolean; error?: string }[] = [];
  const targetWorkspaces = allWs.filter(ws => workspaceIds.includes(ws.id));

  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    for (const ws of targetWorkspaces) {
      spoSyncResults.push({ workspaceId: ws.id, displayName: ws.displayName, success: false, error: "Azure credentials not configured" });
    }
    return res.json({
      message: "Hub assignment saved to Zenith. SharePoint sync skipped — Azure credentials not configured.",
      count: workspaceIds.length,
      spoSync: { attempted: targetWorkspaces.length, succeeded: 0, failed: targetWorkspaces.length, results: spoSyncResults },
    });
  }

  for (const ws of targetWorkspaces) {
    if (!ws.siteUrl || !ws.tenantConnectionId) {
      spoSyncResults.push({ workspaceId: ws.id, displayName: ws.displayName, success: false, error: "No site URL or tenant connection" });
      continue;
    }

    try {
      const connection = await storage.getTenantConnection(ws.tenantConnectionId);
      if (!connection) {
        spoSyncResults.push({ workspaceId: ws.id, displayName: ws.displayName, success: false, error: "Tenant connection not found" });
        continue;
      }

      const domain = ws.siteUrl.match(/https?:\/\/([^/]+)/)?.[1] || "";
      if (!domain) {
        spoSyncResults.push({ workspaceId: ws.id, displayName: ws.displayName, success: false, error: "Invalid site URL format" });
        continue;
      }

      const spoHost = domain.includes('.sharepoint.com') ? domain : `${domain.replace(/\..*$/, '')}.sharepoint.com`;
      const spoToken = req.session?.userId ? await getDelegatedSpoToken(req.session.userId, spoHost) : null;
      if (!spoToken) {
        spoSyncResults.push({ workspaceId: ws.id, displayName: ws.displayName, success: false, error: "No SharePoint token available for your account. You must be a SharePoint administrator and sign in via SSO." });
        continue;
      }

      let result;
      if (hubSiteId) {
        result = await joinHubSite(spoToken, ws.siteUrl, hubSiteId);
      } else {
        result = await leaveHubSite(spoToken, ws.siteUrl);
      }

      spoSyncResults.push({ workspaceId: ws.id, displayName: ws.displayName, success: result.success, error: result.error });

      if (result.success) {
        console.log(`[hub-assign] ${hubSiteId ? 'Joined' : 'Left'} hub for ${ws.displayName} (${ws.siteUrl})`);
      } else {
        console.warn(`[hub-assign] SharePoint sync failed for ${ws.displayName}: ${result.error}`);
      }
    } catch (err: any) {
      spoSyncResults.push({ workspaceId: ws.id, displayName: ws.displayName, success: false, error: err.message });
      console.error(`[hub-assign] Error syncing ${ws.displayName}: ${err.message}`);
    }
  }

  const allSynced = spoSyncResults.every(r => r.success);
  const noneSynced = spoSyncResults.every(r => !r.success);
  const syncedCount = spoSyncResults.filter(r => r.success).length;

  res.json({
    message: allSynced
      ? `Hub assignment updated and synced to SharePoint (${syncedCount}/${spoSyncResults.length})`
      : noneSynced
        ? "Hub assignment saved to Zenith. SharePoint sync failed — check permissions."
        : `Hub assignment saved. Partially synced to SharePoint (${syncedCount}/${spoSyncResults.length}).`,
    count: workspaceIds.length,
    spoSync: {
      attempted: spoSyncResults.length,
      succeeded: syncedCount,
      failed: spoSyncResults.length - syncedCount,
      results: spoSyncResults,
    },
  });
});

// ── Copilot Rules ──
router.get("/api/workspaces/:id/copilot-rules", requireAuth(), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  const rules = await storage.getCopilotRules(req.params.id);
  res.json(rules);
});

router.put("/api/workspaces/:id/copilot-rules", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  const { rules } = req.body;
  if (!Array.isArray(rules)) {
    return res.status(400).json({ message: "rules array is required" });
  }
  const created = await storage.setCopilotRules(req.params.id, rules);
  res.json(created);
});

// ── Provisioning Requests ──
router.get("/api/provisioning-requests", requireAuth(), requireFeature("selfServicePortal"), async (req: AuthenticatedRequest, res) => {
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  if (isPlatformOwner) {
    const requests = await storage.getProvisioningRequests(null);
    return res.json(requests);
  }
  const orgId = req.activeOrganizationId || req.user?.organizationId;
  if (!orgId) return res.json([]);
  const requests = await storage.getProvisioningRequests(orgId);
  res.json(requests);
});

router.get("/api/provisioning-requests/:id", requireAuth(), requireFeature("selfServicePortal"), async (req: AuthenticatedRequest, res) => {
  const request = await storage.getProvisioningRequest(req.params.id);
  if (!request) return res.status(404).json({ message: "Request not found" });
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  if (!isPlatformOwner) {
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (request.organizationId !== orgId) {
      return res.status(404).json({ message: "Request not found" });
    }
  }
  res.json(request);
});

// ── Provisioning Templates (BL-005) ──
router.get("/api/provisioning-templates", requireRole(ZENITH_ROLES.OPERATOR, ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), requireFeature("selfServicePortal"), async (_req: AuthenticatedRequest, res) => {
  res.json(BUILT_IN_TEMPLATES);
});

router.get("/api/provisioning-templates/:id", requireRole(ZENITH_ROLES.OPERATOR, ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), requireFeature("selfServicePortal"), async (req: AuthenticatedRequest, res) => {
  const template = getTemplateById(req.params.id);
  if (!template) return res.status(404).json({ message: "Template not found" });
  res.json(template);
});

router.post("/api/provisioning-requests", requireRole(ZENITH_ROLES.OPERATOR, ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), requireFeature("selfServicePortal"), async (req: AuthenticatedRequest, res) => {
  const parsed = insertProvisioningRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

  // Optional template resolution — when a templateId is supplied, validate the
  // payload against the template's invariants so mismatches are caught early
  // rather than at Graph write time.
  const templateId = typeof req.body.templateId === "string" ? req.body.templateId : null;
  const template = templateId ? getTemplateById(templateId) : undefined;
  if (templateId && !template) {
    return res.status(400).json({ message: `Unknown provisioning template "${templateId}".` });
  }

  const templateViolation = validateProvisioningPayload({
    sensitivity: parsed.data.sensitivity,
    externalSharing: parsed.data.externalSharing,
    siteOwners: parsed.data.siteOwners,
  }, template);
  if (templateViolation) {
    return res.status(400).json({ message: templateViolation });
  }

  if (template) {
    const nameErr = validateGovernedName(parsed.data.governedName, template);
    if (nameErr) return res.status(400).json({ message: nameErr });
  }

  const orgId = req.activeOrganizationId || req.user?.organizationId || null;
  const request = await storage.createProvisioningRequest({ ...parsed.data, organizationId: orgId });
  await storage.createAuditEntry({
    userId: req.user?.id || null,
    userEmail: req.user?.email || null,
    action: 'PROVISIONING_REQUESTED',
    resource: 'provisioning_request',
    resourceId: request.id,
    organizationId: orgId,
    tenantConnectionId: request.tenantConnectionId || null,
    details: {
      workspaceName: request.workspaceName,
      workspaceType: request.workspaceType,
      sensitivity: request.sensitivity,
      templateId: template?.id,
      templateName: template?.name,
      derivedRetention: deriveRetentionPolicy(request.projectType, request.sensitivity),
    },
    result: 'SUCCESS',
    ipAddress: req.ip || null,
  });
  res.status(201).json(request);
});

router.patch("/api/provisioning-requests/:id/status", requireRole(ZENITH_ROLES.TENANT_ADMIN), requireFeature("selfServicePortal"), async (req: AuthenticatedRequest, res) => {
  const { status } = req.body;
  if (!["PENDING", "APPROVED", "PROVISIONED", "REJECTED", "FAILED"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  const existing = await storage.getProvisioningRequest(req.params.id);
  if (!existing) return res.status(404).json({ message: "Request not found" });
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  if (!isPlatformOwner) {
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (existing.organizationId !== orgId) {
      return res.status(403).json({ message: "Forbidden" });
    }
  }

  // Validate owner count on approval too
  if (status === "APPROVED" || status === "PROVISIONED") {
    const owners = (existing.siteOwners as Array<{ displayName: string }> | null) || [];
    if (owners.length < 2) {
      return res.status(400).json({ message: "Cannot approve: provisioning request requires at least two owners in siteOwners." });
    }
  }

  if (status === "PROVISIONED") {
    const org = await storage.getOrganization(req.activeOrganizationId || req.user?.organizationId);
    const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
    const features = getPlanFeatures(plan);
    if (!features.m365WriteBack) {
      return res.status(403).json({
        error: "FEATURE_GATED",
        message: `Provisioning to Microsoft 365 is not available on the ${features.label} plan. Requests can be submitted and approved, but write-back to M365 requires a Standard plan or higher.`,
        currentPlan: plan,
        requiredFeature: "m365WriteBack",
      });
    }

    // ── Graph API provisioning ───────────────────────────────────────────────
    const tenantConnectionId = existing.tenantConnectionId || req.body.tenantConnectionId;
    if (!tenantConnectionId) {
      return res.status(400).json({ message: "No tenantConnectionId on provisioning request — cannot provision to M365. Set tenantConnectionId first." });
    }

    const conn = await storage.getTenantConnection(tenantConnectionId);
    if (!conn) {
      return res.status(400).json({ message: "Tenant connection not found" });
    }

    const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
    const clientSecret = getEffectiveClientSecret(conn);

    let graphToken: string;
    try {
      graphToken = await getAppToken(conn.tenantId, clientId, clientSecret);
    } catch (err: any) {
      const failed = await storage.updateProvisioningRequestStatus(req.params.id, "FAILED", { errorMessage: `Token acquisition failed: ${err.message}` });
      await storage.createAuditEntry({
        userId: req.user?.id || null,
        userEmail: req.user?.email || null,
        action: 'PROVISIONING_FAILED',
        resource: 'provisioning_request',
        resourceId: existing.id,
        organizationId: req.user?.organizationId || null,
        tenantConnectionId,
        details: { workspaceName: existing.workspaceName, error: err.message, reason: "Token acquisition failed" },
        result: 'FAILURE',
        ipAddress: req.ip || null,
      });
      return res.status(502).json({ message: `Failed to acquire Graph token: ${err.message}`, request: failed });
    }

    const siteOwners = (existing.siteOwners as Array<{ displayName: string; mail?: string; userPrincipalName?: string }>) || [];
    const spoHost = conn.domain.includes('.sharepoint.com') ? conn.domain : `${conn.domain.replace(/\..*$/, '')}.sharepoint.com`;
    const alias = existing.governedName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 60);
    const workspaceType = existing.workspaceType;

    let provisionResult: { success: boolean; siteUrl?: string; graphSiteId?: string; groupId?: string; error?: string };

    try {
      if (workspaceType === "COMMUNICATION_SITE") {
        // Communication sites: SharePoint REST provisioning
        const result = await createSharePointSite(graphToken, spoHost, existing.governedName, alias, existing.workspaceName);
        provisionResult = result;
      } else {
        // Team Site: M365 Group + optional Teams
        const ownerIds = await resolveOwnerIds(graphToken, siteOwners);
        if (ownerIds.length === 0) {
          // Fall back to creating the group without resolved owners — UPNs not in this tenant
          console.warn(`[provisioning] Could not resolve any owner IDs for ${existing.governedName}. Creating group without pre-set owners.`);
        }
        const groupResult = await createM365Group(
          graphToken,
          existing.governedName,
          alias,
          existing.workspaceName,
          ownerIds,
          "Private",
        );
        provisionResult = groupResult;

        if (groupResult.success && groupResult.groupId) {
          // Assign sensitivity label if available
          const sensitivityMap: Record<string, string> = {
            HIGHLY_CONFIDENTIAL: "Highly Confidential",
            CONFIDENTIAL: "Confidential",
            INTERNAL: "Internal",
            PUBLIC: "Public",
          };
          const labelName = sensitivityMap[existing.sensitivity] || existing.sensitivity;
          const labels = await storage.getSensitivityLabelsByTenantId(conn.tenantId);
          const matchedLabel = labels.find(l =>
            l.appliesToGroupsSites &&
            (l.name.toLowerCase().includes(labelName.toLowerCase()) || l.labelId === existing.sensitivity)
          );
          if (matchedLabel?.labelId) {
            const labelResult = await assignSensitivityLabelToGroup(graphToken, groupResult.groupId, matchedLabel.labelId);
            if (!labelResult.success) {
              console.warn(`[provisioning] Could not assign sensitivity label to group ${groupResult.groupId}: ${labelResult.error}`);
            } else {
              console.log(`[provisioning] Assigned sensitivity label ${matchedLabel.labelId} to group ${groupResult.groupId}`);
            }
          }

          // Teams-connected: provision a Team on top of the Group
          if (existing.workspaceType === "TEAM_SITE" && req.body.teamsConnected !== false) {
            const teamResult = await createTeam(graphToken, groupResult.groupId);
            if (!teamResult.success) {
              console.warn(`[provisioning] Team provisioning failed for group ${groupResult.groupId}: ${teamResult.error}`);
            } else {
              console.log(`[provisioning] Provisioned Teams team for group ${groupResult.groupId}`);
            }
          }
        }
      }
    } catch (err: any) {
      provisionResult = { success: false, error: err.message };
    }

    if (!provisionResult.success) {
      const failed = await storage.updateProvisioningRequestStatus(req.params.id, "FAILED", {
        errorMessage: provisionResult.error || "Unknown provisioning error",
      });
      await storage.createAuditEntry({
        userId: req.user?.id || null,
        userEmail: req.user?.email || null,
        action: 'PROVISIONING_FAILED',
        resource: 'provisioning_request',
        resourceId: existing.id,
        organizationId: req.user?.organizationId || null,
        tenantConnectionId,
        details: {
          workspaceName: existing.workspaceName,
          workspaceType: existing.workspaceType,
          governedName: existing.governedName,
          tenantId: conn.tenantId,
          error: provisionResult.error,
        },
        result: 'FAILURE',
        ipAddress: req.ip || null,
      });
      return res.status(502).json({ message: `M365 provisioning failed: ${provisionResult.error}`, request: failed });
    }

    // ── Success: write property bag, upsert inventory ───────────────────────
    const siteUrl = provisionResult.siteUrl;
    const graphSiteId = provisionResult.graphSiteId;

    if (siteUrl) {
      // Write Zenith property bag metadata to new site
      try {
        const spoToken = await getDelegatedSpoTokenForOrg(spoHost, req.user?.id, conn.organizationId);
        if (spoToken) {
          const bagKeys: Record<string, string> = {
            ZenithWorkspaceName: existing.governedName,
            ZenithProjectType: existing.projectType,
            ZenithSensitivity: existing.sensitivity,
            ZenithRequestedBy: existing.requestedBy,
            ZenithProvisionedAt: new Date().toISOString(),
          };
          await writeSitePropertyBag(spoToken, siteUrl, bagKeys, req.user?.id);
          console.log(`[provisioning] Wrote property bag to ${siteUrl}`);
        }
      } catch (pbErr: any) {
        console.warn(`[provisioning] Property bag write failed for ${siteUrl}: ${pbErr.message}`);
      }

      // Upsert workspace inventory record
      try {
        const existingByUrl = (await storage.getWorkspaces()).find(w => w.siteUrl === siteUrl);
        if (!existingByUrl) {
          const derivedRetention = deriveRetentionPolicy(existing.projectType, existing.sensitivity);
          await storage.createWorkspace({
            displayName: existing.governedName,
            type: existing.workspaceType === "COMMUNICATION_SITE" ? "COMMUNICATION_SITE" : "TEAM_SITE",
            teamsConnected: existing.workspaceType === "TEAM_SITE",
            projectType: existing.projectType as any,
            sensitivity: existing.sensitivity as any,
            retentionPolicy: derivedRetention,
            metadataStatus: "COMPLETE",
            copilotReady: false,
            owners: siteOwners.length,
            siteOwners,
            siteUrl,
            m365ObjectId: graphSiteId || undefined,
            tenantConnectionId,
            externalSharing: existing.externalSharing,
          });
          console.log(`[provisioning] Created workspace inventory entry for ${siteUrl} with retention "${derivedRetention}"`);
        }
      } catch (invErr: any) {
        console.warn(`[provisioning] Could not upsert workspace inventory: ${invErr.message}`);
      }
    }

    const provisioned = await storage.updateProvisioningRequestStatus(req.params.id, "PROVISIONED", {
      provisionedSiteUrl: siteUrl,
    });

    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'WORKSPACE_PROVISIONED',
      resource: 'provisioning_request',
      resourceId: existing.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId,
      details: {
        workspaceName: existing.workspaceName,
        workspaceType: existing.workspaceType,
        governedName: existing.governedName,
        tenantId: conn.tenantId,
        siteUrl,
        graphSiteId,
        groupId: provisionResult.groupId,
        ownersCount: siteOwners.length,
        requestedBy: existing.requestedBy,
      },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json(provisioned);
  }

  // ── Non-provisioning status transitions ─────────────────────────────────────
  const request = await storage.updateProvisioningRequestStatus(req.params.id, status);
  if (!request) return res.status(404).json({ message: "Request not found" });

  const auditActionMap: Record<string, string> = {
    APPROVED: 'WORKSPACE_PROVISIONED',
    REJECTED: 'PROVISIONING_REJECTED',
    FAILED: 'PROVISIONING_FAILED',
    PENDING: 'PROVISIONING_REQUEST_UPDATED',
  };
  const action = auditActionMap[status] || 'PROVISIONING_REQUEST_UPDATED';
  const auditResult = status === 'REJECTED' ? 'FAILURE' : 'SUCCESS';

  await storage.createAuditEntry({
    userId: req.user?.id || null,
    userEmail: req.user?.email || null,
    action,
    resource: 'provisioning_request',
    resourceId: request.id,
    organizationId: req.user?.organizationId || null,
    details: {
      workspaceName: request.workspaceName,
      workspaceType: request.workspaceType,
      previousStatus: existing?.status,
      newStatus: status,
      requestedBy: request.requestedBy,
    },
    result: auditResult,
    ipAddress: req.ip || null,
  });

  res.json(request);
});

// ── Site Inventory Sync ──
router.post("/api/admin/tenants/:id/sync", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const allowedTenantIds = await getOrgTenantConnectionIds(req);
  if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.id)) {
    return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
  }
  const connection = await storage.getTenantConnection(req.params.id);
  if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

  const clientId = connection.clientId || process.env.AZURE_CLIENT_ID;
  const clientSecret = getEffectiveClientSecret(connection);

  if (!clientId || !clientSecret) {
    return res.status(503).json({ success: false, error: "Zenith app credentials not configured. Set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET." });
  }

  // Load org plan to determine if a site cap applies
  const syncOrg = connection.organizationId ? await storage.getOrganization(connection.organizationId) : null;
  const syncOrgPlan = (syncOrg?.servicePlan || 'TRIAL') as ServicePlanTier;
  const syncOrgFeatures = getPlanFeatures(syncOrgPlan);

  await storage.createAuditEntry({
    userId: req.user?.id || null,
    userEmail: req.user?.email || null,
    action: 'TENANT_SYNC_STARTED',
    resource: 'tenant_connection',
    resourceId: req.params.id,
    organizationId: req.user?.organizationId || null,
    tenantConnectionId: req.params.id,
    details: { tenantName: connection.tenantName, tenantId: connection.tenantId },
    result: 'SUCCESS',
    ipAddress: req.ip || null,
  });

  try {
    const [siteResult, usageResult] = await Promise.all([
      fetchSharePointSites(connection.tenantId, clientId, clientSecret),
      fetchSiteUsageReport(connection.tenantId, clientId, clientSecret),
    ]);

    if (siteResult.error && siteResult.sites.length === 0) {
      await storage.updateTenantConnection(req.params.id, {
        lastSyncAt: new Date(),
        lastSyncStatus: `ERROR: ${siteResult.error}`,
        lastSyncSiteCount: 0,
      });
      return res.json({ success: false, error: siteResult.error, sitesFound: 0 });
    }

    // Apply plan-based site cap (Trial: 1,000; all other plans: -1 = unlimited)
    const sitesDiscoveredTotal = siteResult.sites.length;
    const maxSitesCap = syncOrgFeatures.maxSites;
    let sitesCapApplied = false;
    if (maxSitesCap > 0 && siteResult.sites.length > maxSitesCap) {
      console.log(`[sync-cap] ${syncOrgPlan} plan cap applied: limiting ${sitesDiscoveredTotal} discovered sites to ${maxSitesCap}`);
      siteResult.sites = siteResult.sites.slice(0, maxSitesCap);
      sitesCapApplied = true;
    }

    const normalizeUrl = (url: string) => url.toLowerCase().replace(/\/+$/, '');

    const usageMap = new Map<string, typeof usageResult.report[0]>();
    const usageUrlMap = new Map<string, typeof usageResult.report[0]>();
    for (const row of usageResult.report) {
      if (row.siteId) usageMap.set(row.siteId.toLowerCase().trim(), row);
      if (row.siteUrl) usageUrlMap.set(normalizeUrl(row.siteUrl), row);
    }

    let token: string | null = null;
    try {
      token = await getAppToken(connection.tenantId, clientId, clientSecret);
    } catch {}

    const spoTokenCache = new Map<string, string | null>();
    const getSpoTokenForDomain = async (domain: string): Promise<string | null> => {
      if (spoTokenCache.has(domain)) return spoTokenCache.get(domain)!;
      try {
        const spoHost = domain.includes('.sharepoint.com') ? domain : `${domain.replace(/\..*$/, '')}.sharepoint.com`;
        const t = await getDelegatedSpoTokenForOrg(spoHost, req.session?.userId, connection.organizationId);
        spoTokenCache.set(domain, t);
        return t;
      } catch (err: any) {
        console.warn(`[sync] Delegated SPO token failed for ${domain}: ${err.message}`);
        spoTokenCache.set(domain, null);
        return null;
      }
    };

    let upsertedCount = 0;
    let usageMatched = 0;
    const enrichErrors: string[] = [];
    const permissionWarnings: { area: string; permission: string; message: string; severity: "error" | "warning" }[] = [];

    if (!token) {
      permissionWarnings.push({
        area: "Graph API",
        permission: "Application credentials",
        message: "Could not acquire a Graph API token. Site enrichment (owners, analytics, lock state) was skipped.",
        severity: "error",
      });
    }

    const BATCH_SIZE = 5;
    const enrichCache = new Map<string, { driveOwner: any; analytics: any; groupOwners: any; siteAdmins?: any[]; lockState?: string; isArchived?: boolean; propertyBag?: Record<string, string> }>();

    if (token) {
      for (let i = 0; i < siteResult.sites.length; i += BATCH_SIZE) {
        const batch = siteResult.sites.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (site) => {
            const siteUrl = site.webUrl || "";
            const domain = siteUrl.match(/https?:\/\/([^/]+)/)?.[1] || "";
            const spoToken = domain ? await getSpoTokenForDomain(domain) : null;

            const [driveResult, analyticsResult, groupOwnersResult, lockStateResult, propBagResult] = await Promise.allSettled([
              fetchSiteDriveOwner(token!, site.id),
              fetchSiteAnalytics(token!, site.id),
              fetchSiteGroupOwners(token!, site.id),
              spoToken && siteUrl ? fetchSiteLockState(spoToken, siteUrl) : Promise.resolve({ lockState: "Unknown", isArchived: false }),
              spoToken && siteUrl ? fetchSitePropertyBag(spoToken, siteUrl) : Promise.resolve({ properties: {} }),
            ]);
            const lockData = lockStateResult.status === 'fulfilled' ? lockStateResult.value : { lockState: "Unknown", isArchived: false };
            const propBagData = propBagResult.status === 'fulfilled' ? propBagResult.value : { properties: {} };
            const groupOwners = groupOwnersResult.status === 'fulfilled' ? groupOwnersResult.value : { owners: [] };

            let siteAdmins: { id?: string; displayName: string; mail?: string; userPrincipalName?: string }[] | undefined;
            if (spoToken && siteUrl) {
              const adminsResult = await fetchSiteCollectionAdmins(spoToken, siteUrl);
              if (adminsResult.error) {
                console.log(`[site-owners] Error fetching admins for ${siteUrl}: ${adminsResult.error}`);
              }
              if (adminsResult.admins.length > 0) {
                siteAdmins = adminsResult.admins;
                console.log(`[site-owners] ${siteUrl}: found ${adminsResult.admins.length} admin(s): ${adminsResult.admins.map(a => a.displayName).join(', ')}`);
              }
            } else {
              console.log(`[site-owners] No SPO token for ${siteUrl}, skipping admin/owner group fetch`);
            }

            return {
              siteId: site.id,
              driveOwner: driveResult.status === 'fulfilled' ? driveResult.value : {},
              analytics: analyticsResult.status === 'fulfilled' ? analyticsResult.value : {},
              groupOwners,
              siteAdmins,
              lockState: lockData.lockState,
              isArchived: lockData.isArchived === true,
              propertyBag: Object.keys(propBagData.properties).length > 0 ? propBagData.properties : undefined,
            };
          })
        );
        for (const r of results) {
          if (r.status === 'fulfilled') {
            enrichCache.set(r.value.siteId, { driveOwner: r.value.driveOwner, analytics: r.value.analytics, groupOwners: r.value.groupOwners, siteAdmins: r.value.siteAdmins, lockState: r.value.lockState, isArchived: r.value.isArchived, propertyBag: r.value.propertyBag });
          }
        }
      }
    }

    let spoTokenFailed = false;
    for (const [domain, t] of Array.from(spoTokenCache.entries())) {
      if (t === null) {
        spoTokenFailed = true;
      }
    }
    if (spoTokenFailed) {
      permissionWarnings.push({
        area: "SharePoint REST API",
        permission: "Sites.Read.All",
        message: "Could not acquire a SharePoint token. Archive/lock state detection may be incomplete. Ensure the app registration has Sites.Read.All application permission.",
        severity: "warning",
      });
    }

    for (const site of siteResult.sites) {
      const graphSiteIdParts = site.id.split(',');
      const siteGuid = graphSiteIdParts.length >= 2 ? graphSiteIdParts[1].trim() : site.id.trim();

      let usage = usageMap.get(siteGuid.toLowerCase());
      if (!usage && site.webUrl) {
        usage = usageUrlMap.get(normalizeUrl(site.webUrl));
      }
      if (usage) usageMatched++;

      const enriched = enrichCache.get(site.id) || { driveOwner: {}, analytics: {}, groupOwners: { owners: [] }, siteAdmins: undefined, lockState: undefined, isArchived: false };
      const driveOwner = enriched.driveOwner;
      const siteAnalytics = enriched.analytics;
      const groupOwners = enriched.groupOwners;

      const siteType = inferSiteType(usage?.rootWebTemplate, site.siteCollection?.root);

      const workspaceData: Record<string, any> = {
        displayName: site.displayName || 'Untitled Site',
        siteUrl: site.webUrl,
        description: site.description || null,
        tenantConnectionId: req.params.id,
        m365ObjectId: site.id,
        type: siteType,
        siteCreatedDate: site.createdDateTime || null,
        lastContentModifiedDate: site.lastModifiedDateTime || null,
      };

      workspaceData.ownerDisplayName = usage?.ownerDisplayName || driveOwner.ownerDisplayName || null;
      workspaceData.ownerPrincipalName = usage?.ownerPrincipalName || driveOwner.ownerEmail || null;

      {
        const mergedOwners: Array<{ id?: string; displayName: string; mail?: string; userPrincipalName?: string }> = [];
        const seenEmails = new Set<string>();

        if (groupOwners.owners && groupOwners.owners.length > 0) {
          for (const o of groupOwners.owners) {
            const key = (o.mail || o.userPrincipalName || '').toLowerCase();
            if (key && !seenEmails.has(key)) {
              seenEmails.add(key);
              mergedOwners.push({ id: o.id, displayName: o.displayName || '', mail: o.mail, userPrincipalName: o.userPrincipalName });
            }
          }
        }

        if (enriched.siteAdmins && enriched.siteAdmins.length > 0) {
          for (const a of enriched.siteAdmins) {
            const key = (a.mail || a.userPrincipalName || '').toLowerCase();
            if (key && !seenEmails.has(key)) {
              seenEmails.add(key);
              mergedOwners.push(a);
            }
          }
        }

        if (mergedOwners.length > 0) {
          workspaceData.siteOwners = mergedOwners;
          workspaceData.owners = mergedOwners.length;
        }
        console.log(`[site-owners] ${site.webUrl}: groupOwners=${groupOwners.owners?.length || 0}, siteAdmins=${enriched.siteAdmins?.length || 0}, merged=${mergedOwners.length} => ${mergedOwners.map(o => o.displayName).join(', ')}`);
      }

      const storageUsed = usage?.storageUsedBytes ?? driveOwner.storageUsedBytes ?? null;
      const storageAlloc = usage?.storageAllocatedBytes ?? driveOwner.storageAllocatedBytes ?? null;
      workspaceData.storageUsedBytes = storageUsed;
      workspaceData.storageAllocatedBytes = storageAlloc;

      const activityDate = usage?.lastActivityDate || siteAnalytics.lastActivityDate || null;
      workspaceData.lastActivityDate = activityDate;

      if (usage) {
        workspaceData.fileCount = usage.fileCount;
        workspaceData.activeFileCount = usage.activeFileCount;
        workspaceData.pageViewCount = usage.pageViewCount;
        workspaceData.visitedPageCount = usage.visitedPageCount;
        workspaceData.rootWebTemplate = usage.rootWebTemplate || null;
        workspaceData.isDeleted = usage.isDeleted;
        workspaceData.reportRefreshDate = usage.reportRefreshDate || null;
        workspaceData.sensitivityLabelId = usage.sensitivityLabelId || null;
        workspaceData.sharingCapability = usage.externalSharing || null;
      }

      const archiveStatus = site.siteCollection?.archivalDetails?.archiveStatus || null;
      const graphArchived = archiveStatus === 'recentlyArchived' || archiveStatus === 'fullyArchived';

      const spoLockState = enriched.lockState;
      const usageLockState = usage?.lockState;

      workspaceData.isArchived = graphArchived;

      if (graphArchived) {
        workspaceData.lockState = spoLockState && spoLockState !== "Unknown" ? spoLockState : (usageLockState || "Locked");
        console.log(`[bulk-sync] ${site.webUrl} → archived (${archiveStatus}) via Graph archivalDetails`);
      } else if (spoLockState && spoLockState !== "Unknown") {
        workspaceData.lockState = spoLockState;
      } else if (usageLockState) {
        workspaceData.lockState = usageLockState;
      } else {
        workspaceData.lockState = spoLockState === "Unknown" ? "Unknown" : "Unlock";
      }

      if (storageUsed != null) {
        const usedMB = Math.round(storageUsed / (1024 * 1024));
        workspaceData.size = usedMB >= 1024 ? `${(usedMB / 1024).toFixed(1)} GB` : `${usedMB} MB`;
      }

      if (activityDate) {
        const d = new Date(activityDate);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) workspaceData.lastActive = "Today";
        else if (diffDays === 1) workspaceData.lastActive = "Yesterday";
        else if (diffDays <= 7) workspaceData.lastActive = `${diffDays} days ago`;
        else if (diffDays <= 30) workspaceData.lastActive = `${Math.floor(diffDays / 7)} weeks ago`;
        else workspaceData.lastActive = `${Math.floor(diffDays / 30)} months ago`;
      }

      if (usage) {
        if (usage.pageViewCount > 50) workspaceData.usage = "Very High";
        else if (usage.pageViewCount > 20) workspaceData.usage = "High";
        else if (usage.pageViewCount > 5) workspaceData.usage = "Medium";
        else workspaceData.usage = "Low";
      }

      const existing = await storage.getWorkspaceByM365ObjectId(site.id);

      if (enriched.propertyBag && Object.keys(enriched.propertyBag).length > 0) {
        const existingBag = (existing?.propertyBag as Record<string, string>) || {};
        workspaceData.propertyBag = { ...existingBag, ...enriched.propertyBag };
      } else if (existing?.propertyBag) {
        workspaceData.propertyBag = existing.propertyBag;
      }

      workspaceData.spoSyncHash = computeSpoSyncHash({
        sensitivityLabelId: workspaceData.sensitivityLabelId || null,
        propertyBag: workspaceData.propertyBag || null,
      });

      if (existing) {
        const governedFields: (keyof typeof workspaceData)[] = [
          'sensitivityLabelId', 'department', 'costCenter', 'projectCode',
          'projectType', 'sensitivity', 'retentionPolicy',
        ];
        for (const field of governedFields) {
          const incoming = workspaceData[field];
          const current = (existing as any)[field];
          if ((!incoming || incoming === '') && current) {
            console.log(`[sync-preserve] ${existing.displayName}: preserving ${field}="${current}" (sync value was empty)`);
            delete workspaceData[field];
          }
        }
        if (existing.localHash) {
          workspaceData.localHash = existing.localHash;
        }
        await storage.updateWorkspace(existing.id, workspaceData);
      } else {
        await storage.createWorkspace(workspaceData as any);
      }
      upsertedCount++;
    }

    let labelSyncResult: { synced: number; error?: string } = { synced: 0 };
    if (token) {
      try {
        console.log(`[label-sync] Fetching sensitivity labels for tenant ${connection.tenantId}...`);
        const labelResult = await fetchSensitivityLabels(token);
        if (labelResult.error) {
          console.error(`[label-sync] Error from Graph API: ${labelResult.error}`);
          labelSyncResult.error = labelResult.error;
        }
        console.log(`[label-sync] Graph API returned ${labelResult.labels.length} labels`);
        for (const label of labelResult.labels) {
          console.log(`[label-sync]   - ${label.name} (id=${label.id}, site-scope=${label.appliesToGroupsSites}, formats=${(label.contentFormats || []).join(',')})`);
        }
        for (const label of labelResult.labels) {
          await storage.upsertSensitivityLabel({
            tenantId: connection.tenantId,
            labelId: label.id,
            name: label.name,
            description: label.description || null,
            color: label.color || null,
            tooltip: label.tooltip || null,
            sensitivity: label.sensitivity ?? null,
            isActive: label.isActive,
            contentFormats: label.contentFormats || null,
            hasProtection: label.hasProtection,
            parentLabelId: label.parentLabelId || null,
            appliesToGroupsSites: label.appliesToGroupsSites,
          });
          labelSyncResult.synced++;
        }
      } catch (e: any) {
        labelSyncResult.error = e.message;
      }
    }

    let retentionSyncResult: { synced: number; error?: string } = { synced: 0 };
    if (token) {
      try {
        console.log(`[retention-sync] Fetching retention labels for tenant ${connection.tenantId}...`);
        let retResult: Awaited<ReturnType<typeof fetchRetentionLabels>> | null = null;

        const delegatedToken = await getDelegatedTokenForRetention(req.session?.userId, connection.organizationId);
        if (delegatedToken) {
          console.log(`[retention-sync] Using delegated token for retention labels (org: ${connection.organizationId})`);
          retResult = await fetchRetentionLabels(delegatedToken);
        } else {
          console.warn(`[retention-sync] No delegated SSO token available for retention labels. App-only tokens are not supported by Microsoft for this endpoint.`);
          retentionSyncResult.error = "Retention labels require SSO authentication. Sign out and sign back in via SSO to grant the RecordsManagement.Read.All delegated permission.";
        }

        if (retResult?.error) {
          console.error(`[retention-sync] Error from Graph API: ${retResult.error}`);
          retentionSyncResult.error = retResult.error;
        }
        if (retResult && retResult.labels.length > 0) {
          console.log(`[retention-sync] Graph API returned ${retResult.labels.length} retention labels`);
          for (const label of retResult.labels) {
            await storage.upsertRetentionLabel({
              tenantId: connection.tenantId,
              labelId: label.labelId,
              name: label.name,
              description: label.description || null,
              retentionDuration: label.retentionDuration || null,
              retentionAction: label.retentionAction || null,
              behaviorDuringRetentionPeriod: label.behaviorDuringRetentionPeriod || null,
              actionAfterRetentionPeriod: label.actionAfterRetentionPeriod || null,
              isActive: label.isActive,
              isRecordLabel: label.isRecordLabel,
            });
            retentionSyncResult.synced++;
          }
        }
      } catch (e: any) {
        retentionSyncResult.error = e.message;
      }
    }

    let hubSyncResult: { hubSitesFound: number; sitesEnriched: number; method?: string; error?: string } = { hubSitesFound: 0, sitesEnriched: 0 };
    try {
      const allWorkspacesForHub = await storage.getWorkspaces(undefined, req.params.id);
      const normalizeHubUrl = (url: string) => url.toLowerCase().replace(/\/+$/, '');

      let hubDiscoveryDone = false;

      if (token) {
        console.log(`[hub-sync] Trying Graph Search API for hub discovery...`);
        const searchResult = await fetchHubSitesViaSearch(token);

        if (!searchResult.error && searchResult.hubSites.length > 0) {
          hubSyncResult.method = "graph-search";
          hubSyncResult.hubSitesFound = searchResult.hubSites.length;

          for (const hub of searchResult.hubSites) {
            console.log(`[hub-sync] Graph Search found hub: "${hub.displayName}" url=${hub.webUrl} siteCollectionId=${hub.siteCollectionId}`);
          }

          const hubUrlToInfo = new Map<string, { siteCollectionId: string }>();
          for (const hub of searchResult.hubSites) {
            hubUrlToInfo.set(normalizeHubUrl(hub.webUrl), { siteCollectionId: hub.siteCollectionId });
          }

          const graphIdToHubSiteCollectionId = new Map<string, string>();
          searchResult.associations.forEach((hubSiteCollectionId, graphId) => {
            graphIdToHubSiteCollectionId.set(graphId, hubSiteCollectionId);
          });

          console.log(`[hub-sync] Graph Search found ${searchResult.associations.size} hub-associated sites`);

          for (const ws of allWorkspacesForHub) {
            const wsUrl = ws.siteUrl ? normalizeHubUrl(ws.siteUrl) : null;
            const hubInfo = wsUrl ? hubUrlToInfo.get(wsUrl) : null;

            if (hubInfo) {
              await storage.updateWorkspace(ws.id, {
                isHubSite: true,
                hubSiteId: hubInfo.siteCollectionId,
                parentHubSiteId: null,
              } as any);
              hubSyncResult.sitesEnriched++;
              continue;
            }

            const wsM365Id = ws.m365ObjectId?.toLowerCase();
            if (wsM365Id) {
              const hubSiteColId = graphIdToHubSiteCollectionId.get(wsM365Id);
              if (hubSiteColId) {
                const isThisSiteAHub = hubUrlToInfo.has(wsUrl || '');
                await storage.updateWorkspace(ws.id, {
                  isHubSite: isThisSiteAHub,
                  hubSiteId: hubSiteColId,
                  parentHubSiteId: null,
                } as any);
                hubSyncResult.sitesEnriched++;
                continue;
              }
            }

            await storage.updateWorkspace(ws.id, {
              isHubSite: false,
              hubSiteId: null,
              parentHubSiteId: null,
            } as any);
            hubSyncResult.sitesEnriched++;
          }

          hubDiscoveryDone = true;
        } else if (searchResult.error) {
          console.warn(`[hub-sync] Graph Search failed: ${searchResult.error}`);
        } else {
          console.log(`[hub-sync] Graph Search returned 0 hub sites`);
        }
      }

      if (!hubDiscoveryDone) {
        console.log(`[hub-sync] Falling back to SharePoint REST API for hub discovery...`);
        const spoHostFromSites = allWorkspacesForHub
          .map(w => w.siteUrl)
          .filter(Boolean)
          .map(url => { try { return new URL(url!).hostname; } catch { return null; } })
          .find(h => h && h.endsWith('.sharepoint.com'));

        const spoHostDomain = spoHostFromSites || connection.domain;

        try {
          const spoHostForHub = spoHostDomain.includes('.sharepoint.com') ? spoHostDomain : `${spoHostDomain.replace(/\..*$/, '')}.sharepoint.com`;
          const spoToken = await getDelegatedSpoTokenForOrg(spoHostForHub, req.session?.userId, connection.organizationId);
          if (!spoToken) {
            hubSyncResult.error = "No delegated SPO token available for hub site detection. Please sign out and sign back in with SSO.";
            throw new Error(hubSyncResult.error);
          }
          const hubResult = await fetchHubSites(spoToken, spoHostDomain);
          hubSyncResult.method = "spo-rest";

          if (hubResult.error) {
            hubSyncResult.error = hubResult.error;
          }
          hubSyncResult.hubSitesFound = hubResult.hubSites.length;

          const hubUrlToHubInfo = new Map<string, { hubSiteId: string; parentHubSiteId?: string }>();
          for (const h of hubResult.hubSites) {
            hubUrlToHubInfo.set(normalizeHubUrl(h.siteUrl), {
              hubSiteId: h.hubSiteId,
              parentHubSiteId: h.parentHubSiteId,
            });
          }

          for (const ws of allWorkspacesForHub) {
            if (ws.siteUrl) {
              const hubInfo = hubUrlToHubInfo.get(normalizeHubUrl(ws.siteUrl));
              if (hubInfo) {
                await storage.updateWorkspace(ws.id, {
                  isHubSite: true,
                  hubSiteId: hubInfo.hubSiteId,
                  parentHubSiteId: hubInfo.parentHubSiteId || null,
                } as any);
                hubSyncResult.sitesEnriched++;
              }
            }
          }

          const nonHubSites = allWorkspacesForHub.filter(w => w.siteUrl && !hubUrlToHubInfo.has(normalizeHubUrl(w.siteUrl)));
          const HUB_BATCH_SIZE = 5;
          for (let i = 0; i < nonHubSites.length; i += HUB_BATCH_SIZE) {
            const batch = nonHubSites.slice(i, i + HUB_BATCH_SIZE);
            const results = await Promise.allSettled(
              batch.map(async (ws) => {
                const assoc = await fetchSiteHubAssociation(spoToken, ws.siteUrl!);
                return { workspaceId: ws.id, displayName: ws.displayName, ...assoc };
              })
            );
            for (const r of results) {
              if (r.status === 'fulfilled' && !r.value.error) {
                await storage.updateWorkspace(r.value.workspaceId, {
                  isHubSite: r.value.isHubSite,
                  hubSiteId: r.value.hubSiteId,
                  parentHubSiteId: null,
                } as any);
                hubSyncResult.sitesEnriched++;
              }
            }
          }
        } catch (spoErr: any) {
          hubSyncResult.error = spoErr.message;
        }
      }
    } catch (e: any) {
      hubSyncResult.error = hubSyncResult.error || e.message;
    }

    if (usageResult.error) {
      permissionWarnings.push({
        area: "Usage Report",
        permission: "Reports.Read.All",
        message: `Usage report unavailable: ${usageResult.error}. Storage, file counts, and activity data may be missing. Ensure Reports.Read.All application permission is granted.`,
        severity: "warning",
      });
    }
    if (labelSyncResult.error) {
      permissionWarnings.push({
        area: "Sensitivity Labels",
        permission: "InformationProtectionPolicy.Read.All",
        message: `Sensitivity label sync failed: ${labelSyncResult.error}. Ensure InformationProtectionPolicy.Read.All application permission is granted in Entra.`,
        severity: "warning",
      });
    }
    if (retentionSyncResult.error) {
      permissionWarnings.push({
        area: "Retention Labels",
        permission: "RecordsManagement.Read.All (delegated)",
        message: `Retention label sync failed: ${retentionSyncResult.error}`,
        severity: "warning",
      });
    }
    if (hubSyncResult.error) {
      permissionWarnings.push({
        area: "Hub Sites",
        permission: "Sites.Read.All",
        message: `Hub site discovery encountered an error: ${hubSyncResult.error}`,
        severity: "warning",
      });
    }

    let policyEvalCount = 0;
    let writebackPendingCount = 0;
    try {
      if (connection.organizationId) {
        const allSyncedWorkspaces = await storage.getWorkspaces(undefined, req.params.id);
        for (const ws of allSyncedWorkspaces) {
          const evalResult = await evaluateAllPoliciesForWorkspace(ws, connection.organizationId, connection.tenantId, "[policy-eval]");
          policyEvalCount++;

          if (evalResult.bagChanged && ws.siteUrl) {
            const refreshedWs = await storage.getWorkspace(ws.id);
            if (refreshedWs) {
              const newLocalHash = computeWritebackHash({
                sensitivityLabelId: refreshedWs.sensitivityLabelId,
                department: refreshedWs.department,
                costCenter: refreshedWs.costCenter,
                projectCode: refreshedWs.projectCode,
                propertyBag: refreshedWs.propertyBag,
              });
              await storage.updateWorkspace(ws.id, { localHash: newLocalHash } as any);
            }
            writebackPendingCount++;
          }
        }
        console.log(`[policy-eval] Evaluated ${policyEvalCount} workspaces against all active policies`);
        if (writebackPendingCount > 0) {
          console.log(`[policy-eval] ${writebackPendingCount} workspaces have pending property bag writebacks`);
        }
      } else {
        console.log(`[policy-eval] No organization linked to tenant, skipping auto-evaluation`);
      }
    } catch (evalErr: any) {
      console.error(`[policy-eval] Error during post-sync evaluation: ${evalErr.message}`);
    }

    let librarySyncResult: { enumerated: number; totalLibraries: number; skipped: number; error?: string } = { enumerated: 0, totalLibraries: 0, skipped: 0 };
    if (token) {
      try {
        console.log(`[library-enum] Starting lightweight library enumeration for ${upsertedCount} workspaces...`);
        const allSyncedWorkspaces = await storage.getWorkspaces(undefined, req.params.id);
        const LIBRARY_BATCH_SIZE = 10;
        for (let i = 0; i < allSyncedWorkspaces.length; i += LIBRARY_BATCH_SIZE) {
          const batch = allSyncedWorkspaces.slice(i, i + LIBRARY_BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map(async (ws) => {
              if (!ws.m365ObjectId) return { wsId: ws.id, libraries: [] };
              const result = await enumerateSiteDocumentLibraries(token!, ws.m365ObjectId);
              return { wsId: ws.id, libraries: result.libraries, error: result.error };
            })
          );
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value.libraries.length > 0) {
              const existingLibs = await storage.getDocumentLibraries(r.value.wsId);
              const existingMap = new Map(existingLibs.map(l => [l.m365ListId, l]));
              for (const lib of r.value.libraries) {
                const existing = existingMap.get(lib.listId);
                if (existing && existing.lastModifiedAt === lib.lastModifiedAt) {
                  librarySyncResult.skipped++;
                  continue;
                }
                await storage.upsertDocumentLibrary({
                  workspaceId: r.value.wsId,
                  tenantConnectionId: req.params.id,
                  m365ListId: lib.listId,
                  displayName: lib.displayName,
                  description: null,
                  webUrl: null,
                  template: lib.template,
                  itemCount: lib.itemCount,
                  storageUsedBytes: null,
                  sensitivityLabelId: null,
                  isDefaultDocLib: false,
                  hidden: lib.hidden,
                  lastModifiedAt: lib.lastModifiedAt,
                  createdGraphAt: null,
                  lastSyncAt: new Date(),
                });
                librarySyncResult.totalLibraries++;
              }
              librarySyncResult.enumerated++;
            }
          }
        }
        console.log(`[library-enum] Enumerated ${librarySyncResult.totalLibraries} libraries across ${librarySyncResult.enumerated} workspaces (${librarySyncResult.skipped} unchanged, skipped)`);
      } catch (e: any) {
        console.error(`[library-enum] Error: ${e.message}`);
        librarySyncResult.error = e.message;
      }
    }

    let contentTypeSyncResult: { synced: number; hubSitesScanned: number; error?: string } = { synced: 0, hubSitesScanned: 0 };
    if (token) {
      try {
        console.log(`[content-type-sync] Fetching content types for tenant ${connection.tenantId}...`);
        const hubWorkspaces = await storage.getWorkspaces(undefined, req.params.id);
        const hubSiteWorkspaces = hubWorkspaces.filter(w => w.isHubSite && w.m365ObjectId);
        if (hubSiteWorkspaces.length === 0) {
          console.log(`[content-type-sync] No hub sites found, skipping content type sync`);
        }
        const seenContentTypeIds = new Set<string>();
        for (const hubWs of hubSiteWorkspaces) {
          try {
            const result = await fetchContentTypes(token, hubWs.m365ObjectId!);
            if (result.error) {
              console.warn(`[content-type-sync] Error fetching content types for site ${hubWs.displayName}: ${result.error}`);
              contentTypeSyncResult.error = result.error;
              continue;
            }
            contentTypeSyncResult.hubSitesScanned++;
            for (const ct of result.contentTypes) {
              if (seenContentTypeIds.has(ct.id)) continue;
              seenContentTypeIds.add(ct.id);
              await storage.upsertContentType({
                tenantConnectionId: req.params.id,
                contentTypeId: ct.id,
                name: ct.name,
                group: ct.group || null,
                description: ct.description || null,
                isHub: true,
                subscribedSiteCount: 0,
              });
              contentTypeSyncResult.synced++;
            }
          } catch (ctErr: any) {
            console.error(`[content-type-sync] Error for hub site ${hubWs.displayName}: ${ctErr.message}`);
          }
        }
        console.log(`[content-type-sync] Synced ${contentTypeSyncResult.synced} content types from ${contentTypeSyncResult.hubSitesScanned} hub sites`);
      } catch (e: any) {
        contentTypeSyncResult.error = e.message;
      }
    }

    // Refresh the library/site usage rollups on content_types. Cheap — the
    // heavy lifting (walking libraries) already happened in the IA sync flow;
    // this just aggregates what's already in library_content_types.
    try {
      await storage.updateContentTypeUsageCounts(req.params.id);
    } catch (rollupErr: any) {
      console.warn(`[content-type-sync] Usage count rollup failed: ${rollupErr.message}`);
    }

    if (contentTypeSyncResult.error) {
      permissionWarnings.push({
        area: "Content Types",
        permission: "Sites.Read.All",
        message: `Content type sync failed: ${contentTypeSyncResult.error}`,
        severity: "warning",
      });
    }

    await storage.updateTenantConnection(req.params.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: permissionWarnings.some(w => w.severity === "error") ? "SUCCESS_WITH_ERRORS" : permissionWarnings.length > 0 ? "SUCCESS_WITH_WARNINGS" : "SUCCESS",
      // When cap is applied, store the discovered total so the UI can display "Showing N of M sites"
      lastSyncSiteCount: sitesCapApplied ? sitesDiscoveredTotal : siteResult.sites.length,
      status: "ACTIVE",
      consentGranted: true,
    });

    await storage.createAuditEntry({
      userId: (req as AuthenticatedRequest).user?.id || null,
      userEmail: (req as AuthenticatedRequest).user?.email || null,
      action: 'TENANT_SYNC_COMPLETED',
      resource: 'tenant_connection',
      resourceId: req.params.id,
      organizationId: (req as AuthenticatedRequest).user?.organizationId || null,
      tenantConnectionId: req.params.id,
      details: {
        tenantName: connection.tenantName,
        sitesFound: siteResult.sites.length,
        upserted: upsertedCount,
        warningCount: permissionWarnings.length,
      },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    res.json({
      success: true,
      sitesFound: siteResult.sites.length,
      sitesDiscovered: sitesDiscoveredTotal,
      sitesCapApplied,
      upserted: upsertedCount,
      usageReportRows: usageResult.report.length,
      usageMatched,
      driveEnriched: enrichCache.size,
      usageReportError: usageResult.error || null,
      enrichErrors: enrichErrors.length > 0 ? enrichErrors : undefined,
      sensitivityLabels: labelSyncResult,
      retentionLabels: retentionSyncResult,
      hubSites: hubSyncResult,
      documentLibraries: librarySyncResult,
      contentTypes: contentTypeSyncResult,
      policyEvaluation: policyEvalCount > 0 ? { evaluated: policyEvalCount } : undefined,
      writebackPending: writebackPendingCount > 0 ? { count: writebackPendingCount, message: `${writebackPendingCount} workspace(s) have policy outcome changes that need to be written back to SharePoint.` } : undefined,
      permissionWarnings: permissionWarnings.length > 0 ? permissionWarnings : undefined,
    });
  } catch (err: any) {
    await storage.updateTenantConnection(req.params.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: `ERROR: ${err.message}`,
    });
    await storage.createAuditEntry({
      userId: (req as AuthenticatedRequest).user?.id || null,
      userEmail: (req as AuthenticatedRequest).user?.email || null,
      action: 'TENANT_SYNC_FAILED',
      resource: 'tenant_connection',
      resourceId: req.params.id,
      organizationId: (req as AuthenticatedRequest).user?.organizationId || null,
      tenantConnectionId: req.params.id,
      details: { tenantName: connection.tenantName, error: err.message },
      result: 'FAILURE',
      ipAddress: req.ip || null,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/api/admin/tenants/:id/sync-libraries", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const allowedTenantIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.id)) {
      return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
    }
    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ error: "Tenant not found" });

    let token: string | null = null;

    const clientId = connection.clientId;
    const clientSecret = clientId ? getEffectiveClientSecret(connection) : undefined;
    if (clientId && clientSecret) {
      try { token = await getAppToken(connection.tenantId, clientId, clientSecret); } catch {}
    }

    if (!token) {
      token = await getDelegatedTokenForRetention(req.session?.userId, connection.organizationId);
    }

    if (!token) return res.status(500).json({ error: "No Graph API token available. Please sign in with SSO." });

    const allWorkspaces = await storage.getWorkspaces(undefined, req.params.id);
    console.log(`[library-sync] Starting full library sync for ${allWorkspaces.length} workspaces in tenant ${connection.tenantName}...`);

    const result = { synced: 0, totalLibraries: 0, skipped: 0, errors: 0 };
    const BATCH_SIZE = 5;

    for (let i = 0; i < allWorkspaces.length; i += BATCH_SIZE) {
      const batch = allWorkspaces.slice(i, i + BATCH_SIZE);
      console.log(`[library-sync] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allWorkspaces.length / BATCH_SIZE)} (${batch.map(w => w.displayName).join(', ')})`);
      const batchResults = await Promise.allSettled(
        batch.map(async (ws) => {
          if (!ws.m365ObjectId) return { wsId: ws.id, libraries: [], skipped: 0 };
          const libResult = await fetchSiteDocumentLibraries(token, ws.m365ObjectId);
          if (libResult.error) return { wsId: ws.id, libraries: [], error: libResult.error, skipped: 0 };

          const existingLibs = await storage.getDocumentLibraries(ws.id);
          const existingMap = new Map(existingLibs.map(l => [l.m365ListId, l]));
          let upserted = 0;
          let skippedCount = 0;

          for (const lib of libResult.libraries) {
            const existing = existingMap.get(lib.listId);
            const dataStale = existing && (
              (existing.itemCount === 0 || existing.itemCount == null) ||
              existing.storageUsedBytes == null ||
              existing.webUrl == null
            );
            if (existing && !dataStale && existing.lastModifiedAt === lib.lastModifiedAt) {
              skippedCount++;
              continue;
            }
            await storage.upsertDocumentLibrary({
              workspaceId: ws.id,
              tenantConnectionId: req.params.id,
              m365ListId: lib.listId,
              displayName: lib.displayName,
              description: lib.description,
              webUrl: lib.webUrl,
              template: lib.template,
              itemCount: lib.itemCount,
              storageUsedBytes: lib.storageUsedBytes,
              sensitivityLabelId: lib.sensitivityLabelId,
              isDefaultDocLib: lib.isDefaultDocLib,
              hidden: lib.hidden,
              lastModifiedAt: lib.lastModifiedAt,
              createdGraphAt: lib.createdAt,
              lastSyncAt: new Date(),
            });
            upserted++;
          }
          return { wsId: ws.id, libraries: libResult.libraries, upserted, skipped: skippedCount };
        })
      );

      for (const r of batchResults) {
        if (r.status === 'fulfilled') {
          if ('error' in r.value && r.value.error) {
            result.errors++;
            console.log(`[library-sync] Error for workspace ${r.value.wsId}: ${r.value.error}`);
          } else {
            result.synced++;
            result.totalLibraries += (r.value as any).upserted || 0;
            result.skipped += r.value.skipped;
          }
        } else {
          result.errors++;
          console.log(`[library-sync] Rejected: ${r.reason?.message || r.reason}`);
        }
      }
    }

    console.log(`[library-sync] Complete: ${result.totalLibraries} libraries synced across ${result.synced} workspaces (${result.skipped} unchanged, ${result.errors} errors)`);

    const LARGE_ITEMS_THRESHOLD = Number(req.query.largeItemsThreshold) || 50000;
    const VERSION_SPRAWL_THRESHOLD = Number(req.query.versionSprawlThreshold) || 100000;
    let flaggedCount = 0;

    try {
      console.log(`[library-sync] Applying threshold flags: largeItems>${LARGE_ITEMS_THRESHOLD}, versionSprawl>${VERSION_SPRAWL_THRESHOLD}`);
      const allLibraries = await storage.getDocumentLibrariesByTenant(req.params.id);
      for (const lib of allLibraries) {
        const flaggedLargeItems = (lib.itemCount || 0) > LARGE_ITEMS_THRESHOLD;
        const flaggedVersionSprawl = (lib.storageUsedBytes || 0) > VERSION_SPRAWL_THRESHOLD * 1024 * 1024;
        if (flaggedLargeItems !== lib.flaggedLargeItems || flaggedVersionSprawl !== lib.flaggedVersionSprawl) {
          await storage.upsertDocumentLibrary({
            workspaceId: lib.workspaceId,
            tenantConnectionId: lib.tenantConnectionId,
            m365ListId: lib.m365ListId,
            displayName: lib.displayName,
            description: lib.description,
            webUrl: lib.webUrl,
            template: lib.template,
            itemCount: lib.itemCount,
            storageUsedBytes: lib.storageUsedBytes,
            sensitivityLabelId: lib.sensitivityLabelId,
            isDefaultDocLib: lib.isDefaultDocLib,
            hidden: lib.hidden,
            lastModifiedAt: lib.lastModifiedAt,
            createdGraphAt: lib.createdGraphAt,
            lastSyncAt: lib.lastSyncAt,
            flaggedLargeItems,
            flaggedVersionSprawl,
          });
          if (flaggedLargeItems || flaggedVersionSprawl) flaggedCount++;
        }
      }
      console.log(`[library-sync] Flagging complete: ${flaggedCount} libraries flagged for large items or version sprawl`);
    } catch (flagErr: any) {
      console.error(`[library-sync] Flagging error: ${flagErr.message}`);
    }

    res.json({
      success: true,
      workspacesProcessed: allWorkspaces.length,
      workspacesSynced: result.synced,
      librariesSynced: result.totalLibraries,
      librariesSkipped: result.skipped,
      errors: result.errors,
      flagged: flaggedCount,
    });
  } catch (err: any) {
    console.error(`[library-sync] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/api/admin/tenants/:id/content-types", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const types = await storage.getContentTypes(req.params.id);
    res.json(types);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Information Architecture ───────────────────────────────────────────────
// Walks all visible libraries for a tenant, persists per-library content types
// and columns into library_content_types / library_columns with derived scope,
// then refreshes content_types usage rollups. Safe to run standalone or as
// part of the main tenant sync.

function classifyCtScope(
  contentTypeId: string,
  isInherited: boolean,
  hubCtIds: Set<string>,
): 'HUB' | 'SITE' | 'LIBRARY' {
  if (hubCtIds.has(contentTypeId)) return 'HUB';
  if (isInherited) return 'SITE';
  return 'LIBRARY';
}

router.post("/api/admin/tenants/:id/sync-ia", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const allowedTenantIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.id)) {
      return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
    }
    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ error: "Tenant not found" });

    let token: string | null = null;
    const clientId = connection.clientId;
    const clientSecret = clientId ? getEffectiveClientSecret(connection) : undefined;
    if (clientId && clientSecret) {
      try { token = await getAppToken(connection.tenantId, clientId, clientSecret); } catch {}
    }
    if (!token) {
      token = await getDelegatedTokenForRetention(req.session?.userId, connection.organizationId);
    }
    if (!token) return res.status(500).json({ error: "No Graph API token available. Please sign in with SSO." });

    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'IA_SYNC_STARTED',
      resource: 'tenant_connection',
      resourceId: req.params.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: req.params.id,
      details: { tenantName: connection.tenantName },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    // Pre-load known hub content-type IDs so we can classify library CTs as HUB.
    const hubContentTypes = await storage.getContentTypes(req.params.id);
    const hubCtIds = new Set(hubContentTypes.filter(c => c.isHub).map(c => c.contentTypeId));

    const allLibraries = await storage.getDocumentLibrariesByTenant(req.params.id);
    const visibleLibraries = allLibraries.filter(l => !l.hidden);
    const byWorkspace = new Map<string, typeof visibleLibraries>();
    for (const lib of visibleLibraries) {
      const arr = byWorkspace.get(lib.workspaceId) || [];
      arr.push(lib);
      byWorkspace.set(lib.workspaceId, arr);
    }
    const workspaceIds = Array.from(byWorkspace.keys());
    console.log(`[ia-sync] Starting IA sync for ${visibleLibraries.length} libraries across ${workspaceIds.length} workspaces`);

    const result = {
      workspacesProcessed: 0,
      librariesProcessed: 0,
      contentTypesUpserted: 0,
      columnsUpserted: 0,
      errors: 0,
    };

    const BATCH_SIZE = 5;
    for (let i = 0; i < workspaceIds.length; i += BATCH_SIZE) {
      const batch = workspaceIds.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map(async (wsId) => {
        const ws = await storage.getWorkspace(wsId);
        if (!ws?.m365ObjectId) return;
        const graphSiteId = ws.m365ObjectId;

        // Load the site's site-columns once so we can tag library columns as SITE vs LIBRARY.
        // Page through all results to handle sites with >200 columns.
        const siteColumnNames = new Set<string>();
        try {
          let pageUrl: string | null =
            `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/columns?$select=id,name&$top=200`;
          while (pageUrl) {
            const sres = await fetch(pageUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (!sres.ok) break;
            const sdata = await sres.json();
            for (const sc of sdata.value || []) {
              if (sc.name) siteColumnNames.add(sc.name);
            }
            pageUrl = sdata['@odata.nextLink'] || null;
          }
        } catch (e: any) {
          console.warn(`[ia-sync] Could not fetch site columns for ${graphSiteId}: ${e.message}`);
        }

        const libs = byWorkspace.get(wsId) || [];
        for (const lib of libs) {
          try {
            const details = await fetchLibraryDetails(token, graphSiteId, lib.m365ListId);
            if (details.error) {
              result.errors++;
              console.warn(`[ia-sync] fetchLibraryDetails error for ${lib.displayName}: ${details.error}`);
              continue;
            }

            // Build the row arrays first, then persist atomically so a mid-write
            // failure never leaves this library with partially-empty IA data.
            const ctRows = details.contentTypes.map(ct => ({
              workspaceId: lib.workspaceId,
              tenantConnectionId: req.params.id,
              documentLibraryId: lib.id,
              contentTypeId: ct.id,
              parentContentTypeId: ct.parentId,
              name: ct.name,
              group: ct.group,
              description: ct.description,
              scope: classifyCtScope(ct.id, ct.isInherited, hubCtIds),
              isBuiltIn: ct.isBuiltIn,
              isInherited: ct.isInherited,
              hidden: ct.hidden,
            }));

            const colRows = details.columns.map(col => ({
              workspaceId: lib.workspaceId,
              tenantConnectionId: req.params.id,
              documentLibraryId: lib.id,
              columnInternalName: col.name,
              displayName: col.displayName,
              columnType: col.type,
              columnGroup: col.columnGroup,
              description: col.description,
              scope: (siteColumnNames.has(col.name) ? 'SITE' : 'LIBRARY') as 'SITE' | 'LIBRARY',
              isCustom: col.isCustom,
              isSyntexManaged: col.isSyntexManaged,
              isSealed: col.sealed,
              isReadOnly: col.readOnly,
              isIndexed: col.indexed,
              isRequired: col.required,
            }));

            const counts = await storage.replaceLibraryIaData(lib.id, ctRows, colRows);
            result.contentTypesUpserted += counts.contentTypesCount;
            result.columnsUpserted += counts.columnsCount;

            result.librariesProcessed++;
          } catch (libErr: any) {
            result.errors++;
            console.error(`[ia-sync] Library ${lib.displayName} failed: ${libErr.message}`);
          }
        }
        result.workspacesProcessed++;
      }));
    }

    await storage.updateContentTypeUsageCounts(req.params.id);
    console.log(`[ia-sync] Complete: ${result.librariesProcessed} libraries, ${result.contentTypesUpserted} CTs, ${result.columnsUpserted} columns, ${result.errors} errors`);

    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'IA_SYNC_COMPLETED',
      resource: 'tenant_connection',
      resourceId: req.params.id,
      organizationId: req.user?.organizationId || null,
      tenantConnectionId: req.params.id,
      details: result,
      result: result.errors === 0 ? 'SUCCESS' : 'PARTIAL',
      ipAddress: req.ip || null,
    });

    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error(`[ia-sync] Error: ${err.message}`);
    try {
      await storage.createAuditEntry({
        userId: req.user?.id || null,
        userEmail: req.user?.email || null,
        action: 'IA_SYNC_FAILED',
        resource: 'tenant_connection',
        resourceId: req.params.id,
        organizationId: req.user?.organizationId || null,
        tenantConnectionId: req.params.id,
        details: { error: err.message },
        result: 'FAILURE',
        ipAddress: req.ip || null,
      });
    } catch { /* ignore audit write errors */ }
    res.status(500).json({ success: false, error: err.message });
  }
});

// Content type IDs that are always excluded from IA reporting.
//   - 0x0101 = the base Document content type. Every document library on Earth
//     has this applied, so reporting on it is noise ("as pervasive as sand on
//     a beach"). Custom CTs derived from Document have a longer ID like
//     0x0101006EAE... and are still included.
const EXCLUDED_CONTENT_TYPE_IDS = new Set<string>(['0x0101']);

function isExcludedContentType(contentTypeId: string): boolean {
  return EXCLUDED_CONTENT_TYPE_IDS.has(contentTypeId);
}

// Shared shape for per-library cross-references returned by IA endpoints.
type IaLibraryRef = {
  libraryId: string;
  libraryName: string;
  workspaceId: string;
  workspaceName: string;
  workspaceType: string;
  webUrl: string | null;
};

// Build a (libraryId → IaLibraryRef) lookup for a tenant. Used by both
// /ia/content-types and /ia/columns so the join logic exists exactly once.
function buildLibraryRefMap(
  libraries: Array<{ id: string; displayName: string; workspaceId: string; webUrl: string | null }>,
  workspaces: Array<{ id: string; displayName: string; type: string }>,
): Map<string, IaLibraryRef> {
  const workspaceById = new Map(workspaces.map(w => [w.id, w]));
  const result = new Map<string, IaLibraryRef>();
  for (const lib of libraries) {
    const ws = workspaceById.get(lib.workspaceId);
    result.set(lib.id, {
      libraryId: lib.id,
      libraryName: lib.displayName,
      workspaceId: lib.workspaceId,
      workspaceName: ws?.displayName ?? '(unknown site)',
      workspaceType: ws?.type ?? '',
      webUrl: lib.webUrl ?? null,
    });
  }
  return result;
}

// Aggregated content-type view across the tenant. Cross-references each CT
// with the libraries (and workspaces) it is attached to so the UI can show
// WHERE the type is actually used rather than just a count.
//
// Filtering rules (driven by product requirements):
//   1. The base Document content type (0x0101) is always excluded.
//   2. Out-of-the-box CTs that are defined at hub/tenant level but NOT attached
//      to any document library are excluded as noise. Only CTs actually applied
//      to a library appear in this list. (Custom CTs that ARE attached still
//      show, built-in CTs that ARE attached still show — filtering them further
//      is a UI concern via the `isBuiltIn` flag on each row.)
router.get("/api/admin/tenants/:id/ia/content-types", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const allowedTenantIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.id)) {
      return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
    }

    const [libraryCts, libraries, workspaceRows] = await Promise.all([
      storage.getLibraryContentTypesByTenant(req.params.id),
      storage.getDocumentLibrariesByTenant(req.params.id),
      storage.getWorkspaces(undefined, req.params.id),
    ]);

    const libraryRefById = buildLibraryRefMap(libraries, workspaceRows);

    type CtAgg = {
      // All contentTypeIds seen for this scope::name rollup. Locally-defined
      // CTs often have different IDs across libraries even though they share a
      // name, so we collect every ID rather than keeping just the first.
      contentTypeIds: Set<string>;
      name: string;
      group: string | null;
      scope: 'HUB' | 'SITE' | 'LIBRARY';
      description: string | null;
      isBuiltIn: boolean;
      libraryRefs: Map<string, IaLibraryRef>;
      workspaceIds: Set<string>;
    };

    // Aggregate library CTs by scope + name so locally-defined CTs (which share
    // a name across libraries but have different contentTypeIds) still roll up.
    const aggByKey = new Map<string, CtAgg>();
    for (const lct of libraryCts) {
      if (isExcludedContentType(lct.contentTypeId)) continue;

      const ref = libraryRefById.get(lct.documentLibraryId);
      if (!ref) continue; // orphan CT row, library was deleted — skip

      const key = `${lct.scope}::${lct.name}`;
      const existing = aggByKey.get(key);
      if (existing) {
        existing.contentTypeIds.add(lct.contentTypeId);
        existing.libraryRefs.set(lct.documentLibraryId, ref);
        existing.workspaceIds.add(lct.workspaceId);
      } else {
        aggByKey.set(key, {
          contentTypeIds: new Set([lct.contentTypeId]),
          name: lct.name,
          group: lct.group,
          scope: lct.scope as 'HUB' | 'SITE' | 'LIBRARY',
          description: lct.description,
          isBuiltIn: lct.isBuiltIn,
          libraryRefs: new Map([[lct.documentLibraryId, ref]]),
          workspaceIds: new Set([lct.workspaceId]),
        });
      }
    }

    const result = Array.from(aggByKey.values())
      .map(r => {
        const libs = Array.from(r.libraryRefs.values())
          .sort((a, b) => a.libraryName.localeCompare(b.libraryName));
        return {
          contentTypeIds: Array.from(r.contentTypeIds).sort(),
          name: r.name,
          group: r.group,
          scope: r.scope,
          description: r.description,
          isBuiltIn: r.isBuiltIn,
          libraryUsageCount: libs.length,
          siteUsageCount: r.workspaceIds.size,
          libraries: libs,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Aggregated column view across the tenant. Each row cross-references the
// libraries the column is present in AND the content types attached to those
// libraries — since the DB does not track column→CT mapping directly, the CT
// list for a column is derived from "CTs present in every library where this
// column appears" (honest approximation: a CT that covers all observations of
// the column is a likely definer, though not a guarantee).
router.get("/api/admin/tenants/:id/ia/columns", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const allowedTenantIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.id)) {
      return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
    }

    const [rows, libraryCts, libraries, workspaceRows] = await Promise.all([
      storage.getLibraryColumnsByTenant(req.params.id),
      storage.getLibraryContentTypesByTenant(req.params.id),
      storage.getDocumentLibrariesByTenant(req.params.id),
      storage.getWorkspaces(undefined, req.params.id),
    ]);

    const libraryRefById = buildLibraryRefMap(libraries, workspaceRows);

    type CtRef = {
      // All IDs observed for this scope::name key across merged libraries.
      // Same-name CTs with different IDs (locally-defined variants) are
      // accumulated here so no ID is arbitrarily discarded. A Set is used
      // for O(1) deduplication during merge.
      contentTypeIds: Set<string>;
      name: string;
      group: string | null;
      scope: 'HUB' | 'SITE' | 'LIBRARY';
      isBuiltIn: boolean;
    };

    // Precompute once per library: the Set of CT keys and the Map of key→CtRef
    // we'll share across every column row that belongs to that library. This
    // turns the aggregation from O(rows * ctsPerLib) into O(libraries * ctsPerLib + rows).
    type LibCtIndex = { keys: Set<string>; refs: Map<string, CtRef> };
    const ctIndexByLibrary = new Map<string, LibCtIndex>();
    for (const lct of libraryCts) {
      if (isExcludedContentType(lct.contentTypeId)) continue;
      const ctKey = `${lct.scope}::${lct.name}`;
      let idx = ctIndexByLibrary.get(lct.documentLibraryId);
      if (!idx) {
        idx = { keys: new Set<string>(), refs: new Map<string, CtRef>() };
        ctIndexByLibrary.set(lct.documentLibraryId, idx);
      }
      idx.keys.add(ctKey);
      const existing = idx.refs.get(ctKey);
      if (existing) {
        // Accumulate IDs for same-name CTs that have different contentTypeIds.
        existing.contentTypeIds.add(lct.contentTypeId);
      } else {
        idx.refs.set(ctKey, {
          contentTypeIds: new Set([lct.contentTypeId]),
          name: lct.name,
          group: lct.group,
          scope: lct.scope as 'HUB' | 'SITE' | 'LIBRARY',
          isBuiltIn: lct.isBuiltIn,
        });
      }
    }
    const EMPTY_LIB_CT_INDEX: LibCtIndex = { keys: new Set(), refs: new Map() };

    type ColAgg = {
      columnInternalName: string;
      displayName: string;
      columnType: string;
      columnGroup: string | null;
      scope: 'SITE' | 'LIBRARY';
      isCustom: boolean;
      isSyntexManaged: boolean;
      libraryRefs: Map<string, IaLibraryRef>;
      workspaceIds: Set<string>;
      // Per-library CT key set references (shared across rows — do not mutate).
      // Intersected at the end to find the likely CT definers.
      ctKeySetsPerLibrary: Array<Set<string>>;
      // Lookup from key → CtRef so we can rehydrate after the intersection.
      ctRefByKey: Map<string, CtRef>;
    };

    // Group by internalName + type so same name/type rolls up.
    const byKey = new Map<string, ColAgg>();
    for (const c of rows) {
      const ref = libraryRefById.get(c.documentLibraryId);
      if (!ref) continue;

      const libIdx = ctIndexByLibrary.get(c.documentLibraryId) ?? EMPTY_LIB_CT_INDEX;
      const key = `${c.columnInternalName}::${c.columnType}`;
      const existing = byKey.get(key);
      if (existing) {
        // libraryRefs is a Map keyed by library id — duplicate rows for the
        // same (column, library) collapse naturally, so we only push the
        // shared CT set once per library.
        if (!existing.libraryRefs.has(c.documentLibraryId)) {
          existing.libraryRefs.set(c.documentLibraryId, ref);
          existing.ctKeySetsPerLibrary.push(libIdx.keys);
          // Merge CT refs: accumulate contentTypeIds for the same key rather
          // than overwriting so we never lose IDs from earlier libraries.
          libIdx.refs.forEach((incoming, k) => {
            const existingRef = existing.ctRefByKey.get(k);
            if (existingRef) {
              incoming.contentTypeIds.forEach(id => existingRef.contentTypeIds.add(id));
            } else {
              existing.ctRefByKey.set(k, incoming);
            }
          });
        }
        existing.workspaceIds.add(c.workspaceId);
        if (c.scope === 'SITE') existing.scope = 'SITE';
      } else {
        byKey.set(key, {
          columnInternalName: c.columnInternalName,
          displayName: c.displayName,
          columnType: c.columnType,
          columnGroup: c.columnGroup,
          scope: c.scope as 'SITE' | 'LIBRARY',
          isCustom: c.isCustom,
          isSyntexManaged: c.isSyntexManaged,
          libraryRefs: new Map([[c.documentLibraryId, ref]]),
          workspaceIds: new Set([c.workspaceId]),
          ctKeySetsPerLibrary: [libIdx.keys],
          ctRefByKey: new Map(libIdx.refs),
        });
      }
    }

    const result = Array.from(byKey.values())
      .map(r => {
        const libs = Array.from(r.libraryRefs.values())
          .sort((a, b) => a.libraryName.localeCompare(b.libraryName));

        // The "likely defining content type" set is the intersection of the
        // per-library CT sets — CTs present in EVERY library the column lives
        // in are likely the ones defining it. Iterate the smallest set first
        // and short-circuit once the intersection is empty.
        const sortedSets = r.ctKeySetsPerLibrary.slice().sort((a, b) => a.size - b.size);
        let likelyCtKeys = new Set<string>(sortedSets[0] ? Array.from(sortedSets[0]) : []);
        for (let i = 1; i < sortedSets.length && likelyCtKeys.size > 0; i++) {
          const next = sortedSets[i];
          const intersected = new Set<string>();
          likelyCtKeys.forEach((k) => {
            if (next.has(k)) intersected.add(k);
          });
          likelyCtKeys = intersected;
        }

        const likelyCts: CtRef[] = [];
        const otherCts: CtRef[] = [];
        r.ctRefByKey.forEach((v, k) => {
          if (likelyCtKeys.has(k)) likelyCts.push(v);
          else otherCts.push(v);
        });
        likelyCts.sort((a, b) => a.name.localeCompare(b.name));
        otherCts.sort((a, b) => a.name.localeCompare(b.name));

        // Serialize CtRef: convert contentTypeIds Set to a sorted array for JSON output.
        const serializeCtRef = (ct: CtRef) => ({
          contentTypeIds: Array.from(ct.contentTypeIds).sort(),
          name: ct.name,
          group: ct.group,
          scope: ct.scope,
          isBuiltIn: ct.isBuiltIn,
        });

        return {
          columnInternalName: r.columnInternalName,
          displayName: r.displayName,
          columnType: r.columnType,
          columnGroup: r.columnGroup,
          scope: r.scope,
          isCustom: r.isCustom,
          isSyntexManaged: r.isSyntexManaged,
          libraryUsageCount: libs.length,
          siteUsageCount: r.workspaceIds.size,
          libraries: libs,
          likelyContentTypes: likelyCts.map(serializeCtRef),
          otherContentTypes: otherCts.map(serializeCtRef),
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// IA anti-pattern analyzers. Four findings:
//   1. localCtDuplicatesHub    — LIBRARY-scope CTs whose name matches a HUB CT
//   2. columnPromotionCandidates — library columns in ≥3 libraries across ≥2 sites
//   3. librariesWithoutCustomCt — libraries whose CTs are all built-in
//   4. columnNameCollisions    — same displayName, different columnType
router.get("/api/admin/tenants/:id/ia/patterns", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const allowedTenantIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.id)) {
      return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
    }

    const [hubCts, libCts, libCols, libraries] = await Promise.all([
      storage.getContentTypes(req.params.id),
      storage.getLibraryContentTypesByTenant(req.params.id),
      storage.getLibraryColumnsByTenant(req.params.id),
      storage.getDocumentLibrariesByTenant(req.params.id),
    ]);

    const libraryById = new Map(libraries.map(l => [l.id, l]));
    const hubNames = new Set(hubCts.filter(c => c.isHub).map(c => c.name.toLowerCase()));

    // 1. Local CTs that shadow a hub CT by name
    const localCtDuplicatesHub = libCts
      .filter(l => l.scope === 'LIBRARY' && hubNames.has(l.name.toLowerCase()))
      .map(l => ({
        libraryId: l.documentLibraryId,
        libraryName: libraryById.get(l.documentLibraryId)?.displayName || '(unknown)',
        contentTypeName: l.name,
        contentTypeId: l.contentTypeId,
      }));

    // 2. Columns appearing in >= 3 libraries across >= 2 sites at LIBRARY scope
    //    (good candidates to promote to site columns)
    type ColRollup = {
      columnInternalName: string;
      displayName: string;
      columnType: string;
      libraryCount: number;
      siteSet: Set<string>;
    };
    const colRoll = new Map<string, ColRollup>();
    for (const c of libCols) {
      if (c.scope !== 'LIBRARY') continue;
      if (!c.isCustom) continue;
      const key = `${c.columnInternalName}::${c.columnType}`;
      const existing = colRoll.get(key);
      if (existing) {
        existing.libraryCount++;
        existing.siteSet.add(c.workspaceId);
      } else {
        colRoll.set(key, {
          columnInternalName: c.columnInternalName,
          displayName: c.displayName,
          columnType: c.columnType,
          libraryCount: 1,
          siteSet: new Set([c.workspaceId]),
        });
      }
    }
    const PROMOTION_MIN_LIBRARIES = 3;
    const PROMOTION_MIN_SITES = 2;
    const columnPromotionCandidates = Array.from(colRoll.values())
      .filter(r => r.libraryCount >= PROMOTION_MIN_LIBRARIES && r.siteSet.size >= PROMOTION_MIN_SITES)
      .map(r => ({
        columnInternalName: r.columnInternalName,
        displayName: r.displayName,
        columnType: r.columnType,
        libraryCount: r.libraryCount,
        siteCount: r.siteSet.size,
      }));

    // 3. Libraries whose CTs are all built-in (no custom IA applied)
    const libCtsByLibrary = new Map<string, typeof libCts>();
    for (const l of libCts) {
      const arr = libCtsByLibrary.get(l.documentLibraryId) || [];
      arr.push(l);
      libCtsByLibrary.set(l.documentLibraryId, arr);
    }
    const librariesWithoutCustomCt = libraries
      .filter(l => !l.hidden)
      .filter(l => {
        const cts = libCtsByLibrary.get(l.id) || [];
        if (cts.length === 0) return false; // no data yet — not a finding
        return cts.every(c => c.isBuiltIn);
      })
      .map(l => ({
        libraryId: l.id,
        libraryName: l.displayName,
        workspaceId: l.workspaceId,
      }));

    // 4. Column name collisions — same displayName, different columnType
    const displayNameMap = new Map<string, Set<string>>();
    for (const c of libCols) {
      const existing = displayNameMap.get(c.displayName) || new Set<string>();
      existing.add(c.columnType);
      displayNameMap.set(c.displayName, existing);
    }
    const columnNameCollisions = Array.from(displayNameMap.entries())
      .filter(([, types]) => types.size > 1)
      .map(([displayName, types]) => ({
        displayName,
        columnTypes: Array.from(types),
      }));

    res.json({
      localCtDuplicatesHub,
      columnPromotionCandidates,
      librariesWithoutCustomCt,
      columnNameCollisions,
      thresholds: {
        promotionMinLibraries: PROMOTION_MIN_LIBRARIES,
        promotionMinSites: PROMOTION_MIN_SITES,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/libraries/:libraryId/details", requireRole(ZENITH_ROLES.VIEWER), async (req: AuthenticatedRequest, res) => {
  try {
    const lib = await storage.getDocumentLibrary(req.params.libraryId);
    if (!lib) return res.status(404).json({ error: "Library not found" });

    const workspace = await storage.getWorkspace(lib.workspaceId);
    if (!workspace?.tenantConnectionId) return res.status(400).json({ error: "No tenant connection for this workspace" });

    const connection = await storage.getTenantConnection(workspace.tenantConnectionId);
    if (!connection) return res.status(400).json({ error: "Tenant connection not found" });

    let token: string | null = null;
    const clientId = connection.clientId;
    const clientSecret = clientId ? getEffectiveClientSecret(connection) : undefined;
    if (clientId && clientSecret) {
      try { token = await getAppToken(connection.tenantId, clientId, clientSecret); } catch {}
    }
    if (!token) {
      token = await getDelegatedTokenForRetention(req.session?.userId, connection.organizationId);
    }
    if (!token) return res.status(500).json({ error: "No Graph token available. Please sign in with SSO." });

    const graphSiteId = workspace.m365ObjectId;
    if (!graphSiteId) return res.status(400).json({ error: "Workspace has no M365 object ID" });

    const details = await fetchLibraryDetails(token, graphSiteId, lib.m365ListId);
    res.json({
      library: lib,
      workspaceName: workspace.displayName,
      workspaceType: workspace.type,
      siteUrl: workspace.siteUrl,
      contentTypes: details.contentTypes,
      columns: details.columns,
      error: details.error,
    });
  } catch (err: any) {
    console.error(`[library-details] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/tenants/:id/export-csv", requireRole(ZENITH_ROLES.VIEWER), requireFeature("csvExport"), async (req: AuthenticatedRequest, res) => {
  try {
    const allowedTenantIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.id)) {
      return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
    }
    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ error: "Tenant not found" });

    const allWorkspaces = await storage.getWorkspaces(undefined, req.params.id);
    const customFieldDefs = await storage.getCustomFieldDefinitions(req.params.id);

    const baseHeaders = [
      "Site URL", "Display Name", "Type", "Teams Connected", "Project Type",
      "Sensitivity", "Retention Policy", "Copilot Ready",
      "Department", "Cost Center", "Project Code",
      "Owners",
      "Description", "Template",
      "Storage Used (Bytes)", "Storage Allocated (Bytes)",
      "File Count", "Active File Count",
      "Page Views", "Visited Pages",
      "Last Activity Date", "Last Content Modified",
      "Site Created Date",
      "Sharing Capability", "Lock State",
      "External Sharing", "Is Hub Site", "Hub Site ID",
      "Is Archived", "Is Deleted",
      "Owner Display Name", "Owner UPN",
      "Site Owners",
      "Sensitivity Label ID", "Retention Label ID",
      "M365 Object ID",
    ];

    const customFieldHeaders = customFieldDefs.map(d => `CF: ${d.fieldLabel}`);
    const allHeaders = [...baseHeaders, ...customFieldHeaders];

    function escapeCsv(val: any): string {
      if (val === null || val === undefined) return "";
      const str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const rows = allWorkspaces.map(ws => {
      const owners = (ws.siteOwners || []).map(o => o.displayName || o.userPrincipalName || "").join("; ");
      const cf = (ws.customFields || {}) as Record<string, any>;

      const baseValues = [
        ws.siteUrl || "",
        ws.displayName,
        ws.type,
        ws.teamsConnected ? "Yes" : "No",
        ws.projectType,
        ws.sensitivity,
        ws.retentionPolicy,
        ws.copilotReady ? "Yes" : "No",
        ws.department || "",
        ws.costCenter || "",
        ws.projectCode || "",
        ((ws as any).siteOwners as Array<{displayName: string}> || []).map(o => o.displayName).join("; ") || "",
        ws.description || "",
        ws.template || "",
        ws.storageUsedBytes ?? "",
        ws.storageAllocatedBytes ?? "",
        ws.fileCount ?? "",
        ws.activeFileCount ?? "",
        ws.pageViewCount ?? "",
        ws.visitedPageCount ?? "",
        ws.lastActivityDate || "",
        ws.lastContentModifiedDate || "",
        ws.siteCreatedDate || "",
        ws.sharingCapability || "",
        ws.lockState || "",
        ws.externalSharing ? "Yes" : "No",
        ws.isHubSite ? "Yes" : "No",
        ws.hubSiteId || "",
        ws.isArchived ? "Yes" : "No",
        ws.isDeleted ? "Yes" : "No",
        ws.ownerDisplayName || "",
        ws.ownerPrincipalName || "",
        owners,
        ws.sensitivityLabelId || "",
        ws.retentionLabelId || "",
        ws.m365ObjectId || "",
      ];

      const customValues = customFieldDefs.map(d => {
        const val = cf[d.fieldName];
        return val !== undefined && val !== null ? String(val) : "";
      });

      return [...baseValues, ...customValues].map(escapeCsv).join(",");
    });

    const csv = [allHeaders.map(escapeCsv).join(","), ...rows].join("\r\n");
    const filename = `${connection.tenantName.replace(/[^a-zA-Z0-9]/g, "_")}_workspaces_${new Date().toISOString().split("T")[0]}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send("\uFEFF" + csv);
  } catch (err: any) {
    console.error(`[csv-export] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/tenants/:id/import-csv", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const allowedTenantIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.id)) {
      return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
    }
    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ error: "Tenant not found" });

    const { csvData, dryRun } = req.body;
    if (!csvData || typeof csvData !== "string") {
      return res.status(400).json({ error: "csvData is required as a string" });
    }

    const customFieldDefs = await storage.getCustomFieldDefinitions(req.params.id);
    const cfMap = new Map(customFieldDefs.map(d => [`CF: ${d.fieldLabel}`, d]));

    function parseCsvLine(line: string): string[] {
      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"') {
            if (i + 1 < line.length && line[i + 1] === '"') {
              current += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            current += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === ',') {
            values.push(current);
            current = "";
          } else {
            current += ch;
          }
        }
      }
      values.push(current);
      return values;
    }

    const lines = csvData.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return res.status(400).json({ error: "CSV must have a header row and at least one data row" });

    const headers = parseCsvLine(lines[0]);
    const siteUrlIdx = headers.indexOf("Site URL");
    if (siteUrlIdx === -1) return res.status(400).json({ error: 'CSV must have a "Site URL" column for matching' });

    const allWorkspaces = await storage.getWorkspaces(undefined, req.params.id);
    const urlMap = new Map<string, typeof allWorkspaces[0]>();
    for (const ws of allWorkspaces) {
      if (ws.siteUrl) urlMap.set(ws.siteUrl.toLowerCase().replace(/\/$/, ""), ws);
    }

    const EDITABLE_FIELDS: Record<string, string> = {
      "Department": "department",
      "Cost Center": "costCenter",
      "Project Code": "projectCode",
      "Project Type": "projectType",
      "Sensitivity": "sensitivity",
      "Description": "description",
    };

    const results = {
      total: lines.length - 1,
      matched: 0,
      updated: 0,
      skipped: 0,
      notFound: 0,
      errors: 0,
      changes: [] as Array<{ siteUrl: string; displayName: string; field: string; oldValue: string; newValue: string }>,
      notFoundUrls: [] as string[],
    };

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]);
      const rawUrl = values[siteUrlIdx]?.trim();
      if (!rawUrl) { results.skipped++; continue; }

      const normalizedUrl = rawUrl.toLowerCase().replace(/\/$/, "");
      const ws = urlMap.get(normalizedUrl);
      if (!ws) {
        results.notFound++;
        results.notFoundUrls.push(rawUrl);
        continue;
      }

      results.matched++;
      const updates: Record<string, any> = {};
      let hasChanges = false;

      for (let h = 0; h < headers.length; h++) {
        const header = headers[h].trim();
        const newVal = (values[h] || "").trim();

        if (EDITABLE_FIELDS[header]) {
          const dbField = EDITABLE_FIELDS[header];
          const oldVal = (ws as any)[dbField] || "";
          if (newVal !== "" && newVal !== oldVal) {
            updates[dbField] = newVal;
            results.changes.push({
              siteUrl: rawUrl,
              displayName: ws.displayName,
              field: header,
              oldValue: oldVal,
              newValue: newVal,
            });
            hasChanges = true;
          }
        }

        if (header.startsWith("CF: ")) {
          const def = cfMap.get(header);
          if (def) {
            const cf = { ...((ws.customFields || {}) as Record<string, any>), ...((updates.customFields || {}) as Record<string, any>) };
            const oldVal = cf[def.fieldName] !== undefined ? String(cf[def.fieldName]) : "";
            if (newVal !== "" && newVal !== oldVal) {
              cf[def.fieldName] = def.fieldType === "number" ? Number(newVal) : def.fieldType === "boolean" ? (newVal.toLowerCase() === "true" || newVal === "1" || newVal.toLowerCase() === "yes") : newVal;
              updates.customFields = cf;
              results.changes.push({
                siteUrl: rawUrl,
                displayName: ws.displayName,
                field: header,
                oldValue: oldVal,
                newValue: newVal,
              });
              hasChanges = true;
            }
          }
        }
      }

      if (hasChanges && !dryRun) {
        try {
          await storage.updateWorkspace(ws.id, updates);
          results.updated++;
        } catch (err: any) {
          results.errors++;
          console.error(`[csv-import] Error updating ${ws.displayName}: ${err.message}`);
        }
      } else if (hasChanges) {
        results.updated++;
      }
    }

    console.log(`[csv-import] ${dryRun ? "DRY RUN" : "APPLIED"}: ${results.matched} matched, ${results.updated} updated, ${results.notFound} not found, ${results.errors} errors`);
    res.json({
      success: true,
      dryRun: !!dryRun,
      ...results,
    });
  } catch (err: any) {
    console.error(`[csv-import] Error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

async function handleMetadataWriteback(req: AuthenticatedRequest, res: any) {
  const org = await storage.getOrganization(req.activeOrganizationId || req.user?.organizationId);
  const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
  const features = getPlanFeatures(plan);
  if (!features.m365WriteBack) {
    return res.status(403).json({
      error: "FEATURE_GATED",
      message: `Writing metadata to Microsoft 365 is not available on the ${features.label} plan. Upgrade to Standard or higher.`,
      currentPlan: plan,
      requiredFeature: "m365WriteBack",
    });
  }

  const { workspaceIds } = req.body;
  if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
    return res.status(400).json({ error: "workspaceIds array is required" });
  }

  for (const wsId of workspaceIds) {
    if (!(await isWorkspaceInScope(req, wsId))) {
      return res.status(403).json({ error: "One or more workspaces are outside your organization scope" });
    }
  }

  const results: { workspaceId: string; displayName: string; success: boolean; fieldsSynced?: string[]; error?: string }[] = [];

  for (const wsId of workspaceIds) {
    const workspace = await storage.getWorkspace(wsId);
    if (!workspace) {
      results.push({ workspaceId: wsId, displayName: "Unknown", success: false, error: "Workspace not found" });
      continue;
    }
    if (!workspace.tenantConnectionId) {
      results.push({ workspaceId: wsId, displayName: workspace.displayName, success: false, error: "No tenant connection" });
      continue;
    }
    if (!workspace.m365ObjectId) {
      results.push({ workspaceId: wsId, displayName: workspace.displayName, success: false, error: "No M365 site ID" });
      continue;
    }

    const properties: Record<string, string> = {};
    const fieldsSynced: string[] = [];
    if (workspace.department) { properties["Department"] = workspace.department; fieldsSynced.push("Department"); }
    if (workspace.costCenter) { properties["CostCenter"] = workspace.costCenter; fieldsSynced.push("CostCenter"); }
    if (workspace.projectCode) { properties["ProjectCode"] = workspace.projectCode; fieldsSynced.push("ProjectCode"); }

    if (workspace.tenantConnectionId) {
      const conn2 = await storage.getTenantConnection(workspace.tenantConnectionId);
      if (conn2?.organizationId) {
        const policies = await storage.getGovernancePolicies(conn2.organizationId);
        for (const pol of policies) {
          if (pol.propertyBagKey && pol.status === "ACTIVE") {
            const metaEntries = await storage.getDataDictionary(conn2.tenantId, "required_metadata_field");
            const ctx: EvaluationContext = { requiredMetadataFields: metaEntries.map(e => e.value) };
            const evaluation = evaluatePolicy(workspace, pol, ctx);
            properties[pol.propertyBagKey] = formatPolicyBagValue(evaluation, pol.propertyBagValueFormat);
            fieldsSynced.push(pol.propertyBagKey);
          }
        }
      }
    }

    if (Object.keys(properties).length === 0) {
      results.push({ workspaceId: wsId, displayName: workspace.displayName, success: false, error: "No metadata fields set to sync" });
      continue;
    }

    const conn = await storage.getTenantConnection(workspace.tenantConnectionId);
    if (!conn) {
      results.push({ workspaceId: wsId, displayName: workspace.displayName, success: false, error: "Tenant connection not found" });
      continue;
    }

    const clientId = conn.clientId || process.env.AZURE_CLIENT_ID;
    const clientSecret = getEffectiveClientSecret(conn);
    if (!clientId || !clientSecret) {
      results.push({ workspaceId: wsId, displayName: workspace.displayName, success: false, error: "Missing credentials" });
      continue;
    }

    if (!workspace.siteUrl) {
      results.push({ workspaceId: wsId, displayName: workspace.displayName, success: false, error: "No site URL available for property bag write" });
      continue;
    }

    try {
      const spoHost = conn.domain.includes('.sharepoint.com') ? conn.domain : `${conn.domain.replace(/\..*$/, '')}.sharepoint.com`;
      const spoToken = req.session?.userId ? await getDelegatedSpoToken(req.session.userId, spoHost) : null;
      if (!spoToken) {
        results.push({ workspaceId: wsId, displayName: workspace.displayName, success: false, error: "No SharePoint token available for your account. You must be a SharePoint administrator and sign in via SSO." });
        continue;
      }
      const result = await writeSitePropertyBag(spoToken, workspace.siteUrl, properties, req.session?.userId);
      if (result.success) {
        const existingBag = (workspace.propertyBag as Record<string, string>) || {};
        const mergedBag = { ...existingBag, ...properties };
        const updatedHash = computeWritebackHash({
          sensitivityLabelId: workspace.sensitivityLabelId,
          department: workspace.department,
          costCenter: workspace.costCenter,
          projectCode: workspace.projectCode,
          propertyBag: mergedBag,
        });
        await storage.updateWorkspace(wsId, { propertyBag: mergedBag, spoSyncHash: updatedHash, localHash: updatedHash } as any);
      }
      if (!result.success && result.error?.toLowerCase().includes('access')) {
        results.push({ workspaceId: wsId, displayName: workspace.displayName, fieldsSynced, success: false, error: "Access denied — you must be a Site Collection Administrator or Site Owner to write property bag values. Your metadata was saved in Zenith but not pushed to SharePoint." });
      } else {
        results.push({ workspaceId: wsId, displayName: workspace.displayName, fieldsSynced, ...result });
      }
    } catch (err: any) {
      results.push({ workspaceId: wsId, displayName: workspace.displayName, success: false, error: err.message });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  res.json({ succeeded, failed, results });
}

router.post("/api/workspaces/writeback/department", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), requireFeature("m365WriteBack"), handleMetadataWriteback);
router.post("/api/workspaces/writeback/metadata", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), requireFeature("m365WriteBack"), handleMetadataWriteback);

router.post("/api/admin/tenants/:id/writeback", requireRole(ZENITH_ROLES.TENANT_ADMIN), requireFeature("m365WriteBack"), async (req: AuthenticatedRequest, res) => {
  const allowedTenantIds = await getOrgTenantConnectionIds(req);
  if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.id)) {
    return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
  }

  const connection = await storage.getTenantConnection(req.params.id);
  if (!connection) return res.status(404).json({ error: "Tenant connection not found" });

  const allWorkspaces = await storage.getWorkspaces(undefined, req.params.id);
  const dirty = allWorkspaces.filter(w =>
    w.localHash && w.spoSyncHash && w.localHash !== w.spoSyncHash && w.siteUrl
  );

  if (dirty.length === 0) {
    return res.json({ total: allWorkspaces.length, dirty: 0, written: 0, failed: 0, results: [] });
  }

  const spoHost = connection.domain.includes('.sharepoint.com') ? connection.domain : `${connection.domain.replace(/\..*$/, '')}.sharepoint.com`;
  const userId = req.session?.userId || req.user?.id;
  if (!userId) return res.status(401).json({ error: "No user session" });

  const spoToken = await getDelegatedSpoToken(userId, spoHost);
  if (!spoToken) {
    return res.status(401).json({ error: "No SharePoint token available. Please sign in via SSO." });
  }

  const dirtySiteUrls = dirty.map(w => w.siteUrl!);
  console.log(`[bulk-writeback] ${dirty.length} dirty sites out of ${allWorkspaces.length} total`);

  console.log(`[bulk-writeback] Phase 1: Disabling NoScript on ${dirty.length} sites`);
  const disableResults = await batchToggleNoScript(dirtySiteUrls, userId, false);

  await new Promise(r => setTimeout(r, 2000));

  console.log(`[bulk-writeback] Phase 2: Writing property bags`);
  const WRITE_BATCH = 5;
  const results: { workspaceId: string; displayName: string; success: boolean; error?: string }[] = [];

  for (let i = 0; i < dirty.length; i += WRITE_BATCH) {
    const batch = dirty.slice(i, i + WRITE_BATCH);
    const promises = batch.map(async (workspace) => {
      const disableOk = disableResults.get(workspace.siteUrl!);
      if (disableOk && !disableOk.success) {
        return { workspaceId: workspace.id, displayName: workspace.displayName, success: false, error: `NoScript disable failed: ${disableOk.error}` };
      }

      const properties: Record<string, string> = {};
      if (workspace.department) properties["Department"] = workspace.department;
      if (workspace.costCenter) properties["CostCenter"] = workspace.costCenter;
      if (workspace.projectCode) properties["ProjectCode"] = workspace.projectCode;

      if (connection.organizationId) {
        const policies = await storage.getGovernancePolicies(connection.organizationId);
        for (const pol of policies) {
          if (pol.propertyBagKey && pol.status === "ACTIVE") {
            const metaEntries = await storage.getDataDictionary(connection.tenantId, "required_metadata_field");
            const ctx: EvaluationContext = { requiredMetadataFields: metaEntries.map(e => e.value) };
            const evaluation = evaluatePolicy(workspace, pol, ctx);
            properties[pol.propertyBagKey] = formatPolicyBagValue(evaluation, pol.propertyBagValueFormat);
          }
        }
      }

      if (Object.keys(properties).length === 0) {
        return { workspaceId: workspace.id, displayName: workspace.displayName, success: false, error: "No writeback properties set" };
      }

      try {
        const result = await writeSitePropertyBag(spoToken, workspace.siteUrl!, properties, userId);
        if (result.success) {
          const existingBag = (workspace.propertyBag as Record<string, string>) || {};
          const mergedBag = { ...existingBag, ...properties };
          await storage.updateWorkspace(workspace.id, {
            propertyBag: mergedBag,
            spoSyncHash: workspace.localHash,
          } as any);
        }
        return { workspaceId: workspace.id, displayName: workspace.displayName, ...result };
      } catch (err: any) {
        return { workspaceId: workspace.id, displayName: workspace.displayName, success: false, error: err.message };
      }
    });
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
  }

  console.log(`[bulk-writeback] Phase 3: Re-enabling NoScript on ${dirty.length} sites`);
  await batchToggleNoScript(dirtySiteUrls, userId, true);

  const written = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`[bulk-writeback] Complete: ${written} written, ${failed} failed out of ${dirty.length} dirty`);
  res.json({ total: allWorkspaces.length, dirty: dirty.length, written, failed, results });
});

router.get("/api/debug/spo-test/:workspaceId", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const workspace = await storage.getWorkspace(req.params.workspaceId);
  if (!workspace) return res.status(404).json({ error: "Not found" });
  if (!workspace.tenantConnectionId || !workspace.siteUrl) return res.status(400).json({ error: "No tenant or site URL" });
  const conn = await storage.getTenantConnection(workspace.tenantConnectionId);
  if (!conn) return res.status(400).json({ error: "No connection" });
  const spoHost = conn.domain.includes('.sharepoint.com') ? conn.domain : `${conn.domain.replace(/\..*$/, '')}.sharepoint.com`;
  const spoToken = await getDelegatedSpoTokenForOrg(spoHost, req.session?.userId, conn.organizationId);
  if (!spoToken) {
    return res.status(401).json({ error: "No delegated SPO token available. Please sign out and sign back in with SSO." });
  }
  const tokenPayload = JSON.parse(Buffer.from(spoToken.split('.')[1], 'base64').toString());
  const results: Record<string, any> = {
    siteUrl: workspace.siteUrl,
    tokenType: "delegated",
    tokenAudience: tokenPayload.aud,
    tokenScopes: tokenPayload.scp,
    tokenUpn: tokenPayload.upn,
  };

  const endpoints = [
    { name: 'GET _api/web', url: `${workspace.siteUrl}/_api/web?$select=Title`, method: 'GET' },
    { name: 'POST _api/contextinfo', url: `${workspace.siteUrl}/_api/contextinfo`, method: 'POST' },
  ];

  for (const ep of endpoints) {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${spoToken}`,
        Accept: 'application/json;odata=nometadata',
      };
      if (ep.method === 'POST') headers['Content-Length'] = '0';
      const r = await fetch(ep.url, { method: ep.method, headers });
      const text = await r.text();
      results[ep.name] = { status: r.status, body: text.slice(0, 300) };
    } catch (e: any) {
      results[ep.name] = { error: e.message };
    }
  }

  res.json(results);
});

router.get("/api/structures", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
  const workspaces = await storage.getWorkspaces(undefined, tenantConnectionId);

  const hubSites = workspaces.filter(w => w.isHubSite);
  const nonHubSites = workspaces.filter(w => !w.isHubSite);

  type WS = typeof workspaces[0];

  interface HubNode {
    hub: WS;
    childHubs: HubNode[];
    associatedSites: WS[];
  }

  const hubNodeMap = new Map<string, HubNode>();
  for (const hub of hubSites) {
    if (hub.hubSiteId) {
      hubNodeMap.set(hub.hubSiteId.toLowerCase(), {
        hub,
        childHubs: [],
        associatedSites: [],
      });
    }
  }

  const rootHubs: HubNode[] = [];
  for (const node of Array.from(hubNodeMap.values())) {
    const parentId = node.hub.parentHubSiteId?.toLowerCase();
    if (parentId) {
      const parentNode = hubNodeMap.get(parentId);
      if (parentNode) {
        parentNode.childHubs.push(node);
        continue;
      }
    }
    rootHubs.push(node);
  }

  let associatedCount = 0;
  const standaloneSites: WS[] = [];
  for (const site of nonHubSites) {
    const assocHubId = site.hubSiteId?.toLowerCase();
    if (assocHubId) {
      const node = hubNodeMap.get(assocHubId);
      if (node) {
        node.associatedSites.push(site);
        associatedCount++;
        continue;
      }
    }
    standaloneSites.push(site);
  }

  function serializeNode(node: HubNode): any {
    return {
      hub: node.hub,
      childHubs: node.childHubs.map(serializeNode),
      associatedSites: node.associatedSites,
      totalChildren: node.associatedSites.length + node.childHubs.reduce(
        (sum, ch) => sum + ch.associatedSites.length + ch.childHubs.length, 0
      ),
    };
  }

  res.json({
    hubHierarchy: rootHubs.map(serializeNode),
    unassociatedSites: standaloneSites,
    totalSites: workspaces.length,
    hubSiteCount: hubSites.length,
    associatedCount,
    unassociatedCount: standaloneSites.length,
  });
});

function inferSiteType(rootWebTemplate?: string, isRootSite?: object): string {
  if (!rootWebTemplate) return "TEAM_SITE";
  const t = rootWebTemplate.toUpperCase();
  if (t.includes("SITEPAGEPUBLISHING") || t.includes("COMM")) return "COMMUNICATION_SITE";
  if (t.includes("GROUP")) return "TEAM_SITE";
  if (t.includes("STS")) return "TEAM_SITE";
  if (t.includes("HUB")) return "HUB_SITE";
  return "TEAM_SITE";
}

export default router;
