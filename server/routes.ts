import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { insertWorkspaceSchema, insertProvisioningRequestSchema, insertTenantConnectionSchema, PLAN_FEATURES, SERVICE_PLANS, type ServicePlanTier } from "@shared/schema";
import { testConnection, fetchSharePointSites, clearTokenCache } from "./services/graph";
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
    const workspaces = await storage.getWorkspaces(search);
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

    const { tenantDomain, ownershipType } = req.query;
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

    const consentUrl = `https://login.microsoftonline.com/${tenantDomain}/adminconsent?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}&prompt=select_account`;

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
      const result = await fetchSharePointSites(connection.tenantId, clientId, clientSecret);

      if (result.error) {
        await storage.updateTenantConnection(req.params.id, {
          lastSyncAt: new Date(),
          lastSyncStatus: `ERROR: ${result.error}`,
          lastSyncSiteCount: result.sites.length,
        });
        return res.json({
          success: false,
          error: result.error,
          sitesFound: result.sites.length,
        });
      }

      await storage.updateTenantConnection(req.params.id, {
        lastSyncAt: new Date(),
        lastSyncStatus: "SUCCESS",
        lastSyncSiteCount: result.sites.length,
        status: "ACTIVE",
        consentGranted: true,
      });

      res.json({
        success: true,
        sitesFound: result.sites.length,
        sites: result.sites.map(s => ({
          graphId: s.id,
          displayName: s.displayName,
          webUrl: s.webUrl,
          description: s.description,
          createdDateTime: s.createdDateTime,
          lastModifiedDateTime: s.lastModifiedDateTime,
        })),
      });
    } catch (err: any) {
      await storage.updateTenantConnection(req.params.id, {
        lastSyncAt: new Date(),
        lastSyncStatus: `ERROR: ${err.message}`,
      });
      res.status(500).json({ success: false, error: err.message });
    }
  });

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

  return httpServer;
}
