/**
 * Information Architecture Scoring Engine (Task #53)
 *
 * Deterministic pre-pass that computes raw dimension scores from the
 * workspace inventory. Produces a structured IAScoreResult consumed by
 * the ia-assessment-service.ts AI prompt assembly.
 *
 * Dimensions (weights sum to 100):
 *   1. Naming Consistency    (20) — prefix/pattern adherence
 *   2. Hub Governance        (20) — hub coverage, orphan ratio
 *   3. Metadata Completeness (25) — owner presence, description fill, custom fields
 *   4. Sensitivity Coverage  (20) — label assignment rate by site type
 *   5. Lifecycle Management  (15) — archive ratio, stale site detection
 */

import type { Workspace } from "@shared/schema";

export interface IADimensionScore {
  key: string;
  label: string;
  weight: number;
  score: number;
  /** 0–100 contribution to the overall health score. */
  weightedScore: number;
  summary: string;
  /** Up to 10 worst-offending sites for this dimension. */
  worstOffenders: IAOffender[];
  /** Raw metrics used for AI prompt context. */
  metrics: Record<string, number | string>;
}

export interface IAOffender {
  workspaceId: string;
  displayName: string;
  siteUrl: string | null;
  tenantConnectionId: string | null;
  reason: string;
}

export interface IAScoreResult {
  /** Overall IA health score (0–100). */
  overallScore: number;
  totalSites: number;
  evaluatedSites: number;
  dimensions: IADimensionScore[];
  /** Flat list of top-priority offenders across all dimensions (for AI prompt). */
  topOffenders: IAOffender[];
  /** Aggregated metrics injected into the AI prompt. */
  orgMetrics: Record<string, number | string>;
}

// ---------------------------------------------------------------------------
// Naming Consistency
// ---------------------------------------------------------------------------

const KNOWN_PREFIXES = ["DEAL-", "PORTCO-", "GEN-", "HR-", "IT-", "FIN-", "MKT-", "OPS-", "PROJ-", "DEPT-"];

function hasKnownPrefix(name: string): boolean {
  const upper = name.toUpperCase();
  return KNOWN_PREFIXES.some(p => upper.startsWith(p));
}

function hasProblematicPatterns(name: string): boolean {
  // Duplicate spaces, trailing/leading spaces (after trim), all-caps > 20 chars
  if (/\s{2,}/.test(name)) return true;
  if (name !== name.trim()) return true;
  if (name.length > 20 && name === name.toUpperCase()) return true;
  return false;
}

function scoreNamingConsistency(workspaces: Workspace[]): IADimensionScore {
  const active = workspaces.filter(w => !w.isArchived && !w.isDeleted);
  const total = active.length;

  if (total === 0) {
    return emptyDimension("naming_consistency", "Naming Consistency", 20);
  }

  const withPrefix = active.filter(w => hasKnownPrefix(w.displayName));
  const withProblems = active.filter(w => hasProblematicPatterns(w.displayName));
  const prefixRate = withPrefix.length / total;
  const problemRate = withProblems.length / total;

  // Score: prefix adherence (60%) + absence of problematic patterns (40%)
  const raw = Math.round((prefixRate * 0.6 + (1 - problemRate) * 0.4) * 100);
  const score = Math.max(0, Math.min(100, raw));

  const offenders: IAOffender[] = active
    .filter(w => !hasKnownPrefix(w.displayName) || hasProblematicPatterns(w.displayName))
    .slice(0, 10)
    .map(w => ({
      workspaceId: w.id,
      displayName: w.displayName,
      siteUrl: w.siteUrl ?? null,
      tenantConnectionId: w.tenantConnectionId ?? null,
      reason: !hasKnownPrefix(w.displayName)
        ? "No recognised naming prefix"
        : "Problematic naming pattern detected",
    }));

  return {
    key: "naming_consistency",
    label: "Naming Consistency",
    weight: 20,
    score,
    weightedScore: Math.round(score * 0.20),
    summary: `${withPrefix.length} of ${total} active sites (${Math.round(prefixRate * 100)}%) follow a known naming prefix. ${withProblems.length} sites have problematic patterns.`,
    worstOffenders: offenders,
    metrics: {
      totalActive: total,
      withKnownPrefix: withPrefix.length,
      prefixAdherenceRate: Math.round(prefixRate * 100),
      withProblematicPatterns: withProblems.length,
      problemPatternRate: Math.round(problemRate * 100),
    },
  };
}

