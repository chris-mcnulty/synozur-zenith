/**
 * BL-039 — Dataset refresh dispatcher.
 *
 * Maps a `JobType` to its concrete service entrypoint and wraps the call in
 * trackJobRun. Lets the UI fire a refresh for any dataset via a single
 * endpoint (POST /api/datasets/:datasetKey/refresh) without the route layer
 * needing to know about every individual service.
 *
 * Services that already do their own trackJobRun call internally (the async
 * ones — copilotSync, copilotAssessment, iaAssessment, userInventory,
 * emailStorageReport, and the four discovery jobs through their route
 * handler) are invoked the same way the user-facing routes invoke them, so
 * concurrency guards still apply and the legacy per-service polling tables
 * continue to be populated.
 */
import type { TenantConnection } from "@shared/schema";
import type { JobType } from "@shared/schema";
import { storage } from "../storage";
import { trackJobRun, DuplicateJobError } from "./job-tracking";
import { jobRegistry } from "./job-registry";
import { decryptToken } from "../utils/encryption";

import { syncLicenses } from "./license-sync";
import { computeGovernanceSnapshot } from "./governance-snapshot";
import { runUserInventoryRefresh } from "./user-inventory";
import { startTrackedSync as startCopilotSync } from "./copilot-interaction-sync";
import { runCopilotPromptAssessment } from "./copilot-prompt-intelligence-service";
import { runIAAssessment } from "./ia-assessment-service";
import { runSharingLinkDiscovery } from "./sharing-link-discovery";
import { runOneDriveInventoryDiscovery } from "./onedrive-inventory-discovery";
import { runTeamsInventoryDiscovery } from "./teams-inventory-discovery";
import { runTeamsRecordingsDiscovery } from "./recordings-discovery";
import { runIASync } from "./ia-sync";
import { runSharePointTenantSync } from "./sharepoint-sync";

export type DispatchOutcome =
  | { ok: true; jobId: string | null; alreadyRunning?: false; legacyRunId?: string }
  | { ok: true; jobId: null; alreadyRunning: true; legacyRunId?: string }
  | { ok: false; status: number; message: string };

function getEffectiveClientSecret(conn: TenantConnection): string {
  if (conn.clientSecret) {
    try { return decryptToken(conn.clientSecret); } catch { return conn.clientSecret; }
  }
  return process.env.AZURE_CLIENT_SECRET ?? "";
}

/**
 * Dispatch a refresh for the given job type on the given tenant.
 *
 * Returns:
 *   - { ok: true, jobId }                — job started, jobId in registry
 *   - { ok: true, alreadyRunning: true } — duplicate; an existing run is in flight
 *   - { ok: false, status, message }     — could not dispatch (not implemented,
 *                                          no credentials, unsupported, etc.)
 */
