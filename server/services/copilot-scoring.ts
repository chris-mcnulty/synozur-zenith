/**
 * Copilot Readiness Scoring Engine (BL-006)
 *
 * Produces an explainable 0–100 readiness score per workspace plus org-wide
 * aggregates and a remediation queue ranked by impact. Consumes the same
 * per-workspace data that drives the existing copilot_rules table but adds:
 *
 *   - Weighted scoring (not just binary PASS/FAIL)
 *   - Blocking-factor classification with remediation text
 *   - Explicit exclusion model via workspace.customFields.copilot_excluded
 *   - Org-wide aggregation and tier bucketing (Ready / NearlyReady / AtRisk / Blocked)
 *   - Ranked remediation queue — sites closest to eligibility surface first
 *
 * No schema changes are required. Exclusions live in the existing jsonb
 * `customFields` column under key `copilot_excluded` (boolean).
 */

import type { Workspace } from "@shared/schema";
import { evaluateMetadataCompleteness } from "./metadata-completeness";

export interface ScoringCriterion {
  key: string;
  label: string;
  weight: number;
  pass: boolean;
  /** Brief explanation of what the criterion checks. */
  description: string;
  /** Human-readable remediation step shown when the criterion fails. */
  remediation: string;
}

export type ReadinessTier = "READY" | "NEARLY_READY" | "AT_RISK" | "BLOCKED" | "EXCLUDED";

export interface WorkspaceReadiness {
  workspaceId: string;
  displayName: string;
  siteUrl: string | null;
  tenantConnectionId: string | null;
  sensitivity: string;
  score: number;
  tier: ReadinessTier;
  eligible: boolean;
  excluded: boolean;
  exclusionReason: string | null;
  criteria: ScoringCriterion[];
  blockers: ScoringCriterion[];
  passingCount: number;
  totalCount: number;
  /** Remediation-queue priority: higher = closer to eligibility. */
  remediationPriority: number;
}

export interface OrgReadinessSummary {
  totalWorkspaces: number;
  evaluated: number;
  excluded: number;
  ready: number;
  nearlyReady: number;
  atRisk: number;
  blocked: number;
  /** Org-wide average readiness score (0–100), excluding excluded workspaces. */
  averageScore: number;
  /** Percentage of evaluated workspaces currently Ready. */
  readinessPercent: number;
  /** Aggregate count of each failing criterion across all workspaces. */
  blockerBreakdown: { key: string; label: string; count: number }[];
}

export interface CopilotReadinessResult {
  summary: OrgReadinessSummary;
  workspaces: WorkspaceReadiness[];
  /** Top N workspaces closest to eligibility — the actionable remediation queue. */
  remediationQueue: WorkspaceReadiness[];
}

/**
 * Criterion weights are chosen so that sensitivity labels and dual ownership
 * dominate the score — these are the two hardest blockers to remediate and
 * also the most commonly missing in greenfield tenants. Weights sum to 100.
 */
const CRITERION_WEIGHTS = {
  sensitivityLabel: 25,
  ownership: 20,
  metadata: 15,
  sharingPosture: 15,
  ownerAssigned: 10,
  notArchived: 5,
  notDeleted: 5,
  labelEncryption: 5,
};

