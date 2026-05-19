-- Library default sensitivity label ("DefaultSensitivityLabelForLibrary").
-- This is the label applied to new files added to the library going forward.
-- It is distinct from sensitivity_label_id (the drive-root label) and is set
-- via the SharePoint REST API (not exposed through Microsoft Graph).

ALTER TABLE "document_libraries"
  ADD COLUMN IF NOT EXISTS "default_sensitivity_label_id"          text,
  ADD COLUMN IF NOT EXISTS "default_sensitivity_label_name"        text,
  ADD COLUMN IF NOT EXISTS "default_sensitivity_label_synced_at"   timestamp;
