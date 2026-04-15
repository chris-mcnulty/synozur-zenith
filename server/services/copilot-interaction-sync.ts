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
 * Required permission: AiEnterpriseInteraction.Read.All (application permission,
 * admin consent required). This must be added to the Entra app registration
 * shared by Zenith's other Graph-consuming services.
 *
 * NOTE: the Copilot interactions endpoint is a BETA Graph API. Microsoft may
 * change the schema. The parse layer is isolated here so future changes don't
 * ripple into the analyzer/assessment layer.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  copilotInteractions,
  licenseAssignments,
  type InsertCopilotInteraction,
} from "@shared/schema";
import { getAppToken } from "./graph";
import { storage } from "../storage";
import { encryptRecord, getTenantKeyBuffer } from "./data-masking";
import { decryptToken } from "../utils/encryption";
import { trackJobRun, DuplicateJobError } from "./job-tracking";

/** M365 Copilot SKU part identifier — used to filter license_assignments. */
export const COPILOT_SKU_PART_ID = "639dec6b-bb19-468b-871c-c5c441c4b0cb";

/** Hard upper bound on users per sync to avoid runaway cost. */
const MAX_USERS_PER_SYNC = 2000;

/** Days of interactions to request from the Graph API (rolling window). */
const RETENTION_DAYS = 30;

export interface SyncSummary {
  usersScanned: number;
  interactionsCaptured: number;
  interactionsSkipped: number;
  interactionsPurged: number;
  errors: Array<{ userId?: string; context: string; message: string }>;
  skipReasons?: {
    nonUserPromptType: number;
    noPromptText: number;
    duplicateUpsert: number;
    rateLimitDiscard: number;
  };
  seenInteractionTypes?: Record<string, number>;
  graphPagesTotal?: number;
  graphItemsTotal?: number;
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
  body?: { contentType?: string; content?: string };
  contexts?: Array<{ contextType?: string; content?: string; [key: string]: any }>;
  requestBody?: { contentType?: string; content?: string };
  [key: string]: any;
}

