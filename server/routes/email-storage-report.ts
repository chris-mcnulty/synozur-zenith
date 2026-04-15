/**
 * Admin routes for the Zenith User Inventory and the Email Content Storage
 * Report.
 *
 * These routes are intentionally slim — they only wrap the services, apply
 * RBAC, and expose the cached state. All heavy lifting (paging, throttling,
 * aggregation) happens inside the services themselves.
 */

import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { ZENITH_ROLES, EMAIL_REPORT_MODES, VALID_WINDOW_DAYS_LIST } from "@shared/schema";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { requireFeature } from "../services/feature-gate";
import { decryptToken } from "../utils/encryption";
import {
  runUserInventoryRefresh,
  getUserInventoryAgeHours,
  isUserInventoryStale,
  DEFAULT_INVENTORY_MAX_AGE_HOURS,
} from "../services/user-inventory";
import {
  runEmailContentStorageReport,
  renderReportCsv,
  requestEmailReportCancellation,
} from "../services/email-content-storage-report";
import { trackJobRun, DuplicateJobError } from "../services/job-tracking";
import { jobRegistry } from "../services/job-registry";
import { getActiveOrgId } from "./scope-helpers";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function getEffectiveClientSecret(conn: { clientSecret?: string | null }): string {
  if (conn.clientSecret) {
    try { return decryptToken(conn.clientSecret); } catch { return conn.clientSecret; }
  }
  return process.env.AZURE_CLIENT_SECRET!;
}

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
): Promise<{ ok: true; conn: NonNullable<Awaited<ReturnType<typeof storage.getTenantConnection>>> } | { ok: false; status: number; message: string }> {
  const tenantConnectionId =
    typeof tenantConnectionIdRaw === "string" ? tenantConnectionIdRaw : "";
  if (!tenantConnectionId) {
    return { ok: false, status: 400, message: "Tenant id is required" };
  }
  const conn = await storage.getTenantConnection(tenantConnectionId);
  if (!conn) return { ok: false, status: 404, message: "Tenant connection not found" };
  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(conn.id)) {
    return { ok: false, status: 403, message: "Access denied" };
  }
  return { ok: true, conn };
}

function asStringParam(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

// ── User Inventory ───────────────────────────────────────────────────────────

/**
 * POST /api/admin/tenants/:id/user-inventory/sync
 *
 * Trigger a refresh of the Zenith User Inventory for a tenant. Runs
 * asynchronously — returns 202 immediately. This is the ONLY endpoint that
 * enumerates Entra /users; reports must read from the cached inventory.
 */
router.post(
  "/api/admin/tenants/:id/user-inventory/sync",
  requireAuth(),
  requireRole("tenant_admin"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const clientId = access.conn.clientId || process.env.AZURE_CLIENT_ID!;
    const clientSecret = getEffectiveClientSecret(access.conn);

    const maxUsersRaw = Number(req.body?.maxUsers);
    const options: { maxUsers?: number; minRefreshIntervalMinutes?: number } = {};
    if (Number.isFinite(maxUsersRaw) && maxUsersRaw > 0) options.maxUsers = maxUsersRaw;

    // BL-039: refuse duplicate launches early so the caller gets 409 instead
    // of a stranded fire-and-forget that never executes.
    if (jobRegistry.isRunning("userInventory", access.conn.id)) {
      return res.status(409).json({ message: "User inventory refresh is already running" });
    }

    res.status(202).json({ message: "User inventory refresh started" });

    const orgId = getActiveOrgId(req) ?? access.conn.organizationId ?? null;
    void trackJobRun(
      {
        jobType: "userInventory",
        organizationId: orgId,
        tenantConnectionId: access.conn.id,
        triggeredBy: "manual",
        triggeredByUserId: req.user?.id ?? null,
        targetName: access.conn.tenantName ?? access.conn.tenantId,
      },
      (signal) =>
        runUserInventoryRefresh(
          access.conn.id,
          access.conn.tenantId,
          clientId,
          clientSecret,
          { ...options, signal },
        ),
    ).catch((err) => {
      if (err instanceof DuplicateJobError) return; // already 202'd above; race-loser
      console.error("[user-inventory] refresh failed:", err);
    });
  },
);

/**
 * GET /api/admin/tenants/:id/user-inventory
 *
 * List cached user inventory for a tenant (paginated by limit).
 */
router.get(
  "/api/admin/tenants/:id/user-inventory",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 200));

    const rows = await storage.getUserInventory([access.conn.id], { search, limit });
    const total = await storage.countUserInventoryActive(access.conn.id);
    const ageHours = await getUserInventoryAgeHours(access.conn.id);
    const stale = await isUserInventoryStale(access.conn.id);

    res.json({
      items: rows,
      total,
      sampled: rows.length,
      ageHours,
      stale,
      maxAgeHours: DEFAULT_INVENTORY_MAX_AGE_HOURS,
    });
  },
);

