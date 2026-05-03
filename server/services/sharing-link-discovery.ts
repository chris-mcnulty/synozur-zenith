import { getAppToken, getSharingLinks, getOneDriveSharingLinks } from "./graph";
import { db } from "../db";
import { storage } from "../storage";
import { sharingLinksInventory, workspaces, onedriveInventory } from "@shared/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { isCancelled, clearCancellation } from "./discovery-cancellation";
import type { InsertSharingLink } from "@shared/schema";
import type { ProgressFn } from "./job-registry";
import { JobAbortedError } from "./job-tracking";
import {
  getTenantKeyBuffer,
  encryptRecord,
} from "./data-masking";

export interface SharingLinkDiscoveryResult {
  sharePointLinksDiscovered: number;
  oneDriveLinksDiscovered: number;
  sitesScanned: number;
  usersScanned: number;
  itemsScanned: number;
  errors: Array<{ context: string; message: string }>;
  resumed: boolean;
  resumedFromPhase: string | null;
}

export interface SharingLinkDiscoveryOptions {
  /** AbortSignal from trackJobRun — checked before each item. */
  signal?: AbortSignal;
  /** Live progress callback wired to scheduled_job_runs + the in-memory registry. */
  updateProgress?: ProgressFn;
  /**
   * When true, ignore any saved checkpoint cursor and rescan
   * from scratch. Default false — the resume-from-cursor path picks up
   * killed runs automatically.
   */
  ignoreCheckpoint?: boolean;
}

/** How often (in items) to persist a checkpoint to the run row. */
const CHECKPOINT_EVERY = 10;
/** Window for a saved cursor to still be considered valid for resume. */
const RESUME_WINDOW_MS = 6 * 60 * 60 * 1000;

type Phase = "SHAREPOINT" | "ONEDRIVE" | "DONE";

