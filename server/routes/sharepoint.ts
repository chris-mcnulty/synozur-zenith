import { Router } from "express";
import { storage } from "../storage";
import { insertWorkspaceSchema, insertProvisioningRequestSchema, type ServicePlanTier, ZENITH_ROLES } from "@shared/schema";
import { fetchSharePointSites, fetchSiteUsageReport, fetchSiteDriveOwner, fetchSiteAnalytics, fetchSiteGroupOwners, fetchSiteCollectionAdmins, getAppToken, writeSitePropertyBag, fetchSitePropertyBag, fetchSensitivityLabels, fetchRetentionLabels, fetchHubSites, fetchSiteHubAssociation, fetchHubSitesViaSearch, applySensitivityLabelToSite, removeSensitivityLabelFromSite, joinHubSite, leaveHubSite, fetchSiteLockState, fetchSiteArchiveStatus, batchToggleNoScript, fetchSiteDocumentLibraries, enumerateSiteDocumentLibraries } from "../services/graph";
import { getPlanFeatures } from "../services/feature-gate";
import { refreshDelegatedToken, getDelegatedSpoToken } from "../routes-entra";
import { requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { computeWritebackHash, computeSpoSyncHash } from "../services/writeback-hash";
import { evaluatePolicy, evaluationResultsToCopilotRules, formatPolicyBagValue, DEFAULT_COPILOT_READINESS_RULES, type EvaluationContext } from "../services/policy-engine";

const router = Router();

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
router.get("/api/workspaces", async (req, res) => {
  const search = req.query.search as string | undefined;
  const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
  const workspaces = await storage.getWorkspaces(search, tenantConnectionId);
  res.json(workspaces);
});

router.get("/api/workspaces/:id", async (req, res) => {
  const workspace = await storage.getWorkspace(req.params.id);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });
  res.json(workspace);
});

router.post("/api/workspaces", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req, res) => {
  const parsed = insertWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  const workspace = await storage.createWorkspace(parsed.data);
  res.status(201).json(workspace);
});

