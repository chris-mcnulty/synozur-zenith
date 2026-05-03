import { Router, type Request, type Response, type NextFunction } from "express";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { decryptToken } from "../utils/encryption";
import {
  signHs256,
} from "../services/galaxy-jwt";
import {
  requireGalaxyClient,
  requireGalaxyUser,
  requireGalaxyUserRateLimit,
  galaxyAuditCtx,
  getTokenSigningSecret,
  GALAXY_TOKEN_AUDIENCE,
  GALAXY_TOKEN_ISSUER,
  type GalaxyAuthedRequest,
} from "../middleware/galaxy-auth";
import { logGalaxyAudit, AUDIT_ACTIONS } from "../services/audit-logger";
import { getPlanFeatures } from "../services/feature-gate";
import { GALAXY_SCOPES, type GalaxyScope, type ServicePlanTier } from "@shared/schema";
import { check as rateCheck } from "../services/galaxy-rate-limit";
import { galaxyOpenApiSpec } from "./galaxy-openapi";

const router = Router();

// ── OAuth2 client_credentials token endpoint ───────────────────────────────
const tokenSchema = z.object({
  grant_type: z.literal("client_credentials"),
  client_id: z.string().min(1),
  client_secret: z.string().min(1),
  scope: z.string().optional(),
});

router.post("/api/galaxy/oauth/token", async (req: Request, res: Response) => {
  // Apply a coarse anti-bruteforce rate limit per source IP regardless of
  // success/failure. We don't want to leak whether a clientId is registered.
  const ipKey = `token-ip:${req.ip || "unknown"}`;
  const ipRate = rateCheck(ipKey, 60);
  if (!ipRate.allowed) {
    res.setHeader("Retry-After", String(ipRate.retryAfterSeconds));
    return res.status(429).json({ error: "rate_limit_exceeded" });
  }

  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_request", error_description: "Missing or invalid fields" });
  }
  const { client_id, client_secret, scope } = parsed.data;

  const client = await storage.getGalaxyClientByClientId(client_id);
  // Constant-time-ish handling: always do a comparable amount of work even if
  // the client doesn't exist, so we don't leak existence via timing.
  const dummy = "$$dummy$$";
  const stored = client ? decryptToken(client.clientSecretEncrypted) : dummy;
  const presented = client_secret;
  const ok = client && stored.length === presented.length &&
    crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(presented));

  if (!client || !ok || client.status !== "ACTIVE") {
    if (client) {
      await logGalaxyAudit(
        {
          galaxyClientId: client.id,
          galaxyClientName: client.name,
          organizationId: null,
          ipAddress: req.ip,
        },
        {
          action: AUDIT_ACTIONS.GALAXY_TOKEN_DENIED,
          resource: "galaxy_oauth_token",
          result: "DENIED",
          details: { reason: client.status !== "ACTIVE" ? "client_disabled" : "bad_secret" },
        },
      );
    }
    return res.status(401).json({ error: "invalid_client", error_description: "Authentication failed" });
  }

  // Determine granted scopes: requested ∩ allowed (default = all allowed).
  const requested = (scope ?? "").split(/\s+/).filter(Boolean);
  let granted: string[];
  if (requested.length === 0) {
    granted = client.allowedScopes;
  } else {
    granted = requested.filter((s) => client.allowedScopes.includes(s));
    if (granted.length === 0) {
      return res.status(400).json({ error: "invalid_scope", error_description: "No requested scope is allowed for this client" });
    }
  }

  const ttl = client.tokenTtlSeconds || 900;
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttl;
  const jti = crypto.randomUUID();
  const claims = {
    iss: GALAXY_TOKEN_ISSUER,
    aud: GALAXY_TOKEN_AUDIENCE,
    sub: client.clientId,
    galaxy_client_id: client.id,
    scope: granted.join(" "),
    iat: now,
    exp,
    jti,
  };
  const token = signHs256(claims, getTokenSigningSecret());

  await storage.recordGalaxyTokenIssuance({
    jti,
    galaxyClientId: client.id,
    scopes: granted,
    expiresAt: new Date(exp * 1000),
  });

  await logGalaxyAudit(
    {
      galaxyClientId: client.id,
      galaxyClientName: client.name,
      organizationId: null,
      ipAddress: req.ip,
    },
    {
      action: AUDIT_ACTIONS.GALAXY_TOKEN_ISSUED,
      resource: "galaxy_oauth_token",
      resourceId: jti,
      result: "SUCCESS",
      details: { scopes: granted, ttl_seconds: ttl },
    },
  );

  return res.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: ttl,
    scope: granted.join(" "),
    issued_jti: jti,
  });
});

