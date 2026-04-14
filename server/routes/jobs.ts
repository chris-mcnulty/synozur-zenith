/**
 * BL-039 — Job Monitor & Dataset Freshness API.
 *
 * GET    /api/jobs/active                       — currently running jobs (in-memory registry)
 * GET    /api/jobs/history                      — paginated history from scheduled_job_runs
 * GET    /api/jobs/:jobId                       — single job detail (DB)
 * POST   /api/jobs/:jobId/cancel                — cancel a running job
 * GET    /api/datasets/freshness                — freshness status for all datasets
 * GET    /api/datasets/:datasetKey/freshness    — freshness status for a single dataset
 *
 * Access: governance_admin, tenant_admin, or platform_owner.
 *
 * The manual "trigger a job" endpoint (POST /api/jobs/:jobType/trigger) is
 * intentionally deferred to Phase 2, where each individual job is wired to
 * trackJobRun and we can route a trigger call to the correct service.
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { storage } from "../storage";
import { ZENITH_ROLES, JOB_TYPES, JOB_STATUSES, type JobType, type JobStatus } from "@shared/schema";
import { getOrgTenantConnectionIds, getActiveOrgId } from "./scope-helpers";
import { jobRegistry } from "../services/job-registry";
import {
  getAllDatasetFreshness,
  getDatasetFreshness,
  getDatasetDefinition,
} from "../services/dataset-freshness";

const router = Router();

const JOB_TYPE_KEYS = Object.keys(JOB_TYPES) as [JobType, ...JobType[]];

/** Resolve the effective tenant scope for a request (null = platform owner, no filter). */
async function resolveTenantScope(
  req: AuthenticatedRequest,
  requestedTenantId?: string,
): Promise<
  | { ok: true; tenantConnectionId: string | null; tenantConnectionIds: string[] | null }
  | { ok: false; status: number; message: string }
> {
  const allowedIds = await getOrgTenantConnectionIds(req);
  // Platform owner → allowedIds === null → no tenant restriction
  if (requestedTenantId) {
    if (allowedIds !== null && !allowedIds.includes(requestedTenantId)) {
      return { ok: false, status: 403, message: "Access denied to this tenant connection" };
    }
    return { ok: true, tenantConnectionId: requestedTenantId, tenantConnectionIds: null };
  }
  return {
    ok: true,
    tenantConnectionId: null,
    tenantConnectionIds: allowedIds,
  };
}

// ---------------------------------------------------------------------------
// GET /api/jobs/active
// ---------------------------------------------------------------------------
router.get(
  "/api/jobs/active",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const tenantConnectionId =
      typeof req.query.tenantConnectionId === "string" ? req.query.tenantConnectionId : undefined;

    const scope = await resolveTenantScope(req, tenantConnectionId);
    if (!scope.ok) return res.status(scope.status).json({ message: scope.message });

    const active = jobRegistry
      .getActive(scope.tenantConnectionId ?? undefined)
      .filter((job) => {
        // If scope is "all tenants in my org" (no single tenantConnectionId), filter by allowed list
        if (scope.tenantConnectionIds === null) return true;
        if (!job.tenantConnectionId) return false;
        return scope.tenantConnectionIds.includes(job.tenantConnectionId);
      })
      .map((job) => ({
        jobId: job.jobId,
        jobType: job.jobType,
        jobTypeLabel: JOB_TYPES[job.jobType]?.label ?? job.jobType,
        tenantConnectionId: job.tenantConnectionId,
        organizationId: job.organizationId,
        startedAt: job.startedAt.toISOString(),
        elapsedMs: Date.now() - job.startedAt.getTime(),
        triggeredBy: job.triggeredBy,
        triggeredByUserId: job.triggeredByUserId,
        progressLabel: job.progressLabel,
        progressPct: job.progressPct,
        itemsTotal: job.itemsTotal,
        itemsProcessed: job.itemsProcessed,
        targetId: job.targetId,
        targetName: job.targetName,
        aborted: job.abortController.signal.aborted,
      }));

    return res.json({ jobs: active });
  },
);

