import { Router, Request, Response } from 'express';
import { ConfidentialClientApplication, CryptoProvider, AuthorizationCodeRequest, AuthenticationResult } from '@azure/msal-node';
import { storage } from './storage';
import { encryptToken, decryptToken, isEncryptionConfigured } from './utils/encryption';
import type { AuthenticatedRequest } from './middleware/rbac';
import { requireAuth, requireRole } from './middleware/rbac';
import { ZENITH_ROLES } from '@shared/schema';
import { isPublicEmailDomain } from './utils/publicDomains';
import { getDefaultSignupPlan } from './utils/platformSettingsCache';

const router = Router();
const cryptoProvider = new CryptoProvider();

const SCOPES = ['openid', 'profile', 'email', 'User.Read', 'offline_access', 'RecordsManagement.Read.All', 'Group.ReadWrite.All'];

function getBaseUrl(): string {
  if (process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    const customDomain = domains.find(d => !d.endsWith('.replit.dev') && !d.endsWith('.replit.app'));
    if (customDomain) return `https://${customDomain}`;
    return `https://${domains[0]}`;
  }
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

export type UserTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: 'not_connected' | 'reauth_required' | 'transient' };

// Coalesces parallel refresh attempts per user so we never burn a refresh
// token by racing two requests against Entra.
const userTokenRefreshInflight = new Map<string, Promise<UserTokenResult>>();

// If the cached access token will expire within this window, treat it as
// already-expired and refresh proactively.
export const USER_TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

// Errors that mean the refresh token itself is bad/revoked; anything else is
// transient (network, throttling, etc.) and does not clear the stored row.
const REAUTH_REQUIRED_ERROR_CODES = new Set([
  'invalid_grant',
  'AADSTS50173', // refresh token expired due to credential change
  'AADSTS70008', // refresh token expired
  'AADSTS700082', // refresh token expired (long inactivity)
  'AADSTS50076', // MFA required
  'interaction_required',
  'consent_required',
  'login_required',
]);

function isReauthRequiredError(err: any): boolean {
  const msg: string = err?.errorCode || err?.message || '';
  return Array.from(REAUTH_REQUIRED_ERROR_CODES).some(code => msg.includes(code));
}

async function emitGraphTokenAudit(
  userId: string,
  organizationId: string | null | undefined,
  outcome: 'SUCCESS' | 'FAILURE',
  details: Record<string, any>,
): Promise<void> {
  try {
    await storage.createAuditEntry({
      userId,
      userEmail: null,
      action: outcome === 'SUCCESS' ? 'GRAPH_TOKEN_REFRESHED' : 'GRAPH_TOKEN_REFRESH_FAILED',
      resource: 'graph_token',
      resourceId: userId,
      organizationId: organizationId || null,
      tenantConnectionId: null,
      result: outcome,
      details,
      ipAddress: null,
    });
  } catch (err: any) {
    console.warn(`[Entra] Failed to write audit entry for user ${userId}: ${err.message}`);
  }
}

