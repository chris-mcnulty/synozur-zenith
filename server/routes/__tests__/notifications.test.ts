/**
 * API integration tests for BL-013 Notifications routes.
 *
 * Covers:
 *  - POST /api/notifications/preview  → returns category counts
 *  - GET  /api/notifications/unsubscribe?token=…  → flips cadence to off
 *  - PATCH /api/notifications/rules   → 403 on Trial plan, 200 on Standard+
 *  - PATCH /api/notifications/preferences  → realTimeAlerts=true is 403 on Standard, 200 on Professional+
 *
 * Run with:
 *   npm run test:notifications
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express, { type Response, type NextFunction } from "express";

// Point at the dev database (already running in the Replit environment).
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/synozur_dev";

const { storage } = await import("../../storage");
const notificationsRouter = (await import("../notifications")).default;
const { db } = await import("../../db");

import {
  organizations,
  users,
  notifications as notificationsTable,
  notificationPreferences,
  notificationRules,
  type ZenithRole,
  type User,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import type { AuthenticatedRequest } from "../../middleware/rbac";

// ── Test data identifiers ──────────────────────────────────────────────────
const SUFFIX = `_notif_test_${Date.now()}`;
const TEST_DOMAIN_TRIAL = `trial${SUFFIX}.test`;
const TEST_DOMAIN_STANDARD = `std${SUFFIX}.test`;
const TEST_DOMAIN_PROFESSIONAL = `pro${SUFFIX}.test`;
const TEST_EMAIL_TRIAL = `trial${SUFFIX}@${TEST_DOMAIN_TRIAL}`;
const TEST_EMAIL_STANDARD = `std${SUFFIX}@${TEST_DOMAIN_STANDARD}`;
const TEST_EMAIL_PROFESSIONAL = `pro${SUFFIX}@${TEST_DOMAIN_PROFESSIONAL}`;

let trialOrgId = "";
let standardOrgId = "";
let professionalOrgId = "";
let trialUserId = "";
let standardUserId = "";
let professionalUserId = "";
let server: http.Server;
let baseUrl = "";

// ── Minimal Express test harness ──────────────────────────────────────────

/**
 * Build a test Express app that bypasses the session-based auth by injecting
 * a synthetic req.user from a header set by the test.  This lets each request
 * assert a specific identity without the overhead of a full session.
 *
 * The middleware uses AuthenticatedRequest (from server/middleware/rbac) so the
 * request shape is consistent with the rest of the codebase.
 */
function buildTestApp(
  userMap: Map<string, { id: string; email: string; role: ZenithRole; organizationId: string | null }>,
) {
  const app = express();
  app.use(express.json());

  // Inject req.user + req.activeOrganizationId from X-Test-User-Id header.
  app.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const userId = req.headers["x-test-user-id"] as string | undefined;
    if (userId) {
      const synthetic = userMap.get(userId);
      if (synthetic) {
        req.user = {
          id: synthetic.id,
          email: synthetic.email,
          password: "",
          name: null,
          role: synthetic.role,
          organizationId: synthetic.organizationId,
          emailVerified: true,
          verificationToken: null,
          resetToken: null,
          resetTokenExpiry: null,
          authProvider: "local",
          azureObjectId: null,
          azureTenantId: null,
          lastLoginAt: null,
          createdAt: new Date(),
        } satisfies User;
        req.effectiveRole = synthetic.role;
        req.activeOrganizationId = synthetic.organizationId ?? undefined;
      }
    }
    next();
  });

  app.use(notificationsRouter);
  return app;
}

// ── Helper: make an HTTP request to the test server ──────────────────────

