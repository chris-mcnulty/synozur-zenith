import { Router } from "express";
import { eq, and, desc, sql, asc, or, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  workspaces,
  onedriveInventory,
  sharingLinksInventory,
  contentGovernanceSnapshots,
  governanceReviewTasks,
  governanceReviewFindings,
} from "@shared/schema";
import { requireAuth, type AuthenticatedRequest } from "../middleware/rbac";
import { computeGovernanceSnapshot } from "../services/governance-snapshot";
import { getOrgTenantConnectionIds } from "./scope-helpers";

const router = Router();

// ── GET /api/content-governance/summary ────────────────────────────────────
router.get("/api/content-governance/summary", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const allowedTenantConnectionIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantConnectionIds !== null && !allowedTenantConnectionIds.includes(tenantConnectionId)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    // Latest snapshot
    const [snapshot] = await db
      .select()
      .from(contentGovernanceSnapshots)
      .where(eq(contentGovernanceSnapshots.tenantConnectionId, tenantConnectionId))
      .orderBy(desc(contentGovernanceSnapshots.snapshotDate))
      .limit(1);

    // Live counts
    const [siteCounts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        missingLabels: sql<number>`count(*) filter (where ${workspaces.sensitivityLabelId} is null)::int`,
        orphaned: sql<number>`count(*) filter (where ${workspaces.owners} < 2)::int`,
        externalSharing: sql<number>`count(*) filter (where ${workspaces.externalSharing} = true)::int`,
        totalStorageUsed: sql<number>`coalesce(sum(${workspaces.storageUsedBytes}), 0)::bigint`,
      })
      .from(workspaces)
      .where(eq(workspaces.tenantConnectionId, tenantConnectionId));

    const [odCounts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        totalStorage: sql<number>`coalesce(sum(${onedriveInventory.quotaUsedBytes}), 0)::bigint`,
      })
      .from(onedriveInventory)
      .where(eq(onedriveInventory.tenantConnectionId, tenantConnectionId));

    res.json({
      snapshot: snapshot ?? null,
      live: {
        sites: siteCounts ?? { total: 0, missingLabels: 0, orphaned: 0, externalSharing: 0, totalStorageUsed: 0 },
        onedrive: odCounts ?? { total: 0, totalStorage: 0 },
      },
    });
  } catch (err: any) {
    console.error("[content-governance] summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/content-governance/risk ───────────────────────────────────────
router.get("/api/content-governance/risk", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const riskySites = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.tenantConnectionId, tenantConnectionId),
          or(
            isNull(workspaces.sensitivityLabelId),
            eq(workspaces.retentionPolicy, ""),
            eq(workspaces.externalSharing, true),
          ),
        ),
      )
      .orderBy(desc(workspaces.storageUsedBytes));

    res.json({ count: riskySites.length, workspaces: riskySites });
  } catch (err: any) {
    console.error("[content-governance] risk error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/content-governance/ownership ──────────────────────────────────
router.get("/api/content-governance/ownership", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const orphaned = await db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.tenantConnectionId, tenantConnectionId),
          sql`${workspaces.owners} < 2`,
        ),
      )
      .orderBy(workspaces.displayName);

    res.json({ count: orphaned.length, workspaces: orphaned });
  } catch (err: any) {
    console.error("[content-governance] ownership error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/content-governance/storage ────────────────────────────────────
router.get("/api/content-governance/storage", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const sites = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.tenantConnectionId, tenantConnectionId))
      .orderBy(desc(workspaces.storageUsedBytes));

    const [agg] = await db
      .select({
        totalUsed: sql<number>`coalesce(sum(${workspaces.storageUsedBytes}), 0)::bigint`,
        totalAllocated: sql<number>`coalesce(sum(${workspaces.storageAllocatedBytes}), 0)::bigint`,
        siteCount: sql<number>`count(*)::int`,
      })
      .from(workspaces)
      .where(eq(workspaces.tenantConnectionId, tenantConnectionId));

    res.json({
      aggregate: agg ?? { totalUsed: 0, totalAllocated: 0, siteCount: 0 },
      workspaces: sites,
    });
  } catch (err: any) {
    console.error("[content-governance] storage error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/content-governance/sharing/links ──────────────────────────────
router.get("/api/content-governance/sharing/links", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const resourceType = req.query.resourceType as string | undefined;
    const linkType = req.query.linkType as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize as string || "50", 10)));

    const conditions = [eq(sharingLinksInventory.tenantConnectionId, tenantConnectionId)];
    if (resourceType) conditions.push(eq(sharingLinksInventory.resourceType, resourceType));
    if (linkType) conditions.push(eq(sharingLinksInventory.linkType, linkType));

    const where = and(...conditions);

    const [countRow] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(sharingLinksInventory)
      .where(where);

    const links = await db
      .select()
      .from(sharingLinksInventory)
      .where(where)
      .orderBy(desc(sharingLinksInventory.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json({
      total: countRow?.total ?? 0,
      page,
      pageSize,
      links,
    });
  } catch (err: any) {
    console.error("[content-governance] sharing links error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/content-governance/sharing/links/:id ───────────────────────
router.delete("/api/content-governance/sharing/links/:id", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const tenantConnectionId = (req.body?.tenantConnectionId ?? req.query.tenantConnectionId) as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const [link] = await db
      .select()
      .from(sharingLinksInventory)
      .where(eq(sharingLinksInventory.id, id as string))
      .limit(1);

    if (!link) return res.status(404).json({ error: "Sharing link not found" });

    return res.status(501).json({
      error: "Remote sharing-link revocation is not implemented for this endpoint.",
      message: "This route must revoke the permission in Microsoft 365 before updating local inventory state.",
      id,
    });
  } catch (err: any) {
    console.error("[content-governance] delete sharing link error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/content-governance/snapshot ──────────────────────────────────
router.post("/api/content-governance/snapshot", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = (req.body?.tenantConnectionId ?? req.query.tenantConnectionId) as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    await computeGovernanceSnapshot(tenantConnectionId);
    res.json({ success: true });
  } catch (err: any) {
    console.error("[content-governance] snapshot error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/content-governance/trends ─────────────────────────────────────
router.get("/api/content-governance/trends", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const snapshots = await db
      .select()
      .from(contentGovernanceSnapshots)
      .where(eq(contentGovernanceSnapshots.tenantConnectionId, tenantConnectionId))
      .orderBy(asc(contentGovernanceSnapshots.snapshotDate))
      .limit(30);

    res.json({ snapshots });
  } catch (err: any) {
    console.error("[content-governance] trends error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/content-governance/reviews ───────────────────────────────────
router.post("/api/content-governance/reviews", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const { tenantConnectionId, organizationId, reviewType, triggerType, targetResourceType } = req.body;
    if (!tenantConnectionId || !organizationId || !reviewType) {
      return res.status(400).json({ error: "tenantConnectionId, organizationId, and reviewType are required" });
    }

    const [task] = await db
      .insert(governanceReviewTasks)
      .values({
        tenantConnectionId,
        organizationId,
        reviewType,
        triggerType: triggerType || "MANUAL",
        targetResourceType: targetResourceType || "ALL",
      })
      .returning();

    res.status(201).json(task);
  } catch (err: any) {
    console.error("[content-governance] create review error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/content-governance/reviews ────────────────────────────────────
router.get("/api/content-governance/reviews", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const tenantConnectionId = req.query.tenantConnectionId as string;
    if (!tenantConnectionId) return res.status(400).json({ error: "tenantConnectionId is required" });

    const tasks = await db
      .select()
      .from(governanceReviewTasks)
      .where(eq(governanceReviewTasks.tenantConnectionId, tenantConnectionId))
      .orderBy(desc(governanceReviewTasks.createdAt));

    res.json({ tasks });
  } catch (err: any) {
    console.error("[content-governance] list reviews error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/content-governance/reviews/:id ────────────────────────────────
router.get("/api/content-governance/reviews/:id", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const [task] = await db
      .select()
      .from(governanceReviewTasks)
      .where(eq(governanceReviewTasks.id, id as string));

    if (!task) return res.status(404).json({ error: "Review task not found" });

    const findings = await db
      .select()
      .from(governanceReviewFindings)
      .where(eq(governanceReviewFindings.reviewTaskId, id as string))
      .orderBy(desc(governanceReviewFindings.createdAt));

    res.json({ task, findings });
  } catch (err: any) {
    console.error("[content-governance] get review error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /api/content-governance/reviews/:id/findings/:findingId ──────────
router.patch("/api/content-governance/reviews/:id/findings/:findingId", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const { findingId } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "status is required" });

    const updates: Record<string, any> = { status };
    if (status === "RESOLVED") {
      updates.resolvedAt = new Date();
      updates.resolvedBy = req.user?.id ?? null;
    }

    const [updated] = await db
      .update(governanceReviewFindings)
      .set(updates)
      .where(eq(governanceReviewFindings.id, findingId as string))
      .returning();

    if (!updated) return res.status(404).json({ error: "Finding not found" });
    res.json(updated);
  } catch (err: any) {
    console.error("[content-governance] update finding error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
