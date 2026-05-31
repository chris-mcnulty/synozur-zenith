/**
 * Premium routes for the Nightly Data Refresh & Health Report.
 *
 * All endpoints are gated on the `scheduledHealthReports` plan feature
 * (Enterprise). Reports are tenant-scoped; access is validated against the
 * caller's organization tenant connections (same pattern as
 * m365-overview-report.ts / email-storage-report.ts).
 *
 * Admins control three independent per-connection toggles via the settings
 * endpoints: the nightly data refresh, report generation, and email delivery.
 */

import { Router } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { requireFeature } from "../services/feature-gate";
import { getActiveOrgId, getOrgTenantConnectionIds } from "./scope-helpers";
import {
  startNightlyHealthReport,
  getNightlyHealthReport,
  listNightlyHealthReportsForTenant,
  deleteNightlyHealthReport,
  hasRunningNightlyHealthReport,
} from "../services/nightly-health-report";

const router = Router();

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
  const allowedIds = await getOrgTenantConnectionIds(req);
  if (allowedIds !== null && !allowedIds.includes(conn.id)) {
    return { ok: false, status: 403, message: "Access denied" };
  }
  return { ok: true, conn };
}

/**
 * GET /api/nightly-health-reports/settings?tenantConnectionId=...
 * Returns the three per-connection scheduling toggles.
 */
router.get(
  "/api/nightly-health-reports/settings",
  requireAuth(),
  requireFeature("scheduledHealthReports"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.query.tenantConnectionId as string | undefined);
    if (!access.ok) return res.status(access.status).json({ message: access.message });
    res.json({
      tenantConnectionId: access.conn.id,
      nightlyRefreshScheduleEnabled: access.conn.nightlyRefreshScheduleEnabled !== false,
      nightlyHealthReportEnabled: access.conn.nightlyHealthReportEnabled !== false,
      nightlyHealthReportEmailEnabled: access.conn.nightlyHealthReportEmailEnabled !== false,
    });
  },
);

/**
 * PATCH /api/nightly-health-reports/settings
 * body: { tenantConnectionId, nightlyRefreshScheduleEnabled?, nightlyHealthReportEnabled?, nightlyHealthReportEmailEnabled? }
 */
router.patch(
  "/api/nightly-health-reports/settings",
  requireAuth(),
  requireRole("tenant_admin"),
  requireFeature("scheduledHealthReports"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.body?.tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const updates: Record<string, boolean> = {};
    for (const key of [
      "nightlyRefreshScheduleEnabled",
      "nightlyHealthReportEnabled",
      "nightlyHealthReportEmailEnabled",
    ] as const) {
      if (typeof req.body?.[key] === "boolean") updates[key] = req.body[key];
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid toggle fields supplied" });
    }

    const updated = await storage.updateTenantConnection(access.conn.id, updates);
    res.json({
      tenantConnectionId: access.conn.id,
      nightlyRefreshScheduleEnabled: updated?.nightlyRefreshScheduleEnabled !== false,
      nightlyHealthReportEnabled: updated?.nightlyHealthReportEnabled !== false,
      nightlyHealthReportEmailEnabled: updated?.nightlyHealthReportEmailEnabled !== false,
    });
  },
);

/**
 * POST /api/nightly-health-reports
 * body: { tenantConnectionId: string }
 * Generates an on-demand health report from currently-synced data. Email
 * delivery honors the connection's email toggle.
 */
router.post(
  "/api/nightly-health-reports",
  requireAuth(),
  requireRole("tenant_admin"),
  requireFeature("scheduledHealthReports"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.body?.tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    if (await hasRunningNightlyHealthReport(access.conn.id)) {
      return res.status(409).json({ message: "A health report is already running for this tenant" });
    }

    const organizationId = getActiveOrgId(req) ?? access.conn.organizationId;
    if (!organizationId) {
      return res.status(400).json({ message: "No active organization in scope" });
    }

    const reportId = await startNightlyHealthReport({
      organizationId,
      tenantConnectionId: access.conn.id,
      tenantName: access.conn.tenantName ?? access.conn.tenantId,
      triggeredBy: "manual",
      triggeredByUserId: req.user?.id ?? null,
      refreshedAt: null,
      sendEmail: access.conn.nightlyHealthReportEmailEnabled !== false,
    });

    res.status(202).json({ reportId, message: "Nightly health report started" });
  },
);

/**
 * GET /api/nightly-health-reports?tenantConnectionId=...
 * List recent reports for the tenant (newest first).
 */
router.get(
  "/api/nightly-health-reports",
  requireAuth(),
  requireFeature("scheduledHealthReports"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.query.tenantConnectionId as string | undefined);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(60, rawLimit) : 30;
    const rows = await listNightlyHealthReportsForTenant(access.conn.id, limit);

    res.json(
      rows.map((r) => ({
        id: r.id,
        status: r.status,
        reportDate: r.reportDate,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        triggeredBy: r.triggeredBy,
        sitesOver75: r.sitesOver75,
        sitesOver90: r.sitesOver90,
        issueCount: r.issueCount,
        emailRecipientCount: r.emailRecipientCount,
        error: r.error,
      })),
    );
  },
);

/**
 * GET /api/nightly-health-reports/:id — full report detail.
 */
router.get(
  "/api/nightly-health-reports/:id",
  requireAuth(),
  requireFeature("scheduledHealthReports"),
  async (req: AuthenticatedRequest, res) => {
    const reportId = typeof req.params.id === "string" ? req.params.id : "";
    if (!reportId) return res.status(400).json({ message: "report id is required" });

    const report = await getNightlyHealthReport(reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });

    const access = await assertTenantAccess(req, report.tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    res.json(report);
  },
);

/**
 * DELETE /api/nightly-health-reports/:id — RUNNING reports cannot be deleted.
 */
router.delete(
  "/api/nightly-health-reports/:id",
  requireAuth(),
  requireRole("tenant_admin"),
  requireFeature("scheduledHealthReports"),
  async (req: AuthenticatedRequest, res) => {
    const reportId = typeof req.params.id === "string" ? req.params.id : "";
    if (!reportId) return res.status(400).json({ message: "report id is required" });

    const report = await getNightlyHealthReport(reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });

    const access = await assertTenantAccess(req, report.tenantConnectionId);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    if (report.status === "RUNNING") {
      return res.status(409).json({ message: "Cannot delete a running report; wait for it to finish" });
    }

    await deleteNightlyHealthReport(reportId);
    res.status(200).json({ message: "Report deleted", reportId });
  },
);

export default router;
