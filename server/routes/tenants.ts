import { Router } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { testConnection, clearTokenCache, getAppToken, fetchSensitivityLabels, fetchRetentionLabels } from "../services/graph";
import { checkTenantPermissions, REQUIRED_PERMISSIONS, PERMISSIONS_VERSION } from "../services/permissions";
import { METADATA_CATEGORIES } from "@shared/schema";
import { refreshDelegatedToken } from "../routes-entra";

const router = Router();

async function getDelegatedTokenForRetention(currentUserId?: string, organizationId?: string): Promise<string | null> {
  const tryUser = async (userId: string): Promise<string | null> => {
    const delegated = await storage.getDecryptedGraphToken(userId, "graph");
    if (delegated?.token && delegated.expiresAt && delegated.expiresAt > new Date()) {
      return delegated.token;
    }
    const refreshed = await refreshDelegatedToken(userId);
    if (refreshed) return refreshed;
    return null;
  };

  if (currentUserId) {
    const token = await tryUser(currentUserId);
    if (token) return token;
  }

  if (organizationId) {
    const anyValid = await storage.getAnyValidDelegatedToken("graph", organizationId);
    if (anyValid) return anyValid.token;

    const { db } = await import("../db");
    const { graphTokens } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    const orgTokens = await db.select().from(graphTokens)
      .where(and(eq(graphTokens.organizationId, organizationId), eq(graphTokens.service, "graph")))
      .limit(5);
    for (const t of orgTokens) {
      if (t.refreshToken) {
        const refreshed = await refreshDelegatedToken(t.userId);
        if (refreshed) return refreshed;
      }
    }
  }

  return null;
}

// ── Tenant Connections ──
router.get("/api/admin/tenants", async (_req, res) => {
  const connections = await storage.getTenantConnections();
  const safe = connections.map(c => ({
    ...c,
    clientSecret: undefined,
    clientId: c.clientId ? `${c.clientId.substring(0, 8)}...` : undefined,
  }));
  res.json(safe);
});

