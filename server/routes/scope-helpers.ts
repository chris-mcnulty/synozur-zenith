import { ZENITH_ROLES } from "@shared/schema";
import { storage } from "../storage";
import type { AuthenticatedRequest } from "../middleware/rbac";
import { logAccessDenied } from "../services/audit-logger";

export function getActiveOrgId(req: AuthenticatedRequest): string | null {
  return req.activeOrganizationId || req.user?.organizationId || null;
}

/**
 * Tenant connections owned directly by `orgId`.
 *
 * Use this for DEFAULT-AGGREGATE org views — the answer to
 * "which tenants belong to this org?". MSP-managed tenants are intentionally
 * NOT included; they only roll up when the user explicitly picks one via the
 * tenant selector. (A dedicated MSP overview surface for the union view is a
 * future feature, not the default behaviour of an org-context page.)
 */
export async function getOwnedTenantConnectionIdsForOrg(orgId: string): Promise<string[]> {
  const connections = await storage.getTenantConnectionsByOrganization(orgId);
  return connections.map(c => c.id);
}

/**
 * Tenant connections owned by `orgId` PLUS any tenants delegated to it via
 * legacy MSP grants or new tenant_access_grants.
 *
 * Use this for SELECTOR VALIDATION ("can the user pick this tenant?") and
 * per-resource access checks (isWorkspaceInScope, mutations on a specific
 * workspace, etc). MSP-managed tenants must remain reachable here so a Synozur
 * user picking Reveille from the selector can drill in and operate on it.
 */
export async function getAccessibleTenantConnectionIdsForOrg(orgId: string): Promise<string[]> {
  const [ownConnections, legacyGrants, newGrantIds] = await Promise.all([
    storage.getTenantConnectionsByOrganization(orgId),
    storage.getActiveMspGrantsForGrantee(orgId),
    storage.getGrantedTenantConnectionIds(orgId),
  ]);
  const ownIds = ownConnections.map(c => c.id);
  const legacyGrantedIds = legacyGrants.map(g => g.tenantConnectionId);
  return [...new Set([...ownIds, ...legacyGrantedIds, ...newGrantIds])];
}

/** Backwards-compatible alias; prefer the explicit `Accessible` name. */
export const getTenantConnectionIdsForOrg = getAccessibleTenantConnectionIdsForOrg;

/**
 * Default DEFAULT-AGGREGATE scope for the active org context.
 *
 * Returns the active org's OWNED tenant connection IDs only, or `null` for a
 * Platform Owner with no active org (= true global view, no narrowing).
 * Empty array means the caller has no own tenants AND is not a PO.
 *
 * MSP-granted tenants are intentionally excluded — pick them via the tenant
 * selector to see their data. See `getAccessibleTenantConnectionIds` for the
 * union helper used to validate selector picks and per-resource access.
 */
export async function getOwnedTenantConnectionIds(req: AuthenticatedRequest): Promise<string[] | null> {
  const orgId = getActiveOrgId(req);
  if (!orgId) return req.user?.role === ZENITH_ROLES.PLATFORM_OWNER ? null : [];
  return getOwnedTenantConnectionIdsForOrg(orgId);
}

/**
 * Full reachable scope for the active org context — own + MSP-granted tenants.
 * `null` for PO with no active org (global). Empty array means no reach at all.
 *
 * Use for:
 *   - Validating a `?tenantConnectionId=X` selector pick
 *   - `isWorkspaceInScope` and other per-resource access checks
 *   - Mutations targeting a specific workspace / tenant the user might reach
 *     via the selector even when it's only managed (not owned)
 */
export async function getAccessibleTenantConnectionIds(req: AuthenticatedRequest): Promise<string[] | null> {
  const orgId = getActiveOrgId(req);
  if (!orgId) return req.user?.role === ZENITH_ROLES.PLATFORM_OWNER ? null : [];
  return getAccessibleTenantConnectionIdsForOrg(orgId);
}

/**
 * Backwards-compatible alias for the broad "accessible" scope. Prefer
 * `getAccessibleTenantConnectionIds` in new code; this name exists because it
 * was the legacy helper used everywhere for both validation and per-resource
 * access. Default-aggregate call sites have been migrated to
 * `getOwnedTenantConnectionIds`.
 */
export const getOrgTenantConnectionIds = getAccessibleTenantConnectionIds;

export async function isWorkspaceInScope(req: AuthenticatedRequest, workspaceId: string): Promise<boolean> {
  if (!req.user) {
    await logAccessDenied(req, "workspace", workspaceId, "Unauthenticated workspace access attempt");
    return false;
  }
  if (req.user.role === ZENITH_ROLES.PLATFORM_OWNER) return true;
  const ws = await storage.getWorkspace(workspaceId);
  if (!ws?.tenantConnectionId) {
    await logAccessDenied(req, "workspace", workspaceId, "Workspace not found or has no tenant connection");
    return false;
  }
  const allowedIds = await getAccessibleTenantConnectionIds(req);
  if (!allowedIds) return true;
  if (allowedIds.includes(ws.tenantConnectionId)) return true;
  await logAccessDenied(req, "workspace", workspaceId, "Workspace tenant connection is outside caller scope", {
    workspaceTenantConnectionId: ws.tenantConnectionId,
  });
  return false;
}

/**
 * Assert that a tenant connection is in the caller's accessible scope.
 * Returns true if allowed; otherwise emits ACCESS_DENIED and returns false so
 * the caller can return 403/404. Use at every mutating route that takes a
 * `:tenantConnectionId` / `:id` (tenant) param.
 */
export async function assertTenantInScope(
  req: AuthenticatedRequest,
  tenantConnectionId: string,
  reason = "Tenant connection is outside caller scope",
): Promise<boolean> {
  const allowed = await getAccessibleTenantConnectionIds(req);
  if (allowed === null) return true;
  if (allowed.includes(tenantConnectionId)) return true;
  await logAccessDenied(req, "tenant_connection", tenantConnectionId, reason);
  return false;
}
