import { Router } from 'express';
import { storage } from '../storage';
import { AuthenticatedRequest, requireAuth, requirePermission } from '../middleware/rbac';
import { ZENITH_ROLES, type ZenithRole } from '@shared/schema';
import { getAppToken, searchEntraUsers } from '../services/graph';

const router = Router();

const VALID_ROLES: ZenithRole[] = Object.values(ZENITH_ROLES);

router.get('/api/orgs/mine', requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const memberships = await storage.getOrgMemberships(user.id);

    const orgsWithRoles = await Promise.all(
      memberships.map(async (m) => {
        const org = await storage.getOrganization(m.organizationId);
        return org ? {
          id: org.id,
          name: org.name,
          domain: org.domain,
          servicePlan: org.servicePlan,
          role: m.role,
          isPrimary: m.isPrimary,
          membershipId: m.id,
          platformAccess: false,
        } : null;
      })
    );

    const filtered = orgsWithRoles.filter(Boolean) as NonNullable<typeof orgsWithRoles[number]>[];

    if (filtered.length === 0 && user.organizationId) {
      const org = await storage.getOrganization(user.organizationId);
      if (org) {
        filtered.push({
          id: org.id,
          name: org.name,
          domain: org.domain,
          servicePlan: org.servicePlan,
          role: user.role,
          isPrimary: true,
          membershipId: null,
          platformAccess: false,
        });
      }
    }

    return res.json(filtered);
  } catch (error: any) {
    console.error('[Orgs] Get my orgs error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/orgs/switch', requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { organizationId } = req.body;

    if (!organizationId) {
      return res.status(400).json({ error: 'organizationId is required' });
    }

    const isPlatformOwner = user.role === ZENITH_ROLES.PLATFORM_OWNER;
    const membership = await storage.getOrgMembership(user.id, organizationId);

    if (!membership && user.organizationId !== organizationId && !isPlatformOwner) {
      return res.status(403).json({ error: 'You are not a member of this organization' });
    }

    const org = await storage.getOrganization(organizationId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    req.session.activeOrganizationId = organizationId;

    await storage.createAuditEntry({
      userId: user.id,
      userEmail: user.email,
      action: 'ORG_SWITCHED',
      resource: 'organization',
      resourceId: organizationId,
      organizationId,
      details: { organizationName: org.name, platformAdminAccess: isPlatformOwner && !membership },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json({
      success: true,
      organization: org,
      role: membership?.role || user.role,
    });
  } catch (error: any) {
    console.error('[Orgs] Switch org error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// These org-member routes manage multi-org memberships in the organizationUsers junction table.
// The canonical user management API (add/role/deactivate/reactivate) lives in routes-auth.ts under /api/auth/users/*.
// These routes are used for users who belong to multiple organizations and are NOT duplicates of the auth routes.
router.get('/api/orgs/:id/members', requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const orgId = req.params.id as string;

    const membership = await storage.getOrgMembership(user.id, orgId);
    if (!membership && user.organizationId !== orgId) {
      return res.status(403).json({ error: 'You are not a member of this organization' });
    }

    const members = await storage.getOrgMembers(orgId);

    const enriched = await Promise.all(
      members.map(async (m) => {
        const memberUser = await storage.getUser(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          email: memberUser?.email || 'unknown',
          name: memberUser?.name || null,
          role: m.role,
          isPrimary: m.isPrimary,
          joinedAt: m.joinedAt,
          emailVerified: memberUser?.emailVerified || false,
          authProvider: memberUser?.authProvider || null,
        };
      })
    );

    return res.json(enriched);
  } catch (error: any) {
    console.error('[Orgs] Get members error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/orgs/:id/members', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const orgId = req.params.id as string;
    const { userId, email, role } = req.body;

    const adminMembership = await storage.getOrgMembership(adminUser.id, orgId);
    if (!adminMembership && adminUser.organizationId !== orgId) {
      return res.status(403).json({ error: 'You are not a member of this organization' });
    }

    const assignedRole: ZenithRole = role && VALID_ROLES.includes(role) ? role : 'viewer';

    let targetUserId = userId;
    if (!targetUserId && email) {
      const targetUser = await storage.getUserByEmail(email);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      targetUserId = targetUser.id;
    }

    if (!targetUserId) {
      return res.status(400).json({ error: 'userId or email is required' });
    }

    const existing = await storage.getOrgMembership(targetUserId, orgId);
    if (existing) {
      return res.status(409).json({ error: 'User is already a member of this organization' });
    }

    const membership = await storage.createOrgMembership({
      userId: targetUserId,
      organizationId: orgId,
      role: assignedRole,
      isPrimary: false,
    });

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'ORG_MEMBER_ADDED',
      resource: 'organization_user',
      resourceId: membership.id,
      organizationId: orgId,
      details: { targetUserId, assignedRole, addedBy: adminUser.email },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.status(201).json(membership);
  } catch (error: any) {
    console.error('[Orgs] Add member error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/api/orgs/:id/members/:userId/role', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const orgId = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const { role } = req.body;

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Valid roles: ${VALID_ROLES.join(', ')}` });
    }

    const membership = await storage.getOrgMembership(targetUserId, orgId);
    if (!membership) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    const previousRole = membership.role;
    const updated = await storage.updateOrgMembership(membership.id, { role });

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'ORG_MEMBER_ROLE_CHANGED',
      resource: 'organization_user',
      resourceId: membership.id,
      organizationId: orgId,
      details: { targetUserId, previousRole, newRole: role, changedBy: adminUser.email },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json(updated);
  } catch (error: any) {
    console.error('[Orgs] Update member role error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/orgs/:id/members/:userId', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const orgId = req.params.id as string;
    const targetUserId = req.params.userId as string;

    if (targetUserId === adminUser.id) {
      return res.status(400).json({ error: 'Cannot remove yourself from an organization' });
    }

    const membership = await storage.getOrgMembership(targetUserId, orgId);
    if (!membership) {
      return res.status(404).json({ error: 'Membership not found' });
    }

    await storage.deleteOrgMembership(targetUserId, orgId);

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'ORG_MEMBER_REMOVED',
      resource: 'organization_user',
      resourceId: membership.id,
      organizationId: orgId,
      details: { targetUserId, removedBy: adminUser.email },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Orgs] Remove member error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/api/orgs/:id/settings', requireAuth(), requirePermission('settings:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const orgId = req.params.id as string;

    const adminMembership = await storage.getOrgMembership(adminUser.id, orgId);
    if (!adminMembership && adminUser.organizationId !== orgId) {
      return res.status(403).json({ error: 'You are not a member of this organization' });
    }

    const { allowedDomains, inviteOnly } = req.body;

    const updates: Record<string, any> = {};
    if (allowedDomains !== undefined) {
      if (!Array.isArray(allowedDomains) || !allowedDomains.every((d: any) => typeof d === 'string')) {
        return res.status(400).json({ error: 'allowedDomains must be an array of strings' });
      }
      updates.allowedDomains = allowedDomains.map((d: string) => d.toLowerCase().trim());
    }
    if (inviteOnly !== undefined) {
      if (typeof inviteOnly !== 'boolean') {
        return res.status(400).json({ error: 'inviteOnly must be a boolean' });
      }
      updates.inviteOnly = inviteOnly;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid settings provided' });
    }

    const updated = await storage.updateOrganizationSettings(orgId, updates);

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'ORG_SETTINGS_UPDATED',
      resource: 'organization',
      resourceId: orgId,
      organizationId: orgId,
      details: { updates, updatedBy: adminUser.email },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json(updated);
  } catch (error: any) {
    console.error('[Orgs] Update settings error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/orgs/:id/data-counts', requireAuth(), requirePermission('settings:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const orgId = req.params.id as string;

    const membership = await storage.getOrgMembership(user.id, orgId);
    if (!membership && user.organizationId !== orgId) {
      return res.status(403).json({ error: 'You are not a member of this organization' });
    }

    const counts = await storage.getOrganizationDataCounts(orgId);
    return res.json(counts);
  } catch (error: any) {
    console.error('[Orgs] Get data counts error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/api/orgs/:id/cancel', requireAuth(), requirePermission('settings:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const orgId = req.params.id as string;

    const membership = await storage.getOrgMembership(user.id, orgId);
    const isTenantAdmin = membership?.role === 'tenant_admin' || user.role === 'tenant_admin' || user.role === 'platform_owner';
    if (!isTenantAdmin) {
      return res.status(403).json({ error: 'Only tenant administrators can cancel an organization' });
    }

    if (!membership && user.organizationId !== orgId) {
      return res.status(403).json({ error: 'You are not a member of this organization' });
    }

    const org = await storage.getOrganization(orgId);
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const orgName = org.name;

    await storage.purgeOrganizationData(orgId);

    await storage.createAuditEntry({
      userId: user.id,
      userEmail: user.email,
      action: 'ORG_CANCELLED',
      resource: 'organization',
      resourceId: orgId,
      organizationId: undefined,
      details: { organizationName: orgName, cancelledBy: user.email, selfService: true },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    if (req.session) {
      req.session.destroy((err: any) => {
        if (err) console.error('[Orgs] Session destroy error:', err);
      });
    }

    return res.json({ success: true, message: 'Organization and all associated data have been permanently deleted.' });
  } catch (error: any) {
    console.error('[Orgs] Cancel org error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/orgs/:id/entra-users', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const orgId = req.params.id as string;
    const query = (req.query.q as string || '').trim();

    if (!query || query.length < 2) {
      return res.json({ users: [] });
    }

    const adminMembership = await storage.getOrgMembership(adminUser.id, orgId);
    if (!adminMembership && adminUser.organizationId !== orgId) {
      return res.status(403).json({ error: 'You are not a member of this organization' });
    }

    const connections = await storage.getTenantConnections(orgId);
    if (!connections || connections.length === 0) {
      return res.status(404).json({ error: 'No tenant connections found for this organization. Connect an M365 tenant first.' });
    }

    const connection = connections[0];
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(503).json({ error: 'Azure credentials not configured' });
    }

    const token = await getAppToken(connection.tenantId, clientId, clientSecret);
    const result = await searchEntraUsers(token, query, 10);

    if (result.error) {
      return res.status(502).json({ error: result.error });
    }

    return res.json({ users: result.users });
  } catch (error: any) {
    console.error('[Orgs] Entra user search error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
