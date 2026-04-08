-- Migration: Zenith User Inventory + Email Content Storage Report
-- Run: psql $DATABASE_URL -f migrations/0006_user_inventory_email_storage_report.sql
--
-- Introduces:
--   * user_inventory        - cached, minimal, read-only snapshot of tenant users
--   * user_inventory_runs   - tracks each refresh of the cache (paging + caps)
--   * email_storage_reports - Email Content Storage Report runs and results
--
-- Reports MUST read users from user_inventory and MUST NOT enumerate Entra
-- directly during report execution.

-- ── user_inventory ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_inventory" (
  "id"                         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_connection_id"       varchar NOT NULL,

  "user_id"                    text NOT NULL,                -- Entra Object ID
  "user_principal_name"        text NOT NULL,
  "mail"                       text,                          -- primary SMTP if different from UPN
  "display_name"               text,
  "account_enabled"            boolean NOT NULL DEFAULT true,
  "user_type"                  text NOT NULL DEFAULT 'Member', -- Member | Guest

  "mailbox_license_hint"       text,
  "last_known_mail_activity"   text,

  "last_refreshed_at"          timestamp NOT NULL DEFAULT now(),
  "discovery_status"           text NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | DELETED

  "created_at"                 timestamp DEFAULT now()
);

ALTER TABLE "user_inventory"
  ADD CONSTRAINT "uq_tenant_user_inventory"
  UNIQUE ("tenant_connection_id", "user_id");

CREATE INDEX IF NOT EXISTS "idx_user_inventory_tenant"
  ON "user_inventory" ("tenant_connection_id");

CREATE INDEX IF NOT EXISTS "idx_user_inventory_tenant_status"
  ON "user_inventory" ("tenant_connection_id", "discovery_status");

-- ── user_inventory_runs ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "user_inventory_runs" (
  "id"                      varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_connection_id"    varchar NOT NULL,
  "started_at"              timestamp NOT NULL DEFAULT now(),
  "completed_at"            timestamp,
  "status"                  text NOT NULL DEFAULT 'RUNNING',  -- RUNNING | COMPLETED | FAILED | PARTIAL | CAP_REACHED
  "max_users_cap"           integer,
  "users_discovered"        integer DEFAULT 0,
  "users_marked_deleted"    integer DEFAULT 0,
  "pages_fetched"           integer DEFAULT 0,
  "errors"                  jsonb,
  "created_at"              timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_inventory_runs_tenant_started"
  ON "user_inventory_runs" ("tenant_connection_id", "started_at" DESC);

-- ── email_storage_reports ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "email_storage_reports" (
  "id"                              varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_connection_id"            varchar NOT NULL,

  "mode"                            text NOT NULL,           -- ESTIMATE | METADATA
  "window_days"                     integer NOT NULL,        -- 7 | 30 | 90
  "window_start"                    timestamp NOT NULL,
  "window_end"                      timestamp NOT NULL,

  "status"                          text NOT NULL DEFAULT 'RUNNING',
  "started_at"                      timestamp NOT NULL DEFAULT now(),
  "completed_at"                    timestamp,

  "limits"                          jsonb NOT NULL,

  "users_planned"                   integer DEFAULT 0,
  "users_processed"                 integer DEFAULT 0,
  "messages_analyzed"               integer DEFAULT 0,
  "messages_with_attachments"       integer DEFAULT 0,
  "estimated_attachment_bytes"      bigint  DEFAULT 0,

  "inventory_snapshot_at"           timestamp,
  "inventory_sampled_count"         integer,
  "inventory_total_count"           integer,
  "verified_domains"                jsonb,
  "data_masking_applied"            boolean NOT NULL DEFAULT false,

  "summary"                         jsonb,
  "caps_hit"                        jsonb,
  "accuracy_caveats"                jsonb,
  "errors"                          jsonb,

  "triggered_by_user_id"            varchar,
  "created_at"                      timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_email_storage_reports_tenant_started"
  ON "email_storage_reports" ("tenant_connection_id", "started_at" DESC);
