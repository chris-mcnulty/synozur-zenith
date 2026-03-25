import { Router } from "express";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { ZENITH_ROLES, SERVICE_PLANS, type ServicePlanTier } from "@shared/schema";
import { storage } from "../storage";
import { getPlanFeatures } from "../services/feature-gate";
import { invalidateDefaultSignupPlanCache } from "../utils/platformSettingsCache";

const router = Router();

// ── Dashboard Stats ──
router.get("/api/stats", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const orgId = req.activeOrganizationId;

  const EMPTY_STATS = {
    totalWorkspaces: 0,
    copilotReady: 0,
    copilotNotReady: 0,
    metadataComplete: 0,
    metadataMissing: 0,
    highlyConfidential: 0,
    pendingRequests: 0,
    totalRequests: 0,
  };

  if (!orgId) return res.json(EMPTY_STATS);

  // Scope workspaces to this org's tenant connections only
  const tenants = await storage.getTenantConnections(orgId);
  const tenantIds = tenants.map(t => t.id);

  let allWorkspaces: Awaited<ReturnType<typeof storage.getWorkspaces>> = [];
  if (tenantIds.length > 0) {
    const perTenantResults = await Promise.all(
      tenantIds.map(tid => storage.getWorkspaces(undefined, tid))
    );
    allWorkspaces = perTenantResults.flat();
  }

  const total = allWorkspaces.length;
  const copilotReady = allWorkspaces.filter(w => w.copilotReady).length;
  const metadataComplete = allWorkspaces.filter(w => w.metadataStatus === "COMPLETE").length;
  const metadataMissing = allWorkspaces.filter(w => w.metadataStatus === "MISSING_REQUIRED").length;
  const highlyConfidential = allWorkspaces.filter(w => w.sensitivity === "HIGHLY_CONFIDENTIAL").length;

  // Scope provisioning requests to this org
  const requests = await storage.getProvisioningRequests(orgId);
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

// ── Dashboard Data ──
router.get("/api/dashboard", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const orgId = req.activeOrganizationId;
  if (!orgId) {
    return res.status(403).json({ error: "No active organization context. Please select an organization." });
  }

  // Service Status — tenant connections for the org (used to scope workspaces too)
  const tenants = await storage.getTenantConnections(orgId);
  const tenantIds = tenants.map(t => t.id);

  // Fetch org-scoped workspaces by iterating over org's tenant connections
  let allWorkspaces: Awaited<ReturnType<typeof storage.getWorkspaces>> = [];
  if (tenantIds.length > 0) {
    const perTenantResults = await Promise.all(
      tenantIds.map(tid => storage.getWorkspaces(undefined, tid))
    );
    allWorkspaces = perTenantResults.flat();
  }

  // Alert 1: Missing required metadata
  const missingMetadata = allWorkspaces.filter(w => w.metadataStatus === "MISSING_REQUIRED").length;

  // Alert 2: Workspaces with fewer than 2 owners
  const fewOwners = allWorkspaces.filter(w => {
    const ownersArr = Array.isArray(w.siteOwners) ? w.siteOwners : [];
    const ownerCount = ownersArr.length > 0 ? ownersArr.length : (w.owners ?? 0);
    return ownerCount < 2;
  }).length;

  // Alert 3: Naming policy violations — DEAL/PORTCO project types without the expected prefix
  const namingViolations = allWorkspaces.filter(w => {
    const display = w.displayName || "";
    const type = (w.projectType || "").toUpperCase();
    if (type === "DEAL" && !display.startsWith("DEAL-")) return true;
    if (type === "PORTCO" && !display.startsWith("PORTCO-")) return true;
    return false;
  }).length;

  const alerts = [
    {
      title: "Missing Required Metadata",
      count: missingMetadata,
      desc: "Workspaces missing required metadata fields",
      urgency: "High",
    },
    {
      title: "Insufficient Owners",
      count: fewOwners,
      desc: "Workspaces with fewer than 2 active owners",
      urgency: "Medium",
    },
    {
      title: "Naming Policy Violations",
      count: namingViolations,
      desc: "Workspaces violating the expected naming prefix rule",
      urgency: "Low",
    },
  ];

  // Recent Activity — last 5 audit log entries for the org
  const recentActivity = await storage.getAuditLog(orgId, 5);

  // Build service status payload
  const serviceStatus = tenants.map(t => ({
    id: t.id,
    tenantName: t.tenantName,
    domain: t.domain,
    status: t.status,
    lastSyncAt: t.lastSyncAt,
    lastSyncStatus: t.lastSyncStatus,
  }));

  // Connected tenants count
  const activeTenantsCount = tenants.filter(t => t.status === "ACTIVE").length;

  res.json({ alerts, recentActivity, serviceStatus, activeTenantsCount });
});

