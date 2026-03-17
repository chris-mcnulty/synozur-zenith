-- Migration: add workspace_telemetry table
-- Run: psql $DATABASE_URL -f migrations/0001_workspace_telemetry.sql
--
-- Stores per-sync telemetry snapshots for every SharePoint container.
-- Retaining multiple snapshots enables growth-trend analysis over time.

CREATE TABLE IF NOT EXISTS "workspace_telemetry" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"          varchar NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "tenant_connection_id"  varchar,

  -- Storage
  "storage_used_bytes"    bigint,
  "storage_total_bytes"   bigint,

  -- Content counts
  "file_count"            integer,
  "folder_count"          integer,        -- items directly under drive root (top-level proxy)
  "list_count"            integer,
  "document_library_count" integer,

  -- Content classification (JSON array of {id, name})
  "content_types"         jsonb,

  -- Sensitivity / labelling
  "sensitivity_label"     text,
  "sensitivity_label_id"  text,

  -- Activity
  "last_activity_date"    timestamp,

  "snapshot_at"           timestamp NOT NULL DEFAULT now(),
  "created_at"            timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_workspace_telemetry_workspace_id"
  ON "workspace_telemetry" ("workspace_id", "snapshot_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_workspace_telemetry_tenant_connection"
  ON "workspace_telemetry" ("tenant_connection_id", "snapshot_at" DESC);
