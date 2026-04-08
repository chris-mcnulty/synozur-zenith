import type { FeatureToggleKey } from "@shared/schema";

/**
 * Scope names for cancellable background jobs. Historically this mirrored
 * `FeatureToggleKey`, but some jobs (e.g. the Email Content Storage Report)
 * are on-demand and not gated by a tenant feature toggle. The union below
 * keeps the type narrow but admits additional report-level scopes.
 */
export type CancellationScope = FeatureToggleKey | "emailContentStorageReport";

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
  return (!!runTokens && runTokens.size > 0) || (!!scopeTokens && scopeTokens.size > 0);
}

export function clearCancellation(
  tenantConnectionId: string,
  scope: CancellationScope,
  runId?: string,
): void {
  const key = getKey(tenantConnectionId, scope, runId);
  cancellationFlags.delete(key);
}