// ── OpenAPI spec (public) ───────────────────────────────────────────────────
router.get("/api/galaxy/v1/openapi.json", (_req, res) => {
  res.json(galaxyOpenApiSpec);
});

// ── Helpers ────────────────────────────────────────────────────────────────
function paginate(req: Request) {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize ?? "50"), 10) || 50));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function envelope<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize) || 1,
    },
  };
}

async function ensureFeature(
  req: GalaxyAuthedRequest,
  res: Response,
  feature: keyof ReturnType<typeof getPlanFeatures>,
): Promise<boolean> {
  const orgId = req.galaxyOrganizationId!;
  const org = await storage.getOrganization(orgId);
  if (!org) {
    res.status(404).json({ error: "organization_not_found" });
    return false;
  }
  const features = getPlanFeatures(org.servicePlan as ServicePlanTier);
  if (!features[feature]) {
    res.status(403).json({ error: "feature_not_available", feature, plan: org.servicePlan });
    return false;
  }
  return true;
}

async function logRead(req: GalaxyAuthedRequest, resource: string, extra?: Record<string, any>) {
  await logGalaxyAudit(galaxyAuditCtx(req), {
    action: AUDIT_ACTIONS.GALAXY_API_READ,
    resource,
    result: "SUCCESS",
    extraDetails: extra,
  });
}

async function getOrgTenantIds(orgId: string): Promise<string[]> {
  const conns = await storage.getTenantConnectionsByOrganization(orgId);
  return conns.map((c) => c.id);
}

// ── Wrap all v1/* with both client + user requirements ─────────────────────
const v1Read = [
  requireGalaxyClient("galaxy.read" as GalaxyScope),
  requireGalaxyUser(),
  requireGalaxyUserRateLimit(120),
];
const v1Interact = [
  requireGalaxyClient("galaxy.interact" as GalaxyScope),
  requireGalaxyUser(),
  requireGalaxyUserRateLimit(60),
];

// ── Identity ───────────────────────────────────────────────────────────────
router.get("/api/galaxy/v1/me", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  const org = await storage.getOrganization(req.galaxyOrganizationId!);
  res.json({
    user: {
      sub: req.galaxyUser!.sub,
      email: req.galaxyUser!.email,
      name: req.galaxyUser!.name ?? null,
    },
    organization: org
      ? { id: org.id, name: org.name, servicePlan: org.servicePlan }
      : null,
    client: {
      id: req.galaxyClient!.id,
      name: req.galaxyClient!.name,
    },
    scopes: req.galaxyTokenScopes ?? [],
  });
});

// ── Tenants ────────────────────────────────────────────────────────────────
router.get("/api/galaxy/v1/tenants", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  const tenants = await storage.getTenantConnectionsByOrganization(req.galaxyOrganizationId!);
  await logRead(req, "galaxy_tenants");
  res.json({
    items: tenants.map((t) => ({
      id: t.id,
      tenantId: t.tenantId,
      displayName: t.tenantName,
      status: t.status,
      createdAt: t.createdAt,
    })),
  });
});

// ── Workspaces (M365 sites/teams inventory) ────────────────────────────────
router.get("/api/galaxy/v1/workspaces", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  const { page, pageSize } = paginate(req);
  const search = req.query.search ? String(req.query.search) : undefined;
  const result = await storage.getWorkspacesPaginated({
    page,
    pageSize,
    search,
    organizationId: req.galaxyOrganizationId!,
  });
  await logRead(req, "galaxy_workspaces", { page, pageSize });
  res.json(envelope(result.items, result.total, page, pageSize));
});

// ── Lifecycle: orphaned/stale ─────────────────────────────────────────────
router.get("/api/galaxy/v1/lifecycle/scan-runs", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  let runs: any[] = [];
  try {
    runs = await storage.getLifecycleScanRuns({ organizationId: req.galaxyOrganizationId!, limit: 50 });
  } catch (err) {
    // Lifecycle scanning is optional; don't 500 partner clients if the
    // feature/table isn't provisioned in this environment.
    runs = [];
  }
  await logRead(req, "galaxy_lifecycle_scan_runs");
  res.json({ items: runs });
});

router.get("/api/galaxy/v1/lifecycle/orphaned", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  const tenantIds = await getOrgTenantIds(req.galaxyOrganizationId!);
  const items: any[] = [];
  for (const tid of tenantIds) {
    const orphans = await storage.getOrphanedWorkspaces(tid);
    items.push(...orphans.map((w) => ({
      workspaceId: w.id,
      tenantConnectionId: tid,
      displayName: w.displayName,
      siteUrl: w.siteUrl ?? null,
      type: w.type,
    })));
  }
  await logRead(req, "galaxy_lifecycle_orphaned");
  res.json({ items });
});