async function refreshableToken(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<{ getToken: () => Promise<string> }> {
  let token = await getAppToken(tenantId, clientId, clientSecret);
  let lastRefreshCheck = Date.now();
  const CHECK_INTERVAL_MS = 5 * 60 * 1000;
  return {
    async getToken() {
      if (Date.now() - lastRefreshCheck > CHECK_INTERVAL_MS) {
        lastRefreshCheck = Date.now();
        const freshToken = await getAppToken(tenantId, clientId, clientSecret);
        if (freshToken !== token) {
          console.log("[sharing-links] Token refreshed (cache returned new token)");
          token = freshToken;
        }
      }
      return token;
    },
  };
}

export async function runSharingLinkDiscovery(
  tenantConnectionId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
  options: SharingLinkDiscoveryOptions = {},
): Promise<SharingLinkDiscoveryResult> {
  const { signal, updateProgress, ignoreCheckpoint = false } = options;

  let sharePointLinksDiscovered = 0;
  let oneDriveLinksDiscovered = 0;
  let sitesScanned = 0;
  let usersScanned = 0;
  let itemsScanned = 0;
  const errors: Array<{ context: string; message: string }> = [];
  let resumed = false;
  let resumedFromPhase: string | null = null;

  // ── Resume cursor lookup ──────────────────────────────────────────────
  let resumeCursor: {
    phase: Phase;
    spoSiteId: string | null;
    oneDriveId: string | null;
  } | null = null;

  let priorResumableRunId: string | null = null;
  let priorResumableRunStartedAt: Date | null = null;
  if (ignoreCheckpoint) {
    try {
      const cleared = await storage.clearAllResumableSharingLinkDiscoveryRuns(
        tenantConnectionId,
      );
      if (cleared > 0) {
        console.log(
          `[sharing-links] Full Rescan: cleared ${cleared} prior resumable row(s) for tenant ${tenantConnectionId}`,
        );
      }
    } catch (err) {
      console.warn(`[sharing-links] failed to clear resumable rows on full rescan:`, err);
    }
  }
  if (!ignoreCheckpoint) {
    try {
      const prior = await storage.getResumableSharingLinkDiscoveryRun(
        tenantConnectionId,
        RESUME_WINDOW_MS,
      );
      if (prior && prior.phase) {
        resumeCursor = {
          phase: prior.phase as Phase,
          spoSiteId: prior.lastProcessedSpoSiteId ?? null,
          oneDriveId: prior.lastProcessedOneDriveId ?? null,
        };
        resumed = true;
        resumedFromPhase = prior.phase;
        priorResumableRunId = prior.id;
        priorResumableRunStartedAt = prior.startedAt ?? null;
        console.log(
          `[sharing-links] Resuming tenant ${tenantConnectionId} from phase=${prior.phase} ` +
            `spoCursor=${prior.lastProcessedSpoSiteId ?? "—"} odCursor=${prior.lastProcessedOneDriveId ?? "—"}`,
        );
      }
    } catch (err) {
      console.warn(`[sharing-links] resume lookup failed:`, err);
    }
  }

  const run = await storage.createSharingLinkDiscoveryRun({
    tenantConnectionId,
    status: "RUNNING",
  });

  if (resumeCursor && priorResumableRunId) {
    try {
      await storage.updateSharingLinkDiscoveryRun(run.id, {
        phase: resumeCursor.phase,
        lastProcessedSpoSiteId: resumeCursor.spoSiteId,
        lastProcessedOneDriveId: resumeCursor.oneDriveId,
        resumable: true,
        progressLabel: `Resuming from ${resumeCursor.phase}`,
      });
    } catch (err) {
      console.warn(`[sharing-links] failed to seed resume cursor on new run:`, err);
    }
  }

  let tokenHolder: { getToken: () => Promise<string> };
  try {
    tokenHolder = await refreshableToken(tenantId, clientId, clientSecret);
  } catch (err: any) {
    errors.push({ context: "getAppToken", message: err.message });
    await storage.updateSharingLinkDiscoveryRun(run.id, {
      status: "FAILED",
      completedAt: new Date(),
      errors,
    });
    return {
      sharePointLinksDiscovered, oneDriveLinksDiscovered,
      sitesScanned, usersScanned, itemsScanned, errors,
      resumed, resumedFromPhase,
    };
  }

  clearCancellation(tenantConnectionId, "sharingLinks");

  // ── Helpers ──────────────────────────────────────────────────────────
  const isAborted = () =>
    signal?.aborted || isCancelled(tenantConnectionId, "sharingLinks");

  // Awaited before the final update to avoid resurrecting resumable=true.
  let inflightCheckpoint: Promise<unknown> = Promise.resolve();

  // Serialize checkpoint writes through inflightCheckpoint so an older
  // write cannot land after a newer one and clobber the cursor.
  const writeCheckpoint = (
    phase: Phase,
    spoSiteId: string | null,
    oneDriveId: string | null,
    itemsTotal: number,
    itemsProcessed: number,
    progressLabel: string,
  ): void => {
    inflightCheckpoint = inflightCheckpoint.then(() =>
      storage
        .updateSharingLinkDiscoveryRun(run.id, {
          phase,
          lastProcessedSpoSiteId: spoSiteId,
          lastProcessedOneDriveId: oneDriveId,
          resumable: true,
          itemsTotal,
          itemsProcessed,
          progressLabel,
          sharePointLinksFound: sharePointLinksDiscovered,
          oneDriveLinksFound: oneDriveLinksDiscovered,
          sitesScanned,
          usersScanned,
          itemsScanned,
        })
        .catch((err) =>
          console.warn(`[sharing-links] checkpoint write failed for run ${run.id}:`, err),
        ),
    );
  };

  let phase: Phase = "SHAREPOINT";

  try {
    const keyBuf = await getMaskingKey(tenantConnectionId);

    // Deterministic ordering for resume cursor safety.
    const sites = await db
      .select({ id: workspaces.id, m365ObjectId: workspaces.m365ObjectId, displayName: workspaces.displayName })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.tenantConnectionId, tenantConnectionId),
          isNotNull(workspaces.m365ObjectId),
        ),
      )
      .orderBy(workspaces.id);

    const drives = await db
      .select({
        id: onedriveInventory.id,
        userId: onedriveInventory.userId,
        userDisplayName: onedriveInventory.userDisplayName,
        driveId: onedriveInventory.driveId,
      })
      .from(onedriveInventory)
      .where(
        and(
          eq(onedriveInventory.tenantConnectionId, tenantConnectionId),
          isNotNull(onedriveInventory.driveId),
        ),
      )
      .orderBy(onedriveInventory.id);

    const totalWork = sites.length + drives.length;

    let spoStartIdx = 0;
    let odStartIdx = 0;

    // Cursor points at the last successful item; resume from the next.
    // If the saved id is no longer present (deleted between runs), use
    // the deterministic id ordering to skip any items <= the cursor so
    // prior work is not redone.
    if (resumeCursor) {
      if (resumeCursor.phase === "SHAREPOINT" && resumeCursor.spoSiteId) {
        const cur = resumeCursor.spoSiteId;
        const idx = sites.findIndex((s) => s.id === cur);
        if (idx >= 0) {
          spoStartIdx = idx + 1;
        } else {
          spoStartIdx = sites.findIndex((s) => s.id > cur);
          if (spoStartIdx < 0) spoStartIdx = sites.length;
        }
        sitesScanned = spoStartIdx;
      } else if (resumeCursor.phase === "ONEDRIVE") {
        spoStartIdx = sites.length;
        sitesScanned = sites.length;
        if (resumeCursor.oneDriveId) {
          const cur = resumeCursor.oneDriveId;
          const idx = drives.findIndex((d) => d.id === cur);
          if (idx >= 0) {
            odStartIdx = idx + 1;
          } else {
            odStartIdx = drives.findIndex((d) => d.id > cur);
            if (odStartIdx < 0) odStartIdx = drives.length;
          }
          usersScanned = odStartIdx;
        }
      } else if (resumeCursor.phase === "DONE") {
        spoStartIdx = sites.length;
        odStartIdx = drives.length;
        sitesScanned = sites.length;
        usersScanned = drives.length;
      }
    }

    console.log(
      `[sharing-links] Tenant ${tenantConnectionId}: ${sites.length} SP sites, ${drives.length} OD drives` +
        (resumeCursor ? ` (resuming from ${resumeCursor.phase}, SP idx=${spoStartIdx}, OD idx=${odStartIdx})` : ""),
    );

    const reportProgress = (label: string, processed: number) => {
      const pct = totalWork > 0 ? Math.round((processed / totalWork) * 100) : 0;
      updateProgress?.(label, pct, { itemsTotal: totalWork, itemsProcessed: processed });
    };

    const initialProcessed = sitesScanned + usersScanned;
    reportProgress(`SharePoint sites: ${sitesScanned}/${sites.length}`, initialProcessed);

    phase = "SHAREPOINT";
    // Cursor advances after every attempted site (success or failure).
    // Failures are recorded in `errors` and surface as PARTIAL/FAILED;
    // they must not block subsequent successes from being checkpointed.
    for (let i = spoStartIdx; i < sites.length; i++) {
      const site = sites[i];
      if (isAborted()) {
        console.log(`[sharing-links] Discovery cancelled for tenant ${tenantConnectionId}`);
        clearCancellation(tenantConnectionId, "sharingLinks");
        throw new JobAbortedError();
      }

      try {
        const token = await tokenHolder.getToken();
        const result = await getSharingLinks(token, site.m365ObjectId!);
        errors.push(...result.errors);
        itemsScanned += result.itemsScanned;
        console.log(
          `[sharing-links] SP site "${site.displayName}": ${result.permissions.length} links, ` +
          `${result.itemsScanned} items scanned` +
          (result.errors.length > 0 ? `, ${result.errors.length} errors` : ""),
        );

        for (const perm of result.permissions) {
          const record: InsertSharingLink = {
            tenantConnectionId,
            resourceType: "SHAREPOINT_SITE",
            resourceId: site.id,
            resourceName: site.displayName,
            itemId: perm.itemId ?? "root",
            itemName: perm.itemName ?? null,
            itemPath: perm.itemPath ?? null,
            linkId: perm.id,
            linkType: normalizeLinkScope(perm.link.scope),
            linkScope: perm.link.type,
            createdBy: extractCreator(perm),
            expiresAt: perm.expirationDateTime ? new Date(perm.expirationDateTime) : null,
            isActive: true,
            lastDiscoveredAt: new Date(),
          };

          await upsertSharingLink(record, keyBuf);
          sharePointLinksDiscovered++;
        }
      } catch (err: any) {
        errors.push({ context: `sp:${site.displayName}`, message: err.message });
      }

      sitesScanned = i + 1;
      const processed = sitesScanned + usersScanned;
      const label = `SharePoint sites: ${sitesScanned}/${sites.length}`;
      reportProgress(label, processed);

      const isLast = i === sites.length - 1;
      if ((i + 1) % CHECKPOINT_EVERY === 0 || isLast) {
        writeCheckpoint("SHAREPOINT", site.id, null, totalWork, processed, label);
      }
    }

    phase = "ONEDRIVE";
    // Skip the boundary write when resuming directly into ONEDRIVE so
    // we don't clobber a still-valid drive cursor with null.
    if (resumeCursor?.phase !== "ONEDRIVE") {
      writeCheckpoint(
        "ONEDRIVE",
        null,
        null,
        totalWork,
        sitesScanned + usersScanned,
        `OneDrive drives: ${usersScanned}/${drives.length}`,
      );
    }

    for (let i = odStartIdx; i < drives.length; i++) {
      const drive = drives[i];
      if (isAborted()) {
        console.log(`[sharing-links] Discovery cancelled for tenant ${tenantConnectionId}`);
        clearCancellation(tenantConnectionId, "sharingLinks");
        throw new JobAbortedError();
      }

      try {
        const token = await tokenHolder.getToken();
        const result = await getOneDriveSharingLinks(token, drive.driveId!);
        errors.push(...result.errors);
        itemsScanned += result.itemsScanned;
        console.log(
          `[sharing-links] OD user "${drive.userDisplayName}": ${result.permissions.length} links, ` +
          `${result.itemsScanned} items scanned` +
          (result.errors.length > 0 ? `, ${result.errors.length} errors` : ""),
        );

        for (const perm of result.permissions) {
          const record: InsertSharingLink = {
            tenantConnectionId,
            resourceType: "ONEDRIVE",
            resourceId: drive.id,
            resourceName: drive.userDisplayName,
            itemId: perm.itemId ?? "root",
            itemName: perm.itemName ?? null,
            itemPath: perm.itemPath ?? null,
            linkId: perm.id,
            linkType: normalizeLinkScope(perm.link.scope),
            linkScope: perm.link.type,
            createdBy: extractCreator(perm),
            expiresAt: perm.expirationDateTime ? new Date(perm.expirationDateTime) : null,
            isActive: true,
            lastDiscoveredAt: new Date(),
          };

          await upsertSharingLink(record, keyBuf);
          oneDriveLinksDiscovered++;
        }
      } catch (err: any) {
        errors.push({ context: `od:${drive.userDisplayName ?? drive.userId}`, message: err.message });
      }

      usersScanned = i + 1;
      const processed = sitesScanned + usersScanned;
      const label = `OneDrive drives: ${usersScanned}/${drives.length}`;
      reportProgress(label, processed);

      const isLast = i === drives.length - 1;
      if ((i + 1) % CHECKPOINT_EVERY === 0 || isLast) {
        writeCheckpoint("ONEDRIVE", null, drive.id, totalWork, processed, label);
      }
    }

    phase = "DONE";

    // Stale-link cutoff is the earliest startedAt across the resume chain.
    let cutoff = run.startedAt;
    if (resumed) {
      const chainStart = await storage
        .getEarliestSharingLinkChainStart(tenantConnectionId, RESUME_WINDOW_MS)
        .catch(() => null);
      if (chainStart && chainStart < cutoff) cutoff = chainStart;
      if (priorResumableRunStartedAt && priorResumableRunStartedAt < cutoff) {
        cutoff = priorResumableRunStartedAt;
      }
    }
    const staleResults = await db
      .update(sharingLinksInventory)
      .set({ isActive: false })
      .where(
        and(
          eq(sharingLinksInventory.tenantConnectionId, tenantConnectionId),
          eq(sharingLinksInventory.isActive, true),
          sql`${sharingLinksInventory.lastDiscoveredAt} < ${cutoff}`,
        ),
      )
      .returning({ id: sharingLinksInventory.id });
    const staleCount = staleResults.length;

    console.log(
      `[sharing-links] Done: ${sharePointLinksDiscovered} SP links, ${oneDriveLinksDiscovered} OD links, ` +
      `${sitesScanned} sites, ${usersScanned} users, ${itemsScanned} items, ${errors.length} errors` +
      (staleCount > 0 ? `, marked ${staleCount} stale links inactive` : "") +
      (resumed ? ` (resumed run, cleanup cutoff=${cutoff.toISOString()})` : ""),
    );
  } catch (err: any) {
    if (err instanceof JobAbortedError) {
      await inflightCheckpoint.catch(() => undefined);
      // User-initiated cancels (legacy cancellation registry) should not
      // resume on the next dispatch; a deploy/restart abort should.
      const userCancelled = isCancelled(tenantConnectionId, "sharingLinks");
      const stillResumable = phase !== "DONE" && !userCancelled;
      await storage.updateSharingLinkDiscoveryRun(run.id, {
        status: "FAILED",
        completedAt: new Date(),
        sharePointLinksFound: sharePointLinksDiscovered,
        oneDriveLinksFound: oneDriveLinksDiscovered,
        sitesScanned,
        usersScanned,
        itemsScanned,
        errors: errors.length > 0 ? errors : undefined,
        resumable: stillResumable,
        phase,
      });
      throw err;
    }
    errors.push({ context: "discovery", message: err.message });
    console.error(`[sharing-links] Unexpected error during discovery:`, err);
  }

  const finalStatus = errors.length > 0
    ? (sharePointLinksDiscovered + oneDriveLinksDiscovered > 0 ? "PARTIAL" : "FAILED")
    : "COMPLETED";

  // Clear resumable on COMPLETED/PARTIAL or any phase==='DONE' run.
  const clearedResumable =
    finalStatus === "COMPLETED" ||
    finalStatus === "PARTIAL" ||
    phase === "DONE";

  await inflightCheckpoint.catch(() => undefined);

  await storage.updateSharingLinkDiscoveryRun(run.id, {
    status: finalStatus,
    completedAt: new Date(),
    sharePointLinksFound: sharePointLinksDiscovered,
    oneDriveLinksFound: oneDriveLinksDiscovered,
    sitesScanned,
    usersScanned,
    itemsScanned,
    errors: errors.length > 0 ? errors : undefined,
    phase,
    resumable: clearedResumable ? false : true,
    progressLabel: null,
  });

  // Retire the prior resumable run we consumed on success.
  const shouldRetirePrior =
    finalStatus === "COMPLETED" || finalStatus === "PARTIAL";
  if (shouldRetirePrior && priorResumableRunId && priorResumableRunId !== run.id) {
    await storage
      .updateSharingLinkDiscoveryRun(priorResumableRunId, { resumable: false })
      .catch((err) =>
        console.warn(
          `[sharing-links] failed to retire prior resumable run ${priorResumableRunId}:`,
          err,
        ),
      );
  }

  return {
    sharePointLinksDiscovered, oneDriveLinksDiscovered,
    sitesScanned, usersScanned, itemsScanned, errors,
    resumed, resumedFromPhase,
  };
}

