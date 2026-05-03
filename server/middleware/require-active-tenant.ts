import type { Response, NextFunction } from "express";
import { storage } from "../storage";
import type { AuthenticatedRequest } from "./rbac";

/**
 * BL-004 / Spec §4.2 — Tenant Status Lifecycle.
 *
 * Gates governance mutation routes so that only tenants in ACTIVE state can have
 * data mutated. PENDING tenants haven't completed consent; SUSPENDED tenants are
 * temporarily blocked (admin action or auto-suspend on consent failure); REVOKED
 * tenants are permanently offboarded.
 *
 * Tenant id is resolved from (in order):
 *   1. explicit `tenantConnectionId` body field
 *   2. workspace lookup via :workspaceId / :id route param when the route is workspace-scoped
 *   3. :tenantId route param
 */
export function requireActiveTenant(opts: { resolveFrom?: "param" | "workspace" | "body" | "auto" } = {}) {
  const mode = opts.resolveFrom || "auto";

  return async function (req: AuthenticatedRequest, res: Response, next: NextFunction) {
    let tenantConnectionId: string | undefined;

    if (mode === "body" || mode === "auto") {
      const bodyId = (req.body && (req.body.tenantConnectionId || req.body.tenant_connection_id)) as string | undefined;
      if (bodyId) tenantConnectionId = bodyId;
    }

    if (!tenantConnectionId && (mode === "param" || mode === "auto")) {
      const p = req.params || {};
      // :tenantId is the canonical param name; :id is used by admin tenant routes
      // e.g. /api/admin/tenants/:id/sync-libraries
      if (p.tenantId) tenantConnectionId = String(p.tenantId);
      else if (mode === "param" && p.id) tenantConnectionId = String(p.id);
    }

    if (!tenantConnectionId && (mode === "workspace" || mode === "auto")) {
      const wsId = (req.params as any)?.workspaceId || (req.params as any)?.id;
      if (wsId) {
        try {
          const ws = await storage.getWorkspace(String(wsId));
          if (ws?.tenantConnectionId) tenantConnectionId = ws.tenantConnectionId;
        } catch {}
      }
    }

    if (!tenantConnectionId) {
      // Cannot resolve a tenant — let the route handler proceed and surface its own error.
      return next();
    }

    const conn = await storage.getTenantConnection(tenantConnectionId);
    if (!conn) {
      return res.status(404).json({ message: "Tenant connection not found" });
    }

    if (conn.status === "ACTIVE") {
      return next();
    }

    return res.status(409).json({
      error: "TENANT_NOT_ACTIVE",
      message: `Tenant connection is ${conn.status}. ${
        conn.status === "PENDING"
          ? "Complete consent before performing governance actions."
          : conn.status === "SUSPENDED"
          ? "Reactivate the tenant before performing governance actions."
          : "This tenant has been revoked and cannot be modified."
      }`,
      status: conn.status,
      statusReason: conn.statusReason ?? null,
    });
  };
}
