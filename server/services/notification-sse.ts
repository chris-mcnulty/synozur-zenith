/**
 * BL-013 — Server-Sent Events registry for live notification push.
 *
 * Routes register a user's response object here; notification-events publishes
 * into it so the bell badge updates without polling.
 */
import type { Response } from "express";

const connections = new Map<string, Set<Response>>();

export function sseSubscribe(userId: string, res: Response): () => void {
  if (!connections.has(userId)) connections.set(userId, new Set());
  const set = connections.get(userId)!;
  set.add(res);
  return () => {
    set.delete(res);
    if (set.size === 0) connections.delete(userId);
  };
}

export function ssePublish(userId: string, event: string, data: unknown): void {
  const set = connections.get(userId);
  if (!set || set.size === 0) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch {
      set.delete(res);
    }
  }
  if (set.size === 0) connections.delete(userId);
}
