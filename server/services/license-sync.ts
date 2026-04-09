/**
 * License Sync Service
 *
 * Syncs Microsoft 365 license subscription and assignment data from the
 * Graph API into the local licenseSubscriptions and licenseAssignments tables.
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "../db";
import {
  licenseSubscriptions,
  licenseAssignments,
} from "@shared/schema";
import {
  getAppToken,
  getSubscribedSkus,
  getAllUserLicenseDetails,
} from "./graph";
export async function syncLicenses(
  tenantConnectionId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<{ subscriptionCount: number; assignmentCount: number }> {
  const token = await getAppToken(tenantId, clientId, clientSecret);
  const now = new Date();

  // ── Sync subscriptions ───────────────────────────────────────────────────
  const skuResult = await getSubscribedSkus(token);
  if (skuResult.error) {
    throw new Error(`Failed to fetch subscribed SKUs: ${skuResult.error}`);
  }
  const skus = skuResult.skus;
  for (const sku of skus) {
    const enabledPlans = sku.servicePlans
      .filter((p) => p.appliesTo === "User")
      .map((p) => ({ servicePlanId: p.servicePlanId, servicePlanName: p.servicePlanName }));

    await db
      .insert(licenseSubscriptions)
      .values({
        tenantConnectionId,
        skuId: sku.skuId,
        skuPartNumber: sku.skuPartNumber,
        displayName: sku.skuPartNumber,
        totalUnits: sku.prepaidUnits.enabled,
        consumedUnits: sku.consumedUnits,
        suspendedUnits: sku.prepaidUnits.suspended,
        warningUnits: sku.prepaidUnits.warning,
        enabledServicePlans: enabledPlans,
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: [licenseSubscriptions.tenantConnectionId, licenseSubscriptions.skuId],
        set: {
          skuPartNumber: sku.skuPartNumber,
          displayName: sku.skuPartNumber,
          totalUnits: sku.prepaidUnits.enabled,
          consumedUnits: sku.consumedUnits,
          suspendedUnits: sku.prepaidUnits.suspended,
          warningUnits: sku.prepaidUnits.warning,
          enabledServicePlans: enabledPlans,
          lastSyncedAt: now,
        },
      });
  }

  // ── Sync user assignments ────────────────────────────────────────────────
  const userResult = await getAllUserLicenseDetails(token);
  if (userResult.error) {
    throw new Error(`Failed to fetch user license details: ${userResult.error}`);
  }
  const users = userResult.users;
  // Build a quick lookup for SKU part numbers
  const skuLookup = new Map(skus.map((s) => [s.skuId, s.skuPartNumber]));

  let assignmentCount = 0;
  for (const user of users) {
    if (!user.assignedLicenses || user.assignedLicenses.length === 0) continue;

    for (const lic of user.assignedLicenses) {
      await db
        .insert(licenseAssignments)
        .values({
          tenantConnectionId,
          userId: user.id,
          userPrincipalName: user.userPrincipalName,
          userDisplayName: user.displayName,
          userDepartment: user.department ?? undefined,
          userJobTitle: user.jobTitle ?? undefined,
          accountEnabled: user.accountEnabled,
          lastSignInDate: user.signInActivity?.lastSignInDateTime ?? null,
          skuId: lic.skuId,
          skuPartNumber: skuLookup.get(lic.skuId) ?? null,
          disabledPlans: lic.disabledPlans ?? [],
          lastSyncedAt: now,
        })
        .onConflictDoUpdate({
          target: [licenseAssignments.tenantConnectionId, licenseAssignments.userId, licenseAssignments.skuId],
          set: {
            userPrincipalName: user.userPrincipalName,
            userDisplayName: user.displayName,
            userDepartment: user.department ?? undefined,
            userJobTitle: user.jobTitle ?? undefined,
            accountEnabled: user.accountEnabled,
            lastSignInDate: user.signInActivity?.lastSignInDateTime ?? null,
            skuPartNumber: skuLookup.get(lic.skuId) ?? null,
            disabledPlans: lic.disabledPlans ?? [],
            lastSyncedAt: now,
          },
        });
      assignmentCount++;
    }
  }

  console.log(`[license-sync] Synced ${skus.length} subscriptions, ${assignmentCount} assignments for tenant ${tenantConnectionId}`);
  return { subscriptionCount: skus.length, assignmentCount };
}
