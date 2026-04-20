/**
 * BL-039 — Dataset Freshness Registry.
 *
 * Declarative map of every "dataset" (user inventory, workspace list,
 * sharing links, etc.) with its staleness thresholds and a pointer to the
 * refresh job type. Any UI that runs a report or assessment can ask:
 *
 *   "Are the datasets this report depends on fresh enough?"
 *
 * Backed by `scheduled_job_runs` — `getLastRefreshedAt` looks for the most
 * recent *completed* run of the refresh job for a given tenant. Fall-backs
 * into the per-service run tables are registered here too, so freshness
 * works before every legacy job has been fully retrofitted onto trackJobRun.
 */
import { storage } from "../storage";
import type { JobType } from "@shared/schema";
import { jobRegistry } from "./job-registry";

export type FreshnessStatus = "fresh" | "warning" | "stale" | "never";

export interface DatasetDefinition {
  key: string;
  label: string;
  description: string;
  staleness: {
    warningAfterHours: number;
    criticalAfterHours: number;
  };
  refreshJobType: JobType;
  /** Dataset keys this one depends on (transitively trigger refreshes). */
  dependsOn?: string[];
  /**
   * Resolves the timestamp of the most recent successful refresh for this
   * tenant. Returning null means "never synced".
   */
  getLastRefreshedAt: (tenantConnectionId: string) => Promise<Date | null>;
}

export interface DatasetFreshness {
  key: string;
  label: string;
  description: string;
  lastRefreshedAt: string | null;
  ageHours: number | null;
  status: FreshnessStatus;
  refreshJobType: JobType;
  isRefreshing: boolean;
  warningAfterHours: number;
  criticalAfterHours: number;
  dependsOn: string[];
}

/**
 * Helper: prefer scheduled_job_runs (the unified trail) but fall back to
 * a per-service tracker for jobs that haven't been retrofitted yet. This
 * keeps freshness reporting accurate during the Phase-2 rollout.
 */
async function getLatestCompletion(
  tenantConnectionId: string,
  jobType: JobType,
  legacy?: () => Promise<Date | null>,
): Promise<Date | null> {
  const fromRegistry = await storage.getLatestCompletedJobRun(tenantConnectionId, jobType);
  if (fromRegistry) return fromRegistry;
  if (legacy) return legacy();
  return null;
}

