/**
 * Nightly Data Refresh & Health Report scheduler (premium / Enterprise).
 *
 * Once per day, for every active tenant connection whose organization is on a
 * plan with the `scheduledHealthReports` feature and that has not opted out
 * (`nightlyRefreshScheduleEnabled = true`), this:
 *
 *   1. Refreshes workspace (site) and document-library data from Microsoft
 *      Graph via `runSharePointTenantSync` so storage/quota figures are fresh.
 *   2. Generates a Nightly Health Report flagging sites over 75% and over 90%
 *      of storage quota plus other governance health issues.
 *   3. Delivers the report in-product (notification) and by email to admins.
 *
 * Each pass writes a `scheduled_job_runs` row of type `nightlyHealthReport` so
 * the Job Monitor and Dataset Freshness Registry can see the cadence. Modeled
 * on lifecycle-scan-scheduler.ts.
 */

import { storage } from "../storage";
import { runSharePointTenantSync } from "./sharepoint-sync";
import { runNightlyHealthReport } from "./nightly-health-report";
import { getPlanFeatures } from "./feature-gate";
import type { ServicePlanTier, TenantConnection } from "@shared/schema";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 120_000;
// Run if the most recent scheduled run for this tenant is older than this.
// Slightly less than 24h to avoid drift across restarts.
const CYCLE_INTERVAL_MS = 23 * 60 * 60 * 1000;

let schedulerTimer: NodeJS.Timeout | null = null;
let initialKickoffTimer: NodeJS.Timeout | null = null;

async function isFeatureEnabledForConnection(conn: TenantConnection): Promise<boolean> {
  if (!conn.organizationId) return false;
  try {
    const org = await storage.getOrganization(conn.organizationId);
    const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
    return !!getPlanFeatures(plan).scheduledHealthReports;
  } catch (err) {
    console.error("[nightly-health-scheduler] failed to read org plan:", err);
    return false;
  }
}

async function runOnceForTenant(conn: TenantConnection): Promise<void> {
  if (!conn.organizationId) return;
  if (conn.status && conn.status !== "ACTIVE") return;
  if (!(await isFeatureEnabledForConnection(conn))) return;

  // Three independent admin toggles. An admin can disable report generation
  // and/or email while still running the nightly data refresh.
  const doRefresh = conn.nightlyRefreshScheduleEnabled !== false;
  const doReport = conn.nightlyHealthReportEnabled !== false;
  const doEmail = conn.nightlyHealthReportEmailEnabled !== false;

  // Nothing to do for this tenant if both refresh and report are disabled.
  if (!doRefresh && !doReport) return;

  // Dedupe window — covers process restarts and double-firing.
  try {
    const recent = await storage.listScheduledJobRuns({
      jobType: "nightlyHealthReport",
      tenantConnectionId: conn.id,
      limit: 1,
    });
    const last = recent.rows[0];
    if (last?.startedAt) {
      const ageMs = Date.now() - new Date(last.startedAt).getTime();
      if (ageMs < CYCLE_INTERVAL_MS) return;
    }
  } catch (err) {
    console.error("[nightly-health-scheduler] failed to read recent runs:", err);
  }

  const startedAt = new Date();
  let jobRun: { id: string } | null = null;
  try {
    jobRun = await storage.createScheduledJobRun({
      organizationId: conn.organizationId,
      tenantConnectionId: conn.id,
      jobType: "nightlyHealthReport",
      status: "running",
      startedAt,
      triggeredBy: "scheduled",
      targetName: conn.tenantName ?? conn.tenantId,
    });
  } catch (err) {
    console.error("[nightly-health-scheduler] failed to create scheduled_job_runs row:", err);
  }

  try {
    // 1. Refresh sites + libraries so quota figures are current. Non-fatal:
    //    if the refresh fails we still report on the last-synced data with a
    //    caveat in the snapshot.
    let refreshedAt: Date | null = null;
    if (doRefresh) {
      try {
        const sync = await runSharePointTenantSync(conn.id, {
          triggeredByOrgId: conn.organizationId,
        });
        if (sync.success) refreshedAt = new Date();
        else {
          console.error(
            `[nightly-health-scheduler] refresh did not fully succeed for tenant=${conn.tenantName ?? conn.id}: ${sync.error ?? "unknown"}`,
          );
        }
      } catch (err) {
        console.error(
          `[nightly-health-scheduler] data refresh failed for tenant=${conn.tenantName ?? conn.id}:`,
          err,
        );
      }
    }

    // 2. Generate + deliver the health report (if enabled). Email delivery is
    //    a further independent toggle.
    const report = doReport
      ? await runNightlyHealthReport({
          organizationId: conn.organizationId,
          tenantConnectionId: conn.id,
          tenantName: conn.tenantName ?? conn.tenantId,
          triggeredBy: "scheduled",
          refreshedAt,
          sendEmail: doEmail,
        })
      : null;

    if (jobRun?.id) {
      const completedAt = new Date();
      const reportFailed = report?.status === "FAILED";
      try {
        await storage.updateScheduledJobRun(jobRun.id, {
          status: reportFailed ? "failed" : "completed",
          completedAt,
          durationMs: completedAt.getTime() - startedAt.getTime(),
          itemsTotal: report?.snapshot?.totals.sitesEvaluated ?? null,
          itemsProcessed: report?.snapshot?.totals.sitesEvaluated ?? null,
          result: {
            refreshed: refreshedAt !== null,
            reportGenerated: report !== null,
            reportId: report?.id ?? null,
            sitesOver75: report?.sitesOver75 ?? 0,
            sitesOver90: report?.sitesOver90 ?? 0,
            issueCount: report?.issueCount ?? 0,
            emailRecipientCount: report?.emailRecipientCount ?? 0,
          },
          errorMessage: reportFailed ? report?.error ?? "report failed" : undefined,
        });
      } catch (err) {
        console.error("[nightly-health-scheduler] failed to finalize scheduled_job_runs row:", err);
      }
    }

    console.log(
      `[nightly-health-scheduler] tenant=${conn.tenantName ?? conn.id} refreshed=${refreshedAt !== null} report=${report !== null} over90=${report?.sitesOver90 ?? 0} over75=${report?.sitesOver75 ?? 0} issues=${report?.issueCount ?? 0}`,
    );
  } catch (err: any) {
    console.error(
      `[nightly-health-scheduler] cycle failed for tenant=${conn.tenantName ?? conn.id}:`,
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

export async function runNightlyHealthReportCycle(): Promise<void> {
  try {
    const connections = await storage.getTenantConnections();
    for (const conn of connections) {
      try {
        await runOnceForTenant(conn);
      } catch (err) {
        console.error(
          `[nightly-health-scheduler] unexpected error for tenant=${conn.id}:`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("[nightly-health-scheduler] cycle failed:", err);
  }
}

export function startNightlyHealthReportScheduler(): void {
  if (schedulerTimer) return;

  initialKickoffTimer = setTimeout(() => {
    void runNightlyHealthReportCycle();
  }, STARTUP_DELAY_MS);
  initialKickoffTimer.unref?.();

  schedulerTimer = setInterval(() => {
    void runNightlyHealthReportCycle();
  }, ONE_DAY_MS);
  schedulerTimer.unref?.();
}

export function stopNightlyHealthReportScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (initialKickoffTimer) {
    clearTimeout(initialKickoffTimer);
    initialKickoffTimer = null;
  }
}
