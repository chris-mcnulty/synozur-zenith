import crypto from "crypto";
import dns from "dns/promises";
import net from "net";
import { db } from "../db";
import {
  auditLog,
  auditStreamConfigs,
  auditStreamDeliveries,
  type AuditLog,
  type AuditStreamConfig,
  type AuditStreamDelivery,
  type InsertAuditStreamDelivery,
} from "@shared/schema";
import { and, asc, desc, eq, gt, or, sql, type SQL } from "drizzle-orm";
import { decryptToken, encryptToken, isEncrypted } from "../utils/encryption";

const POLL_INTERVAL_MS = 15_000;
const MAX_BATCH_DEFAULT = 100;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [500, 2_000, 5_000];
const DELIVERY_HISTORY_LIMIT = 200;
const REQUEST_TIMEOUT_MS = 15_000;

let streamTimer: NodeJS.Timeout | null = null;
let running = false;

export function encryptStreamSecret(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  if (isEncrypted(plaintext)) return plaintext;
  return encryptToken(plaintext);
}

export function decryptStreamSecret(ciphertext: string | null | undefined): string | null {
  if (!ciphertext) return null;
  try {
    return decryptToken(ciphertext);
  } catch {
    return null;
  }
}

function maskSecret(secret: string | null): string | null {
  if (!secret) return null;
  if (secret.length <= 8) return "********";
  return `${secret.slice(0, 4)}…${secret.slice(-2)}`;
}

export function publicConfigShape(cfg: AuditStreamConfig) {
  const decrypted = decryptStreamSecret(cfg.secretEncrypted);
  return {
    id: cfg.id,
    organizationId: cfg.organizationId,
    destinationType: cfg.destinationType,
    endpoint: cfg.endpoint,
    secretMasked: maskSecret(decrypted),
    secretConfigured: !!cfg.secretEncrypted,
    options: cfg.options ?? null,
    enabled: cfg.enabled,
    batchSize: cfg.batchSize,
    lastDeliveryAt: cfg.lastDeliveryAt,
    lastDeliveryStatus: cfg.lastDeliveryStatus,
    lastError: cfg.lastError,
    lastErrorAt: cfg.lastErrorAt,
    consecutiveFailures: cfg.consecutiveFailures,
    totalDelivered: cfg.totalDelivered,
    totalFailed: cfg.totalFailed,
    cursorTimestamp: cfg.cursorTimestamp,
    createdAt: cfg.createdAt,
    updatedAt: cfg.updatedAt,
  };
}

const PRIVATE_IPV4_RANGES: Array<[string, number]> = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["100.64.0.0", 10],
  ["0.0.0.0", 8],
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = parseInt(p, 10);
    if (!Number.isFinite(v) || v < 0 || v > 255) return null;
    n = (n << 8) + v;
  }
  return n >>> 0;
}

function isPrivateIPv4(ip: string): boolean {
  const ipNum = ipv4ToInt(ip);
  if (ipNum === null) return true;
  for (const [base, bits] of PRIVATE_IPV4_RANGES) {
    const baseNum = ipv4ToInt(base);
    if (baseNum === null) continue;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    if ((ipNum & mask) === (baseNum & mask)) return true;
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lowered = ip.toLowerCase();
  if (lowered === "::1" || lowered === "::") return true;
  if (lowered.startsWith("fc") || lowered.startsWith("fd")) return true; // unique local
  if (lowered.startsWith("fe80")) return true; // link-local
  if (lowered.startsWith("::ffff:")) {
    const v4 = lowered.slice(7);
    if (net.isIPv4(v4)) return isPrivateIPv4(v4);
  }
  return false;
}

export async function validateStreamEndpoint(rawUrl: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "Endpoint must be a valid URL" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "Endpoint must use HTTPS" };
  }
  const host = url.hostname;
  if (!host) return { ok: false, reason: "Endpoint must have a hostname" };

  const lowered = host.toLowerCase();
  if (lowered === "localhost" || lowered.endsWith(".localhost") || lowered.endsWith(".internal") || lowered.endsWith(".local")) {
    return { ok: false, reason: "Endpoint hostname is not routable" };
  }

  const literalIp =
    net.isIPv4(host) ? host :
    net.isIPv6(host) ? host :
    host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : null;

  const ipsToCheck: string[] = [];
  if (literalIp) {
    ipsToCheck.push(literalIp);
  } else {
    let resolved: { address: string; family: number }[];
    try {
      resolved = await dns.lookup(host, { all: true });
    } catch {
      return { ok: false, reason: "Endpoint hostname could not be resolved" };
    }
    if (resolved.length === 0) return { ok: false, reason: "Endpoint hostname could not be resolved" };
    ipsToCheck.push(...resolved.map((r) => r.address));
  }

  for (const ip of ipsToCheck) {
    if (net.isIPv4(ip) && isPrivateIPv4(ip)) {
      return { ok: false, reason: `Endpoint resolves to private IP ${ip}` };
    }
    if (net.isIPv6(ip) && isPrivateIPv6(ip)) {
      return { ok: false, reason: `Endpoint resolves to private IP ${ip}` };
    }
  }
  return { ok: true };
}

