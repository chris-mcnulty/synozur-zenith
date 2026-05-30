/**
 * Nightly Health Report (premium / Enterprise)
 *
 * Runs after the scheduled nightly data refresh of workspaces (sites) and
 * document libraries. Aggregates storage-quota pressure (sites over 75% and
 * over 90% of their allocated quota) plus other governance health issues
 * (missing sensitivity labels, single-owner/orphaned sites, external sharing,
 * stale sites, degraded tenant connection) into a persisted snapshot.
 *
 * The finished report is surfaced in-product (GET /api/nightly-health-reports)
 * and delivered by email + in-app notification to Tenant/Governance admins.
 *
 * Report generation only reads already-synced data, so it runs in a few
 * hundred milliseconds. The scheduler awaits it; the manual route kicks it off
 * with setImmediate and the caller polls GET /api/nightly-health-reports/:id.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  documentLibraries,
  nightlyHealthReports,
  tenantConnections,
  workspaces,
  ZENITH_ROLES,
  type NightlyHealthIssue,
  type NightlyHealthReport,
  type NightlyHealthSnapshot,
  type NightlyHealthStorageSite,
} from "@shared/schema";
import { storage } from "../storage";
import { isMaskedValue } from "./data-masking";
import { sendNightlyHealthReportEmail } from "../email-support";

const WARN_THRESHOLD = 0.75;
const CRIT_THRESHOLD = 0.9;
const STALE_DAYS = 90;
const MAX_TOP_SITES = 100;

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "https://zenith.synozur.com";
const REPORT_PATH = "/app/nightly-health-report";

// Admin roles that receive the report by email + in-app notification.
const REPORT_RECIPIENT_ROLES = new Set<string>([
  ZENITH_ROLES.TENANT_ADMIN,
  ZENITH_ROLES.GOVERNANCE_ADMIN,
  ZENITH_ROLES.PLATFORM_OWNER,
]);

function safePlain(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  return isMaskedValue(value) ? fallback : value;
}
function safePlainOrNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  return isMaskedValue(value) ? null : value;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Snapshot assembly ──────────────────────────────────────────────────────

export async function collectHealthSnapshot(
  tenantConnectionId: string,
  refreshedAt: Date | null,
): Promise<NightlyHealthSnapshot> {
  const caveats: string[] = [];

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - STALE_DAYS);
  const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);

  // ── Over-quota sites (≥75%) — small result set, decrypt names safely ──────
  const notDeleted = sql`coalesce(${workspaces.isDeleted}, false) = false`;
  const notArchived = sql`coalesce(${workspaces.isArchived}, false) = false`;

  const overRowsRaw = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.tenantConnectionId, tenantConnectionId),
        notDeleted,
        notArchived,
        sql`${workspaces.storageAllocatedBytes} > 0`,
        sql`${workspaces.storageUsedBytes} >= ${workspaces.storageAllocatedBytes} * ${WARN_THRESHOLD}`,
      ),
    );
  const overRows = await storage.decryptRows(overRowsRaw, "workspaces");

  const topSites: NightlyHealthStorageSite[] = overRows
    .map((site) => {
      const used = Number(site.storageUsedBytes ?? 0);
      const allocated = Number(site.storageAllocatedBytes ?? 0);
      const ratio = allocated > 0 ? used / allocated : 0;
      const percentUsed = Math.round(ratio * 1000) / 10;
      return {
        workspaceId: site.id,
        displayName: safePlain(site.displayName, site.id),
        siteUrl: safePlainOrNull(site.siteUrl),
        storageUsedBytes: used,
        storageAllocatedBytes: allocated,
        percentUsed,
        severity: ratio >= CRIT_THRESHOLD ? ("critical" as const) : ("warning" as const),
      };
    })
    .sort((a, b) => b.percentUsed - a.percentUsed)
    .slice(0, MAX_TOP_SITES);

  const sitesOver90 = topSites.filter((s) => s.severity === "critical").length;
  const sitesOver75 = topSites.length;

  // ── Governance aggregates over all (non-deleted) sites in one round-trip ──
  const [agg] = await db
    .select({
      sitesEvaluated: sql<number>`count(*) filter (where coalesce(${workspaces.isDeleted}, false) = false)::int`,
      sitesWithQuota: sql<number>`count(*) filter (where ${workspaces.storageAllocatedBytes} > 0 and coalesce(${workspaces.isDeleted}, false) = false)::int`,
      orphanedSites: sql<number>`count(*) filter (where ${workspaces.owners} < 2 and coalesce(${workspaces.isDeleted}, false) = false)::int`,
      missingLabels: sql<number>`count(*) filter (where ${workspaces.sensitivityLabelId} is null and coalesce(${workspaces.isDeleted}, false) = false)::int`,
      externalSharing: sql<number>`count(*) filter (where ${workspaces.externalSharing} = true and coalesce(${workspaces.isDeleted}, false) = false)::int`,
      stale: sql<number>`count(*) filter (where (${workspaces.lastActivityDate} is null or ${workspaces.lastActivityDate} < ${ninetyDaysAgoStr}) and coalesce(${workspaces.isDeleted}, false) = false)::int`,
    })
    .from(workspaces)
    .where(eq(workspaces.tenantConnectionId, tenantConnectionId));

  const sitesEvaluated = agg?.sitesEvaluated ?? 0;
  const sitesWithQuota = agg?.sitesWithQuota ?? 0;

  // ── Document libraries ────────────────────────────────────────────────────
  const [libAgg] = await db
    .select({
      total: sql<number>`count(*)::int`,
      missingLabels: sql<number>`count(*) filter (where ${documentLibraries.sensitivityLabelId} is null)::int`,
    })
    .from(documentLibraries)
    .where(eq(documentLibraries.tenantConnectionId, tenantConnectionId));

  const librariesEvaluated = libAgg?.total ?? 0;
  const librariesMissingLabels = libAgg?.missingLabels ?? 0;

  // ── Tenant connection health ──────────────────────────────────────────────
  const [connRow] = await db
    .select({ health: tenantConnections.healthStatus })
    .from(tenantConnections)
    .where(eq(tenantConnections.id, tenantConnectionId))
    .limit(1);
  const degradedConnections = connRow?.health === "degraded" ? 1 : 0;

  // ── Caveats ───────────────────────────────────────────────────────────────
  if (!refreshedAt) {
    caveats.push(
      "The nightly data refresh did not complete for this run; figures reflect the last successful sync.",
    );
  }
  if (sitesEvaluated > 0 && sitesWithQuota === 0) {
    caveats.push(
      "No site storage quota data is available; storage-quota pressure cannot be evaluated until a tenant sync populates quota totals.",
    );
  }

  // ── Issues roll-up ────────────────────────────────────────────────────────
  const issues: NightlyHealthIssue[] = [];
  if (sitesOver90 > 0) {
    issues.push({
      category: "STORAGE",
      severity: "critical",
      count: sitesOver90,
      title: "Sites over 90% of storage quota",
      detail: "These sites are at imminent risk of running out of storage and should be remediated now.",
    });
  }
  const warnOnly = sitesOver75 - sitesOver90;
  if (warnOnly > 0) {
    issues.push({
      category: "STORAGE",
      severity: "warning",
      count: warnOnly,
      title: "Sites over 75% of storage quota",
      detail: "These sites are approaching their quota and should be reviewed for cleanup or quota increase.",
    });
  }
  if ((agg?.missingLabels ?? 0) > 0) {
    issues.push({
      category: "LABELS",
      severity: "warning",
      count: agg!.missingLabels,
      title: "Sites missing a sensitivity label",
      detail: "Unlabeled sites are not covered by purview protection and reduce Copilot readiness.",
    });
  }
  if (librariesMissingLabels > 0) {
    issues.push({
      category: "LABELS",
      severity: "info",
      count: librariesMissingLabels,
      title: "Document libraries without a default sensitivity label",
      detail: "Set a default library label so new files inherit protection automatically.",
    });
  }
  if ((agg?.orphanedSites ?? 0) > 0) {
    issues.push({
      category: "OWNERSHIP",
      severity: "warning",
      count: agg!.orphanedSites,
      title: "Sites with fewer than two owners",
      detail: "Single-owner sites risk orphaning when the owner leaves; assign a second owner.",
    });
  }
  if ((agg?.externalSharing ?? 0) > 0) {
    issues.push({
      category: "SHARING",
      severity: "warning",
      count: agg!.externalSharing,
      title: "Sites with external sharing enabled",
      detail: "Confirm external sharing is intended, especially on confidential sites.",
    });
  }
  if ((agg?.stale ?? 0) > 0) {
    issues.push({
      category: "LIFECYCLE",
      severity: "info",
      count: agg!.stale,
      title: `Sites inactive for ${STALE_DAYS}+ days`,
      detail: "Stale sites are candidates for archival or lifecycle review.",
    });
  }
  if (degradedConnections > 0) {
    issues.push({
      category: "CONNECTION",
      severity: "critical",
      count: degradedConnections,
      title: "Tenant connection is degraded",
      detail: "Microsoft Graph health checks are failing; sync and refresh may be incomplete.",
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    refreshedAt: refreshedAt ? refreshedAt.toISOString() : null,
    totals: { sitesEvaluated, sitesWithQuota, librariesEvaluated },
    storage: { sitesOver75, sitesOver90, topSites },
    governance: {
      orphanedSites: agg?.orphanedSites ?? 0,
      sitesMissingLabels: agg?.missingLabels ?? 0,
      librariesMissingLabels,
      externalSharingSites: agg?.externalSharing ?? 0,
      staleWorkspaces: agg?.stale ?? 0,
      degradedConnections,
    },
    issues,
    dataCaveats: caveats,
  };
}

// ─── Delivery (in-app notifications + email) ────────────────────────────────

async function deliverReport(
  report: NightlyHealthReport,
  tenantName: string,
  sendEmail: boolean,
): Promise<number> {
  const snapshot = report.snapshot;
  if (!snapshot) return 0;

  const hasCritical = snapshot.issues.some((i) => i.severity === "critical");
  const severity = hasCritical ? "critical" : snapshot.issues.length > 0 ? "warning" : "info";
  const issueCount = snapshot.issues.reduce((sum, i) => sum + i.count, 0);
  const reportUrl = `${APP_PUBLIC_URL}${REPORT_PATH}`;

  let recipients = await storage.getUsersByOrganization(report.organizationId);
  recipients = recipients.filter(
    (u) => REPORT_RECIPIENT_ROLES.has(u.role) && typeof u.email === "string" && u.email.length > 0,
  );

  const body =
    issueCount > 0
      ? `${tenantName}: ${snapshot.storage.sitesOver90} site(s) over 90% and ${snapshot.storage.sitesOver75} over 75% of storage quota; ${snapshot.issues.length} governance issue type(s) flagged.`
      : `${tenantName}: no governance health issues detected in tonight's scan.`;

  for (const user of recipients) {
    try {
      await storage.createNotification({
        userId: user.id,
        organizationId: report.organizationId,
        tenantConnectionId: report.tenantConnectionId,
        category: "governance_report",
        severity,
        title: `Nightly health report ready — ${tenantName}`,
        body,
        link: REPORT_PATH,
        payload: {
          reportId: report.id,
          reportDate: report.reportDate,
          sitesOver75: snapshot.storage.sitesOver75,
          sitesOver90: snapshot.storage.sitesOver90,
          issueCount,
        },
      });
    } catch (err) {
      console.error(`[nightly-health-report] failed to notify user ${user.id}:`, err);
    }

    if (sendEmail) {
      try {
        await sendNightlyHealthReportEmail({
          recipientEmail: user.email,
          recipientName: user.name ?? user.email,
          tenantName,
          reportDate: report.reportDate,
          snapshot,
          reportUrl,
        });
      } catch (err) {
        console.error(`[nightly-health-report] failed to email ${user.email}:`, err);
      }
    }
  }

  return sendEmail ? recipients.length : 0;
}

// ─── Core execution ─────────────────────────────────────────────────────────

export interface RunHealthReportOptions {
  organizationId: string;
  tenantConnectionId: string;
  tenantName: string;
  triggeredBy: "scheduled" | "manual";
  triggeredByUserId?: string | null;
  refreshedAt?: Date | null;
  sendDelivery?: boolean; // in-app notifications (default true)
  sendEmail?: boolean; // email delivery (default true)
}

async function createReportRow(opts: RunHealthReportOptions): Promise<string> {
  const [row] = await db
    .insert(nightlyHealthReports)
    .values({
      organizationId: opts.organizationId,
      tenantConnectionId: opts.tenantConnectionId,
      status: "RUNNING",
      reportDate: todayStr(),
      triggeredBy: opts.triggeredBy,
      triggeredByUserId: opts.triggeredByUserId ?? undefined,
    })
    .returning();
  return row.id;
}

async function executeReport(
  reportId: string,
  opts: RunHealthReportOptions,
): Promise<NightlyHealthReport> {
  try {
    const snapshot = await collectHealthSnapshot(
      opts.tenantConnectionId,
      opts.refreshedAt ?? null,
    );
    const issueCount = snapshot.issues.reduce((sum, i) => sum + i.count, 0);

    const [updated] = await db
      .update(nightlyHealthReports)
      .set({
        status: "COMPLETED",
        snapshot,
        sitesOver75: snapshot.storage.sitesOver75,
        sitesOver90: snapshot.storage.sitesOver90,
        issueCount,
        completedAt: new Date(),
      })
      .where(eq(nightlyHealthReports.id, reportId))
      .returning();

    if (opts.sendDelivery !== false) {
      const sendEmail = opts.sendEmail !== false;
      const recipientCount = await deliverReport(updated, opts.tenantName, sendEmail);
      await db
        .update(nightlyHealthReports)
        .set({
          emailedAt: sendEmail ? new Date() : null,
          emailRecipientCount: recipientCount,
        })
        .where(eq(nightlyHealthReports.id, reportId));
    }
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[nightly-health-report] run ${reportId} failed:`, err);
    const [failed] = await db
      .update(nightlyHealthReports)
      .set({ status: "FAILED", completedAt: new Date(), error: message.slice(0, 2000) })
      .where(eq(nightlyHealthReports.id, reportId))
      .returning();
    return failed;
  }
}

/**
 * Synchronous run used by the nightly scheduler — awaits the full report so the
 * scheduled_job_runs row reflects the real outcome.
 */
