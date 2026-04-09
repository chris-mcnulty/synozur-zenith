ALTER TABLE "onedrive_inventory" ADD COLUMN IF NOT EXISTS "excluded" boolean NOT NULL DEFAULT false;
ALTER TABLE "onedrive_inventory" ADD COLUMN IF NOT EXISTS "exclusion_reason" text;
