import { Router } from "express";
import type { Request, Response } from "express";
import { recordPageView, getTrafficStats } from "../services/analytics";
import { requireAuth, requireRole } from "../middleware/rbac";
import type { AuthenticatedRequest } from "../middleware/rbac";
import { ZENITH_ROLES } from "@shared/schema";

const router = Router();

router.post("/api/analytics/page-view", async (req: Request, res: Response) => {
  try {
    const { path, sessionId, referrer, utmSource, utmMedium, utmCampaign } = req.body;
    if (!path || !sessionId) {
      return res.status(400).json({ error: "path and sessionId are required" });
    }

    const xForwardedFor = req.headers["x-forwarded-for"];
    const ip = Array.isArray(xForwardedFor)
      ? xForwardedFor[0]
      : (xForwardedFor?.split(",")[0]?.trim() || req.socket.remoteAddress || "");

    await recordPageView({
      path,
      sessionId,
      ip,
      userAgent: req.headers["user-agent"] || "",
      referrer,
      utmSource,
      utmMedium,
      utmCampaign,
    });

    res.json({ ok: true });
  } catch (err: any) {
    console.error("[analytics] page-view error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.get(
  "/api/analytics/traffic",
  requireAuth(),
  requireRole(ZENITH_ROLES.PLATFORM_OWNER),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = await getTrafficStats();
      res.json(stats);
    } catch (err: any) {
      console.error("[analytics] traffic stats error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);

export default router;
