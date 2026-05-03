/**
 * BL-013 — Audit-event → notification producer.
 *
 * `logAuditEvent` calls `emitNotificationsForAuditEvent` after every audit
 * write. We map the action to a notification category + severity, look up
 * the org's notification rules, find the eligible recipients (users in the
 * organization who hold a relevant role), apply per-user preferences, and
 * insert one in-app notification row per recipient.
 *
 * This module fails open: any error is swallowed so a notification problem
 * never blocks the underlying governance write.
 */
import { storage } from "../storage";
import {
  type NotificationCategory,
  type NotificationSeverity,
  NOTIFICATION_SEVERITIES,
  ZENITH_ROLES,
  type ZenithRole,
} from "@shared/schema";

interface CategoryMapping {
  category: NotificationCategory;
  severity: NotificationSeverity;
  recipientRoles: ZenithRole[];
  titleTemplate: (input: AuditEventInput) => string;
  bodyTemplate?: (input: AuditEventInput) => string | undefined;
  link?: (input: AuditEventInput) => string | undefined;
}

export interface AuditEventInput {
  action: string;
  resource: string;
  resourceId?: string | null;
  organizationId?: string | null;
  tenantConnectionId?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  details?: Record<string, any> | null;
}

const ADMIN_ROLES: ZenithRole[] = [
  ZENITH_ROLES.PLATFORM_OWNER,
  ZENITH_ROLES.TENANT_ADMIN,
  ZENITH_ROLES.GOVERNANCE_ADMIN,
];

/**
 * Map of audit action → notification category, severity, recipient roles,
 * and presentation copy. Only events meaningful to governance owners are
 * mapped; everything else is silently ignored.
 */
const ACTION_MAP: Record<string, CategoryMapping> = {
  // External sharing events
  SHARING_CHANGED: {
    category: "external_sharing",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Sharing changed on ${i.details?.workspaceName || "a workspace"}`,
    bodyTemplate: (i) =>
      i.details?.externalSharing
        ? "External sharing was enabled — review whether the workspace's sensitivity allows it."
        : "External sharing was disabled.",
    link: (i) => (i.resourceId ? `/app/governance` : undefined),
  },
  SENSITIVITY_POLICY_VIOLATION: {
    category: "external_sharing",
    severity: "critical",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Sensitivity policy violation on ${i.details?.workspaceName || "a workspace"}`,
    bodyTemplate: (i) => i.details?.reason || "A sensitivity policy was violated and needs review.",
    link: () => "/app/governance",
  },

  // Tenant connection lifecycle
  TENANT_REGISTERED: {
    category: "tenant_status",
    severity: "info",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Tenant connected: ${i.details?.tenantName || i.details?.tenantId || "new tenant"}`,
    link: () => "/app/admin/tenants",
  },
  TENANT_REACTIVATED: {
    category: "tenant_status",
    severity: "info",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Tenant reactivated: ${i.details?.tenantName || "tenant"}`,
    bodyTemplate: (i) => i.details?.reason || "The tenant connection was reactivated.",
    link: () => "/app/admin/tenants",
  },
  TENANT_SUSPENDED: {
    category: "tenant_status",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Tenant suspended: ${i.details?.tenantName || "tenant"}`,
    bodyTemplate: (i) => i.details?.reason || "The tenant connection was suspended.",
    link: () => "/app/admin/tenants",
  },
  TENANT_REVOKED: {
    category: "tenant_status",
    severity: "critical",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Tenant access revoked: ${i.details?.tenantName || "tenant"}`,
    link: () => "/app/admin/tenants",
  },
  TENANT_DELETED: {
    category: "tenant_status",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Tenant removed: ${i.details?.tenantName || "tenant"}`,
    link: () => "/app/admin/tenants",
  },

  // Sync failures
  TENANT_SYNC_FAILED: {
    category: "sync_failures",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Tenant sync failed: ${i.details?.tenantName || "tenant"}`,
    bodyTemplate: (i) => i.details?.error || "A scheduled tenant sync did not complete.",
    link: () => "/app/admin/tenants",
  },
  IA_SYNC_FAILED: {
    category: "sync_failures",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: () => "IA assessment sync failed",
    bodyTemplate: (i) => i.details?.error || "An information architecture sync run failed.",
    link: () => "/app/ia-assessment",
  },
  SYNC_FAILED: {
    category: "sync_failures",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Sync failed: ${i.resource}`,
    bodyTemplate: (i) => i.details?.error || "A scheduled sync did not complete.",
  },
  CSV_IMPORT_FAILED: {
    category: "sync_failures",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: () => "CSV import failed",
    bodyTemplate: (i) => i.details?.error || "A CSV import did not complete.",
  },
  METADATA_WRITEBACK_FAILED: {
    category: "sync_failures",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: () => "Metadata writeback failed",
    bodyTemplate: (i) => i.details?.error || "A metadata writeback did not complete.",
  },
  PROVISIONING_FAILED: {
    category: "sync_failures",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Provisioning failed: ${i.details?.workspaceName || ""}`.trim(),
    bodyTemplate: (i) => i.details?.error || "A provisioning request failed.",
  },

  // Label coverage
  LABEL_COVERAGE_LOW: {
    category: "label_coverage",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) =>
      `Sensitivity label coverage low: ${i.details?.coveragePct ?? 0}% of workspaces labeled`,
    bodyTemplate: (i) =>
      `${i.details?.unlabeledCount ?? "Some"} workspace(s) out of ${i.details?.totalCount ?? "unknown"} are missing a sensitivity label. ` +
      `Review and apply labels to maintain governance coverage.`,
    link: () => "/app/governance",
  },
  SENSITIVITY_LABELS_SYNCED: {
    category: "label_coverage",
    severity: "info",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Sensitivity labels synced: ${i.details?.count ?? "—"}`,
    link: () => "/app/governance",
  },
  RETENTION_LABELS_SYNCED: {
    category: "label_coverage",
    severity: "info",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Retention labels synced: ${i.details?.count ?? "—"}`,
    link: () => "/app/governance",
  },

  // Remediation outcomes
  GOVERNANCE_FINDING_UPDATED: {
    category: "remediation",
    severity: "info",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Governance finding ${i.details?.status || "updated"}`,
    bodyTemplate: (i) => i.details?.summary,
    link: () => "/app/governance",
  },
  GOVERNANCE_REVIEW_CREATED: {
    category: "remediation",
    severity: "info",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: () => "New governance review created",
    link: () => "/app/governance",
  },
  POLICY_OUTCOME_CREATED: {
    category: "remediation",
    severity: "info",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Policy outcome recorded: ${i.details?.outcome || ""}`.trim(),
    link: () => "/app/governance",
  },
  ORPHANED_SITE_DISCOVERED: {
    category: "orphaned_sites",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Orphaned site discovered: ${i.details?.workspaceName || ""}`.trim(),
    bodyTemplate: (i) =>
      `The site "${i.details?.workspaceName || "unknown"}" has no assigned owners. Assign an owner to bring it back under governance.`,
    link: () => "/app/sites-tracker",
  },
  SITE_ARCHIVED: {
    category: "orphaned_sites",
    severity: "info",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Site archived: ${i.details?.workspaceName || ""}`.trim(),
    link: () => "/app/sites-tracker",
  },
  SITE_DELETED_M365: {
    category: "orphaned_sites",
    severity: "warning",
    recipientRoles: ADMIN_ROLES,
    titleTemplate: (i) => `Site deleted in M365: ${i.details?.workspaceName || ""}`.trim(),
    link: () => "/app/sites-tracker",
  },
};