// ---------------------------------------------------------------------------
// Hub Governance
// ---------------------------------------------------------------------------

function scoreHubGovernance(workspaces: Workspace[]): IADimensionScore {
  const active = workspaces.filter(w => !w.isArchived && !w.isDeleted);
  const total = active.length;

  if (total === 0) {
    return emptyDimension("hub_governance", "Hub Governance", 20);
  }

  const hubSites = active.filter(w => w.isHubSite);
  const associatedToHub = active.filter(w => !!w.hubSiteId || !!w.parentHubSiteId);
  // Orphans: not a hub site itself and not associated to any hub
  const orphans = active.filter(w => !w.isHubSite && !w.hubSiteId && !w.parentHubSiteId);

  const hubCount = hubSites.length;
  const associationRate = associatedToHub.length / total;
  const orphanRate = orphans.length / total;

  // Score: hub coverage (association rate, 70%) + low orphan presence (30%)
  const raw = Math.round((associationRate * 0.7 + (1 - orphanRate) * 0.3) * 100);
  const score = Math.max(0, Math.min(100, raw));

  const offenders: IAOffender[] = orphans.slice(0, 10).map(w => ({
    workspaceId: w.id,
    displayName: w.displayName,
    siteUrl: w.siteUrl ?? null,
    tenantConnectionId: w.tenantConnectionId ?? null,
    reason: "Site is not associated with any hub",
  }));

  return {
    key: "hub_governance",
    label: "Hub Governance",
    weight: 20,
    score,
    weightedScore: Math.round(score * 0.20),
    summary: `${hubCount} hub site(s) registered. ${associatedToHub.length} of ${total} sites (${Math.round(associationRate * 100)}%) are associated with a hub. ${orphans.length} orphaned site(s) with no hub membership.`,
    worstOffenders: offenders,
    metrics: {
      totalActive: total,
      hubSiteCount: hubCount,
      associatedToHub: associatedToHub.length,
      hubAssociationRate: Math.round(associationRate * 100),
      orphanedSites: orphans.length,
      orphanRate: Math.round(orphanRate * 100),
    },
  };
}

// ---------------------------------------------------------------------------
// Metadata Completeness
// ---------------------------------------------------------------------------

function scoreMetadataCompleteness(workspaces: Workspace[]): IADimensionScore {
  const active = workspaces.filter(w => !w.isArchived && !w.isDeleted);
  const total = active.length;

  if (total === 0) {
    return emptyDimension("metadata_completeness", "Metadata Completeness", 25);
  }

  const withOwner = active.filter(w => !!(w.ownerDisplayName || w.ownerPrincipalName));
  const withDescription = active.filter(w => !!w.description && w.description.trim().length > 0);
  const withDepartment = active.filter(w => !!w.department);
  const withCompleteMetadata = active.filter(w => w.metadataStatus === "COMPLETE");

  const ownerRate = withOwner.length / total;
  const descriptionRate = withDescription.length / total;
  const departmentRate = withDepartment.length / total;
  const completeRate = withCompleteMetadata.length / total;

  // Weighted: owner (35%) + metadata complete (35%) + description (15%) + dept (15%)
  const raw = Math.round(
    (ownerRate * 0.35 + completeRate * 0.35 + descriptionRate * 0.15 + departmentRate * 0.15) * 100
  );
  const score = Math.max(0, Math.min(100, raw));

  const offenders: IAOffender[] = active
    .filter(w => !w.ownerDisplayName && !w.ownerPrincipalName)
    .slice(0, 10)
    .map(w => ({
      workspaceId: w.id,
      displayName: w.displayName,
      siteUrl: w.siteUrl ?? null,
      tenantConnectionId: w.tenantConnectionId ?? null,
      reason: "No site owner assigned",
    }));

  return {
    key: "metadata_completeness",
    label: "Metadata Completeness",
    weight: 25,
    score,
    weightedScore: Math.round(score * 0.25),
    summary: `${withOwner.length}/${total} (${Math.round(ownerRate * 100)}%) have an owner. ${withCompleteMetadata.length}/${total} (${Math.round(completeRate * 100)}%) have complete metadata. ${withDescription.length}/${total} (${Math.round(descriptionRate * 100)}%) have a description.`,
    worstOffenders: offenders,
    metrics: {
      totalActive: total,
      withOwner: withOwner.length,
      ownerRate: Math.round(ownerRate * 100),
      withDescription: withDescription.length,
      descriptionRate: Math.round(descriptionRate * 100),
      withDepartment: withDepartment.length,
      departmentRate: Math.round(departmentRate * 100),
      withCompleteMetadata: withCompleteMetadata.length,
      metadataCompleteRate: Math.round(completeRate * 100),
    },
  };
}

