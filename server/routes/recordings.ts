import { Router } from "express";
import { storage } from "../storage";
import { ZENITH_ROLES } from "@shared/schema";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { decryptToken } from "../utils/encryption";
import { runTeamsRecordingsDiscovery } from "../services/recordings-discovery";

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

// GET /api/recordings — list discovered recordings (filterable by tenantConnectionId)
router.get("/api/recordings", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const search = req.query.search as string | undefined;
  const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
  const allowedIds = await getOrgTenantConnectionIds(req.user);

  if (tenantConnectionId) {
    if (allowedIds && !allowedIds.includes(tenantConnectionId)) return res.json([]);
    return res.json(await storage.getTeamsRecordings(tenantConnectionId, search));
  }

  if (allowedIds) {
    const results = [];
    for (const id of allowedIds) {
      results.push(...await storage.getTeamsRecordings(id, search));
    }
    return res.json(results);
  }

  res.json(await storage.getTeamsRecordings(undefined, search));
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

// POST /api/admin/tenants/:id/recordings/sync — trigger discovery for a tenant
router.post(
  "/api/admin/tenants/:id/recordings/sync",
  requireAuth(),
  requireRole("tenant_admin"),
  async (req: AuthenticatedRequest, res) => {
    const conn = await storage.getTenantConnection(req.params.id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
    const clientSecret = getEffectiveClientSecret(conn);

    // Return immediately and run discovery async so the HTTP call doesn't time out
    // on large tenants. The client polls /api/recordings/discovery-runs for status.
    const runPlaceholder = await storage.createTeamsDiscoveryRun({
      tenantConnectionId: conn.id,
      status: "RUNNING",
      recordingsFound: 0,
      transcriptsFound: 0,
      teamsScanned: 0,
      channelsScanned: 0,
      onedrivesScanned: 0,
      onedrivesSkipped: 0,
      errors: [],
    });

    res.json({ runId: runPlaceholder.id, message: "Discovery started" });

    // Run in background — update the run record when complete
    runTeamsRecordingsDiscovery(conn.id, conn.tenantId, clientId, clientSecret)
      .then(async (result) => {
        await storage.updateTeamsDiscoveryRun(runPlaceholder.id, {
          completedAt: new Date(),
          status: result.status,
          recordingsFound: result.recordingsFound,
          transcriptsFound: result.transcriptsFound,
          teamsScanned: result.teamsScanned,
          channelsScanned: result.channelsScanned,
          onedrivesScanned: result.onedrivesScanned,
          onedrivesSkipped: result.onedrivesSkipped,
          errors: result.errors,
        });
      })
      .catch(async (err) => {
        console.error("[recordings] discovery failed:", err);
        await storage.updateTeamsDiscoveryRun(runPlaceholder.id, {
          completedAt: new Date(),
          status: "FAILED",
          errors: [{ context: "discovery", message: err.message }],
        });
      });
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
