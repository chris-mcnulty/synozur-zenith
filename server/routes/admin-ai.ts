import { Router } from 'express';
import { requireRole, type AuthenticatedRequest } from '../middleware/rbac';
import { ZENITH_ROLES } from '@shared/schema';
import { pool } from '../db';
import {
  AI_PROVIDERS,
  AI_FEATURES,
  DEFAULT_FEATURE_ASSIGNMENTS,
  type AIProvider,
  type AIFeature,
} from '@shared/ai-schema';
import { getProviderStatus, invalidateConfigCache } from '../services/ai-provider';
import { getAIUsageSummary, getMonthlyTokenBurn } from '../services/ai-usage';

const router = Router();

function formatConfig(cfg: Record<string, unknown>) {
  return {
    id: cfg.id,
    defaultProvider: cfg.default_provider,
    monthlyTokenBudget: cfg.monthly_token_budget ?? null,
    alertThresholdPercent: cfg.alert_threshold_percent,
    alertEmail: cfg.alert_email ?? null,
    updatedAt: cfg.updated_at,
  };
}

router.get(
  '/api/admin/ai/configuration',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          `SELECT * FROM ai_configuration WHERE singleton_key = 'default' LIMIT 1`
        );
        if (rows.length === 0) {
          return res.json({
            defaultProvider: AI_PROVIDERS.AZURE_FOUNDRY,
            monthlyTokenBudget: null,
            alertThresholdPercent: 80,
            alertEmail: null,
          });
        }
        res.json(formatConfig(rows[0]));
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  '/api/admin/ai/configuration',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { defaultProvider, monthlyTokenBudget, alertThresholdPercent, alertEmail } = req.body;

      if (defaultProvider && !Object.values(AI_PROVIDERS).includes(defaultProvider as AIProvider)) {
        return res.status(400).json({ error: 'Invalid provider' });
      }

      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          `INSERT INTO ai_configuration (singleton_key, default_provider, monthly_token_budget, alert_threshold_percent, alert_email, updated_at)
           VALUES ('default', $1, $2, $3, $4, now())
           ON CONFLICT (singleton_key) DO UPDATE
             SET default_provider = EXCLUDED.default_provider,
                 monthly_token_budget = EXCLUDED.monthly_token_budget,
                 alert_threshold_percent = EXCLUDED.alert_threshold_percent,
                 alert_email = EXCLUDED.alert_email,
                 updated_at = now()
           RETURNING *`,
          [
            (defaultProvider as AIProvider) ?? AI_PROVIDERS.AZURE_FOUNDRY,
            monthlyTokenBudget ?? null,
            alertThresholdPercent ?? 80,
            alertEmail ?? null,
          ]
        );

        invalidateConfigCache();
        res.json(formatConfig(rows[0]));
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

router.get(
  '/api/admin/ai/features',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          `SELECT * FROM ai_feature_model_assignments`
        );

        const assignments: Record<string, { provider: AIProvider; model: string; isActive: boolean }> = {};
        for (const [feature, defaults] of Object.entries(DEFAULT_FEATURE_ASSIGNMENTS)) {
          assignments[feature] = { ...defaults, isActive: true };
        }
        for (const row of rows) {
          assignments[row.feature as string] = {
            provider: row.provider as AIProvider,
            model: row.model as string,
            isActive: row.is_active as boolean,
          };
        }

        res.json(assignments);
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

router.post(
  '/api/admin/ai/features',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { feature, provider, model } = req.body as { feature: string; provider: string; model: string };

      if (!Object.values(AI_FEATURES).includes(feature as AIFeature)) {
        return res.status(400).json({ error: 'Invalid feature' });
      }
      if (!Object.values(AI_PROVIDERS).includes(provider as AIProvider)) {
        return res.status(400).json({ error: 'Invalid provider' });
      }

      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO ai_feature_model_assignments (feature, provider, model, is_active)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (feature) DO UPDATE
           SET provider = EXCLUDED.provider, model = EXCLUDED.model, is_active = true, updated_at = now()`,
          [feature, provider, model]
        );

        invalidateConfigCache();

        res.json({ feature, provider, model, isActive: true });
      } finally {
        client.release();
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

router.get(
  '/api/admin/ai/usage',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(parseInt((req.query.limit as string | undefined) ?? '100', 10), 500);
      const orgId = (req.query.orgId as string | undefined) ?? null;

      const [rows, monthly] = await Promise.all([
        getAIUsageSummary(orgId, limit),
        getMonthlyTokenBurn(orgId),
      ]);

      res.json({ rows, monthly });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

router.get(
  '/api/admin/ai/provider-status',
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const statuses = getProviderStatus();
      res.json(statuses);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