// ---------------------------------------------------------------------------
// Sensitivity Coverage
// ---------------------------------------------------------------------------

function scoreSensitivityCoverage(workspaces: Workspace[]): IADimensionScore {
  const active = workspaces.filter(w => !w.isArchived && !w.isDeleted);
  const total = active.length;

  if (total === 0) {
    return emptyDimension("sensitivity_coverage", "Sensitivity Coverage", 20);
  }

  const withLabel = active.filter(w => !!w.sensitivityLabelId);
  const withoutLabel = active.filter(w => !w.sensitivityLabelId);

  // By site type
  const byType: Record<string, { total: number; labelled: number }> = {};
  for (const w of active) {
    const t = w.type || "UNKNOWN";
    if (!byType[t]) byType[t] = { total: 0, labelled: 0 };
    byType[t].total++;
    if (w.sensitivityLabelId) byType[t].labelled++;
  }

  const labelRate = withLabel.length / total;
  const score = Math.max(0, Math.min(100, Math.round(labelRate * 100)));

  const typeBreakdown = Object.entries(byType)
    .map(([type, { total: t, labelled: l }]) => `${type}: ${l}/${t}`)
    .join(", ");

  const offenders: IAOffender[] = withoutLabel.slice(0, 10).map(w => ({
    workspaceId: w.id,
    displayName: w.displayName,
    siteUrl: w.siteUrl ?? null,
    tenantConnectionId: w.tenantConnectionId ?? null,
    reason: "No Purview sensitivity label applied",
  }));

  return {
    key: "sensitivity_coverage",
    label: "Sensitivity Coverage",
    weight: 20,
    score,
    weightedScore: Math.round(score * 0.20),
    summary: `${withLabel.length} of ${total} active sites (${score}%) have a Purview sensitivity label. Breakdown by type: ${typeBreakdown}.`,
    worstOffenders: offenders,
    metrics: {
      totalActive: total,
      withSensitivityLabel: withLabel.length,
      labelCoverageRate: score,
      withoutLabel: withoutLabel.length,
      typeBreakdown,
    },
  };
}

// ---------------------------------------------------------------------------
// Lifecycle Management
// ---------------------------------------------------------------------------