function extractPromptText(interaction: GraphInteraction): string | null {
  if (interaction.body?.content && typeof interaction.body.content === "string" && interaction.body.content.trim().length > 0) {
    return interaction.body.content.trim();
  }
  if (interaction.requestBody?.content && typeof interaction.requestBody.content === "string" && interaction.requestBody.content.trim().length > 0) {
    return interaction.requestBody.content.trim();
  }
  if (Array.isArray(interaction.contexts)) {
    for (const ctx of interaction.contexts) {
      if (ctx?.contextType === "prompt" && typeof ctx.content === "string" && ctx.content.trim().length > 0) {
        return ctx.content.trim();
      }
    }
    for (const ctx of interaction.contexts) {
      if (typeof ctx?.content === "string" && ctx.content.trim().length > 0) {
        return ctx.content.trim();
      }
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

/** Maximum pages to retrieve per user when falling back to unfiltered paging. */
const MAX_PAGES_PER_USER = 30; // 30 × 100 = 3 000 interactions max per user (fallback only)

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch Copilot interactions for a single user from the Graph beta endpoint.
 *
 * The $filter=createdDateTime OData parameter is NOT used. Despite being
 * documented as supported, the Graph filterTransformer consistently rejects it
 * with "Missing 'createdDateTime' value" on this tenant — tested across v1.0/
 * beta, URLSearchParams/raw strings, with/without milliseconds, open/closed
 * ranges. The reference implementation (Sentry) also encounters this but relies
 * on unfiltered paging with client-side date windowing and early-stop.
 *
 * Strategy: page through results with $top=100, apply client-side date filter
 * via sinceMs, and early-stop when a page returns zero new (post-watermark)
 * interactions. Rate-limit with 100ms delay between pages.
 */
interface FetchResult {
  interactions: GraphInteraction[];
  rateLimited: boolean;
  pagesRead: number;
  rawItemCount: number;
  accessError?: string;
}

async function fetchInteractionsForUser(
  token: string,
  userId: string,
  /** Epoch ms lower bound for client-side date filtering; 0 = accept all */
  sinceMs: number,
): Promise<FetchResult> {
  const interactions: GraphInteraction[] = [];
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  let url: string | null =
    `https://graph.microsoft.com/beta/copilot/users/${encodeURIComponent(userId)}` +
    `/interactionHistory/getAllEnterpriseInteractions?$top=100`;

  let pages = 0;
  let rawItemCount = 0;
  let rateLimited = false;

  while (url && pages < MAX_PAGES_PER_USER) {
    if (pages > 0) await delay(100);
    pages++;

    // Plain fetch — NOT graphFetchWithRetry. This endpoint has tight per-user
    // rate limits. Retrying 429s with exponential backoff hammers the already-
    // throttled endpoint and blocks subsequent users. On 429, we mark the fetch
    // as rate-limited and discard results so the watermark stays unchanged for
    // the next sync.
    const res: Response = await fetch(url, { headers });

    if (res.status === 403 || res.status === 404) {
      const errBody = await res.text().catch(() => "");
      const errMsg = errBody.slice(0, 300);
      console.log(`[copilot-interaction-sync] user=${userId} ${res.status}: ${errMsg}`);
      return {
        interactions,
        rateLimited: false,
        pagesRead: pages,
        rawItemCount,
        accessError: `${res.status}: ${errMsg}`,
      };
    }

    if (res.status === 429) {
      console.warn(`[copilot-interaction-sync] user=${userId} 429 throttled on page ${pages}; will retry next sync`);
      rateLimited = true;
      break;
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      const error: Error & { status?: number } = new Error(
        `Graph ${res.status} for user ${userId}: ${bodyText.substring(0, 300)}`,
      );
      error.status = res.status;
      throw error;
    }

    const data = await res.json() as {
      value?: GraphInteraction[];
      "@odata.nextLink"?: string;
    };

    const pageItems = data.value ?? [];
    rawItemCount += pageItems.length;
    let newOnThisPage = 0;
    for (const item of pageItems) {
      if (!item?.id) continue;
      if (sinceMs) {
        const createdMs = item.createdDateTime ? Date.parse(item.createdDateTime) : 0;
        if (!createdMs || createdMs <= sinceMs) continue;
      }
      interactions.push(item);
      newOnThisPage++;
    }

    // Early-stop: if an entire page yielded zero new interactions (all older
    // than our watermark), there's no point paging further.
    if (newOnThisPage === 0 && (data.value?.length ?? 0) > 0) {
      break;
    }

    url = data["@odata.nextLink"] ?? null;

    // Page cap reached with more pages available. The Graph API returns
    // interactions newest-first, so we have captured the most-recent
    // MAX_PAGES_PER_USER × 100 interactions. We save them and let the
    // watermark advance to the newest one; the next sync will efficiently
    // pick up only genuinely new interactions from that point.
    if (pages >= MAX_PAGES_PER_USER && url) {
      console.log(
        `[copilot-interaction-sync] user=${userId} page cap (${MAX_PAGES_PER_USER}) reached; ` +
        `saving ${interactions.length} interactions and advancing watermark`,
      );
    }
  }

  return { interactions, rateLimited, pagesRead: pages, rawItemCount };
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
 * Delegates to storage.purgeCopilotInteractions which enforces the 30-day window.
 */
export async function purgeExpiredInteractions(
  tenantConnectionId: string,
): Promise<number> {
  return storage.purgeCopilotInteractions(tenantConnectionId);
}

/**
 * Sync Copilot interactions for a single tenant connection. Returns a
 * per-user summary. Per-user Graph errors (403 on a specific user, user not
 * found, etc.) are logged and do not abort the entire sync.
 *
 * When `syncRunId` is supplied the function writes the completed summary back
 * to the `copilot_sync_runs` row so callers can poll the run status via the
 * GET /api/copilot-prompt-intelligence/sync/:syncRunId endpoint.
 */
export async function syncCopilotInteractions(
  tenantConnectionId: string,
  syncRunId?: string,
  signal?: AbortSignal,
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    usersScanned: 0,
    interactionsCaptured: 0,
    interactionsSkipped: 0,
    interactionsPurged: 0,
    errors: [],
  };

  /** Persist terminal state to the sync run row (best-effort). */
  async function finalizeSyncRun(status: "COMPLETED" | "FAILED", fatalError?: string) {
    if (!syncRunId) return;
    try {
      await storage.updateCopilotSyncRun(syncRunId, {
        status,
        usersScanned: summary.usersScanned,
        interactionsCaptured: summary.interactionsCaptured,
        interactionsSkipped: summary.interactionsSkipped,
        interactionsPurged: summary.interactionsPurged,
        errorCount: summary.errors.length,
        errors: summary.errors,
        completedAt: new Date(),
        ...(fatalError ? { error: fatalError } : {}),
      });
    } catch (err) {
      console.error(`[copilot-interaction-sync] failed to finalize syncRun=${syncRunId}:`, err);
    }
  }

  const conn = await storage.getTenantConnection(tenantConnectionId);
  if (!conn) {
    const msg = "Tenant connection not found";
    summary.errors.push({ context: "tenantConnection", message: msg });
    await finalizeSyncRun("FAILED", msg);
    return summary;
  }

  const organizationId = conn.organizationId;
  if (!organizationId) {
    const msg = "Tenant connection is missing organizationId";
    summary.errors.push({ context: "tenantConnection", message: msg });
    await finalizeSyncRun("FAILED", msg);
    return summary;
  }

  // Resolve client secret (may be encrypted or provided via env)
  const clientSecret = conn.clientSecret
    ? (() => { try { return decryptToken(conn.clientSecret!); } catch { return conn.clientSecret!; } })()
    : process.env.AZURE_CLIENT_SECRET ?? "";

  const clientId = conn.clientId ?? process.env.AZURE_CLIENT_ID ?? "";
  if (!conn.tenantId || !clientId || !clientSecret) {
    const msg = "Tenant credentials are incomplete";
    summary.errors.push({ context: "credentials", message: msg });
    await finalizeSyncRun("FAILED", msg);
    return summary;
  }

  let token: string;
  try {
    token = await getAppToken(conn.tenantId, clientId, clientSecret);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    summary.errors.push({ context: "getAppToken", message: msg });
    await finalizeSyncRun("FAILED", msg);
    return summary;
  }

  const users = await getCopilotLicensedUsers(tenantConnectionId);
  console.log(`[copilot-interaction-sync] tenant=${tenantConnectionId} found ${users.length} Copilot-licensed users`);
  const retentionCutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const skipReasons = { nonUserPromptType: 0, noPromptText: 0, duplicateUpsert: 0, rateLimitDiscard: 0 };
  const seenInteractionTypes: Record<string, number> = {};
  let graphPagesTotal = 0;
  let graphItemsTotal = 0;
  let noPromptSampleLogged = false;

  for (const user of users) {
    if (signal?.aborted) {
      summary.errors.push({ context: "cancelled", message: "Job cancelled by operator" });
      await finalizeSyncRun("FAILED", "Cancelled by operator");
      return summary;
    }

    summary.usersScanned++;
    let fetchResult: FetchResult;

    const perUserLastDate = await storage.getLatestCopilotInteractionDateForUser(
      tenantConnectionId,
      user.userPrincipalName,
    );
    const effectiveSince = perUserLastDate && perUserLastDate > retentionCutoff
      ? perUserLastDate
      : retentionCutoff;
    const sinceMs = effectiveSince.getTime();

    try {
      fetchResult = await fetchInteractionsForUser(token, user.userId, sinceMs);
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      const errMsg = err instanceof Error ? err.message : String(err);
      summary.errors.push({
        userId: user.userId,
        context: "fetchInteractions",
        message: errMsg,
      });
      console.warn(
        `[copilot-interaction-sync] user=${user.userId} status=${status ?? "?"} error=${errMsg.substring(0, 200)}`,
      );
      continue;
    }

    graphPagesTotal += fetchResult.pagesRead;
    graphItemsTotal += fetchResult.rawItemCount;

    if (fetchResult.accessError) {
      summary.errors.push({
        userId: user.userId,
        context: "accessDenied",
        message: `User ${user.userPrincipalName}: ${fetchResult.accessError}`,
      });
      continue;
    }

    if (fetchResult.rateLimited) {
      skipReasons.rateLimitDiscard += fetchResult.interactions.length;
      console.warn(
        `[copilot-interaction-sync] user=${user.userId} rate-limited (${fetchResult.interactions.length} items buffered); ` +
        `discarding to preserve watermark`,
      );
      continue;
    }

    for (const raw of fetchResult.interactions) {
      const iType = raw.interactionType ?? "(undefined)";
      seenInteractionTypes[iType] = (seenInteractionTypes[iType] || 0) + 1;

      if (raw.interactionType && raw.interactionType !== "userPrompt") {
        skipReasons.nonUserPromptType++;
        summary.interactionsSkipped++;
        continue;
      }
      const promptText = extractPromptText(raw);
      if (!promptText) {
        skipReasons.noPromptText++;
        summary.interactionsSkipped++;
        if (!noPromptSampleLogged) {
          noPromptSampleLogged = true;
          const safeKeys = Object.keys(raw).filter(k => k !== "body" && k !== "contexts");
          console.warn(
            `[copilot-interaction-sync] DIAGNOSTIC: interaction with no extractable prompt ` +
            `id=${raw.id} appClass=${raw.appClass ?? "?"} type=${raw.interactionType ?? "?"} ` +
            `hasBody=${!!raw.body} bodyContentLen=${raw.body?.content?.length ?? 0} ` +
            `contextsLen=${raw.contexts?.length ?? 0} ` +
            `contextTypes=${(raw.contexts ?? []).map(c => c.contextType ?? "?").join(",")} ` +
            `topLevelKeys=[${safeKeys.join(",")}]`,
          );
        }
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
        else {
          skipReasons.duplicateUpsert++;
          summary.interactionsSkipped++;
        }
      } catch (err: unknown) {
        summary.errors.push({
          userId: user.userId,
          context: "upsertInteraction",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (summary.usersScanned < users.length) await delay(300);
  }

  try {
    summary.interactionsPurged = await purgeExpiredInteractions(tenantConnectionId);
  } catch (err: unknown) {
    summary.errors.push({
      context: "purgeExpiredInteractions",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  summary.skipReasons = skipReasons;
  summary.seenInteractionTypes = seenInteractionTypes;
  summary.graphPagesTotal = graphPagesTotal;
  summary.graphItemsTotal = graphItemsTotal;

  console.log(
    `[copilot-interaction-sync] tenant=${tenantConnectionId} ` +
    `users=${summary.usersScanned} captured=${summary.interactionsCaptured} ` +
    `skipped=${summary.interactionsSkipped} purged=${summary.interactionsPurged} ` +
    `errors=${summary.errors.length} ` +
    `graphPages=${graphPagesTotal} graphItems=${graphItemsTotal}`,
  );
  console.log(
    `[copilot-interaction-sync] skipReasons: ` +
    `nonUserPromptType=${skipReasons.nonUserPromptType} noPromptText=${skipReasons.noPromptText} ` +
    `duplicateUpsert=${skipReasons.duplicateUpsert} rateLimitDiscard=${skipReasons.rateLimitDiscard}`,
  );
  if (Object.keys(seenInteractionTypes).length > 0) {
    console.log(
      `[copilot-interaction-sync] interactionTypes seen: ${JSON.stringify(seenInteractionTypes)}`,
    );
  }

  await finalizeSyncRun("COMPLETED");
  return summary;
}

/**
 * Create a sync run record and execute `syncCopilotInteractions` in the
 * background (via setImmediate). Returns the `syncRunId` immediately so the
 * caller can return it to the HTTP client for polling.
 *
 * The run starts in RUNNING state. Stale runs (> 2 hours) are auto-failed
 * before creating a new one, matching the assessment service pattern.
 */
export async function startTrackedSync(
  tenantConnectionId: string,
  organizationId: string,
  triggeredBy: string | null,
): Promise<string> {
  // Clean up any stale RUNNING rows from previous crashed syncs.
  await storage.failStaleCopilotSyncRuns(tenantConnectionId);

  const run = await storage.createCopilotSyncRun({
    tenantConnectionId,
    organizationId,
    status: "RUNNING",
    triggeredBy: triggeredBy ?? undefined,
    startedAt: new Date(),
  });

  // BL-039: dual-write to scheduled_job_runs and route through the unified
  // job registry. The legacy copilot_sync_runs row is preserved so the
  // existing /api/copilot-prompt-intelligence/sync/:syncRunId polling UI
  // continues to work; trackJobRun's jobId is correlated via targetId.
  setImmediate(() => {
    void trackJobRun(
      {
        jobType: "copilotSync",
        organizationId,
        tenantConnectionId,
        triggeredBy: "manual",
        triggeredByUserId: triggeredBy,
        targetId: run.id,
        targetName: `Copilot interaction sync (${run.id.slice(0, 8)})`,
      },
      (signal) => syncCopilotInteractions(tenantConnectionId, run.id, signal),
    ).catch(async (err) => {
      if (err instanceof DuplicateJobError) {
        await storage
          .updateCopilotSyncRun(run.id, {
            status: "FAILED",
            error: "A Copilot sync is already running for this tenant",
            completedAt: new Date(),
          })
          .catch(() => undefined);
        return;
      }
      console.error(`[copilot-interaction-sync] uncaught error syncRun=${run.id}:`, err);
      await storage
        .updateCopilotSyncRun(run.id, {
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
          completedAt: new Date(),
        })
        .catch(() => undefined);
    });
  });

  return run.id;
}

/**
 * Fetch interactions already captured for a tenant that have not yet been
 * scored by the analyzer. Used by the analysis pass.
 */
export async function getUnanalyzedInteractionIds(
  tenantConnectionId: string,
  limit = 1000,
): Promise<string[]> {
  return storage.getUnanalyzedCopilotInteractionIds(tenantConnectionId, limit);
}

/** Return interactions for a tenant, optionally including raw prompt text.
 * Prompt text is omitted by default to avoid inadvertent PII exposure in
 * API responses. Pass `includePromptText: true` only from callers that have
 * verified the caller's authorization to see raw prompt content.
 */
export async function getInteractionsForTenant(
  tenantConnectionId: string,
  options: { limit?: number; offset?: number; includePromptText?: boolean } = {},
): Promise<{ rows: Array<Record<string, any>>; total: number }> {
  return storage.getCopilotInteractionsForTenant(tenantConnectionId, options);
}
