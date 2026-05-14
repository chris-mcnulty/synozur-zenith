/**
 * BL-046 — Nightly Tenant Connection Health Monitor scheduler.
 *
 * Wakes up roughly once per day, runs a health-check cycle across every
 * active tenant connection, and records each result. Modeled on the
 * lifecycle-scan-scheduler pattern.
 */

import { storage } from "../storage";
import { runHealthCheckCycle } from "./tenant-health-monitor";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 90_000;
const CYCLE_INTERVAL_MS = 23 * 60 * 60 * 1000;

let schedulerTimer: NodeJS.Timeout | null = null;
let initialKickoffTimer: NodeJS.Timeout | null = null;

async function shouldRunNow(): Promise<boolean> {
  try {
    const recent = await storage.listScheduledJobRuns({
      jobType: "tenantHealthCheck",
      limit: 1,
    });
    const last = recent.rows[0];
    if (!last?.startedAt) return true;
    const ageMs = Date.now() - new Date(last.startedAt).getTime();
    return ageMs >= CYCLE_INTERVAL_MS;
  } catch (err) {
    console.error("[tenant-health-scheduler] failed to read recent runs:", err);
    return true;
  }
}

export async function runScheduledHealthCycle(): Promise<void> {
  if (!(await shouldRunNow())) return;

  const startedAt = new Date();
  let jobRun: { id: string } | null = null;
  try {
    jobRun = await storage.createScheduledJobRun({
      organizationId: null,
      tenantConnectionId: null,
      jobType: "tenantHealthCheck",
      status: "running",
      startedAt,
      triggeredBy: "scheduled",
      targetName: "All connected tenants",
    });
  } catch (err) {
    console.error("[tenant-health-scheduler] failed to create scheduled_job_runs row:", err);
  }

  try {
    const stats = await runHealthCheckCycle();
    const completedAt = new Date();
    if (jobRun?.id) {
      try {
        await storage.updateScheduledJobRun(jobRun.id, {
          status: "completed",
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          itemsTotal: stats.checked,
          itemsProcessed: stats.checked,
          result: stats,
        });
      } catch (err) {
        console.error("[tenant-health-scheduler] failed to finalize scheduled_job_runs row:", err);
      }
    }
    console.log(
      `[tenant-health-scheduler] checked=${stats.checked} degraded=${stats.degraded} recovered=${stats.recovered}`,
    );
  } catch (err: any) {
    console.error("[tenant-health-scheduler] cycle failed:", err);
    if (jobRun?.id) {
      const completedAt = new Date();
      try {
        await storage.updateScheduledJobRun(jobRun.id, {
          status: "failed",
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          errorMessage: err?.message ?? String(err),
        });
      } catch {
        /* swallow */
      }
    }
  }
}

export function startTenantHealthScheduler(): void {
  if (schedulerTimer) return;

  initialKickoffTimer = setTimeout(() => {
    void runScheduledHealthCycle();
  }, STARTUP_DELAY_MS);
  initialKickoffTimer.unref?.();

  schedulerTimer = setInterval(() => {
    void runScheduledHealthCycle();
  }, ONE_DAY_MS);
  schedulerTimer.unref?.();
}

export function stopTenantHealthScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (initialKickoffTimer) {
    clearTimeout(initialKickoffTimer);
    initialKickoffTimer = null;
  }
}
