import crypto from "crypto";
import { encryptToken, decryptToken, isEncryptionConfigured } from "../utils/encryption";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const MASKING_PREFIX = "MASKED:";

export function generateTenantEncryptionKey(): string {
  const rawKey = crypto.randomBytes(32);
  return encryptToken(rawKey.toString("hex"));
}

export function getTenantKeyBuffer(encryptedKey: string): Buffer {
  const hexKey = decryptToken(encryptedKey);
  return Buffer.from(hexKey, "hex");
}

export function encryptField(value: string, keyBuffer: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  let encrypted = cipher.update(value, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${MASKING_PREFIX}${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptField(value: string, keyBuffer: Buffer): string {
  if (!isMaskedValue(value)) return value;
  const payload = value.slice(MASKING_PREFIX.length);
  const [ivHex, authTagHex, encrypted] = payload.split(":");
  if (!ivHex || !authTagHex || !encrypted) return value;

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function isMaskedValue(value: string): boolean {
  return value.startsWith(MASKING_PREFIX);
}

export const SENSITIVE_FIELDS: Record<string, string[]> = {
  workspaces: [
    "displayName", "siteUrl", "description", "ownerDisplayName",
    "ownerPrincipalName", "department", "costCenter", "projectCode",
  ],
  teams_recordings: [
    "meetingTitle", "organizer", "organizerDisplayName",
    "teamDisplayName", "channelDisplayName",
    "userDisplayName", "userPrincipalName",
    "fileName", "fileUrl", "filePath",
  ],
  teams_inventory: [
    "displayName", "description", "mailNickname", "sharepointSiteUrl",
  ],
  channels_inventory: [
    "displayName", "description", "email", "webUrl",
  ],
  onedrive_inventory: [
    "userDisplayName", "userPrincipalName", "userDepartment",
    "userJobTitle", "userMail",
  ],
  document_libraries: [
    "displayName", "description", "webUrl",
  ],
  user_inventory: [
    "userPrincipalName", "mail", "displayName",
  ],
};

export function encryptRecord<T extends Record<string, any>>(
  record: T,
  tableName: string,
  keyBuffer: Buffer,
): T {
  const fields = SENSITIVE_FIELDS[tableName];
  if (!fields) return record;

  const result = { ...record };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === "string" && value.length > 0 && !isMaskedValue(value)) {
      (result as any)[field] = encryptField(value, keyBuffer);
    }
  }
  return result;
}

export function decryptRecord<T extends Record<string, any>>(
  record: T,
  tableName: string,
  keyBuffer: Buffer,
): T {
  const fields = SENSITIVE_FIELDS[tableName];
  if (!fields) return record;

  const result = { ...record };
  for (const field of fields) {
    const value = result[field];
    if (typeof value === "string" && isMaskedValue(value)) {
      try {
        (result as any)[field] = decryptField(value, keyBuffer);
      } catch {
        // leave as-is if decryption fails
      }
    }
  }
  return result;
}

// ── Email Content Storage Report summary masking ─────────────────────────────
// The email report's `summary` lives in a jsonb column, so the field-level
// map above does not cover it. These helpers walk the known PII slots
// (sender addresses) and encrypt/decrypt each in place.

export function maskEmailReportSummary<T extends Record<string, any> | null | undefined>(
  summary: T,
  keyBuffer: Buffer,
): T {
  if (!summary || typeof summary !== "object") return summary;
  const out: any = { ...summary };
  if (Array.isArray(out.topSenders)) {
    out.topSenders = out.topSenders.map((s: any) => {
      if (!s || typeof s.sender !== "string" || s.sender.length === 0) return s;
      if (isMaskedValue(s.sender)) return s;
      return { ...s, sender: encryptField(s.sender, keyBuffer) };
    });
  }
  return out;
}

export function unmaskEmailReportSummary<T extends Record<string, any> | null | undefined>(
  summary: T,
  keyBuffer: Buffer,
): T {
  if (!summary || typeof summary !== "object") return summary;
  const out: any = { ...summary };
  if (Array.isArray(out.topSenders)) {
    out.topSenders = out.topSenders.map((s: any) => {
      if (!s || typeof s.sender !== "string" || !isMaskedValue(s.sender)) return s;
      try {
        return { ...s, sender: decryptField(s.sender, keyBuffer) };
      } catch {
        return s;
      }
    });
  }
  return out;
}
