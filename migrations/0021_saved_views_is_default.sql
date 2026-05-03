-- Add is_default flag to saved_views (task-111)
-- Allows Tenant Admins to mark an org-shared view as the page default.
-- Only one view per (organization_id, page) can be default at a time;
-- the application enforces this via the setDefaultSavedView storage method.

ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ix_saved_views_default ON saved_views (organization_id, page, is_default)
  WHERE is_default = true;
