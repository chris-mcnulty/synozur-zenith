import { Router } from "express";
import { storage } from "../storage";
import { ZENITH_ROLES } from "@shared/schema";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { decryptToken } from "../utils/encryption";
import { runTeamsRecordingsDiscovery } from "../services/recordings-discovery";
import { runTeamsInventoryDiscovery } from "../services/teams-inventory-discovery";
import { runOneDriveInventoryDiscovery } from "../services/onedrive-inventory-discovery";
import { runSharingLinkDiscovery } from "../services/sharing-link-discovery";
import { trackJobRun, DuplicateJobError } from "../services/job-tracking";
import { jobRegistry } from "../services/job-registry";
import type { JobType } from "@shared/schema";

/**
 * BL-039: helper to wrap a fire-and-forget discovery job with trackJobRun.
 * Cancellation already routes through discovery-cancellation, which now
 * bridges to jobRegistry.cancelByScope, so the legacy isCancelled() checks
 * inside each service still respond correctly.
 */
function startDiscoveryJob(
  res: import("express").Response,
  jobType: JobType,
  conn: { id: string; tenantId: string; tenantName?: string | null; organizationId?: string | null },
  triggeredByUserId: string | null,
  startedMessage: string,
  run: () => Promise<unknown>,
  loggerPrefix: string,
): void {
  if (jobRegistry.isRunning(jobType, conn.id)) {
    res.status(409).json({ message: `${loggerPrefix} is already running for this tenant` });
    return;
  }

  let responseSent = false;
  const sendStarted = () => {
    if (responseSent) return;
    responseSent = true;
    res.json({ message: startedMessage });
  };
  const sendStartFailure = (status: number, message: string, err?: unknown) => {
    if (responseSent) {
      if (!(err instanceof DuplicateJobError) && err) {
        console.error(`${loggerPrefix} failed:`, err);
      }
      return;
    }
    responseSent = true;
    if (!(err instanceof DuplicateJobError) && err) {
      console.error(`${loggerPrefix} failed:`, err);
    }
    res.status(status).json({ message });
  };

  try {
    const jobPromise = trackJobRun(
      {
        jobType,
        organizationId: conn.organizationId ?? null,
        tenantConnectionId: conn.id,
        triggeredBy: "manual",
        triggeredByUserId,
        targetName: conn.tenantName ?? conn.tenantId,
      },
      () => run(),
    );

    void jobPromise.catch((err) => {
      if (err instanceof DuplicateJobError) {
        sendStartFailure(409, `${loggerPrefix} is already running for this tenant`, err);
        return;
      }

      sendStartFailure(500, `Failed to start ${loggerPrefix}`, err);
    });

    setImmediate(() => {
      sendStarted();
    });
  } catch (err) {
    if (err instanceof DuplicateJobError) {
      sendStartFailure(409, `${loggerPrefix} is already running for this tenant`, err);
      return;
    }

    sendStartFailure(500, `Failed to start ${loggerPrefix}`, err);
  }
}

const router = Router();

function getEffectiveClientSecret(conn: { clientSecret?: string | null }): string {
  if (conn.clientSecret) {
    try { return decryptToken(conn.clientSecret); } catch { return conn.clientSecret; }
  }
  return process.env.AZURE_CLIENT_SECRET!;
}

async function getOrgTenantConnectionIds(user: AuthenticatedRequest["user"]): Promise<string[] | null> {
  if (!user?.organizationId) return null;
  if (user.role === ZENITH_ROLES.PLATFORM_OWNER) return null;
  const connections = await storage.getTenantConnectionsByOrganization(user.organizationId);
  return connections.map(c => c.id);
}

// ── Teams & Channels (inventory-based, shows ALL teams) ─────────────────────

// GET /api/teams-channels — aggregated teams & channels summary from inventory
// Falls back to recordings-based summary if no inventory data exists yet.
router.get("/api/teams-channels", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const requestedTenantId = req.query.tenantConnectionId as string | undefined;
  const allowedIds = await getOrgTenantConnectionIds(req.user);

  if (Array.isArray(allowedIds) && allowedIds.length === 0) {
    return res.json([]);
  }

  // Scope to the requested tenant if provided, validating it is within org's allowed set
  let ids: string[] | undefined;
  if (requestedTenantId) {
    if (allowedIds && !allowedIds.includes(requestedTenantId)) {
      return res.status(403).json({ error: "Tenant not accessible" });
    }
    ids = [requestedTenantId];
  } else {
    ids = allowedIds === null ? undefined : allowedIds;
  }

  // Try inventory-based summary first (shows ALL teams)
  const inventorySummary = await storage.getTeamsInventorySummary(ids);
  if (inventorySummary.length > 0) {
    return res.json(inventorySummary);
  }

  // Fall back to recordings-based summary for backwards compatibility
  const summary = await storage.getTeamsChannelsSummary(ids);
  res.json(summary);
});

