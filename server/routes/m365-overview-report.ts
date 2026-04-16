/**
 * Premium routes for the M365 30-Day Overview Report.
 *
 * All endpoints are gated on the `m365OverviewReport` plan feature. Reports
 * are tenant-scoped; access is validated against the caller's organization
 * tenant connections (same pattern used by email-storage-report.ts).
 */

import { Router } from "express";
import { storage } from "../storage";
import { ZENITH_ROLES } from "@shared/schema";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { requireFeature } from "../services/feature-gate";
import { getActiveOrgId } from "./scope-helpers";
import {
  startOverviewReport,
  getOverviewReport,
  listOverviewReportsForTenant,
  deleteOverviewReport,
  hasRunningOverviewReport,
} from "../services/m365-overview-report";

const router = Router();

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
  tenantConnectionIdRaw: string | string[] | undefined,
): Promise<
  | { ok: true; conn: NonNullable<Awaited<ReturnType<typeof storage.getTenantConnection>>> }
  | { ok: false; status: number; message: string }
> {
  const tenantConnectionId =
    typeof tenantConnectionIdRaw === "string" ? tenantConnectionIdRaw : "";
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

/**
 * POST /api/m365-overview-reports
 * body: { tenantConnectionId: string }
 *
 * Starts a new overview report run. Returns 202 with the report id so the
 * caller can poll GET /api/m365-overview-reports/:id for status.
 */
router.post(
  "/api/m365-overview-reports",
  requireAuth(),
  requireRole("tenant_admin"),
  requireFeature("m365OverviewReport"),
  async (req: AuthenticatedRequest, res) => {
    const tenantConnectionId =
      typeof req.body?.tenantConnectionId === "string" ? req.body.tenantConnectionId : "";
    const access = await assertTenantAccess(req, tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    if (await hasRunningOverviewReport(access.conn.id)) {
      return res.status(409).json({
        message: "An overview report is already running for this tenant",
      });
    }

    const organizationId = getActiveOrgId(req) ?? access.conn.organizationId;
    if (!organizationId) {
      return res.status(400).json({ message: "No active organization in scope" });
    }

    const org = await storage.getOrganization(organizationId);
    const orgName = org?.name ?? access.conn.tenantName ?? access.conn.tenantId;

    const reportId = await startOverviewReport({
      organizationId,
      tenantConnectionId: access.conn.id,
      triggeredByUserId: req.user?.id ?? null,
      orgName,
    });

    res.status(202).json({
      reportId,
      message: "M365 overview report started",
    });
  },
);

/**
 * GET /api/m365-overview-reports?tenantConnectionId=...
 *
 * List recent overview reports for the tenant (newest first).
 */
router.get(
  "/api/m365-overview-reports",
  requireAuth(),
  requireFeature("m365OverviewReport"),
  async (req: AuthenticatedRequest, res) => {
    const tenantConnectionId = typeof req.query.tenantConnectionId === "string"
      ? req.query.tenantConnectionId
      : "";
    const access = await assertTenantAccess(req, tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(50, rawLimit) : 20;
    const rows = await listOverviewReportsForTenant(access.conn.id, limit);

    // Strip snapshot + narrative on the list response — clients fetch full
    // detail lazily via GET /:id. Keep the shape compatible with the detail
    // endpoint so tables only need to pick a few columns.
    res.json(
      rows.map(r => ({
        id: r.id,
        status: r.status,
        windowStart: r.windowStart,
        windowEnd: r.windowEnd,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        modelUsed: r.modelUsed,
        tokensUsed: r.tokensUsed,
        error: r.error,
        recommendationCount: Array.isArray(r.recommendations) ? r.recommendations.length : 0,
      })),
    );
  },
);

/**
 * GET /api/m365-overview-reports/:id
 *
 * Full detail for a single run (snapshot + narrative + recommendations).
 */
router.get(
  "/api/m365-overview-reports/:id",
  requireAuth(),
  requireFeature("m365OverviewReport"),
  async (req: AuthenticatedRequest, res) => {
    const reportId = typeof req.params.id === "string" ? req.params.id : "";
    if (!reportId) return res.status(400).json({ message: "report id is required" });

    const report = await getOverviewReport(reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });

    // Access check: the report must belong to a tenant the caller can see.
    const access = await assertTenantAccess(req, report.tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    res.json(report);
  },
);

/**
 * DELETE /api/m365-overview-reports/:id
 *
 * Delete a report. RUNNING reports cannot be deleted — wait for them to
 * terminate (they write a FAILED state on unhandled errors).
 */
router.delete(
  "/api/m365-overview-reports/:id",
  requireAuth(),
  requireRole("tenant_admin"),
  requireFeature("m365OverviewReport"),
  async (req: AuthenticatedRequest, res) => {
    const reportId = typeof req.params.id === "string" ? req.params.id : "";
    if (!reportId) return res.status(400).json({ message: "report id is required" });

    const report = await getOverviewReport(reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });

    const access = await assertTenantAccess(req, report.tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    if (report.status === "RUNNING") {
      return res.status(409).json({
        message: "Cannot delete a running report; wait for it to finish",
        status: report.status,
      });
    }

    await deleteOverviewReport(reportId);
    res.status(200).json({ message: "Report deleted", reportId });
  },
);

export default router;
