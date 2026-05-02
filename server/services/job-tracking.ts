/**
 * BL-039 — trackJobRun<T>: the single wrapper every background job calls.
 *
 * Responsibilities:
 *   1. Concurrency guard (throws DuplicateJobError if already running)
 *   2. Creates AbortController + registers in jobRegistry
 *   3. Inserts scheduled_job_runs row (status=running)
 *   4. Invokes work(signal, updateProgress)
 *   5. On success/failure/abort: updates DB row and unregisters
 *   6. Emits SYNC_STARTED / SYNC_COMPLETED / SYNC_FAILED audit entries via
 *      `logAuditEvent` so every Graph sync run is automatically captured
 *      without per-call instrumentation in the individual sync services.
 */
import type { JobType, JobTriggerSource } from "@shared/schema";
import { storage } from "../storage";
import { jobRegistry, type ActiveJob, type ProgressFn } from "./job-registry";
import { logAuditEvent, AUDIT_ACTIONS, type AuditAction, type AuditResult } from "./audit-logger";

function writeSyncAudit(
  action: AuditAction,
  opts: {
    jobId: string;
    jobType: JobType;
    organizationId: string | null;
    tenantConnectionId: string | null;
    triggeredByUserId: string | null;
    triggeredBy: JobTriggerSource;
    targetId: string | null;
    targetName: string | null;
    durationMs?: number;
    errorMessage?: string;
    result?: AuditResult;
  },
): void {
  void logAuditEvent(null, {
    action,
    resource: "scheduled_job_run",
    resourceId: opts.jobId,
    organizationId: opts.organizationId,
    tenantConnectionId: opts.tenantConnectionId,
    userId: opts.triggeredByUserId,
    details: {
      jobType: opts.jobType,
      triggeredBy: opts.triggeredBy,
      targetId: opts.targetId,
      targetName: opts.targetName,
      ...(opts.durationMs !== undefined ? { durationMs: opts.durationMs } : {}),
      ...(opts.errorMessage ? { error: opts.errorMessage } : {}),
    },
    result: opts.result ?? (action === AUDIT_ACTIONS.SYNC_FAILED ? "FAILURE" : "SUCCESS"),
  });
}

export class DuplicateJobError extends Error {
  readonly code = "JOB_ALREADY_RUNNING";
  readonly jobType: JobType;
  readonly tenantConnectionId: string | null;
  constructor(jobType: JobType, tenantConnectionId: string | null) {
    super(
      `A job of type "${jobType}" is already running` +
        (tenantConnectionId ? ` for tenant ${tenantConnectionId}` : ""),
    );
    this.name = "DuplicateJobError";
    this.jobType = jobType;
    this.tenantConnectionId = tenantConnectionId;
  }
}

export class JobAbortedError extends Error {
  readonly code = "JOB_ABORTED";
  constructor(message = "Job was cancelled") {
    super(message);
    this.name = "JobAbortedError";
  }
}

export interface TrackJobOptions {
  jobType: JobType;
  organizationId: string | null;
  tenantConnectionId: string | null;
  triggeredBy?: JobTriggerSource;
  triggeredByUserId?: string | null;
  targetId?: string | null;
  targetName?: string | null;
  /** Progress updates are throttled to at most one DB write every N ms. */
  progressWriteThrottleMs?: number;
  meta?: Record<string, unknown>;
}

export interface TrackJobResult<T> {
  jobId: string;
  result: T;
}

/**
 * Wraps a unit of background work with full registry + DB lifecycle.
 *
 * Usage:
 *   const { jobId, result } = await trackJobRun(
 *     { jobType: "userInventory", organizationId, tenantConnectionId },
 *     async (signal, updateProgress) => {
 *       for (const page of pages) {
 *         if (signal.aborted) throw new JobAbortedError();
 *         updateProgress(`Page ${page.index}/${page.total}`, page.pctDone);
 *         await fetchPage(page, { signal });
 *       }
 *       return { pagesProcessed: pages.length };
 *     },
 *   );
 */
