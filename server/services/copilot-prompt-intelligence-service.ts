/**
 * Copilot Prompt Intelligence Assessment Service (BL-038)
 *
 * Orchestrates the analysis and aggregation pipeline for Copilot Prompt
 * Intelligence assessments:
 *
 *   1. Batch-analyze all unanalyzed interactions for a tenant (deterministic)
 *   2. Aggregate org/department/user metrics
 *   3. Generate an AI-powered executive summary + recommendations
 *   4. Persist the completed assessment to copilot_prompt_assessments
 *
 * The assessment runs asynchronously (triggered by API, caller gets an ID to
 * poll). It is idempotent when the same tenant connection ID is used — only
 * one assessment can be in RUNNING state at a time.
 */

import { pool } from "../db";
import { storage } from "../storage";
import { analyzePrompt } from "./copilot-prompt-analyzer";
import { completeForFeature } from "./ai-provider";
import type { AIMessage } from "./ai-provider";
import type {
  CopilotQualityTier,
  CopilotRiskLevel,
  CopilotFlagCategory,
  CopilotOrgSummary,
  CopilotDepartmentBreakdown,
  CopilotUserBreakdown,
  CopilotRecommendation,
  CopilotPromptFlag,
  CopilotAssessmentStatus,
} from "@shared/schema";
import {
  COPILOT_QUALITY_TIERS,
  COPILOT_RISK_LEVELS,
} from "@shared/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CopilotPromptAssessmentRow {
  id: string;
  organizationId: string;
  tenantConnectionId: string;
  status: CopilotAssessmentStatus;
  triggeredBy: string | null;
  interactionCount: number | null;
  userCount: number | null;
  dateRangeStart: Date | null;
  dateRangeEnd: Date | null;
  orgSummary: CopilotOrgSummary | null;
  departmentBreakdown: CopilotDepartmentBreakdown[] | null;
  userBreakdown: CopilotUserBreakdown[] | null;
  executiveSummary: string | null;
  recommendations: CopilotRecommendation[] | null;
  modelUsed: string | null;
  tokensUsed: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
  error: string | null;
  createdAt: Date;
}

interface InteractionRow {
  id: string;
  userId: string;
  userPrincipalName: string;
  userDisplayName: string | null;
  userDepartment: string | null;
  appClass: string;
  promptText: string;
  interactionAt: Date;
  flags: CopilotPromptFlag[];
  qualityTier: string | null;
  qualityScore: number | null;
  riskLevel: string | null;
  analyzedAt: Date | null;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

function rowToAssessment(row: Record<string, unknown>): CopilotPromptAssessmentRow {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    tenantConnectionId: row.tenant_connection_id as string,
    status: row.status as CopilotAssessmentStatus,
    triggeredBy: (row.triggered_by as string | null) ?? null,
    interactionCount: (row.interaction_count as number | null) ?? null,
    userCount: (row.user_count as number | null) ?? null,
    dateRangeStart: row.date_range_start ? new Date(row.date_range_start as string) : null,
    dateRangeEnd: row.date_range_end ? new Date(row.date_range_end as string) : null,
    orgSummary: (row.org_summary as CopilotOrgSummary | null) ?? null,
    departmentBreakdown: (row.department_breakdown as CopilotDepartmentBreakdown[] | null) ?? null,
    userBreakdown: (row.user_breakdown as CopilotUserBreakdown[] | null) ?? null,
    executiveSummary: (row.executive_summary as string | null) ?? null,
    recommendations: (row.recommendations as CopilotRecommendation[] | null) ?? null,
    modelUsed: (row.model_used as string | null) ?? null,
    tokensUsed: (row.tokens_used as number | null) ?? null,
    startedAt: row.started_at ? new Date(row.started_at as string) : null,
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
    error: (row.error as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
  };
}

export async function getAssessmentById(id: string): Promise<CopilotPromptAssessmentRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM copilot_prompt_assessments WHERE id = $1`,
    [id],
  );
  if (rows.length === 0) return null;
  return rowToAssessment(rows[0] as Record<string, unknown>);
}

export async function getLatestAssessmentForTenant(
  tenantConnectionId: string,
): Promise<CopilotPromptAssessmentRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM copilot_prompt_assessments
     WHERE tenant_connection_id = $1 AND status = 'COMPLETED'
     ORDER BY created_at DESC LIMIT 1`,
    [tenantConnectionId],
  );
  if (rows.length === 0) return null;
  return rowToAssessment(rows[0] as Record<string, unknown>);
}

