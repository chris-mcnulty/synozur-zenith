import { db } from "../db";
import { storage } from "../storage";
import {
  workspaces,
  teamsRecordings,
  teamsInventory,
  channelsInventory,
  onedriveInventory,
  documentLibraries,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  generateTenantEncryptionKey,
  getTenantKeyBuffer,
  encryptRecord,
  decryptRecord,
  SENSITIVE_FIELDS,
} from "./data-masking";

const TABLE_MAP = {
  workspaces: { table: workspaces, tenantField: workspaces.tenantConnectionId },
  teams_recordings: { table: teamsRecordings, tenantField: teamsRecordings.tenantConnectionId },
  teams_inventory: { table: teamsInventory, tenantField: teamsInventory.tenantConnectionId },
  channels_inventory: { table: channelsInventory, tenantField: channelsInventory.tenantConnectionId },
  onedrive_inventory: { table: onedriveInventory, tenantField: onedriveInventory.tenantConnectionId },
  document_libraries: { table: documentLibraries, tenantField: documentLibraries.tenantConnectionId },
} as const;

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

  for (const [tableName, { table, tenantField }] of Object.entries(TABLE_MAP)) {
    try {
      const rows = await db.select().from(table).where(eq(tenantField, tenantConnectionId));

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

  for (const [tableName, { table, tenantField }] of Object.entries(TABLE_MAP)) {
    try {
      const rows = await db.select().from(table).where(eq(tenantField, tenantConnectionId));

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
