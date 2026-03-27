import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/rbac";
import { storage } from "../storage";
import { z } from "zod";

const router = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  tenantConnectionId: z.string().optional(),
});

type Intent =
  | "RENEWAL"
  | "COPILOT"
  | "ORPHAN"
  | "EXTERNAL_SHARING"
  | "SENSITIVITY"
  | "PROVISION"
  | "STATS"
  | "POLICIES"
  | "HELP"
  | "GENERAL";

function detectIntent(msg: string): Intent {
  const m = msg.toLowerCase();
  if (/renew|inactive|expired|up for review|lifecycle|archive|180 days|90 days|stale/.test(m)) return "RENEWAL";
  if (/copilot|m365 copilot|ai ready|copilot ready|why can't copilot|why cant copilot|copilot eligible|blocked from copilot/.test(m)) return "COPILOT";
  if (/orphan|no owner|unowned|who owns|without owner|missing owner/.test(m)) return "ORPHAN";
  if (/external|guest|sharing|oversharing|share outside|external user|external access/.test(m)) return "EXTERNAL_SHARING";
  if (/sensitivity|confidential|label|purview|classification/.test(m)) return "SENSITIVITY";
  if (/create|provision|new site|new team|new workspace|request a site|set up a site/.test(m)) return "PROVISION";
  if (/how many|total|count|summary|overview|stats|how much/.test(m)) return "STATS";
  if (/polic|rule|governance|complian/.test(m)) return "POLICIES";
  if (/help|what can you|what do you|capabilities|features/.test(m)) return "HELP";
  return "GENERAL";
}

const daysSince = (date: string | null): number => {
  if (!date) return 9999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
};

function pluralize(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

router.post("/api/ai/chat", requireAuth(), async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const orgId = req.activeOrganizationId;
    if (!orgId) return res.status(400).json({ error: "No active organization" });

    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid request" });

    const { message, tenantConnectionId } = parsed.data;
    const intent = detectIntent(message);

    // Fetch workspaces (org-scoped, optionally tenant-filtered)
    const workspaces = await storage.getWorkspaces(undefined, tenantConnectionId, orgId);
    const policies = await storage.getGovernancePolicies(orgId);
    const tenants = await storage.getTenantConnections(orgId);

    let content = "";
    let action: string | null = null;
    let data: Record<string, unknown> | null = null;

    switch (intent) {
      case "RENEWAL": {
        const overdue = workspaces.filter(w => daysSince(w.lastActivityDate) >= 180);
        const atRisk = workspaces.filter(w => {
          const d = daysSince(w.lastActivityDate);
          return d >= 90 && d < 180;
        });
        const topOverdue = overdue
          .sort((a, b) => daysSince(b.lastActivityDate) - daysSince(a.lastActivityDate))
          .slice(0, 3);

        if (overdue.length === 0 && atRisk.length === 0) {
          content = `Great news — all ${workspaces.length} managed workspaces have been active within the last 90 days. No lifecycle reviews are pending.`;
        } else {
          content = `I found **${pluralize(overdue.length, "workspace")}** that are overdue for review (inactive 180+ days) and **${atRisk.length}** approaching the threshold (90–180 days inactive).`;
          if (topOverdue.length > 0) {
            const names = topOverdue.map(w => `• **${w.displayName}** (inactive ${daysSince(w.lastActivityDate)}d)`).join("\n");
            content += `\n\nMost urgent:\n${names}`;
          }
          content += "\n\nWould you like me to prepare a review summary or send notification emails to the site owners?";
          action = "View Lifecycle Review";
        }
        data = { overdueCount: overdue.length, atRiskCount: atRisk.length };
        break;
      }

      case "COPILOT": {
        const copilotPolicy = policies.find(p => p.isActive && p.name.toLowerCase().includes("copilot"));
        const highlyConfidential = workspaces.filter(w => w.sensitivity === "HIGHLY_CONFIDENTIAL");
        const withExternalSharing = workspaces.filter(w => w.externalSharing);
        const orphaned = workspaces.filter(w => {
          const owners = Array.isArray(w.siteOwners) ? w.siteOwners : [];
          return owners.length === 0;
        });

        const blockedCount = new Set([
          ...highlyConfidential.map(w => w.id),
          ...withExternalSharing.map(w => w.id),
        ]).size;
        const eligibleCount = workspaces.length - blockedCount;

        content = `Zenith's **Copilot Readiness** evaluation covers ${workspaces.length} managed workspaces${tenantConnectionId ? " in this tenant" : " across all tenants"}.

**${eligibleCount}** sites are Copilot-eligible. **${blockedCount}** are currently excluded:

• **${highlyConfidential.length}** tagged as "Highly Confidential" — excluded from Copilot per policy to prevent AI from surfacing sensitive content
• **${withExternalSharing.length}** have external sharing enabled — Zenith excludes these until sharing is remediated${orphaned.length > 0 ? `\n• **${orphaned.length}** are orphaned (no owner assigned) — these are flagged for review` : ""}`;

        if (copilotPolicy) {
          content += `\n\nThe active **"${copilotPolicy.name}"** policy governs this evaluation. Zenith writes the \`ZenithCopilotReady\` property to each SharePoint site's property bag, which Purview Adaptive Scopes query directly.`;
        }

        action = eligibleCount < workspaces.length ? "View Copilot Readiness Report" : null;
        data = { eligibleCount, blockedCount, total: workspaces.length };
        break;
      }

      case "ORPHAN": {
        const orphaned = workspaces.filter(w => {
          const owners = Array.isArray(w.siteOwners) ? w.siteOwners : [];
          return owners.length === 0;
        });

        if (orphaned.length === 0) {
          content = `All ${workspaces.length} managed workspaces have at least one assigned owner. No orphaned workspaces detected.`;
        } else {
          const sample = orphaned.slice(0, 3).map(w => `• **${w.displayName}**`).join("\n");
          content = `I found **${pluralize(orphaned.length, "orphaned workspace")}** across your managed inventory — these have no active owner assigned in Entra ID.\n\n${sample}${orphaned.length > 3 ? `\n• ... and ${orphaned.length - 3} more` : ""}\n\nI'd recommend initiating an **Ownership Confirmation** review. Zenith can send an ownership reclaim email to the previous owner's manager automatically.`;
          action = "Review Orphaned Workspaces";
        }
        data = { orphanedCount: orphaned.length };
        break;
      }

      case "EXTERNAL_SHARING": {
        const external = workspaces.filter(w => w.externalSharing);
        const highRisk = external.filter(w => w.sensitivity === "HIGHLY_CONFIDENTIAL" || w.sensitivity === "CONFIDENTIAL");

        if (external.length === 0) {
          content = `No workspaces currently have external sharing enabled. Your tenant has a clean external sharing posture across all ${workspaces.length} managed sites.`;
        } else {
          content = `**${pluralize(external.length, "workspace")}** (${Math.round((external.length / workspaces.length) * 100)}% of your inventory) have external sharing enabled.`;
          if (highRisk.length > 0) {
            content += `\n\n⚠️ **${pluralize(highRisk.length, "high-risk site")}** have both external sharing AND a Confidential or Highly Confidential sensitivity label — these should be reviewed immediately.`;
            action = "Review External Sharing Risks";
          } else {
            content += "\n\nAll sites with external sharing carry appropriate sensitivity labels. No immediate governance risk detected.";
          }
        }
        data = { externalCount: external.length, highRiskCount: highRisk.length };
        break;
      }

      case "SENSITIVITY": {
        const counts: Record<string, number> = {
          HIGHLY_CONFIDENTIAL: 0,
          CONFIDENTIAL: 0,
          INTERNAL: 0,
          PUBLIC: 0,
        };
        for (const w of workspaces) {
          if (counts[w.sensitivity] !== undefined) counts[w.sensitivity]++;
        }
        const labelNames: Record<string, string> = {
          HIGHLY_CONFIDENTIAL: "Highly Confidential",
          CONFIDENTIAL: "Confidential",
          INTERNAL: "Internal",
          PUBLIC: "Public",
        };
        const breakdown = Object.entries(counts)
          .filter(([, n]) => n > 0)
          .map(([k, n]) => `• **${labelNames[k]}**: ${n} site${n === 1 ? "" : "s"} (${Math.round((n / workspaces.length) * 100)}%)`)
          .join("\n");

        content = `Sensitivity label coverage across ${workspaces.length} managed workspaces:\n\n${breakdown}\n\nZenith enforces sensitivity labels through Purview via SharePoint property bag writeback. The \`ZenithCopilotReady\` managed property reflects the outcome of label-based policy evaluation.`;
        data = counts;
        break;
      }

      case "PROVISION": {
        const tenantNames = tenants.filter(t => t.status === "ACTIVE").map(t => t.tenantName);
        content = `Zenith manages governed workspace provisioning across ${tenantNames.length > 0 ? `**${tenantNames.join(", ")}**` : "your connected tenants"}.\n\nWhen provisioning a new SharePoint site, Zenith:\n\n1. **Validates** the request against active governance policies\n2. **Applies naming conventions** (e.g., DEAL- or PORTCO- prefix based on project type)\n3. **Sets sensitivity labels** — defaults to "Highly Confidential" for Deal and PortCo sites\n4. **Registers the site** in the Zenith inventory with metadata for lifecycle tracking\n5. **Writes governance properties** to the SharePoint property bag for Purview Adaptive Scope targeting\n\nPlatform Owners and Governance Admins can provision directly. Operators require approval routing.`;
        action = "Start Provisioning";
        break;
      }

      case "STATS": {
        const overdue = workspaces.filter(w => daysSince(w.lastActivityDate) >= 180).length;
        const orphaned = workspaces.filter(w => {
          const owners = Array.isArray(w.siteOwners) ? w.siteOwners : [];
          return owners.length === 0;
        }).length;
        const external = workspaces.filter(w => w.externalSharing).length;
        const highlyConf = workspaces.filter(w => w.sensitivity === "HIGHLY_CONFIDENTIAL").length;
        const activePolicies = policies.filter(p => p.isActive).length;

        content = `Here's a live governance summary for your ${tenants.length > 1 ? `${tenants.length} connected tenants` : "connected tenant"}:

• **${workspaces.length}** total managed workspaces
• **${activePolicies}** active governance policies
• **${overdue}** workspaces overdue for lifecycle review
• **${orphaned}** orphaned workspaces (no owner)
• **${external}** workspaces with external sharing enabled
• **${highlyConf}** sites classified as Highly Confidential (${Math.round((highlyConf / workspaces.length) * 100)}%)

Is there a specific area you'd like to explore further?`;
        data = { total: workspaces.length, overdue, orphaned, external, highlyConf, activePolicies };
        break;
      }

      case "POLICIES": {
        const active = policies.filter(p => p.isActive);
        const inactive = policies.filter(p => !p.isActive);
        const names = active.slice(0, 5).map(p => `• **${p.name}**`).join("\n");
        content = `Zenith has **${activePolicies(policies)}** active governance ${activePolicies(policies) === 1 ? "policy" : "policies"} configured for your organization:

${names}${active.length > 5 ? `\n• ... and ${active.length - 5} more` : ""}${inactive.length > 0 ? `\n\n**${inactive.length}** ${inactive.length === 1 ? "policy is" : "policies are"} currently inactive.` : ""}

Each policy evaluates workspaces against configurable rules and writes the outcome to SharePoint property bags. Zenith supports custom policy outcomes beyond Copilot Readiness — such as PII Approved, External Sharing Risk, and Retention Compliance.`;
        action = "Manage Policies";
        break;
      }

      case "HELP": {
        content = `I'm the **Zenith AI Governance Assistant**. I can help you with:\n\n• **Lifecycle reviews** — "Which workspaces are overdue for renewal?"\n• **Copilot readiness** — "How many sites are Copilot-eligible?"\n• **Orphan detection** — "Show me workspaces with no owner"\n• **External sharing risk** — "Which sites have external guests?"\n• **Sensitivity labels** — "What's our label coverage?"\n• **Provisioning** — "How do I create a new Deal site?"\n• **Policy explanation** — "What governance policies are active?"\n• **Platform stats** — "Give me a governance summary"\n\nAll answers draw directly from your live workspace inventory.`;
        break;
      }

      default: {
        content = `I can help you with governance questions about your ${workspaces.length} managed workspaces. Try asking:\n\n• "Which sites are overdue for review?"\n• "How many orphaned workspaces do I have?"\n• "Which sites are Copilot-eligible?"\n• "What's our external sharing posture?"\n• "Give me a governance summary"\n\nType **help** to see all supported questions.`;
        break;
      }
    }

    return res.json({ content, action, data, intent });
  } catch (err) {
    console.error("[ai-chat] POST /api/ai/chat error:", err);
    return res.status(500).json({ error: "Chat request failed" });
  }
});

function activePolicies(policies: { isActive: boolean }[]): number {
  return policies.filter(p => p.isActive).length;
}

export default router;
