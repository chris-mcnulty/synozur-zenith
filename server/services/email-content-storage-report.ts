/**
 * Email Content Storage Report.
 *
 * Estimates how much organizational content is being propagated via classic
 * email attachments, versus link-based sharing. Built on top of the Zenith
 * User Inventory — this service MUST NOT call Graph /users during report
 * execution. It reads the cached inventory instead.
 *
 * Two modes:
 *   - ESTIMATE (default): uses hasAttachments + message size as a proxy for
 *     attachment storage. Fast, safe, runs in every tenant.
 *   - METADATA (explicit opt-in): enriches a bounded subset of messages with
 *     per-attachment size/name/contentType. Slower, stricter caps, optional.
 *
 * Design mantra: fast, safe, bounded, defensible.
 */

import {
  getAppToken,
  fetchSentMessagesPage,
  fetchMessageAttachmentsMeta,
  fetchTenantVerifiedDomains,
} from "./graph";
import { storage } from "../storage";
import {
  CapsTracker,
  EmailReportAggregator,
  buildAccuracyCaveats,
  resolveLimits,
} from "./email-report-metrics";
import {
  isUserInventoryStale,
  getUserInventoryAgeHours,
  DEFAULT_INVENTORY_MAX_AGE_HOURS,
} from "./user-inventory";
import {
  cancelDiscovery,
  clearCancellation,
  isCancelled,
} from "./discovery-cancellation";
import type {
  EmailReportLimits,
  EmailReportMode,
  EmailReportSummary,
  EmailReportCapsHit,
  EmailStorageReport,
  UserInventoryItem,
} from "@shared/schema";

/** Cancellation scope key used by this service. */
export const EMAIL_REPORT_CANCEL_SCOPE = "emailContentStorageReport" as const;

/**
 * Request cancellation of a specific running report. Cooperative — the
 * report loop checks this flag between users and between message pages
 * and stops cleanly, marking the run as CANCELLED.
 */
export function requestEmailReportCancellation(
  tenantConnectionId: string,
  reportId: string,
): void {
  cancelDiscovery(tenantConnectionId, EMAIL_REPORT_CANCEL_SCOPE, reportId);
}

export interface EmailReportRunOptions {
  mode?: EmailReportMode;
  limits?: Partial<EmailReportLimits>;
  triggeredByUserId?: string;
  /** Fail fast if inventory is older than this many hours. Defaults to staleness warning only. */
  inventoryMaxAgeHours?: number;
}

export interface EmailReportRunResult {
  reportId: string;
  status: EmailStorageReport["status"];
  summary: EmailReportSummary | null;
  capsHit: EmailReportCapsHit;
  accuracyCaveats: string[];
  errors: Array<{ context: string; message: string }>;
}

/**
 * Run an Email Content Storage Report for a tenant. This is intended to be
 * invoked in the background (similar to existing discovery services) — the
 * caller should return HTTP 202 and let this run asynchronously.
 */
