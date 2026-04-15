import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

process.env.DATABASE_URL ??= "postgres://postgres:postgres@localhost:5432/synozur_test";

const { storage } = await import("../storage");
const { jobRegistry } = await import("./job-registry");
const { DuplicateJobError, trackJobRun } = await import("./job-tracking");

type CreateScheduledJobRunFn = typeof storage.createScheduledJobRun;
type UpdateScheduledJobRunFn = typeof storage.updateScheduledJobRun;

const originalCreateScheduledJobRun: CreateScheduledJobRunFn = storage.createScheduledJobRun.bind(storage);
const originalUpdateScheduledJobRun: UpdateScheduledJobRunFn = storage.updateScheduledJobRun.bind(storage);

afterEach(() => {
  storage.createScheduledJobRun = originalCreateScheduledJobRun;
  storage.updateScheduledJobRun = originalUpdateScheduledJobRun;
  jobRegistry.cleanupStale(-1);
});

describe("jobRegistry/trackJobRun", () => {
  it("treats aborted but still-registered jobs as running", async () => {
    const active = jobRegistry.register({
      jobId: "existing-job",
      jobType: "copilotSync",
      tenantConnectionId: "tenant-1",
      organizationId: "org-1",
      triggeredBy: "manual",
      triggeredByUserId: null,
    });

    jobRegistry.cancel(active.jobId);
    assert.equal(active.abortController.signal.aborted, true);
    assert.equal(jobRegistry.isRunning("copilotSync", "tenant-1"), true);

    await assert.rejects(
      trackJobRun(
        {
          jobType: "copilotSync",
          organizationId: "org-1",
          tenantConnectionId: "tenant-1",
        },
        async () => ({ ok: true }),
      ),
      DuplicateJobError,
    );
  });

  it("records cancelled when work returns after signal abort", async () => {
    const updates: Array<Record<string, unknown>> = [];

    storage.createScheduledJobRun = async () => ({ id: "job-1" } as any);
    storage.updateScheduledJobRun = async (_id, patch) => {
      updates.push({ ...patch });
      return {} as any;
    };

    const out = await trackJobRun(
      {
        jobType: "userInventory",
        organizationId: "org-1",
        tenantConnectionId: "tenant-1",
      },
      async () => {
        jobRegistry.cancel("job-1");
        return { status: "stopped-early" };
      },
    );

    assert.equal(out.jobId, "job-1");
    const terminal = updates.find((u) => u.status === "cancelled");
    assert.ok(terminal, "expected a cancelled terminal update");
    assert.equal(updates.some((u) => u.status === "completed"), false);
  });

  it("throttles progress writes to storage", async () => {
    const updates: Array<Record<string, unknown>> = [];

    storage.createScheduledJobRun = async () => ({ id: "job-2" } as any);
    storage.updateScheduledJobRun = async (_id, patch) => {
      updates.push({ ...patch });
      return {} as any;
    };

    await trackJobRun(
      {
        jobType: "copilotSync",
        organizationId: "org-1",
        tenantConnectionId: "tenant-2",
        progressWriteThrottleMs: 60_000,
      },
      async (_signal, updateProgress) => {
        updateProgress("step 1", 10);
        updateProgress("step 2", 20);
        return { done: true };
      },
    );

    const progressWrites = updates.filter((u) => u.progressLabel === "step 1");
    assert.equal(progressWrites.length, 1);
    assert.equal(progressWrites[0].progressLabel, "step 1");
  });
});
