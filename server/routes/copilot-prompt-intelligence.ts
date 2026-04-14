/**
 * Copilot Prompt Intelligence API Routes (BL-038)
 *
 * POST   /api/copilot-prompt-intelligence/sync
 *          — trigger a Graph interaction sync for a tenant connection
 * POST   /api/copilot-prompt-intelligence/assess
 *          — trigger an assessment run (analyze + aggregate + AI narrative)
 * GET    /api/copilot-prompt-intelligence/interactions
 *          — paginated list of captured interactions for a tenant
 * GET    /api/copilot-prompt-intelligence/assessments
 *          — paginated list of assessment runs for an org / tenant
 * GET    /api/copilot-prompt-intelligence/assessments/latest
 *          — latest completed assessment for a tenant
 * GET    /api/copilot-prompt-intelligence/assessments/:assessmentId
 *          — poll a specific assessment run
 *
 * Feature-gated to: copilotPromptIntelligence (Professional+)
 * Minimum role:     operator
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { requireFeature } from "../services/feature-gate";
import { storage } from "../storage";
import { ZENITH_ROLES } from "@shared/schema";
import { getOrgTenantConnectionIds, getActiveOrgId } from "./scope-helpers";
import { syncCopilotInteractions } from "../services/copilot-interaction-sync";
import {
  runCopilotPromptAssessment,
  getAssessmentById,
  getLatestAssessmentForTenant,
  listAssessmentsForOrg,
} from "../services/copilot-prompt-intelligence-service";
import { getInteractionsForTenant } from "../services/copilot-interaction-sync";

const router = Router();

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

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

  const allowedIds = await getOrgTenantConnectionIds(req);
  if (allowedIds !== null && !allowedIds.includes(conn.id)) {
    return { ok: false, status: 403, message: "Access denied" };
  }
  return { ok: true, conn };
}

// ---------------------------------------------------------------------------
// POST /api/copilot-prompt-intelligence/sync
// ---------------------------------------------------------------------------

router.post(
  "/api/copilot-prompt-intelligence/sync",
  requireAuth(),
  requireRole("operator"),
  requireFeature("copilotPromptIntelligence"),
  async (req: AuthenticatedRequest, res) => {
    const body = z
      .object({ tenantConnectionId: z.string().min(1) })
      .safeParse(req.body);

    if (!body.success) {
      return res.status(400).json({ message: "tenantConnectionId is required" });
    }

    const access = await assertTenantAccess(req, body.data.tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    // Run sync asynchronously so the request returns quickly.
    const tenantConnectionId = body.data.tenantConnectionId;
    setImmediate(async () => {
      try {
        const summary = await syncCopilotInteractions(tenantConnectionId);
        console.log(
          `[CopilotSync] tenant=${tenantConnectionId} summary=`,
          JSON.stringify(summary),
        );
      } catch (err) {
        console.error(`[CopilotSync] tenant=${tenantConnectionId} error:`, err);
      }
    });

    return res.status(202).json({
      message: "Copilot interaction sync started",
      tenantConnectionId,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /api/copilot-prompt-intelligence/assess
// ---------------------------------------------------------------------------

router.post(
  "/api/copilot-prompt-intelligence/assess",
  requireAuth(),
  requireRole("operator"),
  requireFeature("copilotPromptIntelligence"),
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
      getActiveOrgId(req) || access.conn.organizationId || "";

    if (!orgId) {
      return res.status(400).json({ message: "No active organization context" });
    }

    const assessmentId = await runCopilotPromptAssessment(
      access.conn.id,
      orgId,
      req.user?.id ?? null,
    );

    return res.status(202).json({
      assessmentId,
      message: "Copilot Prompt Intelligence assessment started",
    });
  },
);

// ---------------------------------------------------------------------------
// GET /api/copilot-prompt-intelligence/interactions
// ---------------------------------------------------------------------------

router.get(
  "/api/copilot-prompt-intelligence/interactions",
  requireAuth(),
  requireRole("operator"),
  requireFeature("copilotPromptIntelligence"),
  async (req: AuthenticatedRequest, res) => {
    const tenantConnectionId =
      typeof req.query.tenantConnectionId === "string"
        ? req.query.tenantConnectionId
        : "";

    if (!tenantConnectionId) {
      return res.status(400).json({ message: "tenantConnectionId query param required" });
    }

    const access = await assertTenantAccess(req, tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 1000);
    const offset = parseInt(String(req.query.offset ?? "0"), 10);

    const { rows, total } = await getInteractionsForTenant(tenantConnectionId, {
      limit,
      offset,
    });

    return res.json({ rows, total, limit, offset });
  },
);

// ---------------------------------------------------------------------------
// GET /api/copilot-prompt-intelligence/assessments/latest
// (must be before /:assessmentId)
// ---------------------------------------------------------------------------

router.get(
  "/api/copilot-prompt-intelligence/assessments/latest",
  requireAuth(),
  requireRole("operator"),
  requireFeature("copilotPromptIntelligence"),
  async (req: AuthenticatedRequest, res) => {
    const tenantConnectionId =
      typeof req.query.tenantConnectionId === "string"
        ? req.query.tenantConnectionId
        : "";

    if (!tenantConnectionId) {
      return res.status(400).json({ message: "tenantConnectionId query param required" });
    }

    const access = await assertTenantAccess(req, tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const assessment = await getLatestAssessmentForTenant(tenantConnectionId);
    if (!assessment) {
      return res.status(404).json({ message: "No completed assessment found" });
    }
    return res.json(assessment);
  },
);

// ---------------------------------------------------------------------------
// GET /api/copilot-prompt-intelligence/assessments
// ---------------------------------------------------------------------------

router.get(
  "/api/copilot-prompt-intelligence/assessments",
  requireAuth(),
  requireRole("operator"),
  requireFeature("copilotPromptIntelligence"),
  async (req: AuthenticatedRequest, res) => {
    const orgId = getActiveOrgId(req);
    if (!orgId && req.user?.role !== ZENITH_ROLES.PLATFORM_OWNER) {
      return res.status(400).json({ message: "No active organization" });
    }

    const tenantConnectionId =
      typeof req.query.tenantConnectionId === "string"
        ? req.query.tenantConnectionId
        : undefined;

    if (tenantConnectionId) {
      const access = await assertTenantAccess(req, tenantConnectionId);
      if (!access.ok) return res.status(access.status).json({ message: access.message });
    }

    const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 100);
    const offset = parseInt(String(req.query.offset ?? "0"), 10);

    const { rows, total } = await listAssessmentsForOrg(
      orgId ?? "",
      tenantConnectionId,
      limit,
      offset,
    );

    return res.json({ rows, total, limit, offset });
  },
);

// ---------------------------------------------------------------------------
// GET /api/copilot-prompt-intelligence/assessments/:assessmentId
// ---------------------------------------------------------------------------

router.get(
  "/api/copilot-prompt-intelligence/assessments/:assessmentId",
  requireAuth(),
  requireRole("operator"),
  requireFeature("copilotPromptIntelligence"),
  async (req: AuthenticatedRequest, res) => {
    const assessment = await getAssessmentById(req.params.assessmentId);
    if (!assessment) return res.status(404).json({ message: "Assessment not found" });

    const orgId = getActiveOrgId(req);
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;

    if (!isPlatformOwner && assessment.organizationId !== orgId) {
      return res.status(403).json({ message: "Access denied" });
    }

    return res.json(assessment);
  },
);

export default router;