function scoreLifecycleManagement(workspaces: Workspace[]): IADimensionScore {
  const total = workspaces.length;

  if (total === 0) {
    return emptyDimension("lifecycle_management", "Lifecycle Management", 15);
  }

  const archived = workspaces.filter(w => w.isArchived);
  const deleted = workspaces.filter(w => w.isDeleted);
  const active = workspaces.filter(w => !w.isArchived && !w.isDeleted);

  // Stale = lastActive is a date string more than 180 days ago, or "Never"
  const nowMs = Date.now();
  const STALE_THRESHOLD_DAYS = 180;
  const staleThresholdMs = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

  const staleSites = active.filter(w => {
    if (!w.lastActive || w.lastActive === "Never") return true;
    const d = new Date(w.lastActive);
    if (isNaN(d.getTime())) return false;
    return nowMs - d.getTime() > staleThresholdMs;
  });

  const staleRate = active.length > 0 ? staleSites.length / active.length : 0;
  const archiveRate = total > 0 ? archived.length / total : 0;

  // Score: penalise for stale sites (main indicator); bonus for proper archiving
  // A tenant with 0 stale sites and reasonable archiving should score 100
  const stalePenalty = staleRate;
  const raw = Math.round((1 - stalePenalty) * 100);
  const score = Math.max(0, Math.min(100, raw));

  const offenders: IAOffender[] = staleSites.slice(0, 10).map(w => ({
    workspaceId: w.id,
    displayName: w.displayName,
    siteUrl: w.siteUrl ?? null,
    tenantConnectionId: w.tenantConnectionId ?? null,
    reason: `Site appears stale (last active: ${w.lastActive || "Unknown"})`,
  }));

  return {
    key: "lifecycle_management",
    label: "Lifecycle Management",
    weight: 15,
    score,
    weightedScore: Math.round(score * 0.15),
    summary: `${staleSites.length} active site(s) appear stale (no activity in ${STALE_THRESHOLD_DAYS}+ days). ${archived.length} archived, ${deleted.length} soft-deleted.`,
    worstOffenders: offenders,
    metrics: {
      totalSites: total,
      activeSites: active.length,
      archivedSites: archived.length,
      archiveRate: Math.round(archiveRate * 100),
      deletedSites: deleted.length,
      staleSites: staleSites.length,
      staleRate: Math.round(staleRate * 100),
      staleThresholdDays: STALE_THRESHOLD_DAYS,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyDimension(key: string, label: string, weight: number): IADimensionScore {
  return {
    key,
    label,
    weight,
    score: 100,
    weightedScore: weight,
    summary: "No workspaces to evaluate.",
    worstOffenders: [],
    metrics: { totalActive: 0 },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function scoreIAHealth(workspaces: Workspace[]): IAScoreResult {
  const dimensions: IADimensionScore[] = [
    scoreNamingConsistency(workspaces),
    scoreHubGovernance(workspaces),
    scoreMetadataCompleteness(workspaces),
    scoreSensitivityCoverage(workspaces),
    scoreLifecycleManagement(workspaces),
  ];

  const totalWeight = dimensions.reduce((sum, d) => sum + d.weight, 0);
  const overallScore = totalWeight === 0
    ? 0
    : Math.round(dimensions.reduce((sum, d) => sum + d.weightedScore, 0));

  // Collect top offenders across all dimensions (deduplicated by workspaceId)
  const seenIds = new Set<string>();
  const topOffenders: IAOffender[] = [];
  for (const dim of dimensions) {
    for (const o of dim.worstOffenders) {
      if (!seenIds.has(o.workspaceId)) {
        seenIds.add(o.workspaceId);
        topOffenders.push(o);
      }
      if (topOffenders.length >= 20) break;
    }
    if (topOffenders.length >= 20) break;
  }

  const active = workspaces.filter(w => !w.isArchived && !w.isDeleted);

  const orgMetrics: Record<string, number | string> = {
    totalSites: workspaces.length,
    activeSites: active.length,
    archivedSites: workspaces.filter(w => w.isArchived).length,
    deletedSites: workspaces.filter(w => w.isDeleted).length,
    hubSites: active.filter(w => w.isHubSite).length,
    sitesWithExternalSharing: active.filter(w => w.externalSharing).length,
    overallIAHealthScore: overallScore,
  };

  return {
    overallScore,
    totalSites: workspaces.length,
    evaluatedSites: active.length,
    dimensions,
    topOffenders,
    orgMetrics,
  };
}
