import { Router } from 'express';
import { storage } from './storage';
import { hashPassword, verifyPassword, generateToken } from './auth';
import { AuthenticatedRequest, requireAuth, requirePermission } from './middleware/rbac';
import { type User, ZENITH_ROLES, type ZenithRole } from '@shared/schema';
import { isPublicEmailDomain } from './utils/publicDomains';
import { getDefaultSignupPlan } from './utils/platformSettingsCache';
import { sendVerificationEmail, sendPasswordResetEmail, sendUserInviteEmail } from './email-support';

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
        servicePlan: await getDefaultSignupPlan(),
      });
      isFirstUser = true;
    } else if (!org) {
      org = await storage.upsertOrganization({
        name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
        domain,
        servicePlan: await getDefaultSignupPlan(),
      });
      isFirstUser = true;
    } else {
      if (org.inviteOnly) {
        return res.status(403).json({
          error: 'This organization requires an invitation to join. Please contact your administrator.',
        });
      }

      if (org.allowedDomains && org.allowedDomains.length > 0) {
        if (!org.allowedDomains.includes(domain)) {
          return res.status(403).json({
            error: 'Your email domain is not allowed to join this organization.',
          });
        }
      }

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

    await storage.createOrgMembership({
      userId: user.id,
      organizationId: org.id,
      role,
      isPrimary: true,
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

    try {
      await sendVerificationEmail(user, verificationToken);
    } catch (emailErr: any) {
      console.warn('[Auth] Failed to send verification email:', emailErr.message);
      return res.status(201).json({
        user: sanitizeUser(user),
        emailDeliveryFailed: true,
        emailDeliveryError: 'Verification email could not be delivered. Please contact your administrator.',
      });
    }

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

    if (user.organizationId) {
      const memberships = await storage.getOrgMemberships(user.id);
      const primaryMembership = memberships.find(m => m.isPrimary) || memberships[0];
      req.session.activeOrganizationId = primaryMembership?.organizationId || user.organizationId;
    }

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

router.get('/me', requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const userId = user.id;

    const activeOrgId = req.session?.activeOrganizationId || user.organizationId;
    let organization = null;
    if (activeOrgId) {
      organization = await storage.getOrganization(activeOrgId);
    }

    const memberships = await storage.getOrgMemberships(userId);
    const activeMembership = activeOrgId
      ? memberships.find(m => m.organizationId === activeOrgId)
      : null;

    const effectiveRole = user.role === 'platform_owner'
      ? 'platform_owner'
      : (activeMembership?.role || user.role);

    // Surface delegated-token status so the UI can render a Reconnect
    // Microsoft banner when the refresh token has been revoked.
    let graphTokenStatus: 'connected' | 'reauth_required' | 'none' = 'none';
    try {
      const { getUserGraphTokenStatus } = await import('./routes-entra');
      graphTokenStatus = await getUserGraphTokenStatus(userId);
    } catch (err: any) {
      console.warn('[Auth] Failed to compute graph token status:', err.message);
    }

    return res.json({
      user: { ...sanitizeUser(user), effectiveRole },
      organization,
      activeOrganizationId: activeOrgId,
      membershipCount: memberships.length,
      graphTokenStatus,
    });
  } catch (error: any) {
    console.error('[Auth] Get current user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const orgId = (req.activeOrganizationId || adminUser.organizationId) as string;
    if (!orgId) {
      return res.status(400).json({ error: 'No organization context' });
    }

    const orgUsers = await storage.getUsersByOrganization(orgId);
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

// BL-050: Consumes a `verificationToken` and marks the email verified.
// `/verify-email?token=...` is used by two flows that share the same column:
//   1. Self-signup verification (user already chose a password at /signup)
//   2. Invite acceptance (admin created the account with a placeholder
//      password the invitee doesn't know — they must set one before they
//      can sign in)
// Only the invite flow includes `mode=invite` on the URL (set by
// `sendUserInviteEmail`). When present we mint a short-lived password-set
// token — reusing `resetToken` / `resetTokenExpiry` so the existing
// `POST /api/auth/reset-password` endpoint redeems it unchanged — and the
// landing page collects a password and signs the user in. Without the
// marker, we just confirm verification and send the user to /login with
// the password they already chose.
router.post('/verify-email', async (req: AuthenticatedRequest, res) => {
  try {
    const { token, mode } = req.body as { token?: string; mode?: string };

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    const user = await storage.getUserByVerificationToken(token);
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification token' });
    }

    const isInvite = mode === 'invite';
    let passwordSetToken: string | null = null;

    if (isInvite) {
      passwordSetToken = generateToken();
      const passwordSetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000);
      await storage.updateUser(user.id, {
        emailVerified: true,
        verificationToken: null,
        resetToken: passwordSetToken,
        resetTokenExpiry: passwordSetTokenExpiry,
      });
    } else {
      await storage.updateUser(user.id, {
        emailVerified: true,
        verificationToken: null,
      });
    }

    await storage.createAuditEntry({
      userId: user.id,
      userEmail: user.email,
      action: 'EMAIL_VERIFIED',
      resource: 'user',
      resourceId: user.id,
      organizationId: user.organizationId || undefined,
      details: { flow: isInvite ? 'invite' : 'signup' },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json({
      success: true,
      email: user.email,
      name: user.name,
      passwordSetToken,
    });
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

    const { getUncachableSendGridClient } = await import('./services/sendgrid-client');
    try {
      await getUncachableSendGridClient();
    } catch (configErr: any) {
      console.warn('[Auth] Email service unavailable for password reset:', configErr.message);
      return res.status(503).json({
        error: 'EMAIL_SERVICE_UNAVAILABLE',
        message: 'Password reset email could not be delivered. Please try again later or contact your administrator.',
      });
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

      try {
        await sendPasswordResetEmail(user, resetToken);
      } catch (emailErr: any) {
        console.warn('[Auth] Failed to send password reset email:', emailErr.message);
      }
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

async function countActiveTenantAdmins(orgId: string): Promise<number> {
  const orgUsers = await storage.getUsersByOrganization(orgId);
  return orgUsers.filter(u => u.role === 'tenant_admin' && u.emailVerified).length;
}

router.post('/users/add', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const orgId = (req.activeOrganizationId || adminUser.organizationId) as string;
    if (!orgId) {
      return res.status(400).json({ error: 'No organization context' });
    }

    const { email, name, role, azureObjectId, azureTenantId } = req.body;

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

    const isEntraUser = !!azureObjectId;
    const tempPassword = generateToken().slice(0, 16);
    const hashedPassword = await hashPassword(tempPassword);
    const inviteToken = generateToken();

    const newUser = await storage.createUser({
      email: email.toLowerCase(),
      password: hashedPassword,
      name: name || null,
      role: assignedRole,
      organizationId: orgId,
      emailVerified: false,
      verificationToken: inviteToken,
      authProvider: isEntraUser ? 'entra' : 'local',
      azureObjectId: azureObjectId || null,
      azureTenantId: azureTenantId || null,
    });

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'USER_CREATED',
      resource: 'user',
      resourceId: newUser.id,
      organizationId: orgId,
      details: { targetEmail: email, assignedRole, createdBy: adminUser.email, isEntraUser },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    let inviteEmailSent = false;
    let inviteEmailError: string | undefined;
    try {
      const org = await storage.getOrganization(orgId);
      await sendUserInviteEmail(
        newUser,
        adminUser.name || adminUser.email,
        adminUser.email,
        org?.name || 'Zenith',
        inviteToken,
      );
      inviteEmailSent = true;
      await storage.createAuditEntry({
        userId: adminUser.id,
        userEmail: adminUser.email,
        action: 'USER_INVITE_SENT',
        resource: 'user',
        resourceId: newUser.id,
        organizationId: orgId,
        details: { targetEmail: email, sentBy: adminUser.email },
        result: 'SUCCESS',
        ipAddress: req.ip || null,
      });
    } catch (emailErr: any) {
      inviteEmailError = emailErr?.message || 'Email delivery failed';
      console.warn('[Auth] Failed to send invite email:', inviteEmailError);
    }

    return res.status(201).json({
      user: sanitizeUser(newUser),
      inviteEmailSent,
      inviteEmailError,
    });
  } catch (error: any) {
    console.error('[Auth] Add user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/users/:id/resend-invite', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const orgId = (req.activeOrganizationId || adminUser.organizationId) as string;
    if (!orgId) {
      return res.status(400).json({ error: 'No organization context' });
    }

    const targetUserId = req.params.id as string;
    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.organizationId !== orgId) {
      return res.status(403).json({ error: 'Cannot resend invite for users outside your organization' });
    }

    if (targetUser.emailVerified) {
      return res.status(400).json({ error: 'User already accepted their invitation' });
    }

    const newToken = generateToken();
    await storage.updateUser(targetUserId, { verificationToken: newToken });
    const refreshed = await storage.getUser(targetUserId);

    try {
      const org = await storage.getOrganization(orgId);
      await sendUserInviteEmail(
        refreshed!,
        adminUser.name || adminUser.email,
        adminUser.email,
        org?.name || 'Zenith',
        newToken,
      );
    } catch (emailErr: any) {
      console.warn('[Auth] Failed to resend invite email:', emailErr?.message);
      return res.status(503).json({
        error: 'EMAIL_SERVICE_UNAVAILABLE',
        message: 'Invite email could not be delivered. Please try again later.',
      });
    }

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'USER_INVITE_RESENT',
      resource: 'user',
      resourceId: targetUserId,
      organizationId: orgId,
      details: { targetEmail: targetUser.email, resentBy: adminUser.email },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('[Auth] Resend invite error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/users/search', requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    if (adminUser.role !== 'platform_owner') {
      return res.status(403).json({ error: 'Cross-organization user search is restricted to Platform Owners' });
    }

    const q = String(req.query.q || '').trim();
    if (q.length < 2) {
      return res.json({ users: [] });
    }

    const matches = await storage.searchUsersAcrossOrgs(q, 50);
    return res.json({ users: matches });
  } catch (error: any) {
    console.error('[Auth] Cross-org user search error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/users/:id/role', requireAuth(), requirePermission('users:manage'), async (req: AuthenticatedRequest, res) => {
  try {
    const adminUser = req.user!;
    const orgId = (req.activeOrganizationId || adminUser.organizationId) as string;
    const targetUserId = req.params.id as string;
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

    if (targetUser.organizationId !== orgId) {
      return res.status(403).json({ error: 'Cannot modify users outside your organization' });
    }

    if (targetUserId === adminUser.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Prevent demoting the last active tenant admin (only relevant if the user is currently active)
    if (targetUser.role === 'tenant_admin' && role !== 'tenant_admin' && targetUser.emailVerified) {
      const adminCount = await countActiveTenantAdmins(orgId);
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last Tenant Admin. Assign another Tenant Admin first.' });
      }
    }

    const previousRole = targetUser.role;
    const updated = await storage.updateUser(targetUserId, { role });

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'USER_ROLE_CHANGED',
      resource: 'user',
      resourceId: targetUserId,
      organizationId: orgId,
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
    const orgId = (req.activeOrganizationId || adminUser.organizationId) as string;
    const targetUserId = req.params.id as string;

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.organizationId !== orgId) {
      return res.status(403).json({ error: 'Cannot modify users outside your organization' });
    }

    if (targetUserId === adminUser.id) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    if (targetUser.role === 'platform_owner' && adminUser.role !== 'platform_owner') {
      return res.status(403).json({ error: 'Cannot deactivate a platform owner' });
    }

    // Prevent deactivating the last active tenant admin (only relevant if the user is currently active)
    if (targetUser.role === 'tenant_admin' && targetUser.emailVerified) {
      const adminCount = await countActiveTenantAdmins(orgId);
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot deactivate the last Tenant Admin. Assign another Tenant Admin first.' });
      }
    }

    const updated = await storage.updateUser(targetUserId, { emailVerified: false });

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'USER_DEACTIVATED',
      resource: 'user',
      resourceId: targetUserId,
      organizationId: orgId,
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
    const orgId = (req.activeOrganizationId || adminUser.organizationId) as string;
    const targetUserId = req.params.id as string;

    const targetUser = await storage.getUser(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.organizationId !== orgId) {
      return res.status(403).json({ error: 'Cannot modify users outside your organization' });
    }

    const updated = await storage.updateUser(targetUserId, { emailVerified: true });

    await storage.createAuditEntry({
      userId: adminUser.id,
      userEmail: adminUser.email,
      action: 'USER_REACTIVATED',
      resource: 'user',
      resourceId: targetUserId,
      organizationId: orgId,
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
