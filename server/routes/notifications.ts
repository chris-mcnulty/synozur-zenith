/**
 * BL-013 — Notifications API.
 *
 *   GET    /api/notifications                – inbox (current user)
 *   GET    /api/notifications/unread-count   – badge count
 *   POST   /api/notifications/:id/read       – mark one read
 *   POST   /api/notifications/read-all       – mark all read
 *   GET    /api/notifications/preferences    – my preferences
 *   PATCH  /api/notifications/preferences    – update my preferences
 *   GET    /api/notifications/rules          – org rules (TENANT_ADMIN)
 *   PATCH  /api/notifications/rules          – update org rules (TENANT_ADMIN)
 *   POST   /api/notifications/preview        – build a digest preview (no email)
 *   POST   /api/notifications/send-now       – force-send a digest to current user
 *   GET    /api/notifications/unsubscribe    – one-click unsubscribe via token
 */
import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { storage } from "../storage";
import {
  ZENITH_ROLES,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_SEVERITIES,
  DIGEST_CADENCES,
  SERVICE_PLANS,
  type ServicePlanTier,
} from "@shared/schema";
import { logAuditEvent, AUDIT_ACTIONS } from "../services/audit-logger";
import {
  buildDigestSummary,
  sendDigestForUser,
} from "../services/notification-digest";

function planAtLeast(plan: ServicePlanTier, minimum: ServicePlanTier): boolean {
  return SERVICE_PLANS.indexOf(plan) >= SERVICE_PLANS.indexOf(minimum);
}

const router = Router();

const preferencesPatchSchema = z.object({
  digestCadence: z.enum(DIGEST_CADENCES).optional(),
  emailEnabled: z.boolean().optional(),
  inAppEnabled: z.boolean().optional(),
  realTimeAlerts: z.boolean().optional(),
  categories: z.array(z.enum(NOTIFICATION_CATEGORIES)).optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
});

const rulesPatchSchema = z.object({
  enabledCategories: z.array(z.enum(NOTIFICATION_CATEGORIES)).optional(),
  severityFloor: z.enum(NOTIFICATION_SEVERITIES).optional(),
  orgQuietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  orgQuietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
});

router.get(
  "/api/notifications",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const unreadOnly = req.query.unreadOnly === "true";
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10) || 50, 200);
    const rows = await storage.getNotificationsForUser(userId, { unreadOnly, limit });
    res.json({ notifications: rows });
  },
);

router.get(
  "/api/notifications/unread-count",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const count = await storage.getUnreadNotificationCount(req.user!.id);
    res.json({ count });
  },
);

router.post(
  "/api/notifications/:id/read",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const row = await storage.markNotificationRead(String(req.params.id), req.user!.id);
    if (!row) return res.status(404).json({ error: "Notification not found" });
    res.json({ notification: row });
  },
);

router.post(
  "/api/notifications/read-all",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const count = await storage.markAllNotificationsRead(req.user!.id);
    res.json({ marked: count });
  },
);

router.get(
  "/api/notifications/preferences",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const prefs = await storage.upsertNotificationPreferences(req.user!.id, {});
    // Strip the unsubscribe token: it's an out-of-band email-only credential
    // and should never appear in authenticated API responses.
    const { unsubscribeToken: _omitted, ...safe } = prefs;
    res.json({ preferences: safe });
  },
);

router.patch(
  "/api/notifications/preferences",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const parsed = preferencesPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid preferences", details: parsed.error.flatten() });
    }

    // Plan gate: real-time alerts require Professional+.
    if (parsed.data.realTimeAlerts === true) {
      const orgId = req.activeOrganizationId || req.user?.organizationId || undefined;
      const org = await storage.getOrganization(orgId);
      const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
      if (!planAtLeast(plan, "PROFESSIONAL")) {
        return res.status(403).json({
          error: "FEATURE_GATED",
          message: "Real-time alerts require the Professional plan or higher.",
          currentPlan: plan,
        });
      }
    }

    const updated = await storage.upsertNotificationPreferences(req.user!.id, parsed.data);
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.NOTIFICATION_PREFERENCES_UPDATED,
      resource: "notification_preferences",
      resourceId: updated.id,
      details: parsed.data,
    });
    res.json({ preferences: updated });
  },
);

