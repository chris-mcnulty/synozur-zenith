/**
 * Zenith User Inventory service.
 *
 * Populates and refreshes a cached, minimal, read-only snapshot of tenant
 * users using Microsoft Graph. This is NOT an identity system — it exists
 * solely to provide a stable, bounded user set for reports (e.g. the Email
 * Content Storage Report) without re-enumerating Entra on every report run.
 *
 * Architectural directive:
 *   Zenith must NOT enumerate users directly from Entra ID as part of
 *   running a report. Reports consume rows from `user_inventory` instead.
 */

import { getAppToken, fetchUserInventoryPage, type InventoryUser } from "./graph";
import { storage } from "../storage";
import type { InsertUserInventory } from "@shared/schema";

// ── Defaults ─────────────────────────────────────────────────────────────────

/** Hard cap on users ingested in a single refresh. Admins can override. */
export const DEFAULT_MAX_USERS = 100_000;

/**
 * Inventory is considered stale after this many hours. Reports can degrade
 * gracefully (continue but annotate) when the inventory is stale.
 */
export const DEFAULT_INVENTORY_MAX_AGE_HOURS = 48;

export interface UserInventoryRunOptions {
  /** Hard cap on users. Defaults to DEFAULT_MAX_USERS. */
  maxUsers?: number;
  /** Skip the refresh and return early if the cache is younger than this. */
  minRefreshIntervalMinutes?: number;
  /**
   * BL-039: optional abort signal. When `signal.aborted` becomes true, the
   * paging loop stops at the next page boundary and the run is finalised
   * with status="CANCELLED".
   */
  signal?: AbortSignal;
}

export interface UserInventoryRunResult {
  runId: string | null;
  status: "COMPLETED" | "PARTIAL" | "FAILED" | "CAP_REACHED" | "SKIPPED" | "CANCELLED";
  usersDiscovered: number;
  usersMarkedDeleted: number;
  pagesFetched: number;
  errors: Array<{ context: string; message: string }>;
}

/**
 * Refresh the user inventory cache for a tenant. Pages through Graph /users
 * with checkpoints; respects per-run caps; tolerates transient failures via
 * graphFetchWithRetry (inside fetchUserInventoryPage).
 *
 * Designed for background/admin execution. Safe to run repeatedly — an
 * upsert on (tenantConnectionId, userId) avoids duplicates.
 */
