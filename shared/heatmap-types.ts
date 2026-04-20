/**
 * Content Intensity Heat Map — shared types
 *
 * Used by both `server/services/content-intensity-heatmap.ts` (producer) and
 * `client/src/pages/app/content-intensity-heatmap.tsx` (consumer).
 *
 * The heat map visualizes the IA hierarchy (Hub Site → Workspace → Library)
 * and colours cells by the percentile rank of each signal within its
 * hierarchy-level cohort. The aggregator returns a flat `nodes` map plus
 * `roots` so the UI can flatten lazily on expand/collapse.
 */

export type HierarchyLevel = "hub" | "workspace" | "library";

export type SignalGroup = "volume" | "activity" | "iaQuality";

/**
 * Each individual signal contributing to the composite intensity score.
 * Keep this list stable — signal ordering in the UI is derived from it.
 */
export type SignalKey =
  // Volume
  | "storageBytes"
  | "fileCount"
  | "libraryItemCount"
  // Activity
  | "lastActivityRecency"
  | "pageViewCount"
  | "activeFileCount"
  // IA quality / complexity
  | "maxFolderDepth"
  | "libraryTotalViews"
  | "columnFillRate"
  | "contentTypeAdoption"
  | "iaOffenderSignal";

export type SignalUnit = "bytes" | "count" | "days" | "percent" | "score";

export interface SignalDescriptor {
  key: SignalKey;
  group: SignalGroup;
  label: string;
  shortLabel: string;
  description: string;
  unit: SignalUnit;
  /** true when larger raw values should map to a hotter (higher) percentile. */
  higherIsHotter: boolean;
  /** Hierarchy levels where this signal is meaningful. */
  appliesTo: HierarchyLevel[];
}

export interface HeatmapSignalCell {
  key: SignalKey;
  /** Raw value in native units, or null if not available. */
  rawValue: number | null;
  /** 0..100 percentile rank within the level cohort; null if missing. */
  percentile: number | null;
  /** Number of non-null peers used to compute the percentile. */
  cohortSize: number;
}

export interface HeatmapNode {
  id: string;
  level: HierarchyLevel;
  displayName: string;
  parentId: string | null;
  siteUrl: string | null;
  tenantConnectionId: string | null;
  workspaceId?: string;
  libraryId?: string;
  hubSiteId?: string | null;
  signals: Partial<Record<SignalKey, HeatmapSignalCell>>;
  /** Mean of non-null signal percentiles; null when every signal is null. */
  compositeIntensity: number | null;
  /** Re-rank of composite within the same hierarchy level. */
  compositePercentile: number | null;
  childIds: string[];
}

export interface HeatmapCohortStat {
  count: number;
  min: number;
  max: number;
  median: number;
}

export interface HeatmapSnapshot {
  generatedAt: string;
  tenantConnectionId: string;
  signalDescriptors: SignalDescriptor[];
  /** Top-level node ids (hubs + virtual "(Unhubbed)" bucket). */
  roots: string[];
  nodes: Record<string, HeatmapNode>;
  cohortStats: Record<HierarchyLevel, Partial<Record<SignalKey, HeatmapCohortStat>>>;
  counts: { hubs: number; workspaces: number; libraries: number };
  /** true when the latest IA assessment run contributed data. */
  iaAssessmentIncluded: boolean;
}

export const VIRTUAL_UNHUBBED_ID = "hub:__unhubbed__";