router.get("/api/admin/tenants/consent/initiate", async (req, res) => {
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
    return res.status(403).json({ error: "You must belong to an organization to connect a tenant." });
  }

  const { tenantDomain, ownershipType, adminEmail } = req.query;
  if (!tenantDomain) {
    return res.status(400).json({ error: "tenantDomain query parameter is required" });
  }

  const nonce = crypto.randomBytes(16).toString('hex');
  (req.session as any).consentNonce = nonce;
  (req.session as any).consentOrgId = user.organizationId;

  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const baseUrl = `${protocol}://${host}`;
  const redirectUri = `${baseUrl}/api/admin/tenants/consent/callback`;

  const state = Buffer.from(JSON.stringify({
    tenantDomain,
    ownershipType: ownershipType || 'MSP',
    nonce,
  })).toString('base64url');

  const tenantAuthority = tenantDomain || 'organizations';
  let consentUrl = `https://login.microsoftonline.com/${tenantAuthority}/adminconsent?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
  if (adminEmail) {
    consentUrl += `&login_hint=${encodeURIComponent(String(adminEmail))}`;
  }

  res.json({ consentUrl });
});

router.get("/api/admin/tenants/consent/callback", async (req, res) => {
  const { admin_consent, tenant, state, error, error_description } = req.query;

  if (error) {
    console.error('[Consent] Admin consent error:', error, error_description);
    return res.redirect(`/app/admin/tenants?consent_error=${encodeURIComponent(String(error_description || error))}`);
  }

  if (admin_consent !== 'True' || !tenant || !state) {
    return res.redirect('/app/admin/tenants?consent_error=Consent+was+not+granted');
  }

  try {
    const stateData = JSON.parse(Buffer.from(String(state), 'base64url').toString());
    const sessionNonce = (req.session as any)?.consentNonce;
    const sessionOrgId = (req.session as any)?.consentOrgId;

    if (!sessionNonce || sessionNonce !== stateData.nonce) {
      return res.redirect('/app/admin/tenants?consent_error=Invalid+consent+session.+Please+try+again.');
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
      return res.redirect('/app/admin/tenants?consent_success=true');
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

    await storage.createTenantConnection({
      tenantId: tenantIdStr,
      tenantName,
      domain,
      ownershipType,
      organizationId,
      consentGranted: true,
      status: 'ACTIVE',
    });

    return res.redirect('/app/admin/tenants?consent_success=true');
  } catch (err: any) {
    console.error('[Consent] Callback processing error:', err);
    return res.redirect(`/app/admin/tenants?consent_error=${encodeURIComponent(err.message)}`);
  }
});

router.get("/api/admin/tenants/:id", async (req, res) => {
  const connection = await storage.getTenantConnection(req.params.id);
  if (!connection) return res.status(404).json({ message: "Tenant connection not found" });
  res.json({ ...connection, clientSecret: undefined });
});

router.post("/api/admin/tenants", async (req, res) => {
  const { tenantId, tenantName, domain, ownershipType, organizationId } = req.body;
  if (!tenantId || !domain) {
    return res.status(400).json({ message: "tenantId and domain are required" });
  }
  const connection = await storage.createTenantConnection({
    tenantId,
    tenantName: tenantName || domain.split('.')[0],
    domain,
    ownershipType: ownershipType || 'MSP',
    organizationId: organizationId || null,
    status: 'PENDING',
    consentGranted: false,
  });
  res.status(201).json({ ...connection, clientSecret: undefined });
});

router.patch("/api/admin/tenants/:id", async (req, res) => {
  const connection = await storage.updateTenantConnection(req.params.id, req.body);
  if (!connection) return res.status(404).json({ message: "Tenant connection not found" });
  res.json({ ...connection, clientSecret: undefined });
});

router.delete("/api/admin/tenants/:id", async (req, res) => {
  const conn = await storage.getTenantConnection(req.params.id);
  if (conn) {
    const cid = conn.clientId || process.env.AZURE_CLIENT_ID;
    if (cid) clearTokenCache(conn.tenantId, cid);
  }
  await storage.deleteTenantConnection(req.params.id);
  res.status(204).send();
});

router.post("/api/admin/tenants/test", async (req, res) => {
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
router.get("/api/admin/tenants/:id/permissions", async (req, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

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

router.get("/api/admin/tenants/permissions/manifest", (_req, res) => {
  res.json({
    version: PERMISSIONS_VERSION,
    permissions: REQUIRED_PERMISSIONS,
  });
});

router.get("/api/admin/tenants/:id/reconsent", async (req, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

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

    const consentUrl = `https://login.microsoftonline.com/${conn.domain}/adminconsent?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    res.json({ consentUrl, tenantDomain: conn.domain });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Data Dictionaries (tenant-owned, shared across orgs) ──
router.get("/api/admin/tenants/:tenantConnectionId/data-dictionaries", async (req, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
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

router.post("/api/admin/tenants/:tenantConnectionId/data-dictionaries", async (req, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const { category, value } = req.body;
    if (!category || !value || typeof category !== "string" || typeof value !== "string" || !value.trim()) {
      return res.status(400).json({ error: "category and value are required" });
    }
    if (!METADATA_CATEGORIES.includes(category as any)) {
      return res.status(400).json({ error: `Invalid category. Must be one of: ${METADATA_CATEGORIES.join(", ")}` });
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
    res.status(201).json(entry);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete("/api/admin/tenants/:tenantConnectionId/data-dictionaries/:entryId", async (req, res) => {
  try {
    await storage.deleteDataDictionaryEntry(req.params.entryId);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/admin/tenants/:tenantConnectionId/sensitivity-labels", async (req, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const labels = await storage.getSensitivityLabelsByTenantId(conn.tenantId);
    res.json(labels);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/tenants/:tenantConnectionId/sensitivity-labels/sync", async (req, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "Azure credentials not configured" });
    }

    const token = await getAppToken(conn.tenantId, clientId, clientSecret);
    if (!token) {
      return res.status(500).json({ error: "Failed to acquire app token for tenant" });
    }

    console.log(`[label-sync] Manual sync triggered for tenant ${conn.tenantId}`);
    const labelResult = await fetchSensitivityLabels(token);

    if (labelResult.error) {
      console.error(`[label-sync] Error: ${labelResult.error}`);
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

    res.json({ synced, total: labelResult.labels.length });
  } catch (err: any) {
    console.error(`[label-sync] Sync failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Retention Labels ──
router.get("/api/admin/tenants/:tenantConnectionId/retention-labels", async (req, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });
    const labels = await storage.getRetentionLabelsByTenantId(conn.tenantId);
    res.json(labels);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/admin/tenants/:tenantConnectionId/retention-labels/sync", async (req, res) => {
  try {
    const conn = await storage.getTenantConnection(req.params.tenantConnectionId);
    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    const clientId = process.env.AZURE_CLIENT_ID;
    const clientSecret = process.env.AZURE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
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
      return res.json({
        synced: 0,
        total: 0,
        error: "Retention labels require SSO authentication. Please sign out and sign back in via SSO to grant the RecordsManagement.Read.All delegated permission. App-only tokens are not supported by Microsoft for this endpoint.",
      });
    }

    if (result.error) {
      console.error(`[retention-sync] Error: ${result.error}`);
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

    res.json({ synced, total: result.labels.length });
  } catch (err: any) {
    console.error(`[retention-sync] Sync failed: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// ── Label Coverage (sensitivity + retention labels mapped to workspaces) ──
router.get("/api/admin/tenants/:tenantConnectionId/label-coverage", async (req, res) => {
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

export default router;
