import { Router, Request, Response } from 'express';
import { ConfidentialClientApplication, CryptoProvider, AuthorizationCodeRequest } from '@azure/msal-node';
import { storage } from './storage';
import { encryptToken, isEncryptionConfigured } from './utils/encryption';
import type { AuthenticatedRequest } from './middleware/rbac';
import { ZENITH_ROLES } from '@shared/schema';
import { isPublicEmailDomain } from './utils/publicDomains';

const router = Router();
const cryptoProvider = new CryptoProvider();

const SCOPES = ['openid', 'profile', 'email', 'User.Read', 'offline_access', 'RecordsManagement.Read.All', 'Group.ReadWrite.All'];

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

export async function refreshDelegatedToken(userId: string): Promise<string | null> {
  const client = getMsalClient();
  if (!client) return null;

  const tokenRecord = await storage.getGraphToken(userId, 'graph');
  if (!tokenRecord?.refreshToken) return null;

  try {
    const { decryptToken } = await import('./utils/encryption');
    const refreshToken = decryptToken(tokenRecord.refreshToken);

    const result = await (client as any).acquireTokenByRefreshToken({
      refreshToken,
      scopes: SCOPES.filter(s => s !== 'openid' && s !== 'profile' && s !== 'email' && s !== 'offline_access'),
    });

    if (result?.accessToken) {
      const tokenToStore = encryptToken(result.accessToken);
      const newRefreshToken = (result as any).refreshToken;
      const refreshTokenToStore = newRefreshToken ? encryptToken(newRefreshToken) : tokenRecord.refreshToken;

      await storage.upsertGraphToken({
        userId,
        organizationId: tokenRecord.organizationId,
        service: 'graph',
        accessToken: tokenToStore,
        refreshToken: refreshTokenToStore,
        expiresAt: result.expiresOn || null,
        scopes: result.scopes || SCOPES,
      });

      console.log(`[Entra] Refreshed delegated token for user ${userId}`);
      return result.accessToken;
    }
  } catch (err: any) {
    console.warn(`[Entra] Token refresh failed for user ${userId}: ${err.message}`);
  }

  return null;
}

export async function getDelegatedSpoToken(userId: string, spoHost: string): Promise<string | null> {
  const client = getMsalClient();
  if (!client) return null;

  const tokenRecord = await storage.getGraphToken(userId, 'graph');
  if (!tokenRecord?.refreshToken) return null;

  try {
    const { decryptToken } = await import('./utils/encryption');
    const refreshToken = decryptToken(tokenRecord.refreshToken);

    const result = await (client as any).acquireTokenByRefreshToken({
      refreshToken,
      scopes: [`https://${spoHost}/AllSites.FullControl`],
    });

    if (result?.accessToken) {
      if ((result as any).refreshToken) {
        const refreshTokenToStore = encryptToken((result as any).refreshToken);
        await storage.upsertGraphToken({
          userId,
          organizationId: tokenRecord.organizationId,
          service: 'graph',
          accessToken: tokenRecord.accessToken,
          refreshToken: refreshTokenToStore,
          expiresAt: tokenRecord.expiresAt,
          scopes: tokenRecord.scopes || SCOPES,
        });
      }
      console.log(`[Entra] Acquired delegated SPO token for user ${userId} on ${spoHost}`);
      return result.accessToken;
    }
  } catch (err: any) {
    console.warn(`[Entra] SPO token acquisition failed for user ${userId}: ${err.message}`);
  }

  return null;
}

router.get('/status', (_req: Request, res: Response) => {
  const configured = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
  return res.json({
    configured,
    tenantId: process.env.AZURE_TENANT_ID,
    hasClientId: !!process.env.AZURE_CLIENT_ID,
    hasClientSecret: !!process.env.AZURE_CLIENT_SECRET,
    hasTokenEncryptionSecret: !!process.env.TOKEN_ENCRYPTION_SECRET,
  });
});

router.post('/configure', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { clientId, clientSecret, tenantId, tokenEncryptionSecret } = req.body;

    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'Client ID and Client Secret are required' });
    }

    if (tokenEncryptionSecret && tokenEncryptionSecret.length < 32) {
      return res.status(400).json({ error: 'Token Encryption Secret must be at least 32 characters' });
    }

    process.env.AZURE_CLIENT_ID = clientId;
    process.env.AZURE_CLIENT_SECRET = clientSecret;
    process.env.AZURE_TENANT_ID = tenantId || 'common';
    if (tokenEncryptionSecret) {
      process.env.TOKEN_ENCRYPTION_SECRET = tokenEncryptionSecret;
    }

    msalClient = null;

    return res.json({
      success: true,
      message: 'Entra ID credentials saved to runtime. Add them as Replit Secrets for persistence across restarts.',
    });
  } catch (error: any) {
    console.error('[Entra] Configure error:', error);
    return res.status(500).json({ error: 'Failed to save configuration' });
  }
});

