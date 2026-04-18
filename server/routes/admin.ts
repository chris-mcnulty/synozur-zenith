import { Router } from "express";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { ZENITH_ROLES, SERVICE_PLANS, type ServicePlanTier } from "@shared/schema";
import { storage } from "../storage";
import { getPlanFeatures } from "../services/feature-gate";
import { invalidateDefaultSignupPlanCache } from "../utils/platformSettingsCache";
import { buildRequiredFieldsByTenantId, evaluateMetadataCompleteness } from "../services/metadata-completeness";
import { getOrgTenantConnectionIds } from "./scope-helpers";

const router = Router();

// Resolve which tenant connection IDs the dashboard should aggregate over.
// If the client passed ?tenantConnectionId=..., narrow to just that one (after
// verifying the caller is allowed to see it). Otherwise return all of the
// org's tenant IDs (existing org-wide behavior). Returns null when the caller
// has no scope at all.
async function resolveDashboardTenantIds(
  req: AuthenticatedRequest,
  requested: string | undefined,
): Promise<{ tenantIds: string[]; forbidden?: boolean }> {
  const allowed = await getOrgTenantConnectionIds(req);
  // Platform Owner with no allow-list = global; we still scope to the active
  // org's own tenants for the dashboard so per-tenant totals make sense.
  const orgId = req.activeOrganizationId;
  const orgTenants = orgId ? await storage.getTenantConnections(orgId) : [];
  const orgTenantIds = orgTenants.map(t => t.id);

  if (requested) {
    const isAllowed = allowed === null || allowed.includes(requested);
    if (!isAllowed) return { tenantIds: [], forbidden: true };
    return { tenantIds: [requested] };
  }
  return { tenantIds: orgTenantIds };
}

