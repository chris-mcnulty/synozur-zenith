import type { AuthenticatedRequest } from "../middleware/rbac";
import { storage } from "../storage";
import { db } from "../db";
import { auditLog, organizations, type ServicePlanTier } from "@shared/schema";
import { and, eq, isNull, lt } from "drizzle-orm";
import { getPlanFeatures } from "./feature-gate";

export const AUDIT_ACTIONS = {
  // Auth / users
  USER_SIGNUP: "USER_SIGNUP",
  USER_LOGIN: "USER_LOGIN",
  USER_LOGOUT: "USER_LOGOUT",
  USER_CREATED: "USER_CREATED",
  USER_ROLE_CHANGED: "USER_ROLE_CHANGED",
  USER_DEACTIVATED: "USER_DEACTIVATED",
  USER_REACTIVATED: "USER_REACTIVATED",
  PASSWORD_RESET_REQUESTED: "PASSWORD_RESET_REQUESTED",
  PASSWORD_RESET_COMPLETED: "PASSWORD_RESET_COMPLETED",

  // Organizations
  ORG_CREATED: "ORG_CREATED",
  ORG_SWITCHED: "ORG_SWITCHED",
  ORG_MEMBER_ADDED: "ORG_MEMBER_ADDED",
  ORG_MEMBER_REMOVED: "ORG_MEMBER_REMOVED",
  ORG_MEMBER_ROLE_CHANGED: "ORG_MEMBER_ROLE_CHANGED",
  ORG_SETTINGS_UPDATED: "ORG_SETTINGS_UPDATED",
  ORG_CANCELLED: "ORG_CANCELLED",
  ORG_DELETED_BY_ADMIN: "ORG_DELETED_BY_ADMIN",
  ORG_PLAN_CHANGED: "ORG_PLAN_CHANGED",
  ORG_PLAN_CHANGED_BY_ADMIN: "ORG_PLAN_CHANGED_BY_ADMIN",
  ROLE_ASSIGNED: "ROLE_ASSIGNED",
  ROLE_REVOKED: "ROLE_REVOKED",

  // Tenants
  TENANT_REGISTERED: "TENANT_REGISTERED",
  TENANT_UPDATED: "TENANT_UPDATED",
  TENANT_REACTIVATED: "TENANT_REACTIVATED",
  TENANT_SUSPENDED: "TENANT_SUSPENDED",
  TENANT_REVOKED: "TENANT_REVOKED",
  TENANT_DELETED: "TENANT_DELETED",
  TENANT_SYNC_STARTED: "TENANT_SYNC_STARTED",
  TENANT_SYNC_COMPLETED: "TENANT_SYNC_COMPLETED",
  TENANT_SYNC_FAILED: "TENANT_SYNC_FAILED",

  // Workspaces
  WORKSPACE_PROVISIONED: "WORKSPACE_PROVISIONED",
  WORKSPACE_CREATED: "WORKSPACE_CREATED",
  WORKSPACE_DELETED: "WORKSPACE_DELETED",
  WORKSPACE_BULK_UPDATED: "WORKSPACE_BULK_UPDATED",
  PROVISIONING_REQUEST_UPDATED: "PROVISIONING_REQUEST_UPDATED",
  PROVISIONING_REJECTED: "PROVISIONING_REJECTED",
  PROVISIONING_FAILED: "PROVISIONING_FAILED",
  LABEL_ASSIGNED: "LABEL_ASSIGNED",
  METADATA_UPDATED: "METADATA_UPDATED",
  SHARING_CHANGED: "SHARING_CHANGED",
  SENSITIVITY_CHANGED: "SENSITIVITY_CHANGED",
  SENSITIVITY_POLICY_VIOLATION: "SENSITIVITY_POLICY_VIOLATION",
  SITE_ARCHIVED: "SITE_ARCHIVED",
  SITE_UNARCHIVED: "SITE_UNARCHIVED",
  SITE_DELETED_M365: "SITE_DELETED_M365",
  WORKSPACE_OWNER_ADDED: "WORKSPACE_OWNER_ADDED",
  WORKSPACE_OWNER_REMOVED: "WORKSPACE_OWNER_REMOVED",
  WORKSPACE_MEMBER_ADDED: "WORKSPACE_MEMBER_ADDED",
  WORKSPACE_MEMBER_REMOVED: "WORKSPACE_MEMBER_REMOVED",

  // Governance / policies
  POLICY_CREATED: "POLICY_CREATED",
  POLICY_UPDATED: "POLICY_UPDATED",
  POLICY_DELETED: "POLICY_DELETED",
  POLICY_OUTCOME_CREATED: "POLICY_OUTCOME_CREATED",
  POLICY_OUTCOME_UPDATED: "POLICY_OUTCOME_UPDATED",
  POLICY_OUTCOME_DELETED: "POLICY_OUTCOME_DELETED",

  // Tenant configuration
  DATA_DICTIONARY_ENTRY_CREATED: "DATA_DICTIONARY_ENTRY_CREATED",
  DATA_DICTIONARY_ENTRY_DELETED: "DATA_DICTIONARY_ENTRY_DELETED",
  REQUIRED_METADATA_UPDATED: "REQUIRED_METADATA_UPDATED",
  CUSTOM_FIELD_CREATED: "CUSTOM_FIELD_CREATED",
  CUSTOM_FIELD_UPDATED: "CUSTOM_FIELD_UPDATED",
  CUSTOM_FIELD_DELETED: "CUSTOM_FIELD_DELETED",
  SENSITIVITY_LABELS_SYNCED: "SENSITIVITY_LABELS_SYNCED",
  RETENTION_LABELS_SYNCED: "RETENTION_LABELS_SYNCED",
  DATA_MASKING_ENABLED: "DATA_MASKING_ENABLED",
  DATA_MASKING_DISABLED: "DATA_MASKING_DISABLED",

  // MSP access
  MSP_GRANT_CODE_CREATED: "MSP_GRANT_CODE_CREATED",
  MSP_GRANT_REDEEMED: "MSP_GRANT_REDEEMED",
  MSP_GRANT_REVOKED: "MSP_GRANT_REVOKED",
  TENANT_ACCESS_CODE_CREATED: "TENANT_ACCESS_CODE_CREATED",
  TENANT_ACCESS_GRANT_REVOKED: "TENANT_ACCESS_GRANT_REVOKED",
  TENANT_ACCESS_CLAIMED: "TENANT_ACCESS_CLAIMED",

  // Inventory / discovery sync
  IA_SYNC_STARTED: "IA_SYNC_STARTED",
  IA_SYNC_COMPLETED: "IA_SYNC_COMPLETED",
  IA_SYNC_FAILED: "IA_SYNC_FAILED",
  SYNC_STARTED: "SYNC_STARTED",
  SYNC_COMPLETED: "SYNC_COMPLETED",
  SYNC_FAILED: "SYNC_FAILED",
  COPILOT_RULES_UPDATED: "COPILOT_RULES_UPDATED",
  BULK_WORKSPACE_UPDATED: "BULK_WORKSPACE_UPDATED",
  HUB_ASSIGNMENT_CHANGED: "HUB_ASSIGNMENT_CHANGED",
  CSV_IMPORT_STARTED: "CSV_IMPORT_STARTED",
  CSV_IMPORT_COMPLETED: "CSV_IMPORT_COMPLETED",
  CSV_IMPORT_FAILED: "CSV_IMPORT_FAILED",
  METADATA_WRITEBACK_STARTED: "METADATA_WRITEBACK_STARTED",
  METADATA_WRITEBACK_COMPLETED: "METADATA_WRITEBACK_COMPLETED",
  METADATA_WRITEBACK_FAILED: "METADATA_WRITEBACK_FAILED",
  TENANT_WRITEBACK_STARTED: "TENANT_WRITEBACK_STARTED",
  TENANT_WRITEBACK_COMPLETED: "TENANT_WRITEBACK_COMPLETED",
  GOVERNANCE_REVIEW_CREATED: "GOVERNANCE_REVIEW_CREATED",
  GOVERNANCE_FINDING_UPDATED: "GOVERNANCE_FINDING_UPDATED",
  GROUNDING_DOC_CREATED: "GROUNDING_DOC_CREATED",
  GROUNDING_DOC_UPDATED: "GROUNDING_DOC_UPDATED",
  GROUNDING_DOC_DELETED: "GROUNDING_DOC_DELETED",
  FEATURE_TOGGLE_CHANGED: "FEATURE_TOGGLE_CHANGED",
  TENANT_DATA_PURGED: "TENANT_DATA_PURGED",
  LICENSE_PRICE_UPDATED: "LICENSE_PRICE_UPDATED",
  LICENSE_FINDING_UPDATED: "LICENSE_FINDING_UPDATED",

  // Platform admin
  PLATFORM_SETTINGS_UPDATED: "PLATFORM_SETTINGS_UPDATED",
  DOMAIN_BLOCKLIST_ADDED: "DOMAIN_BLOCKLIST_ADDED",
  DOMAIN_BLOCKLIST_REMOVED: "DOMAIN_BLOCKLIST_REMOVED",

  // RBAC / feature gating
  ACCESS_DENIED: "ACCESS_DENIED",
  FEATURE_DENIED: "FEATURE_DENIED",

  // Retention / housekeeping
  AUDIT_RETENTION_PURGE: "AUDIT_RETENTION_PURGE",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export type AuditResult = "SUCCESS" | "FAILURE" | "DENIED" | "PARTIAL";

export interface LogAuditEventInput {
  action: AuditAction | string;
  resource: string;
  resourceId?: string | null;
  organizationId?: string | null;
  tenantConnectionId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  ipAddress?: string | null;
  details?: Record<string, any> | null;
  result?: AuditResult;
}

export async function logAuditEvent(
  req: AuthenticatedRequest | null,
  input: LogAuditEventInput,
): Promise<void> {
  try {
    // Honor an explicit `organizationId: null` (system/global event) by only
    // falling back to the request's active org when the field was omitted.
    const orgIdResolved = "organizationId" in input
      ? input.organizationId ?? null
      : req?.activeOrganizationId ?? req?.user?.organizationId ?? null;
    await storage.createAuditEntry({
      userId: input.userId ?? req?.user?.id ?? null,
      userEmail: input.userEmail ?? req?.user?.email ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      organizationId: orgIdResolved,
      tenantConnectionId: input.tenantConnectionId ?? null,
      details: input.details ?? null,
      result: input.result ?? "SUCCESS",
      ipAddress: input.ipAddress ?? req?.ip ?? null,
    });
  } catch (err) {
    console.error(
      `[audit] Failed to write audit entry for action ${input.action}:`,
      err,
    );
  }
}

export async function logAccessDenied(
  req: AuthenticatedRequest | null,
  resource: string,
  resourceId: string | null | undefined,
  reason: string,
  details?: Record<string, any>,
): Promise<void> {
  await logAuditEvent(req, {
    action: AUDIT_ACTIONS.ACCESS_DENIED,
    resource,
    resourceId: resourceId ?? null,
    details: { reason, ...(details ?? {}) },
    result: "DENIED",
  });
}

interface PurgeStats {
  total: number;
  byOrg: Record<string, number>;
  orgLevel: number;
}

export async function purgeAuditEntriesByRetention(): Promise<PurgeStats> {
  const stats: PurgeStats = { total: 0, byOrg: {}, orgLevel: 0 };

  const orgs = await db.select().from(organizations);
  const now = Date.now();

  for (const org of orgs) {
    const plan = (org.servicePlan || "TRIAL") as ServicePlanTier;
    const features = getPlanFeatures(plan);
    const days = features.auditRetentionDays;
    if (days === -1) continue;
    const cutoff = new Date(now - days * 24 * 60 * 60 * 1000);
    const deleted = await db
      .delete(auditLog)
      .where(and(eq(auditLog.organizationId, org.id), lt(auditLog.createdAt, cutoff)))
      .returning({ id: auditLog.id });
    if (deleted.length > 0) {
      stats.byOrg[org.id] = deleted.length;
      stats.total += deleted.length;
    }
  }

  const trialDays = getPlanFeatures("TRIAL").auditRetentionDays;
  if (trialDays > 0) {
    const cutoff = new Date(now - trialDays * 24 * 60 * 60 * 1000);
    const deleted = await db
      .delete(auditLog)
      .where(and(isNull(auditLog.organizationId), lt(auditLog.createdAt, cutoff)))
      .returning({ id: auditLog.id });
    stats.orgLevel = deleted.length;
    stats.total += deleted.length;
  }

  return stats;
}

let retentionTimer: NodeJS.Timeout | null = null;

export function startAuditRetentionScheduler(): void {
  if (retentionTimer) return;

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  const runPurge = async () => {
    try {
      const stats = await purgeAuditEntriesByRetention();
      if (stats.total > 0) {
        console.log(
          `[audit-retention] Purged ${stats.total} audit entries (orgs=${
            Object.keys(stats.byOrg).length
          }, org-level=${stats.orgLevel})`,
        );
        await logAuditEvent(null, {
          action: AUDIT_ACTIONS.AUDIT_RETENTION_PURGE,
          resource: "audit_log",
          details: { total: stats.total, byOrg: stats.byOrg, orgLevel: stats.orgLevel },
        });
      }
    } catch (err) {
      console.error("[audit-retention] Purge failed:", err);
    }
  };

  setTimeout(() => {
    void runPurge();
  }, 60_000);

  retentionTimer = setInterval(() => {
    void runPurge();
  }, ONE_DAY_MS);

  retentionTimer.unref?.();
}
