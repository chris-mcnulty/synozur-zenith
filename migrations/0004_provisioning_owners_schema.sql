-- Migration: Remove legacy primarySteward/secondarySteward columns,
-- add siteOwners JSONB + new provisioning fields
-- 2026-03-27

-- Remove legacy steward columns from workspaces
ALTER TABLE workspaces DROP COLUMN IF EXISTS primary_steward;
ALTER TABLE workspaces DROP COLUMN IF EXISTS secondary_steward;

-- Remove legacy steward columns from provisioning_requests and add siteOwners + new fields
ALTER TABLE provisioning_requests DROP COLUMN IF EXISTS primary_steward;
ALTER TABLE provisioning_requests DROP COLUMN IF EXISTS secondary_steward;
ALTER TABLE provisioning_requests
  ADD COLUMN IF NOT EXISTS site_owners jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE provisioning_requests
  ADD COLUMN IF NOT EXISTS tenant_connection_id varchar;
ALTER TABLE provisioning_requests
  ADD COLUMN IF NOT EXISTS provisioned_site_url text;
ALTER TABLE provisioning_requests
  ADD COLUMN IF NOT EXISTS error_message text;
