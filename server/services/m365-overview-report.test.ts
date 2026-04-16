/**
 * Unit tests for the M365 Overview Report LLM output parsing helpers.
 *
 * Tests cover `extractJson` (code-fence stripping / brace extraction) and
 * `sanitizeRecommendations` (enum clamping, rank assignment, uniqueness).
 *
 * Run with:
 *   npm run test:m365-overview-report
 * which invokes:
 *   tsx --test server/services/m365-overview-report.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// These helpers are pure functions with no DB/network dependencies.
import { extractJson, sanitizeRecommendations } from "./m365-overview-report-helpers";

// ── extractJson ──────────────────────────────────────────────────────────────

describe("extractJson", () => {
  it("returns a bare JSON object unchanged", () => {
    const input = '{"narrative":"hello","recommendations":[]}';
    assert.equal(extractJson(input), input);
  });

  it("strips a ```json … ``` code fence", () => {
    const inner = '{"narrative":"ok","recommendations":[]}';
    const fenced = "```json\n" + inner + "\n```";
    assert.equal(extractJson(fenced), inner);
  });

  it("strips a plain ``` … ``` code fence (no language tag)", () => {
    const inner = '{"a":1}';
    assert.equal(extractJson("```\n" + inner + "\n```"), inner);
  });

  it("extracts JSON from surrounding prose via brace heuristic", () => {
    const inner = '{"key":"value"}';
    const prose = "Here is the JSON you asked for:\n\n" + inner + "\n\nHope this helps!";
    assert.equal(extractJson(prose), inner);
  });

  it("returns the trimmed input when no JSON structure is detectable", () => {
    const raw = "  sorry, I cannot comply  ";
    assert.equal(extractJson(raw), "sorry, I cannot comply");
  });
});

// ── sanitizeRecommendations ──────────────────────────────────────────────────

describe("sanitizeRecommendations", () => {
  it("returns an empty array for non-array input", () => {
    assert.deepEqual(sanitizeRecommendations(null), []);
    assert.deepEqual(sanitizeRecommendations({}), []);
    assert.deepEqual(sanitizeRecommendations("bad"), []);
  });

  it("drops items missing title or rationale", () => {
    const result = sanitizeRecommendations([
      { rank: 1, rationale: "no title", impact: "HIGH", effort: "LOW", category: "SITES" },
      { rank: 2, title: "has title", impact: "HIGH", effort: "LOW", category: "SITES" },
      { rank: 3, title: "complete", rationale: "complete", impact: "HIGH", effort: "LOW", category: "SITES" },
    ]);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, "complete");
  });

  it("clamps invalid impact/effort values to MEDIUM", () => {
    const [r] = sanitizeRecommendations([
      { rank: 1, title: "t", rationale: "r", impact: "EXTREME", effort: "NONE", category: "TEAMS" },
    ]);
    assert.equal(r.impact, "MEDIUM");
    assert.equal(r.effort, "MEDIUM");
  });

  it("clamps invalid category to SITES", () => {
    const [r] = sanitizeRecommendations([
      { rank: 1, title: "t", rationale: "r", impact: "HIGH", effort: "LOW", category: "INVALID" },
    ]);
    assert.equal(r.category, "SITES");
  });

  it("assigns idx+1 as rank when rank is missing or non-numeric", () => {
    const result = sanitizeRecommendations([
      { title: "a", rationale: "a", impact: "HIGH", effort: "LOW", category: "IA" },
      { title: "b", rationale: "b", impact: "LOW", effort: "HIGH", category: "COPILOT" },
    ]);
    assert.equal(result[0].rank, 1);
    assert.equal(result[1].rank, 2);
  });

  it("sorts by rank ascending and caps at 10 items", () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      rank: 12 - i, // reverse order
      title: `item-${i}`,
      rationale: "r",
      impact: "MEDIUM",
      effort: "MEDIUM",
      category: "SHARING",
    }));
    const result = sanitizeRecommendations(items);
    assert.equal(result.length, 10);
    // Should be sorted ascending by rank (1..10)
    for (let i = 0; i < result.length - 1; i++) {
      assert.ok(result[i].rank <= result[i + 1].rank);
    }
  });

  it("accepts all valid category values", () => {
    const categories = ["SITES", "TEAMS", "IA", "COPILOT", "SHARING", "LIFECYCLE", "LABELING"] as const;
    for (const cat of categories) {
      const [r] = sanitizeRecommendations([
        { rank: 1, title: "t", rationale: "r", impact: "HIGH", effort: "LOW", category: cat },
      ]);
      assert.equal(r.category, cat);
    }
  });

  it("preserves valid evidenceRefs and drops non-string entries", () => {
    const [r] = sanitizeRecommendations([
      {
        rank: 1,
        title: "t",
        rationale: "r",
        impact: "HIGH",
        effort: "LOW",
        category: "LABELING",
        evidenceRefs: ["metric-a", 42, null, "metric-b"],
      },
    ]);
    assert.deepEqual(r.evidenceRefs, ["metric-a", "metric-b"]);
  });

  it("sets evidenceRefs to undefined when not an array", () => {
    const [r] = sanitizeRecommendations([
      { rank: 1, title: "t", rationale: "r", impact: "HIGH", effort: "LOW", category: "TEAMS", evidenceRefs: "not-array" },
    ]);
    assert.equal(r.evidenceRefs, undefined);
  });

  it("handles duplicate ranks without crashing", () => {
    const result = sanitizeRecommendations([
      { rank: 1, title: "first", rationale: "r", impact: "HIGH", effort: "LOW", category: "SITES" },
      { rank: 1, title: "duplicate", rationale: "r", impact: "LOW", effort: "HIGH", category: "TEAMS" },
    ]);
    // Both items should survive; order is stable after sort
    assert.equal(result.length, 2);
    assert.ok(result.every(r => r.rank === 1));
  });
});
