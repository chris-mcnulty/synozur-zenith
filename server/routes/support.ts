import { Router } from "express";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { ZENITH_ROLES } from "@shared/schema";
import { storage } from "../storage";
import { z } from "zod";
import { sendSupportTicketNotification, sendTicketConfirmationToSubmitter } from "../email-support";
import { createPlannerTaskForTicket } from "../services/planner";

const router = Router();

const createTicketSchema = z.object({
  category: z.enum(["bug", "feature_request", "question", "feedback"]),
  subject: z.string().min(1).max(255),
  description: z.string().min(1),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

const addReplySchema = z.object({
  message: z.string().min(1),
  isInternal: z.boolean().default(false),
});

const updateStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
});

function isPlatformOwner(req: AuthenticatedRequest): boolean {
  return (req.effectiveRole || req.user?.role) === ZENITH_ROLES.PLATFORM_OWNER;
}

router.get("/api/support/tickets", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isAdmin = isPlatformOwner(req);
    const orgId = req.activeOrganizationId ?? null;
    const tickets = await storage.getSupportTickets(orgId, user.id, isAdmin);
    return res.json(tickets);
  } catch (err) {
    console.error("[support] GET /api/support/tickets error:", err);
    return res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

router.post("/api/support/tickets", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const orgId = req.activeOrganizationId;
    if (!orgId) {
      return res.status(400).json({ error: "No active organization" });
    }
    const parsed = createTicketSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }
    const ticketNumber = await storage.getNextTicketNumber(orgId);
    const ticket = await storage.createSupportTicket({
      ...parsed.data,
      ticketNumber,
      organizationId: orgId,
      userId: user.id,
      applicationSource: "Zenith",
      status: "open",
    });

    let org = null;
    try {
      org = await storage.getOrganization(orgId);
    } catch (_) {}

    Promise.all([
      sendSupportTicketNotification(ticket, user, org).catch(err =>
        console.error("[SUPPORT] Failed to send team notification:", err)
      ),
      sendTicketConfirmationToSubmitter(ticket, user).catch(err =>
        console.error("[SUPPORT] Failed to send confirmation:", err)
      ),
      createPlannerTaskForTicket(ticket).then(async taskId => {
        if (taskId) {
          try {
            await storage.setSupportTicketPlannerTaskId(ticket.id, taskId);
          } catch (err) {
            console.error(`[SUPPORT] Failed to persist plannerTaskId for ticket ${ticket.id}:`, err);
          }
        }
      }).catch(err =>
        console.error("[SUPPORT] Failed to create Planner task:", err)
      ),
    ]);

    return res.status(201).json(ticket);
  } catch (err) {
    console.error("[support] POST /api/support/tickets error:", err);
    return res.status(500).json({ error: "Failed to create ticket" });
  }
});

router.get("/api/support/tickets/:id", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isAdmin = isPlatformOwner(req);
    const orgId = isAdmin ? null : (req.activeOrganizationId ?? null);
    const userId = isAdmin ? undefined : user.id;
    const ticket = await storage.getSupportTicket(req.params.id as string, orgId, userId);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    const replies = await storage.getTicketReplies(req.params.id as string, isAdmin);

    const authorIds = [...new Set([ticket.userId, ...replies.map((r) => r.userId)])];
    const authorMap: Record<string, { name: string | null; email: string }> = {};
    await Promise.all(
      authorIds.map(async (uid) => {
        const u = await storage.getUser(uid);
        if (u) authorMap[uid] = { name: u.name ?? null, email: u.email };
      })
    );

    const enrichedReplies = replies.map((r) => ({
      ...r,
      authorName: authorMap[r.userId]?.name || authorMap[r.userId]?.email || r.userId,
      authorEmail: authorMap[r.userId]?.email || r.userId,
    }));

    return res.json({
      ticket: {
        ...ticket,
        authorName: authorMap[ticket.userId]?.name || authorMap[ticket.userId]?.email || ticket.userId,
        authorEmail: authorMap[ticket.userId]?.email || ticket.userId,
      },
      replies: enrichedReplies,
    });
  } catch (err) {
    console.error("[support] GET /api/support/tickets/:id error:", err);
    return res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

router.post("/api/support/tickets/:id/replies", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isAdmin = isPlatformOwner(req);
    const orgId = isAdmin ? null : (req.activeOrganizationId ?? null);
    const userId = isAdmin ? undefined : user.id;
    const ticket = await storage.getSupportTicket(req.params.id as string, orgId, userId);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    const parsed = addReplySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    }
    const isInternal = parsed.data.isInternal && isAdmin;
    const reply = await storage.addTicketReply(req.params.id as string, user.id, parsed.data.message, isInternal);
    const replyUser = await storage.getUser(user.id);
    return res.status(201).json({
      ...reply,
      authorName: replyUser?.name || replyUser?.email || user.id,
      authorEmail: replyUser?.email || user.id,
    });
  } catch (err) {
    console.error("[support] POST /api/support/tickets/:id/replies error:", err);
    return res.status(500).json({ error: "Failed to add reply" });
  }
});

router.patch("/api/support/tickets/:id/close", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const isAdmin = isPlatformOwner(req);
    const orgId = isAdmin ? null : (req.activeOrganizationId ?? null);
    const userId = isAdmin ? undefined : user.id;
    const ticket = await storage.getSupportTicket(req.params.id as string, orgId, userId);
    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found" });
    }
    const updated = await storage.closeTicket(req.params.id as string, user.id);
    return res.json(updated);
  } catch (err) {
    console.error("[support] PATCH /api/support/tickets/:id/close error:", err);
    return res.status(500).json({ error: "Failed to close ticket" });
  }
});

router.patch(
  "/api/support/tickets/:id/status",
  requireAuth(),
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = updateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid status", details: parsed.error.flatten() });
      }
      const ticket = await storage.getSupportTicket(req.params.id as string, null);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      const updated = await storage.updateTicketStatus(req.params.id as string, parsed.data.status);
      return res.json(updated);
    } catch (err) {
      console.error("[support] PATCH /api/support/tickets/:id/status error:", err);
      return res.status(500).json({ error: "Failed to update ticket status" });
    }
  }
);

export default router;
