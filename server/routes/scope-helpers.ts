import { ZENITH_ROLES } from "@shared/schema";
import { storage } from "../storage";
import type { AuthenticatedRequest } from "../middleware/rbac";

export function getActiveOrgId(req: AuthenticatedRequest): string | null {
  return req.activeOrganizationId || req.user?.organizationId || null;
}

export async function getTenantConnectionIdsForOrg(orgId: string): Promise<string[]> {
  const [ownConnections, legacyGrants, newGrantIds] = await Promise.all([
    storage.getTenantConnectionsByOrganization(orgId),
    storage.getActiveMspGrantsForGrantee(orgId),
    storage.getGrantedTenantConnectionIds(orgId),
  ]);

  const ownIds = ownConnections.map(c => c.id);
  const legacyGrantedIds = legacyGrants.map(g => g.tenantConnectionId);

  return [...new Set([...ownIds, ...legacyGrantedIds, ...newGrantIds])];
}

export async function getOrgTenantConnectionIds(req: AuthenticatedRequest): Promise<string[] | null> {
  const orgId = getActiveOrgId(req);
  if (!orgId) return req.user?.role === ZENITH_ROLES.PLATFORM_OWNER ? null : [];

  return getTenantConnectionIdsForOrg(orgId);
}

export async function isWorkspaceInScope(req: AuthenticatedRequest, workspaceId: string): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === ZENITH_ROLES.PLATFORM_OWNER) return true;
  const ws = await storage.getWorkspace(workspaceId);
  if (!ws?.tenantConnectionId) return false;
  const allowedIds = await getOrgTenantConnectionIds(req);
  if (!allowedIds) return true;
  return allowedIds.includes(ws.tenantConnectionId);
}