export async function runEmailContentStorageReport(
  tenantConnectionId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
  options: EmailReportRunOptions = {},
): Promise<EmailReportRunResult> {
  const mode: EmailReportMode = options.mode ?? "ESTIMATE";
  const limits = resolveLimits(options.limits);

  const now = new Date();
  const windowEnd = now;
  const windowStart = new Date(now.getTime() - limits.windowDays * 24 * 60 * 60 * 1000);

  // ── Inventory gate ─────────────────────────────────────────────────────────
  const inventoryAgeHours = await getUserInventoryAgeHours(tenantConnectionId);
  const inventoryStale = await isUserInventoryStale(
    tenantConnectionId,
    options.inventoryMaxAgeHours ?? DEFAULT_INVENTORY_MAX_AGE_HOURS,
  );

  const inventory = await storage.getUserInventoryForReport(tenantConnectionId, {
    maxUsers: limits.maxUsers,
  });
  const totalInventory = await storage.countUserInventoryActive(tenantConnectionId);

  // The report row is created before any summary payload is persisted, so do
  // not claim masking has been applied yet. This flag must reflect the actual
  // outcome of summary masking/encryption rather than tenant configuration.
  const dataMaskingApplied = false;

  // Create the report row up front so progress is observable from the UI.
  const created = await storage.createEmailStorageReport({
    tenantConnectionId,
    mode,
    windowDays: limits.windowDays,
    windowStart,
    windowEnd,
    status: "RUNNING",
    limits,
    usersPlanned: inventory.length,
    usersProcessed: 0,
    messagesAnalyzed: 0,
    messagesWithAttachments: 0,
    estimatedAttachmentBytes: 0,
    inventorySnapshotAt: inventory[0]?.lastRefreshedAt ?? null,
    inventorySampledCount: inventory.length,
    inventoryTotalCount: totalInventory,
    verifiedDomains: [],
    dataMaskingApplied,
    triggeredByUserId: options.triggeredByUserId ?? null,
  });

  // Clear any stale cancellation flag from a prior run with the same id
  // (defensive — createEmailStorageReport generates a fresh uuid).
  clearCancellation(tenantConnectionId, EMAIL_REPORT_CANCEL_SCOPE, created.id);

  const errors: Array<{ context: string; message: string }> = [];
  const checkCancelled = () =>
    isCancelled(tenantConnectionId, EMAIL_REPORT_CANCEL_SCOPE, created.id);

  // Empty inventory → bail out cleanly so admins know to refresh first.
  if (inventory.length === 0) {
    const capsHit: EmailReportCapsHit = { inventoryEmpty: true };
    await storage.updateEmailStorageReport(created.id, {
      status: "PARTIAL",
      completedAt: new Date(),
      summary: emptySummary(),
      capsHit,
      accuracyCaveats: [
        "User inventory is empty. Refresh the user inventory before running this report.",
      ],
      errors: [],
    });
    return {
      reportId: created.id,
      status: "PARTIAL",
      summary: emptySummary(),
      capsHit,
      accuracyCaveats: [
        "User inventory is empty. Refresh the user inventory before running this report.",
      ],
      errors: [],
    };
  }

  // ── Verified domains (internal vs external classification) ───────────────
  let verifiedDomains: string[] = [];
  try {
    const domainResult = await fetchTenantVerifiedDomains(tenantId, clientId, clientSecret);
    verifiedDomains = domainResult.domains;
  } catch (err: any) {
    errors.push({ context: "fetchTenantVerifiedDomains", message: err?.message ?? String(err) });
  }

  // ── Graph token ──────────────────────────────────────────────────────────
  let token: string;
  try {
    token = await getAppToken(tenantId, clientId, clientSecret);
  } catch (err: any) {
    errors.push({ context: "getAppToken", message: err?.message ?? String(err) });
    await storage.updateEmailStorageReport(created.id, {
      status: "FAILED",
      completedAt: new Date(),
      errors,
    });
    return {
      reportId: created.id,
      status: "FAILED",
      summary: null,
      capsHit: {},
      accuracyCaveats: [],
      errors,
    };
  }

  // ── Per-user loop ────────────────────────────────────────────────────────
  const aggregator = new EmailReportAggregator(verifiedDomains);
  const caps = new CapsTracker(limits);

  const capsUsersHit: EmailReportCapsHit = {};
  if (inventory.length < totalInventory) capsUsersHit.maxUsers = true;

  const windowStartIso = windowStart.toISOString();
  const windowEndIso = windowEnd.toISOString();
  let usersProcessed = 0;
  let cancelled = false;

  for (const user of inventory) {
    if (!caps.canProcessMoreMessages()) break;
    if (checkCancelled()) {
      cancelled = true;
      break;
    }

    try {
      await processUser({
        token,
        user,
        windowStartIso,
        windowEndIso,
        limits,
        mode,
        aggregator,
        caps,
        checkCancelled,
      });
    } catch (err: any) {
      errors.push({
        context: `user:${user.userId}`,
        message: err?.message ?? String(err),
      });
    }

    // Re-check after the user is done — processUser stops quickly on cancel
    // but the outer loop decides whether to mark the run as CANCELLED.
    if (checkCancelled()) {
      cancelled = true;
      usersProcessed++;
      break;
    }

    usersProcessed++;
    // Live progress checkpoint every 10 users (keeps DB writes cheap).
    if (usersProcessed % 10 === 0) {
      await storage.updateEmailStorageReport(created.id, {
        usersProcessed,
        messagesAnalyzed: aggregator.totalMessagesAnalyzed,
        messagesWithAttachments: aggregator.messagesWithAttachments,
        estimatedAttachmentBytes: aggregator.estimatedAttachmentBytes,
      });
    }
  }

  // ── Finalize ─────────────────────────────────────────────────────────────
  const summary = aggregator.toSummary({
    topN: 10,
    includeMetadataAggregates: mode === "METADATA",
  });

  const capsHit: EmailReportCapsHit = {
    ...capsUsersHit,
    maxTotalMessages: caps.hit.maxTotalMessages || undefined,
    maxMessagesWithMetadata: caps.hit.maxMessagesWithMetadata || undefined,
    maxMessagesPerUser:
      caps.hit.usersHitPerUserCap.length > 0
        ? caps.hit.usersHitPerUserCap.map(u => ({ userId: u }))
        : undefined,
    inventoryStale: inventoryStale || undefined,
  };

  const accuracyCaveats = buildAccuracyCaveats({
    mode,
    limits,
    capsHit: {
      maxTotalMessages: !!capsHit.maxTotalMessages,
      maxMessagesWithMetadata: !!capsHit.maxMessagesWithMetadata,
      usersHitPerUserCap: caps.hit.usersHitPerUserCap,
      maxUsers: !!capsHit.maxUsers,
      inventoryStale,
    },
    usersPlanned: inventory.length,
    usersProcessed,
    totalMessagesAnalyzed: aggregator.totalMessagesAnalyzed,
  });

  if (inventoryAgeHours !== null) {
    accuracyCaveats.push(
      `Inventory snapshot is ${inventoryAgeHours.toFixed(1)} hours old.`,
    );
  }

  if (cancelled) {
    accuracyCaveats.push(
      `Run was cancelled by an admin after processing ${usersProcessed}/${inventory.length} users. ` +
        "Partial aggregates are preserved.",
    );
  }

  const finalStatus: EmailStorageReport["status"] = cancelled
    ? "CANCELLED"
    : errors.length > 0 && aggregator.totalMessagesAnalyzed === 0
      ? "FAILED"
      : errors.length > 0 ||
          capsHit.maxUsers ||
          capsHit.maxTotalMessages ||
          capsHit.maxMessagesWithMetadata ||
          inventoryStale
        ? "PARTIAL"
        : "COMPLETED";

  await storage.updateEmailStorageReport(created.id, {
    status: finalStatus,
    completedAt: new Date(),
    usersProcessed,
    messagesAnalyzed: aggregator.totalMessagesAnalyzed,
    messagesWithAttachments: aggregator.messagesWithAttachments,
    estimatedAttachmentBytes: aggregator.estimatedAttachmentBytes,
    verifiedDomains,
    summary,
    capsHit,
    accuracyCaveats,
    errors,
  });

  // Always clear the cancellation flag so a re-run with the same id (or
  // residual state from a crash) does not inherit a stale cancel signal.
  clearCancellation(tenantConnectionId, EMAIL_REPORT_CANCEL_SCOPE, created.id);

  console.log(
    `[email-storage-report] tenant=${tenantConnectionId} mode=${mode} status=${finalStatus} ` +
      `users=${usersProcessed}/${inventory.length} ` +
      `msgs=${aggregator.totalMessagesAnalyzed} ` +
      `attachMsgs=${aggregator.messagesWithAttachments} ` +
      `estBytes=${aggregator.estimatedAttachmentBytes}`,
  );

  return {
    reportId: created.id,
    status: finalStatus,
    summary,
    capsHit,
    accuracyCaveats,
    errors,
  };
}