export async function runUserInventoryRefresh(
  tenantConnectionId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
  options: UserInventoryRunOptions = {},
): Promise<UserInventoryRunResult> {
  const maxUsers = Math.max(1, Math.floor(options.maxUsers ?? DEFAULT_MAX_USERS));
  const errors: Array<{ context: string; message: string }> = [];

  // Optional debounce: skip refresh if cache is fresh enough.
  if (options.minRefreshIntervalMinutes && options.minRefreshIntervalMinutes > 0) {
    const latest = await storage.getLatestUserInventoryRun(tenantConnectionId);
    if (latest?.completedAt) {
      const ageMs = Date.now() - new Date(latest.completedAt).getTime();
      if (ageMs < options.minRefreshIntervalMinutes * 60 * 1000) {
        return {
          runId: latest.id,
          status: "SKIPPED",
          usersDiscovered: latest.usersDiscovered ?? 0,
          usersMarkedDeleted: latest.usersMarkedDeleted ?? 0,
          pagesFetched: latest.pagesFetched ?? 0,
          errors: [],
        };
      }
    }
  }

  const run = await storage.createUserInventoryRun({
    tenantConnectionId,
    status: "RUNNING",
    maxUsersCap: maxUsers,
  });

  // Record the time the run started (before any upserts). All upserts will set
  // `lastRefreshedAt = new Date()`, so any row with lastRefreshedAt < runStartedAt
  // was not touched in this run and can be marked as DELETED.
  const runStartedAt = run.startedAt ? new Date(run.startedAt) : new Date();

  let token: string;
  try {
    token = await getAppToken(tenantId, clientId, clientSecret);
  } catch (err: any) {
    errors.push({ context: "getAppToken", message: err?.message ?? String(err) });
    await storage.updateUserInventoryRun(run.id, {
      status: "FAILED",
      completedAt: new Date(),
      errors,
    });
    return {
      runId: run.id,
      status: "FAILED",
      usersDiscovered: 0,
      usersMarkedDeleted: 0,
      pagesFetched: 0,
      errors,
    };
  }

  let usersDiscovered = 0;
  let pagesFetched = 0;
  let nextLink: string | null | undefined;
  let capReached = false;
  let cancelled = false;

  try {
    do {
      // BL-039: stop paging if the job was cancelled via AbortController.
      if (options.signal?.aborted) {
        cancelled = true;
        break;
      }

      const page = await fetchUserInventoryPage(token, nextLink ?? undefined);
      pagesFetched++;

      if (page.status !== 200 && page.users.length === 0) {
        errors.push({
          context: `fetchUserInventoryPage:p${pagesFetched}`,
          message: `Graph HTTP ${page.status}`,
        });
        // On hard failure, stop paging but keep what we have.
        break;
      }

      const remaining = maxUsers - usersDiscovered;
      if (remaining <= 0) {
        capReached = true;
        break;
      }

      const batch = page.users.slice(0, remaining);

      // Batch upsert the page in a single SQL statement instead of looping
      // one-by-one, which would cause O(n) round-trips for large tenants.
      try {
        await storage.batchUpsertUserInventory(
          batch.map(user => buildInventoryRecord(tenantConnectionId, user)),
        );
        usersDiscovered += batch.length;
      } catch (err: any) {
        // Fall back to individual upserts so a single bad record doesn't
        // block the whole page.
        for (const user of batch) {
          try {
            await storage.upsertUserInventory(buildInventoryRecord(tenantConnectionId, user));
            usersDiscovered++;
          } catch (upsertErr: any) {
            errors.push({
              context: `upsert:${user.id}`,
              message: upsertErr?.message ?? String(upsertErr),
            });
          }
        }
      }

      // Checkpoint progress so operators can see it live.
      await storage.updateUserInventoryRun(run.id, {
        usersDiscovered,
        pagesFetched,
      });

      if (batch.length < page.users.length) {
        // We stopped mid-page because of the cap.
        capReached = true;
        break;
      }

      nextLink = page.nextLink ?? null;
    } while (nextLink);
  } catch (err: any) {
    errors.push({ context: "paging", message: err?.message ?? String(err) });
  }

  // Mark stale users as DELETED so the inventory reflects de-provisioning.
  // Uses a timestamp-based approach (lastRefreshedAt < runStartedAt) to avoid
  // a huge NOT IN (...) clause that would be impractical for large tenants.
  let usersMarkedDeleted = 0;
  try {
    usersMarkedDeleted = await storage.markMissingUserInventoryAsDeleted(
      tenantConnectionId,
      runStartedAt,
    );
  } catch (err: any) {
    errors.push({ context: "markMissingAsDeleted", message: err?.message ?? String(err) });
  }

  const status: UserInventoryRunResult["status"] = cancelled
    ? "CANCELLED"
    : capReached
      ? "CAP_REACHED"
      : errors.length > 0 && usersDiscovered > 0
        ? "PARTIAL"
        : errors.length > 0
          ? "FAILED"
          : "COMPLETED";

  await storage.updateUserInventoryRun(run.id, {
    status,
    completedAt: new Date(),
    usersDiscovered,
    usersMarkedDeleted,
    pagesFetched,
    errors,
  });

  console.log(
    `[user-inventory] tenant=${tenantConnectionId} status=${status} ` +
      `users=${usersDiscovered} deleted=${usersMarkedDeleted} pages=${pagesFetched} ` +
      `errors=${errors.length}`,
  );

  return {
    runId: run.id,
    status,
    usersDiscovered,
    usersMarkedDeleted,
    pagesFetched,
    errors,
  };
}

function buildInventoryRecord(
  tenantConnectionId: string,
  user: InventoryUser,
): InsertUserInventory {
  return {
    tenantConnectionId,
    userId: user.id,
    userPrincipalName: user.userPrincipalName,
    mail: user.mail,
    displayName: user.displayName,
    accountEnabled: user.accountEnabled,
    userType: user.userType === "Guest" ? "Guest" : "Member",
    lastRefreshedAt: new Date(),
    discoveryStatus: "ACTIVE",
  };
}

/**
 * Returns the age (in hours) of the freshest COMPLETED inventory run for
 * a tenant, or null if no completed run exists.
 */
export async function getUserInventoryAgeHours(
  tenantConnectionId: string,
): Promise<number | null> {
  const latest = await storage.getLatestUserInventoryRun(tenantConnectionId);
  if (!latest?.completedAt) return null;
  const ageMs = Date.now() - new Date(latest.completedAt).getTime();
  return ageMs / (60 * 60 * 1000);
}

/** Whether the tenant's inventory is older than the configured staleness window. */
export async function isUserInventoryStale(
  tenantConnectionId: string,
  maxAgeHours: number = DEFAULT_INVENTORY_MAX_AGE_HOURS,
): Promise<boolean> {
  const age = await getUserInventoryAgeHours(tenantConnectionId);
  if (age === null) return true; // no inventory at all → stale
  return age > maxAgeHours;
}
