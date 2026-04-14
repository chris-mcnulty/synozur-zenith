/**
 * Copilot Interaction Sync Service (BL-038)
 *
 * Syncs user-initiated Microsoft 365 Copilot interactions from the Microsoft
 * Graph API (beta) for all Copilot-licensed users in a given tenant
 * connection. Implements a rolling 30-day capture window, with automatic
 * cleanup of records older than 30 days after every sync.
 *
 * Graph endpoint:
 *   GET /beta/users/{userId}/copilot/interactions
 *
 * Required permission: CopilotInteraction.Read.All (application permission,
 * admin consent required). This must be added to the Entra app registration
 * shared by Zenith's other Graph-consuming services.
 *
 * NOTE: the Copilot interactions endpoint is a BETA Graph API. Microsoft may
 * change the schema. The parse layer is isolated here so future changes don't
 * ripple into the analyzer/assessment layer.
 */

import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../db";
import {
  copilotInteractions,
  licenseAssignments,
  type InsertCopilotInteraction,
} from "@shared/schema";
import { getAppToken, graphFetchWithRetry } from "./graph";
import { storage } from "../storage";
import { encryptRecord, getTenantKeyBuffer } from "./data-masking";
import { decryptToken } from "../utils/encryption";

/** M365 Copilot SKU part identifier — used to filter license_assignments. */
export const COPILOT_SKU_PART_ID = "639dec6b-bb19-468b-871c-c5c441c4b0cb";

/** Hard upper bound on users per sync to avoid runaway cost. */
const MAX_USERS_PER_SYNC = 2000;

/** Days of retention for captured interactions. */
const RETENTION_DAYS = 30;

export interface SyncSummary {
  usersScanned: number;
  interactionsCaptured: number;
  interactionsSkipped: number;
  interactionsPurged: number;
  errors: Array<{ userId?: string; context: string; message: string }>;
}

interface CopilotLicensedUser {
  userId: string;
  userPrincipalName: string;
  userDisplayName: string | null;
  userDepartment: string | null;
}

interface GraphInteraction {
  id: string;
  createdDateTime: string;
  appClass?: string;
  interactionType?: string;
  contexts?: Array<{ contextType?: string; content?: string }>;
}

function extractPromptText(interaction: GraphInteraction): string | null {
  if (!Array.isArray(interaction.contexts)) return null;
  for (const ctx of interaction.contexts) {
    if (ctx?.contextType === "prompt" && typeof ctx.content === "string" && ctx.content.trim().length > 0) {
      return ctx.content.trim();
    }
  }
  return null;
}

async function getCopilotLicensedUsers(
  tenantConnectionId: string,
): Promise<CopilotLicensedUser[]> {
  // Filter by either exact SKU part id or the Copilot for M365 service plan name.
  const rows = await db
    .select({
      userId: licenseAssignments.userId,
      userPrincipalName: licenseAssignments.userPrincipalName,
      userDisplayName: licenseAssignments.userDisplayName,
      userDepartment: licenseAssignments.userDepartment,
      skuId: licenseAssignments.skuId,
      skuPartNumber: licenseAssignments.skuPartNumber,
    })
    .from(licenseAssignments)
    .where(
      and(
        eq(licenseAssignments.tenantConnectionId, tenantConnectionId),
        // Only scan users with accountEnabled = true. Users where
        // accountEnabled IS NULL (disabled-state unknown) are intentionally
        // excluded — we only want confirmed-active accounts.
        eq(licenseAssignments.accountEnabled, true),
      ),
    );

  // Deduplicate on userId and filter to Copilot SKUs.
  const byUser = new Map<string, CopilotLicensedUser>();
  for (const r of rows) {
    const sku = (r.skuPartNumber ?? "").toUpperCase();
    const isCopilotSku =
      r.skuId === COPILOT_SKU_PART_ID ||
      sku.includes("COPILOT");
    if (!isCopilotSku) continue;
    if (!r.userId || byUser.has(r.userId)) continue;
    byUser.set(r.userId, {
      userId: r.userId,
      userPrincipalName: r.userPrincipalName ?? r.userId,
      userDisplayName: r.userDisplayName ?? null,
      userDepartment: r.userDepartment ?? null,
    });
  }

  return Array.from(byUser.values()).slice(0, MAX_USERS_PER_SYNC);
}

