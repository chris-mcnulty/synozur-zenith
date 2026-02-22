import { Router } from 'express';
import { storage } from './storage';
import { hashPassword, verifyPassword, generateToken } from './auth';
import { AuthenticatedRequest } from './middleware/rbac';
import { type User } from '@shared/schema';

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

    const orgs = await storage.getOrganizations();
    let org = orgs.find(o => o.domain === domain);
    let isFirstUser = false;

    if (!org) {
      const isBlocked = await storage.isDomainBlocked(domain);
      if (isBlocked) {
        return res.status(403).json({
          error: 'This email domain is not allowed for self-registration. Please contact your administrator to set up your organization.',
        });
      }

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
      details: { role, domain },
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

export default router;
