/**
 * Content Intensity Heat Map — aggregator service
 *
 * Builds a HeatmapSnapshot from the existing workspace + document-library
 * inventory stored in the database.  No live Graph calls are made; the
 * service reads whatever has already been synced so the endpoint is fast.
 *
 * Algorithm:
 *  1. Load workspaces, document libraries, IA assessment run, library
 *     columns, and library content types for the tenant in parallel.
 *  2. Build enrichment maps: IA worst-offender counts per workspace,
 *     average column fill-rate per library, non-default CT count per library.
 *  3. Group workspaces by hub (isHubSite / hubSiteId) to form the
 *     Hub → Workspace → Library three-level hierarchy.
 *  4. For each node compute raw signal values from DB columns + enrichment maps.
 *  5. Percentile-rank each signal within its hierarchy-level cohort.
 *  6. Compute composite intensity = mean of non-null signal percentiles.
 *  7. Percentile-rank composite within its level.
 *  8. Return a HeatmapSnapshot with a flat nodes map + roots list.
 */

import { storage } from "../storage";
import type { Workspace, DocumentLibrary } from "@shared/schema";
import type {
  HeatmapSnapshot,
  HeatmapNode,
  HeatmapSignalCell,
  HeatmapCohortStat,
  SignalDescriptor,
  SignalKey,
  HierarchyLevel,
} from "@shared/heatmap-types";
import { VIRTUAL_UNHUBBED_ID } from "@shared/heatmap-types";
import { getLatestRunForTenant } from "./ia-assessment-service";

// ---------------------------------------------------------------------------
// Signal descriptors (single source of truth)
// ---------------------------------------------------------------------------

export const SIGNAL_DESCRIPTORS: SignalDescriptor[] = [
  {
    key: "storageBytes",
    group: "volume",
    label: "Storage Used",
    shortLabel: "Storage",
    description: "Total storage consumed by the site or library.",
    unit: "bytes",
    higherIsHotter: true,
    appliesTo: ["hub", "workspace", "library"],
  },
  {
    key: "fileCount",
    group: "volume",
    label: "File Count",
    shortLabel: "Files",
    description: "Total number of files in the site.",
    unit: "count",
    higherIsHotter: true,
    appliesTo: ["hub", "workspace"],
  },
  {
    key: "libraryItemCount",
    group: "volume",
    label: "Library Items",
    shortLabel: "Items",
    description: "Number of items in the document library.",
    unit: "count",
    higherIsHotter: true,
    appliesTo: ["library"],
  },
  {
    key: "lastActivityRecency",
    group: "activity",
    label: "Days Since Last Activity",
    shortLabel: "Recency",
    description: "Number of days since the last recorded activity. Fewer days = hotter.",
    unit: "days",
    higherIsHotter: false,
    appliesTo: ["hub", "workspace"],
  },
  {
    key: "pageViewCount",
    group: "activity",
    label: "Page Views",
    shortLabel: "Views",
    description: "Cumulative page view count reported by Microsoft 365.",
    unit: "count",
    higherIsHotter: true,
    appliesTo: ["hub", "workspace"],
  },
  {
    key: "activeFileCount",
    group: "activity",
    label: "Active Files",
    shortLabel: "Active",
    description: "Files accessed or modified in the last 30 days.",
    unit: "count",
    higherIsHotter: true,
    appliesTo: ["hub", "workspace"],
  },
  {
    key: "maxFolderDepth",
    group: "iaQuality",
    label: "Max Folder Depth",
    shortLabel: "Depth",
    description: "Deepest folder nesting level in the library. Deeper = worse IA.",
    unit: "count",
    higherIsHotter: true,
    appliesTo: ["library"],
  },
  {
    key: "libraryTotalViews",
    group: "iaQuality",
    label: "Library Total Views",
    shortLabel: "Lib Views",
    description: "Total view count across all library views.",
    unit: "count",
    higherIsHotter: true,
    appliesTo: ["library"],
  },
  {
    key: "columnFillRate",
    group: "iaQuality",
    label: "Column Fill Rate",
    shortLabel: "Fill %",
    description: "Estimated percentage of items with metadata columns populated.",
    unit: "percent",
    higherIsHotter: true,
    appliesTo: ["library"],
  },
  {
    key: "contentTypeAdoption",
    group: "iaQuality",
    label: "Content Type Adoption",
    shortLabel: "CT Adopt",
    description: "Whether non-default content types are deployed in the library.",
    unit: "score",
    higherIsHotter: true,
    appliesTo: ["library"],
  },
  {
    key: "iaOffenderSignal",
    group: "iaQuality",
    label: "IA Offender Score",
    shortLabel: "IA Score",
    description:
      "Workspace: derived from IA Assessment worst-offender flags across all dimensions. " +
      "Library: structural flag penalties (large items, version sprawl, hidden). " +
      "Higher value = more issues = hotter.",
    unit: "score",
    higherIsHotter: true,
    appliesTo: ["workspace", "library"],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Days between two ISO date strings (or null if either is missing). */
function daysSince(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return null;
  const diff = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.round(diff));
}

/** Percentile rank of `value` in a sorted ascending array (0–100). */
function percentileRank(sortedAsc: number[], value: number): number {
  if (sortedAsc.length === 0) return 50;
  const below = sortedAsc.filter(v => v < value).length;
  const equal = sortedAsc.filter(v => v === value).length;
  return Math.round(((below + 0.5 * equal) / sortedAsc.length) * 100);
}

function cohortStat(values: number[]): HeatmapCohortStat {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    median,
  };
}

