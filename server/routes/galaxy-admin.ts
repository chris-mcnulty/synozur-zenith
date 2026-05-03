import { Router, type Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { encryptToken, decryptToken } from "../utils/encryption";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { ZENITH_ROLES, GALAXY_SCOPES, type GalaxyClient } from "@shared/schema";
import { isValidRsaPublicKeyPem } from "../services/galaxy-jwt";
import { logAuditEvent, AUDIT_ACTIONS } from "../services/audit-logger";

/**
 * Platform Owner-only admin API for managing Galaxy partner clients —
 * registration, secret rotation, scope/org allow-list edits, status toggles.
 *
 * Mounted under `/api/admin/galaxy/clients`.
 */
const router = Router();

const allOnly = [requireAuth(), requireRole(ZENITH_ROLES.PLATFORM_OWNER)];

function publicView(c: GalaxyClient) {
  // Never return the encrypted secret — admins see it once at creation/rotation.
  const { clientSecretEncrypted, ...rest } = c;
  return rest;
}

function generateClientId() {
  return `gclient_${crypto.randomBytes(8).toString("hex")}`;
}

function generateClientSecret() {
  // 256 bits of entropy, url-safe base64
  return crypto.randomBytes(32).toString("base64url");
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  publicKeyPem: z.string().min(20),
  organizationsAllowed: z.array(z.string().min(1)).min(1, "Specify at least one allowed organization id"),
  allowedScopes: z.array(z.enum(GALAXY_SCOPES)).min(1).default(["galaxy.read"]),
  rateLimitPerMinute: z.number().int().min(60).max(10_000).default(600),
  tokenTtlSeconds: z.number().int().min(60).max(3600).default(900),
});

router.get("/api/admin/galaxy/clients", ...allOnly, async (_req, res) => {
  const clients = await storage.listGalaxyClients();
  res.json({ items: clients.map(publicView) });
});

router.post("/api/admin/galaxy/clients", ...allOnly, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  }
  if (!isValidRsaPublicKeyPem(parsed.data.publicKeyPem)) {
    return res.status(400).json({ error: "invalid_public_key", message: "publicKeyPem must be a valid RSA SPKI PEM" });
  }
  // Validate orgs exist
  for (const orgId of parsed.data.organizationsAllowed) {
    const org = await storage.getOrganization(orgId);
    if (!org) return res.status(400).json({ error: "unknown_organization", organizationId: orgId });
  }

  const clientId = generateClientId();
  const clientSecret = generateClientSecret();
  const encrypted = encryptToken(clientSecret);

  const created = await storage.createGalaxyClient({
    name: parsed.data.name,
    clientId,
    clientSecretEncrypted: encrypted,
    publicKeyPem: parsed.data.publicKeyPem,
    organizationsAllowed: parsed.data.organizationsAllowed,
    allowedScopes: parsed.data.allowedScopes,
    rateLimitPerMinute: parsed.data.rateLimitPerMinute,
    tokenTtlSeconds: parsed.data.tokenTtlSeconds,
    status: "ACTIVE",
    createdBy: req.user?.id ?? null,
  });

  await logAuditEvent(req as any, {
    action: AUDIT_ACTIONS.GALAXY_CLIENT_REGISTERED,
    resource: "galaxy_client",
    resourceId: created.id,
    result: "SUCCESS",
    details: { name: created.name, allowedScopes: created.allowedScopes, organizationsAllowed: created.organizationsAllowed },
  });

  // Surface plaintext secret ONCE — caller is the Platform Owner UI.
  res.status(201).json({ ...publicView(created), clientId, clientSecret });
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  organizationsAllowed: z.array(z.string().min(1)).optional(),
  allowedScopes: z.array(z.enum(GALAXY_SCOPES)).optional(),
  rateLimitPerMinute: z.number().int().min(60).max(10_000).optional(),
  tokenTtlSeconds: z.number().int().min(60).max(3600).optional(),
  publicKeyPem: z.string().min(20).optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
});

router.patch("/api/admin/galaxy/clients/:id", ...allOnly, async (req: AuthenticatedRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
  if (parsed.data.publicKeyPem && !isValidRsaPublicKeyPem(parsed.data.publicKeyPem)) {
    return res.status(400).json({ error: "invalid_public_key" });
  }
  const updated = await storage.updateGalaxyClient((req.params.id as string), parsed.data);
  if (!updated) return res.status(404).json({ error: "not_found" });

  await logAuditEvent(req as any, {
    action: AUDIT_ACTIONS.GALAXY_CLIENT_UPDATED,
    resource: "galaxy_client",
    resourceId: updated.id,
    result: "SUCCESS",
    details: { changes: Object.keys(parsed.data) },
  });

  res.json(publicView(updated));
});

router.post("/api/admin/galaxy/clients/:id/rotate-secret", ...allOnly, async (req: AuthenticatedRequest, res: Response) => {
  const newSecret = generateClientSecret();
  const updated = await storage.rotateGalaxyClientSecret((req.params.id as string), encryptToken(newSecret));
  if (!updated) return res.status(404).json({ error: "not_found" });

  await logAuditEvent(req as any, {
    action: AUDIT_ACTIONS.GALAXY_CLIENT_SECRET_ROTATED,
    resource: "galaxy_client",
    resourceId: updated.id,
    result: "SUCCESS",
  });

  // Plaintext shown once — admin must capture immediately.
  res.json({ ...publicView(updated), clientSecret: newSecret });
});

router.delete("/api/admin/galaxy/clients/:id", ...allOnly, async (req: AuthenticatedRequest, res: Response) => {
  const existing = await storage.getGalaxyClient((req.params.id as string));
  if (!existing) return res.status(404).json({ error: "not_found" });
  await storage.deleteGalaxyClient((req.params.id as string));

  await logAuditEvent(req as any, {
    action: AUDIT_ACTIONS.GALAXY_CLIENT_DELETED,
    resource: "galaxy_client",
    resourceId: (req.params.id as string),
    result: "SUCCESS",
    details: { name: existing.name },
  });

  res.json({ ok: true });
});

// Health/echo: lets a Platform Owner sanity-check that decryption works.
router.get("/api/admin/galaxy/clients/:id/secret-fingerprint", ...allOnly, async (req: AuthenticatedRequest, res: Response) => {
  const client = await storage.getGalaxyClient((req.params.id as string));
  if (!client) return res.status(404).json({ error: "not_found" });
  try {
    const plain = decryptToken(client.clientSecretEncrypted);
    const fp = crypto.createHash("sha256").update(plain).digest("hex").slice(0, 12);
    res.json({ fingerprint: fp, length: plain.length });
  } catch {
    res.status(500).json({ error: "decryption_failed" });
  }
});

export default router;