router.get(
  "/api/notifications/rules",
  requireAuth(),
  requireRole(ZENITH_ROLES.TENANT_ADMIN, ZENITH_ROLES.GOVERNANCE_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!orgId) return res.status(400).json({ error: "No active organization" });
    const rules = await storage.upsertNotificationRules(orgId, {});
    res.json({ rules });
  },
);

router.patch(
  "/api/notifications/rules",
  requireAuth(),
  requireRole(ZENITH_ROLES.TENANT_ADMIN),
  async (req: AuthenticatedRequest, res) => {
    const orgId = req.activeOrganizationId || req.user?.organizationId;
    if (!orgId) return res.status(400).json({ error: "No active organization" });

    // Plan gate: advanced rule customization is Standard+.
    const org = await storage.getOrganization(orgId);
    const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
    if (!planAtLeast(plan, "STANDARD")) {
      return res.status(403).json({
        error: "FEATURE_GATED",
        message: "Advanced notification rule customization requires the Standard plan or higher.",
        currentPlan: plan,
      });
    }

    const parsed = rulesPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid rules", details: parsed.error.flatten() });
    }
    const updated = await storage.upsertNotificationRules(orgId, parsed.data);
    await logAuditEvent(req, {
      action: AUDIT_ACTIONS.NOTIFICATION_RULES_UPDATED,
      resource: "notification_rules",
      resourceId: updated.id,
      organizationId: orgId,
      details: parsed.data,
    });
    res.json({ rules: updated });
  },
);

router.post(
  "/api/notifications/preview",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const prefs = await storage.upsertNotificationPreferences(req.user!.id, {});
    const cadence = (prefs.digestCadence === "off" ? "weekly" : prefs.digestCadence) as
      | "daily"
      | "weekly";
    const summary = await buildDigestSummary(req.user!.id, cadence);
    res.json({
      cadence,
      total: summary.total,
      byCategory: summary.byCategory,
      bySeverity: summary.bySeverity,
      windowStart: summary.windowStart,
      windowEnd: summary.windowEnd,
      notifications: summary.notifications.slice(0, 25),
    });
  },
);

router.post(
  "/api/notifications/send-now",
  requireAuth(),
  async (req: AuthenticatedRequest, res) => {
    const result = await sendDigestForUser(req.user!.id, { force: true });
    if (!result.sent) return res.status(400).json({ error: "Digest not sent", reason: result.reason });
    res.json({ sent: true, total: result.total });
  },
);

router.get("/api/notifications/unsubscribe", async (req, res) => {
  const token = String(req.query.token || "");
  if (!token) return res.status(400).send("Missing token");
  const prefs = await storage.getNotificationPreferencesByToken(token);
  if (!prefs) return res.status(404).send("Invalid unsubscribe link");
  await storage.upsertNotificationPreferences(prefs.userId, {
    digestCadence: "off",
    emailEnabled: false,
  });
  await logAuditEvent(null, {
    action: AUDIT_ACTIONS.NOTIFICATION_PREFERENCES_UPDATED,
    resource: "notification_preferences",
    resourceId: prefs.id,
    userId: prefs.userId,
    details: { source: "unsubscribe_link", digestCadence: "off", emailEnabled: false },
  });
  res
    .status(200)
    .type("html")
    .send(`<!DOCTYPE html><html><head><title>Unsubscribed</title></head><body style="font-family:-apple-system,sans-serif;padding:48px;background:#f5f5f5;text-align:center;"><div style="max-width:480px;margin:0 auto;background:#fff;padding:32px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);"><h1 style="color:#5b0fbc;margin:0 0 12px;">You're unsubscribed</h1><p style="color:#374151;">You will no longer receive Zenith governance digest emails. You can re-enable them anytime from <a href="/app/settings/notifications" style="color:#5b0fbc;">Notification Preferences</a>.</p></div></body></html>`);
});

export default router;
