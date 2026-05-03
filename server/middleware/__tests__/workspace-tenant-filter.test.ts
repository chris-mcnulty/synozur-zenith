/**
 * Tests for Spec §4.2 — Workspace inventory filtering by tenant status.
 *
 * Confirms that GET /api/workspaces hides workspaces whose tenant is not ACTIVE
 * for non-admin roles (operator, viewer, governance_admin) while tenant_admin and
 * platform_owner can still see them.
 *
 * Storage is mocked so these tests run without a real database.
 */

import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";

const { storage } = await import("../../storage");

const ORG_ID = "org-ws-filter-test-001";
const TENANT_ACTIVE_ID = "tenant-active-001";
const TENANT_SUSPENDED_ID = "tenant-suspended-001";

const workspaceFromActiveTenant = {
  id: "ws-active-tenant-001",
  tenantConnectionId: TENANT_ACTIVE_ID,
  displayName: "Active Tenant Site",
  isDeleted: false,
  isArchived: false,
  siteUrl: "https://contoso.sharepoint.com/sites/active",
  type: "TEAM_SITE",
  sensitivity: "INTERNAL",
};

const workspaceFromSuspendedTenant = {
  id: "ws-suspended-tenant-001",
  tenantConnectionId: TENANT_SUSPENDED_ID,
  displayName: "Suspended Tenant Site",
  isDeleted: false,
  isArchived: false,
  siteUrl: "https://contoso.sharepoint.com/sites/suspended",
  type: "TEAM_SITE",
  sensitivity: "INTERNAL",
};

// ──────────────────────────────────────────────────────────────────────────────
// Save & restore storage originals
// ──────────────────────────────────────────────────────────────────────────────

const savedMethods: Record<string, any> = {};

before(() => {
  const toSave = [
    "getWorkspaces",
    "getWorkspacesPaginated",
    "getTenantConnectionsByOrganization",
    "getActiveMspGrantsForGrantee",
    "getGrantedTenantConnectionIds",
    "getOrganization",
    "createAuditEntry",
  ];
  for (const m of toSave) savedMethods[m] = (storage as any)[m].bind(storage);

  (storage as any).createAuditEntry = async () => {};
  (storage as any).getOrganization = async () => ({
    id: ORG_ID,
    name: "Test Org",
    servicePlan: "ENTERPRISE",
  });
  (storage as any).getActiveMspGrantsForGrantee = async () => [];
  (storage as any).getGrantedTenantConnectionIds = async () => [];
});

after(() => {
  for (const [m, fn] of Object.entries(savedMethods)) {
    (storage as any)[m] = fn;
  }
});

afterEach(() => {
  (storage as any).getTenantConnectionsByOrganization =
    savedMethods.getTenantConnectionsByOrganization;
  (storage as any).getWorkspaces = savedMethods.getWorkspaces;
  (storage as any).getWorkspacesPaginated = savedMethods.getWorkspacesPaginated;
});

// ──────────────────────────────────────────────────────────────────────────────
// Helper: build a test Express app with pre-injected user role
// ──────────────────────────────────────────────────────────────────────────────