router.patch("/api/workspaces/:id", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const existing = await storage.getWorkspace(req.params.id);
  if (!existing) return res.status(404).json({ message: "Workspace not found" });

  const sensitivityLabelChanged = 'sensitivityLabelId' in req.body &&
    req.body.sensitivityLabelId !== existing.sensitivityLabelId;

  let labelSyncResult: { pushed: boolean; error?: string } | undefined;

  if (sensitivityLabelChanged && existing.tenantConnectionId && existing.m365ObjectId) {
    const org = await storage.getOrganization();
    const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
    const features = getPlanFeatures(plan);
    if (!features.m365WriteBack) {
      return res.status(403).json({
        error: "FEATURE_GATED",
        message: `Applying sensitivity labels to Microsoft 365 is not available on the ${features.label} plan. Upgrade to Standard or higher.`,
        currentPlan: plan,
        requiredFeature: "m365WriteBack",
      });
    }

    if (req.body.sensitivityLabelId) {
      const connection = await storage.getTenantConnection(existing.tenantConnectionId);
      if (connection) {
        const labels = await storage.getSensitivityLabelsByTenantId(connection.tenantId);
        const targetLabel = labels.find(l => l.labelId === req.body.sensitivityLabelId);
        if (!targetLabel) {
          return res.status(400).json({ message: "Sensitivity label not found in synced labels." });
        }
        if (!targetLabel.appliesToGroupsSites) {
          return res.status(400).json({ message: `Label "${targetLabel.name}" does not apply to Groups & Sites. Choose a label with Groups & Sites scope.` });
        }
      }
    }

    try {
      const connection = await storage.getTenantConnection(existing.tenantConnectionId);
      if (connection && existing.siteUrl) {
        const spoHost = connection.domain.includes('.sharepoint.com') ? connection.domain : `${connection.domain.replace(/\..*$/, '')}.sharepoint.com`;
        const spoToken = await getDelegatedSpoToken(req.user!.id, spoHost);
        if (!spoToken) {
          labelSyncResult = { pushed: false, error: "Could not acquire a SharePoint token for your account. Please sign out and sign back in with SSO. You must be a SharePoint administrator in the tenant to apply labels." };
          console.warn(`[label-push] No delegated SPO token for user ${req.user!.email} on ${existing.displayName}. Label saved locally.`);
        } else if (req.body.sensitivityLabelId) {
          const result = await applySensitivityLabelToSite(spoToken, existing.siteUrl, req.body.sensitivityLabelId, req.user!.id);
          labelSyncResult = { pushed: result.success, error: result.error };
          if (result.success) {
            console.log(`[label-push] Applied sensitivity label ${req.body.sensitivityLabelId} to ${existing.siteUrl} via CSOM for workspace ${existing.displayName}`);
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
      } else if (connection && !existing.siteUrl) {
        labelSyncResult = { pushed: false, error: "No site URL available for label push." };
        console.warn(`[label-push] No siteUrl for workspace ${existing.displayName}. Label saved locally.`);
      }
    } catch (err: any) {
      labelSyncResult = { pushed: false, error: err.message };
      console.error(`[label-push] Error pushing sensitivity label: ${err.message}`);
      return res.status(502).json({ message: `Error applying label to M365: ${err.message}`, labelSyncResult });
    }
  }

  const writebackFields = ['sensitivityLabelId', 'department', 'costCenter', 'projectCode'];
  const hasWritebackChange = writebackFields.some(f => f in req.body);

  const updates = { ...req.body };
  if (hasWritebackChange) {
    const merged = { ...existing, ...req.body };
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
    const hasPropertyBagChange = propertyBagFields.some(f => f in req.body && req.body[f] !== existing[f as keyof typeof existing]);
    if (hasPropertyBagChange) {
      updates.spoSyncHash = computeWritebackHash({
        sensitivityLabelId: req.body.sensitivityLabelId ?? existing.sensitivityLabelId,
        department: existing.department,
        costCenter: existing.costCenter,
        projectCode: existing.projectCode,
        propertyBag: existing.propertyBag,
      });
    } else {
      updates.spoSyncHash = updates.localHash || existing.spoSyncHash;
    }
  }

  const workspace = await storage.updateWorkspace(req.params.id, updates);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });

  try {
    if (existing.tenantConnectionId) {
      const conn = await storage.getTenantConnection(existing.tenantConnectionId);
      const orgId = conn?.organizationId;
      if (orgId) {
        const policy = await storage.getGovernancePolicyByType(orgId, "COPILOT_READINESS");
        if (policy) {
          let requiredMetadataFields: string[] = [];
          const metaEntries = await storage.getDataDictionary(conn!.tenantId, "required_metadata_field");
          requiredMetadataFields = metaEntries.map(e => e.value);
          const context: EvaluationContext = { requiredMetadataFields };
          const evaluation = evaluatePolicy(workspace, policy, context);
          const ruleRecords = evaluationResultsToCopilotRules(workspace.id, evaluation);
          await storage.setCopilotRules(workspace.id, ruleRecords);
          const evalUpdates: Record<string, any> = {};
          if (workspace.copilotReady !== evaluation.overallPass) {
            evalUpdates.copilotReady = evaluation.overallPass;
          }
          if (policy.propertyBagKey) {
            const bagValue = formatPolicyBagValue(evaluation, policy.propertyBagValueFormat);
            const existingBag = (workspace.propertyBag as Record<string, string>) || {};
            if (existingBag[policy.propertyBagKey] !== bagValue) {
              evalUpdates.propertyBag = { ...existingBag, [policy.propertyBagKey]: bagValue };
              console.log(`[workspace-update] ${workspace.displayName}: ${policy.propertyBagKey}=${bagValue}`);
            }
          }
          if (Object.keys(evalUpdates).length > 0) {
            await storage.updateWorkspace(workspace.id, evalUpdates);
          }
        }
      }
    }
  } catch (evalErr: any) {
    console.error(`[workspace-update] Policy evaluation error: ${evalErr.message}`);
  }

  const finalWorkspace = await storage.getWorkspace(req.params.id);
  res.json({ ...(finalWorkspace || workspace), labelSyncResult });
});

