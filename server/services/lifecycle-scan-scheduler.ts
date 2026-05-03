/**
 * BL-007 / BL-039 — Nightly lifecycle compliance scan scheduler.
 *
 * Runs the lifecycle compliance scan once per day for every active tenant
 * connection that has `lifecycleScanScheduleEnabled = true`. Each scheduled
 * pass also writes a `scheduled_job_runs` row of type `lifecycleComplianceScan`
 * so the Job Monitor and Dataset Freshness Registry can see the cadence.
 *
 * Tenant admins can disable the schedule per connection via the existing
 * PATCH /api/admin/tenants/:id endpoint by setting
 * `lifecycleScanScheduleEnabled: false`.
 */

import { storage } from "../storage";
import { executeLifecycleScan } from "./lifecycle-scan-runner";
import type { TenantConnection } from "@shared/schema";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 60_000;
// Run the scan if the most recent scheduled run for this tenant is older than
// this threshold. Slightly less than 24h to avoid drift across restarts.
const SCAN_INTERVAL_MS = 23 * 60 * 60 * 1000;

let schedulerTimer: NodeJS.Timeout | null = null;
let initialKickoffTimer: NodeJS.Timeout | null = null;

async function runOnceForTenant(conn: TenantConnection): Promise<void> {
  if (!conn.organizationId) return;
  if (conn.lifecycleScanScheduleEnabled === false) return;
  if (conn.status && conn.status !== "ACTIVE") return;

  // Skip if we already ran the scheduled scan for this tenant within the
  // dedupe window (covers process restarts and double-firing).
  try {
    const recent = await storage.listScheduledJobRuns({
      jobType: "lifecycleComplianceScan",
      tenantConnectionId: conn.id,
      limit: 1,
    });
    const last = recent.rows[0];
    if (last?.startedAt) {
      const ageMs = Date.now() - new Date(last.startedAt).getTime();
      if (ageMs < SCAN_INTERVAL_MS) return;
    }
  } catch (err) {
    console.error("[lifecycle-scheduler] failed to read recent runs:", err);
  }

  const startedAt = new Date();
  let jobRun: { id: string } | null = null;
  try {
    jobRun = await storage.createScheduledJobRun({
      organizationId: conn.organizationId,
      tenantConnectionId: conn.id,
      jobType: "lifecycleComplianceScan",
      status: "running",
      startedAt,
      triggeredBy: "scheduled",
      targetName: conn.tenantName ?? conn.tenantId,
    });
  } catch (err) {
    console.error("[lifecycle-scheduler] failed to create scheduled_job_runs row:", err);
  }

  try {
    const result = await executeLifecycleScan({
      organizationId: conn.organizationId,
      tenantConnectionId: conn.id,
      triggeredBy: "scheduled",
    });

    if (jobRun?.id) {
      const completedAt = new Date();
      try {
        await storage.updateScheduledJobRun(jobRun.id, {
          status: "completed",
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          itemsTotal: result.workspacesScanned,
          itemsProcessed: result.workspacesScanned,
          result: {
            scanRunId: result.run.id,
            workspacesScanned: result.workspacesScanned,
            averageScore: result.averageScore,
            compliantCount: result.compliantCount,
            staleCount: result.staleCount,
            orphanedCount: result.orphanedCount,
            missingLabelCount: result.missingLabelCount,
            externallySharedCount: result.externallySharedCount,
          },
        });
      } catch (err) {
        console.error("[lifecycle-scheduler] failed to finalize scheduled_job_runs row:", err);
      }
    }

    console.log(
      `[lifecycle-scheduler] tenant=${conn.tenantName ?? conn.id} scanned=${result.workspacesScanned} avgScore=${result.averageScore}`,
    );
  } catch (err: any) {
    console.error(
      `[lifecycle-scheduler] scan failed for tenant=${conn.tenantName ?? conn.id}:`,
      err,
    );
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

export async function runLifecycleScanCycle(): Promise<void> {
  try {
    const connections = await storage.getTenantConnections();
    for (const conn of connections) {
      try {
        await runOnceForTenant(conn);
      } catch (err) {
        console.error(
          `[lifecycle-scheduler] unexpected error for tenant=${conn.id}:`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("[lifecycle-scheduler] cycle failed:", err);
  }
}

export function startLifecycleScanScheduler(): void {
  if (schedulerTimer) return;

  initialKickoffTimer = setTimeout(() => {
    void runLifecycleScanCycle();
  }, STARTUP_DELAY_MS);
  initialKickoffTimer.unref?.();

  schedulerTimer = setInterval(() => {
    void runLifecycleScanCycle();
  }, ONE_DAY_MS);
  schedulerTimer.unref?.();
}

export function stopLifecycleScanScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (initialKickoffTimer) {
    clearTimeout(initialKickoffTimer);
    initialKickoffTimer = null;
  }
}
