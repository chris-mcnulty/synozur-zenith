import { db } from "../db";
import { storage } from "../storage";
import {
  workspaces,
  teamsRecordings,
  teamsInventory,
  channelsInventory,
  onedriveInventory,
  documentLibraries,
  sharingLinksInventory,
  governanceReviewFindings,
  governanceReviewTasks,
  copilotInteractions,
} from "@shared/schema";
import { eq, inArray, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  generateTenantEncryptionKey,
  getTenantKeyBuffer,
  encryptRecord,
  decryptRecord,
  SENSITIVE_FIELDS,
} from "./data-masking";

type TableMapEntry = {
  table: PgTable;
  getWhere: (tenantConnectionId: string) => Promise<SQL | undefined>;
};

const TABLE_MAP: Record<string, TableMapEntry> = {
  workspaces: {
    table: workspaces,
    getWhere: async (t) => eq(workspaces.tenantConnectionId, t),
  },
  teams_recordings: {
    table: teamsRecordings,
    getWhere: async (t) => eq(teamsRecordings.tenantConnectionId, t),
  },
  teams_inventory: {
    table: teamsInventory,
    getWhere: async (t) => eq(teamsInventory.tenantConnectionId, t),
  },
  channels_inventory: {
    table: channelsInventory,
    getWhere: async (t) => eq(channelsInventory.tenantConnectionId, t),
  },
  onedrive_inventory: {
    table: onedriveInventory,
    getWhere: async (t) => eq(onedriveInventory.tenantConnectionId, t),
  },
  document_libraries: {
    table: documentLibraries,
    getWhere: async (t) => eq(documentLibraries.tenantConnectionId, t),
  },
  sharing_links_inventory: {
    table: sharingLinksInventory,
    getWhere: async (t) => eq(sharingLinksInventory.tenantConnectionId, t),
  },
  governance_review_findings: {
    // Findings have no tenantConnectionId column; scope them via their parent review task
    // using a subquery so the DB performs the join without materialising task IDs in Node.
    table: governanceReviewFindings,
    getWhere: async (t) => {
      const sq = db
        .select({ id: governanceReviewTasks.id })
        .from(governanceReviewTasks)
        .where(eq(governanceReviewTasks.tenantConnectionId, t));
      return inArray(governanceReviewFindings.reviewTaskId, sq);
    },
  },
  copilot_interactions: {
    table: copilotInteractions,
    getWhere: async (t) => eq(copilotInteractions.tenantConnectionId, t),
  },
};

export interface DataMaskingToggleResult {
  success: boolean;
  enabled: boolean;
  recordsProcessed: number;
  errors: string[];
}

export async function enableDataMasking(tenantConnectionId: string): Promise<DataMaskingToggleResult> {
  let recordsProcessed = 0;
  const errors: string[] = [];

  const encryptedKey = generateTenantEncryptionKey();
  await storage.upsertTenantEncryptionKey({
    tenantConnectionId,
    encryptedKey,
  });

  const keyBuffer = getTenantKeyBuffer(encryptedKey);

  for (const [tableName, { table, getWhere }] of Object.entries(TABLE_MAP)) {
    try {
      const whereClause = await getWhere(tenantConnectionId);
      if (!whereClause) continue;
      const rows = await db.select().from(table).where(whereClause);

      for (const row of rows) {
        const encrypted = encryptRecord(row as Record<string, any>, tableName, keyBuffer);
        const updates: Record<string, any> = {};
        const fields = SENSITIVE_FIELDS[tableName] || [];
        let hasChanges = false;

        for (const field of fields) {
          if (encrypted[field] !== (row as any)[field]) {
            updates[field] = encrypted[field];
            hasChanges = true;
          }
        }

        if (hasChanges) {
          await db.update(table).set(updates).where(eq((table as any).id, (row as any).id));
          recordsProcessed++;
        }
      }
    } catch (err: any) {
      errors.push(`${tableName}: ${err.message}`);
    }
  }

  await storage.updateTenantConnection(tenantConnectionId, { dataMaskingEnabled: true } as any);
  (storage as any).invalidateKeyCache?.(tenantConnectionId);

  return { success: errors.length === 0, enabled: true, recordsProcessed, errors };
}

export async function disableDataMasking(tenantConnectionId: string): Promise<DataMaskingToggleResult> {
  let recordsProcessed = 0;
  const errors: string[] = [];

  const keyRecord = await storage.getTenantEncryptionKey(tenantConnectionId);
  if (!keyRecord) {
    return { success: false, enabled: true, recordsProcessed: 0, errors: ["No encryption key found for this tenant"] };
  }

  const keyBuffer = getTenantKeyBuffer(keyRecord.encryptedKey);

  for (const [tableName, { table, getWhere }] of Object.entries(TABLE_MAP)) {
    try {
      const whereClause = await getWhere(tenantConnectionId);
      if (!whereClause) continue;
      const rows = await db.select().from(table).where(whereClause);

      for (const row of rows) {
        const decrypted = decryptRecord(row as Record<string, any>, tableName, keyBuffer);
        const updates: Record<string, any> = {};
        const fields = SENSITIVE_FIELDS[tableName] || [];
        let hasChanges = false;

        for (const field of fields) {
          if (decrypted[field] !== (row as any)[field]) {
            updates[field] = decrypted[field];
            hasChanges = true;
          }
        }

        if (hasChanges) {
          await db.update(table).set(updates).where(eq((table as any).id, (row as any).id));
          recordsProcessed++;
        }
      }
    } catch (err: any) {
      errors.push(`${tableName}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, enabled: true, recordsProcessed, errors: [...errors, "Masking remains enabled because some records could not be decrypted. Retry or contact support."] };
  }

  await storage.updateTenantConnection(tenantConnectionId, { dataMaskingEnabled: false } as any);
  (storage as any).invalidateKeyCache?.(tenantConnectionId);

  return { success: true, enabled: false, recordsProcessed, errors };
}
