/**
 * Integration tests for BL-004 / Spec §4.2 — Tenant Status Lifecycle enforcement.
 *
 * Two layers of coverage:
 *
 *  Part 1 — Middleware unit tests
 *    Exercise the requireActiveTenant middleware function directly with mock req/res.
 *
 *  Part 2 — Real-router integration tests (supertest against the actual SharePoint router)
 *    Import the real `sharepoint.ts` router and mount it in a test Express app with
 *    pre-authenticated user middleware and mocked storage.  Proves:
 *      • In-scope SUSPENDED tenant mutation → 409 TENANT_NOT_ACTIVE
 *      • Out-of-scope SUSPENDED tenant mutation → 404 (no existence leak)
 *      • GET read on SUSPENDED tenant → 200 (no false positive)
 *      • In-scope ACTIVE tenant mutation → 200 (proceeds normally)
 */

import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

const { storage } = await import("../../storage");

// ──────────────────────────────────────────────────────────────────────────────
// Shared test fixtures
// ──────────────────────────────────────────────────────────────────────────────

const WORKSPACE_ID = "ws-bl004-test-001";
const TENANT_ID = "tenant-bl004-test-001";
const ORG_ID = "org-bl004-test-001";
const OUT_OF_SCOPE_TENANT_ID = "tenant-bl004-other-001";

const mockWorkspace = {
  id: WORKSPACE_ID,
  tenantConnectionId: TENANT_ID,
  displayName: "BL-004 Test Site",
  m365ObjectId: "graph-site-bl004",
  siteUrl: "https://contoso.sharepoint.com/sites/bl004",
  type: "TEAM_SITE",
  sensitivity: "INTERNAL",
  externalSharing: false,
  copilotReady: false,
  isArchived: false,
  isDeleted: false,
  localHash: null,
  spoSyncHash: null,
};

function makeMockTenantConnection(status: string) {
  return {
    id: TENANT_ID,
    tenantId: "azure-tenant-bl004",
    status,
    statusReason: status !== "ACTIVE" ? `Tenant is ${status}` : null,
    tenantName: "Contoso",
    domain: "contoso.sharepoint.com",
    organizationId: ORG_ID,
    clientId: null,
    clientSecret: null,
    encryptedClientSecret: null,
  };
}

const mockOrg = {
  id: ORG_ID,
  name: "Test Org",
  servicePlan: "ENTERPRISE",
};

// ──────────────────────────────────────────────────────────────────────────────
// Save & restore storage originals
// ──────────────────────────────────────────────────────────────────────────────

const savedMethods: Record<string, any> = {};

before(() => {
  const toSave = [
    "getWorkspace",
    "getTenantConnection",
    "getTenantConnectionsByOrganization",
    "getActiveMspGrantsForGrantee",
    "getGrantedTenantConnectionIds",
    "getOrganization",
    "createAuditEntry",
    "updateWorkspace",
    "createWorkspace",
  ];
  for (const m of toSave) savedMethods[m] = (storage as any)[m].bind(storage);

  // Stable defaults — override per-test as needed
  (storage as any).getWorkspace = async (id: string) =>
    id === WORKSPACE_ID ? mockWorkspace : null;
  (storage as any).createAuditEntry = async () => {};
  (storage as any).getOrganization = async () => mockOrg;
  (storage as any).getActiveMspGrantsForGrantee = async () => [];
  (storage as any).getGrantedTenantConnectionIds = async () => [];
  (storage as any).updateWorkspace = async (id: string, data: any) => ({
    ...mockWorkspace,
    ...data,
  });
  (storage as any).createWorkspace = async (data: any) => ({
    id: "ws-new-001",
    ...data,
  });
});

after(() => {
  for (const [m, fn] of Object.entries(savedMethods)) {
    (storage as any)[m] = fn;
  }
});

