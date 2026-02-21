import { Router, Request, Response } from 'express';
import { ConfidentialClientApplication, CryptoProvider, AuthorizationCodeRequest } from '@azure/msal-node';
import { storage } from './storage';
import { encryptToken } from './utils/encryption';
import type { AuthenticatedRequest } from './middleware/rbac';
import { ZENITH_ROLES } from '@shared/schema';

const router = Router();
const cryptoProvider = new CryptoProvider();

const SCOPES = ['openid', 'profile', 'email', 'User.Read'];

function getBaseUrl(): string {
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
}

function getRedirectUri(): string {
  return `${getBaseUrl()}/auth/entra/callback`;
}

let msalClient: ConfidentialClientApplication | null = null;

function getMsalClient(): ConfidentialClientApplication | null {
  if (msalClient) return msalClient;

  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const tenantId = process.env.AZURE_TENANT_ID || 'common';

  if (!clientId || !clientSecret) {
    return null;
  }

  msalClient = new ConfidentialClientApplication({
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  });

  return msalClient;
}

router.get('/status', (_req: Request, res: Response) => {
  const configured = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
  return res.json({
    configured,
    tenantId: process.env.AZURE_TENANT_ID,
  });
});

router.get('/login', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const client = getMsalClient();
    if (!client) {
      return res.status(503).json({ error: 'Azure AD SSO is not configured' });
    }

    const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
    const state = cryptoProvider.createNewGuid();

    req.session.pkceVerifier = verifier;
    req.session.authState = state;

    const authUrl = await client.getAuthCodeUrl({
      scopes: SCOPES,
      redirectUri: getRedirectUri(),
      codeChallenge: challenge,
      codeChallengeMethod: 'S256',
      state,
    });

    return res.redirect(authUrl);
  } catch (error: any) {
    console.error('[Entra] Login error:', error);
    return res.status(500).json({ error: 'Failed to initiate SSO login' });
  }
});

router.get('/callback', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.redirect('/login?error=missing_params');
    }

    if (state !== req.session.authState) {
      return res.redirect('/login?error=state_mismatch');
    }

    const client = getMsalClient();
    if (!client) {
      return res.redirect('/login?error=sso_not_configured');
    }

    const tokenRequest: AuthorizationCodeRequest = {
      code: code as string,
      scopes: SCOPES,
      redirectUri: getRedirectUri(),
      codeVerifier: req.session.pkceVerifier,
    };

    const tokenResponse = await client.acquireTokenByCode(tokenRequest);

    const claims = tokenResponse.idTokenClaims as Record<string, any>;
    const email = (claims.preferred_username || claims.email || '') as string;
    const name = (claims.name || '') as string;
    const azureObjectId = (claims.oid || '') as string;
    const azureTenantId = (claims.tid || '') as string;

    if (!email) {
      return res.redirect('/login?error=no_email');
    }

    let user = await storage.getUserByEmail(email);

    if (user) {
      const updates: Record<string, any> = {
        authProvider: 'entra',
        lastLoginAt: new Date(),
      };
      if (!user.azureObjectId && azureObjectId) {
        updates.azureObjectId = azureObjectId;
      }
      if (!user.azureTenantId && azureTenantId) {
        updates.azureTenantId = azureTenantId;
      }
      await storage.updateUser(user.id, updates);
      user = (await storage.getUser(user.id))!;
    } else {
      const domain = email.split('@')[1].toLowerCase();
      const orgs = await storage.getOrganizations();
      let org = orgs.find(o => o.azureTenantId === azureTenantId) ||
                orgs.find(o => o.domain === domain);
      let isFirstUser = false;

      if (!org) {
        org = await storage.upsertOrganization({
          name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
          domain,
          servicePlan: 'TRIAL',
          azureTenantId: azureTenantId || undefined,
        });
        isFirstUser = true;
      } else {
        const orgUsers = await storage.getUsersByOrganization(org.id);
        isFirstUser = orgUsers.length === 0;
      }

      const role = isFirstUser ? ZENITH_ROLES.TENANT_ADMIN : ZENITH_ROLES.VIEWER;

      user = await storage.createUser({
        email,
        password: '',
        name: name || null,
        role,
        organizationId: org.id,
        emailVerified: true,
        authProvider: 'entra',
        azureObjectId: azureObjectId || null,
        azureTenantId: azureTenantId || null,
      });
    }

    if (tokenResponse.accessToken && user.organizationId) {
      try {
        const encryptedToken = encryptToken(tokenResponse.accessToken);
        await storage.upsertGraphToken({
          userId: user.id,
          organizationId: user.organizationId,
          service: 'graph',
          accessToken: encryptedToken,
          refreshToken: null,
          expiresAt: tokenResponse.expiresOn || null,
          scopes: tokenResponse.scopes || SCOPES,
        });
      } catch (err) {
        console.error('[Entra] Failed to store Graph token:', err);
      }
    }

    req.session.userId = user.id;
    delete req.session.pkceVerifier;
    delete req.session.authState;

    await storage.createAuditEntry({
      userId: user.id,
      userEmail: user.email,
      action: 'USER_LOGIN',
      resource: 'session',
      resourceId: user.id,
      organizationId: user.organizationId || undefined,
      details: { authProvider: 'entra', azureObjectId },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.redirect('/dashboard');
  } catch (error: any) {
    console.error('[Entra] Callback error:', error);
    return res.redirect('/login?error=sso_failed');
  }
});

router.post('/logout', (req: AuthenticatedRequest, res: Response) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[Entra] Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    const logoutUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/logout?post_logout_redirect_uri=${encodeURIComponent(getBaseUrl() + '/login')}`;
    return res.json({ logoutUrl });
  });
});

router.post('/check-policy', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const existingUser = await storage.getUserByEmail(email);

    const orgs = await storage.getOrganizations();
    let org = existingUser?.organizationId
      ? orgs.find(o => o.id === existingUser.organizationId)
      : orgs.find(o => o.domain === domain);

    return res.json({
      ssoEnabled: !!(org?.azureTenantId),
      enforceSso: org?.enforceSso || false,
      allowLocalAuth: org?.allowLocalAuth !== false,
      existingUser: !!existingUser,
      authProvider: existingUser?.authProvider || null,
    });
  } catch (error: any) {
    console.error('[Entra] Check policy error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
