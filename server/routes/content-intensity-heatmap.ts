/**
 * Content Intensity Heat Map routes
 *
 * GET /api/content-intensity-heatmap — build and return a HeatmapSnapshot
 *
 * Query params:
 *   tenantConnectionId (required)
 */

import { Router } from "express";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { requireFeature } from "../services/feature-gate";
import { storage } from "../storage";
import { buildHeatmapSnapshot } from "../services/content-intensity-heatmap";
import { getOrgTenantConnectionIds } from "./scope-helpers";
import { ZENITH_ROLES } from "@shared/schema";

const router = Router();

router.get(
  "/api/content-intensity-heatmap",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN, ZENITH_ROLES.OPERATOR),
  requireFeature("contentIntensityHeatmap"),
  async (req: AuthenticatedRequest, res) => {
    const tenantConnectionId =
      typeof req.query.tenantConnectionId === "string"
        ? req.query.tenantConnectionId
        : "";

    if (!tenantConnectionId) {
      return res.status(400).json({ message: "tenantConnectionId query param required" });
    }

    const conn = await storage.getTenantConnection(tenantConnectionId);
    if (!conn) {
      return res.status(404).json({ message: "Tenant connection not found" });
    }

    const allowedIds = await getOrgTenantConnectionIds(req);
    if (allowedIds !== null && !allowedIds.includes(conn.id)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const snapshot = await buildHeatmapSnapshot(tenantConnectionId);
    return res.json(snapshot);
  },
);

export default router;
