/**
 * Pure utility functions for the M365 Overview Report LLM output parsing.
 *
 * Kept in a separate module so they can be unit-tested without pulling in
 * database or network dependencies.
 */

import type { M365OverviewRecommendation } from "@shared/schema";

/**
 * Extracts the outermost JSON object from an LLM response string.
 * Handles three common formats:
 *  1. Bare JSON object (pass-through)
 *  2. JSON wrapped in ``` or ```json code fences
 *  3. JSON embedded in surrounding prose (brace-heuristic extraction)
 */
export function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

/**
 * Validates and normalises the `recommendations` array from parsed LLM JSON.
 *
 * - Drops items that are missing `title` or `rationale`
 * - Clamps `impact`, `effort`, and `category` to their allowed enum sets
 * - Falls back to `idx + 1` when `rank` is missing or non-numeric
 * - Filters non-string entries from `evidenceRefs`
 * - Returns items sorted by rank ascending, capped at 10
 */
export function sanitizeRecommendations(input: unknown): M365OverviewRecommendation[] {
  if (!Array.isArray(input)) return [];
  const allowedImpact = new Set(["HIGH", "MEDIUM", "LOW"]);
  const allowedCategory = new Set([
    "SITES",
    "TEAMS",
    "IA",
    "COPILOT",
    "SHARING",
    "LIFECYCLE",
    "LABELING",
  ]);
  const out: M365OverviewRecommendation[] = [];
  input.forEach((item, idx) => {
    if (!item || typeof item !== "object") return;
    const r = item as Record<string, unknown>;
    const title = typeof r.title === "string" ? r.title : null;
    const rationale = typeof r.rationale === "string" ? r.rationale : null;
    if (!title || !rationale) return;
    const impact = allowedImpact.has(String(r.impact)) ? (r.impact as "HIGH" | "MEDIUM" | "LOW") : "MEDIUM";
    const effort = allowedImpact.has(String(r.effort)) ? (r.effort as "HIGH" | "MEDIUM" | "LOW") : "MEDIUM";
    const category = allowedCategory.has(String(r.category))
      ? (r.category as M365OverviewRecommendation["category"])
      : "SITES";
    const rank = typeof r.rank === "number" ? r.rank : idx + 1;
    const evidenceRefs = Array.isArray(r.evidenceRefs)
      ? (r.evidenceRefs.filter(e => typeof e === "string") as string[])
      : undefined;
    out.push({ rank, title, rationale, impact, effort, category, evidenceRefs });
  });
  return out.sort((a, b) => a.rank - b.rank).slice(0, 10);
}