export async function listAssessmentsForOrg(
  organizationId: string,
  tenantConnectionId?: string,
  limit = 20,
  offset = 0,
): Promise<{ rows: CopilotPromptAssessmentRow[]; total: number }> {
  const conditions = tenantConnectionId
    ? `WHERE organization_id = $1 AND tenant_connection_id = $2`
    : `WHERE organization_id = $1`;
  const params: unknown[] = tenantConnectionId
    ? [organizationId, tenantConnectionId, limit, offset]
    : [organizationId, limit, offset];
  const limitIdx = tenantConnectionId ? 3 : 2;
  const offsetIdx = tenantConnectionId ? 4 : 3;

  const countParams: unknown[] = tenantConnectionId
    ? [organizationId, tenantConnectionId]
    : [organizationId];

  const [countRes, dataRes] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM copilot_prompt_assessments ${conditions}`,
      countParams,
    ),
    pool.query(
      `SELECT * FROM copilot_prompt_assessments ${conditions}
       ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    ),
  ]);

  return {
    rows: (dataRes.rows as Record<string, unknown>[]).map(rowToAssessment),
    total: parseInt(countRes.rows[0].total, 10) || 0,
  };
}

/**
 * List assessments scoped to a single tenant connection (no org filter).
 * Used by platform owners who may not have an active organization context.
 */
export async function listAssessmentsByTenant(
  tenantConnectionId: string,
  limit = 20,
  offset = 0,
): Promise<{ rows: CopilotPromptAssessmentRow[]; total: number }> {
  const [countRes, dataRes] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM copilot_prompt_assessments WHERE tenant_connection_id = $1`,
      [tenantConnectionId],
    ),
    pool.query(
      `SELECT * FROM copilot_prompt_assessments WHERE tenant_connection_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [tenantConnectionId, limit, offset],
    ),
  ]);

  return {
    rows: (dataRes.rows as Record<string, unknown>[]).map(rowToAssessment),
    total: parseInt(countRes.rows[0].total, 10) || 0,
  };
}

