import { Router } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { testConnection, clearTokenCache, getAppToken, fetchSensitivityLabels, fetchRetentionLabels, fetchTenantVerifiedDomains } from "../services/graph";
import { checkTenantPermissions, REQUIRED_PERMISSIONS, PERMISSIONS_VERSION } from "../services/permissions";
import { METADATA_CATEGORIES, ZENITH_ROLES } from "@shared/schema";
import { getValidUserGraphToken } from "../routes-entra";
import { requireAuth, requireRole, requirePermission, type AuthenticatedRequest } from "../middleware/rbac";
import { encryptToken, decryptToken, isEncryptionConfigured, isEncrypted } from "../utils/encryption";
import { requireFeature } from "../services/feature-gate";
import { logAuditEvent, logAccessDenied, AUDIT_ACTIONS, type AuditAction } from "../services/audit-logger";
import { enableDataMasking, disableDataMasking } from "../services/data-masking-toggle";

const router = Router();

/**
 * Checks whether a Zenith org domain matches a set of Microsoft-verified tenant domains.
 *
 * Policy decision: we accept a match against ANY of the tenant's verified domains
 * (not just the primary/default). A tenant legitimately owns all its verified domains,
 * so matching any of them correctly proves ownership without being more restrictive
 * than necessary.  The onmicrosoft.com equivalence further handles the common case
 * where an org's Zenith domain is registered as "contoso.com" but the tenant's
 * primary domain is "contoso.onmicrosoft.com".
 *
 * Supports:
 *  - Exact match: "contoso.com" ↔ any verified domain (e.g., "contoso.com")
 *  - onmicrosoft.com equivalence: "contoso.com" ↔ "contoso.onmicrosoft.com"
 *    (only for simple 2-label org domains to prevent "acme.evil.com" from matching "acme")
 *
 * Empty/blank orgDomain is always treated as no-match (callers guard with `if (domain)` check).
 */
function trialDomainMatches(orgDomain: string, verifiedDomains: string[]): boolean {
  const orgNorm = orgDomain.toLowerCase().trim();
  if (!orgNorm) return false; // empty org domain is never a valid match

  // 1. Exact match with any verified domain
  if (verifiedDomains.some(d => d === orgNorm)) return true;

  // 2. onmicrosoft.com equivalence — only if org domain is a simple 2-label domain (e.g., "contoso.com")
  //    "acme.evil.com" has 3 labels and must NOT match "acme.onmicrosoft.com"
  const orgParts = orgNorm.split('.');
  if (orgParts.length === 2) {
    const orgBase = orgParts[0];
    for (const d of verifiedDomains) {
      const m = d.match(/^([^.]+)\.onmicrosoft\.com$/);
      if (m && m[1] === orgBase) return true;
    }
  }

  return false;
}

function getEffectiveClientSecret(conn: { clientSecret?: string | null }): string | undefined {
  if (conn.clientSecret) {
    try {
      return decryptToken(conn.clientSecret);
    } catch {
      return conn.clientSecret;
    }
  }
  return process.env.AZURE_CLIENT_SECRET || undefined;
}

async function getDelegatedTokenForRetention(currentUserId?: string, organizationId?: string): Promise<string | null> {
  // getValidUserGraphToken applies the 5-minute proactive refresh threshold
  // and the per-user concurrency lock.
  if (currentUserId) {
    const token = await getValidUserGraphToken(currentUserId);
    if (token) return token;
  }

  if (organizationId) {
    const { db } = await import("../db");
    const { graphTokens } = await import("@shared/schema");
    const { eq, and, isNotNull } = await import("drizzle-orm");
    const orgTokens = await db.select().from(graphTokens)
      .where(and(
        eq(graphTokens.organizationId, organizationId),
        eq(graphTokens.service, "graph"),
        isNotNull(graphTokens.refreshToken),
      ))
      .limit(5);
    for (const t of orgTokens) {
      const token = await getValidUserGraphToken(t.userId);
      if (token) return token;
    }
  }

  return null;
}

// ── Tenant Connections ──
router.get("/api/admin/tenants", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  const orgId = req.activeOrganizationId || req.user?.organizationId;
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;

  // Load own-org connections
  const ownConnections = orgId
    ? await storage.getTenantConnections(orgId)
    : await storage.getTenantConnections(undefined);

  type EnrichedConnection = typeof ownConnections[0] & { mspAccessDenied?: boolean; isGrantedAccess?: boolean };
  const filtered: EnrichedConnection[] = [];

  // Add own-org tenants
  for (const c of ownConnections) {
    if (c.organizationId === orgId) {
      filtered.push(c);
    } else if (isPlatformOwner && !orgId) {
      filtered.push(c);
    }
  }

  // Add cross-org tenants the active org has been granted access to
  // Check both the legacy msp_access_grants table and the newer tenant_access_grants table
  if (orgId) {
    const grantedConnIds = new Set<string>();

    // Legacy MSP access grants
    const legacyGrants = await storage.getActiveMspGrantsForGrantee(orgId);
    for (const g of legacyGrants) grantedConnIds.add(g.tenantConnectionId);

    // New tenant_access_grants (created by validateAndRedeemAccessCode)
    const newGrantedIds = await storage.getGrantedTenantConnectionIds(orgId);
    for (const id of newGrantedIds) grantedConnIds.add(id);

    for (const connId of grantedConnIds) {
      const alreadyIncluded = filtered.some(f => f.id === connId);
      if (!alreadyIncluded) {
        const conn = await storage.getTenantConnection(connId);
        if (conn) {
          filtered.push({ ...conn, isGrantedAccess: true });
        }
      }
    }
  }

  const safe = filtered.map(c => ({
    ...c,
    clientSecret: undefined,
    clientId: c.clientId ? `${c.clientId.substring(0, 8)}...` : undefined,
  }));
  res.json(safe);
});

