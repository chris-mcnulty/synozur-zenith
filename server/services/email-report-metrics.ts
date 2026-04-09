/**
 * Pure metric helpers for the Email Content Storage Report.
 *
 * Everything in this file is deliberately side-effect free so it can be
 * unit-tested in isolation. The Email Content Storage Report service
 * (`email-content-storage-report.ts`) feeds Graph message metadata into
 * these helpers to produce aggregate statistics.
 *
 * Design mantra: governance and insight, not forensics.
 * Fast. Safe. Bounded. Defensible.
 */

import { createHash } from "crypto";
import type { EmailReportLimits, EmailReportSummary } from "@shared/schema";
import { VALID_WINDOW_DAYS_LIST } from "@shared/schema";

// ── Defaults ─────────────────────────────────────────────────────────────────

/**
 * Default limits for the Email Content Storage Report. These are intentionally
 * conservative so the report is safe to run on any tenant without an admin
 * override. Overrides are applied per run via the admin API.
 */
export const DEFAULT_EMAIL_REPORT_LIMITS: EmailReportLimits = {
  windowDays: 30,
  maxUsers: 200,
  maxMessagesPerUser: 2_000,
  maxTotalMessages: 200_000,
  attachmentMetadataEnabled: false,
  maxMessagesWithMetadata: 5_000,
  minMessageSizeKBForMetadata: 500,
  maxAttachmentsPerMessage: 20,
};

/**
 * Merge caller-supplied overrides with defaults, clamping each field to its
 * safe range. Unknown / undefined fields fall back to the default.
 */
export function resolveLimits(
  overrides: Partial<EmailReportLimits> | undefined,
): EmailReportLimits {
  const base = { ...DEFAULT_EMAIL_REPORT_LIMITS };
  if (!overrides) return base;

  const clamp = (value: number | undefined, fallback: number, min: number, max: number) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(value)));
  };

  const windowDaysRaw = overrides.windowDays;
  const windowDays =
    typeof windowDaysRaw === "number" &&
    (VALID_WINDOW_DAYS_LIST as readonly number[]).includes(windowDaysRaw)
      ? windowDaysRaw
      : base.windowDays;

  return {
    windowDays,
    maxUsers: clamp(overrides.maxUsers, base.maxUsers, 1, 100_000),
    maxMessagesPerUser: clamp(overrides.maxMessagesPerUser, base.maxMessagesPerUser, 1, 50_000),
    maxTotalMessages: clamp(overrides.maxTotalMessages, base.maxTotalMessages, 1, 5_000_000),
    attachmentMetadataEnabled: overrides.attachmentMetadataEnabled ?? base.attachmentMetadataEnabled,
    maxMessagesWithMetadata: clamp(
      overrides.maxMessagesWithMetadata,
      base.maxMessagesWithMetadata,
      0,
      200_000,
    ),
    minMessageSizeKBForMetadata: clamp(
      overrides.minMessageSizeKBForMetadata,
      base.minMessageSizeKBForMetadata,
      0,
      1_000_000,
    ),
    maxAttachmentsPerMessage: clamp(
      overrides.maxAttachmentsPerMessage,
      base.maxAttachmentsPerMessage,
      1,
      100,
    ),
  };
}

// ── Domain classification ────────────────────────────────────────────────────

/**
 * Extract and lowercase the domain portion of an SMTP address. Returns null
 * for malformed inputs so callers can skip them cleanly.
 */
export function extractDomain(address: string | null | undefined): string | null {
  if (!address || typeof address !== "string") return null;
  const at = address.lastIndexOf("@");
  if (at < 0 || at === address.length - 1) return null;
  const domain = address.slice(at + 1).trim().toLowerCase();
  return domain.length > 0 ? domain : null;
}

/**
 * Normalize a list of tenant-verified domains to lowercase, trim, dedupe, and
 * drop empty values. Accepts anything — tolerant of bad input.
 */
export function normalizeVerifiedDomains(
  domains: ReadonlyArray<string | null | undefined>,
): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < domains.length; i++) {
    const d = domains[i];
    if (typeof d !== "string") continue;
    const v = d.trim().toLowerCase();
    if (v.length > 0) out.add(v);
  }
  return out;
}

/**
 * Classify a recipient address as internal or external based on the
 * tenant's verified domains. External = domain not in the verified set.
 * Malformed addresses are classified as external (conservative default).
 */
export function classifyRecipient(
  address: string | null | undefined,
  verifiedDomains: Set<string>,
): "internal" | "external" {
  const domain = extractDomain(address);
  if (!domain) return "external";
  return verifiedDomains.has(domain) ? "internal" : "external";
}

