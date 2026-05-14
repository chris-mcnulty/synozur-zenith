/**
 * BL-046 — Tenant Connection Health Monitor.
 *
 * Pings a cheap Graph endpoint (`/organization`) per active tenant connection,
 * records latency + outcome in `tenant_health_checks`, and transitions the
 * denormalized `tenant_connections.health_status` to `degraded` after two
 * consecutive failures. Recovery on the next success.
 *
 * Notes:
 *  - Non-blocking by design: `degraded` is informational. Suspension still
 *    lives in BL-004's tenant status (`Suspended` / `Revoked`).
 *  - Audit + notifications fire only on state transitions, not on every
 *    successful check.
 */

import { storage } from "../storage";
import { getAppToken } from "./graph";
import { logAuditEvent, AUDIT_ACTIONS } from "./audit-logger";
import type { TenantConnection, TenantHealthStatus } from "@shared/schema";

const HEALTH_ENDPOINT = "https://graph.microsoft.com/v1.0/organization";
const DEGRADE_AFTER_FAILURES = 2;
const REQUEST_TIMEOUT_MS = 10_000;

export interface HealthCheckOutcome {
  tenantConnectionId: string;
  status: TenantHealthStatus;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  transitionedToDegraded: boolean;
  transitionedToHealthy: boolean;
}

async function pingGraph(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<{ ok: true; latencyMs: number } | { ok: false; latencyMs: number; code: string; message: string }> {
  const started = Date.now();
  try {
    const token = await getAppToken(tenantId, clientId, clientSecret);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(HEALTH_ENDPOINT, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return {
          ok: false,
          latencyMs,
          code: `HTTP_${res.status}`,
          message: text.slice(0, 500) || `Graph returned ${res.status}`,
        };
      }
      return { ok: true, latencyMs };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: any) {
    const latencyMs = Date.now() - started;
    const code = err?.name === "AbortError" ? "TIMEOUT" : err?.code || "UNKNOWN";
    return { ok: false, latencyMs, code, message: err?.message || String(err) };
  }
}

export async function runHealthCheckForTenant(
  conn: TenantConnection,
): Promise<HealthCheckOutcome | null> {
  if (!conn.clientId || !conn.clientSecret) return null;
  // Only ping tenants that are otherwise active. Suspended/Revoked tenants
  // already surface their own status; pinging them would generate noise.
  if (conn.status && conn.status !== "ACTIVE" && conn.status !== "PROVISIONED" && conn.status !== "APPROVED") {
    return null;
  }

  const result = await pingGraph(conn.tenantId, conn.clientId, conn.clientSecret);
  const previousStatus = (conn.healthStatus as TenantHealthStatus | null) ?? "healthy";
  const previousFailures = conn.healthConsecutiveFailures ?? 0;

  let newStatus: TenantHealthStatus;
  let newFailures: number;
  let errorCode: string | undefined;
  let errorMessage: string | undefined;

  if (result.ok) {
    newStatus = "healthy";
    newFailures = 0;
  } else {
    newFailures = previousFailures + 1;
    newStatus = newFailures >= DEGRADE_AFTER_FAILURES ? "degraded" : "failed";
    errorCode = result.code;
    errorMessage = result.message;
  }

  await storage.recordTenantHealthCheck({
    tenantConnectionId: conn.id,
    organizationId: conn.organizationId ?? null,
    checkedAt: new Date(),
    latencyMs: result.latencyMs,
    status: newStatus,
    errorCode: errorCode ?? null,
    errorMessage: errorMessage ?? null,
  });

  await storage.updateTenantConnection(conn.id, {
    healthStatus: newStatus,
    healthLastCheckedAt: new Date(),
    healthConsecutiveFailures: newFailures,
  });

  const transitionedToDegraded = previousStatus !== "degraded" && newStatus === "degraded";
  const transitionedToHealthy = previousStatus === "degraded" && newStatus === "healthy";

  if (transitionedToDegraded) {
    await logAuditEvent(null, {
      action: AUDIT_ACTIONS.TENANT_HEALTH_DEGRADED,
      resource: "tenant_connection",
      resourceId: conn.id,
      organizationId: conn.organizationId ?? null,
      tenantConnectionId: conn.id,
      details: {
        tenantName: conn.tenantName,
        tenantId: conn.tenantId,
        consecutiveFailures: newFailures,
        errorCode,
        error: errorMessage,
      },
      result: "FAILURE",
    });
  } else if (transitionedToHealthy) {
    await logAuditEvent(null, {
      action: AUDIT_ACTIONS.TENANT_HEALTH_RECOVERED,
      resource: "tenant_connection",
      resourceId: conn.id,
      organizationId: conn.organizationId ?? null,
      tenantConnectionId: conn.id,
      details: { tenantName: conn.tenantName, tenantId: conn.tenantId },
      result: "SUCCESS",
    });
  }

  return {
    tenantConnectionId: conn.id,
    status: newStatus,
    latencyMs: result.latencyMs,
    errorCode,
    errorMessage,
    transitionedToDegraded,
    transitionedToHealthy,
  };
}

export async function runHealthCheckCycle(): Promise<{ checked: number; degraded: number; recovered: number }> {
  const stats = { checked: 0, degraded: 0, recovered: 0 };
  try {
    const connections = await storage.getTenantConnections();
    for (const conn of connections) {
      try {
        const outcome = await runHealthCheckForTenant(conn);
        if (!outcome) continue;
        stats.checked += 1;
        if (outcome.transitionedToDegraded) stats.degraded += 1;
        if (outcome.transitionedToHealthy) stats.recovered += 1;
      } catch (err) {
        console.error(`[tenant-health] unexpected error for tenant=${conn.id}:`, err);
      }
    }
  } catch (err) {
    console.error("[tenant-health] cycle failed:", err);
  }
  return stats;
}