router.get("/api/workspaces/:id/libraries", async (req, res) => {
  try {
    const libraries = await storage.getDocumentLibraries(req.params.id);
    res.json(libraries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/tenants/:tenantConnectionId/libraries", async (req, res) => {
  try {
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

router.get("/api/admin/tenants/:tenantConnectionId/libraries/stats", async (req, res) => {
  try {
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

router.delete("/api/workspaces/:id", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req, res) => {
  await storage.deleteWorkspace(req.params.id);
  res.status(204).send();
});

router.post("/api/workspaces/:id/sync", requireRole(ZENITH_ROLES.OPERATOR, ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req, res) => {
  try {
    const workspace = await storage.getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    if (!workspace.tenantConnectionId) return res.status(400).json({ message: "Workspace has no tenant connection" });

    const connection = await storage.getTenantConnection(workspace.tenantConnectionId);
    if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

    const clientId = connection.clientId || process.env.AZURE_CLIENT_ID;
    const clientSecret = connection.clientSecret || process.env.AZURE_CLIENT_SECRET;
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
      const orgId = connection2?.organizationId;
      if (orgId) {
        const policy = await storage.getGovernancePolicyByType(orgId, "COPILOT_READINESS");
        if (policy) {
          let requiredMetadataFields: string[] = [];
          const metaEntries = await storage.getDataDictionary(connection2!.tenantId, "required_metadata_field");
          requiredMetadataFields = metaEntries.map(e => e.value);
          const context: EvaluationContext = { requiredMetadataFields };

          const evaluation = evaluatePolicy(updated, policy, context);
          const ruleRecords = evaluationResultsToCopilotRules(updated.id, evaluation);
          await storage.setCopilotRules(updated.id, ruleRecords);
          const evalUpdates: Record<string, any> = {};
          if (updated.copilotReady !== evaluation.overallPass) {
            evalUpdates.copilotReady = evaluation.overallPass;
          }
          if (policy.propertyBagKey) {
            const bagValue = formatPolicyBagValue(evaluation, policy.propertyBagValueFormat);
            const existingBag = (updated.propertyBag as Record<string, string>) || {};
            evalUpdates.propertyBag = { ...existingBag, [policy.propertyBagKey]: bagValue };
            console.log(`[single-sync] ${updated.displayName}: ${policy.propertyBagKey}=${bagValue}`);
          }
          if (Object.keys(evalUpdates).length > 0) {
            await storage.updateWorkspace(updated.id, evalUpdates);
          }
          console.log(`[single-sync] Policy "${policy.name}" evaluated: ${evaluation.overallPass ? "PASS" : "FAIL"} (${evaluation.results.filter(r => r.ruleResult === "PASS").length}/${evaluation.results.length})`);
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

router.patch("/api/workspaces/bulk/update", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req, res) => {
  const { ids, updates } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "ids array is required" });
  }
  await storage.bulkUpdateWorkspaces(ids, updates);

  let policyEvalCount = 0;
  try {
    for (const wsId of ids) {
      const ws = await storage.getWorkspace(wsId);
      if (!ws?.tenantConnectionId) continue;
      const conn = await storage.getTenantConnection(ws.tenantConnectionId);
      const orgId = conn?.organizationId;
      if (!orgId) continue;
      const policy = await storage.getGovernancePolicyByType(orgId, "COPILOT_READINESS");
      if (!policy) continue;
      let requiredMetadataFields: string[] = [];
      const metaEntries = await storage.getDataDictionary(conn!.tenantId, "required_metadata_field");
      requiredMetadataFields = metaEntries.map(e => e.value);
      const context: EvaluationContext = { requiredMetadataFields };
      const evaluation = evaluatePolicy(ws, policy, context);
      const ruleRecords = evaluationResultsToCopilotRules(ws.id, evaluation);
      await storage.setCopilotRules(ws.id, ruleRecords);
      const evalUpdates: Record<string, any> = {};
      if (ws.copilotReady !== evaluation.overallPass) {
        evalUpdates.copilotReady = evaluation.overallPass;
      }
      if (policy.propertyBagKey) {
        const bagValue = formatPolicyBagValue(evaluation, policy.propertyBagValueFormat);
        const existingBag = (ws.propertyBag as Record<string, string>) || {};
        if (existingBag[policy.propertyBagKey] !== bagValue) {
          evalUpdates.propertyBag = { ...existingBag, [policy.propertyBagKey]: bagValue };
        }
      }
      if (Object.keys(evalUpdates).length > 0) {
        await storage.updateWorkspace(ws.id, evalUpdates);
      }
      policyEvalCount++;
    }
  } catch (evalErr: any) {
    console.error(`[bulk-update] Policy evaluation error: ${evalErr.message}`);
  }

  res.json({ message: "Bulk update complete", count: ids.length, policyEvaluation: policyEvalCount > 0 ? { evaluated: policyEvalCount } : undefined });
});

router.patch("/api/workspaces/bulk/hub-assignment", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req, res) => {
  const { workspaceIds, hubSiteId } = req.body;
  if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
    return res.status(400).json({ message: "workspaceIds array is required" });
  }

  const allWs = await storage.getWorkspaces();

  if (hubSiteId) {
    const hubExists = allWs.some(ws => ws.isHubSite && ws.hubSiteId === hubSiteId);
    if (!hubExists) {
      return res.status(400).json({ message: "Invalid hub site ID — no hub site found with that identifier" });
    }
  }

  await storage.bulkUpdateWorkspaces(workspaceIds, { hubSiteId: hubSiteId || null });

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
router.get("/api/workspaces/:id/copilot-rules", async (req, res) => {
  const rules = await storage.getCopilotRules(req.params.id);
  res.json(rules);
});

router.put("/api/workspaces/:id/copilot-rules", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req, res) => {
  const { rules } = req.body;
  if (!Array.isArray(rules)) {
    return res.status(400).json({ message: "rules array is required" });
  }
  const created = await storage.setCopilotRules(req.params.id, rules);
  res.json(created);
});

// ── Provisioning Requests ──
router.get("/api/provisioning-requests", async (_req, res) => {
  const requests = await storage.getProvisioningRequests();
  res.json(requests);
});

router.get("/api/provisioning-requests/:id", async (req, res) => {
  const request = await storage.getProvisioningRequest(req.params.id);
  if (!request) return res.status(404).json({ message: "Request not found" });
  res.json(request);
});

router.post("/api/provisioning-requests", requireRole(ZENITH_ROLES.OPERATOR, ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req, res) => {
  const parsed = insertProvisioningRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  const request = await storage.createProvisioningRequest(parsed.data);
  res.status(201).json(request);
});

router.patch("/api/provisioning-requests/:id/status", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req, res) => {
  const { status } = req.body;
  if (!["PENDING", "APPROVED", "PROVISIONED", "REJECTED"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  if (status === "PROVISIONED") {
    const org = await storage.getOrganization();
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
  }
  const request = await storage.updateProvisioningRequestStatus(req.params.id, status);
  if (!request) return res.status(404).json({ message: "Request not found" });
  res.json(request);
});

// ── Site Inventory Sync ──
router.post("/api/admin/tenants/:id/sync", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req, res) => {
  const connection = await storage.getTenantConnection(req.params.id);
  if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

  const clientId = connection.clientId || process.env.AZURE_CLIENT_ID;
  const clientSecret = connection.clientSecret || process.env.AZURE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(503).json({ success: false, error: "Zenith app credentials not configured. Set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET." });
  }

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
          for (const [graphId, hubSiteCollectionId] of searchResult.associations) {
            graphIdToHubSiteCollectionId.set(graphId, hubSiteCollectionId);
          }

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
    try {
      const allSyncedWorkspaces = await storage.getWorkspaces(undefined, req.params.id);
      const policy = connection.organizationId
        ? await storage.getGovernancePolicyByType(connection.organizationId, "COPILOT_READINESS")
        : null;

      if (policy) {
        let requiredMetadataFields: string[] = [];
        const metaEntries = await storage.getDataDictionary(connection.tenantId, "required_metadata_field");
        requiredMetadataFields = metaEntries.map(e => e.value);
        const context: EvaluationContext = { requiredMetadataFields };

        for (const ws of allSyncedWorkspaces) {
          const evaluation = evaluatePolicy(ws, policy, context);
          const ruleRecords = evaluationResultsToCopilotRules(ws.id, evaluation);
          await storage.setCopilotRules(ws.id, ruleRecords);
          const updates: Record<string, any> = {};
          if (ws.copilotReady !== evaluation.overallPass) {
            updates.copilotReady = evaluation.overallPass;
          }
          if (policy.propertyBagKey) {
            const bagValue = formatPolicyBagValue(evaluation, policy.propertyBagValueFormat);
            const existingBag = (ws.propertyBag as Record<string, string>) || {};
            if (existingBag[policy.propertyBagKey] !== bagValue) {
              updates.propertyBag = { ...existingBag, [policy.propertyBagKey]: bagValue };
              console.log(`[policy-eval] ${ws.displayName}: ${policy.propertyBagKey}=${bagValue}`);
            }
          }
          if (Object.keys(updates).length > 0) {
            await storage.updateWorkspace(ws.id, updates);
          }
          policyEvalCount++;
        }
        console.log(`[policy-eval] Evaluated ${policyEvalCount} workspaces against "${policy.name}" policy`);
      } else {
        console.log(`[policy-eval] No COPILOT_READINESS policy found for org, skipping auto-evaluation`);
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

    await storage.updateTenantConnection(req.params.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: permissionWarnings.some(w => w.severity === "error") ? "SUCCESS_WITH_ERRORS" : permissionWarnings.length > 0 ? "SUCCESS_WITH_WARNINGS" : "SUCCESS",
      lastSyncSiteCount: siteResult.sites.length,
      status: "ACTIVE",
      consentGranted: true,
    });

    res.json({
      success: true,
      sitesFound: siteResult.sites.length,
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
      policyEvaluation: policyEvalCount > 0 ? { evaluated: policyEvalCount } : undefined,
      permissionWarnings: permissionWarnings.length > 0 ? permissionWarnings : undefined,
    });
  } catch (err: any) {
    await storage.updateTenantConnection(req.params.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: `ERROR: ${err.message}`,
    });
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post("/api/admin/tenants/:id/sync-libraries", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ error: "Tenant not found" });

    const token = await getAppToken(connection.tenantId, connection.clientId!, connection.clientSecret!);
    if (!token) return res.status(500).json({ error: "Failed to acquire app token" });

    const allWorkspaces = await storage.getWorkspaces(undefined, req.params.id);
    console.log(`[library-sync] Starting full library sync for ${allWorkspaces.length} workspaces in tenant ${connection.tenantName}...`);

    const result = { synced: 0, totalLibraries: 0, skipped: 0, errors: 0 };
    const BATCH_SIZE = 10;

    for (let i = 0; i < allWorkspaces.length; i += BATCH_SIZE) {
      const batch = allWorkspaces.slice(i, i + BATCH_SIZE);
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
            if (existing && existing.lastModifiedAt === lib.lastModifiedAt) {
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
          } else {
            result.synced++;
            result.totalLibraries += (r.value as any).upserted || 0;
            result.skipped += r.value.skipped;
          }
        } else {
          result.errors++;
        }
      }
    }

    console.log(`[library-sync] Complete: ${result.totalLibraries} libraries synced across ${result.synced} workspaces (${result.skipped} unchanged, ${result.errors} errors)`);

    res.json({
      success: true,
      workspacesProcessed: allWorkspaces.length,
      workspacesSynced: result.synced,
      librariesSynced: result.totalLibraries,
      librariesSkipped: result.skipped,
      errors: result.errors,
    });
  } catch (err: any) {
    console.error(`[library-sync] Error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function handleMetadataWriteback(req: any, res: any) {
  const org = await storage.getOrganization();
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
    const clientSecret = conn.clientSecret || process.env.AZURE_CLIENT_SECRET;
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

router.post("/api/workspaces/writeback/department", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), handleMetadataWriteback);
router.post("/api/workspaces/writeback/metadata", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), handleMetadataWriteback);

router.post("/api/admin/tenants/:id/writeback", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req, res) => {
  const org = await storage.getOrganization();
  const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
  const features = getPlanFeatures(plan);
  if (!features.m365WriteBack) {
    return res.status(403).json({
      error: "FEATURE_GATED",
      message: `Bulk writeback is not available on the ${features.label} plan.`,
    });
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

router.get("/api/debug/spo-test/:workspaceId", async (req, res) => {
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

router.get("/api/structures", async (req, res) => {
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