router.get("/api/admin/tenants/consent/initiate", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const clientId = process.env.AZURE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: "Zenith Entra app is not configured. Set AZURE_CLIENT_ID first." });
  }

  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({ error: "You must be logged in to connect a tenant." });
  }

  const user = await storage.getUser(userId);
  if (!user || !user.organizationId) {
    await logAccessDenied(req as AuthenticatedRequest, "tenant_connection", null, "User has no organization — cannot initiate tenant consent");
    return res.status(403).json({ error: "You must belong to an organization to connect a tenant." });
  }

  const { tenantDomain, ownershipType, adminEmail, returnTo } = req.query;
  if (!tenantDomain) {
    return res.status(400).json({ error: "tenantDomain query parameter is required" });
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  (req.session as any).consentNonce = nonce;
  (req.session as any).consentOrgId = user.organizationId;

  let baseUrl: string;
  if (process.env.REPLIT_DOMAINS) {
    const domains = process.env.REPLIT_DOMAINS.split(',');
    const customDomain = domains.find(d => !d.endsWith('.replit.dev') && !d.endsWith('.replit.app'));
    baseUrl = `https://${customDomain || domains[0]}`;
  } else {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    baseUrl = `${protocol}://${host}`;
  }
  const redirectUri = `${baseUrl}/api/admin/tenants/consent/callback`;

  const allowedReturnPaths = ['/app/admin/tenants', '/app/add-tenant'];
  const safeReturnTo = returnTo && allowedReturnPaths.includes(String(returnTo))
    ? String(returnTo)
    : '/app/admin/tenants';

  const state = Buffer.from(JSON.stringify({
    tenantDomain,
    ownershipType: ownershipType || 'MSP',
    nonce,
    returnTo: safeReturnTo,
  })).toString('base64url');

  const tenantAuthority = tenantDomain || 'organizations';
  let consentUrl = `https://login.microsoftonline.com/${tenantAuthority}/adminconsent?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  if (adminEmail) {
    consentUrl += `&login_hint=${encodeURIComponent(String(adminEmail))}`;
  }

  res.json({ consentUrl });
});

// This callback must remain public: it is the OAuth redirect URI registered with Azure AD.
// Security is enforced by CSRF nonce validation (consentNonce in session must match state.nonce).
router.get("/api/admin/tenants/consent/callback", async (req, res) => {
  const { admin_consent, tenant, state, error, error_description } = req.query;

  if (error) {
    console.error('[Consent] Admin consent error:', error, error_description);
    return res.redirect(`/app/admin/tenants?consent_error=${encodeURIComponent(String(error_description || error))}`);
  }

  if (admin_consent !== 'True' || !tenant || !state) {
    return res.redirect('/app/admin/tenants?consent_error=Consent+was+not+granted');
  }

  let stateData: any = {};
  try {
    stateData = JSON.parse(Buffer.from(String(state), 'base64url').toString());
  } catch {
    return res.redirect('/app/admin/tenants?consent_error=Invalid+state+parameter.+Please+try+again.');
  }

  const returnTo = stateData.returnTo || '/app/admin/tenants';

  try {
    const sessionNonce = (req.session as any)?.consentNonce;
    const sessionOrgId = (req.session as any)?.consentOrgId;

    if (!sessionNonce || sessionNonce !== stateData.nonce) {
      console.warn('[Consent] Nonce mismatch — session may have been lost between initiate and callback.');
      return res.redirect(`${returnTo}?consent_error=Your+session+expired+during+consent.+Please+try+again.`);
    }

    delete (req.session as any).consentNonce;
    delete (req.session as any).consentOrgId;

    const tenantIdStr = String(tenant);
    const domain = stateData.tenantDomain || tenantIdStr;
    const ownershipType = stateData.ownershipType || 'MSP';
    const organizationId = sessionOrgId || null;

    const envClientId = process.env.AZURE_CLIENT_ID;
    if (envClientId) clearTokenCache(tenantIdStr, envClientId);

    const existing = (await storage.getTenantConnections()).find(
      c => c.tenantId === tenantIdStr && c.organizationId === organizationId
    );
    if (existing) {
      await storage.updateTenantConnection(existing.id, {
        consentGranted: true,
        status: 'ACTIVE',
      });
      await logAuditEvent(req as AuthenticatedRequest, {
        action: AUDIT_ACTIONS.TENANT_REACTIVATED,
        resource: 'tenant_connection',
        resourceId: existing.id,
        organizationId,
        tenantConnectionId: existing.id,
        details: { tenantName: existing.tenantName, domain: existing.domain, op: 'consent_callback', reconsent: true },
      });
      return res.redirect(`${returnTo}?consent_success=true`);
    }

    // Trial plan enforcement: tenant count and domain-match
    if (organizationId) {
      const orgForTrialCheck = await storage.getOrganization(organizationId);
      if (orgForTrialCheck?.servicePlan === 'TRIAL') {
        const existingConns = await storage.getTenantConnections(organizationId);
        if (existingConns.length >= 1) {
          return res.redirect(`${returnTo}?consent_error=${encodeURIComponent("Your Trial plan is limited to one tenant connection. Upgrade your plan to add more tenants.")}`);
        }
        if (orgForTrialCheck.domain) {
          // Fetch actual verified domains using only trusted app (env) credentials — never use caller-supplied creds
          const envClientId = process.env.AZURE_CLIENT_ID!;
          const envClientSecret = process.env.AZURE_CLIENT_SECRET!;
          const domainResult = await fetchTenantVerifiedDomains(tenantIdStr, envClientId, envClientSecret).catch(() => ({ domains: [], initialDomain: null }));
          if (domainResult.domains.length === 0) {
            // Fail closed — cannot verify tenant ownership without domain data
            console.warn(`[trial-domain] Could not verify domains for tenant ${tenantIdStr} — blocking as fail-safe`);
            return res.redirect(`${returnTo}?consent_error=${encodeURIComponent("Domain verification failed. Please try again or contact support if this persists.")}`);
          }
          if (!trialDomainMatches(orgForTrialCheck.domain, domainResult.domains)) {
            console.warn(`[trial-domain] Org domain "${orgForTrialCheck.domain}" does not match tenant verified domains: ${domainResult.domains.join(', ')}`);
            return res.redirect(`${returnTo}?consent_error=${encodeURIComponent("Trial plan is limited to your own domain. The tenant domain must match your organization's registered domain.")}`);
          }
        }
      }
    }

    let tenantName = domain.split('.')[0];
    const clientId = process.env.AZURE_CLIENT_ID!;
    const clientSecret = process.env.AZURE_CLIENT_SECRET!;

    try {
      const result = await testConnection(tenantIdStr, clientId, clientSecret);
      if (result.success && result.tenantName) {
        tenantName = result.tenantName;
      }
    } catch {}

    const newConn = await storage.createTenantConnection({
      tenantId: tenantIdStr,
      tenantName,
      domain,
      ownershipType,
      organizationId,
      consentGranted: true,
      status: 'ACTIVE',
    });
    await logAuditEvent(req as AuthenticatedRequest, {
      action: AUDIT_ACTIONS.TENANT_REGISTERED,
      resource: 'tenant_connection',
      resourceId: newConn.id,
      organizationId,
      tenantConnectionId: newConn.id,
      details: { tenantName, domain, ownershipType, op: 'consent_callback' },
    });

    return res.redirect(`${returnTo}?consent_success=true`);
  } catch (err: any) {
    console.error('[Consent] Callback processing error:', err);
    return res.redirect(`${returnTo}?consent_error=${encodeURIComponent(err.message)}`);
  }
});

router.get("/api/admin/tenants/:id", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  const connection = await storage.getTenantConnection(req.params.id);
  if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  const orgId = req.activeOrganizationId || req.user?.organizationId;

  if (!isPlatformOwner && connection.organizationId !== orgId) {
    if (connection.installMode === "CUSTOMER") {
      const grant = orgId ? await storage.getActiveMspGrantForOrg(connection.id, orgId) : null;
      if (!grant) {
        await logAccessDenied(req, "tenant_connection", connection.id, "No active MSP grant for caller organization");
        return res.status(403).json({
          reason: "MSP_ACCESS_DENIED",
          tenantId: connection.tenantId,
          tenantName: connection.tenantName,
          tenantConnectionId: connection.id,
        });
      }
    } else {
      await logAccessDenied(req, "tenant_connection", connection.id, "Tenant connection belongs to a different organization");
      return res.status(404).json({ message: "Tenant connection not found" });
    }
  }

  res.json({ ...connection, clientSecret: undefined });
});

router.post("/api/admin/tenants", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const { tenantId, tenantName, domain, ownershipType, clientId, clientSecret } = req.body;
  if (!tenantId || !domain) {
    return res.status(400).json({ message: "tenantId and domain are required" });
  }

  // Trial plan enforcement: tenant count and domain-match
  const orgIdForTrialCheck = req.user?.organizationId;
  if (orgIdForTrialCheck) {
    const orgForTrialCheck = await storage.getOrganization(orgIdForTrialCheck);
    if (orgForTrialCheck?.servicePlan === 'TRIAL') {
      const existingConns = await storage.getTenantConnections(orgIdForTrialCheck);
      if (existingConns.length >= 1) {
        await logAccessDenied(req, "tenant_connection", null, "Trial plan limited to one tenant connection", { plan: "TRIAL", tenantId });
        return res.status(403).json({ message: "Your Trial plan is limited to one tenant connection. Upgrade your plan to add more tenants." });
      }
      if (orgForTrialCheck.domain) {
        // Always use trusted app (env) credentials — never use caller-supplied credentials for domain verification
        const envClientId = process.env.AZURE_CLIENT_ID!;
        const envClientSecret = process.env.AZURE_CLIENT_SECRET!;
        const domainResult = await fetchTenantVerifiedDomains(tenantId as string, envClientId, envClientSecret).catch(() => ({ domains: [], initialDomain: null }));
        if (domainResult.domains.length === 0) {
          // Fail closed — cannot verify tenant ownership without domain data
          console.warn(`[trial-domain] Could not verify domains for tenant ${tenantId} — blocking as fail-safe`);
          return res.status(503).json({ message: "Domain verification failed. Please try again or contact support if this persists." });
        }
        if (!trialDomainMatches(orgForTrialCheck.domain, domainResult.domains)) {
          console.warn(`[trial-domain] Org domain "${orgForTrialCheck.domain}" does not match tenant verified domains: ${domainResult.domains.join(', ')}`);
          await logAccessDenied(req, "tenant_connection", null, "Trial plan domain mismatch", { plan: "TRIAL", orgDomain: orgForTrialCheck.domain, tenantDomains: domainResult.domains });
          return res.status(403).json({ message: "Trial plan is limited to your own domain. The tenant domain must match your organization's registered domain." });
        }
      }
    }
  }

  const encryptedSecret = clientSecret && isEncryptionConfigured() && !isEncrypted(clientSecret)
    ? encryptToken(clientSecret)
    : clientSecret || undefined;
  const connection = await storage.createTenantConnection({
    tenantId,
    tenantName: tenantName || domain.split('.')[0],
    domain,
    ownershipType: ownershipType || 'MSP',
    organizationId: req.user?.organizationId || null,
    status: 'PENDING',
    consentGranted: false,
    clientId: clientId || undefined,
    clientSecret: encryptedSecret,
  });

  await logAuditEvent(req, {
    action: AUDIT_ACTIONS.TENANT_REGISTERED,
    resource: 'tenant_connection',
    resourceId: connection.id,
    tenantConnectionId: connection.id,
    details: { tenantName: connection.tenantName, domain: connection.domain, ownershipType: connection.ownershipType },
  });

  res.status(201).json({ ...connection, clientSecret: undefined });
});

router.patch("/api/admin/tenants/:id", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const existing = await storage.getTenantConnection(req.params.id);
  if (!existing) return res.status(404).json({ message: "Tenant connection not found" });
  if (req.user?.role !== ZENITH_ROLES.PLATFORM_OWNER && existing.organizationId !== req.user?.organizationId) {
    await logAccessDenied(req, "tenant_connection", String(req.params.id), "Tenant connection belongs to a different organization");
    return res.status(404).json({ message: "Tenant connection not found" });
  }
  const updates = { ...req.body };
  if (updates.clientSecret && isEncryptionConfigured() && !isEncrypted(updates.clientSecret)) {
    updates.clientSecret = encryptToken(updates.clientSecret);
  }
  const connection = await storage.updateTenantConnection(req.params.id, updates);
  if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

  // Audit any meaningful field change. clientSecret values are masked.
  const AUDITABLE_FIELDS = [
    "status", "tenantName", "domain", "displayName", "clientId", "clientSecret",
    "organizationId", "ownerUserId", "isMspManaged", "consentedScopes", "notes",
    "consentStatus", "consentTenantId",
  ] as const;
  type AuditableField = typeof AUDITABLE_FIELDS[number];
  const body = req.body as Partial<Record<AuditableField, unknown>>;
  const existingRecord = existing as unknown as Record<AuditableField, unknown>;
  const changedFields: Record<string, { from: unknown; to: unknown }> = {};
  for (const f of AUDITABLE_FIELDS) {
    if (f in body && body[f] !== existingRecord[f]) {
      changedFields[f] = {
        from: f === "clientSecret" ? "***" : existingRecord[f],
        to: f === "clientSecret" ? "***" : body[f],
      };
    }
  }

  if ('status' in req.body && req.body.status !== existing.status) {
    const statusActionMap: Record<string, AuditAction> = {
      ACTIVE: AUDIT_ACTIONS.TENANT_REACTIVATED,
      SUSPENDED: AUDIT_ACTIONS.TENANT_SUSPENDED,
      REVOKED: AUDIT_ACTIONS.TENANT_REVOKED,
    };
    const action = statusActionMap[req.body.status as string] || AUDIT_ACTIONS.TENANT_UPDATED;
    await logAuditEvent(req, {
      action,
      resource: 'tenant_connection',
      resourceId: String(req.params.id),
      tenantConnectionId: String(req.params.id),
      details: { tenantName: existing.tenantName, previousStatus: existing.status, newStatus: req.body.status, changedFields },
    });
  } else if (Object.keys(changedFields).length > 0) {
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.TENANT_UPDATED,
      resource: 'tenant_connection',
      resourceId: String(req.params.id),
      tenantConnectionId: String(req.params.id),
      details: { tenantName: existing.tenantName, changedFields },
    });
  }

  res.json({ ...connection, clientSecret: undefined });
});

router.get("/api/admin/tenants/:id/deletion-summary", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const conn = await storage.getTenantConnection(req.params.id);
  if (!conn) {
    return res.status(404).json({ message: "Tenant connection not found" });
  }
  if (req.user?.role !== ZENITH_ROLES.PLATFORM_OWNER && conn.organizationId !== req.user?.organizationId) {
    return res.status(404).json({ message: "Tenant connection not found" });
  }
  const summary = await storage.getTenantConnectionDeletionSummary(req.params.id);
  res.json({ tenantName: conn.tenantName, domain: conn.domain, summary });
});

router.delete("/api/admin/tenants/:id", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const conn = await storage.getTenantConnection(req.params.id);
  if (conn && req.user?.role !== ZENITH_ROLES.PLATFORM_OWNER && conn.organizationId !== req.user?.organizationId) {
    return res.status(404).json({ message: "Tenant connection not found" });
  }
  if (conn) {
    const summary = await storage.getTenantConnectionDeletionSummary(req.params.id);
    const auditDetails = {
      tenantId: conn.tenantId,
      tenantName: conn.tenantName,
      domain: conn.domain,
      dataPurged: summary,
    };
    try {
      await storage.deleteTenantConnection(req.params.id);
      await storage.createAuditEntry({
        userId: req.user?.id ?? null,
        userEmail: req.user?.email ?? null,
        action: "TENANT_DELETED",
        resource: "tenant_connection",
        resourceId: req.params.id,
        organizationId: req.user?.organizationId ?? conn.organizationId ?? null,
        tenantConnectionId: null,
        details: auditDetails,
        result: "SUCCESS",
      });
      const cid = conn.clientId || process.env.AZURE_CLIENT_ID;
      if (cid) clearTokenCache(conn.tenantId, cid);
    } catch (err) {
      await storage.createAuditEntry({
        userId: req.user?.id ?? null,
        userEmail: req.user?.email ?? null,
        action: "TENANT_DELETED",
        resource: "tenant_connection",
        resourceId: req.params.id,
        organizationId: req.user?.organizationId ?? conn.organizationId ?? null,
        tenantConnectionId: null,
        details: { ...auditDetails, error: String(err) },
        result: "FAILURE",
      });
      throw err;
    }
  } else {
    await storage.deleteTenantConnection(req.params.id);
  }
  res.status(204).send();
});

router.post("/api/admin/tenants/test", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const { tenantId } = req.body;
  const clientId = req.body.clientId || process.env.AZURE_CLIENT_ID;
  const clientSecret = req.body.clientSecret || process.env.AZURE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) {
    return res.status(400).json({ message: "tenantId is required, and Zenith app credentials must be configured" });
  }
  const result = await testConnection(tenantId, clientId, clientSecret);
  res.json(result);
});

// ── Permission Health ──
router.get("/api/admin/tenants/:id/permissions", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    if (!(await verifyTenantAccess(req, conn))) {
      await logAccessDenied(req, "tenant_connection", conn.id, "verifyTenantAccess failed (permissions check)");
      return res.status(403).json({ error: "You do not have access to this tenant connection" });
    }

    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(503).json({ error: "Zenith Entra app credentials not configured" });
    }

    const token = await getAppToken(conn.tenantId, clientId, clientSecret);
    if (!token) {
      return res.status(500).json({ error: "Failed to acquire app token for tenant" });
    }

    const result = await checkTenantPermissions(token, clientId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/tenants/permissions/manifest", requireAuth(), (_req: AuthenticatedRequest, res) => {
  res.json({
    version: PERMISSIONS_VERSION,
    permissions: REQUIRED_PERMISSIONS,
  });
});

router.get("/api/admin/tenants/:id/reconsent", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    if (!(await verifyTenantAccess(req, conn))) {
      await logAccessDenied(req, "tenant_connection", conn.id, "verifyTenantAccess failed (reconsent)");
      return res.status(403).json({ error: "You do not have access to this tenant connection" });
    }

    const clientId = process.env.AZURE_CLIENT_ID;
    if (!clientId) {
      return res.status(503).json({ error: "Zenith Entra app is not configured. Set AZURE_CLIENT_ID first." });
    }

    const userId = req.session?.userId;
    if (!userId) {
      return res.status(401).json({ error: "You must be logged in." });
    }

    const nonce = crypto.randomBytes(16).toString('hex');
    (req.session as any).consentNonce = nonce;
    (req.session as any).consentOrgId = conn.organizationId;

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    const redirectUri = `${baseUrl}/api/admin/tenants/consent/callback`;

    const state = Buffer.from(JSON.stringify({
      tenantDomain: conn.domain,
      ownershipType: conn.ownershipType || 'MSP',
      nonce,
      isReconsent: true,
    })).toString('base64url');

    const consentUrl = `https://login.microsoftonline.com/common/adminconsent?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.json({ consentUrl, tenantDomain: conn.domain });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Data Dictionaries (tenant-owned, shared across orgs) ──
router.get("/api/admin/tenants/:tenantConnectionId/data-dictionaries", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      const grant = orgId ? await storage.getActiveTenantAccessGrant(conn.id, orgId) : null;
      if (!grant) {
        await logAccessDenied(req, "tenant_connection", conn.id, "No active tenant access grant for caller organization");
        return res.status(403).json({ error: "Access denied" });
      }
    }
    const { category } = req.query;
    if (category && typeof category === "string") {
      const entries = await storage.getDataDictionary(conn.tenantId, category);
      return res.json(entries);
    }
    const entries = await storage.getAllDataDictionaries(conn.tenantId);
    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/tenants/:tenantConnectionId/data-dictionaries", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Caller organization has no access to tenant");
      return res.status(403).json({ error: "Access denied" });
    }
    const { category, value } = req.body;
    if (!category || !value || typeof category !== "string" || typeof value !== "string" || !value.trim()) {
      return res.status(400).json({ error: "category and value are required" });
    }
    const ALLOWED_CATEGORIES = [...METADATA_CATEGORIES, "required_metadata_field"];
    if (!ALLOWED_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(", ")}` });
    }
    const existing = await storage.getDataDictionary(conn.tenantId, category);
    if (existing.some(e => e.value.toLowerCase() === value.trim().toLowerCase())) {
      return res.status(409).json({ error: `"${value.trim()}" already exists in ${category}` });
    }
    const entry = await storage.createDataDictionaryEntry({
      tenantId: conn.tenantId,
      category,
      value: value.trim(),
    });
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.DATA_DICTIONARY_ENTRY_CREATED,
      resource: 'data_dictionary',
      resourceId: entry.id,
      tenantConnectionId: conn.id,
      details: { category, value: value.trim() },
    });
    res.status(201).json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/admin/tenants/:tenantConnectionId/data-dictionaries/:entryId", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Caller organization has no access to tenant");
      return res.status(403).json({ error: "Access denied" });
    }
    const entry = await storage.getDataDictionaryEntry(req.params.entryId);
    if (!entry || entry.tenantId !== conn.tenantId) {
      return res.status(404).json({ error: "Data dictionary entry not found" });
    }
    await storage.deleteDataDictionaryEntry(req.params.entryId);
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.DATA_DICTIONARY_ENTRY_DELETED,
      resource: 'data_dictionary',
      resourceId: req.params.entryId,
      tenantConnectionId: conn.id,
      details: { category: entry.category, value: entry.value },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Required Metadata Fields (tenant-owned config) ──
const CONFIGURABLE_METADATA_FIELDS = [
  { field: "department", label: "Department", description: "Business department or team assignment" },
  { field: "costCenter", label: "Cost Center", description: "Financial cost center code" },
  { field: "projectCode", label: "Project Code", description: "Project or engagement code" },
  { field: "description", label: "Description", description: "Workspace description or purpose" },
  { field: "sensitivityLabelId", label: "Sensitivity Label (Purview)", description: "Microsoft Purview sensitivity label" },
];

router.get("/api/admin/tenants/:tenantConnectionId/required-metadata", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const entries = await storage.getDataDictionary(conn.tenantId, "required_metadata_field");
    const requiredFields = entries.map(e => e.value);
    res.json({
      availableFields: CONFIGURABLE_METADATA_FIELDS,
      requiredFields,
      entries,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/api/admin/tenants/:tenantConnectionId/required-metadata", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Caller organization has no access to tenant");
      return res.status(403).json({ error: "Access denied" });
    }
    const { requiredFields } = req.body;
    if (!Array.isArray(requiredFields)) {
      return res.status(400).json({ error: "requiredFields must be an array of field names" });
    }
    const validFieldNames = CONFIGURABLE_METADATA_FIELDS.map(f => f.field);
    const invalid = requiredFields.filter((f: string) => !validFieldNames.includes(f));
    if (invalid.length > 0) {
      return res.status(400).json({ error: `Invalid field names: ${invalid.join(", ")}` });
    }

    const existingEntries = await storage.getDataDictionary(conn.tenantId, "required_metadata_field");
    const existingFields = existingEntries.map(e => e.value);

    const toRemove = existingEntries.filter(e => !requiredFields.includes(e.value));
    const toAdd = requiredFields.filter((f: string) => !existingFields.includes(f));

    for (const entry of toRemove) {
      await storage.deleteDataDictionaryEntry(entry.id);
    }

    for (const field of toAdd) {
      await storage.createDataDictionaryEntry({
        tenantId: conn.tenantId,
        category: "required_metadata_field",
        value: field,
      });
    }

    const updatedEntries = await storage.getDataDictionary(conn.tenantId, "required_metadata_field");
    if (toAdd.length > 0 || toRemove.length > 0) {
      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.REQUIRED_METADATA_UPDATED,
        resource: 'tenant_connection',
        resourceId: conn.id,
        tenantConnectionId: conn.id,
        details: { added: toAdd, removed: toRemove.map(e => e.value), final: requiredFields },
      });
    }
    res.json({
      availableFields: CONFIGURABLE_METADATA_FIELDS,
      requiredFields,
      entries: updatedEntries,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/tenants/:tenantConnectionId/sensitivity-labels", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const labels = await storage.getSensitivityLabelsByTenantId(conn.tenantId);
    res.json(labels);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/tenants/:tenantConnectionId/sensitivity-labels/sync", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Caller organization has no access to tenant");
      return res.status(403).json({ error: "Access denied" });
    }

    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.SENSITIVITY_LABELS_SYNCED,
        resource: 'tenant_connection',
        resourceId: conn.id,
        tenantConnectionId: conn.id,
        details: { reason: 'azure_credentials_not_configured' },
        result: 'FAILURE',
      });
      return res.status(500).json({ error: "Azure credentials not configured" });
    }

    const token = await getAppToken(conn.tenantId, clientId, clientSecret);
    if (!token) {
      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.SENSITIVITY_LABELS_SYNCED,
        resource: 'tenant_connection',
        resourceId: conn.id,
        tenantConnectionId: conn.id,
        details: { reason: 'app_token_failed' },
        result: 'FAILURE',
      });
      return res.status(500).json({ error: "Failed to acquire app token for tenant" });
    }

    console.log(`[label-sync] Manual sync triggered for tenant ${conn.tenantId}`);
    const labelResult = await fetchSensitivityLabels(token);

    if (labelResult.error) {
      console.error(`[label-sync] Error: ${labelResult.error}`);
      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.SENSITIVITY_LABELS_SYNCED,
        resource: 'tenant_connection',
        resourceId: conn.id,
        tenantConnectionId: conn.id,
        details: { error: labelResult.error },
        result: 'FAILURE',
      });
      return res.json({ synced: 0, total: 0, error: labelResult.error });
    }

    console.log(`[label-sync] Graph API returned ${labelResult.labels.length} labels`);
    let synced = 0;
    for (const label of labelResult.labels) {
      console.log(`[label-sync]   - ${label.name} (id=${label.id}, site-scope=${label.appliesToGroupsSites}, formats=${(label.contentFormats || []).join(',')})`);
      await storage.upsertSensitivityLabel({
        tenantId: conn.tenantId,
        labelId: label.id,
        name: label.name,
        description: label.description || null,
        color: label.color || null,
        tooltip: label.tooltip || null,
        sensitivity: label.sensitivity ?? null,
        isActive: label.isActive,
        contentFormats: label.contentFormats || null,
        hasProtection: label.hasProtection,
        parentLabelId: label.parentLabelId || null,
        appliesToGroupsSites: label.appliesToGroupsSites,
      });
      synced++;
    }

    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.SENSITIVITY_LABELS_SYNCED,
      resource: 'tenant_connection',
      resourceId: conn.id,
      tenantConnectionId: conn.id,
      details: { synced, total: labelResult.labels.length },
    });
    res.json({ synced, total: labelResult.labels.length });
  } catch (err: any) {
    console.error(`[label-sync] Sync failed: ${err.message}`);
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.SENSITIVITY_LABELS_SYNCED,
      resource: 'tenant_connection',
      resourceId: req.params.tenantConnectionId,
      tenantConnectionId: req.params.tenantConnectionId,
      details: { error: err.message },
      result: 'FAILURE',
    });
    res.status(500).json({ error: err.message });
  }
});

// ── Retention Labels ──
router.get("/api/admin/tenants/:tenantConnectionId/retention-labels", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const labels = await storage.getRetentionLabelsByTenantId(conn.tenantId);
    res.json(labels);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/tenants/:tenantConnectionId/retention-labels/sync", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Caller organization has no access to tenant");
      return res.status(403).json({ error: "Access denied" });
    }

    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.RETENTION_LABELS_SYNCED,
        resource: 'tenant_connection',
        resourceId: conn.id,
        tenantConnectionId: conn.id,
        details: { reason: 'azure_credentials_not_configured' },
        result: 'FAILURE',
      });
      return res.status(500).json({ error: "Azure credentials not configured" });
    }

    let result: Awaited<ReturnType<typeof fetchRetentionLabels>> | null = null;

    const delegatedToken = await getDelegatedTokenForRetention(req.session?.userId, conn.organizationId);
    if (delegatedToken) {
      console.log(`[retention-sync] Using delegated token for retention labels (org: ${conn.organizationId})`);
      result = await fetchRetentionLabels(delegatedToken);
    }

    if (!result) {
      console.warn(`[retention-sync] No delegated SSO token available. Retention labels require delegated (SSO) authentication — app-only tokens are not supported by Microsoft for this endpoint.`);
      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.RETENTION_LABELS_SYNCED,
        resource: 'tenant_connection',
        resourceId: conn.id,
        tenantConnectionId: conn.id,
        details: { reason: 'no_delegated_sso_token' },
        result: 'FAILURE',
      });
      return res.json({
        synced: 0,
        total: 0,
        error: "Retention labels require SSO authentication. Please sign out and sign back in via SSO to grant the RecordsManagement.Read.All delegated permission. App-only tokens are not supported by Microsoft for this endpoint.",
      });
    }

    if (result.error) {
      console.error(`[retention-sync] Error: ${result.error}`);
      await logAuditEvent(req, {
        action: AUDIT_ACTIONS.RETENTION_LABELS_SYNCED,
        resource: 'tenant_connection',
        resourceId: conn.id,
        tenantConnectionId: conn.id,
        details: { error: result.error },
        result: 'FAILURE',
      });
      return res.json({ synced: 0, total: 0, error: result.error });
    }

    console.log(`[retention-sync] Graph API returned ${result.labels.length} retention labels`);
    let synced = 0;
    for (const label of result.labels) {
      console.log(`[retention-sync]   - ${label.name} (id=${label.labelId}, duration=${label.retentionDuration}, record=${label.isRecordLabel})`);
      await storage.upsertRetentionLabel({
        tenantId: conn.tenantId,
        labelId: label.labelId,
        name: label.name,
        description: label.description || null,
        retentionDuration: label.retentionDuration || null,
        retentionAction: label.retentionAction || null,
        behaviorDuringRetentionPeriod: label.behaviorDuringRetentionPeriod || null,
        actionAfterRetentionPeriod: label.actionAfterRetentionPeriod || null,
        isActive: label.isActive,
        isRecordLabel: label.isRecordLabel,
      });
      synced++;
    }

    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.RETENTION_LABELS_SYNCED,
      resource: 'tenant_connection',
      resourceId: conn.id,
      tenantConnectionId: conn.id,
      details: { synced, total: result.labels.length },
    });
    res.json({ synced, total: result.labels.length });
  } catch (err: any) {
    console.error(`[retention-sync] Sync failed: ${err.message}`);
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.RETENTION_LABELS_SYNCED,
      resource: 'tenant_connection',
      resourceId: req.params.tenantConnectionId,
      tenantConnectionId: req.params.tenantConnectionId,
      details: { error: err.message },
      result: 'FAILURE',
    });
    res.status(500).json({ error: err.message });
  }
});

// ── Label Coverage (sensitivity + retention labels mapped to workspaces) ──
router.get("/api/admin/tenants/:tenantConnectionId/label-coverage", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    const [coverage, sensitivityLabelsData, retentionLabelsData] = await Promise.all([
      storage.getWorkspaceLabelCoverage(conn.tenantId),
      storage.getSensitivityLabelsByTenantId(conn.tenantId),
      storage.getRetentionLabelsByTenantId(conn.tenantId),
    ]);

    const sensitivityMap = new Map(sensitivityLabelsData.map(l => [l.labelId, l]));
    const retentionMap = new Map(retentionLabelsData.map(l => [l.labelId, l]));

    const enriched = coverage.map(w => ({
      ...w,
      sensitivityLabelName: w.sensitivityLabelId ? sensitivityMap.get(w.sensitivityLabelId)?.name || null : null,
      retentionLabelName: w.retentionLabelId ? retentionMap.get(w.retentionLabelId)?.name || null : null,
    }));

    const totalSites = coverage.length;
    const withSensitivity = coverage.filter(w => w.sensitivityLabelId).length;
    const withRetention = coverage.filter(w => w.retentionLabelId).length;
    const unlabeled = coverage.filter(w => !w.sensitivityLabelId && !w.retentionLabelId).length;

    res.json({
      workspaces: enriched,
      stats: {
        totalSites,
        withSensitivityLabel: withSensitivity,
        withRetentionLabel: withRetention,
        unlabeled,
        sensitivityCoveragePercent: totalSites > 0 ? Math.round((withSensitivity / totalSites) * 100) : 0,
        retentionCoveragePercent: totalSites > 0 ? Math.round((withRetention / totalSites) * 100) : 0,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Custom Field Definitions (tenant-owned) ──
const VALID_FIELD_TYPES = ["TEXT", "SELECT", "NUMBER", "BOOLEAN", "DATE"];

router.get("/api/admin/tenants/:tenantConnectionId/custom-fields", requirePermission('inventory:read'), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const fields = await storage.getCustomFieldDefinitions(conn.tenantId);
    res.json(fields);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/tenants/:tenantConnectionId/custom-fields", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Caller organization has no access to tenant");
      return res.status(403).json({ error: "Access denied" });
    }
    const { fieldName, fieldLabel, fieldType, options, defaultValue, required, filterable, sortOrder } = req.body;
    if (!fieldLabel || typeof fieldLabel !== "string" || !fieldLabel.trim()) {
      return res.status(400).json({ error: "fieldLabel is required" });
    }
    if (!fieldType || !VALID_FIELD_TYPES.includes(fieldType)) {
      return res.status(400).json({ error: `fieldType must be one of: ${VALID_FIELD_TYPES.join(", ")}` });
    }
    if (fieldType === "SELECT" && (!Array.isArray(options) || options.length === 0)) {
      return res.status(400).json({ error: "options array is required for SELECT field type" });
    }
    const name = fieldName?.trim() || fieldLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const existing = await storage.getCustomFieldDefinitions(conn.tenantId);
    if (existing.some(f => f.fieldName === name)) {
      return res.status(409).json({ error: `Field "${name}" already exists for this tenant` });
    }
    const created = await storage.createCustomFieldDefinition({
      tenantId: conn.tenantId,
      fieldName: name,
      fieldLabel: fieldLabel.trim(),
      fieldType,
      options: fieldType === "SELECT" ? options : null,
      defaultValue: defaultValue && typeof defaultValue === "string" ? defaultValue.trim() : null,
      required: required === true,
      filterable: filterable !== false,
      sortOrder: typeof sortOrder === "number" ? sortOrder : existing.length,
    });
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.CUSTOM_FIELD_CREATED,
      resource: 'custom_field_definition',
      resourceId: created.id,
      tenantConnectionId: conn.id,
      details: { fieldName: created.fieldName, fieldLabel: created.fieldLabel, fieldType: created.fieldType, required: created.required },
    });
    res.status(201).json(created);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/api/admin/tenants/:tenantConnectionId/custom-fields/:fieldId", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Caller organization has no access to tenant");
      return res.status(403).json({ error: "Access denied" });
    }
    const field = await storage.getCustomFieldDefinition(req.params.fieldId);
    if (!field || field.tenantId !== conn.tenantId) {
      return res.status(404).json({ error: "Custom field not found" });
    }
    const updates: Record<string, any> = {};
    if (req.body.fieldLabel !== undefined) updates.fieldLabel = req.body.fieldLabel.trim();
    if (req.body.fieldType !== undefined) {
      if (!VALID_FIELD_TYPES.includes(req.body.fieldType)) {
        return res.status(400).json({ error: `fieldType must be one of: ${VALID_FIELD_TYPES.join(", ")}` });
      }
      updates.fieldType = req.body.fieldType;
    }
    if (req.body.options !== undefined) updates.options = req.body.options;
    if (req.body.defaultValue !== undefined) updates.defaultValue = req.body.defaultValue || null;
    if (req.body.required !== undefined) updates.required = req.body.required;
    if (req.body.filterable !== undefined) updates.filterable = req.body.filterable;
    if (req.body.sortOrder !== undefined) updates.sortOrder = req.body.sortOrder;
    const updated = await storage.updateCustomFieldDefinition(req.params.fieldId, updates);
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.CUSTOM_FIELD_UPDATED,
      resource: 'custom_field_definition',
      resourceId: req.params.fieldId,
      tenantConnectionId: conn.id,
      details: { fieldName: field.fieldName, changedFields: Object.keys(updates) },
    });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/admin/tenants/:tenantConnectionId/custom-fields/:fieldId", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Caller organization has no access to tenant");
      return res.status(403).json({ error: "Access denied" });
    }
    const field = await storage.getCustomFieldDefinition(req.params.fieldId);
    if (!field || field.tenantId !== conn.tenantId) {
      return res.status(404).json({ error: "Custom field not found" });
    }
    await storage.deleteCustomFieldDefinition(req.params.fieldId);
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.CUSTOM_FIELD_DELETED,
      resource: 'custom_field_definition',
      resourceId: req.params.fieldId,
      tenantConnectionId: conn.id,
      details: { fieldName: field.fieldName, fieldLabel: field.fieldLabel },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tenant Access Grants & Codes ──

router.get("/api/admin/tenants/:tenantConnectionId/access-grants", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    const orgId = req.activeOrganizationId || req.user?.organizationId;
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      return res.status(403).json({ error: "Only the tenant owner can view access grants" });
    }

    const grants = await storage.getTenantAccessGrants(conn.id);
    const enriched = await Promise.all(grants.map(async (g) => {
      const org = await storage.getOrganization(g.grantedOrganizationId);
      return { ...g, grantedOrganizationName: org?.name || "Unknown" };
    }));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── MSP Access: code generation (customer side) ──
router.post("/api/admin/tenants/:id/msp-access/code", requireRole(ZENITH_ROLES.TENANT_ADMIN), requireFeature("mspAccess"), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (req.user?.role !== ZENITH_ROLES.PLATFORM_OWNER && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Caller organization has no access to tenant");
      return res.status(403).json({ error: "Access denied" });
    }

    await storage.invalidatePendingMspCodes(conn.id);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const grant = await storage.createMspAccessGrant({
      tenantConnectionId: conn.id,
      grantingOrgId: orgId!,
      grantedToOrgId: null,
      accessCode: code,
      codeExpiresAt: expiresAt,
      status: "PENDING",
    });

    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'MSP_GRANT_CODE_CREATED',
      resource: 'msp_access_grant',
      resourceId: grant.id,
      organizationId: orgId || null,
      tenantConnectionId: conn.id,
      details: { tenantName: conn.tenantName, expiresAt },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    res.json({ code, expiresAt, grantId: grant.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── MSP Access: redeem a code (MSP side) ──
router.post("/api/admin/msp-access/redeem", requireRole(ZENITH_ROLES.TENANT_ADMIN), requireFeature("mspAccess"), async (req: AuthenticatedRequest, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code is required" });
    }

    const grant = await storage.getMspAccessGrantByCode(code.trim());
    if (!grant) {
      return res.status(400).json({ error: "Invalid code" });
    }

    if (new Date() > new Date(grant.codeExpiresAt)) {
      return res.status(400).json({ error: "Code has expired" });
    }

    const requestingOrgId = req.activeOrganizationId || req.user?.organizationId;
    if (!requestingOrgId) {
      return res.status(403).json({ error: "Organization context required" });
    }

    const updated = await storage.updateMspAccessGrant(grant.id, {
      status: "ACTIVE",
      grantedToOrgId: requestingOrgId,
      grantedAt: new Date(),
    });

    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'MSP_GRANT_REDEEMED',
      resource: 'msp_access_grant',
      resourceId: grant.id,
      organizationId: requestingOrgId,
      tenantConnectionId: grant.tenantConnectionId,
      details: { grantingOrgId: grant.grantingOrgId, redeemedBy: requestingOrgId },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    res.json({ success: true, grant: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── MSP Access: list grants for a tenant (customer side) ──
router.get("/api/admin/tenants/:id/msp-access/grants", requireRole(ZENITH_ROLES.TENANT_ADMIN), requireFeature("mspAccess"), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (req.user?.role !== ZENITH_ROLES.PLATFORM_OWNER && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Caller organization has no access to tenant");
      return res.status(403).json({ error: "Access denied" });
    }

    const grants = await storage.getMspAccessGrantsForTenant(conn.id);
    const orgs = await storage.getOrganizations();
    const orgMap = new Map(orgs.map(o => [o.id, o]));

    const enriched = grants.map(g => ({
      ...g,
      grantedToOrgName: g.grantedToOrgId ? orgMap.get(g.grantedToOrgId)?.name || g.grantedToOrgId : null,
    }));

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/tenants/:tenantConnectionId/access-codes", requireRole(ZENITH_ROLES.TENANT_ADMIN), requireFeature("mspAccess"), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    const orgId = req.activeOrganizationId || req.user?.organizationId;
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Only the tenant owner can generate access codes");
      return res.status(403).json({ error: "Only the tenant owner can generate access codes" });
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    let accessCode;
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      try {
        accessCode = await storage.createTenantAccessCode({
          tenantConnectionId: conn.id,
          code,
          expiresAt,
          createdBy: req.user?.id || null,
        });
        break;
      } catch (e: any) {
        if (attempt === 9) throw new Error("Failed to generate unique access code");
      }
    }

    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.TENANT_ACCESS_CODE_CREATED,
      resource: 'tenant_access_code',
      resourceId: accessCode!.id,
      tenantConnectionId: conn.id,
      details: { tenantName: conn.tenantName, expiresAt: accessCode!.expiresAt },
    });
    res.json({ code: accessCode!.code, expiresAt: accessCode!.expiresAt });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/admin/tenants/:tenantConnectionId/access-grants/:grantId", requireRole(ZENITH_ROLES.TENANT_ADMIN), requireFeature("mspAccess"), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    const orgId = req.activeOrganizationId || req.user?.organizationId;
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    if (!isPlatformOwner && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Only the tenant owner can revoke access grants");
      return res.status(403).json({ error: "Only the tenant owner can revoke access" });
    }

    const revoked = await storage.revokeTenantAccessGrant(req.params.grantId, req.params.tenantConnectionId);
    if (!revoked) return res.status(404).json({ error: "Access grant not found or does not belong to this tenant" });

    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.TENANT_ACCESS_GRANT_REVOKED,
      resource: 'tenant_access_grant',
      resourceId: req.params.grantId,
      tenantConnectionId: conn.id,
      details: { tenantName: conn.tenantName, revokedBy: req.user?.email },
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── MSP Access: revoke a grant (customer side) ──
router.delete("/api/admin/tenants/:id/msp-access/grants/:grantId", requireRole(ZENITH_ROLES.TENANT_ADMIN), requireFeature("mspAccess"), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (req.user?.role !== ZENITH_ROLES.PLATFORM_OWNER && conn.organizationId !== orgId) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Caller organization has no access to tenant");
      return res.status(403).json({ error: "Access denied" });
    }

    const grant = await storage.getMspAccessGrant(req.params.grantId);
    if (!grant || grant.tenantConnectionId !== conn.id) {
      return res.status(404).json({ error: "Grant not found" });
    }

    await storage.updateMspAccessGrant(grant.id, {
      status: "REVOKED",
      revokedAt: new Date(),
    });

    await storage.createAuditEntry({
      userId: req.user?.id || null,
      userEmail: req.user?.email || null,
      action: 'MSP_GRANT_REVOKED',
      resource: 'msp_access_grant',
      resourceId: grant.id,
      organizationId: orgId || null,
      tenantConnectionId: conn.id,
      details: { tenantName: conn.tenantName, grantedToOrgId: grant.grantedToOrgId, revokedBy: req.user?.email },
      result: 'SUCCESS',
      ipAddress: req.ip || null,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/tenants/claim-access", requireRole(ZENITH_ROLES.TENANT_ADMIN), requireFeature("mspAccess"), async (req: AuthenticatedRequest, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string" || code.length !== 6) {
      return res.status(400).json({ error: "A valid 6-digit access code is required" });
    }

    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!orgId) {
      return res.status(400).json({ error: "You must belong to an organization to claim access" });
    }

    const result = await storage.validateAndRedeemAccessCode(code.trim(), orgId);
    if (!result) {
      return res.status(400).json({ error: "Invalid or expired access code. Ask the tenant owner to generate a new code." });
    }

    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.TENANT_ACCESS_CLAIMED,
      resource: 'tenant_access_grant',
      resourceId: result.grant?.id || null,
      organizationId: orgId,
      tenantConnectionId: result.tenantConnection.id,
      details: { tenantName: result.tenantConnection.tenantName, tenantDomain: result.tenantConnection.domain },
    });
    res.json({
      success: true,
      tenantName: result.tenantConnection.tenantName,
      tenantDomain: result.tenantConnection.domain,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/tenants/:id/access-check", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    const orgId = req.activeOrganizationId || req.user?.organizationId;
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;

    if (isPlatformOwner || conn.organizationId === orgId) {
      return res.json({ hasAccess: true, isOwner: true, ownershipType: conn.ownershipType });
    }

    if (conn.ownershipType === "MSP" || conn.ownershipType === "Hybrid") {
      return res.json({ hasAccess: true, isOwner: false, ownershipType: conn.ownershipType });
    }

    if (orgId) {
      const grant = await storage.getActiveTenantAccessGrant(conn.id, orgId);
      if (grant) {
        return res.json({ hasAccess: true, isOwner: false, ownershipType: conn.ownershipType, grantedAccess: true });
      }
    }

    return res.json({
      hasAccess: false,
      isOwner: false,
      ownershipType: conn.ownershipType,
      message: "This tenant has not consented to allow MSP access to their data. Contact the tenant owner for an access code.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


async function verifyTenantAccess(req: AuthenticatedRequest, conn: { id: string; organizationId: string | null }): Promise<boolean> {
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  if (isPlatformOwner) return true;

  const orgId = req.activeOrganizationId || req.user?.organizationId;
  if (!orgId) return false;
  if (conn.organizationId === orgId) return true;

  const grant = await storage.getActiveTenantAccessGrant(conn.id, orgId);
  return !!grant;
}

router.get("/api/admin/tenants/:id/data-masking", requireAuth(), requireRole(ZENITH_ROLES.PLATFORM_OWNER, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    if (!(await verifyTenantAccess(req, conn))) {
      await logAccessDenied(req, "tenant_connection", conn.id, "verifyTenantAccess failed (data-masking read)");
      return res.status(403).json({ error: "You do not have access to this tenant connection" });
    }

    const keyRecord = await storage.getTenantEncryptionKey(conn.id);
    res.json({
      enabled: conn.dataMaskingEnabled,
      hasKey: !!keyRecord,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/tenants/:id/data-masking", requireAuth(), requireRole(ZENITH_ROLES.PLATFORM_OWNER, ZENITH_ROLES.TENANT_ADMIN), requireFeature("dataMasking"), async (req: AuthenticatedRequest, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    if (!(await verifyTenantAccess(req, conn))) {
      await logAccessDenied(req, "tenant_connection", conn.id, "verifyTenantAccess failed (data-masking write)");
      return res.status(403).json({ error: "You do not have access to this tenant connection" });
    }

    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "Missing 'enabled' boolean in request body" });
    }

    if (enabled === conn.dataMaskingEnabled) {
      return res.json({ success: true, enabled, recordsProcessed: 0, errors: [], message: `Data masking is already ${enabled ? "enabled" : "disabled"}` });
    }

    let result;
    if (enabled) {
      result = await enableDataMasking(conn.id);
    } else {
      result = await disableDataMasking(conn.id);
    }

    if (req.user) {
      await storage.createAuditEntry({
        userId: req.user.id,
        userEmail: req.user.email,
        action: enabled ? "DATA_MASKING_ENABLED" : "DATA_MASKING_DISABLED",
        resource: "tenant_connection",
        resourceId: conn.id,
        organizationId: req.activeOrganizationId || null,
        details: { tenantName: conn.tenantName, recordsProcessed: result.recordsProcessed, errors: result.errors },
        result: result.success ? "SUCCESS" : "PARTIAL",
        ipAddress: req.ip || null,
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