async function fetchInteractionsForUser(
  token: string,
  userId: string,
  sinceIso: string,
): Promise<GraphInteraction[]> {
  const interactions: GraphInteraction[] = [];

  // Per BL-038 spec: $filter=createdDateTime ge {iso}&$orderby=createdDateTime desc
  // The Graph beta endpoint does not accept $filter reliably in all tenants,
  // so we page through and filter client-side as a defensive fallback.
  let url: string | null =
    `https://graph.microsoft.com/beta/users/${encodeURIComponent(userId)}/copilot/interactions` +
    `?$filter=${encodeURIComponent(`createdDateTime ge ${sinceIso}`)}`;

  const sinceMs = Date.parse(sinceIso);

  while (url) {
    const res = await graphFetchWithRetry(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      // 403 or 404 for a specific user is logged and skipped by the caller.
      const bodyText = await res.text().catch(() => "");
      const error: Error & { status?: number } = new Error(
        `Graph ${res.status} for user ${userId}: ${bodyText.substring(0, 200)}`,
      );
      error.status = res.status;
      throw error;
    }

    const data = await res.json() as {
      value?: GraphInteraction[];
      "@odata.nextLink"?: string;
    };

    for (const item of data.value ?? []) {
      if (!item?.id) continue;
      // Client-side window enforcement (belt-and-braces).
      const createdMs = item.createdDateTime ? Date.parse(item.createdDateTime) : 0;
      if (!createdMs || createdMs < sinceMs) continue;
      interactions.push(item);
    }

    url = data["@odata.nextLink"] ?? null;
  }

  return interactions;
}

type InteractionEncryptionContext =
  | { shouldEncrypt: false }
  | { shouldEncrypt: true; keyBuffer: Buffer };

const interactionEncryptionContextCache = new Map<
  string,
  Promise<InteractionEncryptionContext>
>();

async function getInteractionEncryptionContext(
  tenantConnectionId: string,
): Promise<InteractionEncryptionContext> {
  let contextPromise = interactionEncryptionContextCache.get(tenantConnectionId);
  if (!contextPromise) {
    contextPromise = (async () => {
      const conn = await storage.getTenantConnection(tenantConnectionId);
      if (!conn?.dataMaskingEnabled) return { shouldEncrypt: false } as const;

      const keyRecord = await storage.getTenantEncryptionKey(tenantConnectionId);
      if (!keyRecord) return { shouldEncrypt: false } as const;

      return {
        shouldEncrypt: true,
        keyBuffer: getTenantKeyBuffer(keyRecord.encryptedKey),
      } as const;
    })();

    interactionEncryptionContextCache.set(tenantConnectionId, contextPromise);
  }

  return contextPromise;
}

async function upsertInteraction(
  tenantConnectionId: string,
  record: InsertCopilotInteraction,
): Promise<"inserted" | "skipped"> {
  // Encryption is applied when the tenant has masking enabled.
  const encryptionContext =
    await getInteractionEncryptionContext(tenantConnectionId);
  const encrypted = encryptionContext.shouldEncrypt
    ? encryptRecord(
        record,
        "copilot_interactions",
        encryptionContext.keyBuffer,
      )
    : record;

  const inserted = await db
    .insert(copilotInteractions)
    .values(encrypted)
    .onConflictDoNothing({
      target: [copilotInteractions.tenantConnectionId, copilotInteractions.graphInteractionId],
    })
    .returning({ id: copilotInteractions.id });

  return inserted.length > 0 ? "inserted" : "skipped";
}

/**
 * Delete interactions older than the retention window for a single tenant.
 * Called at the end of that tenant's sync to avoid cross-tenant contention.
 */