interface SerialisedEvent {
  id: string;
  timestamp: Date | null;
  action: string;
  result: string;
  resource: string;
  resourceId: string | null;
  organizationId: string | null;
  tenantConnectionId: string | null;
  userId: string | null;
  userEmail: string | null;
  ipAddress: string | null;
  details: Record<string, unknown> | null;
  source: "zenith";
}

function serialiseEvent(entry: AuditLog): SerialisedEvent {
  return {
    id: entry.id,
    timestamp: entry.createdAt,
    action: entry.action,
    result: entry.result,
    resource: entry.resource,
    resourceId: entry.resourceId,
    organizationId: entry.organizationId,
    tenantConnectionId: entry.tenantConnectionId,
    userId: entry.userId,
    userEmail: entry.userEmail,
    ipAddress: entry.ipAddress,
    details: entry.details ?? null,
    source: "zenith",
  };
}

interface BuiltRequest {
  url: string;
  method: "POST" | "PUT";
  headers: Record<string, string>;
  body: string;
}

function buildRequest(cfg: AuditStreamConfig, events: SerialisedEvent[], secret: string | null): BuiltRequest {
  const opts: Record<string, unknown> = (cfg.options ?? {}) as Record<string, unknown>;

  if (cfg.destinationType === "sentinel") {
    const workspaceId = String(opts.workspaceId ?? "");
    const logType = String(opts.logType ?? "ZenithAudit");
    const body = JSON.stringify(events);
    const date = new Date().toUTCString();
    const contentLength = Buffer.byteLength(body, "utf8");
    const stringToSign = ["POST", String(contentLength), "application/json", `x-ms-date:${date}`, "/api/logs"].join("\n");
    let signature = "";
    if (secret) {
      const decoded = Buffer.from(secret, "base64");
      signature = crypto.createHmac("sha256", decoded).update(stringToSign, "utf8").digest("base64");
    }
    return {
      url: cfg.endpoint || `https://${workspaceId}.ods.opinsights.azure.com/api/logs?api-version=2016-04-01`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Log-Type": logType,
        "x-ms-date": date,
        Authorization: signature ? `SharedKey ${workspaceId}:${signature}` : "",
      },
      body,
    };
  }

  if (cfg.destinationType === "splunk_hec") {
    const sourcetype = String(opts.sourcetype ?? "zenith:audit");
    const index = opts.index ? String(opts.index) : undefined;
    const lines = events
      .map((ev) => JSON.stringify({
        time: ev.timestamp ? Math.floor(new Date(ev.timestamp).getTime() / 1000) : undefined,
        host: "zenith",
        source: "zenith.audit",
        sourcetype,
        ...(index ? { index } : {}),
        event: ev,
      }))
      .join("\n");
    return {
      url: cfg.endpoint,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: secret ? `Splunk ${secret}` : "",
      },
      body: lines,
    };
  }

  if (cfg.destinationType === "datadog") {
    const ddsource = String(opts.ddsource ?? "zenith");
    const service = String(opts.service ?? "zenith-audit");
    const body = JSON.stringify(
      events.map((ev) => ({ ddsource, service, message: JSON.stringify(ev), ...ev })),
    );
    return {
      url: cfg.endpoint || "https://http-intake.logs.datadoghq.com/api/v2/logs",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": secret ?? "",
      },
      body,
    };
  }

  if (cfg.destinationType === "s3") {
    // S3 destination uses a customer-supplied presigned PUT URL. We must NOT
    // mutate the URL — appending query params invalidates the SigV4 signature.
    // Operators rotate the URL when it expires; one batch per PUT.
    const body = events.map((ev) => JSON.stringify(ev)).join("\n");
    return {
      url: cfg.endpoint,
      method: "PUT",
      headers: { "Content-Type": "application/x-ndjson" },
      body,
    };
  }

  // Generic webhook with HMAC-SHA256 signature.
  const body = JSON.stringify({ events, count: events.length });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) {
    const sig = crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
    headers["X-Zenith-Signature"] = `sha256=${sig}`;
  }
  return { url: cfg.endpoint, method: "POST", headers, body };
}