// GET /api/teams-inventory — full inventory list with properties
router.get("/api/teams-inventory", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const search = req.query.search as string | undefined;
  const requestedTenantId = req.query.tenantConnectionId as string | undefined;
  const allowedIds = await getOrgTenantConnectionIds(req.user);

  if (Array.isArray(allowedIds) && allowedIds.length === 0) {
    return res.json([]);
  }

  // Scope to the requested tenant if provided
  let ids: string[] | undefined;
  if (requestedTenantId) {
    if (allowedIds && !allowedIds.includes(requestedTenantId)) {
      return res.status(403).json({ error: "Tenant not accessible" });
    }
    ids = [requestedTenantId];
  } else {
    ids = allowedIds === null ? undefined : allowedIds;
  }

  const teams = await storage.getTeamsInventory(ids, search);
  res.json(teams);
});

// GET /api/teams-inventory/:id — single team detail
router.get("/api/teams-inventory/:id", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const team = await storage.getTeamsInventoryItem(req.params.id);
  if (!team) return res.status(404).json({ message: "Team not found" });

  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(team.tenantConnectionId)) {
    return res.status(404).json({ message: "Team not found" });
  }
  res.json(team);
});

// ── OneDrive Inventory ──────────────────────────────────────────────────────

// GET /api/onedrive-inventory — full OneDrive inventory list
router.get("/api/onedrive-inventory", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const search = req.query.search as string | undefined;
  const requestedTenantId = req.query.tenantConnectionId as string | undefined;
  const includeExcluded = req.query.includeExcluded === "true";
  const allowedIds = await getOrgTenantConnectionIds(req.user);

  if (Array.isArray(allowedIds) && allowedIds.length === 0) {
    return res.json([]);
  }

  let ids: string[] | undefined;
  if (requestedTenantId) {
    if (allowedIds && !allowedIds.includes(requestedTenantId)) {
      return res.status(403).json({ error: "Tenant not accessible" });
    }
    ids = [requestedTenantId];
  } else {
    ids = allowedIds === null ? undefined : allowedIds;
  }

  const drives = await storage.getOnedriveInventory(ids, search, includeExcluded);
  res.json(drives);
});

// GET /api/onedrive-inventory/:id — single OneDrive detail
router.get("/api/onedrive-inventory/:id", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const drive = await storage.getOnedriveInventoryItem(req.params.id);
  if (!drive) return res.status(404).json({ message: "OneDrive not found" });

  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(drive.tenantConnectionId)) {
    return res.status(404).json({ message: "OneDrive not found" });
  }
  res.json(drive);
});

