import { getAppToken, getSharingLinks, getOneDriveSharingLinks } from "./graph";
import { db } from "../db";
import { storage } from "../storage";
import { sharingLinksInventory, workspaces, onedriveInventory } from "@shared/schema";
import { eq, and, isNotNull, sql } from "drizzle-orm";
import { isCancelled, clearCancellation } from "./discovery-cancellation";
import type { InsertSharingLink } from "@shared/schema";
import {
  getTenantKeyBuffer,
  encryptRecord,
} from "./data-masking";

export interface SharingLinkDiscoveryResult {
  sharePointLinksDiscovered: number;
  oneDriveLinksDiscovered: number;
  sitesScanned: number;
  usersScanned: number;
  errors: Array<{ context: string; message: string }>;
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
  const errors: Array<{ context: string; message: string }> = [];

  let token: string;
  try {
    token = await getAppToken(tenantId, clientId, clientSecret);
  } catch (err: any) {
    errors.push({ context: "getAppToken", message: err.message });
    return { sharePointLinksDiscovered, oneDriveLinksDiscovered, sitesScanned, usersScanned, errors };
  }

  clearCancellation(tenantConnectionId, "sharingLinks");

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
      const { permissions, error } = await getSharingLinks(token, site.m365ObjectId!);
      if (error) {
        errors.push({ context: `sp:${site.displayName}`, message: error });
      }
      sitesScanned++;

      for (const perm of permissions) {
        const record: InsertSharingLink = {
          tenantConnectionId,
          resourceType: "SHAREPOINT_SITE",
          resourceId: site.id,
          resourceName: site.displayName,
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
      const { permissions, error } = await getOneDriveSharingLinks(token, drive.userId);
      if (error) {
        errors.push({ context: `od:${drive.userDisplayName ?? drive.userId}`, message: error });
      }
      usersScanned++;

      for (const perm of permissions) {
        const record: InsertSharingLink = {
          tenantConnectionId,
          resourceType: "ONEDRIVE",
          resourceId: drive.id,
          resourceName: drive.userDisplayName,
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
  const [staleResult] = await db
    .update(sharingLinksInventory)
    .set({ isActive: false })
    .where(
      and(
        eq(sharingLinksInventory.tenantConnectionId, tenantConnectionId),
        eq(sharingLinksInventory.isActive, true),
        sql`${sharingLinksInventory.lastDiscoveredAt} < ${cutoff}`,
      ),
    )
    .returning({ count: sql<number>`1` });

  const staleCount = staleResult ? 1 : 0;

  console.log(
    `[sharing-links] Done: ${sharePointLinksDiscovered} SP links, ${oneDriveLinksDiscovered} OD links, ` +
    `${sitesScanned} sites, ${usersScanned} users, ${errors.length} errors` +
    (staleCount > 0 ? `, marked stale links inactive` : ""),
  );

  return { sharePointLinksDiscovered, oneDriveLinksDiscovered, sitesScanned, usersScanned, errors };
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
      target: [sharingLinksInventory.tenantConnectionId, sharingLinksInventory.linkId],
      set: {
        resourceType: data.resourceType,
        resourceId: data.resourceId,
        resourceName: data.resourceName,
        linkType: data.linkType,
        linkScope: data.linkScope,
        createdBy: data.createdBy,
        expiresAt: data.expiresAt,
        isActive: data.isActive,
        lastDiscoveredAt: new Date(),
      },
    });
}