interface PostResult {
  ok: boolean;
  httpStatus?: number;
  error?: string;
  attempts: number;
}

async function postWithRetry(cfg: AuditStreamConfig, events: AuditLog[], secret: string | null): Promise<PostResult> {
  const payload = events.map(serialiseEvent);
  const built = buildRequest(cfg, payload, secret);

  // Re-validate endpoint at delivery time so a config that was valid at save
  // can't be used to reach a host that has since been re-pointed at a private IP.
  const valid = await validateStreamEndpoint(built.url);
  if (!valid.ok) {
    return { ok: false, error: `Endpoint rejected: ${valid.reason}`, attempts: 0 };
  }

  let lastError = "";
  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), REQUEST_TIMEOUT_MS);
      const res = await fetch(built.url, { method: built.method, headers: built.headers, body: built.body, signal: ac.signal });
      clearTimeout(timeout);
      lastStatus = res.status;
      if (res.ok) {
        return { ok: true, httpStatus: res.status, attempts: attempt };
      }
      const text = await res.text().catch(() => "");
      lastError = `HTTP ${res.status}: ${text.slice(0, 500)}`;
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        return { ok: false, httpStatus: res.status, error: lastError, attempts: attempt };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    if (attempt < MAX_RETRY_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS[attempt - 1] ?? 5_000));
    }
  }
  return { ok: false, httpStatus: lastStatus, error: lastError, attempts: MAX_RETRY_ATTEMPTS };
}

interface RecordDeliveryInput {
  configId: string;
  organizationId: string;
  status: "DELIVERED" | "FAILED" | "DLQ";
  attempts: number;
  events: AuditLog[];
  httpStatus?: number;
  errorMessage?: string;
}

async function recordDelivery(input: RecordDeliveryInput): Promise<AuditStreamDelivery> {
  const events = input.events;
  // Persist every event id so the DLQ replay path can re-fetch the exact rows.
  const eventIds = events.map((e) => e.id);
  const insert: InsertAuditStreamDelivery = {
    configId: input.configId,
    organizationId: input.organizationId,
    status: input.status,
    attempts: input.attempts,
    batchSize: events.length,
    firstAuditId: events[0]?.id ?? null,
    lastAuditId: events[events.length - 1]?.id ?? null,
    lastAuditCreatedAt: events[events.length - 1]?.createdAt ?? null,
    httpStatus: input.httpStatus ?? null,
    errorMessage: input.errorMessage ?? null,
    eventIds,
  };
  const [row] = await db.insert(auditStreamDeliveries).values(insert).returning();
  return row;
}

async function pruneDeliveryHistory(configId: string): Promise<void> {
  // Cap successful deliveries; never prune FAILED or DLQ rows so replay stays
  // available for the operator.
  await db.execute(sql`
    DELETE FROM audit_stream_deliveries
    WHERE config_id = ${configId}
      AND status = 'DELIVERED'
      AND id IN (
        SELECT id FROM audit_stream_deliveries
        WHERE config_id = ${configId} AND status = 'DELIVERED'
        ORDER BY created_at DESC
        OFFSET ${DELIVERY_HISTORY_LIMIT}
      )
  `);
}