function evaluateWorkspace(
  workspace: Workspace,
  requiredMetadataFields: string[] = [],
): ScoringCriterion[] {
  const customFields = (workspace as any).customFields as Record<string, any> | null | undefined;
  const siteOwners = (workspace as any).siteOwners as Array<unknown> | null | undefined;
  const ownerCount = siteOwners && siteOwners.length > 0 ? siteOwners.length : workspace.owners || 0;

  const metadataEval = evaluateMetadataCompleteness(workspace, requiredMetadataFields);
  const metadataDescription = requiredMetadataFields.length === 0
    ? "No required governance metadata fields are configured for this tenant."
    : `Required fields: ${requiredMetadataFields.join(", ")}.`;
  const metadataRemediation = metadataEval.pass
    ? "All required metadata fields are populated."
    : `Populate required metadata field${metadataEval.missingFields.length === 1 ? "" : "s"} (${metadataEval.missingFields.join(", ")}) via Site Governance.`;

  const criteria: ScoringCriterion[] = [
    {
      key: "sensitivityLabel",
      label: "Sensitivity Label Applied",
      weight: CRITERION_WEIGHTS.sensitivityLabel,
      pass: !!workspace.sensitivityLabelId,
      description: "Workspace must have a Purview sensitivity label applied.",
      remediation: "Apply a Purview sensitivity label (Confidential or higher) from the Site Governance page.",
    },
    {
      key: "ownership",
      label: "Dual Ownership",
      weight: CRITERION_WEIGHTS.ownership,
      pass: ownerCount >= 2,
      description: "Workspace must have at least two active owners.",
      remediation: `Add a secondary owner. Currently ${ownerCount} owner${ownerCount === 1 ? "" : "s"} assigned.`,
    },
    {
      key: "metadata",
      label: "Governance Metadata Complete",
      weight: CRITERION_WEIGHTS.metadata,
      pass: metadataEval.pass,
      description: metadataDescription,
      remediation: metadataRemediation,
    },
    {
      key: "sharingPosture",
      label: "Sharing Posture Aligned",
      weight: CRITERION_WEIGHTS.sharingPosture,
      pass: !(workspace.sensitivity === "HIGHLY_CONFIDENTIAL" && workspace.externalSharing === true),
      description: "External sharing must be disabled on Highly Confidential workspaces.",
      remediation: "Disable external sharing or downgrade the sensitivity label.",
    },
    {
      key: "ownerAssigned",
      label: "Site Owner Assigned",
      weight: CRITERION_WEIGHTS.ownerAssigned,
      pass: !!(workspace.ownerDisplayName || workspace.ownerPrincipalName),
      description: "Workspace must have a named site owner.",
      remediation: "Assign a named site owner via Site Governance or SharePoint admin.",
    },
    {
      key: "notArchived",
      label: "Workspace Active",
      weight: CRITERION_WEIGHTS.notArchived,
      pass: !workspace.isArchived,
      description: "Archived workspaces are excluded from Copilot indexing by design.",
      remediation: "Unarchive the workspace if it should be Copilot-eligible.",
    },
    {
      key: "notDeleted",
      label: "Workspace Not Deleted",
      weight: CRITERION_WEIGHTS.notDeleted,
      pass: !workspace.isDeleted,
      description: "Soft-deleted workspaces cannot be Copilot-eligible.",
      remediation: "Restore the workspace from the recycle bin.",
    },
    {
      key: "labelEncryption",
      label: "No Blocking Encryption",
      weight: CRITERION_WEIGHTS.labelEncryption,
      // Highly Confidential labels usually carry encryption which blocks Copilot
      // indexing by design. We surface this as informational — Ready workspaces
      // should not be Highly Confidential by this model.
      pass: workspace.sensitivity !== "HIGHLY_CONFIDENTIAL",
      description: "Highly Confidential labels typically enforce encryption that blocks Copilot indexing.",
      remediation: "Downgrade to Confidential or add an explicit Copilot exclusion via customFields.copilot_excluded.",
    },
  ];

  return criteria;
}

function tierForScore(score: number, eligible: boolean): ReadinessTier {
  if (eligible) return "READY";
  if (score >= 80) return "NEARLY_READY";
  if (score >= 50) return "AT_RISK";
  return "BLOCKED";
}

function isExcluded(workspace: Workspace): { excluded: boolean; reason: string | null } {
  const customFields = (workspace as any).customFields as Record<string, any> | null | undefined;
  if (customFields && customFields.copilot_excluded === true) {
    return {
      excluded: true,
      reason: typeof customFields.copilot_exclusion_reason === "string"
        ? customFields.copilot_exclusion_reason
        : "Explicitly excluded via customFields.copilot_excluded",
    };
  }
  return { excluded: false, reason: null };
}

