import { Router } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { testConnection, clearTokenCache } from "../services/graph";
import { METADATA_CATEGORIES } from "@shared/schema";

const router = Router();

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
  if (conn && conn.clientId) clearTokenCache(conn.tenantId, conn.clientId);
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

export default router;
