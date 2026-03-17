import type { Express } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { insertWorkspaceSchema, insertProvisioningRequestSchema, insertTenantConnectionSchema, PLAN_FEATURES, SERVICE_PLANS, ZENITH_ROLES, type ServicePlanTier } from "@shared/schema";
import { testConnection, fetchSharePointSites, clearTokenCache } from "./services/graph";
import { requireFeature, getPlanFeatures } from "./services/feature-gate";
import { requireAuth, requirePermission, requireAnyPermission, type AuthenticatedRequest } from "./middleware/rbac";
import { encryptToken, decryptToken } from "./utils/encryption";
import authRouter from "./routes-auth";
import entraRouter from "./routes-entra";

/**
 * Returns the set of tenant connection IDs that the current user may access.
 * Returns null for PLATFORM_OWNER (unrestricted) or users without an org.
 */
async function getOrgTenantConnectionIds(user: AuthenticatedRequest["user"]): Promise<string[] | null> {
  if (!user?.organizationId) return null;
  if (user.role === ZENITH_ROLES.PLATFORM_OWNER) return null;
  const connections = await storage.getTenantConnectionsByOrganization(user.organizationId);
  return connections.map(c => c.id);
}

/**
 * Checks whether a tenant connection belongs to the requesting user's org.
 * Returns false (denied) when the connection is owned by a different org.
 */