/** Per-user message paging loop. */
async function processUser(params: {
  token: string;
  user: Pick<UserInventoryItem, "userId" | "userPrincipalName">;
  windowStartIso: string;
  windowEndIso: string;
  limits: EmailReportLimits;
  mode: EmailReportMode;
  aggregator: EmailReportAggregator;
  caps: CapsTracker;
  checkCancelled: () => boolean;
}): Promise<void> {
  const {
    token,
    user,
    windowStartIso,
    windowEndIso,
    limits,
    mode,
    aggregator,
    caps,
    checkCancelled,
  } = params;

  let nextLink: string | null | undefined;
  let userMessageCount = 0;

  do {
    if (checkCancelled()) return;
    if (!caps.canProcessForUser(userMessageCount)) {
      if (userMessageCount >= limits.maxMessagesPerUser) {
        caps.markUserHitPerUserCap(user.userId);
      }
      break;
    }

    const remainingForUser = limits.maxMessagesPerUser - userMessageCount;
    const remainingOverall = limits.maxTotalMessages - caps.totalsProcessed;
    const pageSize = Math.min(100, remainingForUser, remainingOverall);
    if (pageSize <= 0) break;

    const page = await fetchSentMessagesPage(
      token,
      user.userId,
      windowStartIso,
      windowEndIso,
      pageSize,
      nextLink ?? undefined,
    );

    if (page.status !== 200 && page.messages.length === 0) {
      // 403 = no mail access / user has no mailbox. 404 = no Sent Items.
      // These are expected for some users — skip quietly.
      return;
    }

    for (const msg of page.messages) {
      if (!caps.canProcessMoreMessages()) break;
      if (userMessageCount >= limits.maxMessagesPerUser) {
        caps.markUserHitPerUserCap(user.userId);
        break;
      }
      if (checkCancelled()) return;

      aggregator.recordMessage({
        sizeBytes: msg.size,
        hasAttachments: msg.hasAttachments,
        senderAddress: msg.senderAddress,
        recipientAddresses: msg.recipientAddresses,
      });
      caps.recordMessage();
      userMessageCount++;

      // METADATA enrichment (bounded, opt-in)
      if (mode === "METADATA" && msg.hasAttachments && caps.canProcessMetadataFor(msg.size)) {
        try {
          const { attachments } = await fetchMessageAttachmentsMeta(
            token,
            user.userId,
            msg.id,
            limits.maxAttachmentsPerMessage,
          );
          for (const a of attachments) {
            aggregator.recordAttachment(a);
          }
          caps.recordMetadataMessage();
        } catch {
          // Fall back to estimate-only for this message on any error.
        }
      }
    }

    nextLink = page.nextLink ?? null;
  } while (nextLink);
}

