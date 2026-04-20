-- Fix sensitivity labels where appliesToGroupsSites was incorrectly stored as false
-- because the Graph beta endpoint returned an empty contentFormats array.
-- When contentFormats is NULL or empty we can't determine scope, so we treat
-- the label as applicable to groups/sites (the safe default). Labels whose
-- contentFormats explicitly list only non-site formats (file, email, etc.) are
-- left as-is; they will be corrected on next label sync.
--
-- Specifically: flip appliesToGroupsSites → true for any label where
-- content_formats is NULL or empty (no scope evidence either way).

UPDATE sensitivity_labels
SET applies_to_groups_sites = true
WHERE
  applies_to_groups_sites = false
  AND (
    content_formats IS NULL
    OR content_formats = '{}'
    OR array_length(content_formats, 1) IS NULL
  );
