/**
 * BL-007 — Lifecycle compliance scan executor.
 *
 * Pure scan execution extracted from the manual `POST /api/lifecycle/review/scan`
 * route so it can be reused by the nightly scheduler. Creates a
 * `lifecycle_scan_runs` row, evaluates compliance for every workspace in
 * scope, refreshes `workspace_compliance_scores`, and finalizes the run row.
 */

import { storage } from "../storage";
import {
  defaultDetectionRules,
  evaluateCompliance,
  isCompliant,
  type DetectionRules,
} from "./lifecycle-compliance";
import { buildRequiredFieldsByTenantId } from "./metadata-completeness";
import type { LifecycleScanRun, LifecycleComplianceSettings } from "@shared/schema";

export interface LifecycleScanOptions {
  organizationId: string;
  tenantConnectionId: string | null;
  triggeredBy: string;
  /**
   * Optional pre-loaded rules. If omitted, rules are loaded from
   * lifecycle_compliance_settings (per-tenant override → org default →
   * compiled defaults).
   */
  rules?: DetectionRules;
}

async function loadDetectionRulesFromSettings(
  organizationId: string,
  tenantConnectionId: string | null,
): Promise<DetectionRules> {
  let row: LifecycleComplianceSettings | undefined;
  if (tenantConnectionId) {
    row = await storage.getLifecycleComplianceSettings({ organizationId, tenantConnectionId });
  }
  if (!row) {
    row = await storage.getLifecycleComplianceSettings({ organizationId, tenantConnectionId: null });
  }
  if (!row) return defaultDetectionRules();
  return {
    staleThresholdDays: row.staleThresholdDays,
    orphanedThresholdDays: row.orphanedThresholdDays,
    labelRequired: row.labelRequired,
    metadataRequired: row.metadataRequired,
    weights: {
      primarySteward: row.weightPrimarySteward,
      secondarySteward: row.weightSecondarySteward,
      sensitivityLabel: row.weightSensitivityLabel,
      metadata: row.weightMetadata,
      activity: row.weightActivity,
      sharingPosture: row.weightSharingPosture,
      retentionLabel: row.weightRetentionLabel,
    },
  };
}

export interface LifecycleScanResult {
  run: LifecycleScanRun;
  workspacesScanned: number;
  averageScore: number;
  compliantCount: number;
  staleCount: number;
  orphanedCount: number;
  missingLabelCount: number;
  externallySharedCount: number;
}

async function loadWorkspacesForScope(
  organizationId: string,
  tenantConnectionId: string | null,
) {
  if (tenantConnectionId) {
    return storage.getWorkspaces(undefined, tenantConnectionId, organizationId);
  }
  return storage.getWorkspaces();
}

/**
 * Run a lifecycle compliance scan for the given org/tenant scope.
 *
 * Always creates a `lifecycle_scan_runs` row, even on failure — so the
 * trend chart and audit history reflect attempts. On success the scan
 * also refreshes a `workspace_compliance_scores` row per workspace.
 */
export async function executeLifecycleScan(
  opts: LifecycleScanOptions,
): Promise<LifecycleScanResult> {
  const { organizationId, tenantConnectionId, triggeredBy } = opts;

  const run = await storage.createLifecycleScanRun({
    organizationId,
    tenantConnectionId: tenantConnectionId,
    status: "running",
    startedAt: new Date(),
    triggeredBy,
  });

  try {
    const workspaces = await loadWorkspacesForScope(organizationId, tenantConnectionId);
    const requiredFieldsByTenant = await buildRequiredFieldsByTenantId(workspaces);
    const rules = opts.rules
      ?? (await loadDetectionRulesFromSettings(organizationId, tenantConnectionId));

    let totalScore = 0;
    let compliantCount = 0;
    let staleCount = 0;
    let orphanedCount = 0;
    let missingLabelCount = 0;
    let externallySharedCount = 0;

    for (const w of workspaces) {
      const fields = w.tenantConnectionId
        ? (requiredFieldsByTenant[w.tenantConnectionId] || [])
        : [];
      const c = evaluateCompliance(w as any, fields, rules);
      totalScore += c.score;
      if (isCompliant(c.score)) compliantCount++;
      if (c.isStale) staleCount++;
      if (c.isOrphaned) orphanedCount++;
      if (c.missingLabel) missingLabelCount++;
      if (c.externallySharedUnclassified) externallySharedCount++;

      await storage.upsertWorkspaceComplianceScore({
        workspaceId: w.id,
        organizationId,
        tenantConnectionId: w.tenantConnectionId ?? null,
        score: c.score,
        isStale: c.isStale,
        isOrphaned: c.isOrphaned,
        missingLabel: c.missingLabel,
        missingMetadata: c.missingMetadata,
        externallySharedUnclassified: c.externallySharedUnclassified,
        daysSinceActivity: c.daysSinceActivity,
        breakdown: c.breakdown,
        computedAt: new Date(),
        scanRunId: run.id,
      });
    }

    const averageScore = workspaces.length === 0
      ? 0
      : Math.round(totalScore / workspaces.length);

    const completed = await storage.updateLifecycleScanRun(run.id, {
      status: "completed",
      completedAt: new Date(),
      workspacesScanned: workspaces.length,
      averageScore,
      compliantCount,
      staleCount,
      orphanedCount,
      missingLabelCount,
      externallySharedCount,
    });

    return {
      run: completed ?? run,
      workspacesScanned: workspaces.length,
      averageScore,
      compliantCount,
      staleCount,
      orphanedCount,
      missingLabelCount,
      externallySharedCount,
    };
  } catch (err: any) {
    await storage.updateLifecycleScanRun(run.id, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: err?.message ?? String(err),
    });
    throw err;
  }
}
