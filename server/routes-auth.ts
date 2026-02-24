import { Router } from 'express';
import { storage } from './storage';
import { hashPassword, verifyPassword, generateToken } from './auth';
import { AuthenticatedRequest, requireAuth, requirePermission } from './middleware/rbac';
import { type User, ZENITH_ROLES, type ZenithRole } from '@shared/schema';
import { isPublicEmailDomain } from './utils/publicDomains';

const router = Router();

function sanitizeUser(user: User) {
  const { password, verificationToken, resetToken, resetTokenExpiry, ...safe } = user;
  return safe;
}

router.post('/signup', async (req: AuthenticatedRequest, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await storage.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const hashedPassword = await hashPassword(password);
    const domain = email.split('@')[1].toLowerCase();

    const isBlocked = await storage.isDomainBlocked(domain);
    if (isBlocked) {
      return res.status(403).json({
        error: 'This email domain is not allowed for self-registration. Please contact your administrator to set up your organization.',
      });
    }

    const isPublicDomain = isPublicEmailDomain(email);

    const orgs = await storage.getOrganizations();
    let org = orgs.find(o => o.domain === domain);
    let isFirstUser = false;

    if (isPublicDomain) {
      const personalOrgName = name
        ? `${name}'s Workspace`
        : `${email.split('@')[0]}'s Workspace`;

      org = await storage.upsertOrganization({
        name: personalOrgName,
        domain: `personal-${email.split('@')[0].replace(/[^a-z0-9]/gi, '')}-${Date.now()}`,
        servicePlan: 'TRIAL',
      });
      isFirstUser = true;
    } else if (!org) {
      org = await storage.upsertOrganization({
        name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
        domain,
        servicePlan: 'TRIAL',
      });
      isFirstUser = true;
    } else {
      const orgUsers = await storage.getUsersByOrganization(org.id);
      isFirstUser = orgUsers.length === 0;
    }

    const role = isFirstUser ? 'tenant_admin' : 'viewer';
    const verificationToken = generateToken();

    const user = await storage.createUser({
      email,
      password: hashedPassword,
      name: name || null,
      role,
      organizationId: org.id,
      emailVerified: false,
      verificationToken,
      authProvider: 'local',
    });

    await storage.createAuditEntry({
      userId: user.id,
      userEmail: user.email,
      action: 'USER_SIGNUP',
      resource: 'user',
      resourceId: user.id,
      organizationId: org.id,
      details: { role, domain, isPublicDomain },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.status(201).json({ user: sanitizeUser(user) });
  } catch (error: any) {
    console.error('[Auth] Signup error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', async (req: AuthenticatedRequest, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await storage.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.organizationId) {
      const org = await storage.getOrganization(user.organizationId);
      if (org?.enforceSso) {
        return res.status(403).json({
          error: 'Your organization requires SSO authentication',
          ssoRequired: true,
          organizationId: org.id,
        });
      }
    }

    if (!user.emailVerified) {
      return res.status(403).json({
        error: 'Your account has been deactivated. Please contact your administrator.',
      });
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await storage.updateUser(user.id, { lastLoginAt: new Date() });

    req.session.userId = user.id;

    await storage.createAuditEntry({
      userId: user.id,
      userEmail: user.email,
      action: 'USER_LOGIN',
      resource: 'session',
      resourceId: user.id,
      organizationId: user.organizationId || undefined,
      details: { authProvider: 'local' },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json({ user: sanitizeUser(user) });
  } catch (error: any) {
    console.error('[Auth] Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    let organization = null;
    if (user.organizationId) {
      organization = await storage.getOrganization(user.organizationId);
    }

    return res.json({ user: sanitizeUser(user), organization });
  } catch (error: any) {
    console.error('[Auth] Get current user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await storage.getUser(userId);
    if (!user || !user.organizationId) {
      return res.status(401).json({ error: 'Not authenticated or no organization' });
    }

    const orgUsers = await storage.getUsersByOrganization(user.organizationId);
    const safeUsers = orgUsers.map(u => sanitizeUser(u));
    return res.json(safeUsers);
  } catch (error: any) {
    console.error('[Auth] Get users error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (req: AuthenticatedRequest, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Auth] Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    return res.json({ success: true });
  });
});

router.post('/verify-email', async (req: AuthenticatedRequest, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const user = await storage.getUserByVerificationToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    await storage.updateUser(user.id, {
      emailVerified: true,
      verificationToken: null,
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Auth] Verify email error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/request-password-reset', async (req: AuthenticatedRequest, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await storage.getUserByEmail(email);

    if (user) {
      const resetToken = generateToken();
      const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);

      await storage.updateUser(user.id, {
        resetToken,
        resetTokenExpiry,
      });

      await storage.createAuditEntry({
        userId: user.id,
        userEmail: user.email,
        action: 'PASSWORD_RESET_REQUESTED',
        resource: 'user',
        resourceId: user.id,
        organizationId: user.organizationId || undefined,
        details: {},
        result: 'SUCCESS',
        ipAddress: req.ip || null,
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Auth] Request password reset error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reset-password', async (req: AuthenticatedRequest, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await storage.getUserByResetToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    const hashedPassword = await hashPassword(newPassword);

    await storage.updateUser(user.id, {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    });

    await storage.createAuditEntry({
      userId: user.id,
      userEmail: user.email,
      action: 'PASSWORD_RESET_COMPLETED',
      resource: 'user',
      resourceId: user.id,
      organizationId: user.organizationId || undefined,
      details: {},
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Auth] Reset password error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const VALID_ROLES: ZenithRole[] = Object.values(ZENITH_ROLES);

router.post('/users/add', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    if (!adminUser.organizationId) {
      return res.status(400).json({ error: 'No organization context' });
    }

    const { email, name, role } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const assignedRole: ZenithRole = role && VALID_ROLES.includes(role) ? role : 'viewer';

    if (assignedRole === 'platform_owner' && adminUser.role !== 'platform_owner') {
      return res.status(403).json({ error: 'Only platform owners can assign the platform owner role' });
    }

    const existing = await storage.getUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    const tempPassword = generateToken().slice(0, 16);
    const hashedPassword = await hashPassword(tempPassword);

    const newUser = await storage.createUser({
      email: email.toLowerCase(),
      password: hashedPassword,
      name: name || null,
      role: assignedRole,
      organizationId: adminUser.organizationId,
      emailVerified: false,
      verificationToken: generateToken(),
      authProvider: 'local',
    });

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'USER_CREATED',
      resource: 'user',
      resourceId: newUser.id,
      organizationId: adminUser.organizationId,
      details: { targetEmail: email, assignedRole, createdBy: adminUser.email },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.status(201).json({ user: sanitizeUser(newUser) });
  } catch (error: any) {
    console.error('[Auth] Add user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/users/:id/role', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const targetUserId = req.params.id;
    const { role } = req.body;

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `Invalid role. Valid roles: ${VALID_ROLES.join(', ')}` });
    }

    if (role === 'platform_owner' && adminUser.role !== 'platform_owner') {
      return res.status(403).json({ error: 'Only platform owners can assign the platform owner role' });
    }

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.organizationId !== adminUser.organizationId) {
      return res.status(403).json({ error: 'Cannot modify users outside your organization' });
    }

    if (targetUserId === adminUser.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const previousRole = targetUser.role;
    const updated = await storage.updateUser(targetUserId, { role });

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'USER_ROLE_CHANGED',
      resource: 'user',
      resourceId: targetUserId,
      organizationId: adminUser.organizationId,
      details: { targetEmail: targetUser.email, previousRole, newRole: role, changedBy: adminUser.email },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json({ user: sanitizeUser(updated!) });
  } catch (error: any) {
    console.error('[Auth] Update role error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/users/:id/deactivate', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const targetUserId = req.params.id;

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.organizationId !== adminUser.organizationId) {
      return res.status(403).json({ error: 'Cannot modify users outside your organization' });
    }

    if (targetUserId === adminUser.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    if (targetUser.role === 'platform_owner' && adminUser.role !== 'platform_owner') {
      return res.status(403).json({ error: 'Cannot deactivate a platform owner' });
    }

    const updated = await storage.updateUser(targetUserId, { emailVerified: false });

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'USER_DEACTIVATED',
      resource: 'user',
      resourceId: targetUserId,
      organizationId: adminUser.organizationId,
      details: { targetEmail: targetUser.email, previousRole: targetUser.role, deactivatedBy: adminUser.email },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json({ user: sanitizeUser(updated!) });
  } catch (error: any) {
    console.error('[Auth] Deactivate user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/users/:id/reactivate', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const targetUserId = req.params.id;

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.organizationId !== adminUser.organizationId) {
      return res.status(403).json({ error: 'Cannot modify users outside your organization' });
    }

    const updated = await storage.updateUser(targetUserId, { emailVerified: true });

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'USER_REACTIVATED',
      resource: 'user',
      resourceId: targetUserId,
      organizationId: adminUser.organizationId,
      details: { targetEmail: targetUser.email, reactivatedBy: adminUser.email },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json({ user: sanitizeUser(updated!) });
  } catch (error: any) {
    console.error('[Auth] Reactivate user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
