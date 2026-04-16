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
  type CopilotPromptAssessment,
} from "@shared/schema";
import {
  COPILOT_QUALITY_TIERS,
  COPILOT_RISK_LEVELS,
} from "@shared/schema";
import { trackJobRun, DuplicateJobError } from "./job-tracking";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Re-exported for backwards compatibility with routes that import this type. */
export type CopilotPromptAssessmentRow = CopilotPromptAssessment;

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
  interactionType?: string;
  requestId?: string | null;
  sessionId?: string | null;
}

// ---------------------------------------------------------------------------
// DB helpers — now delegated to storage layer
// ---------------------------------------------------------------------------

export async function getAssessmentById(id: string): Promise<CopilotPromptAssessmentRow | null> {
  return (await storage.getCopilotPromptAssessment(id)) ?? null;
}

export async function getLatestAssessmentForTenant(
  tenantConnectionId: string,
): Promise<CopilotPromptAssessmentRow | null> {
  return (await storage.getLatestCopilotPromptAssessment(tenantConnectionId)) ?? null;
}

export async function listAssessmentsForOrg(
  organizationId: string,
  tenantConnectionId?: string,
  limit = 20,
  offset = 0,
): Promise<{ rows: CopilotPromptAssessmentRow[]; total: number }> {
  return storage.listCopilotPromptAssessmentsForOrg(organizationId, { tenantConnectionId, limit, offset });
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
  return storage.listCopilotPromptAssessmentsByTenant(tenantConnectionId, { limit, offset });
}

async function createAssessment(
  organizationId: string,
  tenantConnectionId: string,
  triggeredBy: string | null,
): Promise<string> {
  const row = await storage.createCopilotPromptAssessment({
    organizationId,
    tenantConnectionId,
    status: 'RUNNING',
    triggeredBy,
    startedAt: new Date(),
  });
  return row.id;
}

async function failAssessment(id: string, message: string): Promise<void> {
  await storage.updateCopilotPromptAssessment(id, {
    status: 'FAILED',
    error: message,
    completedAt: new Date(),
  });
}

// ---------------------------------------------------------------------------
// Interaction loading
// ---------------------------------------------------------------------------

async function loadInteractions(tenantConnectionId: string): Promise<InteractionRow[]> {
  const rows = await storage.loadCopilotInteractionsForAnalysis(tenantConnectionId);
  return rows
    .filter(r => r.interactionType === "userPrompt" && r.promptText)
    .map(r => ({
      id: r.id,
      userId: r.userId,
      userPrincipalName: r.userPrincipalName,
      userDisplayName: r.userDisplayName ?? null,
      userDepartment: r.userDepartment ?? null,
      appClass: r.appClass ?? "Unknown",
      promptText: r.promptText!,
      interactionAt: r.interactionAt,
      flags: (r.flags as CopilotPromptFlag[]) ?? [],
      qualityTier: r.qualityTier ?? null,
      qualityScore: r.qualityScore ?? null,
      riskLevel: r.riskLevel ?? null,
      analyzedAt: r.analyzedAt ?? null,
      interactionType: r.interactionType,
      requestId: r.requestId,
      sessionId: r.sessionId,
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

  for (const row of unanalyzed) {
    const result = analyzePrompt(row.promptText);
    await storage.updateCopilotInteractionAnalysis(row.id, {
      qualityScore: result.qualityScore,
      qualityTier: result.qualityTier,
      riskLevel: result.riskLevel,
      flags: result.flags,
      recommendation: result.recommendation,
    });
    // Mutate in-place for aggregation
    row.qualityScore = result.qualityScore;
    row.qualityTier = result.qualityTier;
    row.riskLevel = result.riskLevel;
    row.flags = result.flags;
    row.analyzedAt = new Date();
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
  await storage.failStaleCopilotAssessments(tenantConnectionId);

  const runningId = await storage.findRunningCopilotAssessment(tenantConnectionId);
  if (runningId) {
    return runningId;
  }

  const assessmentId = await createAssessment(organizationId, tenantConnectionId, triggeredBy);

  // BL-039: dual-write to scheduled_job_runs via trackJobRun. The legacy
  // copilot_prompt_assessments row continues to be the public handle (its id
  // is what callers poll); the trackJobRun jobId is correlated via targetId.
  setImmediate(() => {
    void trackJobRun(
      {
        jobType: "copilotAssessment",
        organizationId,
        tenantConnectionId,
        triggeredBy: "manual",
        triggeredByUserId: triggeredBy,
        targetId: assessmentId,
        targetName: `Copilot prompt assessment (${assessmentId.slice(0, 8)})`,
      },
      async (signal) => {
        // 1. Load all interactions for the tenant
        const rawInteractions = await loadInteractions(tenantConnectionId);

        if (rawInteractions.length === 0) {
          await storage.updateCopilotPromptAssessment(assessmentId, {
            status: 'COMPLETED',
            interactionCount: 0,
            userCount: 0,
            completedAt: new Date(),
          });
          return { interactionCount: 0, userCount: 0 };
        }

        if (signal.aborted) throw new Error("Cancelled by operator");

        // 2. Batch-analyze unanalyzed interactions
        const interactions = await analyzeAndPersistInteractions(tenantConnectionId, rawInteractions);

        if (signal.aborted) throw new Error("Cancelled by operator");

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
          const aiResult = await completeForFeature("copilot_prompt_intelligence", messages, 2000);
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

        await storage.updateCopilotPromptAssessment(assessmentId, {
          status: 'COMPLETED',
          interactionCount: interactions.length,
          userCount: userIds.size,
          dateRangeStart,
          dateRangeEnd,
          orgSummary: orgSummary as CopilotOrgSummary,
          departmentBreakdown: departmentBreakdown as CopilotDepartmentBreakdown[],
          userBreakdown: userBreakdown as CopilotUserBreakdown[],
          executiveSummary,
          recommendations: recommendations as CopilotRecommendation[],
          modelUsed,
          tokensUsed,
          completedAt: new Date(),
        });

        console.log(
          `[CopilotPromptAssessment] ${assessmentId} COMPLETED ` +
          `interactions=${interactions.length} users=${userIds.size}`,
        );

        return { interactionCount: interactions.length, userCount: userIds.size };
      },
    ).catch(async (err: unknown) => {
      if (err instanceof DuplicateJobError) {
        await failAssessment(
          assessmentId,
          "A Copilot prompt assessment is already running for this tenant",
        );
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[CopilotPromptAssessment] ${assessmentId} FAILED:`, err);
      await failAssessment(assessmentId, message);
    });
  });

  return assessmentId;
}