/**
 * GET /api/admin/tenants/:id/user-inventory/runs
 *
 * List recent inventory refresh runs.
 */
router.get(
  "/api/admin/tenants/:id/user-inventory/runs",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const runs = await storage.getUserInventoryRuns(access.conn.id, limit);
    res.json(runs);
  },
);

// ── Email Content Storage Report ────────────────────────────────────────────

const runReportBodySchema = z.object({
  mode: z.enum(EMAIL_REPORT_MODES).optional(),
  windowDays: z.number().int().refine(n => (VALID_WINDOW_DAYS_LIST as readonly number[]).includes(n), {
    message: "windowDays must be 7, 30, or 90",
  }).optional(),
  maxUsers: z.number().int().positive().optional(),
  maxMessagesPerUser: z.number().int().positive().optional(),
  maxTotalMessages: z.number().int().positive().optional(),
  attachmentMetadataEnabled: z.boolean().optional(),
  maxMessagesWithMetadata: z.number().int().nonnegative().optional(),
  minMessageSizeKBForMetadata: z.number().int().nonnegative().optional(),
  maxAttachmentsPerMessage: z.number().int().positive().optional(),
});

/**
 * POST /api/admin/tenants/:id/email-storage-report/run
 *
 * Start an Email Content Storage Report run. Returns 202 with the report id
 * so the caller can poll /runs/:runId for status.
 */
router.post(
  "/api/admin/tenants/:id/email-storage-report/run",
  requireAuth(),
  requireRole("tenant_admin"),
  requireFeature("emailContentStorageReport"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const parseResult = runReportBodySchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return res.status(400).json({
        message: "Invalid run options",
        errors: parseResult.error.flatten(),
      });
    }

    // Guardrail: refuse to start if inventory is empty. Admins should run
    // the inventory refresh first. Stale inventory is allowed (degrades
    // gracefully — the report annotates the caveat).
    const inventoryCount = await storage.countUserInventoryActive(access.conn.id);
    if (inventoryCount === 0) {
      return res.status(409).json({
        message:
          "User inventory is empty for this tenant. Run POST /user-inventory/sync first.",
      });
    }

    const clientId = access.conn.clientId || process.env.AZURE_CLIENT_ID!;
    const clientSecret = getEffectiveClientSecret(access.conn);
    const body = parseResult.data;

    // Wait for the report row to be created (synchronous DB work only),
    // then fire the execution in the background so the response returns quickly.
    const reportId = await new Promise<string>((resolveId, rejectId) => {
      runEmailContentStorageReport(
        access.conn.id,
        access.conn.tenantId,
        clientId,
        clientSecret,
        {
          mode: body.mode,
          triggeredByUserId: req.user?.id ?? undefined,
          onReportCreated: resolveId,
          limits: {
            windowDays: body.windowDays,
            maxUsers: body.maxUsers,
            maxMessagesPerUser: body.maxMessagesPerUser,
            maxTotalMessages: body.maxTotalMessages,
            attachmentMetadataEnabled: body.attachmentMetadataEnabled,
            maxMessagesWithMetadata: body.maxMessagesWithMetadata,
            minMessageSizeKBForMetadata: body.minMessageSizeKBForMetadata,
            maxAttachmentsPerMessage: body.maxAttachmentsPerMessage,
          },
        },
      ).catch(err => {
        // If execution fails before onReportCreated fires (e.g. DB error
        // during row creation), surface the error to the caller.
        if (!res.headersSent) rejectId(err);
        else console.error("[email-storage-report] run failed:", err);
      });
    });

    res.status(202).json({ reportId, message: "Email storage report started" });
  },
);

/**
 * GET /api/admin/tenants/:id/email-storage-report/runs
 *
 * List recent report runs (summary view).
 */
router.get(
  "/api/admin/tenants/:id/email-storage-report/runs",
  requireAuth(),
  requireFeature("emailContentStorageReport"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const runs = await storage.getEmailStorageReports(access.conn.id, limit);
    res.json(runs);
  },
);

/**
 * GET /api/admin/tenants/:id/email-storage-report/runs/:runId
 *
 * Full detail for a single report run (JSON).
 */
router.get(
  "/api/admin/tenants/:id/email-storage-report/runs/:runId",
  requireAuth(),
  requireFeature("emailContentStorageReport"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const runId = asStringParam(req.params.runId);
    if (!runId) return res.status(400).json({ message: "runId is required" });
    const report = await storage.getEmailStorageReport(runId);
    if (!report || report.tenantConnectionId !== access.conn.id) {
      return res.status(404).json({ message: "Report run not found" });
    }
    res.json(report);
  },
);