async function buildApp(userRole: string) {
  const sharepointRouter = (await import("../../routes/sharepoint")).default;

  const app = express();
  app.use(express.json());

  app.use((req: any, _res: any, next: any) => {
    req.user = {
      id: "user-filter-test",
      email: "user@test.com",
      role: userRole,
      organizationId: ORG_ID,
    };
    req.effectiveRole = userRole;
    req.activeOrganizationId = ORG_ID;
    next();
  });

  (storage as any).getTenantConnectionsByOrganization = async (orgId: string) => {
    if (orgId === ORG_ID) {
      return [{ id: TENANT_ACTIVE_ID }, { id: TENANT_SUSPENDED_ID }];
    }
    return [];
  };

  app.use(sharepointRouter);
  return app;
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests: activeTenantsOnly flag is passed correctly based on role
// ──────────────────────────────────────────────────────────────────────────────

describe("GET /api/workspaces – Spec §4.2 tenant status filtering", async () => {
  it("operator role: activeTenantsOnly=true is passed to getWorkspaces", async () => {
    let capturedActiveTenantsOnly: boolean | undefined;

    (storage as any).getWorkspaces = async (
      _search: any,
      _tcId: any,
      _orgId: any,
      activeTenantsOnly?: boolean,
    ) => {
      capturedActiveTenantsOnly = activeTenantsOnly;
      return activeTenantsOnly ? [workspaceFromActiveTenant] : [workspaceFromActiveTenant, workspaceFromSuspendedTenant];
    };

    const app = await buildApp("operator");
    await request(app).get("/api/workspaces");

    assert.equal(
      capturedActiveTenantsOnly,
      true,
      "operator should receive activeTenantsOnly=true",
    );
  });

  it("viewer role: activeTenantsOnly=true is passed to getWorkspaces", async () => {
    let capturedActiveTenantsOnly: boolean | undefined;

    (storage as any).getWorkspaces = async (
      _search: any,
      _tcId: any,
      _orgId: any,
      activeTenantsOnly?: boolean,
    ) => {
      capturedActiveTenantsOnly = activeTenantsOnly;
      return activeTenantsOnly ? [workspaceFromActiveTenant] : [workspaceFromActiveTenant, workspaceFromSuspendedTenant];
    };

    const app = await buildApp("viewer");
    await request(app).get("/api/workspaces");

    assert.equal(
      capturedActiveTenantsOnly,
      true,
      "viewer should receive activeTenantsOnly=true",
    );
  });

  it("governance_admin role: activeTenantsOnly=true is passed to getWorkspaces", async () => {
    let capturedActiveTenantsOnly: boolean | undefined;

    (storage as any).getWorkspaces = async (
      _search: any,
      _tcId: any,
      _orgId: any,
      activeTenantsOnly?: boolean,
    ) => {
      capturedActiveTenantsOnly = activeTenantsOnly;
      return [];
    };

    const app = await buildApp("governance_admin");
    await request(app).get("/api/workspaces");

    assert.equal(
      capturedActiveTenantsOnly,
      true,
      "governance_admin should receive activeTenantsOnly=true",
    );
  });

  it("tenant_admin role: activeTenantsOnly=false — suspended-tenant workspaces are visible", async () => {
    let capturedActiveTenantsOnly: boolean | undefined;

    (storage as any).getWorkspaces = async (
      _search: any,
      _tcId: any,
      _orgId: any,
      activeTenantsOnly?: boolean,
    ) => {
      capturedActiveTenantsOnly = activeTenantsOnly;
      return [workspaceFromActiveTenant, workspaceFromSuspendedTenant];
    };

    const app = await buildApp("tenant_admin");
    const res = await request(app).get("/api/workspaces");

    assert.equal(
      capturedActiveTenantsOnly,
      false,
      "tenant_admin should receive activeTenantsOnly=false",
    );
    const ids = (res.body as any[]).map((w: any) => w.id);
    assert.ok(
      ids.includes(workspaceFromSuspendedTenant.id),
      "tenant_admin should see the suspended-tenant workspace",
    );
  });

  it("platform_owner role: activeTenantsOnly=false — suspended-tenant workspaces are visible", async () => {
    let capturedActiveTenantsOnly: boolean | undefined;

    (storage as any).getWorkspaces = async (
      _search: any,
      _tcId: any,
      _orgId: any,
      activeTenantsOnly?: boolean,
    ) => {
      capturedActiveTenantsOnly = activeTenantsOnly;
      return [workspaceFromActiveTenant, workspaceFromSuspendedTenant];
    };

    const app = await buildApp("platform_owner");
    const res = await request(app).get("/api/workspaces");

    assert.equal(
      capturedActiveTenantsOnly,
      false,
      "platform_owner should receive activeTenantsOnly=false",
    );
    const ids = (res.body as any[]).map((w: any) => w.id);
    assert.ok(
      ids.includes(workspaceFromSuspendedTenant.id),
      "platform_owner should see the suspended-tenant workspace",
    );
  });

  it("operator role (paginated): activeTenantsOnly=true is passed to getWorkspacesPaginated", async () => {
    let capturedActiveTenantsOnly: boolean | undefined;

    (storage as any).getWorkspacesPaginated = async (params: any) => {
      capturedActiveTenantsOnly = params.activeTenantsOnly;
      return { items: [], total: 0 };
    };

    const app = await buildApp("operator");
    await request(app).get("/api/workspaces?page=1&pageSize=20");

    assert.equal(
      capturedActiveTenantsOnly,
      true,
      "operator paginated should receive activeTenantsOnly=true",
    );
  });

  it("tenant_admin role (paginated): activeTenantsOnly=false — all workspaces returned", async () => {
    let capturedActiveTenantsOnly: boolean | undefined;

    (storage as any).getWorkspacesPaginated = async (params: any) => {
      capturedActiveTenantsOnly = params.activeTenantsOnly;
      return {
        items: [workspaceFromActiveTenant, workspaceFromSuspendedTenant],
        total: 2,
      };
    };

    const app = await buildApp("tenant_admin");
    const res = await request(app).get("/api/workspaces?page=1&pageSize=20");

    assert.equal(
      capturedActiveTenantsOnly,
      false,
      "tenant_admin paginated should receive activeTenantsOnly=false",
    );
    assert.equal(res.body.total, 2);
    assert.equal(res.body.items.length, 2);
  });
});
