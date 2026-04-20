-- BL-038 addendum: Copilot Sync Runs
-- Tracks each triggered Graph interaction sync so callers can poll progress,
-- mirroring the copilot_prompt_assessments status pattern.

CREATE TABLE IF NOT EXISTS copilot_sync_runs (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_connection_id  VARCHAR NOT NULL,
  organization_id       VARCHAR NOT NULL,
  status                TEXT NOT NULL DEFAULT 'RUNNING', -- RUNNING | COMPLETED | FAILED
  triggered_by          VARCHAR,
  users_scanned         INTEGER,
  interactions_captured INTEGER,
  interactions_skipped  INTEGER,
  interactions_purged   INTEGER,
  error_count           INTEGER,
  errors                JSONB,
  started_at            TIMESTAMP,
  completed_at          TIMESTAMP,
  error                 TEXT,
  created_at            TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_sync_runs_tenant
  ON copilot_sync_runs (tenant_connection_id);

CREATE INDEX IF NOT EXISTS idx_copilot_sync_runs_org
  ON copilot_sync_runs (organization_id);

CREATE INDEX IF NOT EXISTS idx_copilot_sync_runs_status
  ON copilot_sync_runs (tenant_connection_id, status);

CREATE INDEX IF NOT EXISTS idx_copilot_sync_runs_created_desc
  ON copilot_sync_runs (created_at DESC);
