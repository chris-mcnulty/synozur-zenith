/**
 * Copilot Interaction Sync Service (BL-038)
 *
 * Syncs ALL Microsoft 365 Copilot interactions (userPrompt AND aiResponse) from
 * the Microsoft Graph Beta API for all Copilot-licensed users in a given tenant.
 * Implements incremental collection via per-user $filter=createdDateTime gt {date}
 * and a rolling 30-day retention purge.
 *
 * Graph endpoint (per-user, NOT tenant-wide):
 *   GET /beta/copilot/users/{userId}/interactionHistory/getAllEnterpriseInteractions
 *
 * Required permission: AiEnterpriseInteraction.Read.All (application permission,
 * admin consent required).
 *
 * Key design decisions aligned with reference implementation:
 *   - Store BOTH userPrompt and aiResponse (linked via requestId)
 *   - Use sessionId to group full conversation threads
 *   - Use $filter=createdDateTime gt {lastDate} for incremental collection
 *   - UNIQUE constraint on graphInteractionId for idempotent re-runs
 *   - Gracefully skip 403/404 users (no Copilot license or not provisioned)
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

export const COPILOT_SKU_PART_ID = "639dec6b-bb19-468b-871c-c5c441c4b0cb";

const MAX_USERS_PER_SYNC = 2000;
const RETENTION_DAYS = 30;
const MAX_PAGES_PER_USER = 200;
const MAX_THROTTLE_RETRIES = 3;

export interface SyncSummary {
  usersScanned: number;
  interactionsCaptured: number;
  interactionsSkipped: number;
  interactionsPurged: number;
  errors: Array<{ userId?: string; context: string; message: string }>;
  skipReasons?: {
    duplicateUpsert: number;
    invalidDate: number;
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
  requestId?: string;
  sessionId?: string;
  body?: { contentType?: string; content?: string };
  contexts?: any[];
  attachments?: any[];
  links?: any[];
  mentions?: any[];
  [key: string]: any;
}

async function getCopilotLicensedUsers(
  tenantConnectionId: string,
): Promise<CopilotLicensedUser[]> {
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
      eq(licenseAssignments.tenantConnectionId, tenantConnectionId),
    );

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

  const result = Array.from(byUser.values()).slice(0, MAX_USERS_PER_SYNC);
  const totalLicenseRows = rows.length;
  const copilotSkuRows = rows.filter(r => {
    const sku = (r.skuPartNumber ?? "").toUpperCase();
    return r.skuId === COPILOT_SKU_PART_ID || sku.includes("COPILOT");
  }).length;
  const upnSample = result.length <= 20
    ? result.map(u => u.userPrincipalName).join(", ")
    : `${result.slice(0, 10).map(u => u.userPrincipalName).join(", ")} ... +${result.length - 10} more`;
  console.log(
    `[copilot-interaction-sync] getCopilotLicensedUsers: ` +
    `licenseRows=${totalLicenseRows} copilotSkuRows=${copilotSkuRows} ` +
    `uniqueUsers=${result.length} ` +
    `users=[${upnSample}]`,
  );
  return result;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FetchResult {
  interactions: GraphInteraction[];
  rateLimited: boolean;
  pagesRead: number;
  rawItemCount: number;
  accessError?: string;
}

/**
 * Fetch Copilot interactions for a single user from the Graph beta endpoint.
 *
 * Uses $filter=createdDateTime gt {lastDate} for incremental collection when
 * a lastDate is provided. Falls back to unfiltered paging if $filter is
 * rejected (400). Handles 403/404 gracefully (no Copilot license or not
 * provisioned). Retries 429 with Retry-After back-off.
 */
