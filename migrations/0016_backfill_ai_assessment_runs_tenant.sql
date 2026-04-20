-- Task #58: Backfill old Copilot Readiness AI runs so they show up under
-- the right tenant.
--
-- Task #57 made AI assessment runs tenant-scoped. Existing rows in
-- ai_assessment_runs were left with a NULL tenant_connection_id and
-- therefore disappeared from the new tenant-scoped latest lookup once a
-- customer chose a tenant. For organisations that only have a single
-- tenant connection we can safely attribute their historical runs to
-- that tenant. For multi-tenant organisations we can't guess which
-- tenant a legacy run belonged to, so we leave them NULL — they remain
-- queryable as "legacy / org-wide" runs via the dedicated history
-- endpoint added in this task.
--
-- Idempotent: re-running this migration is a no-op because the WHERE
-- clause requires tenant_connection_id IS NULL.

UPDATE ai_assessment_runs r
SET tenant_connection_id = sub.tenant_connection_id
FROM (
  SELECT organization_id, MIN(id) AS tenant_connection_id
  FROM tenant_connections
  GROUP BY organization_id
  HAVING COUNT(*) = 1
) sub
WHERE r.tenant_connection_id IS NULL
  AND r.org_id = sub.organization_id
  AND r.feature = 'copilot_readiness';