// ---------------------------------------------------------------------------
// Signal extractors
// ---------------------------------------------------------------------------

function workspaceSignals(
  ws: Workspace,
  iaOffenderCountByWsId: Map<string, number>,
  totalDimensions: number,
): Partial<Record<SignalKey, number | null>> {
  // iaOffenderSignal: fraction of IA dimensions that flag this workspace as a
  // worst-offender (0 = clean, 100 = flagged by every dimension).
  // Only populated when an IA Assessment run is available.
  let iaOffenderSignal: number | null = null;
  if (totalDimensions > 0) {
    const count = iaOffenderCountByWsId.get(ws.id) ?? 0;
    iaOffenderSignal = Math.round((count / totalDimensions) * 100);
  }

  return {
    storageBytes: ws.storageUsedBytes ?? null,
    fileCount: ws.fileCount ?? null,
    lastActivityRecency: daysSince(ws.lastActivityDate),
    pageViewCount: ws.pageViewCount ?? null,
    activeFileCount: ws.activeFileCount ?? null,
    iaOffenderSignal,
  };
}

// Penalty weights for IA offender score (higher = hotter / worse)
const IA_LARGE_ITEMS_PENALTY = 30;
const IA_VERSION_SPRAWL_PENALTY = 40;
const IA_HIDDEN_LIBRARY_PENALTY = 10;

function librarySignals(
  lib: DocumentLibrary,
  avgFillRatePctByLibId: Map<string, number>,
  nonDefaultCtCountByLibId: Map<string, number>,
): Partial<Record<SignalKey, number | null>> {
  // columnFillRate: real average fill-rate from library_columns.fill_rate_pct
  // (custom columns only, averaged across all that have a measured fill rate).
  const columnFillRate = avgFillRatePctByLibId.get(lib.id) ?? null;

  // contentTypeAdoption: score derived from real library_content_types count.
  // Non-builtin, non-hidden CTs indicate active content type governance.
  // 0 non-default CTs → 0, 1 → ~33, 2 → ~66, 3+ → 100 (capped).
  const nonDefaultCtCount = nonDefaultCtCountByLibId.get(lib.id);
  const contentTypeAdoption =
    nonDefaultCtCount !== undefined
      ? Math.min(Math.round((nonDefaultCtCount / 3) * 100), 100)
      : null;

  // iaOffenderSignal: starts at 0, adds penalties for structural flags.
  // Higher = more issues = hotter (consistent with higherIsHotter: true).
  let iaOffenderSignal = 0;
  if (lib.flaggedLargeItems) iaOffenderSignal += IA_LARGE_ITEMS_PENALTY;
  if (lib.flaggedVersionSprawl) iaOffenderSignal += IA_VERSION_SPRAWL_PENALTY;
  if (lib.hidden) iaOffenderSignal += IA_HIDDEN_LIBRARY_PENALTY;

  return {
    storageBytes: lib.storageUsedBytes ?? null,
    libraryItemCount: lib.itemCount ?? null,
    maxFolderDepth: lib.maxFolderDepth ?? null,
    libraryTotalViews: lib.totalViewCount ?? null,
    columnFillRate,
    contentTypeAdoption,
    iaOffenderSignal,
  };
}

