/**
 * BL-039 — In-memory registry of currently-running background jobs.
 *
 * This is the single source of truth for "what is running right now?" and
 * for cancellation via AbortController. Every background data-gathering job
 * registers here at launch (via trackJobRun) and is removed on completion
 * or failure.
 *
 * The database-backed audit trail lives in `scheduled_job_runs`; this
 * in-memory map is ephemeral — on process restart it's empty, and
 * `cleanupStale()` is responsible for reconciling orphaned DB rows.
 */
import type { JobType } from "@shared/schema";

export type ProgressFn = (label: string | null, pct?: number | null) => void;

export interface ActiveJob {
  jobId: string;
  jobType: JobType;
  tenantConnectionId: string | null;
  organizationId: string | null;
  status: "running";
  startedAt: Date;
  triggeredBy: "manual" | "system" | "scheduled";
  triggeredByUserId: string | null;
  abortController: AbortController;
  progressLabel: string | null;
  progressPct: number | null;
  itemsTotal: number | null;
  itemsProcessed: number | null;
  targetId: string | null;
  targetName: string | null;
  meta: Record<string, unknown>;
}

export interface RegisterOptions {
  jobId: string;
  jobType: JobType;
  tenantConnectionId: string | null;
  organizationId: string | null;
  triggeredBy: "manual" | "system" | "scheduled";
  triggeredByUserId: string | null;
  targetId?: string | null;
  targetName?: string | null;
  meta?: Record<string, unknown>;
}

class JobRegistry {
  private activeJobs = new Map<string, ActiveJob>();

  register(opts: RegisterOptions): ActiveJob {
    const job: ActiveJob = {
      jobId: opts.jobId,
      jobType: opts.jobType,
      tenantConnectionId: opts.tenantConnectionId,
      organizationId: opts.organizationId,
      status: "running",
      startedAt: new Date(),
      triggeredBy: opts.triggeredBy,
      triggeredByUserId: opts.triggeredByUserId,
      abortController: new AbortController(),
      progressLabel: null,
      progressPct: null,
      itemsTotal: null,
      itemsProcessed: null,
      targetId: opts.targetId ?? null,
      targetName: opts.targetName ?? null,
      meta: opts.meta ?? {},
    };
    this.activeJobs.set(job.jobId, job);
    return job;
  }

  /** Remove a job from the registry (called on completion/failure/cancel). */
  unregister(jobId: string): void {
    this.activeJobs.delete(jobId);
  }

  /** Signal cancellation for a single job. Does NOT remove it from the map; the job's finally-block does that. */
  cancel(jobId: string): boolean {
    const job = this.activeJobs.get(jobId);
    if (!job) return false;
    if (!job.abortController.signal.aborted) {
      job.abortController.abort();
    }
    return true;
  }

  /**
   * Cancel every active job of a given type for a given tenant. Preserves
   * the "cancel-by-scope" semantics of the legacy discovery-cancellation
   * service while routing through the unified AbortController mechanism.
   */
  cancelByScope(jobType: JobType, tenantConnectionId: string): number {
    let cancelled = 0;
    Array.from(this.activeJobs.values()).forEach((job) => {
      if (
        job.jobType === jobType &&
        job.tenantConnectionId === tenantConnectionId &&
        !job.abortController.signal.aborted
      ) {
        job.abortController.abort();
        cancelled++;
      }
    });
    return cancelled;
  }

  /** Returns true if at least one job of the given type is currently running for the tenant. */
  isRunning(jobType: JobType, tenantConnectionId: string | null): boolean {
    const jobs = Array.from(this.activeJobs.values());
    for (const job of jobs) {
      if (job.jobType === jobType && job.tenantConnectionId === tenantConnectionId) {
        return true;
      }
    }
    return false;
  }

  /** List active jobs, optionally filtered by tenant connection. */
  getActive(tenantConnectionId?: string | null): ActiveJob[] {
    const all = Array.from(this.activeJobs.values());
    if (tenantConnectionId === undefined) return all;
    return all.filter((j) => j.tenantConnectionId === tenantConnectionId);
  }

  get(jobId: string): ActiveJob | undefined {
    return this.activeJobs.get(jobId);
  }

  /** Update progress fields (called from within job work via the ProgressFn closure). */
  updateProgress(
    jobId: string,
    updates: {
      label?: string | null;
      pct?: number | null;
      itemsTotal?: number | null;
      itemsProcessed?: number | null;
    },
  ): void {
    const job = this.activeJobs.get(jobId);
    if (!job) return;
    if (updates.label !== undefined) job.progressLabel = updates.label;
    if (updates.pct !== undefined) job.progressPct = updates.pct;
    if (updates.itemsTotal !== undefined) job.itemsTotal = updates.itemsTotal;
    if (updates.itemsProcessed !== undefined) job.itemsProcessed = updates.itemsProcessed;
  }

  /**
   * Forcibly remove entries older than maxAgeMs (defensive — normal lifecycle
   * removes entries in trackJobRun's finally). Used by periodic sweeps.
   */
  cleanupStale(maxAgeMs = 60 * 60 * 1000): number {
    const now = Date.now();
    let removed = 0;
    const entries = Array.from(this.activeJobs.entries());
    for (const [id, job] of entries) {
      if (now - job.startedAt.getTime() > maxAgeMs) {
        this.activeJobs.delete(id);
        removed++;
      }
    }
    return removed;
  }

  size(): number {
    return this.activeJobs.size;
  }
}

/** Module-level singleton. */
export const jobRegistry = new JobRegistry();