/**
 * GET /api/admin/tenants/:id/email-storage-report/runs/:runId/export.csv
 *
 * CSV export of a single report run.
 */
router.get(
  "/api/admin/tenants/:id/email-storage-report/runs/:runId/export.csv",
  requireAuth(),
  requireFeature("emailContentStorageReport"),
  requireFeature("csvExport"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const runId = asStringParam(req.params.runId);
    if (!runId) return res.status(400).json({ message: "runId is required" });
    const report = await storage.getEmailStorageReport(runId);
    if (!report || report.tenantConnectionId !== access.conn.id) {
      return res.status(404).json({ message: "Report run not found" });
    }

    const csv = renderReportCsv(report);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="email-storage-report-${report.id}.csv"`,
    );
    res.send(csv);
  },
);

/**
 * POST /api/admin/tenants/:id/email-storage-report/runs/:runId/cancel
 *
 * Cooperatively cancel a running report. The background job checks the
 * cancellation flag between users and between message pages, then marks
 * the run as CANCELLED with partial aggregates preserved.
 *
 * Returns 202 if the signal was accepted, 409 if the run is already in a
 * terminal state (COMPLETED/FAILED/CANCELLED/PARTIAL).
 */
router.post(
  "/api/admin/tenants/:id/email-storage-report/runs/:runId/cancel",
  requireAuth(),
  requireRole("tenant_admin"),
  requireFeature("emailContentStorageReport"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const runId = asStringParam(req.params.runId);
    if (!runId) return res.status(400).json({ message: "runId is required" });

    const report = await storage.getEmailStorageReport(runId);
    if (!report || report.tenantConnectionId !== access.conn.id) {
      return res.status(404).json({ message: "Report run not found" });
    }

    if (report.status !== "RUNNING") {
      return res.status(409).json({
        message: `Report is already in terminal state: ${report.status}`,
        status: report.status,
      });
    }

    requestEmailReportCancellation(access.conn.id, runId);
    res.status(202).json({
      message: "Cancellation requested",
      runId,
      status: "RUNNING",
    });
  },
);

/**
 * DELETE /api/admin/tenants/:id/email-storage-report/runs/:runId
 *
 * Delete a report run. Only terminal-state runs (COMPLETED, PARTIAL, FAILED,
 * CANCELLED) can be deleted — a RUNNING report must be cancelled first.
 */
router.delete(
  "/api/admin/tenants/:id/email-storage-report/runs/:runId",
  requireAuth(),
  requireRole("tenant_admin"),
  requireFeature("emailContentStorageReport"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const runId = asStringParam(req.params.runId);
    if (!runId) return res.status(400).json({ message: "runId is required" });

    const report = await storage.getEmailStorageReport(runId);
    if (!report || report.tenantConnectionId !== access.conn.id) {
      return res.status(404).json({ message: "Report run not found" });
    }

    if (report.status === "RUNNING") {
      return res.status(409).json({
        message: "Cannot delete a running report. Cancel it first.",
        status: report.status,
      });
    }

    await storage.deleteEmailStorageReport(runId);
    res.status(200).json({ message: "Report deleted", runId });
  },
);

// ── Canonical-path aliases ───────────────────────────────────────────────────
// The PR description documented shorter paths without the `/run` and `/runs/`
// segments. These aliases make both forms valid so API consumers have a stable
// contract regardless of which path they discovered first.
//
// Registration order matters: the specific `/runs` and `/runs/:runId` routes
// above are registered first, so they take precedence over the `:reportId`
// wildcard below.

/**
 * POST /api/admin/tenants/:id/email-storage-report
 * Alias for POST /api/admin/tenants/:id/email-storage-report/run
 */
router.post(
  "/api/admin/tenants/:id/email-storage-report",
  requireAuth(),
  requireRole("tenant_admin"),
  requireFeature("emailContentStorageReport"),
  async (req: AuthenticatedRequest, res) => {
    // Re-use the /run handler by delegating to the same logic.
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const parseResult = runReportBodySchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return res.status(400).json({ message: "Invalid run options", errors: parseResult.error.flatten() });
    }

    const inventoryCount = await storage.countUserInventoryActive(access.conn.id);
    if (inventoryCount === 0) {
      return res.status(409).json({
        message: "User inventory is empty for this tenant. Run POST /user-inventory/sync first.",
      });
    }

    const clientId = access.conn.clientId || process.env.AZURE_CLIENT_ID!;
    const clientSecret = getEffectiveClientSecret(access.conn);
    const body = parseResult.data;

    const reportId = await new Promise<string>((resolveId, rejectId) => {
      runEmailContentStorageReport(
        access.conn.id,
        access.conn.tenantId,
        clientId,
        clientSecret,
        {
          mode: body.mode,
          triggeredByUserId: req.user?.id ?? undefined,
          onReportCreated: resolveId,
          limits: {
            windowDays: body.windowDays,
            maxUsers: body.maxUsers,
            maxMessagesPerUser: body.maxMessagesPerUser,
            maxTotalMessages: body.maxTotalMessages,
            attachmentMetadataEnabled: body.attachmentMetadataEnabled,
            maxMessagesWithMetadata: body.maxMessagesWithMetadata,
            minMessageSizeKBForMetadata: body.minMessageSizeKBForMetadata,
            maxAttachmentsPerMessage: body.maxAttachmentsPerMessage,
          },
        },
      ).catch(err => {
        if (!res.headersSent) rejectId(err);
        else console.error("[email-storage-report] run failed:", err);
      });
    });

    res.status(202).json({ reportId, message: "Email storage report started" });
  },
);

/**
 * GET /api/admin/tenants/:id/email-storage-report/:reportId
 * Alias for GET /api/admin/tenants/:id/email-storage-report/runs/:runId
 */
router.get(
  "/api/admin/tenants/:id/email-storage-report/:reportId",
  requireAuth(),
  requireFeature("emailContentStorageReport"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const runId = asStringParam(req.params.reportId);
    if (!runId) return res.status(400).json({ message: "reportId is required" });
    const report = await storage.getEmailStorageReport(runId);
    if (!report || report.tenantConnectionId !== access.conn.id) {
      return res.status(404).json({ message: "Report run not found" });
    }
    res.json(report);
  },
);

/**
 * GET /api/admin/tenants/:id/email-storage-report/:reportId/csv
 * Alias for GET /api/admin/tenants/:id/email-storage-report/runs/:runId/export.csv
 */
router.get(
  "/api/admin/tenants/:id/email-storage-report/:reportId/csv",
  requireAuth(),
  requireFeature("emailContentStorageReport"),
  requireFeature("csvExport"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const runId = asStringParam(req.params.reportId);
    if (!runId) return res.status(400).json({ message: "reportId is required" });
    const report = await storage.getEmailStorageReport(runId);
    if (!report || report.tenantConnectionId !== access.conn.id) {
      return res.status(404).json({ message: "Report run not found" });
    }

    const csv = renderReportCsv(report);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="email-storage-report-${report.id}.csv"`,
    );
    res.send(csv);
  },
);

