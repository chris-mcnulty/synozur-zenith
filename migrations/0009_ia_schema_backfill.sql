-- Migration: IA schema backfill for pre-existing library_content_types and library_columns tables
--
-- Migration 0008 created library_content_types and library_columns using CREATE TABLE IF NOT
-- EXISTS, so any databases where those tables already existed (from an older
-- ensureTenantConnectionsSchema() run) did not receive the new columns. This migration
-- backfills those columns idempotently using ADD COLUMN IF NOT EXISTS, mirroring the
-- runtime ALTER TABLE statements in ensureTenantConnectionsSchema() so the migration
-- files are authoritative and Drizzle-compatible.

-- ── library_content_types: backfill columns that pre-date migration 0008 ─────
ALTER TABLE "library_content_types"
  ADD COLUMN IF NOT EXISTS "workspace_id"           varchar NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "tenant_connection_id"   varchar NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "parent_content_type_id" text,
  ADD COLUMN IF NOT EXISTS "group"                  text,
  ADD COLUMN IF NOT EXISTS "description"            text,
  ADD COLUMN IF NOT EXISTS "scope"                  text    NOT NULL DEFAULT 'LIBRARY',
  ADD COLUMN IF NOT EXISTS "is_built_in"            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_inherited"           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "hidden"                 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "last_sync_at"           timestamp DEFAULT now();

-- ── library_columns: backfill columns that pre-date migration 0008 ───────────
ALTER TABLE "library_columns"
  ADD COLUMN IF NOT EXISTS "workspace_id"           varchar NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "tenant_connection_id"   varchar NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "column_group"           text,
  ADD COLUMN IF NOT EXISTS "description"            text,
  ADD COLUMN IF NOT EXISTS "scope"                  text    NOT NULL DEFAULT 'LIBRARY',
  ADD COLUMN IF NOT EXISTS "is_custom"              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_syntex_managed"      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_sealed"              boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_read_only"           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_indexed"             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "is_required"            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "last_sync_at"           timestamp DEFAULT now();

-- ── Indices: create any indices from migration 0008 that ensureTenantConnectionsSchema
-- may not have created (the runtime function uses different names). All are IF NOT EXISTS
-- so they are safe to run on databases that already have them from either source.
CREATE INDEX IF NOT EXISTS "idx_lct_tenant"    ON "library_content_types" ("tenant_connection_id");
CREATE INDEX IF NOT EXISTS "idx_lct_workspace" ON "library_content_types" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_lct_scope"     ON "library_content_types" ("tenant_connection_id", "scope");
CREATE INDEX IF NOT EXISTS "idx_lct_name"      ON "library_content_types" ("tenant_connection_id", "name");

CREATE INDEX IF NOT EXISTS "idx_lcol_tenant"   ON "library_columns" ("tenant_connection_id");
CREATE INDEX IF NOT EXISTS "idx_lcol_workspace" ON "library_columns" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_lcol_name"     ON "library_columns" ("tenant_connection_id", "column_internal_name");
CREATE INDEX IF NOT EXISTS "idx_lcol_display"  ON "library_columns" ("tenant_connection_id", "display_name");
CREATE INDEX IF NOT EXISTS "idx_lcol_scope"    ON "library_columns" ("tenant_connection_id", "scope");