// ── Sharing-link governance ────────────────────────────────────────────────
router.get("/api/galaxy/v1/sharing-links", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  if (!(await ensureFeature(req, res, "sharingLinkManagement"))) return;
  const { page, pageSize } = paginate(req);
  const tenantConnectionId = String(req.query.tenantConnectionId ?? "");
  if (!tenantConnectionId) {
    return res.status(400).json({ error: "missing_parameter", parameter: "tenantConnectionId" });
  }
  // Verify tenant belongs to org
  const tenants = await getOrgTenantIds(req.galaxyOrganizationId!);
  if (!tenants.includes(tenantConnectionId)) {
    return res.status(403).json({ error: "tenant_not_in_organization" });
  }
  const result = await storage.getSharingLinksPaginated({
    tenantConnectionId,
    resourceType: req.query.resourceType ? String(req.query.resourceType) : undefined,
    linkType: req.query.linkType ? String(req.query.linkType) : undefined,
    page,
    pageSize,
  });
  await logRead(req, "galaxy_sharing_links", { tenantConnectionId, page, pageSize });
  res.json(envelope(result.items, result.total, page, pageSize));
});

// ── Label coverage ─────────────────────────────────────────────────────────
router.get("/api/galaxy/v1/label-coverage", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  const tenantConnectionId = String(req.query.tenantConnectionId ?? "");
  const tenants = await getOrgTenantIds(req.galaxyOrganizationId!);
  if (!tenantConnectionId || !tenants.includes(tenantConnectionId)) {
    return res.status(400).json({ error: "invalid_tenant" });
  }
  const rows = await storage.getWorkspaceLabelCoverage(tenantConnectionId);
  await logRead(req, "galaxy_label_coverage", { tenantConnectionId });
  res.json({ items: rows });
});

// ── Provisioning requests ──────────────────────────────────────────────────
router.get("/api/galaxy/v1/provisioning-requests", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  const reqs = await storage.getProvisioningRequests(req.galaxyOrganizationId!);
  await logRead(req, "galaxy_provisioning_requests");
  res.json({ items: reqs });
});

// ── Copilot prompt assessments ─────────────────────────────────────────────
router.get("/api/galaxy/v1/copilot/assessments", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  if (!(await ensureFeature(req, res, "copilotPromptIntelligence"))) return;
  const { page, pageSize, offset } = paginate(req);
  const result = await storage.listCopilotPromptAssessmentsForOrg(req.galaxyOrganizationId!, {
    limit: pageSize,
    offset,
  });
  await logRead(req, "galaxy_copilot_assessments", { page, pageSize });
  res.json(envelope(result.rows, result.total, page, pageSize));
});

// ── Email storage report (latest per tenant) ───────────────────────────────
router.get("/api/galaxy/v1/email-storage-reports", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  if (!(await ensureFeature(req, res, "emailContentStorageReport"))) return;
  const tenantConnectionId = String(req.query.tenantConnectionId ?? "");
  const tenants = await getOrgTenantIds(req.galaxyOrganizationId!);
  if (!tenantConnectionId || !tenants.includes(tenantConnectionId)) {
    return res.status(400).json({ error: "invalid_tenant" });
  }
  const reports = await storage.getEmailStorageReports(tenantConnectionId, 10);
  await logRead(req, "galaxy_email_storage_reports", { tenantConnectionId });
  res.json({ items: reports });
});

// ── Teams recordings ───────────────────────────────────────────────────────
router.get("/api/galaxy/v1/teams-recordings", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  const { page, pageSize, offset } = paginate(req);
  const tenants = await getOrgTenantIds(req.galaxyOrganizationId!);
  const result = await storage.getTeamsRecordingsPaginated({
    tenantConnectionIds: tenants,
    search: req.query.search ? String(req.query.search) : undefined,
    limit: pageSize,
    offset,
  });
  await logRead(req, "galaxy_teams_recordings", { page, pageSize });
  res.json({
    ...envelope(result.rows, result.total, page, pageSize),
    aggregates: result.aggregates,
  });
});

// ── My audit-log (Galaxy-source events for this org) ───────────────────────
router.get("/api/galaxy/v1/audit-log", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  const { page, pageSize, offset } = paginate(req);
  const result = await storage.getAuditLog({
    orgId: req.galaxyOrganizationId!,
    source: "galaxy",
    limit: pageSize,
    offset,
  });
  res.json(envelope(result.rows, result.total, page, pageSize));
});

// ── Acknowledgement / interaction endpoints (low-risk writes) ──────────────
const ackBodySchema = z.object({
  resourceType: z.enum(["sharing_link", "lifecycle_finding", "copilot_blocker", "workspace", "provisioning_request"]),
  resourceId: z.string().min(1).max(512),
  action: z.enum(["ACKNOWLEDGE", "DISMISS", "COMMENT"]),
  comment: z.string().max(2000).optional(),
});

