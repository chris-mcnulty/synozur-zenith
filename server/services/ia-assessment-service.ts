/**
 * Information Architecture Assessment Service (Task #53)
 *
 * Entry point: runIAAssessment(tenantConnectionId, orgId, triggeredBy)
 *
 * Flow:
 *   1. Load workspace inventory for the tenant
 *   2. Run deterministic IA scoring engine (ia-scoring.ts)
 *   3. Load grounding documents (system + org-scoped)
 *   4. Assemble structured prompt and call completeForFeature('ia_assessment', ...)
 *   5. Parse AI response into structured assessment output
 *   6. Persist to ai_assessment_runs
 *   7. Log AI usage
 */

import { pool } from "../db";
import { storage } from "../storage";
import { scoreIAHealth, type IAScoreResult } from "./ia-scoring";
import { completeForFeature } from "./ai-provider";
import { AI_FEATURES } from "@shared/ai-schema";

export type IAAssessmentStatus = "RUNNING" | "COMPLETED" | "FAILED";

export interface IADimensionResult {
  key: string;
  label: string;
  score: number;
  weight: number;
  aiCommentary: string;
  worstOffenders: Array<{
    workspaceId: string;
    displayName: string;
    siteUrl: string | null;
    reason: string;
  }>;
}

export interface IARoadmapItem {
  horizon: "30_DAY" | "60_DAY" | "90_DAY";
  action: string;
  expectedImpact: string;
}

export interface IAAssessmentRun {
  id: string;
  tenantConnectionId: string;
  orgId: string;
  triggeredBy: string | null;
  status: IAAssessmentStatus;
  overallScore: number | null;
  executiveSummary: string | null;
  dimensions: IADimensionResult[] | null;
  roadmap: IARoadmapItem[] | null;
  rawAiResponse: string | null;
  totalSites: number | null;
  evaluatedSites: number | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  errorMessage: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// DB helpers (raw SQL — no Drizzle schema for ai_assessment_runs yet)
// ---------------------------------------------------------------------------

async function insertRun(data: {
  tenantConnectionId: string;
  orgId: string;
  triggeredBy: string | null;
}): Promise<string> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO ai_assessment_runs
         (tenant_connection_id, org_id, triggered_by, status)
       VALUES ($1, $2, $3, 'RUNNING')
       RETURNING id`,
      [data.tenantConnectionId, data.orgId, data.triggeredBy],
    );
    return rows[0].id;
  } finally {
    client.release();
  }
}

async function updateRun(
  id: string,
  patch: {
    status: IAAssessmentStatus;
    overallScore?: number | null;
    executiveSummary?: string | null;
    dimensions?: IADimensionResult[] | null;
    roadmap?: IARoadmapItem[] | null;
    rawAiResponse?: string | null;
    totalSites?: number | null;
    evaluatedSites?: number | null;
    inputTokens?: number;
    outputTokens?: number;
    durationMs?: number;
    errorMessage?: string | null;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE ai_assessment_runs SET
         status            = $1,
         overall_score     = $2,
         executive_summary = $3,
         dimensions        = $4,
         roadmap           = $5,
         raw_ai_response   = $6,
         total_sites       = $7,
         evaluated_sites   = $8,
         input_tokens      = $9,
         output_tokens     = $10,
         duration_ms       = $11,
         error_message     = $12,
         completed_at      = CASE WHEN $1 IN ('COMPLETED','FAILED') THEN now() ELSE NULL END
       WHERE id = $13`,
      [
        patch.status,
        patch.overallScore ?? null,
        patch.executiveSummary ?? null,
        patch.dimensions ? JSON.stringify(patch.dimensions) : null,
        patch.roadmap ? JSON.stringify(patch.roadmap) : null,
        patch.rawAiResponse ?? null,
        patch.totalSites ?? null,
        patch.evaluatedSites ?? null,
        patch.inputTokens ?? 0,
        patch.outputTokens ?? 0,
        patch.durationMs ?? 0,
        patch.errorMessage ?? null,
        id,
      ],
    );
  } finally {
    client.release();
  }
}

