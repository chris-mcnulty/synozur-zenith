import assert from "node:assert/strict";
import { afterEach, after, describe, it } from "node:test";

const originalDatabaseUrl = process.env.DATABASE_URL;
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/synozur_test";

import type { PingFn } from "./tenant-health-monitor";

const { storage } = await import("../storage");
const { runHealthCheckForTenant } = await import("./tenant-health-monitor");
const { AUDIT_ACTIONS } = await import("./audit-logger");

type RecordHealthFn = typeof storage.recordTenantHealthCheck;
type UpdateConnFn = typeof storage.updateTenantConnection;
type CreateAuditEntryFn = typeof storage.createAuditEntry;

const originalRecord: RecordHealthFn = storage.recordTenantHealthCheck.bind(storage);
const originalUpdate: UpdateConnFn = storage.updateTenantConnection.bind(storage);
const originalCreateAuditEntry: CreateAuditEntryFn = storage.createAuditEntry.bind(storage);

interface Captured {
  records: Array<Record<string, any>>;
  updates: Array<Record<string, any>>;
  audits: Array<{ action: string; result?: string; details?: any }>;
}

function setupCaptures(): Captured {
  const cap: Captured = { records: [], updates: [], audits: [] };
  storage.recordTenantHealthCheck = (async (input: any) => {
    cap.records.push(input);
    return { id: "rec-" + cap.records.length, ...input } as any;
  }) as any;
  storage.updateTenantConnection = (async (_id: string, patch: any) => {
    cap.updates.push(patch);
    return {} as any;
  }) as any;
  storage.createAuditEntry = (async (input: any) => {
    cap.audits.push({ action: String(input.action), result: input.result, details: input.details });
    return { id: "audit-" + cap.audits.length, ...input } as any;
  }) as any;
  return cap;
}

afterEach(() => {
  storage.recordTenantHealthCheck = originalRecord;
  storage.updateTenantConnection = originalUpdate;
  storage.createAuditEntry = originalCreateAuditEntry;
});

after(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

function makeConn(overrides: Partial<any> = {}) {
  return {
    id: "tenant-conn-1",
    tenantId: "abc-tenant",
    tenantName: "Acme Corp",
    domain: "acme.com",
    clientId: "client-id",
    clientSecret: "client-secret",
    organizationId: "org-1",
    status: "ACTIVE",
    healthStatus: "healthy",
    healthConsecutiveFailures: 0,
    ...overrides,
  } as any;
}

const okPing: PingFn = async () => ({ ok: true, latencyMs: 42 });
const failPing = (code = "HTTP_500", message = "boom"): PingFn => async () => ({ ok: false, latencyMs: 99, code, message });

describe("tenant-health-monitor / runHealthCheckForTenant", () => {
  it("records 'failed' on the first failure without transitioning to degraded", async () => {
    const cap = setupCaptures();
    const outcome = await runHealthCheckForTenant(makeConn(), { pingFn: failPing() });
    assert.ok(outcome);
    assert.equal(outcome!.status, "failed");
    assert.equal(outcome!.transitionedToDegraded, false);
    assert.equal(cap.records[0].status, "failed");
    assert.equal(cap.updates[0].healthStatus, "failed");
    assert.equal(cap.updates[0].healthConsecutiveFailures, 1);
    assert.equal(cap.audits.length, 0);
  });

  it("transitions to 'degraded' after two consecutive failures and emits audit", async () => {
    const cap = setupCaptures();
    const conn = makeConn({ healthConsecutiveFailures: 1, healthStatus: "failed" });
    const outcome = await runHealthCheckForTenant(conn, { pingFn: failPing("TIMEOUT", "took too long") });
    assert.equal(outcome!.status, "degraded");
    assert.equal(outcome!.transitionedToDegraded, true);
    assert.equal(cap.updates[0].healthConsecutiveFailures, 2);
    assert.equal(cap.audits.length, 1);
    assert.equal(cap.audits[0].action, AUDIT_ACTIONS.TENANT_HEALTH_DEGRADED);
    assert.equal(cap.audits[0].result, "FAILURE");
    assert.equal(cap.audits[0].details?.errorCode, "TIMEOUT");
    assert.equal(cap.audits[0].details?.consecutiveFailures, 2);
  });

  it("does not re-emit degraded audit on a third consecutive failure", async () => {
    const cap = setupCaptures();
    const conn = makeConn({ healthConsecutiveFailures: 2, healthStatus: "degraded" });
    const outcome = await runHealthCheckForTenant(conn, { pingFn: failPing() });
    assert.equal(outcome!.status, "degraded");
    assert.equal(outcome!.transitionedToDegraded, false);
    assert.equal(cap.audits.length, 0);
  });

  it("emits recovery audit when transitioning from degraded back to healthy", async () => {
    const cap = setupCaptures();
    const conn = makeConn({ healthConsecutiveFailures: 3, healthStatus: "degraded" });
    const outcome = await runHealthCheckForTenant(conn, { pingFn: okPing });
    assert.equal(outcome!.status, "healthy");
    assert.equal(outcome!.transitionedToHealthy, true);
    assert.equal(cap.updates[0].healthConsecutiveFailures, 0);
    assert.equal(cap.audits.length, 1);
    assert.equal(cap.audits[0].action, AUDIT_ACTIONS.TENANT_HEALTH_RECOVERED);
    assert.equal(cap.audits[0].result, "SUCCESS");
  });

  it("does not emit on continued healthy state", async () => {
    const cap = setupCaptures();
    const outcome = await runHealthCheckForTenant(makeConn(), { pingFn: okPing });
    assert.equal(outcome!.status, "healthy");
    assert.equal(outcome!.transitionedToHealthy, false);
    assert.equal(cap.audits.length, 0);
  });

  it("skips tenants whose status is suspended or revoked", async () => {
    const cap = setupCaptures();
    for (const status of ["SUSPENDED", "REVOKED", "PENDING", "REJECTED", "FAILED"]) {
      const outcome = await runHealthCheckForTenant(makeConn({ status }), { pingFn: failPing() });
      assert.equal(outcome, null, `status=${status} should be skipped`);
    }
    assert.equal(cap.records.length, 0);
    assert.equal(cap.updates.length, 0);
  });

  it("skips tenants without credentials", async () => {
    const cap = setupCaptures();
    const outcome = await runHealthCheckForTenant(makeConn({ clientSecret: null }), { pingFn: okPing });
    assert.equal(outcome, null);
    assert.equal(cap.records.length, 0);
  });
});
