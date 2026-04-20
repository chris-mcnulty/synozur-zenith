-- BL-039: Job Monitor, Dataset Freshness & Pre-Report Refresh Prompts
--
-- Adds a single cross-cutting audit trail for every background data-gathering
-- job run across the platform. Existing per-service run tables
-- (copilot_sync_runs, sharing_link_discovery_runs, teams_discovery_runs,
-- user_inventory_runs, ai_assessment_runs, email_storage_reports,
-- copilot_prompt_assessments, content_governance_snapshots, etc.) remain
-- in place; this table is the unified view consumed by the new Job Monitor
-- admin UI and the Dataset Freshness Registry.

CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       VARCHAR,
  tenant_connection_id  VARCHAR,
  job_type              TEXT NOT NULL,
  -- running | completed | failed | cancelled
  status                TEXT NOT NULL DEFAULT 'running',
  started_at            TIMESTAMP NOT NULL DEFAULT now(),
  completed_at          TIMESTAMP,
  duration_ms           INTEGER,
  result                JSONB,
  error_message         TEXT,
  -- manual | system | scheduled
  triggered_by          TEXT NOT NULL DEFAULT 'manual',
  triggered_by_user_id  VARCHAR,
  target_id             TEXT,
  target_name           TEXT,
  items_total           INTEGER,
  items_processed       INTEGER,
  progress_label        TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_org
  ON scheduled_job_runs (organization_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_tenant
  ON scheduled_job_runs (tenant_connection_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_tenant_type
  ON scheduled_job_runs (tenant_connection_id, job_type);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_tenant_type_status
  ON scheduled_job_runs (tenant_connection_id, job_type, status);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_status
  ON scheduled_job_runs (status);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_started_desc
  ON scheduled_job_runs (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job_type_started_desc
  ON scheduled_job_runs (job_type, started_at DESC);
