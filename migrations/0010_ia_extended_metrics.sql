-- Migration: Extended IA metrics — folder depth, views, column fill rates, drive ID
--
-- Adds new columns to document_libraries and library_columns tables to support
-- enhanced IA assessment dimensions: library structure (folder depth, views),
-- and metadata schema quality (per-column fill rates).

-- ── document_libraries: extended IA metrics ─────────────────────────────────────
ALTER TABLE "document_libraries"
  ADD COLUMN IF NOT EXISTS "m365_drive_id"        text,
  ADD COLUMN IF NOT EXISTS "max_folder_depth"     integer,
  ADD COLUMN IF NOT EXISTS "total_folder_count"   integer,
  ADD COLUMN IF NOT EXISTS "custom_view_count"    integer,
  ADD COLUMN IF NOT EXISTS "total_view_count"     integer;

-- ── library_columns: metadata fill rate from sampled items ──────────────────────
ALTER TABLE "library_columns"
  ADD COLUMN IF NOT EXISTS "fill_rate_pct"         integer,
  ADD COLUMN IF NOT EXISTS "fill_rate_sample_size" integer;
