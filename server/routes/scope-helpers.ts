import { ZENITH_ROLES } from "@shared/schema";
import { storage } from "../storage";
import type { AuthenticatedRequest } from "../middleware/rbac";

export function getActiveOrgId(req: AuthenticatedRequest): string | null {
  if (req.user?.role === ZENITH_ROLES.PLATFORM_OWNER) return null;
  return req.activeOrganizationId || req.user?.organizationId || null;
}

export async function getOrgTenantConnectionIds(req: AuthenticatedRequest): Promise<string[] | null> {
  if (req.user?.role === ZENITH_ROLES.PLATFORM_OWNER) return null;
  const orgId = getActiveOrgId(req);
  if (!orgId) return [];
  const connections = await storage.getTenantConnectionsByOrganization(orgId);
  return connections.map(c => c.id);
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
