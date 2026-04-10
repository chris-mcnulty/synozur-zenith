import { getAppToken, getSharingLinks, getOneDriveSharingLinks } from "./graph";
import { db } from "../db";
import { storage } from "../storage";
import { sharingLinksInventory, workspaces, onedriveInventory, sharingLinkDiscoveryRuns } from "@shared/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { isCancelled, clearCancellation } from "./discovery-cancellation";
import type { InsertSharingLink, InsertSharingLinkDiscoveryRun } from "@shared/schema";
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
}

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
): Promise<SharingLinkDiscoveryResult> {
  let sharePointLinksDiscovered = 0;
  let oneDriveLinksDiscovered = 0;
  let sitesScanned = 0;
  let usersScanned = 0;
  let itemsScanned = 0;
  const errors: Array<{ context: string; message: string }> = [];

  const run = await storage.createSharingLinkDiscoveryRun({
    tenantConnectionId,
    status: "RUNNING",
  });

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
    return { sharePointLinksDiscovered, oneDriveLinksDiscovered, sitesScanned, usersScanned, itemsScanned, errors };
  }

  clearCancellation(tenantConnectionId, "sharingLinks");

  try {
    const keyBuf = await getMaskingKey(tenantConnectionId);

    const sites = await db
      .select({ id: workspaces.id, m365ObjectId: workspaces.m365ObjectId, displayName: workspaces.displayName })
      .from(workspaces)
      .where(
        and(
          eq(workspaces.tenantConnectionId, tenantConnectionId),
          isNotNull(workspaces.m365ObjectId),
        ),
      );

    console.log(`[sharing-links] Scanning ${sites.length} SharePoint sites for tenant ${tenantConnectionId}`);

    for (const site of sites) {
      if (isCancelled(tenantConnectionId, "sharingLinks")) {
        console.log(`[sharing-links] Discovery cancelled for tenant ${tenantConnectionId}`);
        clearCancellation(tenantConnectionId, "sharingLinks");
        break;
      }

      try {
        const token = await tokenHolder.getToken();
        const result = await getSharingLinks(token, site.m365ObjectId!);
        errors.push(...result.errors);
        sitesScanned++;
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
    }

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
      );

    console.log(`[sharing-links] Scanning ${drives.length} OneDrive users for tenant ${tenantConnectionId}`);

    for (const drive of drives) {
      if (isCancelled(tenantConnectionId, "sharingLinks")) {
        console.log(`[sharing-links] Discovery cancelled for tenant ${tenantConnectionId}`);
        clearCancellation(tenantConnectionId, "sharingLinks");
        break;
      }

      try {
        const token = await tokenHolder.getToken();
        const result = await getOneDriveSharingLinks(token, drive.driveId!);
        errors.push(...result.errors);
        usersScanned++;
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
    }

    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
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
      (staleCount > 0 ? `, marked ${staleCount} stale links inactive` : ""),
    );
  } catch (err: any) {
    errors.push({ context: "discovery", message: err.message });
    console.error(`[sharing-links] Unexpected error during discovery:`, err);
  } finally {
    const finalStatus = errors.length > 0
      ? (sharePointLinksDiscovered + oneDriveLinksDiscovered > 0 ? "PARTIAL" : "FAILED")
      : "COMPLETED";

    await storage.updateSharingLinkDiscoveryRun(run.id, {
      status: finalStatus,
      completedAt: new Date(),
      sharePointLinksFound: sharePointLinksDiscovered,
      oneDriveLinksFound: oneDriveLinksDiscovered,
      sitesScanned,
      usersScanned,
      itemsScanned,
      errors: errors.length > 0 ? errors : undefined,
    });
  }

  return { sharePointLinksDiscovered, oneDriveLinksDiscovered, sitesScanned, usersScanned, itemsScanned, errors };
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