async function fetchPendingEvents(cfg: AuditStreamConfig, limit: number): Promise<AuditLog[]> {
  const cursorTs = cfg.cursorTimestamp;
  const cursorId = cfg.cursorId;
  const conditions: SQL[] = [eq(auditLog.organizationId, cfg.organizationId)];
  if (cursorTs) {
    if (cursorId) {
      const tuple = or(
        gt(auditLog.createdAt, cursorTs),
        and(eq(auditLog.createdAt, cursorTs), gt(auditLog.id, cursorId)),
      );
      if (tuple) conditions.push(tuple);
    } else {
      conditions.push(gt(auditLog.createdAt, cursorTs));
    }
  }
  return db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(asc(auditLog.createdAt), asc(auditLog.id))
    .limit(limit);
}

interface ConfigUpdate {
  cursorTimestamp?: Date;
  cursorId?: string;
  lastDeliveryAt?: Date;
  lastDeliveryStatus?: string | null;
  lastError?: string | null;
  lastErrorAt?: Date | null;
  consecutiveFailures?: number;
  totalDelivered?: number;
  totalFailed?: number;
  updatedAt: Date;
}

async function processConfig(cfg: AuditStreamConfig): Promise<void> {
  if (!cfg.enabled) return;
  if (!cfg.cursorTimestamp) return; // Cursor must be initialised at config creation.

  const limit = Math.max(1, Math.min(cfg.batchSize || MAX_BATCH_DEFAULT, 1000));
  const events = await fetchPendingEvents(cfg, limit);
  if (events.length === 0) return;

  const secret = decryptStreamSecret(cfg.secretEncrypted);
  const result = await postWithRetry(cfg, events, secret);
  const last = events[events.length - 1];
  const now = new Date();

  if (result.ok) {
    const update: ConfigUpdate = {
      cursorTimestamp: last.createdAt ?? now,
      cursorId: last.id,
      lastDeliveryAt: now,
      lastDeliveryStatus: "SUCCESS",
      lastError: null,
      consecutiveFailures: 0,
      totalDelivered: (cfg.totalDelivered ?? 0) + events.length,
      updatedAt: now,
    };
    await db.update(auditStreamConfigs).set(update).where(eq(auditStreamConfigs.id, cfg.id));
    await recordDelivery({
      configId: cfg.id,
      organizationId: cfg.organizationId,
      status: "DELIVERED",
      attempts: result.attempts,
      events,
      httpStatus: result.httpStatus,
    });
  } else {
    const consecutive = (cfg.consecutiveFailures ?? 0) + 1;
    // After repeated failures, mark batch DLQ so the operator can replay it,
    // then advance the cursor so a poisoned batch can't block the stream.
    const dlq = consecutive >= MAX_RETRY_ATTEMPTS;
    const update: ConfigUpdate = {
      lastDeliveryAt: now,
      lastDeliveryStatus: "FAILURE",
      lastError: result.error?.slice(0, 1000) ?? "Unknown error",
      lastErrorAt: now,
      consecutiveFailures: consecutive,
      totalFailed: (cfg.totalFailed ?? 0) + events.length,
      updatedAt: now,
    };
    if (dlq) {
      update.cursorTimestamp = last.createdAt ?? now;
      update.cursorId = last.id;
      update.consecutiveFailures = 0;
    }
    await db.update(auditStreamConfigs).set(update).where(eq(auditStreamConfigs.id, cfg.id));
    await recordDelivery({
      configId: cfg.id,
      organizationId: cfg.organizationId,
      status: dlq ? "DLQ" : "FAILED",
      attempts: result.attempts,
      events,
      httpStatus: result.httpStatus,
      errorMessage: result.error,
    });
  }

  await pruneDeliveryHistory(cfg.id);
}

