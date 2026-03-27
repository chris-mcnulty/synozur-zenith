/**
 * OneDrive Inventory Discovery Service
 *
 * Discovers ALL OneDrive for Business drives in a tenant. Captures user
 * metadata (department, job title) and drive quota/usage information.
 *
 * This is separate from the recordings discovery, which only scans for
 * recording/transcript files in the /Recordings/ folder of each OneDrive.
 */

import { fetchAllOneDriveInventories } from "./graph";
import { storage } from "../storage";
import type { InsertOnedriveInventory } from "@shared/schema";
import { isCancelled, clearCancellation } from "./discovery-cancellation";

export interface OneDriveInventoryRunResult {
  drivesDiscovered: number;
  drivesWithoutOneDrive: number;
  errors: Array<{ context: string; message: string }>;
}

export async function runOneDriveInventoryDiscovery(
  tenantConnectionId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<OneDriveInventoryRunResult> {
  let drivesDiscovered = 0;
  let drivesWithoutOneDrive = 0;
  const errors: Array<{ context: string; message: string }> = [];

  let inventories: Awaited<ReturnType<typeof fetchAllOneDriveInventories>> = [];
  try {
    inventories = await fetchAllOneDriveInventories(tenantId, clientId, clientSecret);
  } catch (err: any) {
    errors.push({ context: "fetchAllOneDriveInventories", message: err.message });
    return { drivesDiscovered: 0, drivesWithoutOneDrive: 0, errors };
  }

  clearCancellation(tenantConnectionId, "onedriveInventory");

  for (const inv of inventories) {
    if (isCancelled(tenantConnectionId, "onedriveInventory")) {
      console.log(`[onedrive-inventory] Discovery cancelled for tenant ${tenantConnectionId}`);
      clearCancellation(tenantConnectionId, "onedriveInventory");
      return { drivesDiscovered, drivesWithoutOneDrive, errors };
    }
    try {
      const record: InsertOnedriveInventory = {
        tenantConnectionId,
        userId: inv.userId,
        userDisplayName: inv.userDisplayName,
        userPrincipalName: inv.userPrincipalName,
        userDepartment: inv.userDepartment,
        userJobTitle: inv.userJobTitle,
        userMail: inv.userMail,
        driveId: inv.driveId,
        driveType: inv.driveType,
        quotaTotalBytes: inv.quotaTotalBytes,
        quotaUsedBytes: inv.quotaUsedBytes,
        quotaRemainingBytes: inv.quotaRemainingBytes,
        quotaState: inv.quotaState,
        lastActivityDate: inv.lastActivityDate,
        fileCount: inv.fileCount,
        activeFileCount: inv.activeFileCount,
        lastDiscoveredAt: new Date(),
        discoveryStatus: "ACTIVE",
      };
      await storage.upsertOnedriveInventory(record);

      if (!inv.driveId) {
        drivesWithoutOneDrive++;
      } else {
        drivesDiscovered++;
      }
    } catch (err: any) {
      errors.push({ context: `onedrive:${inv.userPrincipalName}`, message: err.message });
    }
  }

  console.log(`[onedrive-inventory] Discovered ${drivesDiscovered} drives, ${drivesWithoutOneDrive} without OneDrive, ${errors.length} errors`);
  return { drivesDiscovered, drivesWithoutOneDrive, errors };
}
