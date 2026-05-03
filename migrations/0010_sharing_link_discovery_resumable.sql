-- Adds checkpoint cursor + progress fields to sharing_link_discovery_runs.
-- The table is also created defensively on app boot in server/index.ts;
-- guard the ALTER so a fresh-DB migration run cannot fail if the table
-- has not been created yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'sharing_link_discovery_runs'
  ) THEN
    ALTER TABLE "sharing_link_discovery_runs"
      ADD COLUMN IF NOT EXISTS "phase" text,
      ADD COLUMN IF NOT EXISTS "last_processed_spo_site_id" varchar,
      ADD COLUMN IF NOT EXISTS "last_processed_onedrive_id" varchar,
      ADD COLUMN IF NOT EXISTS "resumable" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "items_total" integer,
      ADD COLUMN IF NOT EXISTS "items_processed" integer,
      ADD COLUMN IF NOT EXISTS "progress_label" text;

    CREATE INDEX IF NOT EXISTS "sharing_link_discovery_runs_tenant_resumable_idx"
      ON "sharing_link_discovery_runs" ("tenant_connection_id", "resumable", "started_at" DESC);
  END IF;
END
$$;