export async function refreshDelegatedTokenResult(userId: string): Promise<UserTokenResult> {
  const existing = userTokenRefreshInflight.get(userId);
  if (existing) return existing;

  const work = (async (): Promise<UserTokenResult> => {
    const client = getMsalClient();
    if (!client) return { ok: false, reason: 'not_connected' };

    const tokenRecord = await storage.getGraphToken(userId, 'graph');
    if (!tokenRecord) return { ok: false, reason: 'not_connected' };
    if (!tokenRecord.refreshToken) return { ok: false, reason: 'reauth_required' };

    try {
      const { decryptToken } = await import('./utils/encryption');
      const refreshToken = decryptToken(tokenRecord.refreshToken);

      const result: AuthenticationResult | null = await client.acquireTokenByRefreshToken({
        refreshToken,
        scopes: SCOPES.filter(s => s !== 'openid' && s !== 'profile' && s !== 'email' && s !== 'offline_access'),
      });

      if (result?.accessToken) {
        // MSAL Node does not surface the rotated refresh token on its public
        // AuthenticationResult type — it caches it internally. We attempt to
        // read it via an unchecked field for completeness; when absent we
        // keep the prior refresh token stored.
        const rotated = (result as unknown as { refreshToken?: string }).refreshToken;
        const refreshTokenToStore = rotated ? encryptToken(rotated) : tokenRecord.refreshToken;

        await storage.upsertGraphToken({
          userId,
          organizationId: tokenRecord.organizationId,
          service: 'graph',
          accessToken: encryptToken(result.accessToken),
          refreshToken: refreshTokenToStore,
          expiresAt: result.expiresOn || null,
          scopes: result.scopes || SCOPES,
        });

        console.log(`[Entra] Refreshed delegated token for user ${userId}`);
        await emitGraphTokenAudit(userId, tokenRecord.organizationId, 'SUCCESS', {
          service: 'graph',
          rotatedRefreshToken: !!rotated,
          expiresAt: result.expiresOn?.toISOString() || null,
        });
        return { ok: true, token: result.accessToken };
      }
      // MSAL returned without an access token but did not throw. Treat as
      // transient and emit a failure audit entry so the path is auditable.
      console.warn(`[Entra] Token refresh for user ${userId} returned no access token`);
      await emitGraphTokenAudit(userId, tokenRecord.organizationId, 'FAILURE', {
        service: 'graph',
        reauthRequired: false,
        errorCode: 'no_access_token',
        message: 'MSAL acquireTokenByRefreshToken returned without an access token',
      });
      return { ok: false, reason: 'transient' };
    } catch (err: any) {
      const reauthRequired = isReauthRequiredError(err);
      console.warn(`[Entra] Token refresh failed for user ${userId}: ${err.message}${reauthRequired ? ' (reauth required)' : ''}`);

      if (reauthRequired) {
        // Null the stored credentials but keep the row so /me reports
        // 'reauth_required' (a missing row reads as never-connected).
        try {
          await storage.markGraphTokenReauthRequired(userId, 'graph');
        } catch (delErr: any) {
          console.warn(`[Entra] Failed to mark graph token row for user ${userId} as reauth-required: ${delErr.message}`);
        }
      }

      await emitGraphTokenAudit(userId, tokenRecord.organizationId, 'FAILURE', {
        service: 'graph',
        reauthRequired,
        errorCode: err?.errorCode || null,
        message: err?.message?.slice(0, 500) || null,
      });
      return { ok: false, reason: reauthRequired ? 'reauth_required' : 'transient' };
    }
  })().finally(() => {
    userTokenRefreshInflight.delete(userId);
  });

  userTokenRefreshInflight.set(userId, work);
  return work;
}

/** Backwards-compatible wrapper. Returns the access token, or null on any failure. */
export async function refreshDelegatedToken(userId: string): Promise<string | null> {
  const r = await refreshDelegatedTokenResult(userId);
  return r.ok ? r.token : null;
}

/**
 * Returns a valid user-delegated Graph access token, refreshing proactively
 * when within the 5-minute expiry window. Server callers can branch on the
 * typed result to distinguish "never connected", "reauth required", and
 * "transient failure" without re-querying state.
 */
export async function getValidUserGraphTokenResult(userId: string): Promise<UserTokenResult> {
  const tokenRecord = await storage.getGraphToken(userId, 'graph');
  if (!tokenRecord) return { ok: false, reason: 'not_connected' };
  if (!tokenRecord.refreshToken) return { ok: false, reason: 'reauth_required' };

  const expiresAt = tokenRecord.expiresAt instanceof Date
    ? tokenRecord.expiresAt
    : tokenRecord.expiresAt ? new Date(tokenRecord.expiresAt) : null;

  const stillFresh = expiresAt && expiresAt.getTime() > Date.now() + USER_TOKEN_REFRESH_THRESHOLD_MS;
  if (stillFresh && tokenRecord.accessToken) {
    try {
      const { decryptToken } = await import('./utils/encryption');
      return { ok: true, token: decryptToken(tokenRecord.accessToken) };
    } catch (err: any) {
      console.warn(`[Entra] Failed to decrypt access token for user ${userId}, falling through to refresh: ${err.message}`);
    }
  }

  return refreshDelegatedTokenResult(userId);
}

/** Backwards-compatible wrapper. Returns the access token, or null on any failure. */
export async function getValidUserGraphToken(userId: string): Promise<string | null> {
  const r = await getValidUserGraphTokenResult(userId);
  return r.ok ? r.token : null;
}

