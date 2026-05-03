/**
 * Tiny in-process token-bucket rate limiter for the Galaxy Partner API.
 * Zenith is a single-host process today, so this is sufficient — when we
 * scale horizontally we can swap this for Redis without changing call sites.
 */

interface Bucket {
  windowStart: number;
  count: number;
  limitPerMinute: number;
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;

export interface RateCheck {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  limit: number;
}

export function check(key: string, limitPerMinute: number): RateCheck {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    bucket = { windowStart: now, count: 0, limitPerMinute };
    buckets.set(key, bucket);
  }
  bucket.limitPerMinute = limitPerMinute;
  if (bucket.count >= limitPerMinute) {
    const retryAfter = Math.max(1, Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000));
    return { allowed: false, remaining: 0, retryAfterSeconds: retryAfter, limit: limitPerMinute };
  }
  bucket.count += 1;
  return {
    allowed: true,
    remaining: Math.max(0, limitPerMinute - bucket.count),
    retryAfterSeconds: 0,
    limit: limitPerMinute,
  };
}

export function reset(): void {
  buckets.clear();
}

// Periodically prune expired buckets so the map doesn't grow unboundedly.
const sweep = setInterval(() => {
  const now = Date.now();
  buckets.forEach((b, k) => {
    if (now - b.windowStart >= WINDOW_MS * 2) buckets.delete(k);
  });
}, 5 * WINDOW_MS);
sweep.unref?.();