async function canAccessTenantConnection(user: AuthenticatedRequest["user"], connectionId: string): Promise<boolean> {
  if (!user) return false;
  if (user.role === ZENITH_ROLES.PLATFORM_OWNER) return true;
  if (!user.organizationId) return false;
  const connection = await storage.getTenantConnection(connectionId);
  if (!connection) return false;
  return connection.organizationId === user.organizationId;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/api/auth", authRouter);
  app.use("/auth/entra", entraRouter);

  // ── Workspaces ──
  app.get("/api/workspaces", requireAuth(), requirePermission('inventory:read'), async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    const search = req.query.search as string | undefined;
    const tenantConnectionId = req.query.tenantConnectionId as string | undefined;

    const orgTenantIds = await getOrgTenantConnectionIds(user);

    // If a specific tenantConnectionId is requested, verify the user may access it
    if (tenantConnectionId && orgTenantIds !== null && !orgTenantIds.includes(tenantConnectionId)) {
      return res.json([]);
    }

    const allWorkspaces = await storage.getWorkspaces(search, tenantConnectionId);

    // Apply org-level isolation: only include workspaces whose tenantConnectionId
    // is in the user's org. Workspaces with no tenantConnectionId are unscoped and
    // excluded for non-platform-owner users (they cannot be attributed to an org).
    const filtered = orgTenantIds !== null
      ? allWorkspaces.filter(w => w.tenantConnectionId && orgTenantIds.includes(w.tenantConnectionId))
      : allWorkspaces;

    res.json(filtered);
  });

  app.get("/api/workspaces/:id", requireAuth(), requirePermission('inventory:read'), async (req, res) => {
    const workspace = await storage.getWorkspace(req.params.id);
    if (!workspace) return res.status(404).json({ message: "Workspace not found" });

    const user = (req as AuthenticatedRequest).user;
    const orgTenantIds = await getOrgTenantConnectionIds(user);
    if (orgTenantIds !== null && (!workspace.tenantConnectionId || !orgTenantIds.includes(workspace.tenantConnectionId))) {
      // Return 404 to avoid leaking existence of cross-org workspaces
      return res.status(404).json({ message: "Workspace not found" });
    }

    res.json(workspace);
  });

  app.post("/api/workspaces", requireAuth(), requirePermission('workspaces:manage'), async (req, res) => {
    const parsed = insertWorkspaceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

    // Ensure the tenantConnectionId (if provided) belongs to the user's org
    if (parsed.data.tenantConnectionId) {
      const user = (req as AuthenticatedRequest).user;
      const allowed = await canAccessTenantConnection(user, parsed.data.tenantConnectionId);
      if (!allowed) return res.status(403).json({ message: "Tenant connection not accessible" });
    }

    const workspace = await storage.createWorkspace(parsed.data);
    res.status(201).json(workspace);
  });

  app.patch("/api/workspaces/:id", requireAuth(), requireAnyPermission('workspaces:manage', 'workspaces:update'), async (req, res) => {
    const existing = await storage.getWorkspace(req.params.id);
    if (!existing) return res.status(404).json({ message: "Workspace not found" });

    const user = (req as AuthenticatedRequest).user;
    const orgTenantIds = await getOrgTenantConnectionIds(user);
    if (orgTenantIds !== null && (!existing.tenantConnectionId || !orgTenantIds.includes(existing.tenantConnectionId))) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const workspace = await storage.updateWorkspace(req.params.id, req.body);
    res.json(workspace);
  });

  app.delete("/api/workspaces/:id", requireAuth(), requirePermission('workspaces:manage'), async (req, res) => {
    const existing = await storage.getWorkspace(req.params.id);
    if (!existing) return res.status(404).send();

    const user = (req as AuthenticatedRequest).user;
    const orgTenantIds = await getOrgTenantConnectionIds(user);
    if (orgTenantIds !== null && (!existing.tenantConnectionId || !orgTenantIds.includes(existing.tenantConnectionId))) {
      return res.status(404).send();
    }

    await storage.deleteWorkspace(req.params.id);
    res.status(204).send();
  });

  app.patch("/api/workspaces/bulk/update", requireAuth(), requirePermission('workspaces:manage'), async (req, res) => {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "ids array is required" });
    }

    // Verify all requested workspace IDs are accessible by this user's org
    const user = (req as AuthenticatedRequest).user;
    const orgTenantIds = await getOrgTenantConnectionIds(user);
    if (orgTenantIds !== null) {
      for (const id of ids) {
        const ws = await storage.getWorkspace(id);
        if (!ws || !ws.tenantConnectionId || !orgTenantIds.includes(ws.tenantConnectionId)) {
          return res.status(403).json({ message: `Workspace ${id} is not accessible` });
        }
      }
    }

    await storage.bulkUpdateWorkspaces(ids, updates);
    res.json({ message: "Bulk update complete", count: ids.length });
  });

  // ── Provisioning Requests ──
  // NOTE: provisioningRequests has no organizationId column, so full org-level
  // isolation is not possible without a schema migration. Auth enforcement is
  // applied here; full isolation is tracked as a P1 gap (schema migration required).
  app.get("/api/provisioning-requests", requireAuth(), requireAnyPermission('provisioning:read', 'provisioning:manage'), async (_req, res) => {
    const requests = await storage.getProvisioningRequests();
    res.json(requests);
  });

  app.get("/api/provisioning-requests/:id", requireAuth(), requireAnyPermission('provisioning:read', 'provisioning:manage'), async (req, res) => {
    const request = await storage.getProvisioningRequest(req.params.id);
    if (!request) return res.status(404).json({ message: "Request not found" });
    res.json(request);
  });

  app.post("/api/provisioning-requests", requireAuth(), requireAnyPermission('provisioning:create', 'provisioning:manage'), async (req, res) => {
    const parsed = insertProvisioningRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const user = (req as AuthenticatedRequest).user!;
    const request = await storage.createProvisioningRequest({
      ...parsed.data,
      requestedBy: user.email,
    });
    res.status(201).json(request);
  });

  app.patch("/api/provisioning-requests/:id/status", requireAuth(), requirePermission('provisioning:manage'), async (req, res) => {
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
  app.get("/api/workspaces/:id/copilot-rules", requireAuth(), requirePermission('inventory:read'), async (req, res) => {
    const rules = await storage.getCopilotRules(req.params.id);
    res.json(rules);
  });

  app.put("/api/workspaces/:id/copilot-rules", requireAuth(), requirePermission('copilot:manage'), async (req, res) => {
    const { rules } = req.body;
    if (!Array.isArray(rules)) {
      return res.status(400).json({ message: "rules array is required" });
    }
    const created = await storage.setCopilotRules(req.params.id, rules);
    res.json(created);
  });

  // ── Dashboard Stats ──
  app.get("/api/stats", requireAuth(), requirePermission('inventory:read'), async (req, res) => {
    const user = (req as AuthenticatedRequest).user;
    const orgTenantIds = await getOrgTenantConnectionIds(user);

    const allWorkspaces = await storage.getWorkspaces();
    const scopedWorkspaces = orgTenantIds !== null
      ? allWorkspaces.filter(w => w.tenantConnectionId && orgTenantIds.includes(w.tenantConnectionId))
      : allWorkspaces;

    const total = scopedWorkspaces.length;
    const copilotReady = scopedWorkspaces.filter(w => w.copilotReady).length;
    const metadataComplete = scopedWorkspaces.filter(w => w.metadataStatus === "COMPLETE").length;
    const metadataMissing = scopedWorkspaces.filter(w => w.metadataStatus === "MISSING_REQUIRED").length;
    const highlyConfidential = scopedWorkspaces.filter(w => w.sensitivity === "HIGHLY_CONFIDENTIAL").length;

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
  app.get("/api/organization", requireAuth(), async (req, res) => {
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

  app.get("/api/organizations", requireAuth(), requirePermission('platform:manage'), async (_req, res) => {
    const orgs = await storage.getOrganizations();
    const withFeatures = orgs.map(org => ({
      ...org,
      features: getPlanFeatures(org.servicePlan as ServicePlanTier),
    }));
    res.json(withFeatures);
  });

  app.patch("/api/organization/plan", requireAuth(), requirePermission('settings:manage'), async (req, res) => {
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

  app.get("/api/feature-check/:feature", requireAuth(), async (req, res) => {
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
  app.get("/api/admin/tenants", requireAuth(), requirePermission('tenants:manage'), async (req, res) => {
    const user = (req as AuthenticatedRequest).user!;
    // PLATFORM_OWNER sees all; org admins see only their org's connections
    const connections = user.role === ZENITH_ROLES.PLATFORM_OWNER || !user.organizationId
      ? await storage.getTenantConnections()
      : await storage.getTenantConnectionsByOrganization(user.organizationId);

    const safe = connections.map(c => ({
      ...c,
      clientSecret: undefined,
      clientId: c.clientId ? `${c.clientId.substring(0, 8)}...` : undefined,
    }));
    res.json(safe);
  });

  app.get("/api/admin/tenants/consent/initiate", requireAuth(), requirePermission('tenants:manage'), async (req, res) => {
    const clientId = process.env.AZURE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: "Zenith Entra app is not configured. Set AZURE_CLIENT_ID first." });
    }

    const user = (req as AuthenticatedRequest).user!;
    if (!user.organizationId) {
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

  // OAuth redirect — no requireAuth() here; session is validated via nonce
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

  app.get("/api/admin/tenants/:id", requireAuth(), requirePermission('tenants:manage'), async (req, res) => {
    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

    const user = (req as AuthenticatedRequest).user!;
    if (user.role !== ZENITH_ROLES.PLATFORM_OWNER && user.organizationId && connection.organizationId !== user.organizationId) {
      return res.status(404).json({ message: "Tenant connection not found" });
    }

    res.json({ ...connection, clientSecret: undefined });
  });

  app.post("/api/admin/tenants", requireAuth(), requirePermission('tenants:manage'), async (req, res) => {
    const { tenantId, tenantName, domain, ownershipType } = req.body;
    if (!tenantId || !domain) {
      return res.status(400).json({ message: "tenantId and domain are required" });
    }
    // Always scope new connections to the requesting user's org
    const user = (req as AuthenticatedRequest).user!;
    const connection = await storage.createTenantConnection({
      tenantId,
      tenantName: tenantName || domain.split('.')[0],
      domain,
      ownershipType: ownershipType || 'MSP',
      organizationId: user.organizationId || null,
      status: 'PENDING',
      consentGranted: false,
    });
    res.status(201).json({ ...connection, clientSecret: undefined });
  });

  app.patch("/api/admin/tenants/:id", requireAuth(), requirePermission('tenants:manage'), async (req, res) => {
    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

    const user = (req as AuthenticatedRequest).user!;
    if (user.role !== ZENITH_ROLES.PLATFORM_OWNER && user.organizationId && connection.organizationId !== user.organizationId) {
      return res.status(404).json({ message: "Tenant connection not found" });
    }

    const updates = { ...req.body };
    // P0 fix: encrypt client secret at rest before persisting
    if (updates.clientSecret) {
      updates.clientSecret = encryptToken(updates.clientSecret);
    }

    const updated = await storage.updateTenantConnection(req.params.id, updates);
    res.json({ ...updated, clientSecret: undefined });
  });

  app.delete("/api/admin/tenants/:id", requireAuth(), requirePermission('tenants:manage'), async (req, res) => {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    const user = (req as AuthenticatedRequest).user!;
    if (user.role !== ZENITH_ROLES.PLATFORM_OWNER && user.organizationId && conn.organizationId !== user.organizationId) {
      return res.status(404).json({ message: "Tenant connection not found" });
    }

    if (conn.clientId) clearTokenCache(conn.tenantId, conn.clientId);
    await storage.deleteTenantConnection(req.params.id);
    res.status(204).send();
  });

  app.post("/api/admin/tenants/test", requireAuth(), requirePermission('tenants:manage'), async (req, res) => {
    const { tenantId } = req.body;
    const clientId = req.body.clientId || process.env.AZURE_CLIENT_ID;
    const clientSecret = req.body.clientSecret || process.env.AZURE_CLIENT_SECRET;
    if (!tenantId || !clientId || !clientSecret) {
      return res.status(400).json({ message: "tenantId is required, and Zenith app credentials must be configured" });
    }
    const result = await testConnection(tenantId, clientId, clientSecret);
    res.json(result);
  });

  app.post("/api/admin/tenants/:id/sync", requireAuth(), requirePermission('tenants:manage'), async (req, res) => {
    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

    const user = (req as AuthenticatedRequest).user!;
    if (user.role !== ZENITH_ROLES.PLATFORM_OWNER && user.organizationId && connection.organizationId !== user.organizationId) {
      return res.status(404).json({ message: "Tenant connection not found" });
    }

    const clientId = connection.clientId || process.env.AZURE_CLIENT_ID;
    // P0 fix: decrypt stored secret before passing to Graph service
    const rawSecret = connection.clientSecret || process.env.AZURE_CLIENT_SECRET;
    const clientSecret = rawSecret ? decryptToken(rawSecret) : undefined;

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

      let upsertedCount = 0;
      for (const site of result.sites) {
        const existing = await storage.getWorkspaceByM365ObjectId(site.id);
        if (existing) {
          await storage.updateWorkspace(existing.id, {
            displayName: site.displayName || existing.displayName,
            siteUrl: site.webUrl || existing.siteUrl,
            description: site.description || existing.description,
            tenantConnectionId: req.params.id,
          });
        } else {
          await storage.createWorkspace({
            displayName: site.displayName || 'Untitled Site',
            type: 'TEAM_SITE',
            m365ObjectId: site.id,
            siteUrl: site.webUrl,
            description: site.description || null,
            tenantConnectionId: req.params.id,
          });
        }
        upsertedCount++;
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
        upserted: upsertedCount,
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
  app.get("/api/admin/domain-blocklist", requireAuth(), requirePermission('tenants:manage'), async (_req, res) => {
    try {
      const domains = await storage.getBlockedDomains();
      res.json(domains);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/domain-blocklist", requireAuth(), requirePermission('tenants:manage'), async (req, res) => {
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
      const user = (req as AuthenticatedRequest).user!;
      const entry = await storage.addBlockedDomain({
        domain: normalizedDomain,
        reason: reason || null,
        createdBy: user.id,
      });
      res.status(201).json(entry);
    } catch (err: any) {
      if (err.message?.includes("unique") || err.code === '23505') {
        return res.status(409).json({ error: "Domain is already blocked" });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/admin/domain-blocklist/:domain", requireAuth(), requirePermission('tenants:manage'), async (req, res) => {
    try {
      await storage.removeBlockedDomain(decodeURIComponent(req.params.domain));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}