export async function purgeExpiredInteractions(
  tenantConnectionId: string,
): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM copilot_interactions
     WHERE tenant_connection_id = $1
       AND interaction_at < now() - make_interval(days => $2)`,
    [tenantConnectionId, RETENTION_DAYS],
  );
  return rowCount ?? 0;
}

/**
 * Sync Copilot interactions for a single tenant connection. Returns a
 * per-user summary. Per-user Graph errors (403 on a specific user, user not
 * found, etc.) are logged and do not abort the entire sync.
 */
export async function syncCopilotInteractions(
  tenantConnectionId: string,
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    usersScanned: 0,
    interactionsCaptured: 0,
    interactionsSkipped: 0,
    interactionsPurged: 0,
    errors: [],
  };

  const conn = await storage.getTenantConnection(tenantConnectionId);
  if (!conn) {
    summary.errors.push({ context: "tenantConnection", message: "Tenant connection not found" });
    return summary;
  }

  const organizationId = conn.organizationId;
  if (!organizationId) {
    summary.errors.push({ context: "tenantConnection", message: "Tenant connection is missing organizationId" });
    return summary;
  }

  // Resolve client secret (may be encrypted or provided via env)
  const clientSecret = conn.clientSecret
    ? (() => { try { return decryptToken(conn.clientSecret!); } catch { return conn.clientSecret!; } })()
    : process.env.AZURE_CLIENT_SECRET ?? "";

  const clientId = conn.clientId ?? process.env.AZURE_CLIENT_ID ?? "";
  if (!conn.tenantId || !clientId || !clientSecret) {
    summary.errors.push({ context: "credentials", message: "Tenant credentials are incomplete" });
    return summary;
  }

  let token: string;
  try {
    token = await getAppToken(conn.tenantId, clientId, clientSecret);
  } catch (err: unknown) {
    summary.errors.push({
      context: "getAppToken",
      message: err instanceof Error ? err.message : String(err),
    });
    return summary;
  }

  const users = await getCopilotLicensedUsers(tenantConnectionId);
  const sinceIso = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  for (const user of users) {
    summary.usersScanned++;
    let interactions: GraphInteraction[];
    try {
      interactions = await fetchInteractionsForUser(token, user.userId, sinceIso);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      // 403/404 on a specific user → log and skip. The Copilot licensed user
      // may no longer have an active Copilot session or the beta endpoint may
      // not be exposed for this user class.
      summary.errors.push({
        userId: user.userId,
        context: "fetchInteractions",
        message: err instanceof Error ? err.message : String(err),
      });
      if (status && status >= 500) {
        // A 5xx on a single user can indicate service-wide issues but we
        // still continue — per-user isolation is a spec requirement.
      }
      continue;
    }

    for (const raw of interactions) {
      if (raw.interactionType && raw.interactionType !== "user-initiated") {
        summary.interactionsSkipped++;
        continue;
      }
      const promptText = extractPromptText(raw);
      if (!promptText) {
        summary.interactionsSkipped++;
        continue;
      }

      try {
        const outcome = await upsertInteraction(tenantConnectionId, {
          tenantConnectionId,
          organizationId,
          graphInteractionId: raw.id,
          userId: user.userId,
          userPrincipalName: user.userPrincipalName,
          userDisplayName: user.userDisplayName,
          userDepartment: user.userDepartment,
          appClass: raw.appClass ?? "Unknown",
          promptText,
          interactionAt: new Date(raw.createdDateTime),
          flags: [],
        });
        if (outcome === "inserted") summary.interactionsCaptured++;
        else summary.interactionsSkipped++;
      } catch (err: unknown) {
        summary.errors.push({
          userId: user.userId,
          context: "upsertInteraction",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  try {
    summary.interactionsPurged = await purgeExpiredInteractions();
  } catch (err: unknown) {
    summary.errors.push({
      context: "purgeExpiredInteractions",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  console.log(
    `[copilot-interaction-sync] tenant=${tenantConnectionId} ` +
    `users=${summary.usersScanned} captured=${summary.interactionsCaptured} ` +
    `skipped=${summary.interactionsSkipped} purged=${summary.interactionsPurged} ` +
    `errors=${summary.errors.length}`,
  );

  return summary;
}

/**
 * Fetch interactions already captured for a tenant that have not yet been
 * scored by the analyzer. Used by the analysis pass.
 */
export async function getUnanalyzedInteractionIds(
  tenantConnectionId: string,
  limit = 1000,
): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id
     FROM copilot_interactions
     WHERE tenant_connection_id = $1
       AND analyzed_at IS NULL
     ORDER BY interaction_at DESC
     LIMIT $2`,
    [tenantConnectionId, limit],
  );
  return rows.map(r => r.id);
}

/** Return all interactions (optionally decrypted) for a tenant. */
export async function getInteractionsForTenant(
  tenantConnectionId: string,
  options: { limit?: number; offset?: number; includePromptText?: boolean } = {},
): Promise<{ rows: Array<Record<string, any>>; total: number }> {
  const limit = Math.min(options.limit ?? 200, 1000);
  const offset = options.offset ?? 0;

  const countRes = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM copilot_interactions
     WHERE tenant_connection_id = $1`,
    [tenantConnectionId],
  );

  const { rows } = await pool.query(
    `SELECT id, tenant_connection_id, organization_id, graph_interaction_id,
            user_id, user_principal_name, user_display_name, user_department,
            app_class, prompt_text, interaction_at,
            quality_tier, quality_score, risk_level, flags, recommendation,
            analyzed_at, captured_at
     FROM copilot_interactions
     WHERE tenant_connection_id = $1
     ORDER BY interaction_at DESC
     LIMIT $2 OFFSET $3`,
    [tenantConnectionId, limit, offset],
  );

  return {
    rows,
    total: parseInt(countRes.rows[0].total, 10) || 0,
  };
}