async function tickAll(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const configs = await db.select().from(auditStreamConfigs).where(eq(auditStreamConfigs.enabled, true));
    for (const cfg of configs) {
      try {
        await processConfig(cfg);
      } catch (err) {
        console.error(`[audit-streamer] config ${cfg.id} failed:`, err);
      }
    }
  } finally {
    running = false;
  }
}

export function startAuditStreamer(): void {
  if (streamTimer) return;
  setTimeout(() => { void tickAll(); }, 30_000);
  streamTimer = setInterval(() => { void tickAll(); }, POLL_INTERVAL_MS);
  streamTimer.unref?.();
}

export async function sendTestDelivery(cfg: AuditStreamConfig): Promise<{ ok: boolean; httpStatus?: number; error?: string }> {
  const testEvent: AuditLog = {
    id: `test-${Date.now()}`,
    userId: null,
    userEmail: "audit-streaming-test@zenith",
    action: "AUDIT_STREAM_TEST",
    resource: "audit_streaming",
    resourceId: cfg.id,
    organizationId: cfg.organizationId,
    tenantConnectionId: null,
    details: { message: "Zenith audit streaming test event", destination: cfg.destinationType },
    result: "SUCCESS",
    ipAddress: null,
    createdAt: new Date(),
  };
  const secret = decryptStreamSecret(cfg.secretEncrypted);
  const result = await postWithRetry(cfg, [testEvent], secret);
  return { ok: result.ok, httpStatus: result.httpStatus, error: result.error };
}

// Replay a previously failed/DLQ delivery by re-fetching its event ids and
// POSTing them again. Returns the updated delivery row.
export async function replayDelivery(deliveryId: string): Promise<{ ok: boolean; httpStatus?: number; error?: string; deliveredCount: number }> {
  const [delivery] = await db.select().from(auditStreamDeliveries).where(eq(auditStreamDeliveries.id, deliveryId)).limit(1);
  if (!delivery) throw new Error("Delivery not found");
  if (delivery.status === "DELIVERED") {
    return { ok: true, deliveredCount: 0 };
  }
  const [cfg] = await db.select().from(auditStreamConfigs).where(eq(auditStreamConfigs.id, delivery.configId)).limit(1);
  if (!cfg) throw new Error("Streaming configuration no longer exists");

  const ids = delivery.eventIds ?? [];
  if (ids.length === 0) {
    return { ok: false, error: "No event ids preserved for replay", deliveredCount: 0 };
  }

  const events: AuditLog[] = [];
  for (const id of ids) {
    const [row] = await db.select().from(auditLog).where(eq(auditLog.id, id)).limit(1);
    if (row) events.push(row);
  }
  if (events.length === 0) {
    return { ok: false, error: "Original audit events were purged by retention", deliveredCount: 0 };
  }

  const secret = decryptStreamSecret(cfg.secretEncrypted);
  const result = await postWithRetry(cfg, events, secret);
  const now = new Date();

  if (result.ok) {
    await db.update(auditStreamDeliveries)
      .set({ status: "DELIVERED", attempts: delivery.attempts + result.attempts, httpStatus: result.httpStatus ?? null, errorMessage: null })
      .where(eq(auditStreamDeliveries.id, deliveryId));
    await db.update(auditStreamConfigs)
      .set({
        lastDeliveryAt: now,
        lastDeliveryStatus: "SUCCESS",
        lastError: null,
        totalDelivered: (cfg.totalDelivered ?? 0) + events.length,
        updatedAt: now,
      })
      .where(eq(auditStreamConfigs.id, cfg.id));
  } else {
    await db.update(auditStreamDeliveries)
      .set({
        attempts: delivery.attempts + result.attempts,
        httpStatus: result.httpStatus ?? null,
        errorMessage: (result.error ?? "Unknown error").slice(0, 1000),
      })
      .where(eq(auditStreamDeliveries.id, deliveryId));
  }
  return { ok: result.ok, httpStatus: result.httpStatus, error: result.error, deliveredCount: result.ok ? events.length : 0 };
}

export { desc };
