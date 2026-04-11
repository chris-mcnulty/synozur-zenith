import { Router } from "express";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { storage } from "../storage";
import { z } from "zod";
import { ZENITH_ROLES, AI_SKILL_KEYS } from "@shared/schema";

const router = Router();

const patchSkillSchema = z.object({
  isEnabled: z.boolean(),
});

router.get("/api/ai/agent-skills", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const orgId = req.activeOrganizationId;
    if (!orgId) return res.status(400).json({ error: "No active organization" });

    const skills = await storage.getAiAgentSkills(orgId);
    return res.json({ skills });
  } catch (err) {
    console.error("[ai-agent-skills] GET error:", err);
    return res.status(500).json({ error: "Failed to fetch agent skills" });
  }
});

router.patch(
  "/api/ai/agent-skills/:skillKey",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN, ZENITH_ROLES.PLATFORM_OWNER),
  async (req: AuthenticatedRequest, res) => {
    try {
      const orgId = req.activeOrganizationId;
      if (!orgId) return res.status(400).json({ error: "No active organization" });

      const skillKey = String(req.params.skillKey);
      if (!AI_SKILL_KEYS.includes(skillKey as any)) {
        return res.status(400).json({ error: `Unknown skill key: ${skillKey}` });
      }

      const parsed = patchSkillSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid request body" });

      const updatedBy = req.user?.id ?? undefined;
      const skill = await storage.upsertAiAgentSkill(orgId, skillKey, parsed.data.isEnabled, updatedBy);

      await storage.createAuditEntry({
        userId: req.user?.id ?? null,
        userEmail: req.user?.email ?? null,
        action: "UPDATE",
        resource: "ai_agent_skill",
        resourceId: skillKey,
        organizationId: orgId,
        details: { skillKey, isEnabled: parsed.data.isEnabled },
        result: "SUCCESS",
        ipAddress: (req.ip ?? null) as string | null,
      });

      return res.json({ skill });
    } catch (err) {
      console.error("[ai-agent-skills] PATCH error:", err);
      return res.status(500).json({ error: "Failed to update agent skill" });
    }
  }
);

router.get("/api/ai/connection-status", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const orgId = req.activeOrganizationId;
    if (!orgId) return res.status(400).json({ error: "No active organization" });

    const tenants = await storage.getTenantConnections(orgId);
    const activeTenants = tenants.filter(t => t.status === "ACTIVE");

    const entraConfigured = activeTenants.some(t => t.clientId && t.clientSecret);
    const lastSuccessfulSync = activeTenants
      .filter(t => t.lastSyncAt)
      .map(t => t.lastSyncAt!)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

    const policies = await storage.getGovernancePolicies(orgId);
    const activePolicyCount = policies.filter(p => p.status === "ACTIVE").length;

    let sensitivityLabelCount = 0;
    let workspaceCount = 0;

    for (const tenant of activeTenants) {
      const labels = await storage.getSensitivityLabelsByTenantId(tenant.id);
      sensitivityLabelCount += labels.length;
    }

    const workspaces = await storage.getWorkspaces(undefined, undefined, orgId);
    workspaceCount = workspaces.length;

    const lastSyncHoursAgo = lastSuccessfulSync
      ? Math.round((Date.now() - new Date(lastSuccessfulSync).getTime()) / 3600000)
      : null;

    return res.json({
      entraConfigured,
      m365CopilotConnected: entraConfigured,
      vegaAgentConnected: false,
      lastSuccessfulSync: lastSuccessfulSync?.toISOString() ?? null,
      lastSyncHoursAgo,
      workspaceCount,
      activePolicyCount,
      sensitivityLabelCount,
      activeTenantCount: activeTenants.length,
      sources: {
        workspaceInventory: {
          active: workspaceCount > 0,
          detail: workspaceCount > 0
            ? `${workspaceCount} workspaces from ${activeTenants.length} tenant${activeTenants.length === 1 ? "" : "s"}`
            : "No workspaces synced yet",
          lastSync: lastSuccessfulSync?.toISOString() ?? null,
          hoursAgo: lastSyncHoursAgo,
        },
        governancePolicies: {
          active: activePolicyCount > 0,
          detail: activePolicyCount > 0
            ? `${activePolicyCount} active governance ${activePolicyCount === 1 ? "policy" : "policies"}`
            : "No active policies configured",
        },
        sensitivityLabels: {
          active: sensitivityLabelCount > 0,
          detail: sensitivityLabelCount > 0
            ? `${sensitivityLabelCount} label${sensitivityLabelCount === 1 ? "" : "s"} synced from SharePoint + Purview`
            : "No sensitivity labels synced",
        },
        graphConnectivity: {
          active: entraConfigured,
          detail: entraConfigured
            ? "Entra App Registration configured with delegated scopes"
            : "No Entra App Registration configured",
        },
      },
    });
  } catch (err) {
    console.error("[ai-agent-skills] GET /api/ai/connection-status error:", err);
    return res.status(500).json({ error: "Failed to fetch connection status" });
  }
});

export default router;