// ---------------------------------------------------------------------------
// Percentile computation per level
// ---------------------------------------------------------------------------

function computePercentiles(
  nodes: HeatmapNode[],
  level: HierarchyLevel,
): void {
  const levelNodes = nodes.filter(n => n.level === level);
  if (levelNodes.length === 0) return;

  // Collect valid raw values per signal
  const rawMap: Partial<Record<SignalKey, number[]>> = {};
  for (const node of levelNodes) {
    for (const [key, cell] of Object.entries(node.signals) as [SignalKey, HeatmapSignalCell][]) {
      if (cell.rawValue == null) continue;
      (rawMap[key] ||= []).push(cell.rawValue);
    }
  }

  for (const node of levelNodes) {
    for (const key of Object.keys(node.signals) as SignalKey[]) {
      const cell = node.signals[key]!;
      const sorted = rawMap[key];
      if (sorted == null || cell.rawValue == null) continue;

      const sortedAsc = [...sorted].sort((a, b) => a - b);
      const descriptor = SIGNAL_DESCRIPTORS.find(d => d.key === key);
      let pct = percentileRank(sortedAsc, cell.rawValue);

      // Invert if lower raw → hotter
      if (descriptor && !descriptor.higherIsHotter) {
        pct = 100 - pct;
      }

      cell.percentile = pct;
      cell.cohortSize = sorted.length;
    }
  }
}

// ---------------------------------------------------------------------------
// Hub rollup: aggregate workspace signals to hub level
// ---------------------------------------------------------------------------

function rollupHubSignals(
  hubNode: HeatmapNode,
  workspaceNodes: HeatmapNode[],
): void {
  const children = workspaceNodes.filter(n => hubNode.childIds.includes(n.id));
  if (children.length === 0) return;

  const signalKeys: SignalKey[] = [
    "storageBytes",
    "fileCount",
    "lastActivityRecency",
    "pageViewCount",
    "activeFileCount",
  ];

  for (const key of signalKeys) {
    const values = children
      .map(c => c.signals[key]?.rawValue ?? null)
      .filter((v): v is number => v !== null);

    if (values.length === 0) {
      hubNode.signals[key] = { key, rawValue: null, percentile: null, cohortSize: 0 };
      continue;
    }

    const total = values.reduce((a, b) => a + b, 0);
    hubNode.signals[key] = { key, rawValue: total, percentile: null, cohortSize: 0 };
  }
}

// ---------------------------------------------------------------------------
// Composite intensity
// ---------------------------------------------------------------------------

function computeComposite(node: HeatmapNode): void {
  const percentiles = Object.values(node.signals)
    .map(c => c.percentile)
    .filter((p): p is number => p !== null);

  if (percentiles.length === 0) {
    node.compositeIntensity = null;
    return;
  }

  node.compositeIntensity = Math.round(
    percentiles.reduce((a, b) => a + b, 0) / percentiles.length,
  );
}

