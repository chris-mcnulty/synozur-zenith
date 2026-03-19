import { storage } from '../storage';

let _cache: { plan: string; expiresAt: number } | null = null;
const TTL_MS = 30_000;

export async function getDefaultSignupPlan(): Promise<string> {
  const now = Date.now();
  if (_cache && now < _cache.expiresAt) {
    return _cache.plan;
  }
  const settings = await storage.getPlatformSettings();
  _cache = { plan: settings.defaultSignupPlan, expiresAt: now + TTL_MS };
  return settings.defaultSignupPlan;
}

export function invalidateDefaultSignupPlanCache(): void {
  _cache = null;
}
