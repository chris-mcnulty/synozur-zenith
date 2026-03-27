import type { FeatureToggleKey } from "@shared/schema";

const cancellationFlags = new Map<string, Set<string>>();

function getKey(tenantConnectionId: string, feature: FeatureToggleKey): string {
  return `${tenantConnectionId}:${feature}`;
}

export function cancelDiscovery(tenantConnectionId: string, feature: FeatureToggleKey): void {
  const key = getKey(tenantConnectionId, feature);
  if (!cancellationFlags.has(key)) {
    cancellationFlags.set(key, new Set());
  }
  const token = Date.now().toString();
  cancellationFlags.get(key)!.add(token);
  console.log(`[cancellation] Flagged cancellation for ${feature} on tenant ${tenantConnectionId}`);
}

export function isCancelled(tenantConnectionId: string, feature: FeatureToggleKey): boolean {
  const key = getKey(tenantConnectionId, feature);
  const tokens = cancellationFlags.get(key);
  return !!tokens && tokens.size > 0;
}

export function clearCancellation(tenantConnectionId: string, feature: FeatureToggleKey): void {
  const key = getKey(tenantConnectionId, feature);
  cancellationFlags.delete(key);
}
