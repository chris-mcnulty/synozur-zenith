import crypto from 'crypto';
import { type AIFeature } from '@shared/ai-schema';

interface CacheEntry {
  value: string;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, CacheEntry>();

export function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}

export function makeCacheKey(orgId: string, feature: AIFeature, promptHash: string): string {
  return `${orgId}:${feature}:${promptHash}`;
}

export function getCached(orgId: string, feature: AIFeature, promptHash: string): string | null {
  const key = makeCacheKey(orgId, feature, promptHash);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCached(orgId: string, feature: AIFeature, promptHash: string, value: string, ttlMs = DEFAULT_TTL_MS): void {
  const key = makeCacheKey(orgId, feature, promptHash);
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function evictExpired(): void {
  const now = Date.now();
  Array.from(cache.entries()).forEach(([key, entry]) => {
    if (now > entry.expiresAt) cache.delete(key);
  });
}

setInterval(evictExpired, 60_000).unref?.();
