import { Router } from "express";
import { eq, and, desc, sql, ilike, or } from "drizzle-orm";
import { db } from "../db";
import {
  licenseSubscriptions,
  licenseAssignments,
  licenseOptimizationFindings,
  tenantConnections,
} from "@shared/schema";
import { requireAuth, type AuthenticatedRequest } from "../middleware/rbac";
import { syncLicenses } from "../services/license-sync";
import { trackJobRun, DuplicateJobError } from "../services/job-tracking";
import { getActiveOrgId, assertTenantInScope } from "./scope-helpers";
import { logAuditEvent, AUDIT_ACTIONS } from "../services/audit-logger";
import { decryptToken } from "../utils/encryption";

const router = Router();

function getEffectiveClientSecret(conn: { clientSecret?: string | null }): string {
  if (conn.clientSecret) {
    try {
      return decryptToken(conn.clientSecret);
    } catch {
      return conn.clientSecret;
    }
  }
  return process.env.AZURE_CLIENT_SECRET!;
}

// ── GET /api/licensing/dashboard ───────────────────────────────────────────
router.get("/api/licensing/dashboard", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const user = (req as any).user;
    const permissions = Array.isArray(user?.permissions) ? user.permissions : [];
    const role = typeof user?.role === "string" ? user.role : "";
    const organizationId = user?.organizationId ?? user?.orgId;
    const hasInventoryRead =
      permissions.includes("inventory:read") || role === "admin" || role === "superadmin";

    if (!hasInventoryRead) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!organizationId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [scopedTenantConnection] = await db
      .select({ id: tenantConnections.id })
      .from(tenantConnections)
      .where(
        and(
          eq(tenantConnections.id, tenantConnectionId),
          eq(tenantConnections.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!scopedTenantConnection) {
      return res.status(403).json({ error: "Forbidden" });
    }
    const subs = await db
      .select()
      .from(licenseSubscriptions)
      .where(eq(licenseSubscriptions.tenantConnectionId, tenantConnectionId));

    let totalUnits = 0;
    let consumedUnits = 0;
    let estimatedMonthlySpend = 0;

    for (const sub of subs) {
      totalUnits += sub.totalUnits ?? 0;
      consumedUnits += sub.consumedUnits ?? 0;
      const price = sub.customPricePerUnit ? parseFloat(sub.customPricePerUnit) : 0;
      estimatedMonthlySpend += (sub.consumedUnits ?? 0) * price;
    }

    res.json({
      totalSubscriptions: subs.length,
      totalUnits,
      consumedUnits,
      unassignedUnits: totalUnits - consumedUnits,
      estimatedMonthlySpend: Math.round(estimatedMonthlySpend * 100) / 100,
    });
  } catch (err: any) {
    console.error("[licensing] dashboard error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/licensing/subscriptions ───────────────────────────────────────
router.get("/api/licensing/subscriptions", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const subs = await db
      .select()
      .from(licenseSubscriptions)
      .where(eq(licenseSubscriptions.tenantConnectionId, tenantConnectionId))
      .orderBy(desc(licenseSubscriptions.consumedUnits));

    res.json({ subscriptions: subs });
  } catch (err: any) {
    console.error("[licensing] subscriptions error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/licensing/subscriptions/:id/price ───────────────────────────
router.patch("/api/licensing/subscriptions/:id/price", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const tenantConnectionId = (req.body?.tenantConnectionId ?? req.query.tenantConnectionId) as string | undefined;
    const { price } = req.body;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });
    if (price === undefined || price === null) return res.status(400).json({ error: "price is required" });
    if (!(await assertTenantInScope(req, tenantConnectionId, "License price update outside caller scope"))) {
      return res.status(403).json({ error: "Tenant connection is outside your organization scope" });
    }

    const [existing] = await db
      .select()
      .from(licenseSubscriptions)
      .where(and(eq(licenseSubscriptions.id, id), eq(licenseSubscriptions.tenantConnectionId, tenantConnectionId)))
      .limit(1);

    const [updated] = await db
      .update(licenseSubscriptions)
      .set({ customPricePerUnit: String(price) })
      .where(
        and(
          eq(licenseSubscriptions.id, id),
          eq(licenseSubscriptions.tenantConnectionId, tenantConnectionId),
        ),
      )
      .returning();

    if (!updated) return res.status(404).json({ error: "Subscription not found" });
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.LICENSE_PRICE_UPDATED,
      resource: "license_subscription",
      resourceId: id,
      tenantConnectionId,
      details: {
        skuId: updated.skuId,
        before: { customPricePerUnit: existing?.customPricePerUnit ?? null },
        after: { customPricePerUnit: updated.customPricePerUnit },
      },
    });
    res.json(updated);
  } catch (err: any) {
    console.error("[licensing] update price error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/licensing/assignments ─────────────────────────────────────────
router.get("/api/licensing/assignments", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const skuId = req.query.skuId as string | undefined;
    const accountEnabled = req.query.accountEnabled as string | undefined;
    const search = req.query.search as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string || "50", 10)));

    const conditions = [eq(licenseAssignments.tenantConnectionId, tenantConnectionId)];
    if (skuId) conditions.push(eq(licenseAssignments.skuId, skuId));
    if (accountEnabled !== undefined) {
      conditions.push(eq(licenseAssignments.accountEnabled, accountEnabled === "true"));
    }
    if (search) {
      conditions.push(
        or(
          ilike(licenseAssignments.userDisplayName, `%${search}%`),
          ilike(licenseAssignments.userPrincipalName, `%${search}%`),
        )!,
      );
    }

    const where = and(...conditions);

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(licenseAssignments)
      .where(where);

    const assignments = await db
      .select()
      .from(licenseAssignments)
      .where(where)
      .orderBy(licenseAssignments.userDisplayName)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      total: countRow?.total ?? 0,
      page,
      pageSize,
      assignments,
    });
  } catch (err: any) {
    console.error("[licensing] assignments error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/licensing/assignments/export ──────────────────────────────────
router.get("/api/licensing/assignments/export", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const assignments = await db
      .select()
      .from(licenseAssignments)
      .where(eq(licenseAssignments.tenantConnectionId, tenantConnectionId))
      .orderBy(licenseAssignments.userDisplayName);

    const headers = [
      "userPrincipalName",
      "userDisplayName",
      "userDepartment",
      "userJobTitle",
      "accountEnabled",
      "lastSignInDate",
      "skuId",
      "skuPartNumber",
    ];

    const csvRows = [headers.join(",")];
    for (const a of assignments) {
      csvRows.push(
        [
          a.userPrincipalName ?? "",
          `"${(a.userDisplayName ?? "").replace(/"/g, '""')}"`,
          `"${(a.userDepartment ?? "").replace(/"/g, '""')}"`,
          `"${(a.userJobTitle ?? "").replace(/"/g, '""')}"`,
          String(a.accountEnabled ?? ""),
          a.lastSignInDate ?? "",
          a.skuId ?? "",
          a.skuPartNumber ?? "",
        ].join(","),
      );
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=license-assignments.csv");
    res.send(csvRows.join("\n"));
  } catch (err: any) {
    console.error("[licensing] export error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/licensing/sync ───────────────────────────────────────────────
router.post("/api/licensing/sync", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const { tenantConnectionId } = req.body;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const [conn] = await db
      .select()
      .from(tenantConnections)
      .where(eq(tenantConnections.id, tenantConnectionId))
      .limit(1);

    if (!conn) return res.status(404).json({ error: "Tenant connection not found" });

    const clientId = conn.clientId || process.env.AZURE_CLIENT_ID!;
    const clientSecret = getEffectiveClientSecret(conn);

    // BL-039: route through trackJobRun so the run shows up in the unified
    // Job Monitor and feeds the Dataset Freshness Registry. License sync is
    // synchronous, so we await the wrapper directly and return its result.
    const orgId = getActiveOrgId(req) ?? conn.organizationId ?? null;
    try {
      const { result } = await trackJobRun(
        {
          jobType: "licenseSync",
          organizationId: orgId,
          tenantConnectionId,
          triggeredBy: "manual",
          triggeredByUserId: req.user?.id ?? null,
          targetName: conn.tenantName ?? conn.tenantId,
        },
        () => syncLicenses(tenantConnectionId, conn.tenantId, clientId, clientSecret),
      );
      return res.json({ success: true, ...result });
    } catch (err: any) {
      if (err instanceof DuplicateJobError) {
        return res.status(409).json({ error: err.message, code: err.code });
      }
      throw err;
    }
  } catch (err: any) {
    console.error("[licensing] sync error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/licensing/optimization/findings ───────────────────────────────
router.get("/api/licensing/optimization/findings", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const findingType = req.query.findingType as string | undefined;
    const status = req.query.status as string | undefined;

    const conditions = [eq(licenseOptimizationFindings.tenantConnectionId, tenantConnectionId)];
    if (findingType) conditions.push(eq(licenseOptimizationFindings.findingType, findingType));
    if (status) conditions.push(eq(licenseOptimizationFindings.status, status));

    const findings = await db
      .select()
      .from(licenseOptimizationFindings)
      .where(and(...conditions))
      .orderBy(desc(licenseOptimizationFindings.createdAt));

    res.json({ findings });
  } catch (err: any) {
    console.error("[licensing] optimization findings error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/licensing/optimization/findings/:id ─────────────────────────
router.patch("/api/licensing/optimization/findings/:id", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "status is required" });

    const [existing] = await db
      .select()
      .from(licenseOptimizationFindings)
      .where(eq(licenseOptimizationFindings.id, id))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Finding not found" });
    if (!(await assertTenantInScope(req, existing.tenantConnectionId, "License finding outside caller scope"))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updates: { status: string; resolvedAt?: Date } = { status };
    if (status === "RESOLVED") {
      updates.resolvedAt = new Date();
    }

    const [updated] = await db
      .update(licenseOptimizationFindings)
      .set(updates)
      .where(eq(licenseOptimizationFindings.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Finding not found" });
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.LICENSE_FINDING_UPDATED,
      resource: "license_optimization_finding",
      resourceId: id,
      tenantConnectionId: existing.tenantConnectionId,
      details: {
        before: { status: existing.status },
        after: { status: updated.status },
      },
    });
    res.json(updated);
  } catch (err: any) {
    console.error("[licensing] update finding error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/licensing/overlap ─────────────────────────────────────────────
router.get("/api/licensing/overlap", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    // Find users with multiple SKU assignments
    const multiLicenseUsers = await db
      .select({
        userId: licenseAssignments.userId,
        userPrincipalName: licenseAssignments.userPrincipalName,
        userDisplayName: licenseAssignments.userDisplayName,
        licenseCount: sql<number>`count(*)::int`,
        skuIds: sql<string[]>`array_agg(${licenseAssignments.skuId})`,
        skuPartNumbers: sql<string[]>`array_agg(${licenseAssignments.skuPartNumber})`,
      })
      .from(licenseAssignments)
      .where(eq(licenseAssignments.tenantConnectionId, tenantConnectionId))
      .groupBy(
        licenseAssignments.userId,
        licenseAssignments.userPrincipalName,
        licenseAssignments.userDisplayName,
      )
      .having(sql`count(*) > 1`)
      .orderBy(sql`count(*) desc`);

    // Load subscriptions to get service plan info for overlap detection
    const subs = await db
      .select()
      .from(licenseSubscriptions)
      .where(eq(licenseSubscriptions.tenantConnectionId, tenantConnectionId));

    const plansBySku = new Map<string, Set<string>>();
    for (const sub of subs) {
      const plans = new Set<string>();
      if (sub.enabledServicePlans && Array.isArray(sub.enabledServicePlans)) {
        for (const p of sub.enabledServicePlans) {
          plans.add(p.servicePlanId);
        }
      }
      plansBySku.set(sub.skuId, plans);
    }

    // Detect overlap: for each user, check if any pair of SKUs share service plans
    const overlaps = multiLicenseUsers.map((user) => {
      const userSkuIds = user.skuIds ?? [];
      const overlappingPlans: Array<{ sku1: string; sku2: string; sharedPlanCount: number }> = [];

      for (let i = 0; i < userSkuIds.length; i++) {
        for (let j = i + 1; j < userSkuIds.length; j++) {
          const plans1 = plansBySku.get(userSkuIds[i]);
          const plans2 = plansBySku.get(userSkuIds[j]);
          if (plans1 && plans2) {
            let shared = 0;
            for (const p of Array.from(plans1)) {
              if (plans2.has(p)) shared++;
            }
            if (shared > 0) {
              overlappingPlans.push({
                sku1: userSkuIds[i],
                sku2: userSkuIds[j],
                sharedPlanCount: shared,
              });
            }
          }
        }
      }

      return {
        userId: user.userId,
        userPrincipalName: user.userPrincipalName,
        userDisplayName: user.userDisplayName,
        licenseCount: user.licenseCount,
        skuPartNumbers: user.skuPartNumbers,
        overlappingPlans,
      };
    });

    res.json({
      totalUsersWithMultipleLicenses: multiLicenseUsers.length,
      usersWithOverlap: overlaps.filter((o) => o.overlappingPlans.length > 0).length,
      overlaps,
    });
  } catch (err: any) {
    console.error("[licensing] overlap error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