export async function runNightlyHealthReport(
  opts: RunHealthReportOptions,
): Promise<NightlyHealthReport> {
  const reportId = await createReportRow(opts);
  return executeReport(reportId, opts);
}

/**
 * Fire-and-forget run used by the manual route — returns the report id
 * immediately; the caller polls GET /api/nightly-health-reports/:id.
 */
export async function startNightlyHealthReport(
  opts: RunHealthReportOptions,
): Promise<string> {
  const reportId = await createReportRow(opts);
  setImmediate(() => {
    void executeReport(reportId, opts);
  });
  return reportId;
}

// ─── Read / list / delete ───────────────────────────────────────────────────

export async function getNightlyHealthReport(
  reportId: string,
): Promise<NightlyHealthReport | undefined> {
  const [row] = await db
    .select()
    .from(nightlyHealthReports)
    .where(eq(nightlyHealthReports.id, reportId))
    .limit(1);
  return row;
}

export async function listNightlyHealthReportsForTenant(
  tenantConnectionId: string,
  limit = 30,
): Promise<NightlyHealthReport[]> {
  return db
    .select()
    .from(nightlyHealthReports)
    .where(eq(nightlyHealthReports.tenantConnectionId, tenantConnectionId))
    .orderBy(desc(nightlyHealthReports.startedAt))
    .limit(limit);
}

export async function deleteNightlyHealthReport(reportId: string): Promise<boolean> {
  const result = await db
    .delete(nightlyHealthReports)
    .where(eq(nightlyHealthReports.id, reportId));
  return (result.rowCount ?? 0) > 0;
}

export async function hasRunningNightlyHealthReport(
  tenantConnectionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: nightlyHealthReports.id })
    .from(nightlyHealthReports)
    .where(
      and(
        eq(nightlyHealthReports.tenantConnectionId, tenantConnectionId),
        eq(nightlyHealthReports.status, "RUNNING"),
      ),
    )
    .limit(1);
  return !!row;
}
