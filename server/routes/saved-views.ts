import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import {
  ZENITH_ROLES,
  SAVED_VIEW_PAGES,
  SAVED_VIEW_SCOPES,
  SAVED_VIEW_DIGEST_FREQUENCIES,
  BUILT_IN_SAVED_VIEWS,
  type SavedView,
  type SavedViewPage,
  type SavedViewSubscription,
} from "@shared/schema";
import { storage } from "../storage";

const router = Router();

const ROLE_LEVELS: Record<string, number> = {
  [ZENITH_ROLES.PLATFORM_OWNER]: 100,
  [ZENITH_ROLES.TENANT_ADMIN]: 80,
  [ZENITH_ROLES.GOVERNANCE_ADMIN]: 60,
  [ZENITH_ROLES.OPERATOR]: 40,
  [ZENITH_ROLES.VIEWER]: 20,
  [ZENITH_ROLES.AUDITOR]: 10,
};

function isTenantAdminOrAbove(role?: string): boolean {
  if (!role) return false;
  return (ROLE_LEVELS[role] ?? 0) >= ROLE_LEVELS[ZENITH_ROLES.TENANT_ADMIN];
}

function pageQuery(req: AuthenticatedRequest): SavedViewPage | undefined {
  const raw = (req.query.page as string | undefined)?.trim();
  if (!raw) return undefined;
  return (SAVED_VIEW_PAGES as readonly string[]).includes(raw)
    ? (raw as SavedViewPage)
    : undefined;
}

function viewToWire(view: SavedView, currentUserId: string, subscription?: SavedViewSubscription | null) {
  return {
    ...view,
    isPinned: (view.pinnedByUserIds ?? []).includes(currentUserId),
    isBuiltIn: false,
    isOwner: view.ownerUserId === currentUserId,
    isDefault: view.isDefault ?? false,
    subscription: subscription ? { frequency: subscription.frequency } : null,
  };
}

function builtInToWire(b: (typeof BUILT_IN_SAVED_VIEWS)[number]) {
  return {
    id: b.id,
    organizationId: null,
    ownerUserId: null,
    page: b.page,
    name: b.name,
    description: b.description,
    filterJson: b.filterJson,
    sortJson: b.sortJson ?? {},
    columnsJson: b.columnsJson ?? {},
    scope: "BUILT_IN" as const,
    pinnedByUserIds: [] as string[],
    isPinned: false,
    isBuiltIn: true,
    isOwner: false,
    isDefault: false,
    createdAt: null,
    updatedAt: null,
  };
}

const upsertBodySchema = z.object({
  page: z.enum(SAVED_VIEW_PAGES),
  name: z.string().trim().min(1).max(80),
  filterJson: z.record(z.unknown()).default({}),
  sortJson: z.record(z.unknown()).default({}),
  columnsJson: z.record(z.unknown()).default({}),
  scope: z.enum(SAVED_VIEW_SCOPES).default("PRIVATE"),
});

const patchBodySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  filterJson: z.record(z.unknown()).optional(),
  sortJson: z.record(z.unknown()).optional(),
  columnsJson: z.record(z.unknown()).optional(),
  scope: z.enum(SAVED_VIEW_SCOPES).optional(),
});

const pinBodySchema = z.object({ pinned: z.boolean() });