async function fetchInteractionsForUser(
  token: string,
  userId: string,
  upn?: string,
  lastDate?: Date | null,
): Promise<FetchResult> {
  const interactions: GraphInteraction[] = [];
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };

  const basePath = `/interactionHistory/getAllEnterpriseInteractions?$top=100`;
  const buildUrl = (id: string, withFilter: boolean) => {
    let u = `https://graph.microsoft.com/beta/copilot/users/${encodeURIComponent(id)}${basePath}`;
    if (withFilter && lastDate) {
      u += `&$filter=createdDateTime gt ${lastDate.toISOString()}`;
    }
    return u;
  };

  let url: string | null = buildUrl(userId, !!lastDate);
  let usingFilter = !!lastDate;
  let triedWithoutFilter = false;
  let triedUpnFallback = false;

  let pages = 0;
  let rawItemCount = 0;
  let rateLimited = false;
  let throttleRetries = 0;

  while (url && pages < MAX_PAGES_PER_USER) {
    if (pages > 0) await delay(100);
    pages++;

    const res: Response = await fetch(url, { headers });

    if (res.status === 400 && pages === 1 && usingFilter && !triedWithoutFilter) {
      triedWithoutFilter = true;
      usingFilter = false;
      console.warn(
        `[copilot-interaction-sync] user=${userId} 400 on page 1 ($filter rejected); retrying without filter`,
      );
      url = buildUrl(userId, false);
      pages = 0;
      continue;
    }

    if (res.status === 403 || res.status === 404) {
      const errBody = await res.text().catch(() => "");
      const errMsg = errBody.slice(0, 300);

      if (res.status === 404 && pages === 1 && upn && !triedUpnFallback && !userId.includes("@")) {
        triedUpnFallback = true;
        console.warn(
          `[copilot-interaction-sync] user=${userId} 404 on page 1; retrying with UPN=${upn}`,
        );
        url = buildUrl(upn, usingFilter);
        pages = 0;
        continue;
      }

      if (pages > 1 && interactions.length > 0) {
        console.warn(
          `[copilot-interaction-sync] user=${userId} ${res.status} mid-stream on page ${pages}; ` +
          `keeping ${interactions.length} items`,
        );
        break;
      }

      console.log(`[copilot-interaction-sync] user=${userId} ${res.status} on page ${pages}: ${errMsg}`);
      return {
        interactions,
        rateLimited: false,
        pagesRead: pages,
        rawItemCount,
        accessError: `${res.status}: ${errMsg}`,
      };
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") ?? "", 10);
      const waitSec = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 120) : 30;
      throttleRetries++;
      if (throttleRetries > MAX_THROTTLE_RETRIES) {
        console.warn(
          `[copilot-interaction-sync] user=${userId} 429 on page ${pages} after ${throttleRetries} retries; giving up`,
        );
        rateLimited = true;
        break;
      }
      console.warn(
        `[copilot-interaction-sync] user=${userId} 429 on page ${pages}; ` +
        `waiting ${waitSec}s (retry ${throttleRetries}/${MAX_THROTTLE_RETRIES})`,
      );
      await delay(waitSec * 1000);
      pages--;
      continue;
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
    for (const item of pageItems) {
      if (!item?.id) continue;
      interactions.push(item);
    }

    url = data["@odata.nextLink"] ?? null;

    if (pages >= MAX_PAGES_PER_USER && url) {
      console.log(
        `[copilot-interaction-sync] user=${userId} page cap (${MAX_PAGES_PER_USER}) reached; ` +
        `saving ${interactions.length} interactions`,
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
  const encryptionContext =
    await getInteractionEncryptionContext(tenantConnectionId);

  let toInsert = record;
  if (encryptionContext.shouldEncrypt) {
    const withoutRaw = { ...record, rawData: null };
    toInsert = encryptRecord(
      withoutRaw,
      "copilot_interactions",
      encryptionContext.keyBuffer,
    );
  }

  const inserted = await db
    .insert(copilotInteractions)
    .values(toInsert)
    .onConflictDoNothing({
      target: [copilotInteractions.tenantConnectionId, copilotInteractions.graphInteractionId],
    })
    .returning({ id: copilotInteractions.id });

  return inserted.length > 0 ? "inserted" : "skipped";
}

export async function purgeExpiredInteractions(
  tenantConnectionId: string,
): Promise<number> {
  return storage.purgeCopilotInteractions(tenantConnectionId);
}

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

  const skipReasons = { duplicateUpsert: 0, invalidDate: 0 };
  const seenInteractionTypes: Record<string, number> = {};
  let graphPagesTotal = 0;
  let graphItemsTotal = 0;

  for (const user of users) {
    if (signal?.aborted) {
      summary.errors.push({ context: "cancelled", message: "Job cancelled by operator" });
      await finalizeSyncRun("FAILED", "Cancelled by operator");
      return summary;
    }

    summary.usersScanned++;

    const rawLastDate = await storage.getLatestCopilotInteractionDateForUser(
      tenantConnectionId, user.userPrincipalName,
    );
    const lastDate = rawLastDate instanceof Date ? rawLastDate
      : rawLastDate ? new Date(rawLastDate as any) : null;
    if (lastDate && !isNaN(lastDate.getTime())) {
      console.log(
        `[copilot-interaction-sync] user=${user.userPrincipalName} incremental since ${lastDate.toISOString()}`,
      );
    }

    let fetchResult: FetchResult;
    try {
      const validLastDate = (lastDate && !isNaN(lastDate.getTime())) ? lastDate : null;
      fetchResult = await fetchInteractionsForUser(token, user.userId, user.userPrincipalName, validLastDate);
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

    console.log(
      `[copilot-interaction-sync] user=${user.userPrincipalName} ` +
      `graphItems=${fetchResult.rawItemCount} ` +
      `fetched=${fetchResult.interactions.length} pages=${fetchResult.pagesRead}` +
      `${fetchResult.rateLimited ? " RATE_LIMITED" : ""}` +
      `${fetchResult.accessError ? ` ERROR=${fetchResult.accessError.slice(0, 80)}` : ""}`,
    );

    if (fetchResult.accessError) {
      summary.errors.push({
        userId: user.userId,
        context: "accessDenied",
        message: `User ${user.userPrincipalName}: ${fetchResult.accessError}`,
      });
      continue;
    }

    if (fetchResult.rateLimited && fetchResult.interactions.length === 0) {
      console.warn(
        `[copilot-interaction-sync] user=${user.userId} rate-limited with 0 items; skipping`,
      );
      continue;
    }

    for (const raw of fetchResult.interactions) {
      const iType = raw.interactionType ?? "(undefined)";
      seenInteractionTypes[iType] = (seenInteractionTypes[iType] || 0) + 1;

      const createdMs = raw.createdDateTime ? Date.parse(raw.createdDateTime) : NaN;
      if (!Number.isFinite(createdMs)) {
        skipReasons.invalidDate++;
        summary.interactionsSkipped++;
        continue;
      }

      const rawBodyContent = raw.body?.content;
      const bodyContent = (typeof rawBodyContent === "string" && rawBodyContent.trim().length > 0)
        ? rawBodyContent.trim()
        : null;
      const promptText = (raw.interactionType === "userPrompt" && bodyContent) ? bodyContent : null;

      try {
        const outcome = await upsertInteraction(tenantConnectionId, {
          tenantConnectionId,
          organizationId,
          graphInteractionId: raw.id,
          requestId: raw.requestId ?? null,
          sessionId: raw.sessionId ?? null,
          interactionType: raw.interactionType ?? "userPrompt",
          userId: user.userId,
          userPrincipalName: user.userPrincipalName,
          userDisplayName: user.userDisplayName,
          userDepartment: user.userDepartment,
          appClass: raw.appClass ?? null,
          promptText,
          bodyContent,
          bodyContentType: raw.body?.contentType ?? null,
          contexts: raw.contexts ?? null,
          attachments: raw.attachments ?? null,
          links: raw.links ?? null,
          mentions: raw.mentions ?? null,
          rawData: raw,
          interactionAt: new Date(raw.createdDateTime),
          flags: [],
        });
        if (outcome === "inserted") summary.interactionsCaptured++;
        else {
          skipReasons.duplicateUpsert++;
          summary.interactionsSkipped++;
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes("duplicate") || errMsg.includes("unique")) {
          skipReasons.duplicateUpsert++;
          summary.interactionsSkipped++;
        } else {
          summary.errors.push({
            userId: user.userId,
            context: "upsertInteraction",
            message: errMsg,
          });
        }
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
    `duplicateUpsert=${skipReasons.duplicateUpsert} invalidDate=${skipReasons.invalidDate}`,
  );
  if (Object.keys(seenInteractionTypes).length > 0) {
    console.log(
      `[copilot-interaction-sync] interactionTypes seen: ${JSON.stringify(seenInteractionTypes)}`,
    );
  }

  await finalizeSyncRun("COMPLETED");
  return summary;
}

export async function startTrackedSync(
  tenantConnectionId: string,
  organizationId: string,
  triggeredBy: string | null,
): Promise<string> {
  await storage.failStaleCopilotSyncRuns(tenantConnectionId);

  const run = await storage.createCopilotSyncRun({
    tenantConnectionId,
    organizationId,
    status: "RUNNING",
    triggeredBy: triggeredBy ?? undefined,
    startedAt: new Date(),
  });

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

export async function getUnanalyzedInteractionIds(
  tenantConnectionId: string,
  limit = 1000,
): Promise<string[]> {
  return storage.getUnanalyzedCopilotInteractionIds(tenantConnectionId, limit);
}

export async function getInteractionsForTenant(
  tenantConnectionId: string,
  options: { limit?: number; offset?: number; includePromptText?: boolean } = {},
): Promise<{ rows: Array<Record<string, any>>; total: number }> {
  return storage.getCopilotInteractionsForTenant(tenantConnectionId, options);
}
