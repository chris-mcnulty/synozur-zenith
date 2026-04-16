/**
 * M365 30-Day Overview Report (premium)
 *
 * Aggregates 30-day change signals across SharePoint sites, Teams & channels,
 * document libraries, and external sharing, pulls in the latest Copilot
 * prompt assessment, and asks an LLM to synthesize an executive narrative
 * plus a prioritized recommendation set.
 *
 * Runs asynchronously. Callers receive a report id immediately and poll
 * GET /api/m365-overview-reports/:id for status / result.
 */

import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  channelsInventory,
  documentLibraries,
  m365OverviewReports,
  sharingLinksInventory,
  teamsInventory,
  workspaces,
  type M365OverviewRecommendation,
  type M365OverviewReport,
  type M365OverviewSnapshot,
} from "@shared/schema";
import { storage } from "../storage";
import { completeForFeature, type AIMessage } from "./ai-provider";
import { extractJson, sanitizeRecommendations } from "./m365-overview-report-helpers";

export { extractJson, sanitizeRecommendations };

const WINDOW_DAYS = 30;

// ─── Aggregation helpers ────────────────────────────────────────────────────

function windowBounds(now: Date = new Date()): {
  windowStart: Date;
  windowEnd: Date;
  priorStart: Date;
  priorEnd: Date;
} {
  const windowEnd = now;
  const windowStart = new Date(windowEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const priorEnd = windowStart;
  const priorStart = new Date(priorEnd.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { windowStart, windowEnd, priorStart, priorEnd };
}

function parseIsoLike(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function inWindow(d: Date | null, start: Date, end: Date): boolean {
  return d !== null && d.getTime() >= start.getTime() && d.getTime() < end.getTime();
}

function percentDelta(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return Math.round(((current - prior) / prior) * 10000) / 100;
}

// ─── Snapshot assembly ──────────────────────────────────────────────────────

async function collectSnapshot(
  tenantConnectionId: string,
): Promise<M365OverviewSnapshot> {
  const { windowStart, windowEnd, priorStart, priorEnd } = windowBounds();
  const caveats: string[] = [];

  // --- Sites / workspaces -------------------------------------------------
  const siteRows = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.tenantConnectionId, tenantConnectionId));

  let newSites = 0;
  let newSitesPrior = 0;
  let archivedSites = 0;
  let deletedSites = 0;
  let newlyInactive = 0;
  const growthRanking: Array<{
    workspaceId: string;
    displayName: string;
    siteUrl: string | null;
    storageUsedBytes: number;
  }> = [];

  for (const site of siteRows) {
    const created = parseIsoLike(site.siteCreatedDate);
    if (inWindow(created, windowStart, windowEnd)) newSites += 1;
    if (inWindow(created, priorStart, priorEnd)) newSitesPrior += 1;

    if (site.isArchived) archivedSites += 1;
    if (site.isDeleted) deletedSites += 1;

    const lastActive = parseIsoLike(site.lastActivityDate);
    if (inWindow(lastActive, priorStart, priorEnd)) {
      newlyInactive += 1;
    }

    // Historical storage isn't retained, so we surface top absolute storage
    // as a proxy for "growth attention" targets and caveat it.
    const used = Number(site.storageUsedBytes ?? 0);
    growthRanking.push({
      workspaceId: site.id,
      displayName: site.displayName,
      siteUrl: site.siteUrl ?? null,
      storageUsedBytes: used,
    });
  }

  growthRanking.sort((a, b) => b.storageUsedBytes - a.storageUsedBytes);
  if (siteRows.length > 0) {
    caveats.push(
      "Site storage deltas use current totals as a proxy; historical snapshots are not retained in this window.",
    );
  }

  const storageTop10Bytes = growthRanking
    .slice(0, 10)
    .reduce((sum, w) => sum + w.storageUsedBytes, 0);

  // --- Teams --------------------------------------------------------------
  const teamRows = await db
    .select()
    .from(teamsInventory)
    .where(eq(teamsInventory.tenantConnectionId, tenantConnectionId));

  let newTeams = 0;
  let newTeamsPrior = 0;
  for (const t of teamRows) {
    const created = parseIsoLike(t.createdDateTime);
    if (inWindow(created, windowStart, windowEnd)) newTeams += 1;
    if (inWindow(created, priorStart, priorEnd)) newTeamsPrior += 1;
  }

  const topActiveTeams = teamRows
    .slice()
    .sort((a, b) => (b.memberCount ?? 0) - (a.memberCount ?? 0))
    .slice(0, 5)
    .map(t => ({
      teamId: t.teamId,
      displayName: t.displayName,
      channelCount: 0,
      memberCount: t.memberCount ?? null,
    }));

  // --- Channels -----------------------------------------------------------
  const channelRows = await db
    .select()
    .from(channelsInventory)
    .where(eq(channelsInventory.tenantConnectionId, tenantConnectionId));

  const channelsPerTeam = new Map<string, number>();
  let newChannels = 0;
  let remixedChannels = 0;
  let privateChannels = 0;
  let sharedChannels = 0;
  for (const c of channelRows) {
    channelsPerTeam.set(c.teamId, (channelsPerTeam.get(c.teamId) ?? 0) + 1);
    const created = parseIsoLike(c.createdDateTime);
    const discovered = c.lastDiscoveredAt instanceof Date ? c.lastDiscoveredAt : parseIsoLike(c.lastDiscoveredAt as unknown as string | null);

    const createdInWindow = inWindow(created, windowStart, windowEnd);
    if (createdInWindow) newChannels += 1;
    // "Remixed" proxy: created in-window OR re-surfaced by discovery in-window
    // with a non-standard membership type (private/shared channels reorganized).
    if (createdInWindow || (inWindow(discovered, windowStart, windowEnd) && c.membershipType !== "standard")) {
      remixedChannels += 1;
    }
    if (c.membershipType === "private") privateChannels += 1;
    if (c.membershipType === "shared") sharedChannels += 1;
  }
  for (const t of topActiveTeams) {
    t.channelCount = channelsPerTeam.get(t.teamId) ?? 0;
  }

  // --- Document libraries -------------------------------------------------
  const libraryRows = await db
    .select()
    .from(documentLibraries)
    .where(eq(documentLibraries.tenantConnectionId, tenantConnectionId));

  let newLibraries = 0;
  let versionSprawlFlagged = 0;
  let deepFolderFlagged = 0;
  let unlabeledLibraries = 0;
  let depthSum = 0;
  let depthCount = 0;
  for (const lib of libraryRows) {
    const created = parseIsoLike(lib.createdGraphAt);
    if (inWindow(created, windowStart, windowEnd)) newLibraries += 1;
    if (lib.flaggedVersionSprawl) versionSprawlFlagged += 1;
    if ((lib.maxFolderDepth ?? 0) >= 8) deepFolderFlagged += 1;
    if (!lib.sensitivityLabelId) unlabeledLibraries += 1;
    if (typeof lib.maxFolderDepth === "number") {
      depthSum += lib.maxFolderDepth;
      depthCount += 1;
    }
  }
  const averageMaxFolderDepth = depthCount > 0 ? Math.round((depthSum / depthCount) * 10) / 10 : null;

  // --- Sharing links ------------------------------------------------------
  const sharingRows = await db
    .select()
    .from(sharingLinksInventory)
    .where(eq(sharingLinksInventory.tenantConnectionId, tenantConnectionId));

  let newExternalLinks = 0;
  let anonymousLinks = 0;
  let activeLinks = 0;
  let expiringSoon = 0;
  const inSevenDays = new Date(windowEnd.getTime() + 7 * 24 * 60 * 60 * 1000);
  for (const link of sharingRows) {
    if (link.createdAtGraph && inWindow(link.createdAtGraph, windowStart, windowEnd)) {
      newExternalLinks += 1;
    }
    if (link.linkType === "anonymous") anonymousLinks += 1;
    if (link.isActive) activeLinks += 1;
    if (link.expiresAt && link.expiresAt.getTime() > windowEnd.getTime() && link.expiresAt.getTime() <= inSevenDays.getTime()) {
      expiringSoon += 1;
    }
  }

  // --- Copilot signals (from latest prompt assessment) --------------------
  const latestAssessment = await storage.getLatestCopilotPromptAssessment(tenantConnectionId);
  const copilot: M365OverviewSnapshot["copilot"] = {
    totalInteractions: latestAssessment?.interactionCount ?? 0,
    uniqueUsers: latestAssessment?.userCount ?? 0,
    averageQualityScore: latestAssessment?.orgSummary?.averageQualityScore ?? null,
    problematicShare: (() => {
      const dist = latestAssessment?.orgSummary?.qualityDistribution;
      if (!dist) return 0;
      const total = Object.values(dist).reduce((a, b) => a + b, 0);
      if (total === 0) return 0;
      return Math.round(((dist.PROBLEMATIC ?? 0) / total) * 1000) / 1000;
    })(),
    topFlags: (latestAssessment?.orgSummary?.topFlags ?? [])
      .slice(0, 5)
      .map(f => ({ signal: f.signal, count: f.count })),
    topDepartments: (latestAssessment?.departmentBreakdown ?? [])
      .slice()
      .sort((a, b) => b.interactionCount - a.interactionCount)
      .slice(0, 5)
      .map(d => ({
        department: d.department,
        interactions: d.interactionCount,
        avgQuality: d.averageQualityScore,
      })),
  };
  if (!latestAssessment) {
    caveats.push("No Copilot prompt assessment available; AI-usage insights reflect zeroes.");
  }

  // --- IA signals (rolled up from document_libraries) ---------------------
  const ia: M365OverviewSnapshot["ia"] = {
    librariesAssessed: libraryRows.length,
    versionSprawlCount: versionSprawlFlagged,
    deepHierarchyCount: deepFolderFlagged,
    missingSensitivityLabelsCount: unlabeledLibraries,
  };

  // --- KPI tiles ----------------------------------------------------------
  const kpis: M365OverviewSnapshot["kpis"] = [
    {
      label: "New sites (30d)",
      value: newSites,
      previousValue: newSitesPrior,
      deltaPct: percentDelta(newSites, newSitesPrior),
      unit: "count",
    },
    {
      label: "New teams (30d)",
      value: newTeams,
      previousValue: newTeamsPrior,
      deltaPct: percentDelta(newTeams, newTeamsPrior),
      unit: "count",
    },
    {
      label: "Remixed channels",
      value: remixedChannels,
      previousValue: null,
      deltaPct: null,
      unit: "count",
    },
    {
      label: "New external shares",
      value: newExternalLinks,
      previousValue: null,
      deltaPct: null,
      unit: "count",
    },
    {
      label: "Unlabeled libraries",
      value: unlabeledLibraries,
      previousValue: null,
      deltaPct: null,
      unit: "count",
    },
    {
      label: "Problematic prompt share",
      value: Math.round(copilot.problematicShare * 10000) / 100,
      previousValue: null,
      deltaPct: null,
      unit: "percent",
    },
  ];

  return {
    generatedAt: windowEnd.toISOString(),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    priorWindowStart: priorStart.toISOString(),
    priorWindowEnd: priorEnd.toISOString(),
    kpis,
    sites: {
      newSites,
      archivedSites,
      deletedSites,
      storageTop10Bytes,
      topGrowth: growthRanking.slice(0, 10),
      newlyInactive,
    },
    teams: {
      newTeams,
      newChannels,
      remixedChannels,
      privateChannels,
      sharedChannels,
      topActiveTeams,
    },
    libraries: {
      newLibraries,
      versionSprawlFlagged,
      deepFolderFlagged,
      averageMaxFolderDepth,
      unlabeledLibraries,
    },
    sharing: {
      newExternalLinks,
      anonymousLinks,
      activeLinks,
      expiringSoon,
    },
    copilot,
    ia,
    dataCaveats: caveats,
  };
}

// ─── LLM narrative + recommendations ────────────────────────────────────────

interface LLMPayload {
  narrative: string;
  recommendations: M365OverviewRecommendation[];
}

const LLM_SYSTEM_PROMPT = `You are a Microsoft 365 governance analyst producing a concise executive
overview for a tenant administrator. You write in a calm, direct tone and
focus on what changed in the last 30 days and what the admin should do next.

You MUST respond with a single JSON object matching this exact schema:
{
  "narrative": string, // 3-6 short paragraphs, markdown allowed, no headings
  "recommendations": [
    {
      "rank": number,          // 1..N, stable order; N between 5 and 8
      "title": string,         // short, action-led
      "rationale": string,     // 1-2 sentences, evidence-grounded
      "impact": "HIGH"|"MEDIUM"|"LOW",
      "effort": "HIGH"|"MEDIUM"|"LOW",
      "category": "SITES"|"TEAMS"|"IA"|"COPILOT"|"SHARING"|"LIFECYCLE"|"LABELING",
      "evidenceRefs": [string] // optional short metric labels you cited
    }
  ]
}

Ground every recommendation in the numbers provided. If a data area has no
signal, do not fabricate one. Prefer recommendations that remove risk or
unlock Copilot readiness. Do not include markdown outside the narrative
field. Do not wrap the JSON in code fences.`;

function buildLLMPrompt(snapshot: M365OverviewSnapshot, orgName: string): AIMessage[] {
  const compact = {
    windowDays: WINDOW_DAYS,
    orgName,
    ...snapshot,
    // Trim heavy arrays so we stay within a tight token budget.
    sites: {
      ...snapshot.sites,
      topGrowth: snapshot.sites.topGrowth.slice(0, 5),
    },
  };
  return [
    { role: "system", content: LLM_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Generate the overview for ${orgName}. Here is the 30-day snapshot as JSON:\n\n` +
        JSON.stringify(compact, null, 2),
    },
  ];
}

async function generateNarrative(
  snapshot: M365OverviewSnapshot,
  orgName: string,
): Promise<{ payload: LLMPayload; model: string; tokens: number }> {
  const messages = buildLLMPrompt(snapshot, orgName);
  const result = await completeForFeature("governance_narrative", messages, 2000);
  const raw = result.content ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    parsed = {
      narrative:
        "The overview generator could not produce a structured summary for this run; raw output is unavailable. Refer to the metrics panels for key changes in the last 30 days.",
      recommendations: [],
    };
  }
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  const narrative = typeof obj.narrative === "string" ? obj.narrative : "";
  const recommendations = sanitizeRecommendations(obj.recommendations);
  return {
    payload: { narrative, recommendations },
    model: result.model,
    tokens: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface StartOverviewReportOptions {
  organizationId: string;
  tenantConnectionId: string;
  triggeredByUserId: string | null;
  orgName: string;
}

export async function startOverviewReport(
  opts: StartOverviewReportOptions,
): Promise<string> {
  const { windowStart, windowEnd } = windowBounds();
  const [row] = await db
    .insert(m365OverviewReports)
    .values({
      organizationId: opts.organizationId,
      tenantConnectionId: opts.tenantConnectionId,
      status: "RUNNING",
      windowStart,
      windowEnd,
      triggeredByUserId: opts.triggeredByUserId ?? undefined,
    })
    .returning();

  const reportId = row.id;

  setImmediate(async () => {
    try {
      const snapshot = await collectSnapshot(opts.tenantConnectionId);
      const { payload, model, tokens } = await generateNarrative(snapshot, opts.orgName);

      await db
        .update(m365OverviewReports)
        .set({
          status: "COMPLETED",
          snapshot,
          narrative: payload.narrative,
          recommendations: payload.recommendations,
          modelUsed: model,
          tokensUsed: tokens,
          completedAt: new Date(),
        })
        .where(eq(m365OverviewReports.id, reportId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[m365-overview-report] run ${reportId} failed:`, err);
      await db
        .update(m365OverviewReports)
        .set({
          status: "FAILED",
          completedAt: new Date(),
          error: message.slice(0, 2000),
        })
        .where(eq(m365OverviewReports.id, reportId));
    }
  });

  return reportId;
}

export async function getOverviewReport(
  reportId: string,
): Promise<M365OverviewReport | undefined> {
  const [row] = await db
    .select()
    .from(m365OverviewReports)
    .where(eq(m365OverviewReports.id, reportId))
    .limit(1);
  return row;
}

export async function listOverviewReportsForTenant(
  tenantConnectionId: string,
  limit = 20,
): Promise<M365OverviewReport[]> {
  return db
    .select()
    .from(m365OverviewReports)
    .where(eq(m365OverviewReports.tenantConnectionId, tenantConnectionId))
    .orderBy(desc(m365OverviewReports.startedAt))
    .limit(limit);
}

export async function deleteOverviewReport(reportId: string): Promise<boolean> {
  const result = await db
    .delete(m365OverviewReports)
    .where(eq(m365OverviewReports.id, reportId));
  return (result.rowCount ?? 0) > 0;
}

export async function hasRunningOverviewReport(
  tenantConnectionId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ c: count() })
    .from(m365OverviewReports)
    .where(
      and(
        eq(m365OverviewReports.tenantConnectionId, tenantConnectionId),
        eq(m365OverviewReports.status, "RUNNING"),
      ),
    );
  return (row?.c ?? 0) > 0;
}
