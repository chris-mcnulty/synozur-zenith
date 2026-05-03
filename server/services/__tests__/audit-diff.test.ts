import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { auditDiff, REDACTED_PLACEHOLDER } from "../audit-diff";

describe("auditDiff", () => {
  it("returns an empty object when nothing changed", () => {
    const prev = { name: "alpha", count: 1 };
    const next = { name: "alpha", count: 1 };
    assert.deepEqual(auditDiff(prev, next), {});
  });

  it("captures simple from/to pairs for changed fields", () => {
    const prev = { name: "alpha", count: 1 };
    const next = { name: "beta", count: 2 };
    assert.deepEqual(auditDiff(prev, next), {
      name: { from: "alpha", to: "beta" },
      count: { from: 1, to: 2 },
    });
  });

  it("only emits diffs for keys present in next", () => {
    const prev = { name: "alpha", note: "old" };
    const next = { name: "beta" };
    const diff = auditDiff(prev, next);
    assert.deepEqual(diff, { name: { from: "alpha", to: "beta" } });
    assert.equal("note" in diff, false);
  });

  it("normalizes missing previous values to null (added field)", () => {
    const next = { tagline: "new value" };
    const diff = auditDiff({}, next);
    assert.deepEqual(diff, { tagline: { from: null, to: "new value" } });
    // Survives JSONB round-trip — both keys must remain present.
    const round = JSON.parse(JSON.stringify(diff));
    assert.equal("from" in round.tagline, true);
    assert.equal("to" in round.tagline, true);
  });

  it("normalizes cleared values (next is null) and preserves keys after JSON round-trip", () => {
    const diff = auditDiff({ tagline: "old" }, { tagline: null });
    assert.deepEqual(diff, { tagline: { from: "old", to: null } });
    const round = JSON.parse(JSON.stringify(diff));
    assert.equal("from" in round.tagline, true);
    assert.equal("to" in round.tagline, true);
  });

  it("redacts known sensitive fields with a constant placeholder", () => {
    const diff = auditDiff(
      { clientSecret: "old-secret", password: "p1", apiKey: "k1" },
      { clientSecret: "new-secret", password: "p2", apiKey: "k2" },
    );
    assert.deepEqual(diff.clientSecret, { from: REDACTED_PLACEHOLDER, to: REDACTED_PLACEHOLDER });
    assert.deepEqual(diff.password, { from: REDACTED_PLACEHOLDER, to: REDACTED_PLACEHOLDER });
    assert.deepEqual(diff.apiKey, { from: REDACTED_PLACEHOLDER, to: REDACTED_PLACEHOLDER });
  });

  it("redacts when previous value is missing (added secret)", () => {
    const diff = auditDiff({}, { clientSecret: "fresh" });
    assert.deepEqual(diff.clientSecret, { from: null, to: REDACTED_PLACEHOLDER });
  });

  it("respects user-provided redactedFields", () => {
    const diff = auditDiff(
      { customSensitive: "before" },
      { customSensitive: "after" },
      ["customSensitive"],
    );
    assert.deepEqual(diff.customSensitive, { from: REDACTED_PLACEHOLDER, to: REDACTED_PLACEHOLDER });
  });

  it("treats deep-equal objects/arrays as unchanged", () => {
    const prev = { rules: [{ id: 1 }, { id: 2 }] };
    const next = { rules: [{ id: 1 }, { id: 2 }] };
    assert.deepEqual(auditDiff(prev, next), {});
  });

  it("detects nested object changes", () => {
    const diff = auditDiff(
      { config: { mode: "auto" } },
      { config: { mode: "manual" } },
    );
    assert.deepEqual(diff.config, {
      from: { mode: "auto" },
      to: { mode: "manual" },
    });
  });

  it("handles null prev (no previous record)", () => {
    const diff = auditDiff(null, { name: "x" });
    assert.deepEqual(diff, { name: { from: null, to: "x" } });
  });

  it("handles null/undefined next as no-op", () => {
    assert.deepEqual(auditDiff({ a: 1 }, null), {});
    assert.deepEqual(auditDiff({ a: 1 }, undefined), {});
  });
});