async function createAssessment(
  organizationId: string,
  tenantConnectionId: string,
  triggeredBy: string | null,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO copilot_prompt_assessments
       (organization_id, tenant_connection_id, status, triggered_by, started_at)
     VALUES ($1, $2, 'RUNNING', $3, now())
     RETURNING id`,
    [organizationId, tenantConnectionId, triggeredBy],
  );
  return rows[0].id;
}

async function failAssessment(id: string, message: string): Promise<void> {
  await pool.query(
    `UPDATE copilot_prompt_assessments
     SET status = 'FAILED', error = $2, completed_at = now()
     WHERE id = $1`,
    [id, message],
  );
}

// ---------------------------------------------------------------------------
// Interaction loading
// ---------------------------------------------------------------------------

async function loadInteractions(tenantConnectionId: string): Promise<InteractionRow[]> {
  const { rows } = await pool.query(
    `SELECT id, user_id, user_principal_name, user_display_name, user_department,
            app_class, prompt_text, interaction_at, flags, quality_tier,
            quality_score, risk_level, analyzed_at
     FROM copilot_interactions
     WHERE tenant_connection_id = $1
     ORDER BY interaction_at DESC`,
    [tenantConnectionId],
  );
  return (rows as Record<string, unknown>[]).map(r => ({
    id: r.id as string,
    userId: r.user_id as string,
    userPrincipalName: r.user_principal_name as string,
    userDisplayName: (r.user_display_name as string | null) ?? null,
    userDepartment: (r.user_department as string | null) ?? null,
    appClass: r.app_class as string,
    promptText: r.prompt_text as string,
    interactionAt: new Date(r.interaction_at as string),
    flags: (r.flags as CopilotPromptFlag[]) ?? [],
    qualityTier: (r.quality_tier as string | null) ?? null,
    qualityScore: (r.quality_score as number | null) ?? null,
    riskLevel: (r.risk_level as string | null) ?? null,
    analyzedAt: r.analyzed_at ? new Date(r.analyzed_at as string) : null,
  }));
}

// ---------------------------------------------------------------------------
// Batch analysis
// ---------------------------------------------------------------------------

async function analyzeAndPersistInteractions(
  tenantConnectionId: string,
  interactions: InteractionRow[],
): Promise<InteractionRow[]> {
  const unanalyzed = interactions.filter(i => !i.analyzedAt);
  if (unanalyzed.length === 0) return interactions;

  const client = await pool.connect();
  try {
    for (const row of unanalyzed) {
      const result = analyzePrompt(row.promptText);
      await client.query(
        `UPDATE copilot_interactions
         SET quality_score = $2, quality_tier = $3, risk_level = $4,
             flags = $5::jsonb, recommendation = $6, analyzed_at = now()
         WHERE id = $1`,
        [
          row.id,
          result.qualityScore,
          result.qualityTier,
          result.riskLevel,
          JSON.stringify(result.flags),
          result.recommendation,
        ],
      );
      // Mutate in-place for aggregation
      row.qualityScore = result.qualityScore;
      row.qualityTier = result.qualityTier;
      row.riskLevel = result.riskLevel;
      row.flags = result.flags;
      row.analyzedAt = new Date();
    }
  } finally {
    client.release();
  }

  return interactions;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function emptyQualityDist(): Record<CopilotQualityTier, number> {
  return Object.fromEntries(COPILOT_QUALITY_TIERS.map(t => [t, 0])) as Record<CopilotQualityTier, number>;
}

function emptyRiskDist(): Record<CopilotRiskLevel, number> {
  return Object.fromEntries(COPILOT_RISK_LEVELS.map(r => [r, 0])) as Record<CopilotRiskLevel, number>;
}

function buildOrgSummary(
  interactions: InteractionRow[],
): CopilotOrgSummary {
  const qualityDist = emptyQualityDist();
  const riskDist = emptyRiskDist();
  const appClasses: Record<string, number> = {};
  const flagCounts: Record<string, { category: CopilotFlagCategory; signal: string; count: number }> = {};
  const userIds = new Set<string>();
  let scoreSum = 0;
  let scoredCount = 0;

  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const row of interactions) {
    userIds.add(row.userId);
    if (minDate === null || row.interactionAt < minDate) minDate = row.interactionAt;
    if (maxDate === null || row.interactionAt > maxDate) maxDate = row.interactionAt;

    const tier = (row.qualityTier ?? "WEAK") as CopilotQualityTier;
    qualityDist[tier] = (qualityDist[tier] ?? 0) + 1;

    const risk = (row.riskLevel ?? "NONE") as CopilotRiskLevel;
    riskDist[risk] = (riskDist[risk] ?? 0) + 1;

    appClasses[row.appClass] = (appClasses[row.appClass] ?? 0) + 1;

    if (row.qualityScore != null) {
      scoreSum += row.qualityScore;
      scoredCount++;
    }

    for (const flag of row.flags ?? []) {
      const key = `${flag.category}:${flag.signal}`;
      if (!flagCounts[key]) {
        flagCounts[key] = { category: flag.category as CopilotFlagCategory, signal: flag.signal, count: 0 };
      }
      flagCounts[key].count++;
    }
  }

  const topFlags = Object.values(flagCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalInteractions: interactions.length,
    uniqueUsers: userIds.size,
    dateRange: {
      start: (minDate ?? new Date()).toISOString(),
      end: (maxDate ?? new Date()).toISOString(),
    },
    qualityDistribution: qualityDist,
    averageQualityScore: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0,
    riskDistribution: riskDist,
    appClassBreakdown: appClasses,
    topFlags,
  };
}

function buildDepartmentBreakdown(
  interactions: InteractionRow[],
): CopilotDepartmentBreakdown[] {
  const deptMap = new Map<string, {
    users: Set<string>;
    interactions: InteractionRow[];
  }>();

  for (const row of interactions) {
    const dept = row.userDepartment ?? "(No Department)";
    if (!deptMap.has(dept)) deptMap.set(dept, { users: new Set(), interactions: [] });
    const entry = deptMap.get(dept)!;
    entry.users.add(row.userId);
    entry.interactions.push(row);
  }

  return Array.from(deptMap.entries())
    .map(([department, { users, interactions: deptInteractions }]) => {
      const qualityDist = emptyQualityDist();
      const riskDist = emptyRiskDist();
      const flagCounts: Record<string, { category: CopilotFlagCategory; signal: string; count: number }> = {};
      let scoreSum = 0;
      let scoredCount = 0;

      for (const row of deptInteractions) {
        const tier = (row.qualityTier ?? "WEAK") as CopilotQualityTier;
        qualityDist[tier] = (qualityDist[tier] ?? 0) + 1;
        const risk = (row.riskLevel ?? "NONE") as CopilotRiskLevel;
        riskDist[risk] = (riskDist[risk] ?? 0) + 1;
        if (row.qualityScore != null) {
          scoreSum += row.qualityScore;
          scoredCount++;
        }
        for (const flag of row.flags ?? []) {
          const key = `${flag.category}:${flag.signal}`;
          if (!flagCounts[key]) {
            flagCounts[key] = { category: flag.category as CopilotFlagCategory, signal: flag.signal, count: 0 };
          }
          flagCounts[key].count++;
        }
      }

      return {
        department,
        userCount: users.size,
        interactionCount: deptInteractions.length,
        averageQualityScore: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0,
        qualityDistribution: qualityDist,
        riskDistribution: riskDist,
        topFlags: Object.values(flagCounts).sort((a, b) => b.count - a.count).slice(0, 5),
      };
    })
    .sort((a, b) => b.interactionCount - a.interactionCount);
}

function buildUserBreakdown(
  interactions: InteractionRow[],
): CopilotUserBreakdown[] {
  const userMap = new Map<string, {
    userPrincipalName: string;
    displayName: string | null;
    department: string | null;
    interactions: InteractionRow[];
  }>();

  for (const row of interactions) {
    if (!userMap.has(row.userId)) {
      userMap.set(row.userId, {
        userPrincipalName: row.userPrincipalName,
        displayName: row.userDisplayName,
        department: row.userDepartment,
        interactions: [],
      });
    }
    userMap.get(row.userId)!.interactions.push(row);
  }

  return Array.from(userMap.entries())
    .map(([userId, { userPrincipalName, displayName, department, interactions: userInteractions }]) => {
      const qualityDist = emptyQualityDist();
      let scoreSum = 0;
      let scoredCount = 0;
      let criticalFlags = 0;
      let topRecommendation: string | null = null;

      for (const row of userInteractions) {
        const tier = (row.qualityTier ?? "WEAK") as CopilotQualityTier;
        qualityDist[tier] = (qualityDist[tier] ?? 0) + 1;
        if (row.qualityScore != null) { scoreSum += row.qualityScore; scoredCount++; }
        for (const flag of row.flags ?? []) {
          if (flag.severity === "CRITICAL" || flag.severity === "HIGH") criticalFlags++;
        }
      }

      // Grab recommendation from the most recent high-risk interaction
      const highRisk = userInteractions.find(r =>
        r.riskLevel === "CRITICAL" || r.riskLevel === "HIGH"
      );
      if (highRisk) {
        topRecommendation = highRisk.recommendation ?? null;
      }

      return {
        userId,
        userPrincipalName,
        displayName,
        department,
        interactionCount: userInteractions.length,
        averageQualityScore: scoredCount > 0 ? Math.round(scoreSum / scoredCount) : 0,
        qualityDistribution: qualityDist,
        criticalFlags,
        topRecommendation,
      };
    })
    .sort((a, b) => b.criticalFlags - a.criticalFlags || b.interactionCount - a.interactionCount)
    .slice(0, 100); // top 100 users
}

// ---------------------------------------------------------------------------
// AI narrative
// ---------------------------------------------------------------------------

function buildAIPrompt(
  orgSummary: CopilotOrgSummary,
  deptBreakdown: CopilotDepartmentBreakdown[],
): AIMessage[] {
  const riskLines = Object.entries(orgSummary.riskDistribution)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");

  const topFlagLines = orgSummary.topFlags
    .slice(0, 8)
    .map(f => `  - ${f.category}/${f.signal}: ${f.count} occurrence(s)`)
    .join("\n");

  const deptLines = deptBreakdown
    .slice(0, 10)
    .map(d => {
      const riskCount = (d.riskDistribution.HIGH ?? 0) + (d.riskDistribution.CRITICAL ?? 0);
      return `  - ${d.department}: ${d.interactionCount} interactions, avg quality ${d.averageQualityScore}/100, ${riskCount} high/critical-risk interactions`;
    })
    .join("\n");

  const system = `You are an enterprise AI governance expert specializing in Microsoft 365 Copilot. 
Your role is to analyze Copilot usage quality and risk patterns and provide actionable governance guidance.
Write for a Chief Information Security Officer or Chief Compliance Officer audience.
Output structured Markdown only.`;

  const user = `## Copilot Prompt Intelligence Report

Assessment date: ${new Date().toISOString().slice(0, 10)}

### Usage Summary
- Total interactions analyzed: ${orgSummary.totalInteractions}
- Unique users: ${orgSummary.uniqueUsers}
- Average quality score: ${orgSummary.averageQualityScore}/100
- Date range: ${orgSummary.dateRange.start.slice(0, 10)} – ${orgSummary.dateRange.end.slice(0, 10)}

### Quality Distribution
- GREAT: ${orgSummary.qualityDistribution.GREAT}
- GOOD: ${orgSummary.qualityDistribution.GOOD}
- WEAK: ${orgSummary.qualityDistribution.WEAK}
- PROBLEMATIC: ${orgSummary.qualityDistribution.PROBLEMATIC}

### Risk Distribution
${riskLines || "  (no risk signals detected)"}

### Top Signal Flags
${topFlagLines || "  (no flags detected)"}

### Top Department Breakdown
${deptLines || "  (no department data)"}

---
Please produce a Markdown report with these sections:

### Executive Summary
2–3 paragraphs summarizing the organization's Copilot prompt quality posture, key risk drivers, and overall outlook. Written for a CISO/CCO audience.

### Key Risk Findings
Bullet list of the 3–5 most important risk or quality findings, with specific signal names where relevant.

### Recommendations
Provide exactly 5 prioritized recommendations in JSON format at the end, after the markdown sections. Format each as:
{"rank":1,"title":"...","rationale":"...","impact":"HIGH|MEDIUM|LOW","targetScope":"ORGANIZATION|DEPARTMENT|USER","targetName":"name or null"}

List them as a JSON array under a \`\`\`json block labeled RECOMMENDATIONS.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function parseRecommendations(aiContent: string): CopilotRecommendation[] {
  try {
    const match = aiContent.match(/```json\s*RECOMMENDATIONS\s*([\s\S]*?)```/i) ||
                  aiContent.match(/```json\s*(\[[\s\S]*?\])\s*```/);
    if (!match) return [];
    const raw = JSON.parse(match[1].trim());
    if (!Array.isArray(raw)) return [];
    return (raw as CopilotRecommendation[]).slice(0, 10).map((r, i) => ({
      rank: r.rank ?? i + 1,
      title: String(r.title ?? ""),
      rationale: String(r.rationale ?? ""),
      impact: (["HIGH", "MEDIUM", "LOW"].includes(r.impact) ? r.impact : "MEDIUM") as "HIGH" | "MEDIUM" | "LOW",
      targetScope: r.targetScope ?? "ORGANIZATION",
      targetName: r.targetName ?? undefined,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Trigger an assessment for a tenant connection. Returns the assessment ID
 * immediately; the caller polls GET .../assessments/:id for status.
 *
 * Only one RUNNING assessment is allowed per tenant at a time.
 */
export async function runCopilotPromptAssessment(
  tenantConnectionId: string,
  organizationId: string,
  triggeredBy: string | null,
): Promise<string> {
  // Enforce single concurrency. Any RUNNING assessment that is older than
  // 2 hours is considered stale (process likely crashed) and is marked FAILED
  // so a fresh run can proceed.
  await pool.query(
    `UPDATE copilot_prompt_assessments
     SET status = 'FAILED', error = 'Assessment timed out (stale RUNNING state)',
         completed_at = now()
     WHERE tenant_connection_id = $1
       AND status = 'RUNNING'
       AND started_at < now() - interval '2 hours'`,
    [tenantConnectionId],
  );

  const { rows: running } = await pool.query(
    `SELECT id FROM copilot_prompt_assessments
     WHERE tenant_connection_id = $1 AND status = 'RUNNING'
     LIMIT 1`,
    [tenantConnectionId],
  );
  if (running.length > 0) {
    return (running[0] as { id: string }).id;
  }

  const assessmentId = await createAssessment(organizationId, tenantConnectionId, triggeredBy);

  setImmediate(async () => {
    try {
      // 1. Load all interactions for the tenant
      const rawInteractions = await loadInteractions(tenantConnectionId);

      if (rawInteractions.length === 0) {
        await pool.query(
          `UPDATE copilot_prompt_assessments
           SET status = 'COMPLETED', interaction_count = 0, user_count = 0,
               completed_at = now()
           WHERE id = $1`,
          [assessmentId],
        );
        return;
      }

      // 2. Batch-analyze unanalyzed interactions
      const interactions = await analyzeAndPersistInteractions(tenantConnectionId, rawInteractions);

      // 3. Aggregate metrics
      const orgSummary = buildOrgSummary(interactions);
      const departmentBreakdown = buildDepartmentBreakdown(interactions);
      const userBreakdown = buildUserBreakdown(interactions);

      // 4. AI narrative
      let executiveSummary: string | null = null;
      let recommendations: CopilotRecommendation[] = [];
      let modelUsed: string | null = null;
      let tokensUsed: number | null = null;

      try {
        const messages = buildAIPrompt(orgSummary, departmentBreakdown);
        const aiResult = await completeForFeature("copilot_assessment", messages, 2000);
        executiveSummary = aiResult.content;
        recommendations = parseRecommendations(aiResult.content);
        modelUsed = aiResult.model;
        tokensUsed = aiResult.inputTokens + aiResult.outputTokens;
      } catch (aiErr) {
        console.warn("[CopilotPromptAssessment] AI narrative failed (non-fatal):", aiErr);
        executiveSummary = null;
      }

      // 5. Persist completed assessment
      const dates = interactions.map(i => i.interactionAt.getTime());
      const dateRangeStart = new Date(Math.min(...dates));
      const dateRangeEnd = new Date(Math.max(...dates));
      const userIds = new Set(interactions.map(i => i.userId));

      await pool.query(
        `UPDATE copilot_prompt_assessments
         SET status = 'COMPLETED',
             interaction_count = $2,
             user_count = $3,
             date_range_start = $4,
             date_range_end = $5,
             org_summary = $6::jsonb,
             department_breakdown = $7::jsonb,
             user_breakdown = $8::jsonb,
             executive_summary = $9,
             recommendations = $10::jsonb,
             model_used = $11,
             tokens_used = $12,
             completed_at = now()
         WHERE id = $1`,
        [
          assessmentId,
          interactions.length,
          userIds.size,
          dateRangeStart,
          dateRangeEnd,
          JSON.stringify(orgSummary),
          JSON.stringify(departmentBreakdown),
          JSON.stringify(userBreakdown),
          executiveSummary,
          JSON.stringify(recommendations),
          modelUsed,
          tokensUsed,
        ],
      );

      console.log(
        `[CopilotPromptAssessment] ${assessmentId} COMPLETED ` +
        `interactions=${interactions.length} users=${userIds.size}`,
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[CopilotPromptAssessment] ${assessmentId} FAILED:`, err);
      await failAssessment(assessmentId, message);
    }
  });

  return assessmentId;
}