async function req(
  method: string,
  path: string,
  opts: { userId?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const url = `${baseUrl}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.userId) headers["x-test-user-id"] = opts.userId;

  const res = await fetch(url, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let body: unknown;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { status: res.status, body };
}

// ── Lifecycle ─────────────────────────────────────────────────────────────

before(async () => {
  // Create test organizations with varying service plans.
  const trialOrg = await storage.createOrganization({
    name: `Trial Org ${SUFFIX}`,
    domain: TEST_DOMAIN_TRIAL,
    servicePlan: "TRIAL",
  });
  trialOrgId = trialOrg.id;

  const standardOrg = await storage.createOrganization({
    name: `Standard Org ${SUFFIX}`,
    domain: TEST_DOMAIN_STANDARD,
    servicePlan: "STANDARD",
  });
  standardOrgId = standardOrg.id;

  const professionalOrg = await storage.createOrganization({
    name: `Professional Org ${SUFFIX}`,
    domain: TEST_DOMAIN_PROFESSIONAL,
    servicePlan: "PROFESSIONAL",
  });
  professionalOrgId = professionalOrg.id;

  // Create one platform_owner user per org (platform_owner always passes requireRole checks).
  const trialUser = await storage.createUser({
    email: TEST_EMAIL_TRIAL,
    password: "x",
    role: "platform_owner",
    organizationId: trialOrgId,
    emailVerified: true,
  });
  trialUserId = trialUser.id;

  const standardUser = await storage.createUser({
    email: TEST_EMAIL_STANDARD,
    password: "x",
    role: "platform_owner",
    organizationId: standardOrgId,
    emailVerified: true,
  });
  standardUserId = standardUser.id;

  const professionalUser = await storage.createUser({
    email: TEST_EMAIL_PROFESSIONAL,
    password: "x",
    role: "platform_owner",
    organizationId: professionalOrgId,
    emailVerified: true,
  });
  professionalUserId = professionalUser.id;

  // Build the test Express app and start the HTTP server.
  const userMap = new Map<string, { id: string; email: string; role: ZenithRole; organizationId: string | null }>([
    [trialUserId, { id: trialUserId, email: TEST_EMAIL_TRIAL, role: "platform_owner", organizationId: trialOrgId }],
    [standardUserId, { id: standardUserId, email: TEST_EMAIL_STANDARD, role: "platform_owner", organizationId: standardOrgId }],
    [professionalUserId, { id: professionalUserId, email: TEST_EMAIL_PROFESSIONAL, role: "platform_owner", organizationId: professionalOrgId }],
  ]);

  const app = buildTestApp(userMap);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  // Shut down the test server.
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));

  // Remove test data: notification records, preferences, rules, users, orgs.
  const testUserIds = [trialUserId, standardUserId, professionalUserId].filter(Boolean);
  const testOrgIds = [trialOrgId, standardOrgId, professionalOrgId].filter(Boolean);

  if (testUserIds.length) {
    await db.delete(notificationsTable).where(inArray(notificationsTable.userId, testUserIds));
    await db.delete(notificationPreferences).where(inArray(notificationPreferences.userId, testUserIds));
    await db.delete(users).where(inArray(users.id, testUserIds));
  }
  if (testOrgIds.length) {
    await db.delete(notificationRules).where(inArray(notificationRules.organizationId, testOrgIds));
    await db.delete(organizations).where(inArray(organizations.id, testOrgIds));
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────

describe("POST /api/notifications/preview", () => {
  it("returns 401 when unauthenticated", async () => {
    const { status } = await req("POST", "/api/notifications/preview");
    assert.equal(status, 401);
  });

  it("returns category counts for an authenticated user", async () => {
    const { status, body } = await req("POST", "/api/notifications/preview", {
      userId: trialUserId,
    });
    const b = body as Record<string, unknown>;
    assert.equal(status, 200, `Unexpected status: ${JSON.stringify(b)}`);
    assert.ok("total" in b, "response should include 'total'");
    assert.ok("byCategory" in b, "response should include 'byCategory'");
    assert.ok("bySeverity" in b, "response should include 'bySeverity'");
    assert.ok("cadence" in b, "response should include 'cadence'");
    assert.ok(typeof b.total === "number", "'total' should be a number");
    assert.ok(typeof b.byCategory === "object", "'byCategory' should be an object");
  });

  it("includes notifications array (up to 25 items)", async () => {
    const { status, body } = await req("POST", "/api/notifications/preview", {
      userId: standardUserId,
    });
    const b = body as Record<string, unknown>;
    assert.equal(status, 200);
    assert.ok(Array.isArray(b.notifications), "'notifications' should be an array");
    assert.ok((b.notifications as unknown[]).length <= 25, "notifications should be capped at 25");
  });
});

describe("GET /api/notifications/unsubscribe", () => {
  it("returns 400 when token is missing", async () => {
    const { status } = await req("GET", "/api/notifications/unsubscribe");
    assert.equal(status, 400);
  });

  it("returns 404 for an unknown token", async () => {
    const { status } = await req("GET", "/api/notifications/unsubscribe?token=totally-bogus-token-xyz");
    assert.equal(status, 404);
  });

  it("flips digestCadence to off and emailEnabled to false for a valid token", async () => {
    // Ensure the user has preferences (creates a row with an unsubscribe token).
    const prefs = await storage.upsertNotificationPreferences(professionalUserId, {
      digestCadence: "weekly",
      emailEnabled: true,
    });
    const token = prefs.unsubscribeToken;
    assert.ok(token, "unsubscribeToken should be set on preferences");

    const { status, body } = await req("GET", `/api/notifications/unsubscribe?token=${token}`);
    assert.equal(status, 200, `Unexpected body: ${typeof body === "string" ? (body as string).slice(0, 200) : JSON.stringify(body)}`);
    // The endpoint returns an HTML page — check it mentions "unsubscribed".
    assert.ok(typeof body === "string" && (body as string).includes("unsubscribed"), "should return the unsubscribed HTML page");

    // Confirm the DB change.
    const updated = await storage.upsertNotificationPreferences(professionalUserId, {});
    assert.equal(updated.digestCadence, "off", "digestCadence should be set to off");
    assert.equal(updated.emailEnabled, false, "emailEnabled should be false after unsubscribe");
  });
});

describe("PATCH /api/notifications/rules — plan gate", () => {
  it("returns 401 when unauthenticated", async () => {
    const { status } = await req("PATCH", "/api/notifications/rules", {
      body: { severityFloor: "warning" },
    });
    assert.equal(status, 401);
  });

  it("returns 403 (FEATURE_GATED) for a Trial-plan organisation", async () => {
    const { status, body } = await req("PATCH", "/api/notifications/rules", {
      userId: trialUserId,
      body: { severityFloor: "warning" },
    });
    const b = body as Record<string, unknown>;
    assert.equal(status, 403, `Expected 403 but got ${status}: ${JSON.stringify(b)}`);
    assert.equal(b.error, "FEATURE_GATED");
    assert.equal(b.currentPlan, "TRIAL");
  });

  it("returns 200 for a Standard-plan organisation", async () => {
    const { status, body } = await req("PATCH", "/api/notifications/rules", {
      userId: standardUserId,
      body: { severityFloor: "warning" },
    });
    const b = body as Record<string, unknown>;
    assert.equal(status, 200, `Expected 200 but got ${status}: ${JSON.stringify(b)}`);
    assert.ok("rules" in b, "response should contain 'rules'");
    assert.equal((b.rules as Record<string, unknown>).severityFloor, "warning");
  });

  it("returns 200 for a Professional-plan organisation", async () => {
    const { status, body } = await req("PATCH", "/api/notifications/rules", {
      userId: professionalUserId,
      body: { severityFloor: "critical" },
    });
    const b = body as Record<string, unknown>;
    assert.equal(status, 200, `Expected 200 but got ${status}: ${JSON.stringify(b)}`);
    assert.equal((b.rules as Record<string, unknown>).severityFloor, "critical");
  });
});

describe("PATCH /api/notifications/preferences — realTimeAlerts plan gate", () => {
  it("returns 401 when unauthenticated", async () => {
    const { status } = await req("PATCH", "/api/notifications/preferences", {
      body: { realTimeAlerts: true },
    });
    assert.equal(status, 401);
  });

  it("returns 403 (FEATURE_GATED) when enabling realTimeAlerts on a Standard-plan org", async () => {
    const { status, body } = await req("PATCH", "/api/notifications/preferences", {
      userId: standardUserId,
      body: { realTimeAlerts: true },
    });
    const b = body as Record<string, unknown>;
    assert.equal(status, 403, `Expected 403 but got ${status}: ${JSON.stringify(b)}`);
    assert.equal(b.error, "FEATURE_GATED");
    assert.equal(b.currentPlan, "STANDARD");
  });

  it("returns 403 (FEATURE_GATED) when enabling realTimeAlerts on a Trial-plan org", async () => {
    const { status, body } = await req("PATCH", "/api/notifications/preferences", {
      userId: trialUserId,
      body: { realTimeAlerts: true },
    });
    const b = body as Record<string, unknown>;
    assert.equal(status, 403, `Expected 403 but got ${status}: ${JSON.stringify(b)}`);
    assert.equal(b.error, "FEATURE_GATED");
    assert.equal(b.currentPlan, "TRIAL");
  });

  it("returns 200 when enabling realTimeAlerts on a Professional-plan org", async () => {
    const { status, body } = await req("PATCH", "/api/notifications/preferences", {
      userId: professionalUserId,
      body: { realTimeAlerts: true },
    });
    const b = body as Record<string, unknown>;
    assert.equal(status, 200, `Expected 200 but got ${status}: ${JSON.stringify(b)}`);
    assert.ok("preferences" in b, "response should contain 'preferences'");
    assert.equal((b.preferences as Record<string, unknown>).realTimeAlerts, true);
  });

  it("allows non-gated preferences on any plan", async () => {
    const { status, body } = await req("PATCH", "/api/notifications/preferences", {
      userId: trialUserId,
      body: { digestCadence: "daily", emailEnabled: false },
    });
    const b = body as Record<string, unknown>;
    assert.equal(status, 200, `Expected 200 but got ${status}: ${JSON.stringify(b)}`);
    assert.equal((b.preferences as Record<string, unknown>).digestCadence, "daily");
    assert.equal((b.preferences as Record<string, unknown>).emailEnabled, false);
  });
});
