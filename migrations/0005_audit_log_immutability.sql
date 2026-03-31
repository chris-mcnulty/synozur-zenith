-- Migration: audit_log immutability (TD-001)
-- Spec Section 4.7: audit records cannot be modified or deleted via API
--
-- Strategy: PostgreSQL rule that prevents UPDATE on all columns EXCEPT tenantConnectionId.
-- The tenantConnectionId = NULL update is a legitimate referential integrity
-- maintenance operation when a tenant connection is deleted (storage.ts line ~857).
-- All other UPDATE operations are blocked at the database level.
--
-- Org-level DELETE (purgeOrganizationData) is retained as a GDPR erasure path
-- and is only callable by authenticated Tenant Admins deleting their own org.
-- It is NOT exposed as a standalone audit-log delete endpoint.

-- Prevent updating any audit_log column other than tenantConnectionId (NULL only).
-- id is immutable; tenant_connection_id may only be set to NULL for referential
-- maintenance on tenant deletion; all other data columns are fully immutable.
CREATE OR REPLACE RULE audit_log_no_data_update AS
  ON UPDATE TO audit_log
  WHERE (
    OLD.id IS DISTINCT FROM NEW.id OR
    OLD.user_id IS DISTINCT FROM NEW.user_id OR
    OLD.user_email IS DISTINCT FROM NEW.user_email OR
    OLD.action IS DISTINCT FROM NEW.action OR
    OLD.resource IS DISTINCT FROM NEW.resource OR
    OLD.resource_id IS DISTINCT FROM NEW.resource_id OR
    OLD.organization_id IS DISTINCT FROM NEW.organization_id OR
    OLD.details IS DISTINCT FROM NEW.details OR
    OLD.result IS DISTINCT FROM NEW.result OR
    OLD.ip_address IS DISTINCT FROM NEW.ip_address OR
    OLD.created_at IS DISTINCT FROM NEW.created_at OR
    (OLD.tenant_connection_id IS DISTINCT FROM NEW.tenant_connection_id AND NEW.tenant_connection_id IS NOT NULL)
  )
  DO INSTEAD NOTHING;

COMMENT ON TABLE audit_log IS
  'Immutable append-only audit trail. Data columns are protected by audit_log_no_data_update rule. '
  'Only tenantConnectionId may be set to NULL (referential maintenance on tenant deletion). '
  'Row deletion is restricted to org purge (GDPR) via purgeOrganizationData only.';
