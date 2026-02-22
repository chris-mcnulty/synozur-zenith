import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { insertWorkspaceSchema, insertProvisioningRequestSchema, insertTenantConnectionSchema, PLAN_FEATURES, SERVICE_PLANS, type ServicePlanTier } from "@shared/schema";
import { testConnection, fetchSharePointSites, fetchSiteUsageReport, fetchSiteDriveOwner, fetchSiteAnalytics, getAppToken, clearTokenCache } from "./services/graph";
import { requireFeature, getPlanFeatures } from "./services/feature-gate";
import authRouter from "./routes-auth";
import entraRouter from "./routes-entra";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/api/auth", authRouter);
  app.use("/auth/entra", entraRouter);

  // ── Workspaces ──
  app.get("/api/workspaces", async (req, res) => {
    const search = req.query.search as string | undefined;
    const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
    const workspaces = await storage.getWorkspaces(search, tenantConnectionId);
    res.json(workspaces);
  });

  app.get("/api/workspaces/:id", async (req, res) => {
    const workspace = await storage.getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    res.json(workspace);
  });

  app.post("/api/workspaces", async (req, res) => {
    const parsed = insertWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const workspace = await storage.createWorkspace(parsed.data);
    res.status(201).json(workspace);
  });

  app.patch("/api/workspaces/:id", async (req, res) => {
    const workspace = await storage.updateWorkspace(req.params.id, req.body);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });
    res.json(workspace);
  });

  app.delete("/api/workspaces/:id", async (req, res) => {
    await storage.deleteWorkspace(req.params.id);
    res.status(204).send();
  });

  app.patch("/api/workspaces/bulk/update", async (req, res) => {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids array is required" });
    }
    await storage.bulkUpdateWorkspaces(ids, updates);
    res.json({ message: "Bulk update complete", count: ids.length });
  });

  // ── Provisioning Requests ──
  app.get("/api/provisioning-requests", async (_req, res) => {
    const requests = await storage.getProvisioningRequests();
    res.json(requests);
  });

  app.get("/api/provisioning-requests/:id", async (req, res) => {
    const request = await storage.getProvisioningRequest(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    res.json(request);
  });

  app.post("/api/provisioning-requests", async (req, res) => {
    const parsed = insertProvisioningRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const request = await storage.createProvisioningRequest(parsed.data);
    res.status(201).json(request);
  });

  app.patch("/api/provisioning-requests/:id/status", async (req, res) => {
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

  // ── Copilot Rules ──
  app.get("/api/workspaces/:id/copilot-rules", async (req, res) => {
    const rules = await storage.getCopilotRules(req.params.id);
    res.json(rules);
  });

  app.put("/api/workspaces/:id/copilot-rules", async (req, res) => {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      return res.status(400).json({ message: "rules array is required" });
    }
    const created = await storage.setCopilotRules(req.params.id, rules);
    res.json(created);
  });

  // ── Dashboard Stats ──
  app.get("/api/stats", async (_req, res) => {
    const allWorkspaces = await storage.getWorkspaces();
    const total = allWorkspaces.length;
    const copilotReady = allWorkspaces.filter(w => w.copilotReady).length;
    const metadataComplete = allWorkspaces.filter(w => w.metadataStatus === "COMPLETE").length;
    const metadataMissing = allWorkspaces.filter(w => w.metadataStatus === "MISSING_REQUIRED").length;
    const highlyConfidential = allWorkspaces.filter(w => w.sensitivity === "HIGHLY_CONFIDENTIAL").length;
    const requests = await storage.getProvisioningRequests();
    const pendingRequests = requests.filter(r => r.status === "PENDING").length;

    res.json({
      totalWorkspaces: total,
      copilotReady,
      copilotNotReady: total - copilotReady,
      metadataComplete,
      metadataMissing,
      highlyConfidential,
      pendingRequests,
      totalRequests: requests.length,
    });
  });

  // ── Organization & Service Plan ──
  app.get("/api/organization", async (req, res) => {
    const id = req.query.id as string | undefined;
    let org = await storage.getOrganization(id);
    if (!org) {
      org = await storage.upsertOrganization({
        name: "The Synozur Alliance",
        domain: "synozur.onmicrosoft.com",
        servicePlan: "ENTERPRISE",
        supportEmail: "it-support@synozur.demo",
      });
    }
    const plan = org.servicePlan as ServicePlanTier;
    const features = getPlanFeatures(plan);
    res.json({ ...org, features });
  });

  app.get("/api/organizations", async (_req, res) => {
    const orgs = await storage.getOrganizations();
    const withFeatures = orgs.map(org => ({
      ...org,
      features: getPlanFeatures(org.servicePlan as ServicePlanTier),
    }));
    res.json(withFeatures);
  });

  app.patch("/api/organization/plan", async (req, res) => {
    const { plan } = req.body;
    if (!SERVICE_PLANS.includes(plan)) {
      return res.status(400).json({ message: `Invalid plan. Must be one of: ${SERVICE_PLANS.join(", ")}` });
    }
    const org = await storage.getOrganization();
    if (!org) return res.status(404).json({ message: "Organization not found" });
    const updated = await storage.updateOrganizationPlan(org.id, plan);
    if (!updated) return res.status(500).json({ message: "Failed to update plan" });
    const features = getPlanFeatures(plan as ServicePlanTier);
    res.json({ ...updated, features });
  });

  app.get("/api/feature-check/:feature", async (req, res) => {
    const org = await storage.getOrganization();
    const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
    const features = getPlanFeatures(plan);
    const feature = req.params.feature as keyof typeof features;
    if (!(feature in features)) {
      return res.status(400).json({ message: "Unknown feature" });
    }
    res.json({
      feature,
      enabled: !!features[feature],
      currentPlan: plan,
      planLabel: features.label,
    });
  });

  // ── Tenant Connections ──
  app.get("/api/admin/tenants", async (_req, res) => {
    const connections = await storage.getTenantConnections();
    const safe = connections.map(c => ({
      ...c,
      clientSecret: undefined,
      clientId: c.clientId ? `${c.clientId.substring(0, 8)}...` : undefined,
    }));
    res.json(safe);
  });

  app.get("/api/admin/tenants/consent/initiate", async (req, res) => {
    const clientId = process.env.AZURE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: "Zenith Entra app is not configured. Set AZURE_CLIENT_ID first." });
    }

    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "You must be logged in to connect a tenant." });
    }

    const user = await storage.getUser(userId);
    if (!user || !user.organizationId) {
      return res.status(403).json({ error: "You must belong to an organization to connect a tenant." });
    }

    const { tenantDomain, ownershipType, adminEmail } = req.query;
    if (!tenantDomain) {
      return res.status(400).json({ error: "tenantDomain query parameter is required" });
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    (req.session as any).consentNonce = nonce;
    (req.session as any).consentOrgId = user.organizationId;

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const redirectUri = `${baseUrl}/api/admin/tenants/consent/callback`;

    const state = Buffer.from(JSON.stringify({
      tenantDomain,
      ownershipType: ownershipType || 'MSP',
      nonce,
    })).toString('base64url');

    const tenantAuthority = tenantDomain || 'organizations';
    let consentUrl = `https://login.microsoftonline.com/${tenantAuthority}/adminconsent?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    if (adminEmail) {
      consentUrl += `&login_hint=${encodeURIComponent(String(adminEmail))}`;
    }

    res.json({ consentUrl });
  });

  app.get("/api/admin/tenants/consent/callback", async (req, res) => {
    const { admin_consent, tenant, state, error, error_description } = req.query;

    if (error) {
      console.error('[Consent] Admin consent error:', error, error_description);
      return res.redirect(`/app/admin/tenants?consent_error=${encodeURIComponent(String(error_description || error))}`);
    }

    if (admin_consent !== 'True' || !tenant || !state) {
      return res.redirect('/app/admin/tenants?consent_error=Consent+was+not+granted');
    }

    try {
      const stateData = JSON.parse(Buffer.from(String(state), 'base64url').toString());
      const sessionNonce = (req.session as any)?.consentNonce;
      const sessionOrgId = (req.session as any)?.consentOrgId;

      if (!sessionNonce || sessionNonce !== stateData.nonce) {
        return res.redirect('/app/admin/tenants?consent_error=Invalid+consent+session.+Please+try+again.');
      }

      delete (req.session as any).consentNonce;
      delete (req.session as any).consentOrgId;

      const tenantIdStr = String(tenant);
      const domain = stateData.tenantDomain || tenantIdStr;
      const ownershipType = stateData.ownershipType || 'MSP';
      const organizationId = sessionOrgId || null;

      const existing = (await storage.getTenantConnections()).find(
        c => c.tenantId === tenantIdStr && c.organizationId === organizationId
      );
      if (existing) {
        await storage.updateTenantConnection(existing.id, {
          consentGranted: true,
          status: 'ACTIVE',
        });
        return res.redirect('/app/admin/tenants?consent_success=true');
      }

      let tenantName = domain.split('.')[0];
      const clientId = process.env.AZURE_CLIENT_ID!;
      const clientSecret = process.env.AZURE_CLIENT_SECRET!;

      try {
        const result = await testConnection(tenantIdStr, clientId, clientSecret);
        if (result.success && result.tenantName) {
          tenantName = result.tenantName;
        }
      } catch {}

      await storage.createTenantConnection({
        tenantId: tenantIdStr,
        tenantName,
        domain,
        ownershipType,
        organizationId,
        consentGranted: true,
        status: 'ACTIVE',
      });

      return res.redirect('/app/admin/tenants?consent_success=true');
    } catch (err: any) {
      console.error('[Consent] Callback processing error:', err);
      return res.redirect(`/app/admin/tenants?consent_error=${encodeURIComponent(err.message)}`);
    }
  });

  app.get("/api/admin/tenants/:id", async (req, res) => {
    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ message: "Tenant connection not found" });
    res.json({ ...connection, clientSecret: undefined });
  });

  app.post("/api/admin/tenants", async (req, res) => {
    const { tenantId, tenantName, domain, ownershipType, organizationId } = req.body;
    if (!tenantId || !domain) {
      return res.status(400).json({ message: "tenantId and domain are required" });
    }
    const connection = await storage.createTenantConnection({
      tenantId,
      tenantName: tenantName || domain.split('.')[0],
      domain,
      ownershipType: ownershipType || 'MSP',
      organizationId: organizationId || null,
      status: 'PENDING',
      consentGranted: false,
    });
    res.status(201).json({ ...connection, clientSecret: undefined });
  });

  app.patch("/api/admin/tenants/:id", async (req, res) => {
    const connection = await storage.updateTenantConnection(req.params.id, req.body);
    if (!connection) return res.status(404).json({ message: "Tenant connection not found" });
    res.json({ ...connection, clientSecret: undefined });
  });

  app.delete("/api/admin/tenants/:id", async (req, res) => {
    const conn = await storage.getTenantConnection(req.params.id);
    if (conn && conn.clientId) clearTokenCache(conn.tenantId, conn.clientId);
    await storage.deleteTenantConnection(req.params.id);
    res.status(204).send();
  });

  app.post("/api/admin/tenants/test", async (req, res) => {
    const { tenantId } = req.body;
    const clientId = req.body.clientId || process.env.AZURE_CLIENT_ID;
    const clientSecret = req.body.clientSecret || process.env.AZURE_CLIENT_SECRET;
    if (!tenantId || !clientId || !clientSecret) {
      return res.status(400).json({ message: "tenantId is required, and Zenith app credentials must be configured" });
    }
    const result = await testConnection(tenantId, clientId, clientSecret);
    res.json(result);
  });

  app.post("/api/admin/tenants/:id/sync", async (req, res) => {
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

  function inferSiteType(rootWebTemplate?: string, isRootSite?: object): string {
    if (!rootWebTemplate) return "TEAM_SITE";
    const t = rootWebTemplate.toUpperCase();
    if (t.includes("SITEPAGEPUBLISHING") || t.includes("COMM")) return "COMMUNICATION_SITE";
    if (t.includes("GROUP")) return "TEAM_SITE";
    if (t.includes("STS")) return "TEAM_SITE";
    if (t.includes("HUB")) return "HUB_SITE";
    return "TEAM_SITE";
  }

  // ── Domain Blocklist (Admin) ──
  app.get("/api/admin/domain-blocklist", async (_req, res) => {
    try {
      const domains = await storage.getBlockedDomains();
      res.json(domains);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/domain-blocklist", async (req, res) => {
    try {
      const { domain, reason } = req.body;
      if (!domain) {
        return res.status(400).json({ error: "Domain is required" });
      }
      const normalizedDomain = domain.toLowerCase().trim();
      const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
      if (!domainRegex.test(normalizedDomain)) {
        return res.status(400).json({ error: "Invalid domain format" });
      }
      const entry = await storage.addBlockedDomain({
        domain: normalizedDomain,
        reason: reason || null,
        createdBy: null,
      });
      res.status(201).json(entry);
    } catch (err: any) {
      if (err.message?.includes("unique") || err.code === '23505') {
        return res.status(409).json({ error: "Domain is already blocked" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/domain-blocklist/:domain", async (req, res) => {
    try {
      await storage.removeBlockedDomain(decodeURIComponent(req.params.domain));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Tenant Departments (tenant-owned, shared across orgs) ──
  app.get("/api/admin/tenants/:tenantConnectionId/departments", async (req, res) => {
    try {
      const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
      if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
      const departments = await storage.getTenantDepartments(conn.tenantId);
      res.json(departments);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/tenants/:tenantConnectionId/departments", async (req, res) => {
    try {
      const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
      if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
      const { name } = req.body;
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Department name is required" });
      }
      const existing = await storage.getTenantDepartments(conn.tenantId);
      if (existing.some(d => d.name.toLowerCase() === name.trim().toLowerCase())) {
        return res.status(409).json({ error: "Department already exists for this tenant" });
      }
      const dept = await storage.createTenantDepartment({ tenantId: conn.tenantId, name: name.trim() });
      res.status(201).json(dept);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/tenants/:tenantConnectionId/departments/:deptId", async (req, res) => {
    try {
      await storage.deleteTenantDepartment(req.params.deptId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