function normalizeLinkScope(scope: string): string {
  switch (scope) {
    case "anonymous": return "anonymous";
    case "organization": return "organization";
    case "users": return "specific";
    default: return scope;
  }
}

function extractCreator(perm: { grantedToIdentitiesV2?: any[] }): string | null {
  if (!perm.grantedToIdentitiesV2?.length) return null;
  const first = perm.grantedToIdentitiesV2[0];
  return first?.user?.displayName ?? first?.user?.email ?? null;
}

async function getMaskingKey(tenantConnectionId: string): Promise<Buffer | null> {
  const conn = await storage.getTenantConnection(tenantConnectionId);
  if (!conn?.dataMaskingEnabled) return null;
  const keyRow = await storage.getTenantEncryptionKey(tenantConnectionId);
  if (!keyRow?.encryptedKey) return null;
  try {
    return getTenantKeyBuffer(keyRow.encryptedKey);
  } catch {
    return null;
  }
}

async function upsertSharingLink(record: InsertSharingLink, keyBuf: Buffer | null): Promise<void> {
  const data = keyBuf
    ? encryptRecord({ ...record } as Record<string, any>, "sharing_links_inventory", keyBuf) as InsertSharingLink
    : record;

  await db.insert(sharingLinksInventory)
    .values(data)
    .onConflictDoUpdate({
      target: [sharingLinksInventory.tenantConnectionId, sharingLinksInventory.resourceId, sharingLinksInventory.itemId, sharingLinksInventory.linkId],
      set: {
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        resourceName: data.resourceName,
        itemId: data.itemId,
        itemName: data.itemName,
        itemPath: data.itemPath,
        linkType: data.linkType,
        linkScope: data.linkScope,
        createdBy: data.createdBy,
        expiresAt: data.expiresAt,
        isActive: data.isActive,
        lastDiscoveredAt: new Date(),
      },
    });
}