router.post("/api/galaxy/v1/acknowledgements", v1Interact, async (req: GalaxyAuthedRequest, res: Response) => {
  const parsed = ackBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  }
  const ack = await storage.createGalaxyAcknowledgement({
    organizationId: req.galaxyOrganizationId!,
    galaxyClientId: req.galaxyClient!.id,
    galaxyUserSub: req.galaxyUser!.sub,
    galaxyUserEmail: req.galaxyUser!.email,
    resourceType: parsed.data.resourceType,
    resourceId: parsed.data.resourceId,
    action: parsed.data.action,
    comment: parsed.data.comment ?? null,
  });

  const auditAction =
    parsed.data.action === "ACKNOWLEDGE"
      ? AUDIT_ACTIONS.GALAXY_FINDING_ACKNOWLEDGED
      : parsed.data.action === "DISMISS"
        ? AUDIT_ACTIONS.GALAXY_FINDING_DISMISSED
        : AUDIT_ACTIONS.GALAXY_FINDING_COMMENTED;

  await logGalaxyAudit(galaxyAuditCtx(req), {
    action: auditAction,
    resource: parsed.data.resourceType,
    resourceId: parsed.data.resourceId,
    result: "SUCCESS",
    details: { comment: parsed.data.comment ?? null },
  });

  res.status(201).json(ack);
});

router.get("/api/galaxy/v1/acknowledgements", v1Read, async (req: GalaxyAuthedRequest, res: Response) => {
  const { page, pageSize, offset } = paginate(req);
  const result = await storage.listGalaxyAcknowledgements({
    organizationId: req.galaxyOrganizationId!,
    resourceType: req.query.resourceType ? String(req.query.resourceType) : undefined,
    resourceId: req.query.resourceId ? String(req.query.resourceId) : undefined,
    galaxyUserSub: req.query.mine === "true" ? req.galaxyUser!.sub : undefined,
    limit: pageSize,
    offset,
  });
  res.json(envelope(result.rows, result.total, page, pageSize));
});

// ── Provisioning request submission (low-risk, queued for Zenith approval) ─
const provBodySchema = z.object({
  workspaceName: z.string().min(1).max(200),
  workspaceType: z.string().min(1).max(50),
  governedName: z.string().refine(
    (v) => v.startsWith("DEAL-") || v.startsWith("PORTCO-") || v.startsWith("GEN-"),
    { message: "governedName must start with DEAL-, PORTCO-, or GEN-" },
  ),
  projectType: z.enum(["DEAL", "PORTCO", "GENERAL"]).default("DEAL"),
  sensitivity: z.string().default("HIGHLY_CONFIDENTIAL"),
  externalSharing: z.boolean().default(false),
  siteOwners: z.array(z.object({
    displayName: z.string().min(1),
    mail: z.string().optional(),
    userPrincipalName: z.string().optional(),
  })).min(2, "At least two owners are required"),
  tenantConnectionId: z.string().optional(),
});

router.post("/api/galaxy/v1/provisioning-requests", v1Interact, async (req: GalaxyAuthedRequest, res: Response) => {
  const parsed = provBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  }
  if (parsed.data.tenantConnectionId) {
    const tenants = await getOrgTenantIds(req.galaxyOrganizationId!);
    if (!tenants.includes(parsed.data.tenantConnectionId)) {
      return res.status(403).json({ error: "tenant_not_in_organization" });
    }
  }
  // Galaxy users submit a request; Zenith's normal approval flow handles it.
  const created = await storage.createProvisioningRequest({
    organizationId: req.galaxyOrganizationId!,
    workspaceName: parsed.data.workspaceName,
    workspaceType: parsed.data.workspaceType,
    governedName: parsed.data.governedName,
    projectType: parsed.data.projectType,
    sensitivity: parsed.data.sensitivity,
    externalSharing: parsed.data.externalSharing,
    siteOwners: parsed.data.siteOwners,
    tenantConnectionId: parsed.data.tenantConnectionId ?? null,
  } as any);

  await logGalaxyAudit(galaxyAuditCtx(req), {
    action: AUDIT_ACTIONS.GALAXY_PROVISIONING_REQUESTED,
    resource: "provisioning_request",
    resourceId: (created as any)?.id ?? null,
    result: "SUCCESS",
    details: {
      workspaceType: parsed.data.workspaceType,
      workspaceName: parsed.data.workspaceName,
    },
  });
  res.status(201).json(created);
});

// Catch-all for /api/galaxy/v1/* that didn't match
router.use("/api/galaxy/v1", (req, res) => {
  res.status(404).json({ error: "not_found", path: req.path });
});

export default router;