export async function getRunById(id: string): Promise<IAAssessmentRun | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, tenant_connection_id, org_id, triggered_by, status,
              overall_score, executive_summary, dimensions, roadmap,
              raw_ai_response, total_sites, evaluated_sites,
              input_tokens, output_tokens, duration_ms,
              error_message, completed_at, created_at
       FROM ai_assessment_runs
       WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) return null;
    return mapRow(rows[0]);
  } finally {
    client.release();
  }
}

export async function getLatestRunForTenant(
  tenantConnectionId: string,
): Promise<IAAssessmentRun | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, tenant_connection_id, org_id, triggered_by, status,
              overall_score, executive_summary, dimensions, roadmap,
              raw_ai_response, total_sites, evaluated_sites,
              input_tokens, output_tokens, duration_ms,
              error_message, completed_at, created_at
       FROM ai_assessment_runs
       WHERE tenant_connection_id = $1 AND status = 'COMPLETED'
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantConnectionId],
    );
    if (rows.length === 0) return null;
    return mapRow(rows[0]);
  } finally {
    client.release();
  }
}

export async function deleteRun(runId: string, orgId: string): Promise<boolean> {
  const client = await pool.connect();
  try {
    const { rowCount } = await client.query(
      `DELETE FROM ai_assessment_runs WHERE id = $1 AND org_id = $2`,
      [runId, orgId],
    );
    return (rowCount ?? 0) > 0;
  } finally {
    client.release();
  }
}

export async function getRunHistory(
  orgId: string,
  tenantConnectionId?: string,
  limit = 20,
  offset = 0,
): Promise<{ runs: IAAssessmentRun[]; total: number }> {
  const client = await pool.connect();
  try {
    const conditions: string[] = ["org_id = $1"];
    const params: unknown[] = [orgId];

    if (tenantConnectionId) {
      conditions.push(`tenant_connection_id = $${params.length + 1}`);
      params.push(tenantConnectionId);
    }

    const where = conditions.join(" AND ");

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) AS total FROM ai_assessment_runs WHERE ${where}`,
      params,
    );
    const total = parseInt(countRows[0].total, 10);

    const { rows } = await client.query(
      `SELECT id, tenant_connection_id, org_id, triggered_by, status,
              overall_score, executive_summary, dimensions, roadmap,
              raw_ai_response, total_sites, evaluated_sites,
              input_tokens, output_tokens, duration_ms,
              error_message, completed_at, created_at
       FROM ai_assessment_runs
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    return { runs: rows.map(mapRow), total };
  } finally {
    client.release();
  }
}

