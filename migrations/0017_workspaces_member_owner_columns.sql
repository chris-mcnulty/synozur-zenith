-- Task #73: Add columns to `workspaces` that were added to the Drizzle schema
-- as part of the recent member/owner refresh work but never landed in the
-- database. Without these columns Drizzle's `select()` (which enumerates
-- every schema column) blows up against any environment that hasn't yet
-- received the schema diff — most notably production tenants such as
-- chrismcnulty.net, where the IA Assessment failed with:
--   Failed query: select … "site_members", "custom_fields", …
--                 "spo_sync_hash", "local_hash" from "workspaces" …
--
-- All four columns are nullable with no default so existing rows remain
-- valid; sync jobs will populate them on their next run.
--
-- Idempotent via ADD COLUMN IF NOT EXISTS.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS site_members  jsonb;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS custom_fields jsonb;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS spo_sync_hash text;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS local_hash    text;
