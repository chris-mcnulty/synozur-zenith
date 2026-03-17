import { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import { ZENITH_ROLES, type ZenithRole, type User } from '@shared/schema';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    pkceVerifier?: string;
    authState?: string;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: User;
}

const ROLE_HIERARCHY: Record<ZenithRole, number> = {
  [ZENITH_ROLES.PLATFORM_OWNER]: 100,
  [ZENITH_ROLES.TENANT_ADMIN]: 80,
  [ZENITH_ROLES.GOVERNANCE_ADMIN]: 60,
  [ZENITH_ROLES.OPERATOR]: 40,
  [ZENITH_ROLES.VIEWER]: 20,
  [ZENITH_ROLES.AUDITOR]: 10,
};

const ROLE_PERMISSIONS: Record<ZenithRole, string[]> = {
  [ZENITH_ROLES.PLATFORM_OWNER]: [
    'platform:manage', 'tenants:manage', 'users:manage', 'workspaces:manage',
    'provisioning:manage', 'governance:manage', 'copilot:manage', 'audit:read',
    'inventory:read', 'settings:manage',
  ],
  [ZENITH_ROLES.TENANT_ADMIN]: [
    'tenants:manage', 'users:manage', 'workspaces:manage', 'provisioning:manage',
    'governance:manage', 'copilot:manage', 'audit:read', 'inventory:read', 'settings:manage',
  ],
  [ZENITH_ROLES.GOVERNANCE_ADMIN]: [
    'workspaces:manage', 'governance:manage', 'copilot:manage', 'audit:read', 'inventory:read',
  ],
  [ZENITH_ROLES.OPERATOR]: [
    'workspaces:read', 'workspaces:update', 'provisioning:create', 'provisioning:read',
    'inventory:read',
  ],
  [ZENITH_ROLES.VIEWER]: [
    'workspaces:read', 'inventory:read',
  ],
  [ZENITH_ROLES.AUDITOR]: [
    'audit:read', 'inventory:read',
  ],
};

export function loadCurrentUser() {
  return async (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const userId = req.session?.userId;
    if (userId) {
      try {
        const user = await storage.getUser(userId);
        if (user) {
          req.user = user;
        }
      } catch (err) {
        console.error('[RBAC] Failed to load user:', err);
      }
    }
    next();
  };
}

export function requireAuth() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    next();
  };
}

export function requireRole(...roles: ZenithRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userRole = req.user.role as ZenithRole;
    if (!roles.includes(userRole) && userRole !== ZENITH_ROLES.PLATFORM_OWNER) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userRole = req.user.role as ZenithRole;
    const userPerms = ROLE_PERMISSIONS[userRole] || [];
    if (!userPerms.includes(permission)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

export function requireAnyPermission(...permissions: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const userRole = req.user.role as ZenithRole;
    const userPerms = ROLE_PERMISSIONS[userRole] || [];
    const hasAny = permissions.some(p => userPerms.includes(p));
    if (!hasAny) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }
    next();
  };
}

export function hasPermission(role: ZenithRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role] || [];
  return perms.includes(permission);
}

export function getRoleLevel(role: ZenithRole): number {
  return ROLE_HIERARCHY[role] || 0;
}

export function getPermissionsForRole(role: ZenithRole): string[] {
  return ROLE_PERMISSIONS[role] || [];
}
