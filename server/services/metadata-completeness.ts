/**
 * Shared, dynamic metadata-completeness evaluator.
 *
 * Evaluates a workspace against the tenant's configured Required Metadata
 * Fields (Data Dictionary, category `required_metadata_field`). This is the
 * canonical check used by the policy engine, the Copilot readiness scorer,
 * and the dashboard stats — replacing the old static `workspace.metadataStatus`
 * field which is only set at provisioning time and never recomputed.
 *
 * Rules:
 *   - 0 required fields configured → always PASS (nothing to check).
 *   - N required fields configured → PASS iff every configured field is
 *     populated (non-empty) on the workspace.
 */

import type { Workspace } from "@shared/schema";
import { storage } from "../storage";

export const METADATA_FIELD_ACCESSORS: Record<string, (w: Workspace) => unknown> = {
  department: (w) => (w as any).department,
  costCenter: (w) => (w as any).costCenter,
  projectCode: (w) => (w as any).projectCode,
  description: (w) => (w as any).description,
  sensitivityLabelId: (w) => (w as any).sensitivityLabelId,
};

export interface MetadataCompletenessResult {
  pass: boolean;
  missingFields: string[];
}

export function evaluateMetadataCompleteness(
  workspace: Workspace,
  requiredFields: string[],
): MetadataCompletenessResult {
  if (!requiredFields || requiredFields.length === 0) {
    return { pass: true, missingFields: [] };
  }
  const missing: string[] = [];
  for (const field of requiredFields) {
    const accessor = METADATA_FIELD_ACCESSORS[field];
    if (!accessor) continue;
    const value = accessor(workspace);
    if (!value || (typeof value === "string" && value.trim() === "")) {
      missing.push(field);
    }
  }
  return { pass: missing.length === 0, missingFields: missing };
}

/**
 * Build a `tenantConnectionId → requiredMetadataFields[]` map for a set of
 * workspaces, fetching each tenant's Data Dictionary entries at most once.
 * Workspaces without a `tenantConnectionId` are skipped.
 */
export async function buildRequiredFieldsByTenantId(
  workspaces: Pick<Workspace, "tenantConnectionId">[],
): Promise<Record<string, string[]>> {
  const tenantConnectionIds = Array.from(
    new Set(
      workspaces
        .map((w) => w.tenantConnectionId)
        .filter((id): id is string => !!id),
    ),
  );

  const map: Record<string, string[]> = {};
  await Promise.all(
    tenantConnectionIds.map(async (connId) => {
      try {
        const conn = await storage.getTenantConnection(connId);
        if (!conn) {
          map[connId] = [];
          return;
        }
        const entries = await storage.getDataDictionary(conn.tenantId, "required_metadata_field");
        map[connId] = entries.map((e) => e.value);
      } catch {
        map[connId] = [];
      }
    }),
  );
  return map;
}

export async function getRequiredFieldsForWorkspace(
  workspace: Pick<Workspace, "tenantConnectionId">,
): Promise<string[]> {
  if (!workspace.tenantConnectionId) return [];
  const map = await buildRequiredFieldsByTenantId([workspace]);
  return map[workspace.tenantConnectionId] || [];
}
