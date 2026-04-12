/**
 * Information Architecture Scoring Engine (Task #53)
 *
 * Deterministic pre-pass that computes raw dimension scores from the
 * workspace inventory plus library-level IA data (collected by Part A).
 * Produces a structured IAScoreResult consumed by the ia-assessment-service.ts
 * AI prompt assembly.
 *
 * Dimensions (weights sum to 100):
 *   1. Naming Consistency        (13) — prefix/pattern adherence
 *   2. Hub Governance            (13) — hub coverage, orphan ratio
 *   3. Metadata Completeness     (16) — owner presence, description fill, custom fields
 *   4. Sensitivity Coverage      (13) — label assignment rate by site type
 *   5. Lifecycle Management      (10) — archive ratio, stale site detection
 *   6. Library Structure         (12) — multi-lib adoption, folder depth, view usage, size imbalance
 *   7. Content Type Deployment   (13) — CT adoption rate, hub propagation, local duplication
 *   8. Metadata Schema           (10) — custom columns, required fields, fill rates, Syntex
 *
 * Dimensions 6–8 degrade gracefully to score=100 when no IA data has been
 * synced yet, so the overall score is never penalised for missing data.
 */

import type { Workspace, DocumentLibrary, LibraryColumn, LibraryContentType } from "@shared/schema";

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
    return emptyDimension("naming_consistency", "Naming Consistency", 13);
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
    weight: 13,
    score,
    weightedScore: Math.round(score * 0.13),
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
    return emptyDimension("hub_governance", "Hub Governance", 13);
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
    weight: 13,
    score,
    weightedScore: Math.round(score * 0.13),
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
    return emptyDimension("metadata_completeness", "Metadata Completeness", 16);
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
    weight: 16,
    score,
    weightedScore: Math.round(score * 0.16),
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
    weight: 13,
    score,
    weightedScore: Math.round(score * 0.13),
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
    return emptyDimension("lifecycle_management", "Lifecycle Management", 10);
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
    weight: 10,
    score,
    weightedScore: Math.round(score * 0.10),
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
// Library Structure
// ---------------------------------------------------------------------------

/**
 * Scores how well libraries are structured across the tenant.
 * Factors: multi-library adoption, default-lib overload, folder depth,
 *          view customisation, and size imbalance (flagged large items).
 *
 * Returns score=100 with a "not synced" summary when no library data is
 * available, so the overall IA score is never penalised for missing data.
 */