router.post('/test', async (_req: Request, res: Response) => {
  try {
    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    const tenantId = process.env.AZURE_TENANT_ID || 'common';

    const checks: { step: string; status: 'pass' | 'fail' | 'warn'; message: string }[] = [];

    if (!clientId) {
      checks.push({ step: 'Client ID', status: 'fail', message: 'AZURE_CLIENT_ID is not set' });
    } else {
      checks.push({ step: 'Client ID', status: 'pass', message: `Set (${clientId.substring(0, 8)}...)` });
    }

    if (!clientSecret) {
      checks.push({ step: 'Client Secret', status: 'fail', message: 'AZURE_CLIENT_SECRET is not set' });
    } else {
      checks.push({ step: 'Client Secret', status: 'pass', message: 'Set (hidden)' });
    }

    checks.push({ step: 'Tenant ID', status: 'pass', message: tenantId === 'common' ? 'Multi-tenant (common)' : tenantId });

    if (process.env.TOKEN_ENCRYPTION_SECRET) {
      checks.push({ step: 'Token Encryption', status: 'pass', message: 'Encryption key configured' });
    } else {
      checks.push({ step: 'Token Encryption', status: 'warn', message: 'Not set — Graph tokens will not be encrypted at rest' });
    }

    if (!clientId || !clientSecret) {
      return res.json({ success: false, checks, message: 'Missing required credentials' });
    }

    try {
      const testClient = new ConfidentialClientApplication({
        auth: {
          clientId,
          clientSecret,
          authority: `https://login.microsoftonline.com/${tenantId}`,
        },
      });

      const tokenResult = await testClient.acquireTokenByClientCredential({
        scopes: ['https://graph.microsoft.com/.default'],
      });

      if (tokenResult?.accessToken) {
        checks.push({ step: 'App Authentication', status: 'pass', message: 'Successfully acquired client credentials token from Entra ID' });

        try {
          const graphRes = await fetch('https://graph.microsoft.com/v1.0/organization', {
            headers: { Authorization: `Bearer ${tokenResult.accessToken}` },
          });

          if (graphRes.ok) {
            const orgData = await graphRes.json();
            const orgName = orgData.value?.[0]?.displayName || 'Unknown';
            checks.push({ step: 'Graph API Access', status: 'pass', message: `Connected to tenant: ${orgName}` });
          } else if (graphRes.status === 403) {
            checks.push({ step: 'Graph API Access', status: 'warn', message: 'Token acquired but Directory.Read.All permission may not be granted yet. Grant admin consent to enable inventory sync.' });
          } else {
            checks.push({ step: 'Graph API Access', status: 'warn', message: `Graph API returned ${graphRes.status}. Admin consent may be needed.` });
          }
        } catch (graphErr: any) {
          checks.push({ step: 'Graph API Access', status: 'warn', message: `Could not reach Graph API: ${graphErr.message}` });
        }

        msalClient = null;
        return res.json({ success: true, checks, message: 'App registration verified successfully' });
      } else {
        checks.push({ step: 'App Authentication', status: 'fail', message: 'No access token returned — check client credentials' });
        return res.json({ success: false, checks, message: 'Authentication failed' });
      }
    } catch (msalErr: any) {
      const errorMsg = msalErr.errorMessage || msalErr.message || 'Unknown error';
      checks.push({ step: 'App Authentication', status: 'fail', message: `Entra ID rejected credentials: ${errorMsg}` });
      return res.json({ success: false, checks, message: 'App registration verification failed' });
    }
  } catch (error: any) {
    console.error('[Entra] Test error:', error);
    return res.status(500).json({ error: 'Failed to test configuration' });
  }
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
      if (!user.emailVerified) {
        console.warn(`[Entra] Deactivated user attempted SSO login: ${email}`);
        return res.redirect('/login?error=account_deactivated');
      }

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
      const isPublicDomain = isPublicEmailDomain(email);
      const orgs = await storage.getOrganizations();
      let org = orgs.find(o => o.azureTenantId === azureTenantId) ||
                (!isPublicDomain ? orgs.find(o => o.domain === domain) : undefined);
      let isFirstUser = false;

      if (!org) {
        if (isPublicDomain) {
          const personalOrgName = name
            ? `${name}'s Workspace`
            : `${email.split('@')[0]}'s Workspace`;
          org = await storage.upsertOrganization({
            name: personalOrgName,
            domain: `personal-${email.split('@')[0].replace(/[^a-z0-9]/gi, '')}-${Date.now()}`,
            servicePlan: 'TRIAL',
          });
        } else {
          org = await storage.upsertOrganization({
            name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
            domain,
            servicePlan: 'TRIAL',
            azureTenantId: azureTenantId || undefined,
          });
        }
        isFirstUser = true;
      } else {
        if (org.inviteOnly) {
          return res.redirect('/login?error=invite_only');
        }

        if (org.allowedDomains && org.allowedDomains.length > 0) {
          if (!org.allowedDomains.includes(domain)) {
            return res.redirect('/login?error=domain_not_allowed');
          }
        }

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

      await storage.createOrgMembership({
        userId: user.id,
        organizationId: org.id,
        role,
        isPrimary: true,
      });
    }

    if (tokenResponse.accessToken && user.organizationId) {
      try {
        const tokenToStore = encryptToken(tokenResponse.accessToken);
        const encrypted = isEncryptionConfigured();

        let refreshTokenRaw: string | null = null;
        try {
          const cacheContents = client.getTokenCache().serialize();
          const cacheData = JSON.parse(cacheContents);
          const refreshTokens = cacheData.RefreshToken || {};
          const refreshTokenKeys = Object.keys(refreshTokens);
          if (refreshTokenKeys.length > 0) {
            refreshTokenRaw = refreshTokens[refreshTokenKeys[refreshTokenKeys.length - 1]]?.secret || null;
          }
        } catch (cacheErr) {
          console.warn('[Entra] Could not extract refresh token from cache:', cacheErr);
        }

        const refreshTokenToStore = refreshTokenRaw ? encryptToken(refreshTokenRaw) : null;
        console.log(`[Entra] Storing Graph token for user ${user.id} (encrypted: ${encrypted}, hasRefresh: ${!!refreshTokenRaw}, scopes: ${(tokenResponse.scopes || []).join(',')})`);
        await storage.upsertGraphToken({
          userId: user.id,
          organizationId: user.organizationId,
          service: 'graph',
          accessToken: tokenToStore,
          refreshToken: refreshTokenToStore,
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
      details: { authProvider: 'entra', azureObjectId },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    return res.redirect('/app/dashboard');
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