afterEach(() => {
  // Reset per-test overrides back to defaults after each test
  (storage as any).getTenantConnection = savedMethods.getTenantConnection;
  (storage as any).getTenantConnectionsByOrganization =
    savedMethods.getTenantConnectionsByOrganization;
});

// ──────────────────────────────────────────────────────────────────────────────
// Part 1: Middleware unit tests
// ──────────────────────────────────────────────────────────────────────────────

describe("requireActiveTenant middleware (unit)", async () => {
  const { requireActiveTenant } = await import("../require-active-tenant");

  function makeReq(
    params: Record<string, string>,
    body: Record<string, unknown> = {},
  ) {
    return { params, body } as any;
  }

  function makeRes() {
    const res: any = {};
    res.status = (code: number) => {
      res._status = code;
      return res;
    };
    res.json = (body: unknown) => {
      res._body = body;
      return res;
    };
    return res;
  }

  it("calls next() when tenant is ACTIVE (workspace mode)", async () => {
    (storage as any).getTenantConnection = async () =>
      makeMockTenantConnection("ACTIVE");
    const mw = requireActiveTenant({ resolveFrom: "workspace" });
    const res = makeRes();
    let called = false;
    await mw(makeReq({ id: WORKSPACE_ID }), res, () => {
      called = true;
    });
    assert.equal(called, true);
    assert.equal(res._status, undefined);
  });

  it("returns 409 TENANT_NOT_ACTIVE for SUSPENDED tenant (workspace mode)", async () => {
    (storage as any).getTenantConnection = async () =>
      makeMockTenantConnection("SUSPENDED");
    const mw = requireActiveTenant({ resolveFrom: "workspace" });
    const res = makeRes();
    let called = false;
    await mw(makeReq({ id: WORKSPACE_ID }), res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(res._status, 409);
    assert.equal((res._body as any).error, "TENANT_NOT_ACTIVE");
    assert.equal((res._body as any).status, "SUSPENDED");
  });

  it("returns 409 TENANT_NOT_ACTIVE for REVOKED tenant (workspace mode)", async () => {
    (storage as any).getTenantConnection = async () =>
      makeMockTenantConnection("REVOKED");
    const mw = requireActiveTenant({ resolveFrom: "workspace" });
    const res = makeRes();
    let called = false;
    await mw(makeReq({ id: WORKSPACE_ID }), res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(res._status, 409);
    assert.equal((res._body as any).error, "TENANT_NOT_ACTIVE");
    assert.equal((res._body as any).status, "REVOKED");
  });

  it("returns 409 TENANT_NOT_ACTIVE for PENDING tenant (workspace mode)", async () => {
    (storage as any).getTenantConnection = async () =>
      makeMockTenantConnection("PENDING");
    const mw = requireActiveTenant({ resolveFrom: "workspace" });
    const res = makeRes();
    let called = false;
    await mw(makeReq({ id: WORKSPACE_ID }), res, () => {
      called = true;
    });
    assert.equal(called, false);
    assert.equal(res._status, 409);
    assert.equal((res._body as any).error, "TENANT_NOT_ACTIVE");
  });

  it("calls next() when workspace not found (graceful pass-through)", async () => {
    (storage as any).getTenantConnection = async () =>
      makeMockTenantConnection("SUSPENDED");
    const mw = requireActiveTenant({ resolveFrom: "workspace" });
    const res = makeRes();
    let called = false;
    await mw(makeReq({ id: "unknown-ws" }), res, () => {
      called = true;
    });
    assert.equal(called, true, "pass-through when tenant cannot be resolved");
  });

  it("resolves tenantConnectionId from body (provisioning routes)", async () => {
    (storage as any).getTenantConnection = async () =>
      makeMockTenantConnection("SUSPENDED");
    const mw = requireActiveTenant({ resolveFrom: "body" });
    const res = makeRes();
    let called = false;
    await mw(
      { params: {}, body: { tenantConnectionId: TENANT_ID } } as any,
      res,
      () => {
        called = true;
      },
    );
    assert.equal(called, false);
    assert.equal(res._status, 409);
  });

  it("resolves from :id param for admin tenant routes (param mode)", async () => {
    (storage as any).getTenantConnection = async () =>
      makeMockTenantConnection("SUSPENDED");
    const mw = requireActiveTenant({ resolveFrom: "param" });
    const res = makeRes();
    let called = false;
    await mw(
      { params: { id: TENANT_ID }, body: {} } as any,
      res,
      () => {
        called = true;
      },
    );
    assert.equal(called, false);
    assert.equal(res._status, 409);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Part 2: Real-router integration tests via supertest
//
// We import the actual sharepoint.ts default router and mount it in a test
// Express app with:
//   • Pre-auth middleware that injects a valid req.user (bypassing requireAuth /
//     requireRole without touching those middleware functions themselves)
//   • Storage mocks controlling workspace / tenant / scope data
//
// This proves that the real routes enforce BL-004 correctly without leaking
// existence/status information across org boundaries.
// ──────────────────────────────────────────────────────────────────────────────

describe("BL-004 enforcement on real SharePoint routes (supertest)", async () => {
  // Import the real router AFTER storage mocks are in place
  const sharepointRouter = (await import("../../routes/sharepoint")).default;

  function buildApp(opts: {
    tenantStatus: string;
    inScope: boolean;
    userRole?: string;
  }) {
    const app = express();
    app.use(express.json());

    // Inject authenticated user — bypasses requireAuth() and requireRole() checks
    // by pre-populating req.user and req.effectiveRole before the real middleware runs.
    app.use((req: any, _res: any, next: any) => {
      req.user = {
        id: "user-bl004",
        email: "admin@contoso.com",
        role: opts.userRole ?? "tenant_admin",
        organizationId: ORG_ID,
      };
      req.effectiveRole = opts.userRole ?? "tenant_admin";
      req.activeOrganizationId = ORG_ID;
      next();
    });

    // Scope mock: controls whether TENANT_ID is accessible for this org
    (storage as any).getTenantConnectionsByOrganization = async (orgId: string) => {
      if (orgId === ORG_ID && opts.inScope) {
        return [{ id: TENANT_ID }];
      }
      return [];
    };

    // Tenant mock
    (storage as any).getTenantConnection = async (id: string) => {
      if (id === TENANT_ID) return makeMockTenantConnection(opts.tenantStatus);
      return null;
    };

    app.use(sharepointRouter);
    return app;
  }

  it("PATCH /api/workspaces/:id → 409 for in-scope SUSPENDED tenant", async () => {
    const app = buildApp({ tenantStatus: "SUSPENDED", inScope: true });
    const res = await request(app)
      .patch(`/api/workspaces/${WORKSPACE_ID}`)
      .send({ displayName: "Updated" });

    assert.equal(res.status, 409);
    assert.equal(res.body.error, "TENANT_NOT_ACTIVE");
    assert.equal(res.body.status, "SUSPENDED");
  });

  it("PATCH /api/workspaces/:id → 409 for in-scope REVOKED tenant", async () => {
    const app = buildApp({ tenantStatus: "REVOKED", inScope: true });
    const res = await request(app)
      .patch(`/api/workspaces/${WORKSPACE_ID}`)
      .send({ displayName: "Updated" });

    assert.equal(res.status, 409);
    assert.equal(res.body.error, "TENANT_NOT_ACTIVE");
    assert.equal(res.body.status, "REVOKED");
  });

  it("PATCH /api/workspaces/:id → 404 for out-of-scope SUSPENDED tenant (no existence leak)", async () => {
    // Workspace exists in DB and tenant is SUSPENDED, but caller's org cannot see it
    const app = buildApp({ tenantStatus: "SUSPENDED", inScope: false });
    const res = await request(app)
      .patch(`/api/workspaces/${WORKSPACE_ID}`)
      .send({ displayName: "Updated" });

    // Must be 404 (scope denied), NOT 409 — proving we don't leak tenant status
    assert.equal(res.status, 404);
    assert.notEqual(res.body.error, "TENANT_NOT_ACTIVE");
  });

  it("GET /api/workspaces/:id → 200 even when tenant is SUSPENDED (reads unaffected)", async () => {
    const app = buildApp({ tenantStatus: "SUSPENDED", inScope: true });
    const res = await request(app).get(`/api/workspaces/${WORKSPACE_ID}`);

    // GET route has no BL-004 gate — should still return the workspace
    assert.equal(res.status, 200);
    assert.equal(res.body.id, WORKSPACE_ID);
  });

  it("PATCH /api/workspaces/:id → proceeds (non-409) for in-scope ACTIVE tenant", async () => {
    (storage as any).updateWorkspace = async (id: string, data: any) => ({
      ...mockWorkspace,
      ...data,
    });
    const app = buildApp({ tenantStatus: "ACTIVE", inScope: true });
    const res = await request(app)
      .patch(`/api/workspaces/${WORKSPACE_ID}`)
      .send({ displayName: "Updated" });

    assert.notEqual(res.status, 409);
    assert.notEqual(res.status, 401);
    assert.notEqual(res.status, 403);
  });

  it("DELETE /api/workspaces/:id → 409 for in-scope SUSPENDED tenant", async () => {
    const app = buildApp({ tenantStatus: "SUSPENDED", inScope: true });
    const res = await request(app).delete(`/api/workspaces/${WORKSPACE_ID}`);

    assert.equal(res.status, 409);
    assert.equal(res.body.error, "TENANT_NOT_ACTIVE");
  });

  it("DELETE /api/workspaces/:id → 404 for out-of-scope SUSPENDED tenant (no existence leak)", async () => {
    const app = buildApp({ tenantStatus: "SUSPENDED", inScope: false });
    const res = await request(app).delete(`/api/workspaces/${WORKSPACE_ID}`);

    assert.equal(res.status, 404);
    assert.notEqual(res.body.error, "TENANT_NOT_ACTIVE");
  });

  it("PUT /api/workspaces/:id/copilot-rules → 409 for in-scope SUSPENDED tenant", async () => {
    (storage as any).getOrganization = async () => ({ ...mockOrg, servicePlan: "ENTERPRISE" });
    const app = buildApp({ tenantStatus: "SUSPENDED", inScope: true });
    const res = await request(app)
      .put(`/api/workspaces/${WORKSPACE_ID}/copilot-rules`)
      .send({ rules: [] });

    assert.equal(res.status, 409);
    assert.equal(res.body.error, "TENANT_NOT_ACTIVE");
  });

  it("POST /api/workspaces → 409 for SUSPENDED tenant even as PLATFORM_OWNER", async () => {
    (storage as any).getTenantConnectionsByOrganization = async () => [{ id: TENANT_ID }];
    (storage as any).getTenantConnection = async (id: string) => {
      if (id === TENANT_ID) return makeMockTenantConnection("SUSPENDED");
      return null;
    };

    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      req.user = {
        id: "po-user",
        email: "po@platform.com",
        role: "platform_owner",
        organizationId: ORG_ID,
      };
      req.effectiveRole = "platform_owner";
      req.activeOrganizationId = ORG_ID;
      next();
    });
    app.use(sharepointRouter);

    const res = await request(app)
      .post("/api/workspaces")
      .send({
        tenantConnectionId: TENANT_ID,
        displayName: "New Site",
        type: "TEAM_SITE",
        sensitivity: "INTERNAL",
        externalSharing: false,
        copilotReady: false,
      });

    assert.equal(res.status, 409, `Expected 409 but got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.error, "TENANT_NOT_ACTIVE");
  });
});