// ── Dashboard Stats ──
router.get("/api/stats", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const orgId = req.activeOrganizationId;
  const requestedTenantId = typeof req.query.tenantConnectionId === "string" && req.query.tenantConnectionId.length > 0
    ? req.query.tenantConnectionId
    : undefined;

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

  const { tenantIds, forbidden } = await resolveDashboardTenantIds(req, requestedTenantId);
  if (forbidden) return res.status(403).json({ error: "Access denied to the requested tenant" });

  let allWorkspaces: Awaited<ReturnType<typeof storage.getWorkspaces>> = [];
  if (tenantIds.length > 0) {
    const perTenantResults = await Promise.all(
      tenantIds.map(tid => storage.getWorkspaces(undefined, tid))
    );
    allWorkspaces = perTenantResults.flat();
  }

  const total = allWorkspaces.length;
  const copilotReady = allWorkspaces.filter(w => w.copilotReady).length;

  // Dynamic metadata completeness — evaluate each workspace against its tenant's
  // configured Required Metadata Fields (Data Dictionary). Tenants with zero
  // required fields configured pass automatically. The legacy static
  // `workspace.metadataStatus` field is no longer consulted because it is set
  // only at provisioning time and never recomputed.
  const requiredFieldsByTenantId = await buildRequiredFieldsByTenantId(allWorkspaces);
  let metadataComplete = 0;
  let metadataMissing = 0;
  for (const ws of allWorkspaces) {
    const fields = ws.tenantConnectionId ? (requiredFieldsByTenantId[ws.tenantConnectionId] || []) : [];
    if (evaluateMetadataCompleteness(ws, fields).pass) metadataComplete++;
    else metadataMissing++;
  }
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
  const requestedTenantId = typeof req.query.tenantConnectionId === "string" && req.query.tenantConnectionId.length > 0
    ? req.query.tenantConnectionId
    : undefined;

  // Service Status — always show all of the org's tenants in the status panel,
  // regardless of which one is selected (it's the per-tenant health overview).
  const tenants = await storage.getTenantConnections(orgId);

  // Workspace aggregates respect the tenant selector when one is chosen.
  const { tenantIds, forbidden } = await resolveDashboardTenantIds(req, requestedTenantId);
  if (forbidden) return res.status(403).json({ error: "Access denied to the requested tenant" });

  let allWorkspaces: Awaited<ReturnType<typeof storage.getWorkspaces>> = [];
  if (tenantIds.length > 0) {
    const perTenantResults = await Promise.all(
      tenantIds.map(tid => storage.getWorkspaces(undefined, tid))
    );
    allWorkspaces = perTenantResults.flat();
  }

  // Alert 1: Missing required metadata — dynamic per-tenant evaluation
  const requiredFieldsByTenantIdForAlerts = await buildRequiredFieldsByTenantId(allWorkspaces);
  const missingMetadata = allWorkspaces.filter(w => {
    const fields = w.tenantConnectionId ? (requiredFieldsByTenantIdForAlerts[w.tenantConnectionId] || []) : [];
    return !evaluateMetadataCompleteness(w, fields).pass;
  }).length;

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
  const { rows: recentActivity } = await storage.getAuditLog({ orgId, limit: 5 });

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

// ── Audit Log ──
router.get("/api/audit-log", requireAuth(), requireRole(ZENITH_ROLES.PLATFORM_OWNER, ZENITH_ROLES.TENANT_ADMIN, ZENITH_ROLES.AUDITOR), async (req: AuthenticatedRequest, res) => {
  try {
    const orgId = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER
      ? (req.query.orgId as string | undefined)
      : (req.activeOrganizationId || req.user?.organizationId || undefined);

    const {
      action,
      resource,
      userId,
      userEmail,
      result,
      startDate: startDateStr,
      endDate: endDateStr,
      page: pageStr,
      limit: limitStr,
    } = req.query as Record<string, string | undefined>;

    const limit = Math.min(parseInt(limitStr || "50", 10), 500);
    const page = Math.max(parseInt(pageStr || "1", 10), 1);
    const offset = (page - 1) * limit;

    const startDate = startDateStr ? new Date(startDateStr) : undefined;
    const endDate = endDateStr ? new Date(endDateStr + "T23:59:59.999Z") : undefined;

    const { rows, total } = await storage.getAuditLog({
      orgId,
      action: action || undefined,
      resource: resource || undefined,
      userId: userId || undefined,
      userEmail: userEmail || undefined,
      result: result || undefined,
      startDate,
      endDate,
      limit,
      offset,
    });

    res.json({ rows, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Organization & Service Plan ──
router.get("/api/organization", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  const idParam = req.query.id as string | undefined;

  const id = isPlatformOwner
    ? idParam
    : (req.activeOrganizationId || req.user?.organizationId || idParam);

  let org = await storage.getOrganization(id);
  if (!org) {
    if (isPlatformOwner) {
      org = await storage.upsertOrganization({
        name: "The Synozur Alliance",
        domain: "synozur.onmicrosoft.com",
        servicePlan: "ENTERPRISE",
        supportEmail: "it-support@synozur.demo",
      });
    } else {
      return res.status(404).json({ error: "Organization not found" });
    }
  }

  if (!isPlatformOwner && org.id !== (req.activeOrganizationId || req.user?.organizationId)) {
    return res.status(403).json({ error: "Access denied" });
  }

  const plan = org.servicePlan as ServicePlanTier;
  const features = getPlanFeatures(plan);
  res.json({ ...org, features });
});

router.get("/api/organizations", requireAuth(), requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (_req: AuthenticatedRequest, res) => {
  const orgs = await storage.getOrganizations();
  const withFeatures = orgs.map(org => ({
    ...org,
    features: getPlanFeatures(org.servicePlan as ServicePlanTier),
  }));
  res.json(withFeatures);
});

router.get("/api/admin/platform/org-stats", requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (_req: AuthenticatedRequest, res) => {
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

router.get("/api/admin/organizations/:id/data-counts", requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (req: AuthenticatedRequest, res) => {
  const id = req.params.id as string;
  const target = await storage.getOrganization(id);
  if (!target) return res.status(404).json({ error: "Organization not found." });
  const counts = await storage.getOrganizationDataCounts(id);
  res.json(counts);
});

router.delete("/api/admin/organizations/:id", requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const purgeData = req.query.purgeData !== 'false';
  const callerOrg = await storage.getOrganization(req.user!.organizationId!);
  if (callerOrg?.id === id) {
    return res.status(400).json({ error: "You cannot delete your own organization." });
  }
  const target = await storage.getOrganization(id);
  if (!target) return res.status(404).json({ error: "Organization not found." });

  const targetName = target.name;

  if (purgeData) {
    await storage.purgeOrganizationData(id);
  } else {
    await storage.deleteOrganization(id);
  }

  await storage.createAuditEntry({
    userId: req.user!.id,
    userEmail: req.user!.email,
    action: 'ORG_DELETED_BY_ADMIN',
    resource: 'organization',
    resourceId: id,
    organizationId: undefined,
    details: { organizationName: targetName, deletedBy: req.user!.email, purgeData },
    result: 'SUCCESS',
    ipAddress: req.ip || null,
  });

  res.json({ ok: true });
});

router.patch("/api/admin/organizations/:id/plan", requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (req: AuthenticatedRequest, res) => {
  const { id } = req.params;
  const { plan } = req.body;
  if (!SERVICE_PLANS.includes(plan)) {
    return res.status(400).json({ error: `Invalid plan. Must be one of: ${SERVICE_PLANS.join(", ")}` });
  }
  const target = await storage.getOrganization(id);
  if (!target) return res.status(404).json({ error: "Organization not found." });
  const updated = await storage.updateOrganizationPlan(id, plan);
  if (!updated) return res.status(500).json({ error: "Failed to update plan." });
  const features = getPlanFeatures(plan as ServicePlanTier);
  await storage.createAuditEntry({
    userId: req.user!.id,
    userEmail: req.user!.email,
    action: 'ORG_PLAN_CHANGED_BY_ADMIN',
    resource: 'organization',
    resourceId: id,
    organizationId: req.user!.organizationId,
    details: { targetOrg: target.name, fromPlan: target.servicePlan, toPlan: plan },
    result: 'SUCCESS',
    ipAddress: req.ip || null,
  });
  res.json({ ...updated, features });
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
    const { defaultSignupPlan, plannerPlanId, plannerBucketId } = req.body ?? {};

    const patch: { defaultSignupPlan?: string; plannerPlanId?: string | null; plannerBucketId?: string | null; updatedBy?: string | null } = {
      updatedBy: req.user?.id ?? null,
    };

    if (defaultSignupPlan !== undefined) {
      if (!defaultSignupPlan || !SERVICE_PLANS.includes(defaultSignupPlan)) {
        return res.status(400).json({ error: `Invalid defaultSignupPlan. Must be one of: ${SERVICE_PLANS.join(", ")}` });
      }
      patch.defaultSignupPlan = defaultSignupPlan;
    }

    // Planner Plan/Bucket IDs are GUIDs from Microsoft Graph. Allow null/empty
    // string to clear the value (which disables the integration), otherwise
    // require a non-trivial string. We do not enforce a strict GUID regex
    // because Planner ids are opaque tokens, not standard UUIDs.
    if (plannerPlanId !== undefined) {
      if (plannerPlanId === null || plannerPlanId === "") {
        patch.plannerPlanId = null;
      } else if (typeof plannerPlanId !== "string" || plannerPlanId.trim().length < 8) {
        return res.status(400).json({ error: "plannerPlanId must be at least 8 characters" });
      } else {
        patch.plannerPlanId = plannerPlanId.trim();
      }
    }
    if (plannerBucketId !== undefined) {
      if (plannerBucketId === null || plannerBucketId === "") {
        patch.plannerBucketId = null;
      } else if (typeof plannerBucketId !== "string" || plannerBucketId.trim().length < 8) {
        return res.status(400).json({ error: "plannerBucketId must be at least 8 characters" });
      } else {
        patch.plannerBucketId = plannerBucketId.trim();
      }
    }

    const updated = await storage.updatePlatformSettings(patch);
    invalidateDefaultSignupPlanCache();
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Domain Blocklist ──
router.get("/api/admin/domain-blocklist", requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (_req: AuthenticatedRequest, res) => {
  try {
    const domains = await storage.getBlockedDomains();
    res.json(domains);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/domain-blocklist", requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (req: AuthenticatedRequest, res) => {
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

router.delete("/api/admin/domain-blocklist/:domain", requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (req: AuthenticatedRequest, res) => {
  try {
    await storage.removeBlockedDomain(decodeURIComponent(req.params.domain));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
