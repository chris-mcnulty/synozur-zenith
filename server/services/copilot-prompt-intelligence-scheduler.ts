/**
 * Copilot Prompt Intelligence daily sync scheduler.
 *
 * Runs the full pipeline once per day per tenant connection that meets ALL of:
 *   1. Has an organizationId (belongs to an org).
 *   2. The org has the `copilotPromptIntelligence` feature enabled (Professional+ plan).
 *   3. `copilotSyncScheduleEnabled !== false` (tenant admin has not opted out).
 *   4. Status is ACTIVE.
 *
 * Each scheduled pass:
 *   a. Runs the Graph interaction sync (startTrackedSync) — writes to copilot_sync_runs.
 *   b. After sync completes, triggers an assessment (runCopilotPromptAssessment) —
 *      writes to copilot_prompt_assessments.
 *
 * Failures are isolated per tenant and surface in the existing sync/assessment
 * history views without affecting other tenants.
 */

import { storage } from "../storage";
import { isFeatureEnabled } from "./feature-gate";
import { syncCopilotInteractions } from "./copilot-interaction-sync";
import { runCopilotPromptAssessment } from "./copilot-prompt-intelligence-service";
import type { TenantConnection } from "@shared/schema";
import type { ServicePlanTier } from "@shared/schema";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 90_000;
const SYNC_INTERVAL_MS = 23 * 60 * 60 * 1000;

let schedulerTimer: NodeJS.Timeout | null = null;
let initialKickoffTimer: NodeJS.Timeout | null = null;

async function runOnceForTenant(conn: TenantConnection): Promise<void> {
  if (!conn.organizationId) return;
  if (conn.copilotSyncScheduleEnabled === false) return;
  if (conn.status && conn.status !== "ACTIVE") return;

  const org = await storage.getOrganization(conn.organizationId);
  if (!org) return;

  const plan = (org.servicePlan || "TRIAL") as ServicePlanTier;
  if (!isFeatureEnabled(plan, "copilotPromptIntelligence")) return;

  try {
    const { rows: recentSyncs } = await storage.listCopilotSyncRuns(conn.id, { limit: 1 });
    const lastSync = recentSyncs[0];
    if (lastSync?.startedAt) {
      const ageMs = Date.now() - new Date(lastSync.startedAt).getTime();
      if (ageMs < SYNC_INTERVAL_MS) return;
    }
  } catch (err) {
    console.error("[copilot-scheduler] failed to read recent sync runs:", err);
  }

  console.log(`[copilot-scheduler] starting scheduled sync for tenant=${conn.tenantName ?? conn.id}`);

  let syncRunId: string | undefined;
  try {
    const syncRun = await storage.createCopilotSyncRun({
      tenantConnectionId: conn.id,
      organizationId: conn.organizationId,
      status: "RUNNING",
      triggeredBy: "scheduled",
      startedAt: new Date(),
    });
    syncRunId = syncRun.id;
  } catch (err) {
    console.error("[copilot-scheduler] failed to create sync run row:", err);
  }

  try {
    const summary = await syncCopilotInteractions(conn.id, syncRunId);
    if (syncRunId) {
      await storage.updateCopilotSyncRun(syncRunId, {
        status: "COMPLETED",
        usersScanned: summary.usersScanned,
        interactionsCaptured: summary.interactionsCaptured,
        interactionsSkipped: summary.interactionsSkipped,
        interactionsPurged: summary.interactionsPurged,
        errorCount: summary.errors.length,
        errors: summary.errors,
        completedAt: new Date(),
      });
    }
    console.log(
      `[copilot-scheduler] sync complete for tenant=${conn.tenantName ?? conn.id} ` +
      `captured=${summary.interactionsCaptured} errors=${summary.errors.length}`,
    );
  } catch (err: any) {
    console.error(
      `[copilot-scheduler] sync failed for tenant=${conn.tenantName ?? conn.id}:`,
      err,
    );
    if (syncRunId) {
      await storage.updateCopilotSyncRun(syncRunId, {
        status: "FAILED",
        error: err?.message ?? String(err),
        completedAt: new Date(),
      }).catch(() => undefined);
    }
    return;
  }

  try {
    const assessmentId = await runCopilotPromptAssessment(
      conn.id,
      conn.organizationId,
      null,
    );
    console.log(
      `[copilot-scheduler] assessment started for tenant=${conn.tenantName ?? conn.id} assessmentId=${assessmentId}`,
    );
  } catch (err: any) {
    console.error(
      `[copilot-scheduler] assessment failed for tenant=${conn.tenantName ?? conn.id}:`,
      err,
    );
  }
}

export async function runCopilotSyncCycle(): Promise<void> {
  try {
    const connections = await storage.getTenantConnections();
    for (const conn of connections) {
      try {
        await runOnceForTenant(conn);
      } catch (err) {
        console.error(
          `[copilot-scheduler] unexpected error for tenant=${conn.id}:`,
          err,
        );
      }
    }
  } catch (err) {
    console.error("[copilot-scheduler] cycle failed:", err);
  }
}

export function startCopilotSyncScheduler(): void {
  if (schedulerTimer) return;

  initialKickoffTimer = setTimeout(() => {
    void runCopilotSyncCycle();
  }, STARTUP_DELAY_MS);
  initialKickoffTimer.unref?.();

  schedulerTimer = setInterval(() => {
    void runCopilotSyncCycle();
  }, ONE_DAY_MS);
  schedulerTimer.unref?.();
}

export function stopCopilotSyncScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  if (initialKickoffTimer) {
    clearTimeout(initialKickoffTimer);
    initialKickoffTimer = null;
  }
}