/**
 * POST /api/admin/tenants/:id/email-storage-report/:reportId/cancel
 * Alias for POST /api/admin/tenants/:id/email-storage-report/runs/:runId/cancel
 */
router.post(
  "/api/admin/tenants/:id/email-storage-report/:reportId/cancel",
  requireAuth(),
  requireRole("tenant_admin"),
  requireFeature("emailContentStorageReport"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const runId = asStringParam(req.params.reportId);
    if (!runId) return res.status(400).json({ message: "reportId is required" });

    const report = await storage.getEmailStorageReport(runId);
    if (!report || report.tenantConnectionId !== access.conn.id) {
      return res.status(404).json({ message: "Report run not found" });
    }

    if (report.status !== "RUNNING") {
      return res.status(409).json({
        message: `Report is already in terminal state: ${report.status}`,
        status: report.status,
      });
    }

    requestEmailReportCancellation(access.conn.id, runId);
    res.status(202).json({ message: "Cancellation requested", runId, status: "RUNNING" });
  },
);

/**
 * DELETE /api/admin/tenants/:id/email-storage-report/:reportId
 * Alias for DELETE /api/admin/tenants/:id/email-storage-report/runs/:runId
 */
router.delete(
  "/api/admin/tenants/:id/email-storage-report/:reportId",
  requireAuth(),
  requireRole("tenant_admin"),
  requireFeature("emailContentStorageReport"),
  async (req: AuthenticatedRequest, res) => {
    const access = await assertTenantAccess(req, req.params.id);
    if (!access.ok) return res.status(access.status).json({ message: access.message });

    const runId = asStringParam(req.params.reportId);
    if (!runId) return res.status(400).json({ message: "reportId is required" });

    const report = await storage.getEmailStorageReport(runId);
    if (!report || report.tenantConnectionId !== access.conn.id) {
      return res.status(404).json({ message: "Report run not found" });
    }

    if (report.status === "RUNNING") {
      return res.status(409).json({
        message: "Cannot delete a running report. Cancel it first.",
        status: report.status,
      });
    }

    await storage.deleteEmailStorageReport(runId);
    res.status(200).json({ message: "Report deleted", runId });
  },
);

export default router;
