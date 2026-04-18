/**
 * Copilot Readiness AI Assessment Service (Task #52)
 *
 * Wraps the deterministic scoring engine with GPT-4o narrative analysis:
 *   - Org-wide executive summary
 *   - Per-workspace remediation narratives (on demand, cached 1 hour)
 *   - Prioritized 30/60/90-day remediation roadmap
 *
 * All AI calls use the `copilot_assessment` feature assignment.
 */

import { pool } from '../db';
import { storage } from '../storage';
import { scoreWorkspaces, scoreWorkspace, type CopilotReadinessResult, type WorkspaceReadiness } from './copilot-scoring';
import { buildRequiredFieldsByTenantId, getRequiredFieldsForWorkspace } from './metadata-completeness';
import { completeForFeature, type AIMessage } from './ai-provider';

export type AssessmentStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type AssessmentFeature = 'copilot_readiness' | 'information_architecture';

export interface AiAssessmentRun {
  id: string;
  orgId: string;
  feature: AssessmentFeature;
  status: AssessmentStatus;
  resultMarkdown: string | null;
  resultStructured: Record<string, unknown> | null;
  modelUsed: string | null;
  providerUsed: string | null;
  tokensUsed: number | null;
  triggeredBy: string | null;
  tenantConnectionId: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

function rowToRun(row: Record<string, unknown>): AiAssessmentRun {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    feature: row.feature as AssessmentFeature,
    status: row.status as AssessmentStatus,
    resultMarkdown: (row.result_markdown as string | null) ?? null,
    resultStructured: (row.result_structured as Record<string, unknown> | null) ?? null,
    modelUsed: (row.model_used as string | null) ?? null,
    providerUsed: (row.provider_used as string | null) ?? null,
    tokensUsed: (row.tokens_used as number | null) ?? null,
    triggeredBy: (row.triggered_by as string | null) ?? null,
    tenantConnectionId: (row.tenant_connection_id as string | null) ?? null,
    createdAt: new Date(row.created_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : null,
  };
}

export async function createAssessmentRun(
  orgId: string,
  feature: AssessmentFeature,
  triggeredBy: string | null,
  tenantConnectionId: string | null = null,
): Promise<AiAssessmentRun> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `INSERT INTO ai_assessment_runs (org_id, feature, status, triggered_by, tenant_connection_id)
       VALUES ($1, $2, 'PENDING', $3, $4)
       RETURNING *`,
      [orgId, feature, triggeredBy, tenantConnectionId],
    );
    return rowToRun(rows[0] as Record<string, unknown>);
  } finally {
    client.release();
  }
}