/**
 * Whether the user currently has a usable refresh token. Used by /api/auth/me
 * so the UI can render a "reconnect Microsoft" banner.
 */
export async function getUserGraphTokenStatus(userId: string): Promise<'connected' | 'reauth_required' | 'none'> {
  const tokenRecord = await storage.getGraphToken(userId, 'graph');
  if (!tokenRecord) return 'none';
  if (!tokenRecord.refreshToken) return 'reauth_required';
  return 'connected';
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
          accessToken: encryptToken(result.accessToken),
          refreshToken: refreshTokenToStore,
          expiresAt: (result as any).expiresOn || tokenRecord.expiresAt,
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

// Public endpoint — no auth required so the login page can show the SSO button
router.get('/status', (_req: AuthenticatedRequest, res: Response) => {
  const configured = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
  return res.json({ configured });
});

// Auth-protected endpoint with full diagnostic detail for admin use
router.get('/status/detail', requireAuth(), (_req: AuthenticatedRequest, res: Response) => {
  const configured = !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
  return res.json({
    configured,
    tenantId: process.env.AZURE_TENANT_ID,
    hasClientId: !!process.env.AZURE_CLIENT_ID,
    hasClientSecret: !!process.env.AZURE_CLIENT_SECRET,
    hasTokenEncryptionSecret: !!process.env.TOKEN_ENCRYPTION_SECRET,
  });
});

router.post('/configure', requireAuth(), requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res: Response) => {
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

router.post('/test', requireAuth(), requireRole(ZENITH_ROLES.TENANT_ADMIN), async (_req: Request, res: Response) => {
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

        // BL-019: Verify Sites.ReadWrite.All has been admin-consented (i.e. an
        // appRoleAssignment exists from this app's service principal to the
        // Microsoft Graph service principal). A *declared* permission on the
        // application object is necessary but not sufficient — without admin
        // consent the archive/restore Graph calls return 403.
        try {
          const authHeaders = { Authorization: `Bearer ${tokenResult.accessToken}` };
          const [graphSpRes, ourSpRes] = await Promise.all([
            fetch(
              'https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId%20eq%20%2700000003-0000-0000-c000-000000000000%27&$select=id,appRoles',
              { headers: authHeaders },
            ),
            fetch(
              'https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId%20eq%20%27' + encodeURIComponent(clientId) + '%27&$select=id',
              { headers: authHeaders },
            ),
          ]);
          if (!graphSpRes.ok || !ourSpRes.ok) {
            checks.push({ step: 'Sites.ReadWrite.All', status: 'warn', message: 'Could not enumerate service principals to verify Sites.ReadWrite.All admin consent. Required for archive/restore (BL-019).' });
          } else {
            const graphSpData = await graphSpRes.json();
            const ourSpData = await ourSpRes.json();
            const graphSp = graphSpData.value?.[0];
            const ourSp = ourSpData.value?.[0];
            const sitesReadWriteId = (graphSp?.appRoles || []).find(
              (r: any) => r.value === 'Sites.ReadWrite.All',
            )?.id;
            if (!ourSp?.id) {
              checks.push({ step: 'Sites.ReadWrite.All', status: 'warn', message: 'No service principal found for this app in the tenant. Grant admin consent so Sites.ReadWrite.All takes effect (required for archive/restore — BL-019).' });
            } else if (!sitesReadWriteId || !graphSp?.id) {
              checks.push({ step: 'Sites.ReadWrite.All', status: 'warn', message: 'Could not resolve the Sites.ReadWrite.All app role from Microsoft Graph. Required for archive/restore (BL-019).' });
            } else {
              const assignRes = await fetch(
                `https://graph.microsoft.com/v1.0/servicePrincipals/${ourSp.id}/appRoleAssignments?$select=appRoleId,resourceId`,
                { headers: authHeaders },
              );
              if (!assignRes.ok) {
                checks.push({ step: 'Sites.ReadWrite.All', status: 'warn', message: 'Could not read app role assignments to verify Sites.ReadWrite.All admin consent. Required for archive/restore (BL-019).' });
              } else {
                const assignData = await assignRes.json();
                const assignments: any[] = assignData.value || [];
                const consented = assignments.some(
                  (a: any) => a.appRoleId === sitesReadWriteId && a.resourceId === graphSp.id,
                );
                if (consented) {
                  checks.push({ step: 'Sites.ReadWrite.All', status: 'pass', message: 'Sites.ReadWrite.All has been admin-consented — workspace archive/restore (BL-019) is enabled.' });
                } else {
                  checks.push({ step: 'Sites.ReadWrite.All', status: 'fail', message: 'Sites.ReadWrite.All is not admin-consented on this app. Workspace archive/restore (BL-019) will fail with 403 — declare the Application permission and click "Grant admin consent" in Entra.' });
                }
              }
            }
          }
        } catch (permErr: any) {
          checks.push({ step: 'Sites.ReadWrite.All', status: 'warn', message: `Could not verify Sites.ReadWrite.All admin consent: ${permErr.message}. Required for archive/restore (BL-019).` });
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

    if (!isEncryptionConfigured()) {
      console.error('[Entra] TOKEN_ENCRYPTION_SECRET is not configured — SSO state cannot be secured');
      return res.status(503).json({ error: 'SSO is not properly configured (missing encryption secret)' });
    }

    const { verifier, challenge } = await cryptoProvider.generatePkceCodes();
    const nonce = cryptoProvider.createNewGuid();

    const statePayload = encryptToken(JSON.stringify({ nonce, pkceVerifier: verifier }));
    const state = Buffer.from(statePayload).toString('base64url');

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

    let pkceVerifier: string;
    try {
      const stateJson = Buffer.from(state as string, 'base64url').toString('utf8');
      const statePayload = decryptToken(stateJson);
      const parsed = JSON.parse(statePayload);
      if (!parsed.pkceVerifier || typeof parsed.pkceVerifier !== 'string') {
        throw new Error('Missing pkceVerifier in state');
      }
      pkceVerifier = parsed.pkceVerifier;
    } catch (err) {
      console.error('[Entra] Failed to decode state:', err);
      return res.redirect('/login?error=invalid_state');
    }

    const client = getMsalClient();
    if (!client) {
      return res.redirect('/login?error=sso_not_configured');
    }

    const tokenRequest: AuthorizationCodeRequest = {
      code: code as string,
      scopes: SCOPES,
      redirectUri: getRedirectUri(),
      codeVerifier: pkceVerifier,
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

      // Tenant boundary: in the multi-tenant design each customer signs in
      // from their own Azure AD, so tid in the token is their own tenant ID.
      // Block login if the token's tid doesn't match what we have on record.
      if (user.azureTenantId && azureTenantId && user.azureTenantId !== azureTenantId) {
        console.warn(`[Entra] Tenant boundary: ${email} token tid ${azureTenantId} != stored ${user.azureTenantId}`);
        return res.redirect('/login?error=tenant_mismatch');
      }
      if (azureTenantId && user.organizationId) {
        const org = await storage.getOrganization(user.organizationId);
        if (org?.azureTenantId && org.azureTenantId !== azureTenantId) {
          console.warn(`[Entra] Tenant boundary: ${email} org tid ${org.azureTenantId} != token tid ${azureTenantId}`);
          return res.redirect('/login?error=tenant_mismatch');
        }
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
      // Primary: match by Azure tenant ID (each customer has their own AAD).
      // Fallback: email domain match (covers first-time setup before tid is stored).
      let org = !isPublicDomain
        ? (orgs.find(o => o.azureTenantId === azureTenantId) ||
           orgs.find(o => o.domain === domain ||
             (o.allowedDomains && o.allowedDomains.includes(domain))))
        : undefined;
      let isFirstUser = false;

      if (!org) {
        if (isPublicDomain) {
          const personalOrgName = name
            ? `${name}'s Workspace`
            : `${email.split('@')[0]}'s Workspace`;
          org = await storage.createOrganization({
            name: personalOrgName,
            domain: `personal-${email.split('@')[0].replace(/[^a-z0-9]/gi, '')}-${Date.now()}`,
            servicePlan: await getDefaultSignupPlan(),
          });
        } else {
          org = await storage.createOrganization({
            name: domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1),
            domain,
            servicePlan: await getDefaultSignupPlan(),
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
