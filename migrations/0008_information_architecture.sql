-- Migration: Information Architecture consolidation
-- Adds per-library content-type and column inventory tables, and extends
-- content_types with scope + usage-count rollups so the consolidated IA page
-- can render HUB/SITE/LIBRARY scope views and analyze patterns across libraries.

-- ── content_types: scope + usage rollups ─────────────────────────────────────
ALTER TABLE "content_types"
  ADD COLUMN IF NOT EXISTS "scope"               text    NOT NULL DEFAULT 'HUB',
  ADD COLUMN IF NOT EXISTS "library_usage_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "site_usage_count"    integer NOT NULL DEFAULT 0;

-- ── library_content_types ────────────────────────────────────────────────────
-- Per-library content type inventory. scope is derived at sync time:
--   HUB     = contentTypeId matches a content_types row with is_hub = true
--   SITE    = is_inherited = true but not a hub match
--   LIBRARY = not inherited (locally defined on the library)
CREATE TABLE IF NOT EXISTS "library_content_types" (
  "id"                       varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"             varchar NOT NULL,
  "tenant_connection_id"     varchar NOT NULL,
  "document_library_id"      varchar NOT NULL,
  "content_type_id"          text    NOT NULL,
  "parent_content_type_id"   text,
  "name"                     text    NOT NULL,
  "group"                    text,
  "description"              text,
  "scope"                    text    NOT NULL DEFAULT 'LIBRARY',
  "is_built_in"              boolean NOT NULL DEFAULT false,
  "is_inherited"             boolean NOT NULL DEFAULT false,
  "hidden"                   boolean NOT NULL DEFAULT false,
  "last_sync_at"             timestamp DEFAULT now(),

  CONSTRAINT "uq_library_content_type" UNIQUE ("document_library_id", "content_type_id")
);

CREATE INDEX IF NOT EXISTS "idx_lct_tenant"    ON "library_content_types" ("tenant_connection_id");
CREATE INDEX IF NOT EXISTS "idx_lct_workspace" ON "library_content_types" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_lct_scope"     ON "library_content_types" ("tenant_connection_id", "scope");
CREATE INDEX IF NOT EXISTS "idx_lct_name"      ON "library_content_types" ("tenant_connection_id", "name");

-- ── library_columns ──────────────────────────────────────────────────────────
-- Per-library column inventory. scope:
--   SITE    = column also defined on parent site (same internal name)
--   LIBRARY = column defined locally on the library
CREATE TABLE IF NOT EXISTS "library_columns" (
  "id"                       varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id"             varchar NOT NULL,
  "tenant_connection_id"     varchar NOT NULL,
  "document_library_id"      varchar NOT NULL,
  "column_internal_name"     text    NOT NULL,
  "display_name"             text    NOT NULL,
  "column_type"              text    NOT NULL,
  "column_group"             text,
  "description"              text,
  "scope"                    text    NOT NULL DEFAULT 'LIBRARY',
  "is_custom"                boolean NOT NULL DEFAULT false,
  "is_syntex_managed"        boolean NOT NULL DEFAULT false,
  "is_sealed"                boolean NOT NULL DEFAULT false,
  "is_read_only"             boolean NOT NULL DEFAULT false,
  "is_indexed"               boolean NOT NULL DEFAULT false,
  "is_required"              boolean NOT NULL DEFAULT false,
  "last_sync_at"             timestamp DEFAULT now(),

  CONSTRAINT "uq_library_column" UNIQUE ("document_library_id", "column_internal_name")
);

CREATE INDEX IF NOT EXISTS "idx_lcol_tenant"    ON "library_columns" ("tenant_connection_id");
CREATE INDEX IF NOT EXISTS "idx_lcol_workspace" ON "library_columns" ("workspace_id");
CREATE INDEX IF NOT EXISTS "idx_lcol_name"      ON "library_columns" ("tenant_connection_id", "column_internal_name");
CREATE INDEX IF NOT EXISTS "idx_lcol_display"   ON "library_columns" ("tenant_connection_id", "display_name");
CREATE INDEX IF NOT EXISTS "idx_lcol_scope"     ON "library_columns" ("tenant_connection_id", "scope");
