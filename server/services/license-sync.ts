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
import { getAppToken } from "./graph";

interface GraphSubscribedSku {
  skuId: string;
  skuPartNumber: string;
  prepaidUnits: { enabled: number; suspended: number; warning: number };
  consumedUnits: number;
  servicePlans: Array<{ servicePlanId: string; servicePlanName: string; appliesTo: string }>;
}

interface GraphUserLicense {
  id: string;
  userPrincipalName: string;
  displayName: string;
  department: string | null;
  jobTitle: string | null;
  accountEnabled: boolean;
  signInActivity?: { lastSignInDateTime?: string };
  assignedLicenses: Array<{ skuId: string; disabledPlans: string[] }>;
}

async function graphGet<T>(token: string, url: string): Promise<T[]> {
  const results: T[] = [];
  let nextLink: string | null = url;

  while (nextLink) {
    const res = await fetch(nextLink, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph API error ${res.status}: ${text}`);
    }
    const json = await res.json();
    if (json.value) {
      results.push(...json.value);
    }
    nextLink = json["@odata.nextLink"] ?? null;
  }

  return results;
}

async function getSubscribedSkus(token: string): Promise<GraphSubscribedSku[]> {
  return graphGet<GraphSubscribedSku>(token, "https://graph.microsoft.com/v1.0/subscribedSkus");
}

async function getAllUserLicenseDetails(token: string): Promise<GraphUserLicense[]> {
  const select = "$select=id,userPrincipalName,displayName,department,jobTitle,accountEnabled,assignedLicenses,signInActivity";
  return graphGet<GraphUserLicense>(token, `https://graph.microsoft.com/v1.0/users?${select}&$top=999`);
}

export async function syncLicenses(
  tenantConnectionId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<{ subscriptionCount: number; assignmentCount: number }> {
  const token = await getAppToken(tenantId, clientId, clientSecret);
  const now = new Date();

  // ── Sync subscriptions ───────────────────────────────────────────────────
  const skus = await getSubscribedSkus(token);
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
  const users = await getAllUserLicenseDetails(token);
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