export function scoreWorkspace(
  workspace: Workspace,
  requiredMetadataFields: string[] = [],
): WorkspaceReadiness {
  const { excluded, reason } = isExcluded(workspace);
  const criteria = evaluateWorkspace(workspace, requiredMetadataFields);
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  const passedWeight = criteria.filter(c => c.pass).reduce((sum, c) => sum + c.weight, 0);
  const score = totalWeight === 0 ? 0 : Math.round((passedWeight / totalWeight) * 100);
  const blockers = criteria.filter(c => !c.pass);
  const eligible = !excluded && blockers.length === 0;

  let tier: ReadinessTier;
  if (excluded) tier = "EXCLUDED";
  else tier = tierForScore(score, eligible);

  // Remediation priority favors:
  //   - higher score (closer to eligibility)
  //   - fewer blockers
  //   - lower-weight remaining blockers (cheap fixes first)
  const remainingBlockerWeight = blockers.reduce((sum, c) => sum + c.weight, 0);
  const remediationPriority = excluded || eligible ? 0 : score - remainingBlockerWeight * 0.5;

  return {
    workspaceId: workspace.id,
    displayName: workspace.displayName,
    siteUrl: workspace.siteUrl ?? null,
    tenantConnectionId: workspace.tenantConnectionId ?? null,
    sensitivity: workspace.sensitivity,
    score,
    tier,
    eligible,
    excluded,
    exclusionReason: reason,
    criteria,
    blockers,
    passingCount: criteria.length - blockers.length,
    totalCount: criteria.length,
    remediationPriority,
  };
}

export function scoreWorkspaces(
  workspaces: Workspace[],
  requiredMetadataFieldsByTenantId: Record<string, string[]> = {},
): CopilotReadinessResult {
  const scored = workspaces.map((w) => {
    const fields = w.tenantConnectionId
      ? requiredMetadataFieldsByTenantId[w.tenantConnectionId] || []
      : [];
    return scoreWorkspace(w, fields);
  });

  const evaluated = scored.filter(s => !s.excluded);
  const ready = scored.filter(s => s.tier === "READY").length;
  const nearlyReady = scored.filter(s => s.tier === "NEARLY_READY").length;
  const atRisk = scored.filter(s => s.tier === "AT_RISK").length;
  const blocked = scored.filter(s => s.tier === "BLOCKED").length;
  const excluded = scored.filter(s => s.excluded).length;

  const averageScore = evaluated.length === 0
    ? 0
    : Math.round(evaluated.reduce((sum, s) => sum + s.score, 0) / evaluated.length);
  const readinessPercent = evaluated.length === 0
    ? 0
    : Math.round((ready / evaluated.length) * 100);

  // Aggregate blocker counts across non-excluded workspaces only.
  const blockerCounts: Record<string, { label: string; count: number }> = {};
  for (const s of evaluated) {
    for (const b of s.blockers) {
      if (!blockerCounts[b.key]) {
        blockerCounts[b.key] = { label: b.label, count: 0 };
      }
      blockerCounts[b.key].count++;
    }
  }
  const blockerBreakdown = Object.entries(blockerCounts)
    .map(([key, { label, count }]) => ({ key, label, count }))
    .sort((a, b) => b.count - a.count);

  // Remediation queue — top workspaces sorted by remediation priority.
  const remediationQueue = evaluated
    .filter(s => !s.eligible)
    .sort((a, b) => b.remediationPriority - a.remediationPriority)
    .slice(0, 50);

  const summary: OrgReadinessSummary = {
    totalWorkspaces: scored.length,
    evaluated: evaluated.length,
    excluded,
    ready,
    nearlyReady,
    atRisk,
    blocked,
    averageScore,
    readinessPercent,
    blockerBreakdown,
  };

  return { summary, workspaces: scored, remediationQueue };
}