/**
 * For a message with N recipients, split the count and message size across
 * internal vs external based on the recipient domains. Messages with at least
 * one internal and one external recipient contribute to both buckets
 * proportionally (by recipient count), which gives a fair storage attribution
 * without double-counting bytes.
 *
 * If the message has zero recipients (rare, e.g. draft-like sent items),
 * the message is attributed entirely to "external" as a conservative default.
 */
export function splitRecipientAttribution(
  recipients: string[],
  sizeBytes: number,
  verifiedDomains: Set<string>,
): {
  internalMessages: number;
  internalBytes: number;
  externalMessages: number;
  externalBytes: number;
} {
  if (recipients.length === 0) {
    return {
      internalMessages: 0,
      internalBytes: 0,
      externalMessages: 1,
      externalBytes: sizeBytes,
    };
  }

  let internalCount = 0;
  let externalCount = 0;
  for (const r of recipients) {
    if (classifyRecipient(r, verifiedDomains) === "internal") internalCount++;
    else externalCount++;
  }
  const total = internalCount + externalCount;
  const internalShare = total > 0 ? internalCount / total : 0;
  const externalShare = total > 0 ? externalCount / total : 0;
  const internalBytes = Math.round(sizeBytes * internalShare);
  const externalBytes = sizeBytes - internalBytes;

  return {
    // A message "counts" as internal if any recipient is internal, and
    // symmetric for external. Bytes are split proportionally while preserving
    // the invariant that internalBytes + externalBytes === sizeBytes.
    internalMessages: internalCount > 0 ? 1 : 0,
    internalBytes,
    externalMessages: externalCount > 0 ? 1 : 0,
    externalBytes,
  };
}

// ── Percentile helpers ───────────────────────────────────────────────────────

/**
 * Compute a percentile (0..1) from an UNSORTED sample of numbers using the
 * nearest-rank method. Returns 0 for empty input. Sample is not mutated.
 */
export function percentile(sample: number[], p: number): number {
  if (sample.length === 0) return 0;
  const pClamped = Math.max(0, Math.min(1, p));
  const sorted = [...sample].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const rank = Math.ceil(pClamped * sorted.length);
  const index = Math.max(0, Math.min(sorted.length - 1, rank - 1));
  return sorted[index];
}