/** Platform-owner view: all runs across all orgs in the last 30 days. */
export async function getAdminRunSummary(): Promise<{
  totalRuns: number;
  tenantsWithCompletedRun: number;
  totalTenants: number;
  averageScore: number | null;
}> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE created_at > now() - interval '30 days') AS total_runs,
        COUNT(DISTINCT tenant_connection_id) FILTER (WHERE status = 'COMPLETED' AND created_at > now() - interval '30 days') AS tenants_with_run,
        ROUND(AVG(overall_score) FILTER (WHERE status = 'COMPLETED' AND overall_score IS NOT NULL), 1) AS avg_score
      FROM ai_assessment_runs
    `);
    const row = rows[0];

    const totalTenants = await client.query("SELECT COUNT(*) AS cnt FROM tenant_connections");
    const total = parseInt(totalTenants.rows[0].cnt, 10);

    return {
      totalRuns: parseInt(row.total_runs, 10) || 0,
      tenantsWithCompletedRun: parseInt(row.tenants_with_run, 10) || 0,
      totalTenants: total,
      averageScore: row.avg_score ? parseFloat(row.avg_score) : null,
    };
  } finally {
    client.release();
  }
}

function mapRow(row: Record<string, any>): IAAssessmentRun {
  return {
    id: row.id,
    tenantConnectionId: row.tenant_connection_id,
    orgId: row.org_id,
    triggeredBy: row.triggered_by,
    status: row.status,
    overallScore: row.overall_score != null ? Number(row.overall_score) : null,
    executiveSummary: row.executive_summary,
    dimensions: row.dimensions ?? null,
    roadmap: row.roadmap ?? null,
    rawAiResponse: row.raw_ai_response,
    totalSites: row.total_sites != null ? Number(row.total_sites) : null,
    evaluatedSites: row.evaluated_sites != null ? Number(row.evaluated_sites) : null,
    inputTokens: Number(row.input_tokens) || 0,
    outputTokens: Number(row.output_tokens) || 0,
    durationMs: Number(row.duration_ms) || 0,
    errorMessage: row.error_message,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
    createdAt: new Date(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// AI usage logging
// ---------------------------------------------------------------------------

async function logAIUsage(params: {
  orgId: string;
  feature: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}): Promise<void> {
  const client = await pool.connect();
  try {
    // Rough cost estimate (same as copilot assessment service would use)
    const estimatedCost =
      (params.inputTokens / 1000) * 0.005 + (params.outputTokens / 1000) * 0.015;
    await client.query(
      `INSERT INTO ai_usage
         (org_id, feature, provider, model, input_tokens, output_tokens,
          estimated_cost_usd, duration_ms, success, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        params.orgId,
        params.feature,
        params.provider,
        params.model,
        params.inputTokens,
        params.outputTokens,
        estimatedCost.toFixed(6),
        params.durationMs,
        params.success,
        params.errorMessage ?? null,
      ],
    );
  } catch (err) {
    console.warn("[IA Assessment] Failed to log AI usage:", err);
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------

function buildSystemPrompt(groundingText: string): string {
  return `You are Zenith's Information Architecture Advisor — an expert in Microsoft 365 SharePoint governance and Information Architecture (IA) design.

Your role is to analyze a tenant's SharePoint IA health data and produce a structured JSON assessment that is both technically precise and business-actionable.

${groundingText ? `## Organizational Context & Standards\n${groundingText}\n` : ""}

## Response Format

You MUST respond with ONLY valid JSON in the following structure (no markdown, no preamble):

{
  "executiveSummary": "string — 2-3 paragraphs, plain text",
  "dimensionCommentary": {
    "naming_consistency": "string — 1-2 paragraphs of analysis and recommendations",
    "hub_governance": "string",
    "metadata_completeness": "string",
    "sensitivity_coverage": "string",
    "lifecycle_management": "string",
    "library_structure": "string",
    "content_type_deployment": "string",
    "metadata_schema": "string"
  },
  "priorityRecommendations": [
    { "rank": 1, "title": "string", "rationale": "string", "impact": "HIGH|MEDIUM|LOW" }
  ],
  "roadmap": [
    { "horizon": "30_DAY", "action": "string", "expectedImpact": "string" },
    { "horizon": "60_DAY", "action": "string", "expectedImpact": "string" },
    { "horizon": "90_DAY", "action": "string", "expectedImpact": "string" }
  ]
}

Provide exactly 3 roadmap items (one per horizon) and 3-5 priority recommendations.`;
}

function buildUserPrompt(scoreResult: IAScoreResult): string {
  const dimTable = scoreResult.dimensions
    .map(
      d =>
        `  ${d.label}: ${d.score}/100 (weight ${d.weight}%) — ${d.summary}`,
    )
    .join("\n");

  const offenderList = scoreResult.topOffenders
    .slice(0, 15)
    .map(o => `  - "${o.displayName}": ${o.reason}`)
    .join("\n");

  const metricsStr = Object.entries(scoreResult.orgMetrics)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");

  return `## IA Health Assessment Request

Overall IA Health Score: ${scoreResult.overallScore}/100

### Inventory Summary
${metricsStr}

### Dimension Scores
${dimTable}

### Worst-Offending Sites (sample)
${offenderList || "  None identified"}

Please produce a comprehensive IA assessment following the JSON format specified in the system prompt. Base your analysis exclusively on the data provided above. Be specific about which dimensions are most critical and name concrete remediation actions.`;
}

function parseAIResponse(raw: string): {
  executiveSummary: string | null;
  dimensionCommentary: Record<string, string>;
  roadmap: IARoadmapItem[];
} {
  try {
    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);

    const executiveSummary =
      typeof parsed.executiveSummary === "string" ? parsed.executiveSummary : null;

    const dimensionCommentary: Record<string, string> = {};
    if (parsed.dimensionCommentary && typeof parsed.dimensionCommentary === "object") {
      for (const [key, val] of Object.entries(parsed.dimensionCommentary)) {
        if (typeof val === "string") dimensionCommentary[key] = val;
      }
    }

    const roadmap: IARoadmapItem[] = [];
    if (Array.isArray(parsed.roadmap)) {
      for (const item of parsed.roadmap) {
        if (
          item.horizon &&
          typeof item.action === "string" &&
          typeof item.expectedImpact === "string"
        ) {
          roadmap.push({
            horizon: item.horizon as IARoadmapItem["horizon"],
            action: item.action,
            expectedImpact: item.expectedImpact,
          });
        }
      }
    }

    return { executiveSummary, dimensionCommentary, roadmap };
  } catch {
    return { executiveSummary: null, dimensionCommentary: {}, roadmap: [] };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runIAAssessment(
  tenantConnectionId: string,
  orgId: string,
  triggeredBy: string | null,
): Promise<string> {
  const runId = await insertRun({ tenantConnectionId, orgId, triggeredBy });

  // Run asynchronously — don't await
  _executeAssessment(runId, tenantConnectionId, orgId).catch(err => {
    console.error("[IA Assessment] Unhandled error during assessment:", err);
  });

  return runId;
}

async function _executeAssessment(
  runId: string,
  tenantConnectionId: string,
  orgId: string,
): Promise<void> {
  const start = Date.now();

  try {
    // 1. Load workspace inventory + library-level IA data
    const [workspaces, libs, columns, libCTs] = await Promise.all([
      storage.getWorkspaces(undefined, tenantConnectionId),
      storage.getDocumentLibrariesByTenant(tenantConnectionId),
      storage.getLibraryColumnsByTenant(tenantConnectionId),
      storage.getLibraryContentTypesByTenant(tenantConnectionId),
    ]);

    // 2. Deterministic scoring
    const scoreResult: IAScoreResult = scoreIAHealth(workspaces, libs, columns, libCTs);

    // 3. Load grounding documents
    const [systemDocs, orgDocs] = await Promise.all([
      storage.getGroundingDocuments("system"),
      storage.getGroundingDocuments("org", orgId),
    ]);
    const allDocs = [...systemDocs, ...orgDocs].filter(d => d.isActive);
    const groundingText = allDocs
      .map(d => `### ${d.name}\n${d.contentText}`)
      .join("\n\n");

    // 4. Call AI
    const systemPrompt = buildSystemPrompt(groundingText);
    const userPrompt = buildUserPrompt(scoreResult);

    const aiResult = await completeForFeature(
      AI_FEATURES.IA_ASSESSMENT,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      4000,
    );

    const durationMs = Date.now() - start;

    // 5. Parse AI response
    const { executiveSummary, dimensionCommentary, roadmap } = parseAIResponse(aiResult.content);

    // 6. Build structured dimension results
    const dimensionResults: IADimensionResult[] = scoreResult.dimensions.map(d => ({
      key: d.key,
      label: d.label,
      score: d.score,
      weight: d.weight,
      aiCommentary: dimensionCommentary[d.key] || d.summary,
      worstOffenders: d.worstOffenders.slice(0, 5).map(o => ({
        workspaceId: o.workspaceId,
        displayName: o.displayName,
        siteUrl: o.siteUrl,
        reason: o.reason,
      })),
    }));

    // 7. Persist
    await updateRun(runId, {
      status: "COMPLETED",
      overallScore: scoreResult.overallScore,
      executiveSummary,
      dimensions: dimensionResults,
      roadmap,
      rawAiResponse: aiResult.content,
      totalSites: scoreResult.totalSites,
      evaluatedSites: scoreResult.evaluatedSites,
      inputTokens: aiResult.inputTokens,
      outputTokens: aiResult.outputTokens,
      durationMs,
    });

    // 8. Log usage
    await logAIUsage({
      orgId,
      feature: AI_FEATURES.IA_ASSESSMENT,
      provider: aiResult.provider,
      model: aiResult.model,
      inputTokens: aiResult.inputTokens,
      outputTokens: aiResult.outputTokens,
      durationMs,
      success: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[IA Assessment] Assessment failed:", msg);

    await updateRun(runId, {
      status: "FAILED",
      errorMessage: msg,
      durationMs: Date.now() - start,
    });

    await logAIUsage({
      orgId,
      feature: AI_FEATURES.IA_ASSESSMENT,
      provider: "unknown",
      model: "unknown",
      inputTokens: 0,
      outputTokens: 0,
      durationMs: Date.now() - start,
      success: false,
      errorMessage: msg,
    });
  }
}