export async function trackJobRun<T>(
  opts: TrackJobOptions,
  work: (signal: AbortSignal, updateProgress: ProgressFn) => Promise<T>,
): Promise<TrackJobResult<T>> {
  const {
    jobType,
    organizationId,
    tenantConnectionId,
    triggeredBy = "manual",
    triggeredByUserId = null,
    targetId = null,
    targetName = null,
    progressWriteThrottleMs = 2_000,
    meta = {},
  } = opts;

  // 1. Concurrency guard
  if (tenantConnectionId && jobRegistry.isRunning(jobType, tenantConnectionId)) {
    throw new DuplicateJobError(jobType, tenantConnectionId);
  }

  const startedAt = new Date();

  // 2. DB row — create up front so history is complete even if the process dies.
  //    The DB generates the id; if the insert fails we fall back to a generated
  //    uuid so the in-memory registry still has a stable handle.
  let jobId: string;
  try {
    const row = await storage.createScheduledJobRun({
      jobType,
      organizationId: organizationId ?? null,
      tenantConnectionId: tenantConnectionId ?? null,
      status: "running",
      startedAt,
      triggeredBy,
      triggeredByUserId: triggeredByUserId ?? null,
      targetId: targetId ?? null,
      targetName: targetName ?? null,
    });
    jobId = row.id;
  } catch (err) {
    console.error(
      `[job-tracking] Failed to create scheduled_job_runs row for ${jobType}`,
      err,
    );
    // We still proceed — the in-memory registry is the live source of truth
    // and we don't want an audit-row failure to block the actual work.
    const { randomUUID } = await import("node:crypto");
    jobId = randomUUID();
  }

  // 3. In-memory registration
  const active: ActiveJob = jobRegistry.register({
    jobId,
    jobType,
    tenantConnectionId,
    organizationId,
    triggeredBy,
    triggeredByUserId,
    targetId,
    targetName,
    meta,
  });

  writeSyncAudit(AUDIT_ACTIONS.SYNC_STARTED, {
    jobId,
    jobType,
    organizationId: organizationId ?? null,
    tenantConnectionId: tenantConnectionId ?? null,
    triggeredByUserId: triggeredByUserId ?? null,
    triggeredBy,
    targetId: targetId ?? null,
    targetName: targetName ?? null,
  });

  // 4. Throttled progress writer
  let lastProgressWrite = 0;
  const updateProgress: ProgressFn = (label, pct) => {
    jobRegistry.updateProgress(jobId, { label, pct });
    const now = Date.now();
    if (now - lastProgressWrite < progressWriteThrottleMs) return;
    lastProgressWrite = now;
    void storage
      .updateScheduledJobRun(jobId, {
        progressLabel: label ?? null,
        itemsProcessed: active.itemsProcessed ?? null,
        itemsTotal: active.itemsTotal ?? null,
      })
      .catch((err) =>
        console.warn(`[job-tracking] progress update failed for ${jobId}:`, err),
      );
  };

  // 5. Run the work, always unregister, always update DB
  try {
    const result = await work(active.abortController.signal, updateProgress);

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const cancelled = active.abortController.signal.aborted;

    await storage
      .updateScheduledJobRun(jobId, {
        status: cancelled ? "cancelled" : "completed",
        completedAt,
        durationMs,
        result: serializeResult(result),
        itemsProcessed: active.itemsProcessed ?? null,
        itemsTotal: active.itemsTotal ?? null,
        progressLabel: null,
      })
      .catch((err) =>
        console.warn(`[job-tracking] completion update failed for ${jobId}:`, err),
      );

    writeSyncAudit(AUDIT_ACTIONS.SYNC_COMPLETED, {
      jobId,
      jobType,
      organizationId: organizationId ?? null,
      tenantConnectionId: tenantConnectionId ?? null,
      triggeredByUserId: triggeredByUserId ?? null,
      triggeredBy,
      targetId: targetId ?? null,
      targetName: targetName ?? null,
      durationMs,
      result: cancelled ? "PARTIAL" : "SUCCESS",
    });

    return { jobId, result };
  } catch (err) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();
    const aborted = active.abortController.signal.aborted || err instanceof JobAbortedError;
    const status = aborted ? "cancelled" : "failed";
    const errorMessage = err instanceof Error ? err.message : String(err);

    await storage
      .updateScheduledJobRun(jobId, {
        status,
        completedAt,
        durationMs,
        errorMessage,
        itemsProcessed: active.itemsProcessed ?? null,
        itemsTotal: active.itemsTotal ?? null,
        progressLabel: null,
      })
      .catch((dbErr) =>
        console.warn(`[job-tracking] failure update failed for ${jobId}:`, dbErr),
      );

    writeSyncAudit(aborted ? AUDIT_ACTIONS.SYNC_COMPLETED : AUDIT_ACTIONS.SYNC_FAILED, {
      jobId,
      jobType,
      organizationId: organizationId ?? null,
      tenantConnectionId: tenantConnectionId ?? null,
      triggeredByUserId: triggeredByUserId ?? null,
      triggeredBy,
      targetId: targetId ?? null,
      targetName: targetName ?? null,
      durationMs,
      errorMessage: aborted ? undefined : errorMessage,
      result: aborted ? "PARTIAL" : "FAILURE",
    });

    throw err;
  } finally {
    jobRegistry.unregister(jobId);
  }
}

/**
 * JSONB serialization: ensures the result is a plain object. Non-object
 * results are wrapped so Drizzle's jsonb column always stores an object.
 */
function serializeResult(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) {
    try {
      // Round-trip to strip class instances / undefined values
      return JSON.parse(JSON.stringify(value));
    } catch {
      return { value: String(value) };
    }
  }
  try {
    return { value: JSON.parse(JSON.stringify(value)) };
  } catch {
    return { value: String(value) };
  }
}
