import { Router } from "express";
import { storage } from "../storage";
import { ZENITH_ROLES, FEATURE_TOGGLES, FEATURE_TOGGLE_LABELS, type FeatureToggleKey } from "@shared/schema";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { cancelDiscovery } from "../services/discovery-cancellation";
import { logAuditEvent, logAccessDenied, AUDIT_ACTIONS } from "../services/audit-logger";
import { auditDiff } from "../services/audit-diff";

const router = Router();

async function getOrgTenantConnectionIds(user: AuthenticatedRequest["user"]): Promise<string[] | null> {
  if (!user?.organizationId) return null;
  if (user.role === ZENITH_ROLES.PLATFORM_OWNER) return null;
  const connections = await storage.getTenantConnectionsByOrganization(user.organizationId);
  return connections.map(c => c.id);
}

function isValidFeatureKey(key: string): key is FeatureToggleKey {
  return key in FEATURE_TOGGLES;
}

const PURGE_METHODS: Record<FeatureToggleKey, {
  purge: (id: string) => Promise<number>;
  count: (id: string) => Promise<number>;
}> = {
  onedriveInventory: { purge: (id) => storage.purgeOnedriveInventory(id), count: (id) => storage.countOnedriveInventory(id) },
  recordingsDiscovery: { purge: (id) => storage.purgeTeamsRecordings(id), count: (id) => storage.countTeamsRecordings(id) },
  teamsDiscovery: { purge: (id) => storage.purgeTeamsInventory(id), count: (id) => storage.countTeamsInventory(id) },
  telemetry: { purge: (id) => storage.purgeWorkspaceTelemetry(id), count: (id) => storage.countWorkspaceTelemetry(id) },
  speDiscovery: { purge: (id) => storage.purgeSpeData(id), count: (id) => storage.countSpeData(id) },
  contentGovernance: { purge: (id) => storage.purgeContentGovernance(id), count: (id) => storage.countContentGovernance(id) },
  licensing: { purge: async () => 0, count: async () => 0 },
};

router.get(
  "/api/admin/tenants/:id/feature-toggles",
  requireAuth(),
  requireRole("tenant_admin"),
  async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const conn = await storage.getTenantConnection(id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const toggles: Record<string, { enabled: boolean; label: string }> = {};
    for (const [key, label] of Object.entries(FEATURE_TOGGLE_LABELS)) {
      const col = FEATURE_TOGGLES[key as FeatureToggleKey];
      toggles[key] = {
        enabled: !!(conn as any)[col],
        label,
      };
    }

    res.json(toggles);
  },
);

router.patch(
  "/api/admin/tenants/:id/feature-toggles/:feature",
  requireAuth(),
  requireRole("tenant_admin"),
  async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const feature = req.params.feature as string;
    if (!isValidFeatureKey(feature)) {
      return res.status(400).json({ message: `Invalid feature: ${feature}` });
    }

    const conn = await storage.getTenantConnection(id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Feature toggle update outside caller scope", { feature });
      return res.status(403).json({ message: "Access denied" });
    }

    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ message: "enabled must be a boolean" });
    }

    const col = FEATURE_TOGGLES[feature];
    const previous = !!(conn as Record<string, unknown>)[col];
    const updates: Record<string, any> = { [col]: enabled };

    if (!enabled) {
      cancelDiscovery(conn.id, feature);
    }

    const updated = await storage.updateTenantConnection(conn.id, updates);
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.FEATURE_TOGGLE_CHANGED,
      resource: "tenant_connection",
      resourceId: conn.id,
      organizationId: conn.organizationId ?? null,
      tenantConnectionId: conn.id,
      details: {
        feature,
        label: FEATURE_TOGGLE_LABELS[feature],
        changes: auditDiff({ enabled: previous }, { enabled }),
      },
    });
    res.json({
      feature,
      enabled,
      label: FEATURE_TOGGLE_LABELS[feature],
      connection: updated,
    });
  },
);

router.get(
  "/api/admin/tenants/:id/data-counts",
  requireAuth(),
  requireRole("tenant_admin"),
  async (req: AuthenticatedRequest, res) => {
    const id = req.params.id as string;
    const conn = await storage.getTenantConnection(id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [onedrive, recordings, teams, telemetry, spe] = await Promise.all([
      storage.countOnedriveInventory(conn.id),
      storage.countTeamsRecordings(conn.id),
      storage.countTeamsInventory(conn.id),
      storage.countWorkspaceTelemetry(conn.id),
      storage.countSpeData(conn.id),
    ]);

    res.json({
      onedriveInventory: onedrive,
      recordingsDiscovery: recordings,
      teamsDiscovery: teams,
      telemetry,
      speDiscovery: spe,
    });
  },
);

router.get(
  "/api/admin/tenants/:id/data-counts/:section",
  requireAuth(),
  requireRole("tenant_admin"),
  async (req: AuthenticatedRequest, res) => {
    const section = req.params.section as string;
    if (!isValidFeatureKey(section)) {
      return res.status(400).json({ message: `Invalid section: ${section}` });
    }

    const id = req.params.id as string;
    const conn = await storage.getTenantConnection(id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const count = await PURGE_METHODS[section].count(conn.id);
    res.json({ section, count, label: FEATURE_TOGGLE_LABELS[section] });
  },
);

router.delete(
  "/api/admin/tenants/:id/data/:section",
  requireAuth(),
  requireRole("tenant_admin"),
  async (req: AuthenticatedRequest, res) => {
    const section = req.params.section as string;
    if (!isValidFeatureKey(section)) {
      return res.status(400).json({ message: `Invalid section: ${section}` });
    }

    const id = req.params.id as string;
    const conn = await storage.getTenantConnection(id);
    if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(conn.id)) {
      await logAccessDenied(req, "tenant_connection", conn.id, "Tenant data purge outside caller scope", { section });
      return res.status(403).json({ message: "Access denied" });
    }

    const deleted = await PURGE_METHODS[section].purge(conn.id);
    console.log(`[feature-toggle] Purged ${deleted} records from ${section} for tenant ${conn.tenantName}`);
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.TENANT_DATA_PURGED,
      resource: "tenant_connection",
      resourceId: conn.id,
      organizationId: conn.organizationId ?? null,
      tenantConnectionId: conn.id,
      details: {
        section,
        label: FEATURE_TOGGLE_LABELS[section],
        recordsDeleted: deleted,
      },
    });

    res.json({
      section,
      label: FEATURE_TOGGLE_LABELS[section],
      recordsDeleted: deleted,
    });
  },
);

export default router;
