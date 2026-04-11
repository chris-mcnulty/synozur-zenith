/**
 * Provisioning Template Library (BL-005)
 *
 * Built-in templates used to seed governed provisioning requests. Each template
 * defines the workspace type, sensitivity posture, sharing defaults, retention
 * policy, and naming prefix.
 *
 * Templates are code-resident rather than database-backed so that:
 *   1. They are always available even in freshly bootstrapped organizations
 *   2. They can't drift from the enforcement logic that consumes them
 *   3. No schema change is required to introduce the library
 *
 * Custom per-organization templates (database-backed CRUD) are a future
 * enhancement tracked under BL-011.
 */

import type { Workspace } from "@shared/schema";

export type SensitivityTier = "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "HIGHLY_CONFIDENTIAL";
export type ProjectType = "DEAL" | "PORTCO" | "GENERAL";
export type WorkspaceType = "TEAM_SITE" | "COMMUNICATION_SITE";
export type NamingPrefix = "DEAL-" | "PORTCO-" | "GEN-";

export interface ProvisioningTemplate {
  id: string;
  name: string;
  description: string;
  workspaceType: WorkspaceType;
  projectType: ProjectType;
  namingPrefix: NamingPrefix;
  sensitivity: SensitivityTier;
  externalSharing: boolean;
  teamsConnected: boolean;
  retentionPolicy: string;
  minOwners: number;
  /** Intent of the template — shown in the UI to explain when to use it. */
  intent: string;
}

/**
 * Retention policy mapping derived from lifecycle classification and sensitivity.
 * This replaces the previously hardcoded "Default 7 Year" value.
 *
 * Mapping rules (spec §3.2):
 *   - Deal rooms           → 10 years (regulatory hold for M&A records; takes
 *                            precedence over the Highly Confidential default)
 *   - Highly Confidential → mandatory 7-year retention (for non-Deal workspaces)
 *   - Portfolio Company    → 7 years (operational records)
 *   - General/Internal     → 5 years (default corporate records)
 *   - Public               → 2 years (marketing/external content)
 */
export function deriveRetentionPolicy(
  projectType: ProjectType | string,
  sensitivity: SensitivityTier | string,
): string {
  if (projectType === "DEAL") return "Deal Room — 10 Year Hold";
  if (sensitivity === "HIGHLY_CONFIDENTIAL") return "Highly Confidential — 7 Year Hold";
  if (projectType === "PORTCO") return "Portfolio Company — 7 Year Hold";
  if (sensitivity === "PUBLIC") return "Public Content — 2 Year";
  return "Corporate Default — 5 Year";
}

export const BUILT_IN_TEMPLATES: ProvisioningTemplate[] = [
  {
    id: "tpl-deal-room",
    name: "Deal Room",
    description: "Highly restricted workspace for live M&A transactions. Dual ownership enforced, external sharing blocked, 10-year retention hold.",
    workspaceType: "TEAM_SITE",
    projectType: "DEAL",
    namingPrefix: "DEAL-",
    sensitivity: "HIGHLY_CONFIDENTIAL",
    externalSharing: false,
    teamsConnected: true,
    retentionPolicy: deriveRetentionPolicy("DEAL", "HIGHLY_CONFIDENTIAL"),
    minOwners: 2,
    intent: "Use for confidential transactions where content must never leak and regulatory retention applies.",
  },
  {
    id: "tpl-portco",
    name: "Portfolio Company",
    description: "Operational workspace for portfolio company collaboration with the fund team. Confidential default, controlled external sharing.",
    workspaceType: "TEAM_SITE",
    projectType: "PORTCO",
    namingPrefix: "PORTCO-",
    sensitivity: "CONFIDENTIAL",
    externalSharing: true,
    teamsConnected: true,
    retentionPolicy: deriveRetentionPolicy("PORTCO", "CONFIDENTIAL"),
    minOwners: 2,
    intent: "Use for portfolio company board materials, operating reports, and working team collaboration.",
  },
  {
    id: "tpl-internal",
    name: "Internal Team",
    description: "Standard internal team workspace with Teams connectivity. Confidential default, no external sharing.",
    workspaceType: "TEAM_SITE",
    projectType: "GENERAL",
    namingPrefix: "GEN-",
    sensitivity: "CONFIDENTIAL",
    externalSharing: false,
    teamsConnected: true,
    retentionPolicy: deriveRetentionPolicy("GENERAL", "CONFIDENTIAL"),
    minOwners: 2,
    intent: "Use for normal cross-functional team collaboration that should not leave the organization.",
  },
  {
    id: "tpl-exec-comm",
    name: "Executive Communication Site",
    description: "Communication site for executive leadership announcements. Highly Confidential with forced 7-year hold.",
    workspaceType: "COMMUNICATION_SITE",
    projectType: "GENERAL",
    namingPrefix: "GEN-",
    sensitivity: "HIGHLY_CONFIDENTIAL",
    externalSharing: false,
    teamsConnected: false,
    retentionPolicy: deriveRetentionPolicy("GENERAL", "HIGHLY_CONFIDENTIAL"),
    minOwners: 2,
    intent: "Use for executive communications, board-adjacent content, and strategic announcements.",
  },
  {
    id: "tpl-public",
    name: "Public Communication Site",
    description: "Externally facing communication site for marketing and public content. Public label, 2-year retention.",
    workspaceType: "COMMUNICATION_SITE",
    projectType: "GENERAL",
    namingPrefix: "GEN-",
    sensitivity: "PUBLIC",
    externalSharing: true,
    teamsConnected: false,
    retentionPolicy: deriveRetentionPolicy("GENERAL", "PUBLIC"),
    minOwners: 2,
    intent: "Use for marketing, investor relations, and public-facing announcements.",
  },
];

export function getTemplateById(id: string): ProvisioningTemplate | undefined {
  return BUILT_IN_TEMPLATES.find(t => t.id === id);
}

/**
 * Validate that a governed name respects the template's naming prefix.
 */
export function validateGovernedName(name: string, template: ProvisioningTemplate): string | null {
  if (!name.startsWith(template.namingPrefix)) {
    return `Governed name must start with "${template.namingPrefix}" for the ${template.name} template.`;
  }
  const remainder = name.slice(template.namingPrefix.length);
  if (remainder.length < 3) {
    return `Governed name requires at least 3 characters after the "${template.namingPrefix}" prefix.`;
  }
  if (!/^[A-Za-z0-9_-]+$/.test(remainder)) {
    return `Governed name may only contain letters, numbers, hyphens, and underscores after the prefix.`;
  }
  return null;
}

/**
 * Cross-check a proposed provisioning payload against a template to catch
 * combinations that would immediately violate the workspace PATCH sensitivity
 * policy (e.g. HIGHLY_CONFIDENTIAL with external sharing).
 */
export function validateProvisioningPayload(payload: {
  sensitivity?: string;
  externalSharing?: boolean;
  siteOwners?: unknown[];
}, template?: ProvisioningTemplate): string | null {
  const sensitivity = payload.sensitivity ?? template?.sensitivity;
  const externalSharing = payload.externalSharing ?? template?.externalSharing ?? false;
  const owners = Array.isArray(payload.siteOwners) ? payload.siteOwners : [];

  if (sensitivity === "HIGHLY_CONFIDENTIAL" && externalSharing === true) {
    return "External sharing cannot be enabled on Highly Confidential workspaces. Change the sensitivity or disable external sharing.";
  }
  const minOwners = template?.minOwners ?? 2;
  if (owners.length < minOwners) {
    return `At least ${minOwners} owners are required (dual-ownership rule).`;
  }
  return null;
}
