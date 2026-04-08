/**
 * Content Governance Snapshot Service
 *
 * Computes a point-in-time snapshot of content governance metrics by
 * aggregating data from workspaces, onedriveInventory, and sharingLinksInventory.
 */

import { eq, sql, and, isNull, lt, or } from "drizzle-orm";
import { db } from "../db";
import {
  workspaces,
  onedriveInventory,
  sharingLinksInventory,
  contentGovernanceSnapshots,
} from "@shared/schema";

export async function computeGovernanceSnapshot(tenantConnectionId: string): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // ── SharePoint site metrics ──────────────────────────────────────────────
  const siteRows = await db
    .select({
      totalSites: sql<number>`count(*)::int`,
      missingLabels: sql<number>`count(*) filter (where ${workspaces.sensitivityLabelId} is null)::int`,
      orphanedSites: sql<number>`count(*) filter (where ${workspaces.owners} < 2)::int`,
      externalSharing: sql<number>`count(*) filter (where ${workspaces.externalSharing} = true)::int`,
      overQuota: sql<number>`count(*) filter (where ${workspaces.storageUsedBytes} > ${workspaces.storageAllocatedBytes} * 0.8 and ${workspaces.storageAllocatedBytes} > 0)::int`,
      totalStorageUsed: sql<number>`coalesce(sum(${workspaces.storageUsedBytes}), 0)::bigint`,
    })
    .from(workspaces)
    .where(eq(workspaces.tenantConnectionId, tenantConnectionId));

  const siteStats = siteRows[0] ?? {
    totalSites: 0,
    missingLabels: 0,
    orphanedSites: 0,
    externalSharing: 0,
    overQuota: 0,
    totalStorageUsed: 0,
  };

  // ── OneDrive metrics ─────────────────────────────────────────────────────
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);

  const odRows = await db
    .select({
      totalAccounts: sql<number>`count(*)::int`,
      inactiveCount: sql<number>`count(*) filter (where ${onedriveInventory.lastActivityDate} is null or ${onedriveInventory.lastActivityDate} < ${ninetyDaysAgoStr})::int`,
      totalStorage: sql<number>`coalesce(sum(${onedriveInventory.quotaUsedBytes}), 0)::bigint`,
    })
    .from(onedriveInventory)
    .where(eq(onedriveInventory.tenantConnectionId, tenantConnectionId));

  const odStats = odRows[0] ?? { totalAccounts: 0, inactiveCount: 0, totalStorage: 0 };

  // ── Sharing link counts by type ──────────────────────────────────────────
  const linkRows = await db
    .select({
      linkType: sharingLinksInventory.linkType,
      count: sql<number>`count(*)::int`,
    })
    .from(sharingLinksInventory)
    .where(
      and(
        eq(sharingLinksInventory.tenantConnectionId, tenantConnectionId),
        eq(sharingLinksInventory.isActive, true),
      ),
    )
    .groupBy(sharingLinksInventory.linkType);

  const linkCounts: Record<string, number> = {};
  for (const row of linkRows) {
    linkCounts[row.linkType] = row.count;
  }

  // ── Upsert snapshot ──────────────────────────────────────────────────────
  await db
    .insert(contentGovernanceSnapshots)
    .values({
      tenantConnectionId,
      snapshotDate: today,
      totalSharepointSites: siteStats.totalSites,
      totalOnedriveAccounts: odStats.totalAccounts,
      inactiveOnedriveCount: odStats.inactiveCount,
      orphanedSiteCount: siteStats.orphanedSites,
      sitesMissingLabels: siteStats.missingLabels,
      externalSharingSiteCount: siteStats.externalSharing,
      anonymousLinkCount: linkCounts["anonymous"] ?? 0,
      companyLinkCount: linkCounts["organization"] ?? 0,
      specificPeopleLinkCount: linkCounts["specific"] ?? 0,
      totalStorageUsedBytes: Number(siteStats.totalStorageUsed),
      totalOnedriveStorageUsedBytes: Number(odStats.totalStorage),
      sitesOverQuotaWarning: siteStats.overQuota,
    })
    .onConflictDoUpdate({
      target: [contentGovernanceSnapshots.tenantConnectionId, contentGovernanceSnapshots.snapshotDate],
      set: {
        totalSharepointSites: siteStats.totalSites,
        totalOnedriveAccounts: odStats.totalAccounts,
        inactiveOnedriveCount: odStats.inactiveCount,
        orphanedSiteCount: siteStats.orphanedSites,
        sitesMissingLabels: siteStats.missingLabels,
        externalSharingSiteCount: siteStats.externalSharing,
        anonymousLinkCount: linkCounts["anonymous"] ?? 0,
        companyLinkCount: linkCounts["organization"] ?? 0,
        specificPeopleLinkCount: linkCounts["specific"] ?? 0,
        totalStorageUsedBytes: Number(siteStats.totalStorageUsed),
        totalOnedriveStorageUsedBytes: Number(odStats.totalStorage),
        sitesOverQuotaWarning: siteStats.overQuota,
      },
    });

  console.log(`[governance-snapshot] Snapshot computed for tenant ${tenantConnectionId} on ${today}`);
}