function emptySummary(): EmailReportSummary {
  return {
    totalMessagesAnalyzed: 0,
    messagesWithAttachments: 0,
    pctWithAttachments: 0,
    estimatedAttachmentBytes: 0,
    sizeStats: { avgBytes: 0, medianBytes: 0, p90Bytes: 0, p95Bytes: 0, maxBytes: 0 },
    internal: { messages: 0, bytes: 0 },
    external: { messages: 0, bytes: 0 },
    topSenders: [],
    topRecipientDomains: [],
  };
}

// ── CSV export ──────────────────────────────────────────────────────────────

/**
 * Render an Email Content Storage Report row as a multi-section CSV blob
 * (one file, several named sections separated by blank lines). CSV quoting
 * handles commas, quotes, and newlines inside values.
 */
export function renderReportCsv(report: EmailStorageReport): string {
  const lines: string[] = [];

  const quote = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const row = (cols: unknown[]) => lines.push(cols.map(quote).join(","));

  const summary: EmailReportSummary | null = report.summary ?? null;

  // Metadata section
  row(["Section", "Key", "Value"]);
  row(["meta", "reportId", report.id]);
  row(["meta", "tenantConnectionId", report.tenantConnectionId]);
  row(["meta", "mode", report.mode]);
  row(["meta", "windowDays", report.windowDays]);
  row(["meta", "windowStart", report.windowStart.toISOString?.() ?? report.windowStart]);
  row(["meta", "windowEnd", report.windowEnd.toISOString?.() ?? report.windowEnd]);
  row(["meta", "status", report.status]);
  row(["meta", "startedAt", report.startedAt.toISOString?.() ?? report.startedAt]);
  row(["meta", "completedAt", report.completedAt?.toISOString?.() ?? report.completedAt ?? ""]);
  row(["meta", "usersPlanned", report.usersPlanned ?? 0]);
  row(["meta", "usersProcessed", report.usersProcessed ?? 0]);
  row(["meta", "messagesAnalyzed", report.messagesAnalyzed ?? 0]);
  row(["meta", "messagesWithAttachments", report.messagesWithAttachments ?? 0]);
  row(["meta", "estimatedAttachmentBytes", report.estimatedAttachmentBytes ?? 0]);
  row(["meta", "dataMaskingApplied", report.dataMaskingApplied]);
  row(["meta", "inventoryTotalCount", report.inventoryTotalCount ?? 0]);
  row(["meta", "inventorySampledCount", report.inventorySampledCount ?? 0]);

  if (summary) {
    lines.push("");
    row(["Section", "Metric", "Value"]);
    row(["summary", "pctWithAttachments", summary.pctWithAttachments]);
    row(["summary", "avgBytes", summary.sizeStats.avgBytes]);
    row(["summary", "medianBytes", summary.sizeStats.medianBytes]);
    row(["summary", "p90Bytes", summary.sizeStats.p90Bytes]);
    row(["summary", "p95Bytes", summary.sizeStats.p95Bytes]);
    row(["summary", "maxBytes", summary.sizeStats.maxBytes]);
    row(["summary", "internalMessages", summary.internal.messages]);
    row(["summary", "internalBytes", summary.internal.bytes]);
    row(["summary", "externalMessages", summary.external.messages]);
    row(["summary", "externalBytes", summary.external.bytes]);

    lines.push("");
    row(["Section", "Sender", "Bytes", "Count"]);
    for (const s of summary.topSenders) {
      row(["topSenders", s.sender, s.bytes, s.count]);
    }

    lines.push("");
    row(["Section", "Domain", "Bytes", "Count"]);
    for (const d of summary.topRecipientDomains) {
      row(["topRecipientDomains", d.domain, d.bytes, d.count]);
    }

    if (summary.topAttachmentTypes && summary.topAttachmentTypes.length > 0) {
      lines.push("");
      row(["Section", "ContentType", "Bytes", "Count"]);
      for (const t of summary.topAttachmentTypes) {
        row(["topAttachmentTypes", t.contentType, t.bytes, t.count]);
      }
    }

    if (summary.repeatedAttachmentPatterns && summary.repeatedAttachmentPatterns.length > 0) {
      lines.push("");
      row(["Section", "Pattern", "Bytes", "Count"]);
      for (const p of summary.repeatedAttachmentPatterns) {
        row(["repeatedAttachmentPatterns", p.key, p.bytes, p.count]);
      }
    }
  }

  if (report.accuracyCaveats && report.accuracyCaveats.length > 0) {
    lines.push("");
    row(["Section", "Caveat"]);
    for (const c of report.accuracyCaveats) {
      row(["accuracyCaveats", c]);
    }
  }

  return lines.join("\n") + "\n";
}