export async function dispatchDatasetRefresh(opts: {
  jobType: JobType;
  tenantConnectionId: string;
  triggeredByUserId: string | null;
}): Promise<DispatchOutcome> {
  const { jobType, tenantConnectionId, triggeredByUserId } = opts;

  const conn = await storage.getTenantConnection(tenantConnectionId);
  if (!conn) return { ok: false, status: 404, message: "Tenant connection not found" };

  // Short-circuit duplicates so the caller gets a clean 409 instead of being
  // surprised by a DuplicateJobError later.
  if (jobRegistry.isRunning(jobType, tenantConnectionId)) {
    return { ok: true, jobId: null, alreadyRunning: true };
  }

  const orgId = conn.organizationId ?? null;
  const tenantName = conn.tenantName ?? conn.tenantId;
  const clientId = conn.clientId || process.env.AZURE_CLIENT_ID || "";
  const clientSecret = getEffectiveClientSecret(conn);

  const baseTrackOpts = {
    organizationId: orgId,
    tenantConnectionId,
    triggeredBy: "manual" as const,
    triggeredByUserId,
    targetName: tenantName,
  };

  switch (jobType) {
    case "licenseSync": {
      try {
        const { jobId } = await trackJobRun(
          { ...baseTrackOpts, jobType: "licenseSync" },
          () => syncLicenses(tenantConnectionId, conn.tenantId, clientId, clientSecret),
        );
        return { ok: true, jobId };
      } catch (err) {
        return handleDispatchError(err);
      }
    }

    case "governanceSnapshot": {
      try {
        const { jobId } = await trackJobRun(
          { ...baseTrackOpts, jobType: "governanceSnapshot" },
          () => computeGovernanceSnapshot(tenantConnectionId),
        );
        return { ok: true, jobId };
      } catch (err) {
        return handleDispatchError(err);
      }
    }

    case "userInventory": {
      // Async fire-and-forget — don't await execution; return immediately.
      const promise = trackJobRun(
        { ...baseTrackOpts, jobType: "userInventory" },
        (signal) => runUserInventoryRefresh(
          tenantConnectionId,
          conn.tenantId,
          clientId,
          clientSecret,
          { signal },
        ),
      );
      // Capture the jobId as soon as the registry insert completes; on
      // failure surface to logs (the row will still be marked failed).
      promise.catch((err) => {
        if (err instanceof DuplicateJobError) return;
        console.error("[dispatch] userInventory failed:", err);
      });
      // We can't know the jobId without awaiting; return null and let the
      // caller fetch /api/jobs/active to discover it.
      return { ok: true, jobId: null };
    }

    case "copilotSync": {
      // The service's own startTrackedSync wraps with trackJobRun internally
      // and returns the legacy copilot_sync_runs id.
      if (!orgId) return { ok: false, status: 400, message: "Tenant has no organizationId" };
      try {
        const legacyRunId = await startCopilotSync(tenantConnectionId, orgId, triggeredByUserId);
        return { ok: true, jobId: null, legacyRunId };
      } catch (err) {
        return handleDispatchError(err);
      }
    }

    case "copilotAssessment": {
      if (!orgId) return { ok: false, status: 400, message: "Tenant has no organizationId" };
      try {
        const legacyRunId = await runCopilotPromptAssessment(
          tenantConnectionId,
          orgId,
          triggeredByUserId,
        );
        return { ok: true, jobId: null, legacyRunId };
      } catch (err) {
        return handleDispatchError(err);
      }
    }

    case "iaAssessment": {
      if (!orgId) return { ok: false, status: 400, message: "Tenant has no organizationId" };
      try {
        const legacyRunId = await runIAAssessment(tenantConnectionId, orgId, triggeredByUserId);
        return { ok: true, jobId: null, legacyRunId };
      } catch (err) {
        return handleDispatchError(err);
      }
    }

    case "sharingLinkDiscovery": {
      const promise = trackJobRun(
        { ...baseTrackOpts, jobType: "sharingLinkDiscovery" },
        () => runSharingLinkDiscovery(tenantConnectionId, conn.tenantId, clientId, clientSecret),
      );
      promise.catch((err) => {
        if (err instanceof DuplicateJobError) return;
        console.error("[dispatch] sharingLinkDiscovery failed:", err);
      });
      return { ok: true, jobId: null };
    }

    case "oneDriveInventory": {
      const promise = trackJobRun(
        { ...baseTrackOpts, jobType: "oneDriveInventory" },
        () => runOneDriveInventoryDiscovery(tenantConnectionId, conn.tenantId, clientId, clientSecret),
      );
      promise.catch((err) => {
        if (err instanceof DuplicateJobError) return;
        console.error("[dispatch] oneDriveInventory failed:", err);
      });
      return { ok: true, jobId: null };
    }

    case "teamsInventory": {
      const promise = trackJobRun(
        { ...baseTrackOpts, jobType: "teamsInventory" },
        () => runTeamsInventoryDiscovery(tenantConnectionId, conn.tenantId, clientId, clientSecret),
      );
      promise.catch((err) => {
        if (err instanceof DuplicateJobError) return;
        console.error("[dispatch] teamsInventory failed:", err);
      });
      return { ok: true, jobId: null };
    }

    case "teamsRecordings": {
      const promise = trackJobRun(
        { ...baseTrackOpts, jobType: "teamsRecordings" },
        () => runTeamsRecordingsDiscovery(tenantConnectionId, conn.tenantId, clientId, clientSecret),
      );
      promise.catch((err) => {
        if (err instanceof DuplicateJobError) return;
        console.error("[dispatch] teamsRecordings failed:", err);
      });
      return { ok: true, jobId: null };
    }

    case "emailStorageReport":
      // Email Storage Report needs configuration (mode, limits, etc.) that
      // the dataset gate does not collect. Refresh from the dedicated
      // page/endpoint instead.
      return {
        ok: false,
        status: 501,
        message:
          "Email Storage Report must be triggered with run options. Open the Email Storage Report page.",
      };

    case "tenantSync": {
      const promise = trackJobRun(
        { ...baseTrackOpts, jobType: "tenantSync" },
        () => runSharePointTenantSync(tenantConnectionId, { triggeredByUserId }),
      );
      promise.catch((err) => {
        if (err instanceof DuplicateJobError) return;
        console.error("[dispatch] tenantSync failed:", err);
      });
      return { ok: true, jobId: null };
    }

    case "iaSync": {
      const promise = trackJobRun(
        { ...baseTrackOpts, jobType: "iaSync" },
        () => runIASync(tenantConnectionId, conn.tenantId, clientId, clientSecret),
      );
      promise.catch((err) => {
        if (err instanceof DuplicateJobError) return;
        console.error("[dispatch] iaSync failed:", err);
      });
      return { ok: true, jobId: null };
    }

    default: {
      const _exhaustive: never = jobType;
      return { ok: false, status: 400, message: `Unknown job type: ${String(_exhaustive)}` };
    }
  }
}

function handleDispatchError(err: unknown): DispatchOutcome {
  if (err instanceof DuplicateJobError) {
    return { ok: true, jobId: null, alreadyRunning: true };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, status: 500, message };
}
