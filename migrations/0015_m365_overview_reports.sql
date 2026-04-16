-- M365 30-Day Overview Report (premium, LLM-authored executive summary)
--
-- Persists one row per generation run with the raw 30-day aggregate snapshot,
-- an LLM executive narrative, and structured recommendations. Reports are
-- listed, read, and deleted through the premium overview report API.

CREATE TABLE IF NOT EXISTS m365_overview_reports (
  id                     VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        VARCHAR NOT NULL,
  tenant_connection_id   VARCHAR NOT NULL,

  -- RUNNING | COMPLETED | FAILED
  status                 TEXT    NOT NULL DEFAULT 'RUNNING',
  window_start           TIMESTAMP NOT NULL,
  window_end             TIMESTAMP NOT NULL,

  snapshot               JSONB,
  narrative              TEXT,
  recommendations        JSONB,

  model_used             TEXT,
  tokens_used            INTEGER,

  triggered_by_user_id   VARCHAR,

  started_at             TIMESTAMP NOT NULL DEFAULT now(),
  completed_at           TIMESTAMP,
  error                  TEXT,

  created_at             TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_m365_overview_reports_tenant_started
  ON m365_overview_reports (tenant_connection_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_m365_overview_reports_org_started
  ON m365_overview_reports (organization_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_m365_overview_reports_status
  ON m365_overview_reports (status);
