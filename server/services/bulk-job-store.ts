import { randomUUID } from "node:crypto";

export interface BulkJobResult {
  workspaceId: string;
  displayName: string;
  success: boolean;
  error?: string;
  errorCode?: string;
}

export type BulkJobStatus = "running" | "completed" | "cancelled";

export interface BulkJob {
  jobId: string;
  action: string;
  status: BulkJobStatus;
  total: number;
  processed: number;
  results: BulkJobResult[];
  rollupAuditId: string | null;
  abortController: AbortController;
  userId: string | null;
  organizationId: string | null;
  startedAt: Date;
  completedAt?: Date;
}

class BulkJobStore {
  private jobs = new Map<string, BulkJob>();

  create(opts: {
    action: string;
    total: number;
    userId: string | null;
    organizationId: string | null;
  }): BulkJob {
    const job: BulkJob = {
      jobId: randomUUID(),
      action: opts.action,
      status: "running",
      total: opts.total,
      processed: 0,
      results: [],
      rollupAuditId: null,
      abortController: new AbortController(),
      userId: opts.userId,
      organizationId: opts.organizationId,
      startedAt: new Date(),
    };
    this.jobs.set(job.jobId, job);
    const timer = setTimeout(() => {
      this.jobs.delete(job.jobId);
    }, 2 * 60 * 60 * 1000);
    if (typeof timer === "object" && "unref" in timer) {
      (timer as NodeJS.Timeout).unref();
    }
    return job;
  }

  get(jobId: string): BulkJob | undefined {
    return this.jobs.get(jobId);
  }

  addResult(jobId: string, result: BulkJobResult): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.results.push(result);
    job.processed = job.results.length;
  }

  complete(jobId: string, rollupAuditId: string | null): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    job.status = job.abortController.signal.aborted ? "cancelled" : "completed";
    job.rollupAuditId = rollupAuditId;
    job.completedAt = new Date();
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "running") return false;
    job.abortController.abort();
    return true;
  }
}

export const bulkJobStore = new BulkJobStore();
