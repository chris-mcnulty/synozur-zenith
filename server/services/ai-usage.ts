import { pool } from '../db';
import { completeForFeature, getConfiguration, type AIMessage, type AICompletionResult } from './ai-provider';
import { getCached, setCached, hashPrompt } from './ai-cache';
import { estimateCostUsd } from './ai-pricing';
import { type AIFeature, type AIProvider } from '@shared/ai-schema';

export interface AIUsageRecord {
  id: string;
  orgId: string | null;
  feature: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: Date;
}

export interface TrackedCompletionResult extends AICompletionResult {
  usageId: string;
  fromCache: boolean;
}

async function checkAndRecordBudgetAlert(orgId: string | null, totalInputTokens: number, totalOutputTokens: number): Promise<void> {
  try {
    const config = await getConfiguration();
    if (!config.monthlyTokenBudget) return;

    const totalTokens = totalInputTokens + totalOutputTokens;
    const budget = config.monthlyTokenBudget;
    const thresholdTokens = Math.floor((config.alertThresholdPercent / 100) * budget);

    if (totalTokens < thresholdTokens) return;

    const client = await pool.connect();
    try {
      const { rows: existing } = await client.query(
        `SELECT id FROM ai_usage_alerts
         WHERE ($1::text IS NULL OR org_id = $1)
           AND alert_type = 'BUDGET_THRESHOLD'
           AND date_trunc('month', notified_at) = date_trunc('month', now())
           AND acknowledged_at IS NULL
         LIMIT 1`,
        [orgId]
      );

      if (existing.length === 0) {
        await client.query(
          `INSERT INTO ai_usage_alerts (org_id, alert_type, threshold_percent, tokens_at_alert, budget_tokens)
           VALUES ($1, 'BUDGET_THRESHOLD', $2, $3, $4)`,
          [orgId, config.alertThresholdPercent, totalTokens, budget]
        );
        console.warn(`[AI Budget Alert] Token usage (${totalTokens}) reached ${config.alertThresholdPercent}% of monthly budget (${budget}).${config.alertEmail ? ` Alert email: ${config.alertEmail}` : ''}`);
      }
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[AI Usage] Failed to check budget alert:', err);
  }
}

export async function trackedCompleteForFeature(
  feature: AIFeature,
  messages: AIMessage[],
  orgId: string | null,
  maxTokens = 1024,
  useCache = true,
): Promise<TrackedCompletionResult> {
  const promptHash = hashPrompt(JSON.stringify(messages));

  if (useCache && orgId) {
    const cached = getCached(orgId, feature, promptHash);
    if (cached) {
      return {
        content: cached,
        inputTokens: 0,
        outputTokens: 0,
        model: 'cached',
        provider: 'cached' as AIProvider,
        durationMs: 0,
        usageId: '',
        fromCache: true,
      };
    }
  }

  const startMs = Date.now();
  let result: AICompletionResult | null = null;
  let errorMessage: string | null = null;
  let success = false;
  let usageId = '';

  try {
    result = await completeForFeature(feature, messages, maxTokens);
    success = true;

    if (useCache && orgId) {
      setCached(orgId, feature, promptHash, result.content);
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    errorMessage = error.message;
    throw error;
  } finally {
    const durationMs = Date.now() - startMs;
    const inputTokens = result?.inputTokens ?? 0;
    const outputTokens = result?.outputTokens ?? 0;
    const provider = (result?.provider ?? 'unknown') as AIProvider;
    const model = result?.model ?? 'unknown';

    const estimatedCostUsd = estimateCostUsd(provider, model, inputTokens, outputTokens);

    try {
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          `INSERT INTO ai_usage (org_id, feature, provider, model, input_tokens, output_tokens, estimated_cost_usd, duration_ms, success, error_message)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [orgId, feature, provider, model, inputTokens, outputTokens, estimatedCostUsd, durationMs, success, errorMessage]
        );
        usageId = rows[0]?.id ?? '';
      } finally {
        client.release();
      }

      if (success && (inputTokens > 0 || outputTokens > 0)) {
        const monthly = await getMonthlyTokenBurn(orgId);
        await checkAndRecordBudgetAlert(orgId, monthly.totalInputTokens, monthly.totalOutputTokens);
      }
    } catch (dbErr) {
      console.error('[AI Usage] Failed to log usage:', dbErr);
    }

    if (result) {
      return { ...result, usageId, fromCache: false };
    }
  }

  throw new Error('Unreachable');
}

export async function getAIUsageSummary(orgId: string | null, limit = 100): Promise<AIUsageRecord[]> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT id, org_id, feature, provider, model, input_tokens, output_tokens,
              estimated_cost_usd, duration_ms, success, error_message, created_at
       FROM ai_usage
       WHERE ($1::text IS NULL OR org_id = $1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [orgId, limit]
    );

    return rows.map(r => ({
      id: r.id as string,
      orgId: r.org_id as string | null,
      feature: r.feature as string,
      provider: r.provider as string,
      model: r.model as string,
      inputTokens: r.input_tokens as number,
      outputTokens: r.output_tokens as number,
      estimatedCostUsd: parseFloat(r.estimated_cost_usd as string ?? '0'),
      durationMs: r.duration_ms as number,
      success: r.success as boolean,
      errorMessage: r.error_message as string | null,
      createdAt: r.created_at as Date,
    }));
  } finally {
    client.release();
  }
}

export async function getMonthlyTokenBurn(orgId: string | null): Promise<{
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  callCount: number;
}> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT
         COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
         COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
         COALESCE(SUM(estimated_cost_usd), 0) AS total_cost_usd,
         COUNT(*) AS call_count
       FROM ai_usage
       WHERE date_trunc('month', created_at) = date_trunc('month', now())
         AND ($1::text IS NULL OR org_id = $1)`,
      [orgId]
    );

    const row = rows[0];
    return {
      totalInputTokens: parseInt(row.total_input_tokens as string, 10),
      totalOutputTokens: parseInt(row.total_output_tokens as string, 10),
      totalCostUsd: parseFloat(row.total_cost_usd as string),
      callCount: parseInt(row.call_count as string, 10),
    };
  } finally {
    client.release();
  }
}
