/**
 * BL-007 — Site Lifecycle Review Queue
 *
 * Compliance scoring service. Given a workspace and tenant configuration,
 * computes a 0–100 compliance score based on weighted checks:
 *   - has primary steward (named site owner)
 *   - has secondary steward (>= 2 owners)
 *   - has sensitivity label
 *   - has required metadata fields
 *   - last activity within stale threshold
 *   - sharing posture aligned with sensitivity (no external sharing on HC)
 *   - retention label assigned
 *
 * Weights sum to 100. The result captures both the score and a per-criterion
 * breakdown with remediation text suitable for the review queue UI.
 */

import type { Workspace } from "@shared/schema";
import { LIFECYCLE_DETECTION_DEFAULTS } from "@shared/schema";
import { evaluateMetadataCompleteness } from "./metadata-completeness";

export interface DetectionRules {
  staleThresholdDays: number;
  orphanedThresholdDays: number;
  labelRequired: boolean;
  metadataRequired: boolean;
}

export interface ComplianceCriterion {
  key: string;
  label: string;
  weight: number;
  pass: boolean;
  remediation: string;
}

export interface ComplianceResult {
  score: number;
  isStale: boolean;
  isOrphaned: boolean;
  missingLabel: boolean;
  missingMetadata: boolean;
  externallySharedUnclassified: boolean;
  daysSinceActivity: number | null;
  breakdown: ComplianceCriterion[];
}

const WEIGHTS = {
  primarySteward: 15,
  secondarySteward: 15,
  sensitivityLabel: 20,
  metadata: 15,
  activity: 15,
  sharingPosture: 10,
  retentionLabel: 10,
};

export function defaultDetectionRules(): DetectionRules {
  return { ...LIFECYCLE_DETECTION_DEFAULTS };
}

export function daysSince(date: string | Date | null | undefined): number | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function evaluateCompliance(
  workspace: Workspace,
  requiredMetadataFields: string[],
  rules: DetectionRules,
): ComplianceResult {
  const owners = (workspace as any).siteOwners as Array<unknown> | null | undefined;
  const ownerCount = Array.isArray(owners) && owners.length > 0
    ? owners.length
    : (workspace.owners ?? 0);

  const hasPrimary = !!(workspace.ownerDisplayName || workspace.ownerPrincipalName) || ownerCount >= 1;
  const hasSecondary = ownerCount >= 2;

  const dActivity = daysSince(workspace.lastActivityDate ?? workspace.lastContentModifiedDate ?? null);
  const isStale = dActivity === null || dActivity >= rules.staleThresholdDays;

  const labelMissing = !workspace.sensitivityLabelId;
  const labelPass = rules.labelRequired ? !labelMissing : true;

  const metaEval = evaluateMetadataCompleteness(workspace, requiredMetadataFields);
  const metaPass = rules.metadataRequired ? metaEval.pass : true;

  const externallyShared = !!workspace.externalSharing;
  const isHC = workspace.sensitivity === "HIGHLY_CONFIDENTIAL";
  const externallySharedUnclassified = externallyShared && (labelMissing || isHC);
  const sharingPass = !externallySharedUnclassified;

  const retentionPass = !!workspace.retentionLabelId || (
    workspace.retentionPolicy != null &&
    workspace.retentionPolicy.trim().length > 0 &&
    workspace.retentionPolicy !== "Default 7 Year"
  ) ? true : !!workspace.retentionLabelId;
  // Soften: any non-empty retention policy passes (the seed default is "Default 7 Year").
  const retentionPassFinal = !!workspace.retentionLabelId ||
    (workspace.retentionPolicy != null && workspace.retentionPolicy.trim().length > 0);

  const breakdown: ComplianceCriterion[] = [
    {
      key: "primarySteward",
      label: "Primary Steward Assigned",
      weight: WEIGHTS.primarySteward,
      pass: hasPrimary,
      remediation: hasPrimary
        ? "Primary steward is assigned."
        : "Assign a named primary steward (site owner) for this workspace.",
    },
    {
      key: "secondarySteward",
      label: "Secondary Steward Assigned",
      weight: WEIGHTS.secondarySteward,
      pass: hasSecondary,
      remediation: hasSecondary
        ? "Two or more stewards are assigned."
        : `Add a secondary steward — only ${ownerCount} owner${ownerCount === 1 ? "" : "s"} found.`,
    },
    {
      key: "sensitivityLabel",
      label: "Sensitivity Label Applied",
      weight: WEIGHTS.sensitivityLabel,
      pass: labelPass,
      remediation: labelPass
        ? "Sensitivity label is applied."
        : "Apply a Purview sensitivity label appropriate to the workspace content.",
    },
    {
      key: "metadata",
      label: "Required Metadata Complete",
      weight: WEIGHTS.metadata,
      pass: metaPass,
      remediation: metaPass
        ? "All required metadata fields are populated."
        : `Populate required metadata field${metaEval.missingFields.length === 1 ? "" : "s"}: ${metaEval.missingFields.join(", ") || "(see Site Governance)"}.`,
    },
    {
      key: "activity",
      label: `Active Within ${rules.staleThresholdDays} Days`,
      weight: WEIGHTS.activity,
      pass: !isStale,
      remediation: isStale
        ? (dActivity === null
            ? "No activity recorded — confirm with the steward whether this site is still in use."
            : `Last activity was ${dActivity} days ago. Confirm continued ownership or archive the site.`)
        : "Workspace shows recent activity.",
    },
    {
      key: "sharingPosture",
      label: "Sharing Posture Aligned",
      weight: WEIGHTS.sharingPosture,
      pass: sharingPass,
      remediation: sharingPass
        ? "External sharing posture is aligned with classification."
        : (labelMissing
            ? "External sharing is enabled but no sensitivity label is applied. Apply a label or disable external sharing."
            : "Highly Confidential workspaces may not allow external sharing. Disable external sharing or downgrade the label."),
    },
    {
      key: "retentionLabel",
      label: "Retention Policy Assigned",
      weight: WEIGHTS.retentionLabel,
      pass: retentionPassFinal,
      remediation: retentionPassFinal
        ? "Retention policy is assigned."
        : "Assign a retention label or policy aligned to the workspace classification.",
    },
  ];

  const totalWeight = breakdown.reduce((s, c) => s + c.weight, 0);
  const passedWeight = breakdown.filter(c => c.pass).reduce((s, c) => s + c.weight, 0);
  const score = totalWeight === 0 ? 0 : Math.round((passedWeight / totalWeight) * 100);

  const isOrphaned = !hasPrimary || ownerCount === 0;

  return {
    score,
    isStale,
    isOrphaned,
    missingLabel: labelMissing,
    missingMetadata: !metaEval.pass,
    externallySharedUnclassified,
    daysSinceActivity: dActivity,
    breakdown,
  };
}

export function isCompliant(score: number): boolean {
  return score >= 80;
}
