/**
 * Shared types for the BL-039 dataset freshness components. Mirrors the
 * server's DatasetFreshness shape from server/services/dataset-freshness.ts.
 */
export type FreshnessStatus = "fresh" | "warning" | "stale" | "never";

export interface DatasetFreshness {
  key: string;
  label: string;
  description: string;
  lastRefreshedAt: string | null;
  ageHours: number | null;
  status: FreshnessStatus;
  refreshJobType: string;
  isRefreshing: boolean;
  warningAfterHours: number;
  criticalAfterHours: number;
  dependsOn: string[];
}