// ── Organization & Service Plan ──
router.get("/api/organization", requireAuth(), async (req: AuthenticatedRequest, res) => {
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

router.get("/api/organizations", requireAuth(), async (_req: AuthenticatedRequest, res) => {
  const orgs = await storage.getOrganizations();
  const withFeatures = orgs.map(org => ({
    ...org,
    features: getPlanFeatures(org.servicePlan as ServicePlanTier),
  }));
  res.json(withFeatures);
});

router.get("/api/admin/platform/org-stats", requireRole(ZENITH_ROLES.PLATFORM_OWNER, ZENITH_ROLES.TENANT_ADMIN), async (_req: AuthenticatedRequest, res) => {
  const orgs = await storage.getOrganizations();
  const allTenants = await storage.getTenantConnections();
  const countByOrg: Record<string, number> = {};
  for (const t of allTenants) {
    if (t.organizationId) countByOrg[t.organizationId] = (countByOrg[t.organizationId] || 0) + 1;
  }
  const result = orgs.map(org => ({
    ...org,
    features: getPlanFeatures(org.servicePlan as ServicePlanTier),
    tenantCount: countByOrg[org.id] || 0,
  }));
  res.json(result);
});

router.post("/api/admin/organizations", requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (req: AuthenticatedRequest, res) => {
  const { name, domain, servicePlan, supportEmail } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Organization name is required." });
  if (!domain?.trim()) return res.status(400).json({ error: "Primary domain is required." });
  if (servicePlan && !SERVICE_PLANS.includes(servicePlan)) {
    return res.status(400).json({ error: `Invalid service plan. Must be one of: ${SERVICE_PLANS.join(", ")}` });
  }
  const org = await storage.createOrganization({
    name: name.trim(),
    domain: domain.trim().toLowerCase(),
    servicePlan: servicePlan || "TRIAL",
    supportEmail: supportEmail?.trim() || null,
  });
  res.status(201).json(org);
});

router.delete("/api/admin/organizations/:id", requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const callerOrg = await storage.getOrganization(req.user!.organizationId!);
  if (callerOrg?.id === id) {
    return res.status(400).json({ error: "You cannot delete your own organization." });
  }
  const target = await storage.getOrganization(id);
  if (!target) return res.status(404).json({ error: "Organization not found." });
  await storage.deleteOrganization(id);
  res.json({ ok: true });
});

router.patch("/api/organization/plan", requireRole(ZENITH_ROLES.PLATFORM_OWNER, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
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

router.get("/api/feature-check/:feature", requireAuth(), async (req: AuthenticatedRequest, res) => {
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

// ── Platform Settings ──
router.get("/api/admin/platform/settings", requireRole(ZENITH_ROLES.TENANT_ADMIN, ZENITH_ROLES.PLATFORM_OWNER), async (_req: AuthenticatedRequest, res) => {
  try {
    const settings = await storage.getPlatformSettings();
    res.json(settings);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/admin/platform/settings", requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (req: AuthenticatedRequest, res) => {
  try {
    const { defaultSignupPlan } = req.body;
    if (!defaultSignupPlan || !SERVICE_PLANS.includes(defaultSignupPlan)) {
      return res.status(400).json({ error: `Invalid defaultSignupPlan. Must be one of: ${SERVICE_PLANS.join(", ")}` });
    }
    const updated = await storage.updatePlatformSettings({
      defaultSignupPlan,
      updatedBy: req.user?.id ?? null,
    });
    invalidateDefaultSignupPlanCache();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Domain Blocklist ──
router.get("/api/admin/domain-blocklist", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (_req: AuthenticatedRequest, res) => {
  try {
    const domains = await storage.getBlockedDomains();
    res.json(domains);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/domain-blocklist", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
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

router.delete("/api/admin/domain-blocklist/:domain", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    await storage.removeBlockedDomain(decodeURIComponent(req.params.domain));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
