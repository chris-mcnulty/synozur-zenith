import { Router } from "express";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { ZENITH_ROLES, SERVICE_PLANS, type ServicePlanTier } from "@shared/schema";
import { storage } from "../storage";
import { getPlanFeatures } from "../services/feature-gate";

const router = Router();

// ── Dashboard Stats ──
router.get("/api/stats", requireAuth(), async (_req: AuthenticatedRequest, res) => {
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

router.post("/api/admin/organizations", requireRole(ZENITH_ROLES.PLATFORM_OWNER), async (req: AuthenticatedRequest, res) => {
  const { name, domain, servicePlan, supportEmail } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Organization name is required." });
  if (!domain?.trim()) return res.status(400).json({ error: "Primary domain is required." });
  if (servicePlan && !SERVICE_PLANS.includes(servicePlan)) {
    return res.status(400).json({ error: `Invalid service plan. Must be one of: ${SERVICE_PLANS.join(", ")}` });
  }
  const org = await storage.upsertOrganization({
    name: name.trim(),
    domain: domain.trim().toLowerCase(),
    servicePlan: servicePlan || "TRIAL",
    supportEmail: supportEmail?.trim() || null,
  });
  res.status(201).json(org);
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