export const DATASETS: DatasetDefinition[] = [
  {
    key: "workspaces",
    label: "Workspace Inventory",
    description: "Sites, groups, usage metrics, sensitivity labels",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "tenantSync",
    getLastRefreshedAt: (tcId) =>
      getLatestCompletion(tcId, "tenantSync", async () => {
        const conn = await storage.getTenantConnection(tcId);
        return conn?.lastSyncAt ?? null;
      }),
  },
  {
    key: "userInventory",
    label: "User Directory Cache",
    description: "Entra ID users — names, UPNs, departments",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "userInventory",
    getLastRefreshedAt: (tcId) =>
      getLatestCompletion(tcId, "userInventory", async () => {
        const run = await storage.getLatestUserInventoryRun(tcId);
        return run?.completedAt ?? null;
      }),
  },
  {
    key: "sharingLinks",
    label: "Sharing Link Scan",
    description: "External, anonymous, and org-wide sharing links",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "sharingLinkDiscovery",
    dependsOn: ["workspaces"],
    getLastRefreshedAt: (tcId) =>
      getLatestCompletion(tcId, "sharingLinkDiscovery", async () => {
        const run = await storage.getLatestSharingLinkDiscoveryRun(tcId);
        return run?.completedAt ?? null;
      }),
  },
  {
    key: "copilotInteractions",
    label: "Copilot Interactions",
    description: "User prompts and AI responses from M365 Copilot",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "copilotSync",
    getLastRefreshedAt: (tcId) =>
      getLatestCompletion(tcId, "copilotSync", async () => {
        const run = await storage.getLatestCopilotSyncRun(tcId);
        return run?.completedAt ?? null;
      }),
  },
  {
    key: "copilotAssessments",
    label: "Copilot Prompt Assessments",
    description: "AI-scored Copilot interaction assessments",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "copilotAssessment",
    dependsOn: ["copilotInteractions"],
    getLastRefreshedAt: (tcId) =>
      getLatestCompletion(tcId, "copilotAssessment"),
  },
  {
    key: "onedriveInventory",
    label: "OneDrive Inventory",
    description: "Per-user OneDrive storage, file count, activity",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "oneDriveInventory",
    getLastRefreshedAt: (tcId) => getLatestCompletion(tcId, "oneDriveInventory"),
  },
  {
    key: "teamsInventory",
    label: "Teams & Channels Inventory",
    description: "Teams, channels, membership, privacy",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "teamsInventory",
    getLastRefreshedAt: (tcId) => getLatestCompletion(tcId, "teamsInventory"),
  },
  {
    key: "recordings",
    label: "Teams Recordings",
    description: "Meeting recordings stored in OneDrive/SharePoint",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "teamsRecordings",
    dependsOn: ["teamsInventory"],
    getLastRefreshedAt: (tcId) => getLatestCompletion(tcId, "teamsRecordings"),
  },
  {
    key: "iaColumns",
    label: "Information Architecture — Columns",
    description: "SharePoint content types and site columns",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "iaSync",
    getLastRefreshedAt: (tcId) => getLatestCompletion(tcId, "iaSync"),
  },
  {
    key: "iaAssessment",
    label: "IA Health Assessment",
    description: "Scored information-architecture health report",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "iaAssessment",
    dependsOn: ["workspaces", "iaColumns"],
    getLastRefreshedAt: (tcId) => getLatestCompletion(tcId, "iaAssessment"),
  },
  {
    key: "emailStorageReport",
    label: "Email Storage Report",
    description: "Per-user mailbox size and growth telemetry",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "emailStorageReport",
    dependsOn: ["userInventory"],
    getLastRefreshedAt: (tcId) => getLatestCompletion(tcId, "emailStorageReport"),
  },
  {
    key: "governanceSnapshot",
    label: "Governance Snapshot",
    description: "Point-in-time tenant governance state",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "governanceSnapshot",
    dependsOn: ["workspaces", "sharingLinks"],
    getLastRefreshedAt: (tcId) => getLatestCompletion(tcId, "governanceSnapshot"),
  },
  {
    key: "licenses",
    label: "License Assignments",
    description: "Entra/M365 license SKUs assigned per user",
    staleness: { warningAfterHours: 168, criticalAfterHours: 336 },
    refreshJobType: "licenseSync",
    getLastRefreshedAt: (tcId) => getLatestCompletion(tcId, "licenseSync"),
  },
];

const DATASETS_BY_KEY = new Map(DATASETS.map((d) => [d.key, d]));

export function getDatasetDefinition(key: string): DatasetDefinition | undefined {
  return DATASETS_BY_KEY.get(key);
}

function computeStatus(
  lastRefreshedAt: Date | null,
  warningAfterHours: number,
  criticalAfterHours: number,
): { status: FreshnessStatus; ageHours: number | null } {
  if (!lastRefreshedAt) return { status: "never", ageHours: null };
  const ageHours = (Date.now() - lastRefreshedAt.getTime()) / 3_600_000;
  if (ageHours >= criticalAfterHours) return { status: "stale", ageHours };
  if (ageHours >= warningAfterHours) return { status: "warning", ageHours };
  return { status: "fresh", ageHours };
}

export async function getDatasetFreshness(
  tenantConnectionId: string,
  datasetKey: string,
): Promise<DatasetFreshness | null> {
  const def = DATASETS_BY_KEY.get(datasetKey);
  if (!def) return null;

  const lastRefreshedAt = await def.getLastRefreshedAt(tenantConnectionId);
  const { status, ageHours } = computeStatus(
    lastRefreshedAt,
    def.staleness.warningAfterHours,
    def.staleness.criticalAfterHours,
  );

  return {
    key: def.key,
    label: def.label,
    description: def.description,
    lastRefreshedAt: lastRefreshedAt ? lastRefreshedAt.toISOString() : null,
    ageHours: ageHours == null ? null : Number(ageHours.toFixed(2)),
    status,
    refreshJobType: def.refreshJobType,
    isRefreshing: jobRegistry.isRunning(def.refreshJobType, tenantConnectionId),
    warningAfterHours: def.staleness.warningAfterHours,
    criticalAfterHours: def.staleness.criticalAfterHours,
    dependsOn: def.dependsOn ?? [],
  };
}

export async function getAllDatasetFreshness(
  tenantConnectionId: string,
): Promise<DatasetFreshness[]> {
  return Promise.all(
    DATASETS.map(async (def) => {
      const fresh = await getDatasetFreshness(tenantConnectionId, def.key);
      return fresh!;
    }),
  );
}