function computeCompositePercentiles(nodes: HeatmapNode[], level: HierarchyLevel): void {
  const levelNodes = nodes.filter(n => n.level === level && n.compositeIntensity != null);
  if (levelNodes.length === 0) return;

  const sorted = levelNodes
    .map(n => n.compositeIntensity!)
    .sort((a, b) => a - b);

  for (const node of levelNodes) {
    node.compositePercentile = percentileRank(sorted, node.compositeIntensity!);
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function buildHeatmapSnapshot(
  tenantConnectionId: string,
): Promise<HeatmapSnapshot> {
  const [workspaces, libraries, iaRun, libContentTypes, libColumns] = await Promise.all([
    storage.getWorkspaces(undefined, tenantConnectionId),
    storage.getDocumentLibrariesByTenant(tenantConnectionId),
    getLatestRunForTenant(tenantConnectionId),
    storage.getLibraryContentTypesByTenant(tenantConnectionId),
    storage.getLibraryColumnsByTenant(tenantConnectionId),
  ]);

  // ── Build enrichment maps ─────────────────────────────────────────────────

  // IA worst-offender counts per workspaceId (from latest completed IA run)
  const iaOffenderCountByWsId = new Map<string, number>();
  const totalDimensions = iaRun?.dimensions?.length ?? 0;
  if (iaRun?.dimensions) {
    for (const dim of iaRun.dimensions) {
      for (const offender of dim.worstOffenders) {
        iaOffenderCountByWsId.set(
          offender.workspaceId,
          (iaOffenderCountByWsId.get(offender.workspaceId) ?? 0) + 1,
        );
      }
    }
  }

  // Average column fill-rate per library (custom columns with a measured fill rate)
  const fillRateSumByLibId = new Map<string, number>();
  const fillRateCountByLibId = new Map<string, number>();
  for (const col of libColumns) {
    if (col.isCustom && col.fillRatePct != null) {
      fillRateSumByLibId.set(col.documentLibraryId, (fillRateSumByLibId.get(col.documentLibraryId) ?? 0) + col.fillRatePct);
      fillRateCountByLibId.set(col.documentLibraryId, (fillRateCountByLibId.get(col.documentLibraryId) ?? 0) + 1);
    }
  }
  const avgFillRatePctByLibId = new Map<string, number>();
  for (const [libId, sum] of fillRateSumByLibId) {
    const n = fillRateCountByLibId.get(libId) ?? 1;
    avgFillRatePctByLibId.set(libId, Math.round(sum / n));
  }

  // Non-default content types per library (non-builtin, non-hidden)
  const nonDefaultCtCountByLibId = new Map<string, number>();
  for (const ct of libContentTypes) {
    if (!ct.isBuiltIn && !ct.hidden) {
      nonDefaultCtCountByLibId.set(
        ct.documentLibraryId,
        (nonDefaultCtCountByLibId.get(ct.documentLibraryId) ?? 0) + 1,
      );
    }
  }

  const nodes: Record<string, HeatmapNode> = {};

  // ── Step 1: Create workspace nodes ──────────────────────────────────────
  for (const ws of workspaces) {
    const rawSignals = workspaceSignals(ws, iaOffenderCountByWsId, totalDimensions);
    const signals: Partial<Record<SignalKey, HeatmapSignalCell>> = {};
    for (const [k, v] of Object.entries(rawSignals) as [SignalKey, number | null][]) {
      signals[k] = { key: k, rawValue: v, percentile: null, cohortSize: 0 };
    }
    nodes[`ws:${ws.id}`] = {
      id: `ws:${ws.id}`,
      level: "workspace",
      displayName: ws.displayName || ws.id,
      parentId: null, // filled in hub step
      siteUrl: ws.siteUrl ?? null,
      tenantConnectionId,
      workspaceId: ws.id,
      hubSiteId: ws.hubSiteId ?? null,
      signals,
      compositeIntensity: null,
      compositePercentile: null,
      childIds: [],
    };
  }

  // ── Step 2: Create library nodes ─────────────────────────────────────────
  for (const lib of libraries) {
    const rawSignals = librarySignals(lib, avgFillRatePctByLibId, nonDefaultCtCountByLibId);
    const signals: Partial<Record<SignalKey, HeatmapSignalCell>> = {};
    for (const [k, v] of Object.entries(rawSignals) as [SignalKey, number | null][]) {
      signals[k] = { key: k, rawValue: v, percentile: null, cohortSize: 0 };
    }
    const wsNodeId = `ws:${lib.workspaceId}`;
    const nodeId = `lib:${lib.id}`;
    nodes[nodeId] = {
      id: nodeId,
      level: "library",
      displayName: lib.displayName,
      parentId: wsNodeId,
      siteUrl: lib.webUrl ?? null,
      tenantConnectionId,
      workspaceId: lib.workspaceId,
      libraryId: lib.id,
      signals,
      compositeIntensity: null,
      compositePercentile: null,
      childIds: [],
    };
    if (nodes[wsNodeId]) {
      nodes[wsNodeId].childIds.push(nodeId);
    }
  }

  // ── Step 3: Create hub nodes & link workspaces ───────────────────────────
  const hubWorkspaces = workspaces.filter(ws => ws.isHubSite);
  const unhubbedIds: string[] = [];

  for (const hubWs of hubWorkspaces) {
    const hubNodeId = `hub:${hubWs.id}`;
    nodes[hubNodeId] = {
      id: hubNodeId,
      level: "hub",
      displayName: hubWs.displayName || hubWs.id,
      parentId: null,
      siteUrl: hubWs.siteUrl ?? null,
      tenantConnectionId,
      workspaceId: hubWs.id,
      hubSiteId: hubWs.id,
      signals: {},
      compositeIntensity: null,
      compositePercentile: null,
      childIds: [],
    };
  }

  // Link workspaces to their hubs
  for (const ws of workspaces) {
    const wsNodeId = `ws:${ws.id}`;
    if (ws.hubSiteId) {
      const hubNodeId = `hub:${ws.hubSiteId}`;
      if (nodes[hubNodeId]) {
        nodes[hubNodeId].childIds.push(wsNodeId);
        nodes[wsNodeId].parentId = hubNodeId;
      } else {
        unhubbedIds.push(wsNodeId);
      }
    } else if (!ws.isHubSite) {
      unhubbedIds.push(wsNodeId);
    }
  }

  // Virtual unhubbed bucket (only create if there are unhubbed workspaces)
  let roots: string[] = hubWorkspaces.map(hw => `hub:${hw.id}`);

  if (unhubbedIds.length > 0) {
    nodes[VIRTUAL_UNHUBBED_ID] = {
      id: VIRTUAL_UNHUBBED_ID,
      level: "hub",
      displayName: "(Unhubbed)",
      parentId: null,
      siteUrl: null,
      tenantConnectionId,
      signals: {},
      compositeIntensity: null,
      compositePercentile: null,
      childIds: unhubbedIds,
    };
    for (const wsId of unhubbedIds) {
      if (nodes[wsId]) nodes[wsId].parentId = VIRTUAL_UNHUBBED_ID;
    }
    roots.push(VIRTUAL_UNHUBBED_ID);
  }

  // ── Step 4: Roll up hub signal totals ────────────────────────────────────
  const allNodes = Object.values(nodes);
  const wsNodes = allNodes.filter(n => n.level === "workspace");
  for (const hubNode of allNodes.filter(n => n.level === "hub")) {
    rollupHubSignals(hubNode, wsNodes);
  }

  // ── Step 5: Percentile-rank each level ───────────────────────────────────
  computePercentiles(allNodes, "hub");
  computePercentiles(allNodes, "workspace");
  computePercentiles(allNodes, "library");

  // ── Step 6: Composite intensity per node ─────────────────────────────────
  for (const node of allNodes) {
    computeComposite(node);
  }

  // ── Step 7: Composite percentile per level ───────────────────────────────
  computeCompositePercentiles(allNodes, "hub");
  computeCompositePercentiles(allNodes, "workspace");
  computeCompositePercentiles(allNodes, "library");

  // ── Step 8: Cohort stats ─────────────────────────────────────────────────
  const levels: HierarchyLevel[] = ["hub", "workspace", "library"];
  const cohortStats: HeatmapSnapshot["cohortStats"] = {
    hub: {},
    workspace: {},
    library: {},
  };

  for (const level of levels) {
    const levelNodes = allNodes.filter(n => n.level === level);
    const allKeys = new Set<SignalKey>();
    for (const n of levelNodes) {
      for (const k of Object.keys(n.signals) as SignalKey[]) allKeys.add(k);
    }
    for (const key of allKeys) {
      const vals = levelNodes
        .map(n => n.signals[key]?.rawValue ?? null)
        .filter((v): v is number => v !== null);
      if (vals.length > 0) {
        cohortStats[level][key] = cohortStat(vals);
      }
    }
  }

  const hubNodes = allNodes.filter(n => n.level === "hub" && n.id !== VIRTUAL_UNHUBBED_ID);
  const wsAll = allNodes.filter(n => n.level === "workspace");
  const libAll = allNodes.filter(n => n.level === "library");

  // Check if an IA assessment run is present for the tenant.
  const iaAssessmentIncluded = iaRun != null;

  return {
    generatedAt: new Date().toISOString(),
    tenantConnectionId,
    signalDescriptors: SIGNAL_DESCRIPTORS,
    roots,
    nodes,
    cohortStats,
    counts: {
      hubs: hubNodes.length,
      workspaces: wsAll.length,
      libraries: libAll.length,
    },
    iaAssessmentIncluded,
  };
}
