/**
 * IA Assessment routes (Task #53)
 *
 * POST   /api/ia-assessment               — trigger a new run
 * GET    /api/ia-assessment/history       — paginated run history for org
 * GET    /api/ia-assessment/latest        — latest completed run for a tenant
 * GET    /api/ia-assessment/admin-summary — platform-owner rollup
 * GET    /api/ia-assessment/:runId        — poll a specific run
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { requireFeature } from "../services/feature-gate";
import { storage } from "../storage";
import { ZENITH_ROLES } from "@shared/schema";
import {
  runIAAssessment,
  getRunById,
  getLatestRunForTenant,
  getRunHistory,
  getAdminRunSummary,
} from "../services/ia-assessment-service";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrgTenantConnectionIds(
  user: AuthenticatedRequest["user"],
): Promise<string[] | null> {
  if (!user?.organizationId) return null;
  if (user.role === ZENITH_ROLES.PLATFORM_OWNER) return null;
  const connections = await storage.getTenantConnectionsByOrganization(user.organizationId);
  return connections.map(c => c.id);
}

async function assertTenantAccess(
  req: AuthenticatedRequest,
  tenantConnectionId: string,
): Promise<
  | { ok: true; conn: NonNullable<Awaited<ReturnType<typeof storage.getTenantConnection>>> }
  | { ok: false; status: number; message: string }
> {
  if (!tenantConnectionId) {
    return { ok: false, status: 400, message: "tenantConnectionId is required" };
  }
  const conn = await storage.getTenantConnection(tenantConnectionId);
  if (!conn) return { ok: false, status: 404, message: "Tenant connection not found" };

  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(conn.id)) {
    return { ok: false, status: 403, message: "Access denied" };
  }
  return { ok: true, conn };
}

// ---------------------------------------------------------------------------
// POST /api/ia-assessment — trigger
// ---------------------------------------------------------------------------

router.post(
  "/api/ia-assessment",
  requireAuth(),
  requireRole("operator"),
  requireFeature("iaAssessment"),
  async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({ tenantConnectionId: z.string().min(1) })
      .safeParse(req.body);

    if (!body.success) {
      return res.status(400).json({ message: "tenantConnectionId is required" });
    }

    const access = await assertTenantAccess(req, body.data.tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const orgId =
      req.activeOrganizationId || req.user?.organizationId || access.conn.organizationId || "";

    if (!orgId) {
      return res.status(400).json({ message: "No active organization context" });
    }

    const runId = await runIAAssessment(
      access.conn.id,
      orgId,
      req.user?.id ?? null,
    );

    return res.status(202).json({ runId, message: "IA assessment started" });
  },
);

// ---------------------------------------------------------------------------
// GET /api/ia-assessment/history — paginated run history
// ---------------------------------------------------------------------------

router.get(
  "/api/ia-assessment/history",
  requireAuth(),
  requireRole("operator"),
  requireFeature("iaAssessment"),
  async (req: AuthenticatedRequest, res) => {
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!orgId) {
      return res.status(400).json({ message: "No active organization" });
    }

    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 100);
    const offset = parseInt(String(req.query.offset ?? "0"), 10);
    const tenantConnectionId = typeof req.query.tenantConnectionId === "string"
      ? req.query.tenantConnectionId
      : undefined;

    if (tenantConnectionId) {
      const access = await assertTenantAccess(req, tenantConnectionId);
      if (!access.ok) return res.status(access.status).json({ message: access.message });
    }

    const { runs, total } = await getRunHistory(orgId, tenantConnectionId, limit, offset);
    return res.json({ runs, total, limit, offset });
  },
);

// ---------------------------------------------------------------------------
// GET /api/ia-assessment/latest — latest completed run for a tenant
// ---------------------------------------------------------------------------

router.get(
  "/api/ia-assessment/latest",
  requireAuth(),
  requireRole("operator"),
  requireFeature("iaAssessment"),
  async (req: AuthenticatedRequest, res) => {
    const tenantConnectionId = typeof req.query.tenantConnectionId === "string"
      ? req.query.tenantConnectionId
      : "";

    if (!tenantConnectionId) {
      return res.status(400).json({ message: "tenantConnectionId query param required" });
    }

    const access = await assertTenantAccess(req, tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const run = await getLatestRunForTenant(tenantConnectionId);
    if (!run) return res.status(404).json({ message: "No completed assessment found" });
    return res.json(run);
  },
);

// ---------------------------------------------------------------------------
// GET /api/ia-assessment/admin-summary — platform-owner rollup
// ---------------------------------------------------------------------------

router.get(
  "/api/ia-assessment/admin-summary",
  requireAuth(),
  requireRole("platform_owner"),
  async (_req, res) => {
    const summary = await getAdminRunSummary();
    return res.json(summary);
  },
);

// ---------------------------------------------------------------------------
// GET /api/ia-assessment/:runId — poll a run
// ---------------------------------------------------------------------------

router.get(
  "/api/ia-assessment/:runId",
  requireAuth(),
  requireRole("operator"),
  requireFeature("iaAssessment"),
  async (req: AuthenticatedRequest, res) => {
    const run = await getRunById(req.params.runId);
    if (!run) return res.status(404).json({ message: "Run not found" });

    const orgId = req.activeOrganizationId || req.user?.organizationId;
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;

    if (!isPlatformOwner && run.orgId !== orgId) {
      return res.status(403).json({ message: "Access denied" });
    }

    return res.json(run);
  },
);

export default router;