const SEVERITY_ORDER: Record<NotificationSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function compareSeverity(a: NotificationSeverity, b: NotificationSeverity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}

export function passesOrgRules(
  category: NotificationCategory,
  severity: NotificationSeverity,
  rules: { enabledCategories: string[]; severityFloor: string } | null | undefined,
): boolean {
  if (!rules) return true;
  if (rules.enabledCategories && rules.enabledCategories.length > 0) {
    if (!rules.enabledCategories.includes(category)) return false;
  }
  const floor = (NOTIFICATION_SEVERITIES as readonly string[]).includes(rules.severityFloor)
    ? (rules.severityFloor as NotificationSeverity)
    : "info";
  return compareSeverity(severity, floor) >= 0;
}

export function passesUserPreferences(
  category: NotificationCategory,
  prefs: { inAppEnabled: boolean; categories: string[] } | null | undefined,
): boolean {
  if (!prefs) return true;
  if (!prefs.inAppEnabled) return false;
  if (prefs.categories && prefs.categories.length > 0 && !prefs.categories.includes(category)) {
    return false;
  }
  return true;
}

/**
 * Insert one in-app notification per eligible recipient. Returns the count
 * of rows actually written.
 */
export async function emitNotificationsForAuditEvent(
  input: AuditEventInput,
): Promise<number> {
  const mapping = ACTION_MAP[input.action];
  if (!mapping) return 0;
  if (!input.organizationId) return 0;

  try {
    const rules = await storage.getNotificationRules(input.organizationId);
    if (!passesOrgRules(mapping.category, mapping.severity, rules)) return 0;

    const orgUsers = await storage.getUsersByOrganization(input.organizationId);
    const recipients = orgUsers.filter((u) =>
      mapping.recipientRoles.includes((u.role || "") as ZenithRole),
    );
    if (recipients.length === 0) return 0;

    const title = mapping.titleTemplate(input);
    const body = mapping.bodyTemplate?.(input) ?? undefined;
    const link = mapping.link?.(input) ?? undefined;
    let inserted = 0;

    for (const recipient of recipients) {
      // Don't notify the actor about their own action.
      if (input.userId && recipient.id === input.userId) continue;
      const prefs = await storage.getNotificationPreferences(recipient.id);
      if (!passesUserPreferences(mapping.category, prefs)) continue;

      await storage.createNotification({
        userId: recipient.id,
        organizationId: input.organizationId,
        tenantConnectionId: input.tenantConnectionId ?? null,
        category: mapping.category,
        severity: mapping.severity,
        title,
        body: body ?? null,
        link: link ?? null,
        payload: input.details ?? null,
      });
      inserted++;
    }
    return inserted;
  } catch (err) {
    console.error(
      `[notification-events] Failed to emit notifications for action ${input.action}:`,
      err,
    );
    return 0;
  }
}

export const __testing = { ACTION_MAP, SEVERITY_ORDER };