// ---------------------------------------------------------------------------
// GET /api/jobs/history
// ---------------------------------------------------------------------------
const historyQuerySchema = z.object({
  tenantConnectionId: z.string().optional(),
  jobType: z.enum(JOB_TYPE_KEYS).optional(),
  status: z.enum(JOB_STATUSES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

router.get(
  "/api/jobs/history",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const parsed = historyQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid query parameters", issues: parsed.error.issues });
    }
    const { tenantConnectionId, jobType, status, from, to, limit, offset } = parsed.data;

    const scope = await resolveTenantScope(req, tenantConnectionId);
    if (!scope.ok) return res.status(scope.status).json({ message: scope.message });

    const orgId = getActiveOrgId(req);

    const { rows, total } = await storage.listScheduledJobRuns({
      organizationId: orgId,
      tenantConnectionId: scope.tenantConnectionId ?? undefined,
      tenantConnectionIds: scope.tenantConnectionIds ?? undefined,
      jobType,
      status: status as JobStatus | undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      limit,
      offset,
    });

    return res.json({
      rows: rows.map((r) => ({
        ...r,
        jobTypeLabel: JOB_TYPES[r.jobType as JobType]?.label ?? r.jobType,
      })),
      total,
    });
  },
);

// ---------------------------------------------------------------------------
// GET /api/jobs/:jobId
// ---------------------------------------------------------------------------
router.get(
  "/api/jobs/:jobId",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const run = await storage.getScheduledJobRun(String(req.params.jobId));
    if (!run) return res.status(404).json({ message: "Job not found" });

    const scope = await resolveTenantScope(
      req,
      run.tenantConnectionId ?? undefined,
    );
    if (!scope.ok) return res.status(scope.status).json({ message: scope.message });

    return res.json({
      ...run,
      jobTypeLabel: JOB_TYPES[run.jobType as JobType]?.label ?? run.jobType,
    });
  },
);

// ---------------------------------------------------------------------------
// POST /api/jobs/:jobId/cancel
// ---------------------------------------------------------------------------
router.post(
  "/api/jobs/:jobId/cancel",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const jobId = String(req.params.jobId);
    const active = jobRegistry.get(jobId);
    if (!active) {
      // Maybe finished already — look up DB
      const run = await storage.getScheduledJobRun(jobId);
      if (!run) return res.status(404).json({ message: "Job not found" });
      if (run.status !== "running") {
        return res.status(409).json({ message: `Job is already ${run.status}` });
      }
      // Row says running but in-memory registry lost it — force fail the row
      await storage.updateScheduledJobRun(jobId, {
        status: "cancelled",
        completedAt: new Date(),
        errorMessage: "Cancelled (job not in active registry)",
      });
      return res.json({ ok: true, cancelled: true, note: "reconciled" });
    }

    const scope = await resolveTenantScope(req, active.tenantConnectionId ?? undefined);
    if (!scope.ok) return res.status(scope.status).json({ message: scope.message });

    const cancelled = jobRegistry.cancel(jobId);
    return res.json({ ok: true, cancelled });
  },
);

// ---------------------------------------------------------------------------
// GET /api/datasets/freshness
// ---------------------------------------------------------------------------
router.get(
  "/api/datasets/freshness",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const tenantConnectionId =
      typeof req.query.tenantConnectionId === "string" ? req.query.tenantConnectionId : undefined;
    if (!tenantConnectionId) {
      return res.status(400).json({ message: "tenantConnectionId is required" });
    }

    const scope = await resolveTenantScope(req, tenantConnectionId);
    if (!scope.ok) return res.status(scope.status).json({ message: scope.message });

    const datasets = await getAllDatasetFreshness(tenantConnectionId);
    return res.json({ datasets });
  },
);

// ---------------------------------------------------------------------------
// GET /api/datasets/:datasetKey/freshness
// ---------------------------------------------------------------------------
router.get(
  "/api/datasets/:datasetKey/freshness",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const tenantConnectionId =
      typeof req.query.tenantConnectionId === "string" ? req.query.tenantConnectionId : undefined;
    if (!tenantConnectionId) {
      return res.status(400).json({ message: "tenantConnectionId is required" });
    }

    const datasetKey = String(req.params.datasetKey);
    const def = getDatasetDefinition(datasetKey);
    if (!def) return res.status(404).json({ message: "Unknown dataset" });

    const scope = await resolveTenantScope(req, tenantConnectionId);
    if (!scope.ok) return res.status(scope.status).json({ message: scope.message });

    const freshness = await getDatasetFreshness(tenantConnectionId, datasetKey);
    return res.json({ dataset: freshness });
  },
);

export default router;
