import { Router } from "express";
import { storage } from "../storage";
import { insertWorkspaceSchema, insertProvisioningRequestSchema, type ServicePlanTier } from "@shared/schema";
import { fetchSharePointSites, fetchSiteUsageReport, fetchSiteDriveOwner, fetchSiteAnalytics, getAppToken, writeSitePropertyBag } from "../services/graph";
import { getPlanFeatures } from "../services/feature-gate";

const router = Router();

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

router.post("/api/workspaces", async (req, res) => {
  const parsed = insertWorkspaceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  const workspace = await storage.createWorkspace(parsed.data);
  res.status(201).json(workspace);
});

router.patch("/api/workspaces/:id", async (req, res) => {
  const workspace = await storage.updateWorkspace(req.params.id, req.body);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });
  res.json(workspace);
});

router.delete("/api/workspaces/:id", async (req, res) => {
  await storage.deleteWorkspace(req.params.id);
  res.status(204).send();
});

router.patch("/api/workspaces/bulk/update", async (req, res) => {
  const { ids, updates } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: "ids array is required" });
  }
  await storage.bulkUpdateWorkspaces(ids, updates);
  res.json({ message: "Bulk update complete", count: ids.length });
});

// ── Copilot Rules ──
router.get("/api/workspaces/:id/copilot-rules", async (req, res) => {
  const rules = await storage.getCopilotRules(req.params.id);
  res.json(rules);
});

router.put("/api/workspaces/:id/copilot-rules", async (req, res) => {
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

router.post("/api/provisioning-requests", async (req, res) => {
  const parsed = insertProvisioningRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  const request = await storage.createProvisioningRequest(parsed.data);
  res.status(201).json(request);
});

router.patch("/api/provisioning-requests/:id/status", async (req, res) => {
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
router.post("/api/admin/tenants/:id/sync", async (req, res) => {
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

    let upsertedCount = 0;
    let usageMatched = 0;
    const enrichErrors: string[] = [];

    const BATCH_SIZE = 5;
    const enrichCache = new Map<string, { driveOwner: any; analytics: any }>();

    if (token) {
      for (let i = 0; i < siteResult.sites.length; i += BATCH_SIZE) {
        const batch = siteResult.sites.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (site) => {
            const [driveResult, analyticsResult] = await Promise.allSettled([
              fetchSiteDriveOwner(token!, site.id),
              fetchSiteAnalytics(token!, site.id),
            ]);
            return {
              siteId: site.id,
              driveOwner: driveResult.status === 'fulfilled' ? driveResult.value : {},
              analytics: analyticsResult.status === 'fulfilled' ? analyticsResult.value : {},
            };
          })
        );
        for (const r of results) {
          if (r.status === 'fulfilled') {
            enrichCache.set(r.value.siteId, { driveOwner: r.value.driveOwner, analytics: r.value.analytics });
          }
        }
      }
    }

    for (const site of siteResult.sites) {
      const graphSiteIdParts = site.id.split(',');
      const siteGuid = graphSiteIdParts.length >= 2 ? graphSiteIdParts[1].trim() : site.id.trim();

      let usage = usageMap.get(siteGuid.toLowerCase());
      if (!usage && site.webUrl) {
        usage = usageUrlMap.get(normalizeUrl(site.webUrl));
      }
      if (usage) usageMatched++;

      const enriched = enrichCache.get(site.id) || { driveOwner: {}, analytics: {} };
      const driveOwner = enriched.driveOwner;
      const siteAnalytics = enriched.analytics;

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
      if (existing) {
        await storage.updateWorkspace(existing.id, workspaceData);
      } else {
        await storage.createWorkspace(workspaceData as any);
      }
      upsertedCount++;
    }

    await storage.updateTenantConnection(req.params.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: "SUCCESS",
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
    });
  } catch (err: any) {
    await storage.updateTenantConnection(req.params.id, {
      lastSyncAt: new Date(),
      lastSyncStatus: `ERROR: ${err.message}`,
    });
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

    try {
      const token = await getAppToken(conn.tenantId, clientId, clientSecret);
      const result = await writeSitePropertyBag(token, workspace.m365ObjectId, properties);
      results.push({ workspaceId: wsId, displayName: workspace.displayName, fieldsSynced, ...result });
    } catch (err: any) {
      results.push({ workspaceId: wsId, displayName: workspace.displayName, success: false, error: err.message });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  res.json({ succeeded, failed, results });
}

router.post("/api/workspaces/writeback/department", handleMetadataWriteback);
router.post("/api/workspaces/writeback/metadata", handleMetadataWriteback);

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