function scoreLibraryStructure(
  workspaces: Workspace[],
  libs: DocumentLibrary[],
): IADimensionScore {
  const WEIGHT = 12;

  if (libs.length === 0) {
    return {
      ...emptyDimension("library_structure", "Library Structure", WEIGHT),
      summary: "No library data synced yet — run an IA sync to collect library structure metrics.",
    };
  }

  const visibleLibs = libs.filter(l => !l.hidden);
  const totalLibs = visibleLibs.length;

  // ── Multi-library adoption ─────────────────────────────────────────────────
  // Sites with ≥2 non-default, visible libraries show deliberate IA design.
  const libsByWorkspace = new Map<string, DocumentLibrary[]>();
  for (const l of visibleLibs) {
    const arr = libsByWorkspace.get(l.workspaceId) ?? [];
    arr.push(l);
    libsByWorkspace.set(l.workspaceId, arr);
  }
  const totalSites = libsByWorkspace.size;
  let sitesWithMultiLib = 0;
  let sitesWithOnlyDefault = 0;
  for (const siteLibs of libsByWorkspace.values()) {
    const nonDefault = siteLibs.filter(l => !l.isDefaultDocLib);
    if (nonDefault.length >= 2) sitesWithMultiLib++;
    if (siteLibs.every(l => l.isDefaultDocLib)) sitesWithOnlyDefault++;
  }
  const multiLibRate = totalSites > 0 ? sitesWithMultiLib / totalSites : 0;
  const defaultOverloadRate = totalSites > 0 ? sitesWithOnlyDefault / totalSites : 0;

  // ── Folder depth ──────────────────────────────────────────────────────────
  // Ideal ≤ 3 levels. Penalise linearly from 4 up to 8+ (= 0 score).
  const libsWithDepth = visibleLibs.filter(l => l.maxFolderDepth != null);
  let folderDepthScore = 1.0; // default: full score when no data
  if (libsWithDepth.length > 0) {
    const avgDepth =
      libsWithDepth.reduce((s, l) => s + (l.maxFolderDepth ?? 0), 0) / libsWithDepth.length;
    folderDepthScore = avgDepth <= 3 ? 1.0 : Math.max(0, 1 - (avgDepth - 3) / 5);
  }
  const deepLibs = libsWithDepth.filter(l => (l.maxFolderDepth ?? 0) > 5);

  // ── View customisation ────────────────────────────────────────────────────
  // Libraries that have at least one custom view show user adoption.
  const libsWithViewData = visibleLibs.filter(l => l.totalViewCount != null && l.totalViewCount > 0);
  let viewCustomScore = 1.0; // default: full score when no data
  if (libsWithViewData.length > 0) {
    const withCustomViews = libsWithViewData.filter(l => (l.customViewCount ?? 0) > 0);
    viewCustomScore = withCustomViews.length / libsWithViewData.length;
  }

  // ── Size imbalance ────────────────────────────────────────────────────────
  // Libraries flagged for large items indicate unmanaged growth.
  const flaggedLargeCount = visibleLibs.filter(l => l.flaggedLargeItems).length;
  const sizeImbalanceRate = totalLibs > 0 ? flaggedLargeCount / totalLibs : 0;

  // ── Composite score ───────────────────────────────────────────────────────
  const raw = Math.round(
    (multiLibRate * 0.25 +
      (1 - defaultOverloadRate) * 0.20 +
      folderDepthScore * 0.30 +
      viewCustomScore * 0.15 +
      (1 - sizeImbalanceRate) * 0.10) *
      100,
  );
  const score = Math.max(0, Math.min(100, raw));

  // Worst offenders: deepest-folder libraries
  const offenders: IAOffender[] = deepLibs
    .sort((a, b) => (b.maxFolderDepth ?? 0) - (a.maxFolderDepth ?? 0))
    .slice(0, 10)
    .map(l => {
      const ws = workspaces.find(w => w.id === l.workspaceId);
      return {
        workspaceId: l.workspaceId,
        displayName: l.displayName,
        siteUrl: ws?.siteUrl ?? null,
        tenantConnectionId: l.tenantConnectionId,
        reason: `Folder depth ${l.maxFolderDepth} levels (recommended ≤ 5)`,
      };
    });

  const avgDepthDisplay =
    libsWithDepth.length > 0
      ? (libsWithDepth.reduce((s, l) => s + (l.maxFolderDepth ?? 0), 0) / libsWithDepth.length).toFixed(1)
      : "N/A";

  return {
    key: "library_structure",
    label: "Library Structure",
    weight: WEIGHT,
    score,
    weightedScore: Math.round(score * (WEIGHT / 100)),
    summary: `${totalLibs} visible libraries across ${totalSites} sites. ${sitesWithMultiLib} sites (${Math.round(multiLibRate * 100)}%) use ≥2 targeted libraries. Avg folder depth: ${avgDepthDisplay}. ${flaggedLargeCount} libraries flagged for large item counts.`,
    worstOffenders: offenders,
    metrics: {
      totalVisibleLibraries: totalLibs,
      totalSites,
      sitesWithMultiLib,
      multiLibAdoptionRate: Math.round(multiLibRate * 100),
      sitesWithOnlyDefaultLib: sitesWithOnlyDefault,
      defaultOverloadRate: Math.round(defaultOverloadRate * 100),
      avgFolderDepth: avgDepthDisplay,
      libsWithDepthData: libsWithDepth.length,
      deepLibraries: deepLibs.length,
      libsWithCustomViews: libsWithViewData.filter(l => (l.customViewCount ?? 0) > 0).length,
      flaggedLargeLibraries: flaggedLargeCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Content Type Deployment
// ---------------------------------------------------------------------------

/**
 * Scores how deliberately content types are deployed across libraries.
 * Factors: CT adoption rate, hub propagation, local duplication ratio,
 *          breadth (avg distinct custom CTs per library).
 */
function scoreContentTypeDeployment(
  workspaces: Workspace[],
  libs: DocumentLibrary[],
  libCTs: LibraryContentType[],
): IADimensionScore {
  const WEIGHT = 13;

  if (libCTs.length === 0) {
    return {
      ...emptyDimension("content_type_deployment", "Content Type Deployment", WEIGHT),
      summary: "No content type data synced yet — run an IA sync to collect content type metrics.",
    };
  }

  const visibleLibs = libs.filter(l => !l.hidden);
  const totalLibs = visibleLibs.length;
  if (totalLibs === 0) {
    return emptyDimension("content_type_deployment", "Content Type Deployment", WEIGHT);
  }

  // Only look at non-built-in, non-hidden CTs
  const customCTs = libCTs.filter(ct => !ct.isBuiltIn && !ct.hidden);

  // ── CT adoption ───────────────────────────────────────────────────────────
  // Libraries with ≥1 custom CT (good IA practice)
  const libsWithCustomCt = new Set(customCTs.map(ct => ct.documentLibraryId));
  const ctAdoptionRate = libsWithCustomCt.size / totalLibs;

  // ── Hub propagation ───────────────────────────────────────────────────────
  // Unique custom CT names that appear with scope=HUB (promoted from hub)
  const hubCtNames = new Set(customCTs.filter(ct => ct.scope === "HUB").map(ct => ct.name));
  const allCtNames = new Set(customCTs.map(ct => ct.name));
  const hubPropagationRate = allCtNames.size > 0 ? hubCtNames.size / allCtNames.size : 0;

  // ── Local duplication ─────────────────────────────────────────────────────
  // Libraries where every custom CT is scope=LIBRARY (locally defined, not
  // promoted). These are candidates for hub CT promotion.
  let localOnlyLibs = 0;
  for (const libId of libsWithCustomCt) {
    const libCustomCTs = customCTs.filter(ct => ct.documentLibraryId === libId);
    if (libCustomCTs.length > 0 && libCustomCTs.every(ct => ct.scope === "LIBRARY")) {
      localOnlyLibs++;
    }
  }
  const localDupRate = libsWithCustomCt.size > 0 ? localOnlyLibs / libsWithCustomCt.size : 0;

  // ── Breadth ───────────────────────────────────────────────────────────────
  // Libraries with ≥2 distinct custom CTs (mature, type-rich IA)
  let multiCtLibs = 0;
  for (const libId of libsWithCustomCt) {
    const count = customCTs.filter(ct => ct.documentLibraryId === libId).length;
    if (count >= 2) multiCtLibs++;
  }
  const multiCtRate = libsWithCustomCt.size > 0 ? multiCtLibs / libsWithCustomCt.size : 0;

  // ── Composite score ───────────────────────────────────────────────────────
  const raw = Math.round(
    (ctAdoptionRate * 0.40 +
      hubPropagationRate * 0.25 +
      (1 - localDupRate) * 0.25 +
      multiCtRate * 0.10) *
      100,
  );
  const score = Math.max(0, Math.min(100, raw));

  // Worst offenders: libraries with custom CTs all defined locally
  const localOnlyLibIds = Array.from(libsWithCustomCt).filter(libId => {
    const libCustomCTs = customCTs.filter(ct => ct.documentLibraryId === libId);
    return libCustomCTs.length > 0 && libCustomCTs.every(ct => ct.scope === "LIBRARY");
  });
  const offenders: IAOffender[] = localOnlyLibIds.slice(0, 10).map(libId => {
    const lib = visibleLibs.find(l => l.id === libId);
    const ws = workspaces.find(w => w.id === lib?.workspaceId);
    return {
      workspaceId: lib?.workspaceId ?? libId,
      displayName: lib?.displayName ?? libId,
      siteUrl: ws?.siteUrl ?? null,
      tenantConnectionId: lib?.tenantConnectionId ?? null,
      reason: "All custom content types are library-local — consider promoting to hub or site scope",
    };
  });

  return {
    key: "content_type_deployment",
    label: "Content Type Deployment",
    weight: WEIGHT,
    score,
    weightedScore: Math.round(score * (WEIGHT / 100)),
    summary: `${libsWithCustomCt.size} of ${totalLibs} libraries (${Math.round(ctAdoptionRate * 100)}%) have at least one custom content type. ${hubCtNames.size} of ${allCtNames.size} distinct types (${Math.round(hubPropagationRate * 100)}%) are hub-promoted. ${localOnlyLibs} libraries rely solely on library-local types.`,
    worstOffenders: offenders,
    metrics: {
      totalLibraries: totalLibs,
      libsWithCustomCt: libsWithCustomCt.size,
      ctAdoptionRate: Math.round(ctAdoptionRate * 100),
      totalUniqueCustomCts: allCtNames.size,
      hubPromotedCts: hubCtNames.size,
      hubPropagationRate: Math.round(hubPropagationRate * 100),
      localOnlyLibraries: localOnlyLibs,
      localDupRate: Math.round(localDupRate * 100),
      multiCtLibraries: multiCtLibs,
    },
  };
}

// ---------------------------------------------------------------------------
// Metadata Schema
// ---------------------------------------------------------------------------

/**
 * Scores the quality and enforcement of column-level metadata schemas.
 * Factors: custom column presence, required field enforcement, fill rates,
 *          Syntex/AI-managed columns, and display-name collisions.
 */
function scoreMetadataSchema(
  workspaces: Workspace[],
  libs: DocumentLibrary[],
  columns: LibraryColumn[],
): IADimensionScore {
  const WEIGHT = 10;

  if (columns.length === 0) {
    return {
      ...emptyDimension("metadata_schema", "Metadata Schema", WEIGHT),
      summary: "No column data synced yet — run an IA sync to collect column schema metrics.",
    };
  }

  const visibleLibs = libs.filter(l => !l.hidden);
  const totalLibs = visibleLibs.length;
  if (totalLibs === 0) {
    return emptyDimension("metadata_schema", "Metadata Schema", WEIGHT);
  }

  const customCols = columns.filter(c => c.isCustom && !c.isReadOnly && !c.isSealed);

  // ── Custom column presence ─────────────────────────────────────────────────
  // Libraries with ≥1 custom column show intent to capture metadata.
  const libsWithCustomCols = new Set(customCols.map(c => c.documentLibraryId));
  const customColAdoptionRate = libsWithCustomCols.size / totalLibs;

  // ── Required field enforcement ────────────────────────────────────────────
  // At least some required fields signal enforcement intent.
  const libsWithRequiredCols = new Set(
    customCols.filter(c => c.isRequired).map(c => c.documentLibraryId),
  );
  const requiredEnforcementRate =
    libsWithCustomCols.size > 0 ? libsWithRequiredCols.size / libsWithCustomCols.size : 0;

  // ── Fill rates ────────────────────────────────────────────────────────────
  // Average fill rate across custom columns that have been sampled.
  const colsWithFillData = customCols.filter(c => c.fillRatePct != null);
  let avgFillRate = 1.0; // default: full score when no fill data yet
  if (colsWithFillData.length > 0) {
    avgFillRate =
      colsWithFillData.reduce((s, c) => s + (c.fillRatePct ?? 0), 0) /
      colsWithFillData.length /
      100;
  }
  const lowFillCols = colsWithFillData.filter(c => (c.fillRatePct ?? 100) < 30);

  // ── Syntex / AI-managed ───────────────────────────────────────────────────
  // Presence of Syntex-managed columns signals advanced AI enrichment.
  const libsWithSyntex = new Set(columns.filter(c => c.isSyntexManaged).map(c => c.documentLibraryId));
  const syntexAdoptionRate = libsWithSyntex.size / totalLibs;
  // Syntex is a bonus but not required — cap contribution at 0.2
  const syntexBonus = Math.min(syntexAdoptionRate, 0.2) / 0.2;

  // ── Display-name collisions ───────────────────────────────────────────────
  // Same display name but different column types across libraries = confusion.
  const nameTypeMap = new Map<string, Set<string>>();
  for (const c of customCols) {
    const types = nameTypeMap.get(c.displayName) ?? new Set();
    types.add(c.columnType);
    nameTypeMap.set(c.displayName, types);
  }
  const collisionCount = Array.from(nameTypeMap.values()).filter(types => types.size > 1).length;
  const uniqueNames = nameTypeMap.size;
  const collisionRate = uniqueNames > 0 ? collisionCount / uniqueNames : 0;

  // ── Composite score ───────────────────────────────────────────────────────
  const raw = Math.round(
    (customColAdoptionRate * 0.25 +
      requiredEnforcementRate * 0.20 +
      avgFillRate * 0.30 +
      syntexBonus * 0.10 +
      (1 - collisionRate) * 0.15) *
      100,
  );
  const score = Math.max(0, Math.min(100, raw));

  // Worst offenders: custom columns with very low fill rates
  const offenders: IAOffender[] = lowFillCols
    .sort((a, b) => (a.fillRatePct ?? 0) - (b.fillRatePct ?? 0))
    .slice(0, 10)
    .map(c => {
      const lib = visibleLibs.find(l => l.id === c.documentLibraryId);
      const ws = workspaces.find(w => w.id === c.workspaceId);
      return {
        workspaceId: c.workspaceId,
        displayName: `${lib?.displayName ?? "?"} → ${c.displayName}`,
        siteUrl: ws?.siteUrl ?? null,
        tenantConnectionId: c.tenantConnectionId,
        reason: `Column "${c.displayName}" has only ${c.fillRatePct}% fill rate (sampled ${c.fillRateSampleSize ?? "?"} items)`,
      };
    });

  const avgFillDisplay =
    colsWithFillData.length > 0
      ? Math.round(colsWithFillData.reduce((s, c) => s + (c.fillRatePct ?? 0), 0) / colsWithFillData.length)
      : null;

  return {
    key: "metadata_schema",
    label: "Metadata Schema",
    weight: WEIGHT,
    score,
    weightedScore: Math.round(score * (WEIGHT / 100)),
    summary: `${libsWithCustomCols.size} of ${totalLibs} libraries (${Math.round(customColAdoptionRate * 100)}%) have custom columns. ${libsWithRequiredCols.size} enforce required fields. ${avgFillDisplay != null ? `Avg fill rate: ${avgFillDisplay}% across ${colsWithFillData.length} sampled columns.` : "Fill rates not yet sampled."} ${collisionCount} display-name collision(s) detected. ${libsWithSyntex.size} Syntex-enabled libraries.`,
    worstOffenders: offenders,
    metrics: {
      totalLibraries: totalLibs,
      libsWithCustomCols: libsWithCustomCols.size,
      customColAdoptionRate: Math.round(customColAdoptionRate * 100),
      totalCustomCols: customCols.length,
      libsWithRequiredCols: libsWithRequiredCols.size,
      requiredEnforcementRate: Math.round(requiredEnforcementRate * 100),
      colsWithFillData: colsWithFillData.length,
      avgFillRate: avgFillDisplay ?? "N/A",
      lowFillColumns: lowFillCols.length,
      syntexLibraries: libsWithSyntex.size,
      syntexAdoptionRate: Math.round(syntexAdoptionRate * 100),
      displayNameCollisions: collisionCount,
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

export function scoreIAHealth(
  workspaces: Workspace[],
  libs: DocumentLibrary[] = [],
  columns: LibraryColumn[] = [],
  libCTs: LibraryContentType[] = [],
): IAScoreResult {
  const dimensions: IADimensionScore[] = [
    scoreNamingConsistency(workspaces),
    scoreHubGovernance(workspaces),
    scoreMetadataCompleteness(workspaces),
    scoreSensitivityCoverage(workspaces),
    scoreLifecycleManagement(workspaces),
    scoreLibraryStructure(workspaces, libs),
    scoreContentTypeDeployment(workspaces, libs, libCTs),
    scoreMetadataSchema(workspaces, libs, columns),
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
