-- BL-046: Tenant Connection Health Monitor
--
-- Nightly health pings against each connected M365 tenant. A row is written
-- per check with latency and outcome so the dashboard widget can render
-- the current state and a short history.
--
-- The new `degraded` substate on `tenant_connections.health_status` is
-- non-blocking — it does NOT suspend governance actions (BL-004's
-- `Suspended` state still owns that). It exists to make connection
-- expiry / Graph instability visible BEFORE a user lands on a broken page.

CREATE TABLE IF NOT EXISTS tenant_health_checks (
  id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_connection_id  VARCHAR NOT NULL REFERENCES tenant_connections(id) ON DELETE CASCADE,
  organization_id       VARCHAR,
  checked_at            TIMESTAMP NOT NULL DEFAULT now(),
  latency_ms            INTEGER,
  -- healthy | degraded | failed
  status                TEXT NOT NULL,
  error_code            TEXT,
  error_message         TEXT,
  created_at            TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_health_checks_tenant_checked_desc
  ON tenant_health_checks (tenant_connection_id, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_health_checks_org
  ON tenant_health_checks (organization_id);

-- Per-connection health summary. We keep a denormalized field on
-- tenant_connections so the dashboard widget can render the current state
-- without fanning out to scan tenant_health_checks for every tenant.
ALTER TABLE tenant_connections
  ADD COLUMN IF NOT EXISTS health_status            TEXT,
  ADD COLUMN IF NOT EXISTS health_last_checked_at   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS health_consecutive_failures INTEGER NOT NULL DEFAULT 0;
