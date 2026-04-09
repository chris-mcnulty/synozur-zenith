/**
 * Unit tests for the Email Content Storage Report metric helpers.
 *
 * These tests use Node's built-in test runner (`node:test`) and assertion
 * library (`node:assert/strict`). No external test framework is required.
 *
 * Run with:
 *   npm run test:email-report
 * which invokes:
 *   tsx --test server/services/email-report-metrics.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_EMAIL_REPORT_LIMITS,
  resolveLimits,
  extractDomain,
  normalizeVerifiedDomains,
  classifyRecipient,
  splitRecipientAttribution,
  percentile,
  median,
  average,
  EmailReportAggregator,
  CapsTracker,
  buildAccuracyCaveats,
} from "./email-report-metrics";

// ── Domain classification ────────────────────────────────────────────────────

describe("extractDomain", () => {
  it("extracts and lowercases the domain of a valid address", () => {
    assert.equal(extractDomain("Alice@Example.COM"), "example.com");
  });

  it("returns null for a null or empty input", () => {
    assert.equal(extractDomain(null), null);
    assert.equal(extractDomain(undefined), null);
    assert.equal(extractDomain(""), null);
  });

  it("returns null for a malformed address with no @", () => {
    assert.equal(extractDomain("no-at-sign"), null);
  });

  it("returns null when @ is at the end of the string", () => {
    assert.equal(extractDomain("user@"), null);
  });

  it("handles addresses with multiple @ by taking the last one", () => {
    // Rare, but we should be permissive.
    assert.equal(extractDomain("quoted@name@example.com"), "example.com");
  });
});

describe("normalizeVerifiedDomains", () => {
  it("lowercases, trims, and deduplicates", () => {
    const set = normalizeVerifiedDomains([" Example.com ", "example.com", "OTHER.io"]);
    assert.equal(set.size, 2);
    assert.ok(set.has("example.com"));
    assert.ok(set.has("other.io"));
  });

  it("skips null/undefined/non-string entries", () => {
    const set = normalizeVerifiedDomains([null as any, undefined as any, "", "ok.com"]);
    assert.equal(set.size, 1);
    assert.ok(set.has("ok.com"));
  });
});

describe("classifyRecipient", () => {
  const verified = normalizeVerifiedDomains(["contoso.com", "contoso.co.uk"]);

  it("classifies a matching domain as internal", () => {
    assert.equal(classifyRecipient("bob@contoso.com", verified), "internal");
  });

  it("classifies a mismatched domain as external", () => {
    assert.equal(classifyRecipient("bob@other.com", verified), "external");
  });

  it("classifies a malformed address as external (conservative)", () => {
    assert.equal(classifyRecipient("not-an-email", verified), "external");
    assert.equal(classifyRecipient(null, verified), "external");
  });

  it("is case insensitive on the verified domain", () => {
    assert.equal(classifyRecipient("carol@CONTOSO.com", verified), "internal");
  });
});

describe("splitRecipientAttribution", () => {
  const verified = normalizeVerifiedDomains(["contoso.com"]);

  it("attributes fully-internal messages to internal only", () => {
    const split = splitRecipientAttribution(
      ["alice@contoso.com", "bob@contoso.com"],
      1000,
      verified,
    );
    assert.equal(split.internalMessages, 1);
    assert.equal(split.externalMessages, 0);
    assert.equal(split.internalBytes, 1000);
    assert.equal(split.externalBytes, 0);
  });

  it("attributes fully-external messages to external only", () => {
    const split = splitRecipientAttribution(
      ["x@a.com", "y@b.com"],
      1000,
      verified,
    );
    assert.equal(split.externalMessages, 1);
    assert.equal(split.internalMessages, 0);
    assert.equal(split.externalBytes, 1000);
    assert.equal(split.internalBytes, 0);
  });

  it("splits mixed messages proportionally by recipient count", () => {
    const split = splitRecipientAttribution(
      ["alice@contoso.com", "x@other.com", "y@other.com", "z@other.com"],
      1000,
      verified,
    );
    // 1 internal + 3 external → 250 internal bytes, 750 external bytes
    assert.equal(split.internalMessages, 1);
    assert.equal(split.externalMessages, 1);
    assert.equal(split.internalBytes, 250);
    assert.equal(split.externalBytes, 750);
  });

  it("treats zero-recipient messages as external (conservative default)", () => {
    const split = splitRecipientAttribution([], 500, verified);
    assert.equal(split.externalMessages, 1);
    assert.equal(split.externalBytes, 500);
    assert.equal(split.internalMessages, 0);
  });
});

// ── Percentile helpers ───────────────────────────────────────────────────────

describe("percentile / median / average", () => {
  it("returns 0 for empty input", () => {
    assert.equal(percentile([], 0.9), 0);
    assert.equal(median([]), 0);
    assert.equal(average([]), 0);
  });

  it("computes simple percentiles correctly", () => {
    const sample = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.equal(percentile(sample, 0.5), 5);
    assert.equal(percentile(sample, 0.9), 9);
    assert.equal(percentile(sample, 0.95), 10);
  });

  it("does not mutate the input sample", () => {
    const sample = [5, 3, 1, 4, 2];
    const snapshot = [...sample];
    percentile(sample, 0.9);
    median(sample);
    assert.deepEqual(sample, snapshot);
  });

  it("handles a single-element sample", () => {
    assert.equal(percentile([42], 0.5), 42);
    assert.equal(median([42]), 42);
    assert.equal(average([42]), 42);
  });

  it("computes median for even-length samples as integer mean of middle two", () => {
    assert.equal(median([1, 2, 3, 4]), 3); // (2+3)/2 = 2.5 → rounded to 3
  });

  it("computes average as rounded integer", () => {
    assert.equal(average([1, 2, 3]), 2);
    assert.equal(average([1, 2, 4]), 2); // 2.33 → 2
  });
});

// ── Limits resolution ────────────────────────────────────────────────────────

describe("resolveLimits", () => {
  it("returns defaults when no overrides given", () => {
    assert.deepEqual(resolveLimits(undefined), DEFAULT_EMAIL_REPORT_LIMITS);
    assert.deepEqual(resolveLimits({}), DEFAULT_EMAIL_REPORT_LIMITS);
  });

  it("clamps maxUsers to the safe range", () => {
    assert.equal(resolveLimits({ maxUsers: 0 }).maxUsers, 1);
    assert.equal(resolveLimits({ maxUsers: -10 }).maxUsers, 1);
    assert.equal(resolveLimits({ maxUsers: 9_999_999 }).maxUsers, 100_000);
  });

  it("ignores an invalid windowDays and keeps the default", () => {
    const r = resolveLimits({ windowDays: 42 });
    assert.equal(r.windowDays, DEFAULT_EMAIL_REPORT_LIMITS.windowDays);
  });

  it("accepts allowed windowDays values", () => {
    assert.equal(resolveLimits({ windowDays: 7 }).windowDays, 7);
    assert.equal(resolveLimits({ windowDays: 30 }).windowDays, 30);
    assert.equal(resolveLimits({ windowDays: 90 }).windowDays, 90);
  });

  it("respects the attachmentMetadataEnabled flag", () => {
    assert.equal(resolveLimits({ attachmentMetadataEnabled: true }).attachmentMetadataEnabled, true);
    assert.equal(resolveLimits({ attachmentMetadataEnabled: false }).attachmentMetadataEnabled, false);
  });
});

// ── Aggregator ───────────────────────────────────────────────────────────────

describe("EmailReportAggregator", () => {
  it("tracks totals and attribution for a realistic mix of messages", () => {
    const agg = new EmailReportAggregator(["contoso.com"]);

    // 1: internal, with attachment
    agg.recordMessage({
      sizeBytes: 1000,
      hasAttachments: true,
      senderAddress: "alice@contoso.com",
      recipientAddresses: ["bob@contoso.com"],
    });
    // 2: external, with attachment
    agg.recordMessage({
      sizeBytes: 2000,
      hasAttachments: true,
      senderAddress: "alice@contoso.com",
      recipientAddresses: ["external@vendor.io"],
    });
    // 3: no attachment (should not count toward attachmentBytes)
    agg.recordMessage({
      sizeBytes: 500,
      hasAttachments: false,
      senderAddress: "alice@contoso.com",
      recipientAddresses: ["bob@contoso.com"],
    });
    // 4: mixed internal+external, with attachment
    agg.recordMessage({
      sizeBytes: 4000,
      hasAttachments: true,
      senderAddress: "dave@contoso.com",
      recipientAddresses: ["alice@contoso.com", "x@vendor.io", "y@vendor.io", "z@vendor.io"],
    });

    const summary = agg.toSummary({ topN: 5 });

    assert.equal(summary.totalMessagesAnalyzed, 4);
    assert.equal(summary.messagesWithAttachments, 3);
    assert.equal(summary.pctWithAttachments, 0.75);
    assert.equal(summary.estimatedAttachmentBytes, 1000 + 2000 + 4000);

    // Internal attribution: message 1 (1000), message 4 (1/4 of 4000 = 1000) = 2000
    assert.equal(summary.internal.bytes, 2000);
    // External attribution: message 2 (2000), message 4 (3/4 of 4000 = 3000) = 5000
    assert.equal(summary.external.bytes, 5000);
    assert.equal(summary.internal.messages, 2);
    assert.equal(summary.external.messages, 2);

    // Top senders: alice has 3000, dave has 4000 → dave first
    assert.equal(summary.topSenders[0].sender, "dave@contoso.com");
    assert.equal(summary.topSenders[0].bytes, 4000);
    assert.equal(summary.topSenders[1].sender, "alice@contoso.com");
    assert.equal(summary.topSenders[1].bytes, 3000);

    // Size stats on [1000, 2000, 4000]
    assert.equal(summary.sizeStats.maxBytes, 4000);
    assert.equal(summary.sizeStats.medianBytes, 2000);
  });

  it("emits metadata-only aggregates only when requested", () => {
    const agg = new EmailReportAggregator(["contoso.com"]);
    agg.recordMessage({
      sizeBytes: 1000,
      hasAttachments: true,
      senderAddress: "alice@contoso.com",
      recipientAddresses: ["bob@contoso.com"],
    });
    agg.recordAttachment({ name: "invoice.pdf", contentType: "application/pdf", size: 800 });
    agg.recordAttachment({ name: "invoice.pdf", contentType: "application/pdf", size: 800 });

    const withoutMeta = agg.toSummary({ includeMetadataAggregates: false });
    assert.equal(withoutMeta.topAttachmentTypes, undefined);

    const withMeta = agg.toSummary({ includeMetadataAggregates: true });
    assert.ok(Array.isArray(withMeta.topAttachmentTypes));
    assert.equal(withMeta.topAttachmentTypes?.[0].contentType, "application/pdf");
    assert.equal(withMeta.topAttachmentTypes?.[0].count, 2);

    assert.ok(Array.isArray(withMeta.repeatedAttachmentPatterns));
    assert.equal(withMeta.repeatedAttachmentPatterns?.[0].count, 2);
  });

  it("counts each recipient domain only once per message", () => {
    const agg = new EmailReportAggregator(["contoso.com"]);
    agg.recordMessage({
      sizeBytes: 1000,
      hasAttachments: true,
      senderAddress: "a@contoso.com",
      recipientAddresses: [
        "x@vendor.io",
        "y@vendor.io",
        "z@vendor.io",
      ],
    });
    const summary = agg.toSummary({});
    const vendorRow = summary.topRecipientDomains.find(d => d.domain === "vendor.io");
    assert.ok(vendorRow);
    assert.equal(vendorRow?.count, 1, "Should count each domain once per message");
  });

  it("returns zeros for an empty run", () => {
    const agg = new EmailReportAggregator(["contoso.com"]);
    const summary = agg.toSummary({});
    assert.equal(summary.totalMessagesAnalyzed, 0);
    assert.equal(summary.messagesWithAttachments, 0);
    assert.equal(summary.pctWithAttachments, 0);
    assert.equal(summary.estimatedAttachmentBytes, 0);
    assert.deepEqual(summary.topSenders, []);
    assert.deepEqual(summary.topRecipientDomains, []);
  });
});

// ── Caps enforcement ─────────────────────────────────────────────────────────

describe("CapsTracker", () => {
  it("stops processing when maxTotalMessages is hit", () => {
    const caps = new CapsTracker({
      ...DEFAULT_EMAIL_REPORT_LIMITS,
      maxTotalMessages: 3,
    });
    assert.equal(caps.canProcessMoreMessages(), true);
    caps.recordMessage();
    caps.recordMessage();
    caps.recordMessage();
    assert.equal(caps.canProcessMoreMessages(), false);
    assert.equal(caps.hit.maxTotalMessages, true);
  });

  it("stops per-user processing at maxMessagesPerUser", () => {
    const caps = new CapsTracker({
      ...DEFAULT_EMAIL_REPORT_LIMITS,
      maxMessagesPerUser: 2,
    });
    assert.equal(caps.canProcessForUser(0), true);
    assert.equal(caps.canProcessForUser(1), true);
    assert.equal(caps.canProcessForUser(2), false);
    caps.markUserHitPerUserCap("user-1");
    assert.deepEqual(caps.hit.usersHitPerUserCap, ["user-1"]);
    // Marking the same user twice is a no-op.
    caps.markUserHitPerUserCap("user-1");
    assert.deepEqual(caps.hit.usersHitPerUserCap, ["user-1"]);
  });

  it("gates METADATA enrichment on size threshold and flag", () => {
    const capsDisabled = new CapsTracker({
      ...DEFAULT_EMAIL_REPORT_LIMITS,
      attachmentMetadataEnabled: false,
      minMessageSizeKBForMetadata: 100,
    });
    assert.equal(capsDisabled.canProcessMetadataFor(9_999_999), false);

    const caps = new CapsTracker({
      ...DEFAULT_EMAIL_REPORT_LIMITS,
      attachmentMetadataEnabled: true,
      minMessageSizeKBForMetadata: 500, // 500 KB == 512000 bytes
      maxMessagesWithMetadata: 2,
    });
    assert.equal(caps.canProcessMetadataFor(100_000), false); // below threshold
    assert.equal(caps.canProcessMetadataFor(600_000), true);
    caps.recordMetadataMessage();
    caps.recordMetadataMessage();
    assert.equal(caps.canProcessMetadataFor(600_000), false); // metadata cap hit
    assert.equal(caps.hit.maxMessagesWithMetadata, true);
  });
});

// ── Accuracy caveats ─────────────────────────────────────────────────────────

describe("buildAccuracyCaveats", () => {
  it("always includes the size-proxy caveat in Estimate mode", () => {
    const caveats = buildAccuracyCaveats({
      mode: "ESTIMATE",
      limits: DEFAULT_EMAIL_REPORT_LIMITS,
      capsHit: {
        maxTotalMessages: false,
        maxMessagesWithMetadata: false,
        usersHitPerUserCap: [],
      },
      usersPlanned: 10,
      usersProcessed: 10,
      totalMessagesAnalyzed: 100,
    });
    const text = caveats.join("\n");
    assert.match(text, /proxy/i);
    assert.match(text, /Sampled 10\/10 users/);
  });

  it("does NOT include the size-proxy caveat in Metadata mode", () => {
    const caveats = buildAccuracyCaveats({
      mode: "METADATA",
      limits: DEFAULT_EMAIL_REPORT_LIMITS,
      capsHit: {
        maxTotalMessages: false,
        maxMessagesWithMetadata: false,
        usersHitPerUserCap: [],
      },
      usersPlanned: 10,
      usersProcessed: 10,
      totalMessagesAnalyzed: 100,
    });
    assert.ok(!caveats.join("\n").toLowerCase().includes("proxy"));
  });

  it("notes each cap that was hit", () => {
    const caveats = buildAccuracyCaveats({
      mode: "ESTIMATE",
      limits: DEFAULT_EMAIL_REPORT_LIMITS,
      capsHit: {
        maxTotalMessages: true,
        maxMessagesWithMetadata: false,
        usersHitPerUserCap: ["u1", "u2"],
        maxUsers: true,
        inventoryStale: true,
      },
      usersPlanned: 500,
      usersProcessed: 200,
      totalMessagesAnalyzed: 200_000,
    });
    const text = caveats.join("\n");
    assert.match(text, /maxUsers/);
    assert.match(text, /maxTotalMessages/);
    assert.match(text, /2 user\(s\) hit the per-user cap/);
    assert.match(text, /stale/i);
  });
});
