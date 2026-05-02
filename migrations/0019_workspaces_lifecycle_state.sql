-- BL-019: Workspace archive/unarchive via Graph API
--
-- Adds the lifecycle-state columns introduced in shared/schema.ts so deployed
-- databases can persist Pending* states alongside the existing isArchived
-- boolean. All columns are nullable / have safe defaults so existing rows
-- remain valid; the tenant sync read-back will populate them on its next run.
--
-- Idempotent via ADD COLUMN IF NOT EXISTS.

ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS lifecycle_state text DEFAULT 'Active';
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archive_reason  text;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archived_at     timestamp;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archived_by     text;

-- Constrain the lifecycle_state column to the four documented states so we
-- catch typos at write-time. The constraint is added only if it doesn't
-- already exist (keeps the migration idempotent across re-runs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_lifecycle_state_check'
  ) THEN
    ALTER TABLE workspaces
      ADD CONSTRAINT workspaces_lifecycle_state_check
      CHECK (lifecycle_state IN ('Active', 'Archived', 'PendingArchive', 'PendingRestore'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workspaces_lifecycle_state ON workspaces (lifecycle_state);