export async function getAssessmentRun(runId: string): Promise<AiAssessmentRun | null> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT * FROM ai_assessment_runs WHERE id = $1`,
      [runId],
    );
    if (rows.length === 0) return null;
    return rowToRun(rows[0] as Record<string, unknown>);
  } finally {
    client.release();
  }
}

export async function getLatestAssessmentRun(
  orgId: string,
  feature: AssessmentFeature = 'copilot_readiness',
  tenantConnectionId: string | null = null,
): Promise<AiAssessmentRun | null> {
  const client = await pool.connect();
  try {
    const params: unknown[] = [orgId, feature];
    let tenantClause = '';
    if (tenantConnectionId) {
      params.push(tenantConnectionId);
      tenantClause = ` AND tenant_connection_id = $${params.length}`;
    } else {
      tenantClause = ' AND tenant_connection_id IS NULL';
    }
    const { rows } = await client.query(
      `SELECT * FROM ai_assessment_runs
       WHERE org_id = $1 AND feature = $2 AND status = 'COMPLETED'${tenantClause}
       ORDER BY created_at DESC
       LIMIT 1`,
      params,
    );
    if (rows.length === 0) return null;
    return rowToRun(rows[0] as Record<string, unknown>);
  } finally {
    client.release();
  }
}

export async function getAssessmentRunHistory(
  orgId: string,
  feature: AssessmentFeature = 'copilot_readiness',
  tenantConnectionId: string | null = null,
  limit = 20,
  offset = 0,
): Promise<{ runs: AiAssessmentRun[]; total: number }> {
  const client = await pool.connect();
  try {
    const params: unknown[] = [orgId, feature];
    let tenantClause = '';
    if (tenantConnectionId) {
      params.push(tenantConnectionId);
      tenantClause = ` AND tenant_connection_id = $${params.length}`;
    } else {
      tenantClause = ' AND tenant_connection_id IS NULL';
    }

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*) AS total FROM ai_assessment_runs
       WHERE org_id = $1 AND feature = $2${tenantClause}`,
      params,
    );
    const total = parseInt(countRows[0].total as string, 10) || 0;

    const limitParamIdx = params.length + 1;
    const offsetParamIdx = params.length + 2;
    const { rows } = await client.query(
      `SELECT * FROM ai_assessment_runs
       WHERE org_id = $1 AND feature = $2${tenantClause}
       ORDER BY created_at DESC
       LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      [...params, limit, offset],
    );

    return {
      runs: rows.map(r => rowToRun(r as Record<string, unknown>)),
      total,
    };
  } finally {
    client.release();
  }
}

async function updateAssessmentRun(
  runId: string,
  updates: {
    status: AssessmentStatus;
    resultMarkdown?: string | null;
    resultStructured?: Record<string, unknown> | null;
    modelUsed?: string | null;
    providerUsed?: string | null;
    tokensUsed?: number | null;
    completedAt?: Date | null;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `UPDATE ai_assessment_runs
       SET status = $2,
           result_markdown = COALESCE($3, result_markdown),
           result_structured = COALESCE($4, result_structured),
           model_used = COALESCE($5, model_used),
           provider_used = COALESCE($6, provider_used),
           tokens_used = COALESCE($7, tokens_used),
           completed_at = COALESCE($8, completed_at)
       WHERE id = $1`,
      [
        runId,
        updates.status,
        updates.resultMarkdown ?? null,
        updates.resultStructured ? JSON.stringify(updates.resultStructured) : null,
        updates.modelUsed ?? null,
        updates.providerUsed ?? null,
        updates.tokensUsed ?? null,
        updates.completedAt ?? null,
      ],
    );
  } finally {
    client.release();
  }
}

function buildOrgAssessmentPrompt(
  orgId: string,
  result: CopilotReadinessResult,
): AIMessage[] {
  const { summary, remediationQueue } = result;

  const blockerLines = summary.blockerBreakdown
    .slice(0, 10)
    .map(b => `  - ${b.label}: ${b.count} workspace(s) affected`)
    .join('\n');

  const queueLines = remediationQueue
    .slice(0, 20)
    .map((ws, i) => {
      const blockerNames = ws.blockers.map(b => b.label).join(', ');
      return `  ${i + 1}. **${ws.displayName}** (score ${ws.score}/100, tier ${ws.tier})\n     Blockers: ${blockerNames || 'none'}`;
    })
    .join('\n');

  const systemPrompt = `You are an expert Microsoft 365 governance consultant specializing in Copilot readiness and SharePoint governance.
Your output must be structured Markdown that an executive can read and a governance team can action.
Grounding standards:
- Microsoft 365 Copilot requires: sensitivity label, dual ownership (≥2 owners), complete governance metadata, external sharing disabled on Highly Confidential sites, no encryption that blocks indexing.
- NEARLY_READY = score ≥ 80, AT_RISK = 50–79, BLOCKED = <50, READY = all criteria pass.
- Focus on actionable, specific remediation over generic advice.`;

  const userPrompt = `Organization ID: ${orgId}
Assessment date: ${new Date().toISOString().slice(0, 10)}

## Org-wide Copilot Readiness Metrics
- Total workspaces: ${summary.totalWorkspaces}
- Evaluated: ${summary.evaluated} (${summary.excluded} excluded)
- Copilot READY: ${summary.ready} (${summary.readinessPercent}%)
- Nearly Ready (≥80): ${summary.nearlyReady}
- At Risk (50–79): ${summary.atRisk}
- Blocked (<50): ${summary.blocked}
- Average readiness score: ${summary.averageScore}/100

## Top Blockers Across All Workspaces
${blockerLines || '  (no blockers found)'}

## Top Remediation Queue (highest priority first)
${queueLines || '  (all workspaces are Copilot Ready)'}

---
Please produce a Markdown report with these exact sections:

### Executive Summary
2–3 paragraphs summarising the org's Copilot readiness posture, the primary risk drivers, and the overall outlook. Written for a C-suite audience.

### Key Findings
Bullet list of the 3–5 most impactful findings drawn from the metrics above.

### Remediation Roadmap

#### 30-Day Wave (Quick Wins)
List the specific workspaces and actions that can be resolved within 30 days. Focus on Nearly Ready sites with simple blockers (e.g. missing secondary owner, metadata gap).

#### 60-Day Wave (Governance Uplift)
Actions requiring coordination — sensitivity label programmes, policy changes, owner assignment campaigns.

#### 90-Day Wave (Structural Work)
Longer-horizon work — sharing posture reviews, architectural decisions, Highly Confidential site exemptions.

### Governance Recommendations
3–5 strategic recommendations to improve and maintain readiness over time.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

/**
 * Main entry point — runs the full org-wide AI Copilot Readiness Assessment.
 * Executes asynchronously; the caller gets back a runId immediately via the
 * HTTP route and polls for status.
 */
export async function runCopilotReadinessAssessment(
  orgId: string,
  triggeredBy: string | null,
  tenantConnectionId: string | null = null,
): Promise<string> {
  const run = await createAssessmentRun(orgId, 'copilot_readiness', triggeredBy, tenantConnectionId);
  const runId = run.id;

  setImmediate(async () => {
    try {
      await updateAssessmentRun(runId, { status: 'RUNNING' });

      let allWorkspaces: Awaited<ReturnType<typeof storage.getWorkspaces>> = [];
      if (tenantConnectionId) {
        allWorkspaces = await storage.getWorkspaces(undefined, tenantConnectionId);
      } else {
        const tenants = await storage.getTenantConnections(orgId);
        const tenantIds = tenants.map(t => t.id);
        if (tenantIds.length > 0) {
          const perTenantResults = await Promise.all(
            tenantIds.map(tid => storage.getWorkspaces(undefined, tid)),
          );
          allWorkspaces = perTenantResults.flat();
        }
      }

      const requiredFieldsByTenantId = await buildRequiredFieldsByTenantId(allWorkspaces);
      const scoringResult = scoreWorkspaces(allWorkspaces, requiredFieldsByTenantId);
      const messages = buildOrgAssessmentPrompt(orgId, scoringResult);

      const aiResult = await completeForFeature('copilot_assessment', messages, 3000);

      await updateAssessmentRun(runId, {
        status: 'COMPLETED',
        resultMarkdown: aiResult.content,
        resultStructured: {
          summary: scoringResult.summary,
          remediationQueueCount: scoringResult.remediationQueue.length,
          topBlockers: scoringResult.summary.blockerBreakdown.slice(0, 5),
        },
        modelUsed: aiResult.model,
        providerUsed: aiResult.provider,
        tokensUsed: aiResult.inputTokens + aiResult.outputTokens,
        completedAt: new Date(),
      });

      await logAiUsage(orgId, aiResult.model, aiResult.provider, aiResult.inputTokens, aiResult.outputTokens, aiResult.durationMs, true, null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[CopilotAssessment] Assessment ${runId} failed:`, err);

      const client = await pool.connect();
      try {
        await client.query(
          `UPDATE ai_assessment_runs SET status = 'FAILED', completed_at = now() WHERE id = $1`,
          [runId],
        );
      } finally {
        client.release();
      }
    }
  });

  return runId;
}

async function logAiUsage(
  orgId: string,
  model: string,
  provider: string,
  inputTokens: number,
  outputTokens: number,
  durationMs: number,
  success: boolean,
  errorMessage: string | null,
): Promise<void> {
  try {
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO ai_usage (org_id, feature, provider, model, input_tokens, output_tokens, estimated_cost_usd, duration_ms, success, error_message)
         VALUES ($1, 'copilot_assessment', $2, $3, $4, $5, 0, $6, $7, $8)`,
        [orgId, provider, model, inputTokens, outputTokens, durationMs, success, errorMessage],
      );
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn('[CopilotAssessment] Failed to log AI usage:', err);
  }
}

const narrativeCache = new Map<string, { narrative: string; expiresAt: number }>();
const NARRATIVE_TTL_MS = 60 * 60 * 1000;

/**
 * Per-workspace AI narrative — fetched on demand, cached for 1 hour.
 */
export async function getWorkspaceNarrative(workspaceId: string, orgId: string): Promise<string> {
  const cacheKey = `${orgId}:${workspaceId}`;
  const cached = narrativeCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.narrative;
  }

  const workspace = await storage.getWorkspace(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const requiredFields = await getRequiredFieldsForWorkspace(workspace);
  const ws = scoreWorkspace(workspace, requiredFields);

  const systemPrompt = `You are a Microsoft 365 governance expert. Write a concise, specific remediation narrative for a SharePoint workspace that is not yet Copilot-eligible. Focus on actionable steps, not generic advice. Output plain Markdown (2–4 short paragraphs, no headers).`;

  const blockerList = ws.blockers.map(b => `- **${b.label}** (weight ${b.weight}): ${b.remediation}`).join('\n');

  const userPrompt = `Workspace: **${ws.displayName}**
Readiness score: ${ws.score}/100 (${ws.tier})
Sensitivity: ${ws.sensitivity}
Passing criteria: ${ws.passingCount}/${ws.totalCount}

**Active blockers:**
${blockerList || '(none — workspace is Copilot Ready)'}

Write a remediation narrative explaining why each blocker matters in the context of Microsoft 365 Copilot, the specific steps to resolve it, and the likely business impact once resolved. Be concise and direct.`;

  const messages: AIMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const aiResult = await completeForFeature('copilot_assessment', messages, 800);

  narrativeCache.set(cacheKey, { narrative: aiResult.content, expiresAt: Date.now() + NARRATIVE_TTL_MS });

  await logAiUsage(orgId, aiResult.model, aiResult.provider, aiResult.inputTokens, aiResult.outputTokens, aiResult.durationMs, true, null);

  return aiResult.content;
}
