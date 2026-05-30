-- Nightly Data Refresh & Health Report (premium / Enterprise)
--
-- Persists one row per nightly (or manual) health-report run. The report flags
-- sites over 75% and over 90% of storage quota plus other governance health
-- issues across the suite, and is delivered in-product and by email.
--
-- Per-connection admin toggles let admins disable report generation and/or
-- email delivery while still running the nightly data refresh.

ALTER TABLE tenant_connections
  ADD COLUMN IF NOT EXISTS nightly_refresh_schedule_enabled    boolean NOT NULL DEFAULT true;
ALTER TABLE tenant_connections
  ADD COLUMN IF NOT EXISTS nightly_health_report_enabled       boolean NOT NULL DEFAULT true;
ALTER TABLE tenant_connections
  ADD COLUMN IF NOT EXISTS nightly_health_report_email_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS nightly_health_reports (
  id                     VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        VARCHAR NOT NULL,
  tenant_connection_id   VARCHAR NOT NULL,

  -- RUNNING | COMPLETED | FAILED
  status                 TEXT NOT NULL DEFAULT 'RUNNING',
  report_date            TEXT NOT NULL, -- YYYY-MM-DD

  snapshot               JSONB,
  sites_over_75          INTEGER,
  sites_over_90          INTEGER,
  issue_count            INTEGER,

  emailed_at             TIMESTAMP,
  email_recipient_count  INTEGER,

  -- scheduled | manual
  triggered_by           TEXT NOT NULL DEFAULT 'scheduled',
  triggered_by_user_id   VARCHAR,

  started_at             TIMESTAMP NOT NULL DEFAULT now(),
  completed_at           TIMESTAMP,
  error                  TEXT,

  created_at             TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nightly_health_reports_tenant_started
  ON nightly_health_reports (tenant_connection_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_nightly_health_reports_org_started
  ON nightly_health_reports (organization_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_nightly_health_reports_status
  ON nightly_health_reports (status);