// ── List views for a page ──
router.get(
  "/api/saved-views",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const page = pageQuery(req);
      if (!page) return res.status(400).json({ error: "Unknown or missing page" });

      const userId = req.user?.id;
      const orgId = req.activeOrganizationId || req.user?.organizationId;
      if (!userId || !orgId) return res.status(400).json({ error: "Missing user or organization context" });

      const [rows, userSubs] = await Promise.all([
        storage.listSavedViewsForUser({ organizationId: orgId, userId, page }),
        storage.getSubscriptionsForUser(userId),
      ]);

      const subMap = new Map(userSubs.map((s) => [s.savedViewId, s]));
      const builtIns = BUILT_IN_SAVED_VIEWS.filter((b) => b.page === page).map(builtInToWire);
      const userViews = rows.map((v) => viewToWire(v, userId, subMap.get(v.id)));

      const my = userViews.filter((v) => v.scope === "PRIVATE" && v.ownerUserId === userId);
      const shared = userViews.filter((v) => v.scope === "ORG");

      res.json({ my, shared, builtIn: builtIns });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Get a single view by id ──
router.get(
  "/api/saved-views/:id",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id as string;
      const userId = req.user?.id ?? "";
      const orgId = req.activeOrganizationId || req.user?.organizationId;

      if (id.startsWith("builtin:")) {
        const b = BUILT_IN_SAVED_VIEWS.find((v) => v.id === id);
        if (!b) return res.status(404).json({ error: "View not found" });
        return res.json(builtInToWire(b));
      }

      const row = await storage.getSavedView(id);
      if (!row) return res.status(404).json({ error: "View not found" });

      const isOwner = row.ownerUserId === userId;
      const isOrgShared = row.scope === "ORG" && row.organizationId === orgId;
      if (!isOwner && !isOrgShared) {
        return res.status(403).json({ error: "Not allowed to read this view" });
      }
      res.json(viewToWire(row, userId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Create a view ──
router.post(
  "/api/saved-views",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = upsertBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const userId = req.user?.id;
      const orgId = req.activeOrganizationId || req.user?.organizationId;
      if (!userId || !orgId) return res.status(400).json({ error: "Missing user or organization context" });

      if (parsed.data.scope === "ORG" && !isTenantAdminOrAbove(req.effectiveRole || req.user?.role)) {
        return res.status(403).json({ error: "Only Tenant Admins can create org-shared views" });
      }

      const created = await storage.createSavedView({
        organizationId: orgId,
        ownerUserId: userId,
        page: parsed.data.page,
        name: parsed.data.name,
        filterJson: parsed.data.filterJson,
        sortJson: parsed.data.sortJson,
        columnsJson: parsed.data.columnsJson,
        scope: parsed.data.scope,
        pinnedByUserIds: [],
      });

      await storage.createAuditEntry({
        userId,
        userEmail: (req.user?.email ?? null) as string | null,
        action: "SAVED_VIEW_CREATED",
        resource: "saved_view",
        resourceId: created.id,
        organizationId: orgId,
        details: { page: created.page, name: created.name, scope: created.scope },
        result: "SUCCESS",
      });

      res.status(201).json(viewToWire(created, userId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Update / rename / re-share / overwrite filter state ──
router.patch(
  "/api/saved-views/:id",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id as string;
      if (id.startsWith("builtin:")) return res.status(400).json({ error: "Built-in views are read-only" });

      const parsed = patchBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const userId = req.user?.id ?? "";
      const orgId = req.activeOrganizationId || req.user?.organizationId;
      const role = req.effectiveRole || req.user?.role;

      const existing = await storage.getSavedView(id);
      if (!existing) return res.status(404).json({ error: "View not found" });

      const isOwner = existing.ownerUserId === userId;
      const isAdmin = isTenantAdminOrAbove(role);
      const canEdit = isOwner || (existing.scope === "ORG" && isAdmin);
      if (!canEdit || existing.organizationId !== orgId) {
        return res.status(403).json({ error: "Not allowed to modify this view" });
      }

      // Promoting / demoting scope requires Tenant Admin.
      if (parsed.data.scope && parsed.data.scope !== existing.scope && !isAdmin) {
        return res.status(403).json({ error: "Only Tenant Admins can change view scope" });
      }

      const updated = await storage.updateSavedView(id, parsed.data);

      await storage.createAuditEntry({
        userId,
        userEmail: (req.user?.email ?? null) as string | null,
        action: parsed.data.scope && parsed.data.scope !== existing.scope ? "SAVED_VIEW_SHARED" : "SAVED_VIEW_UPDATED",
        resource: "saved_view",
        resourceId: id,
        organizationId: orgId,
        details: { page: existing.page, fields: Object.keys(parsed.data), newScope: parsed.data.scope },
        result: "SUCCESS",
      });

      res.json(updated ? viewToWire(updated, userId) : null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Delete a view ──
router.delete(
  "/api/saved-views/:id",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id as string;
      if (id.startsWith("builtin:")) return res.status(400).json({ error: "Built-in views are read-only" });

      const userId = req.user?.id ?? "";
      const orgId = req.activeOrganizationId || req.user?.organizationId;
      const role = req.effectiveRole || req.user?.role;

      const existing = await storage.getSavedView(id);
      if (!existing) return res.status(404).json({ error: "View not found" });

      const isOwner = existing.ownerUserId === userId;
      const isAdmin = isTenantAdminOrAbove(role);
      const canDelete = isOwner || (existing.scope === "ORG" && isAdmin);
      if (!canDelete || existing.organizationId !== orgId) {
        return res.status(403).json({ error: "Not allowed to delete this view" });
      }

      await storage.deleteSavedView(id);

      await storage.createAuditEntry({
        userId,
        userEmail: (req.user?.email ?? null) as string | null,
        action: "SAVED_VIEW_DELETED",
        resource: "saved_view",
        resourceId: id,
        organizationId: orgId,
        details: { page: existing.page, name: existing.name, scope: existing.scope },
        result: "SUCCESS",
      });

      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Duplicate a view (creates a private copy owned by the caller) ──
router.post(
  "/api/saved-views/:id/duplicate",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id as string;
      const userId = req.user?.id ?? "";
      const orgId = req.activeOrganizationId || req.user?.organizationId;
      if (!orgId) return res.status(400).json({ error: "Missing organization context" });

      let source: { page: SavedViewPage; name: string; filterJson: any; sortJson: any; columnsJson: any } | null = null;

      if (id.startsWith("builtin:")) {
        const b = BUILT_IN_SAVED_VIEWS.find((v) => v.id === id);
        if (!b) return res.status(404).json({ error: "View not found" });
        source = {
          page: b.page,
          name: b.name,
          filterJson: b.filterJson,
          sortJson: b.sortJson ?? {},
          columnsJson: b.columnsJson ?? {},
        };
      } else {
        const existing = await storage.getSavedView(id);
        if (!existing) return res.status(404).json({ error: "View not found" });
        const isOwner = existing.ownerUserId === userId;
        const isOrgShared = existing.scope === "ORG" && existing.organizationId === orgId;
        if (!isOwner && !isOrgShared) {
          return res.status(403).json({ error: "Not allowed to duplicate this view" });
        }
        source = {
          page: existing.page as SavedViewPage,
          name: existing.name,
          filterJson: existing.filterJson,
          sortJson: existing.sortJson,
          columnsJson: existing.columnsJson,
        };
      }

      const created = await storage.createSavedView({
        organizationId: orgId,
        ownerUserId: userId,
        page: source.page,
        name: `Copy of ${source.name}`.slice(0, 80),
        filterJson: source.filterJson,
        sortJson: source.sortJson,
        columnsJson: source.columnsJson,
        scope: "PRIVATE",
        pinnedByUserIds: [],
      });

      await storage.createAuditEntry({
        userId,
        userEmail: (req.user?.email ?? null) as string | null,
        action: "SAVED_VIEW_DUPLICATED",
        resource: "saved_view",
        resourceId: created.id,
        organizationId: orgId,
        details: { page: created.page, sourceId: id, name: created.name },
        result: "SUCCESS",
      });

      res.status(201).json(viewToWire(created, userId));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Set / clear the page default view for the org (Tenant Admin only) ──
router.post(
  "/api/saved-views/:id/default",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id as string;
      if (id.startsWith("builtin:")) {
        return res.status(400).json({ error: "Built-in views cannot be set as default" });
      }

      const userId = req.user?.id ?? "";
      const orgId = req.activeOrganizationId || req.user?.organizationId;
      const role = req.effectiveRole || req.user?.role;

      if (!isTenantAdminOrAbove(role)) {
        return res.status(403).json({ error: "Only Tenant Admins can set a default view" });
      }

      const existing = await storage.getSavedView(id);
      if (!existing) return res.status(404).json({ error: "View not found" });
      if (existing.organizationId !== orgId) {
        return res.status(403).json({ error: "Not allowed to modify this view" });
      }
      if (existing.scope !== "ORG") {
        return res.status(400).json({ error: "Only org-shared views can be set as default" });
      }

      const updated = await storage.setDefaultSavedView(id, orgId!, existing.page);

      await storage.createAuditEntry({
        userId,
        userEmail: (req.user?.email ?? null) as string | null,
        action: "SAVED_VIEW_SET_DEFAULT",
        resource: "saved_view",
        resourceId: id,
        organizationId: orgId!,
        details: { page: existing.page, name: existing.name },
        result: "SUCCESS",
      });

      res.json(updated ? viewToWire(updated, userId) : null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Clear the page default view for the org (Tenant Admin only) ──
router.delete(
  "/api/saved-views/default",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const page = pageQuery(req);
      if (!page) return res.status(400).json({ error: "Unknown or missing page" });

      const userId = req.user?.id ?? "";
      const orgId = req.activeOrganizationId || req.user?.organizationId;
      const role = req.effectiveRole || req.user?.role;

      if (!orgId) return res.status(400).json({ error: "Missing organization context" });
      if (!isTenantAdminOrAbove(role)) {
        return res.status(403).json({ error: "Only Tenant Admins can clear the default view" });
      }

      await storage.setDefaultSavedView(null, orgId, page);

      await storage.createAuditEntry({
        userId,
        userEmail: (req.user?.email ?? null) as string | null,
        action: "SAVED_VIEW_CLEARED_DEFAULT",
        resource: "saved_view",
        resourceId: `${orgId}:${page}`,
        organizationId: orgId,
        details: { page },
        result: "SUCCESS",
      });

      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Pin / unpin a view for the current user ──
router.post(
  "/api/saved-views/:id/pin",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id as string;
      if (id.startsWith("builtin:")) {
        // Built-in views are not pinnable in storage; the client can pin them
        // via local state. Reject server-side pinning to keep the model simple.
        return res.status(400).json({ error: "Built-in views cannot be pinned server-side" });
      }
      const parsed = pinBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const userId = req.user?.id ?? "";
      const orgId = req.activeOrganizationId || req.user?.organizationId;
      const existing = await storage.getSavedView(id);
      if (!existing) return res.status(404).json({ error: "View not found" });

      const isOwner = existing.ownerUserId === userId;
      const isOrgShared = existing.scope === "ORG" && existing.organizationId === orgId;
      if (!isOwner && !isOrgShared) {
        return res.status(403).json({ error: "Not allowed to pin this view" });
      }

      const updated = await storage.setSavedViewPin(id, userId, parsed.data.pinned);
      res.json(updated ? viewToWire(updated, userId) : null);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Subscribe to a view ──
const subscribeBodySchema = z.object({
  frequency: z.enum(SAVED_VIEW_DIGEST_FREQUENCIES),
});

router.post(
  "/api/saved-views/:id/subscription",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id as string;
      if (id.startsWith("builtin:")) {
        return res.status(400).json({ error: "Built-in views cannot be subscribed to" });
      }
      const parsed = subscribeBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

      const userId = req.user?.id;
      const orgId = req.activeOrganizationId || req.user?.organizationId;
      if (!userId || !orgId) return res.status(400).json({ error: "Missing user or organization context" });

      const existing = await storage.getSavedView(id);
      if (!existing) return res.status(404).json({ error: "View not found" });

      const isOwner = existing.ownerUserId === userId;
      const isOrgShared = existing.scope === "ORG" && existing.organizationId === orgId;
      if (!isOwner && !isOrgShared) {
        return res.status(403).json({ error: "Not allowed to subscribe to this view" });
      }

      const sub = await storage.upsertSavedViewSubscription({
        savedViewId: id,
        userId,
        organizationId: orgId,
        frequency: parsed.data.frequency,
      });

      res.json({ frequency: sub.frequency, createdAt: sub.createdAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Unsubscribe from a view ──
router.delete(
  "/api/saved-views/:id/subscription",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id as string;
      const userId = req.user?.id;
      if (!userId) return res.status(400).json({ error: "Missing user context" });

      await storage.deleteSavedViewSubscription(id, userId);
      res.status(204).end();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

// ── Get current user's subscription for a view ──
router.get(
  "/api/saved-views/:id/subscription",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = req.params.id as string;

      // Support one-click unsubscribe via link in email (no session auth)
      const actionParam = req.query.action as string | undefined;
      const userIdParam = req.query.userId as string | undefined;
      if (actionParam === "unsubscribe" && userIdParam) {
        await storage.deleteSavedViewSubscription(id, userIdParam);
        return res.send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center;">
          <h2>Unsubscribed</h2>
          <p>You have been unsubscribed from digest emails for this view.</p>
          <a href="${process.env.APP_PUBLIC_URL || "https://zenith.synozur.com"}/app">Return to Zenith</a>
        </body></html>`);
      }

      const userId = req.user?.id;
      if (!userId) return res.status(400).json({ error: "Missing user context" });

      const sub = await storage.getSavedViewSubscription(id, userId);
      if (!sub) return res.json(null);
      res.json({ frequency: sub.frequency, createdAt: sub.createdAt });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

export default router;