// PATCH /api/onedrive-inventory/:id/exclusion — exclude or include an account
router.patch("/api/onedrive-inventory/:id/exclusion", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const { excluded, exclusionReason } = req.body;
    if (typeof excluded !== "boolean") {
      return res.status(400).json({ error: "excluded (boolean) is required" });
    }

    const drive = await storage.getOnedriveInventoryItem(req.params.id);
    if (!drive) return res.status(404).json({ message: "OneDrive not found" });

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(drive.tenantConnectionId)) {
      return res.status(404).json({ message: "OneDrive not found" });
    }

    const updated = await storage.updateOnedriveInventoryExclusion(
      req.params.id,
      excluded,
      exclusionReason ?? null,
    );
    res.json(updated);
  } catch (err: any) {
    console.error("[onedrive-inventory] exclusion update error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/onedrive-inventory/bulk-exclude-no-drive — bulk exclude accounts with no drive
router.post("/api/onedrive-inventory/bulk-exclude-no-drive", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const { tenantConnectionId, exclusionReason } = req.body;
    if (!tenantConnectionId) {
      return res.status(400).json({ error: "tenantConnectionId is required" });
    }

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(tenantConnectionId)) {
      return res.status(403).json({ error: "Tenant not accessible" });
    }

    const count = await storage.bulkExcludeNoDriveAccounts(tenantConnectionId, exclusionReason);
    res.json({ excluded: count });
  } catch (err: any) {
    console.error("[onedrive-inventory] bulk exclude error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Recordings (with pagination support) ────────────────────────────────────

// GET /api/recordings — list discovered recordings with optional pagination
router.get("/api/recordings", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const search = req.query.search as string | undefined;
  const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
  const rawPage = parseInt(req.query.page as string, 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawPageSize = parseInt(req.query.pageSize as string, 10);
  const clampedPageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 50;
  const pageSize = Math.min(clampedPageSize, 200);
  const allowedIds = await getOrgTenantConnectionIds(req.user);

  // Determine effective tenant connection IDs
  let effectiveIds: string[] | undefined;
  if (tenantConnectionId) {
    if (allowedIds && !allowedIds.includes(tenantConnectionId)) {
      return res.json({ rows: [], total: 0, page, pageSize, aggregates: { totalRecordings: 0, totalTranscripts: 0, channelCount: 0, onedriveCount: 0, labelledCount: 0, blockedCount: 0 } });
    }
    effectiveIds = [tenantConnectionId];
  } else {
    if (Array.isArray(allowedIds) && allowedIds.length === 0) {
      return res.json({ rows: [], total: 0, page, pageSize, aggregates: { totalRecordings: 0, totalTranscripts: 0, channelCount: 0, onedriveCount: 0, labelledCount: 0, blockedCount: 0 } });
    }
    if (allowedIds && allowedIds.length > 0) {
      effectiveIds = allowedIds;
    }
  }

  const result = await storage.getTeamsRecordingsPaginated({
    tenantConnectionIds: effectiveIds,
    search,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  res.json({
    rows: result.rows,
    total: result.total,
    page,
    pageSize,
    totalPages: Math.ceil(result.total / pageSize),
    aggregates: result.aggregates,
  });
});

// GET /api/recordings/:id — single recording detail
router.get("/api/recordings/:id", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const recording = await storage.getTeamsRecording(req.params.id);
  if (!recording) return res.status(404).json({ message: "Recording not found" });

  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(recording.tenantConnectionId)) {
    return res.status(404).json({ message: "Recording not found" });
  }
  res.json(recording);
});

// GET /api/recordings/discovery-runs — list past discovery runs
router.get("/api/recordings/discovery-runs", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
  const allowedIds = await getOrgTenantConnectionIds(req.user);

  if (tenantConnectionId) {
    if (allowedIds && !allowedIds.includes(tenantConnectionId)) return res.json([]);
    return res.json(await storage.getTeamsDiscoveryRuns(tenantConnectionId));
  }

  if (allowedIds) {
    const results = [];
    for (const id of allowedIds) {
      results.push(...await storage.getTeamsDiscoveryRuns(id, 5));
    }
    results.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    return res.json(results.slice(0, 20));
  }

  res.json(await storage.getTeamsDiscoveryRuns());
});

// ── Admin Sync Endpoints ────────────────────────────────────────────────────

// POST /api/admin/tenants/:id/recordings/sync — trigger recordings discovery
router.post(
  "/api/admin/tenants/:id/recordings/sync",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    if (!conn.recordingsDiscoveryEnabled) {
      return res.status(403).json({ message: "Recordings Discovery is disabled for this tenant. Enable it in Feature Settings before running a scan." });
    }

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
    const clientSecret = getEffectiveClientSecret(conn);

    startDiscoveryJob(
      res,
      "teamsRecordings",
      conn,
      req.user?.id ?? null,
      "Discovery started",
      () => runTeamsRecordingsDiscovery(conn.id, conn.tenantId, clientId, clientSecret),
      "[recordings] discovery",
    );
  },
);

// POST /api/admin/tenants/:id/teams-inventory/sync — trigger teams+channels inventory discovery
router.post(
  "/api/admin/tenants/:id/teams-inventory/sync",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    if (!conn.teamsDiscoveryEnabled) {
      return res.status(403).json({ message: "Teams & Channels Discovery is disabled for this tenant. Enable it in Feature Settings before running a scan." });
    }

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
    const clientSecret = getEffectiveClientSecret(conn);

    startDiscoveryJob(
      res,
      "teamsInventory",
      conn,
      req.user?.id ?? null,
      "Teams inventory discovery started",
      () => runTeamsInventoryDiscovery(conn.id, conn.tenantId, clientId, clientSecret),
      "[teams-inventory] discovery",
    );
  },
);

// POST /api/admin/tenants/:id/onedrive-inventory/sync — trigger OneDrive inventory discovery
router.post(
  "/api/admin/tenants/:id/onedrive-inventory/sync",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    if (!conn.onedriveInventoryEnabled) {
      return res.status(403).json({ message: "OneDrive Inventory is disabled for this tenant. Enable it in Feature Settings before running a scan." });
    }

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
    const clientSecret = getEffectiveClientSecret(conn);

    startDiscoveryJob(
      res,
      "oneDriveInventory",
      conn,
      req.user?.id ?? null,
      "OneDrive inventory discovery started",
      () => runOneDriveInventoryDiscovery(conn.id, conn.tenantId, clientId, clientSecret),
      "[onedrive-inventory] discovery",
    );
  },
);

// POST /api/admin/tenants/:id/sharing-links/sync — trigger sharing link discovery
router.post(
  "/api/admin/tenants/:id/sharing-links/sync",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    if (!conn.contentGovernanceEnabled) {
      return res.status(403).json({ message: "Content Governance is disabled for this tenant. Enable it in Feature Settings before running a scan." });
    }

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
    const clientSecret = getEffectiveClientSecret(conn);

    startDiscoveryJob(
      res,
      "sharingLinkDiscovery",
      conn,
      req.user?.id ?? null,
      "Sharing link discovery started",
      () => runSharingLinkDiscovery(conn.id, conn.tenantId, clientId, clientSecret),
      "[sharing-links] discovery",
    );
  },
);

// GET /api/admin/tenants/:id/sharing-links/latest-run — latest sharing link discovery run status
router.get(
  "/api/admin/tenants/:id/sharing-links/latest-run",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const run = await storage.getLatestSharingLinkDiscoveryRun(conn.id);
    res.json(run ?? null);
  },
);

// GET /api/admin/tenants/:id/recordings/latest-run — latest run status for polling
router.get(
  "/api/admin/tenants/:id/recordings/latest-run",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const run = await storage.getLatestTeamsDiscoveryRun(conn.id);
    res.json(run ?? null);
  },
);

export default router;
