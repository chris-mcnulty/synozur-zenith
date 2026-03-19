-- ============================================================
-- Zenith: Fix users placed in wrong org + prevent recurrence
-- Run each step manually and review results before proceeding.
-- ============================================================

-- STEP 1: Audit — show every user and whether their email domain
--         matches their org's primary domain.
SELECT
  u.id           AS user_id,
  u.email,
  split_part(u.email, '@', 2)  AS email_domain,
  u.azure_tenant_id             AS user_azure_tid,
  u.role,
  o.id           AS org_id,
  o.name         AS org_name,
  o.domain       AS org_domain,
  o.azure_tenant_id             AS org_azure_tid,
  CASE
    WHEN split_part(u.email, '@', 2) = o.domain THEN 'OK'
    ELSE 'MISMATCH'
  END AS domain_check
FROM users u
JOIN organizations o ON o.id = u.organization_id
ORDER BY domain_check DESC, u.email;

-- ============================================================
-- STEP 2: For each MISMATCH row, create the correct org if it
--         does not already exist.
--         Replace <email_domain> and <azure_tid> with values
--         from Step 1 before running.
-- ============================================================

-- Example for chrismcnulty.net:
INSERT INTO organizations (id, name, domain, service_plan, azure_tenant_id)
SELECT
  gen_random_uuid(),
  initcap(split_part('<email_domain>', '.', 1)),  -- e.g. 'Chrismcnulty'
  '<email_domain>',                               -- e.g. 'chrismcnulty.net'
  'ENTERPRISE',
  '<azure_tid>'                                   -- from user.azure_tenant_id in Step 1
WHERE NOT EXISTS (
  SELECT 1 FROM organizations WHERE domain = '<email_domain>'
);

-- ============================================================
-- STEP 3: Preview which users will be moved (read-only).
-- ============================================================
SELECT
  u.id           AS user_id,
  u.email,
  u.organization_id              AS current_org_id,
  o_current.name                 AS current_org_name,
  o_correct.id                   AS correct_org_id,
  o_correct.name                 AS correct_org_name
FROM users u
JOIN organizations o_current ON o_current.id = u.organization_id
JOIN organizations o_correct ON o_correct.domain = split_part(u.email, '@', 2)
WHERE u.organization_id != o_correct.id;

-- ============================================================
-- STEP 4: Apply the user → org correction (ATOMIC TRANSACTION).
--         Review Step 3 output before running this block.
-- ============================================================
BEGIN;

  -- 4a. Move user record to correct org
  UPDATE users u
  SET organization_id = o_correct.id
  FROM organizations o_correct
  WHERE o_correct.domain = split_part(u.email, '@', 2)
    AND u.organization_id != o_correct.id;

  -- 4b. Remove stale membership rows from wrong org
  DELETE FROM organization_users ou
  USING users u, organizations o_correct
  WHERE ou.user_id = u.id
    AND ou.organization_id = u.organization_id   -- now the CORRECT org after 4a
    AND o_correct.domain = split_part(u.email, '@', 2)
    AND ou.organization_id != o_correct.id;

  -- 4c. Ensure membership row exists in correct org
  INSERT INTO organization_users (user_id, organization_id, role, is_primary)
  SELECT u.id, o_correct.id, u.role, true
  FROM users u
  JOIN organizations o_correct ON o_correct.domain = split_part(u.email, '@', 2)
  ON CONFLICT (user_id, organization_id) DO UPDATE
    SET is_primary = true;

COMMIT;

-- ============================================================
-- STEP 5: Verify — re-run Step 1 and confirm all rows show OK.
-- ============================================================