export function median(sample: number[]): number {
  if (sample.length === 0) return 0;
  const sorted = [...sample].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function average(sample: number[]): number {
  if (sample.length === 0) return 0;
  let sum = 0;
  for (const n of sample) sum += n;
  return Math.round(sum / sample.length);
}

// ── Aggregator ───────────────────────────────────────────────────────────────

/**
 * Lightweight, incremental aggregator used by the report service. It tracks
 * enough state to produce an EmailReportSummary without holding every
 * message in memory. Only attachment sizes are retained as a numeric array
 * so we can compute percentiles at the end.
 */
export class EmailReportAggregator {
  private readonly verifiedDomains: Set<string>;

  totalMessagesAnalyzed = 0;
  messagesWithAttachments = 0;
  estimatedAttachmentBytes = 0;

  internalMessages = 0;
  internalBytes = 0;
  externalMessages = 0;
  externalBytes = 0;

  classicAttachmentCount = 0;
  classicAttachmentBytes = 0;
  referenceAttachmentCount = 0;
  inlineAttachmentCount = 0;
  inlineAttachmentBytes = 0;
  attachmentFetchErrors = 0;

  private readonly attachmentSizes: number[] = [];
  private readonly senderTotals = new Map<string, { bytes: number; count: number }>();
  private readonly domainTotals = new Map<string, { bytes: number; count: number }>();

  private readonly contentTypeTotals = new Map<string, { bytes: number; count: number }>();
  private readonly patternTotals = new Map<string, { bytes: number; count: number }>();

  constructor(verifiedDomains: ReadonlyArray<string | null | undefined>) {
    this.verifiedDomains = normalizeVerifiedDomains(verifiedDomains);
  }

  recordMessage(params: {
    hasAttachments: boolean;
    senderAddress: string | null;
    recipientAddresses: string[];
    attachmentBytes: number;
  }): void {
    this.totalMessagesAnalyzed++;
    if (!params.hasAttachments) return;

    this.messagesWithAttachments++;
    this.estimatedAttachmentBytes += params.attachmentBytes;
    if (params.attachmentBytes > 0) {
      this.attachmentSizes.push(params.attachmentBytes);
    }

    if (params.senderAddress) {
      const key = params.senderAddress.toLowerCase();
      const prev = this.senderTotals.get(key) ?? { bytes: 0, count: 0 };
      prev.bytes += params.attachmentBytes;
      prev.count += 1;
      this.senderTotals.set(key, prev);
    }

    const seenDomains = new Set<string>();
    for (const r of params.recipientAddresses) {
      const domain = extractDomain(r);
      if (!domain || seenDomains.has(domain)) continue;
      seenDomains.add(domain);
      const prev = this.domainTotals.get(domain) ?? { bytes: 0, count: 0 };
      prev.bytes += params.attachmentBytes;
      prev.count += 1;
      this.domainTotals.set(domain, prev);
    }

    const split = splitRecipientAttribution(
      params.recipientAddresses,
      params.attachmentBytes,
      this.verifiedDomains,
    );
    this.internalMessages += split.internalMessages;
    this.internalBytes += split.internalBytes;
    this.externalMessages += split.externalMessages;
    this.externalBytes += split.externalBytes;
  }

  recordAttachment(params: {
    name: string | null;
    contentType: string | null;
    size: number;
    odataType: string | null;
    isInline: boolean;
  }): void {
    const isReference = params.odataType === "#microsoft.graph.referenceAttachment";

    if (params.isInline && !isReference) {
      this.inlineAttachmentCount++;
      this.inlineAttachmentBytes += params.size;
    } else if (isReference) {
      this.referenceAttachmentCount++;
    } else {
      this.classicAttachmentCount++;
      this.classicAttachmentBytes += params.size;
    }

    const ct = (params.contentType ?? "application/octet-stream").toLowerCase();
    const prev = this.contentTypeTotals.get(ct) ?? { bytes: 0, count: 0 };
    prev.bytes += params.size;
    prev.count += 1;
    this.contentTypeTotals.set(ct, prev);

    if (params.name) {
      const sizeBucket = Math.round(params.size / 1024);
      const hashInput = `${params.name.toLowerCase()}|${sizeBucket}`;
      const key = createHash("sha256").update(hashInput).digest("hex").substring(0, 16);
      const p = this.patternTotals.get(key) ?? { bytes: 0, count: 0 };
      p.bytes += params.size;
      p.count += 1;
      this.patternTotals.set(key, p);
    }
  }

  toSummary(options: {
    topN?: number;
  } = {}): EmailReportSummary {
    const topN = options.topN ?? 10;

    const topList = (m: Map<string, { bytes: number; count: number }>) =>
      Array.from(m.entries())
        .map(([k, v]) => ({ key: k, ...v }))
        .sort((a, b) => b.bytes - a.bytes || b.count - a.count)
        .slice(0, topN);

    const pct =
      this.totalMessagesAnalyzed > 0
        ? this.messagesWithAttachments / this.totalMessagesAnalyzed
        : 0;

    const summary: EmailReportSummary = {
      totalMessagesAnalyzed: this.totalMessagesAnalyzed,
      messagesWithAttachments: this.messagesWithAttachments,
      pctWithAttachments: Number(pct.toFixed(4)),
      estimatedAttachmentBytes: this.estimatedAttachmentBytes,
      sizeStats: {
        avgBytes: average(this.attachmentSizes),
        medianBytes: median(this.attachmentSizes),
        p90Bytes: percentile(this.attachmentSizes, 0.9),
        p95Bytes: percentile(this.attachmentSizes, 0.95),
        maxBytes:
          this.attachmentSizes.length === 0
            ? 0
            : this.attachmentSizes.reduce((m, v) => (v > m ? v : m), 0),
      },
      internal: { messages: this.internalMessages, bytes: this.internalBytes },
      external: { messages: this.externalMessages, bytes: this.externalBytes },
      topSenders: topList(this.senderTotals).map(e => ({
        sender: e.key,
        bytes: e.bytes,
        count: e.count,
      })),
      topRecipientDomains: topList(this.domainTotals).map(e => ({
        domain: e.key,
        bytes: e.bytes,
        count: e.count,
      })),
      topAttachmentTypes: topList(this.contentTypeTotals).map(e => ({
        contentType: e.key,
        bytes: e.bytes,
        count: e.count,
      })),
      repeatedAttachmentPatterns: topList(this.patternTotals)
        .filter(e => e.count > 1)
        .map(e => ({ key: e.key, bytes: e.bytes, count: e.count })),
      classicAttachments: { count: this.classicAttachmentCount, bytes: this.classicAttachmentBytes },
      referenceAttachments: { count: this.referenceAttachmentCount },
      inlineAttachments: { count: this.inlineAttachmentCount, bytes: this.inlineAttachmentBytes },
      attachmentFetchErrors: this.attachmentFetchErrors,
    };

    return summary;
  }
}

// ── Caps enforcement ─────────────────────────────────────────────────────────

/**
 * Stateful helper that tracks progress against the per-run limits and tells
 * the caller when to stop early. Kept tiny and fully tested.
 */
export class CapsTracker {
  private totalMessages = 0;
  private messagesWithMetadata = 0;

  readonly hit: {
    maxTotalMessages: boolean;
    maxMessagesWithMetadata: boolean;
    usersHitPerUserCap: string[];
  } = {
    maxTotalMessages: false,
    maxMessagesWithMetadata: false,
    usersHitPerUserCap: [],
  };

  constructor(private readonly limits: EmailReportLimits) {}

  /** Whether another message can be processed at all. */
  canProcessMoreMessages(): boolean {
    return this.totalMessages < this.limits.maxTotalMessages;
  }

  /** Whether another message can be processed for a specific user. */
  canProcessForUser(userTotal: number): boolean {
    return userTotal < this.limits.maxMessagesPerUser && this.canProcessMoreMessages();
  }

  /** Register that a message was processed for the run. */
  recordMessage(): void {
    this.totalMessages++;
    if (this.totalMessages >= this.limits.maxTotalMessages) {
      this.hit.maxTotalMessages = true;
    }
  }

  /** Register that a user hit their per-user cap. */
  markUserHitPerUserCap(userId: string): void {
    if (!this.hit.usersHitPerUserCap.includes(userId)) {
      this.hit.usersHitPerUserCap.push(userId);
    }
  }

  /**
   * Whether an individual message qualifies for METADATA-mode enrichment
   * given the size threshold and the global metadata cap.
   */
  canProcessMetadataFor(messageSizeBytes: number): boolean {
    if (!this.limits.attachmentMetadataEnabled) return false;
    if (this.messagesWithMetadata >= this.limits.maxMessagesWithMetadata) return false;
    const minBytes = this.limits.minMessageSizeKBForMetadata * 1024;
    return messageSizeBytes >= minBytes;
  }

  recordMetadataMessage(): void {
    this.messagesWithMetadata++;
    if (this.messagesWithMetadata >= this.limits.maxMessagesWithMetadata) {
      this.hit.maxMessagesWithMetadata = true;
    }
  }

  get totalsProcessed(): number {
    return this.totalMessages;
  }

  get metadataMessagesProcessed(): number {
    return this.messagesWithMetadata;
  }
}

// ── Accuracy caveats ─────────────────────────────────────────────────────────

/**
 * Produce a list of human-readable accuracy caveats for a completed run.
 * Always includes the "message size is a proxy" caveat in Estimate mode.
 */
export function buildAccuracyCaveats(params: {
  mode: "ESTIMATE" | "METADATA";
  limits: EmailReportLimits;
  capsHit: {
    maxTotalMessages: boolean;
    maxMessagesWithMetadata: boolean;
    usersHitPerUserCap: string[];
    maxUsers?: boolean;
    inventoryStale?: boolean;
  };
  usersPlanned: number;
  usersProcessed: number;
  totalMessagesAnalyzed: number;
}): string[] {
  const caveats: string[] = [];

  caveats.push(
    "Attachment sizes are fetched per-message from Graph API metadata. " +
      "Reference attachments (OneDrive/SharePoint links) report 0 bytes since the data lives in ODSP.",
  );

  if (params.capsHit.maxUsers) {
    caveats.push(
      `User sampling cap reached (maxUsers=${params.limits.maxUsers}). ` +
        `Only a subset of tenant users was analyzed.`,
    );
  }

  if (params.capsHit.maxTotalMessages) {
    caveats.push(
      `Global message cap reached (maxTotalMessages=${params.limits.maxTotalMessages}). ` +
        `Some users were not fully analyzed.`,
    );
  }

  if (params.capsHit.usersHitPerUserCap.length > 0) {
    caveats.push(
      `${params.capsHit.usersHitPerUserCap.length} user(s) hit the per-user cap ` +
        `(maxMessagesPerUser=${params.limits.maxMessagesPerUser}). ` +
        `Their message counts are truncated to the cap.`,
    );
  }

  if (params.mode === "METADATA" && params.capsHit.maxMessagesWithMetadata) {
    caveats.push(
      `Metadata Mode cap reached (maxMessagesWithMetadata=${params.limits.maxMessagesWithMetadata}). ` +
        `Attachment-type aggregates reflect only the sampled messages.`,
    );
  }

  if (params.capsHit.inventoryStale) {
    caveats.push(
      "User inventory was stale when this report ran. " +
        "Consider refreshing the inventory for a more accurate user list.",
    );
  }

  const userPct =
    params.usersPlanned > 0 ? params.usersProcessed / params.usersPlanned : 0;
  caveats.push(
    `Sampled ${params.usersProcessed}/${params.usersPlanned} users ` +
      `(${Math.round(userPct * 100)}%) and ${params.totalMessagesAnalyzed} messages.`,
  );

  return caveats;
}
