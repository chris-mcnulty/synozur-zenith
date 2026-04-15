import type { FeatureToggleKey, JobType } from "@shared/schema";
import { jobRegistry } from "./job-registry";

/**
 * Scope names for cancellable background jobs. Historically this mirrored
 * `FeatureToggleKey`, but some jobs (e.g. the Email Content Storage Report)
 * are on-demand and not gated by a tenant feature toggle. The union below
 * keeps the type narrow but admits additional report-level scopes.
 */
export type CancellationScope = FeatureToggleKey | "emailContentStorageReport" | "sharingLinks";

/**
 * BL-039: bridge between the legacy scope-based cancellation API and the
 * new unified jobRegistry / AbortController model. Each scope maps to a
 * canonical JobType so a single Cancel click in either system propagates
 * to the other:
 *
 *   - cancelDiscovery(scope) → ALSO calls jobRegistry.cancelByScope(jobType)
 *   - isCancelled(scope)     → ALSO returns true when any active job of
 *                              the matching type for the tenant has its
 *                              AbortController aborted
 *
 * This lets services that haven't been fully migrated to AbortSignal
 * cancellation continue to use isCancelled() while routes/UIs migrating
 * to /api/jobs/:jobId/cancel still trigger the same effect.
 */
const SCOPE_TO_JOB_TYPE: Partial<Record<CancellationScope, JobType>> = {
  sharingLinks: "sharingLinkDiscovery",
  onedriveInventory: "oneDriveInventory",
  teamsDiscovery: "teamsInventory",
  recordingsDiscovery: "teamsRecordings",
  emailContentStorageReport: "emailStorageReport",
};

const cancellationFlags = new Map<string, Set<string>>();

function getKey(tenantConnectionId: string, scope: CancellationScope, runId?: string): string {
  return runId
    ? `${tenantConnectionId}:${scope}:${runId}`
    : `${tenantConnectionId}:${scope}`;
}

export function cancelDiscovery(
  tenantConnectionId: string,
  scope: CancellationScope,
  runId?: string,
): void {
  const key = getKey(tenantConnectionId, scope, runId);
  if (!cancellationFlags.has(key)) {
    cancellationFlags.set(key, new Set());
  }
  const token = Date.now().toString();
  cancellationFlags.get(key)!.add(token);
  console.log(
    `[cancellation] Flagged cancellation for ${scope}${runId ? `:${runId}` : ""} ` +
      `on tenant ${tenantConnectionId}`,
  );

  // Bridge: also propagate to the unified jobRegistry so any retrofitted
  // job using AbortSignal stops at its next abort check.
  const jobType = SCOPE_TO_JOB_TYPE[scope];
  if (jobType) {
    const aborted = jobRegistry.cancelByScope(jobType, tenantConnectionId);
    if (aborted > 0) {
      console.log(
        `[cancellation] Bridged to jobRegistry: aborted ${aborted} active ${jobType} job(s)`,
      );
    }
  }
}

export function isCancelled(
  tenantConnectionId: string,
  scope: CancellationScope,
  runId?: string,
): boolean {
  // Check both the run-scoped key and the global scope key, so a broad
  // "cancel this feature" signal still stops per-run jobs.
  const runKey = getKey(tenantConnectionId, scope, runId);
  const scopeKey = getKey(tenantConnectionId, scope);
  const runTokens = cancellationFlags.get(runKey);
  const scopeTokens = cancellationFlags.get(scopeKey);
  if ((!!runTokens && runTokens.size > 0) || (!!scopeTokens && scopeTokens.size > 0)) {
    return true;
  }

  // Bridge: also report cancelled if a matching job in the unified
  // registry has had its AbortController aborted (e.g. via the new
  // POST /api/jobs/:jobId/cancel endpoint).
  const jobType = SCOPE_TO_JOB_TYPE[scope];
  if (jobType) {
    const active = jobRegistry.getActive(tenantConnectionId);
    for (const job of active) {
      if (job.jobType === jobType && job.abortController.signal.aborted) {
        return true;
      }
    }
  }
  return false;
}

export function clearCancellation(
  tenantConnectionId: string,
  scope: CancellationScope,
  runId?: string,
): void {
  const key = getKey(tenantConnectionId, scope, runId);
  cancellationFlags.delete(key);
}
