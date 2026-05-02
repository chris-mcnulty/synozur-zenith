/**
 * SharePoint Tenant Sync Service
 *
 * Extracted from POST /api/admin/tenants/:id/sync so that the dispatcher
 * can trigger the same full sync (fire-and-forget) as the interactive route.
 *
 * Graceful degradation: delegated SPO / retention tokens require a live user
 * session. When called from the dispatcher (no sessionUserId), those
 * sub-steps are skipped and the sync proceeds with app-only tokens.
 */

import {
  fetchSharePointSites,
  fetchSiteUsageReport,
  fetchSiteDriveOwner,
  fetchSiteAnalytics,
  fetchSiteGroupOwners,
  fetchSiteGroupMembers,
  fetchSiteCollectionAdmins,
  getAppToken,
  fetchSitePropertyBag,
  fetchSiteWebTemplate,
  fetchSensitivityLabels,
  fetchRetentionLabels,
  fetchHubSites,
  fetchSiteHubAssociation,
  fetchHubSitesViaSearch,
  fetchSiteLockState,
  enumerateSiteDocumentLibraries,
  fetchContentTypes,
  fetchSiteArchiveStatus,
} from "./graph";
import { getPlanFeatures } from "./feature-gate";
import { computeWritebackHash, computeSpoSyncHash } from "./writeback-hash";
import { decryptToken } from "../utils/encryption";
import {
  evaluatePolicy,
  evaluationResultsToCopilotRules,
  formatPolicyBagValue,
  type EvaluationContext,
} from "./policy-engine";
import { storage } from "../storage";
import { getDelegatedSpoToken, getValidUserGraphToken } from "../routes-entra";
import type { ServicePlanTier, Workspace } from "@shared/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TenantSyncOptions {
  sessionUserId?: string;
  triggeredByUserId?: string | null;
  triggeredByEmail?: string | null;
  triggeredByOrgId?: string | null;
  triggeredByIp?: string | null;
}

export interface TenantSyncResult {
  success: boolean;
  sitesFound?: number;
  sitesDiscovered?: number;
  sitesCapApplied?: boolean;
  upserted?: number;
  usageReportRows?: number;
  usageMatched?: number;
  driveEnriched?: number;
  usageReportError?: string | null;
  enrichErrors?: string[];
  sensitivityLabels?: { synced: number; error?: string };
  retentionLabels?: { synced: number; error?: string };
  hubSites?: { hubSitesFound: number; sitesEnriched: number; method?: string; error?: string };
  documentLibraries?: { enumerated: number; totalLibraries: number; skipped: number; error?: string };
  contentTypes?: { synced: number; hubSitesScanned: number; error?: string };
  policyEvaluation?: { evaluated: number };
  writebackPending?: { count: number; message: string };
  permissionWarnings?: Array<{ area: string; permission: string; message: string; severity: "error" | "warning" }>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Shared helpers — imported by routes/sharepoint.ts so there is one copy
// ---------------------------------------------------------------------------

export function inferSiteType(rootWebTemplate?: string, isRootSite?: object): string {
  if (!rootWebTemplate) return "TEAM_SITE";
  const t = rootWebTemplate.toUpperCase();
  if (t.includes("SITEPAGEPUBLISHING") || t.includes("COMM")) return "COMMUNICATION_SITE";
  if (t.includes("GROUP")) return "TEAM_SITE";
  if (t.includes("STS")) return "TEAM_SITE";
  if (t.includes("HUB")) return "HUB_SITE";
  return "TEAM_SITE";
}

export interface PolicyEvalResult {
  bagChanged: boolean;
  changedBagKeys: Record<string, string>;
}

export async function evaluateAllPoliciesForWorkspace(
  ws: Workspace,
  orgId: string,
  tenantId: string,
  logPrefix = "[policy-eval]",
): Promise<PolicyEvalResult> {
  const policiesWithOutcomes = await storage.getActivePoliciesWithOutcomes(orgId);
  if (policiesWithOutcomes.length === 0) return { bagChanged: false, changedBagKeys: {} };

  const metaEntries = await storage.getDataDictionary(tenantId, "required_metadata_field");
  const context: EvaluationContext = { requiredMetadataFields: metaEntries.map((e) => e.value) };

  const allRuleRecords: any[] = [];
  const updates: Record<string, any> = {};
  const existingBag = (ws.propertyBag as Record<string, string>) || {};
  let bagChanged = false;
  const changedBagKeys: Record<string, string> = {};

  for (const policy of policiesWithOutcomes) {
    const evaluation = evaluatePolicy(ws, policy, context);
    const ruleRecords = evaluationResultsToCopilotRules(ws.id, evaluation);
    allRuleRecords.push(...ruleRecords);

    if (policy.outcome?.workspaceField === "copilotReady" && ws.copilotReady !== evaluation.overallPass) {
      updates.copilotReady = evaluation.overallPass;
    }

    const effectiveBagKey = policy.propertyBagKey || policy.outcome?.propertyBagKey;
    if (effectiveBagKey) {
      const bagValue = formatPolicyBagValue(evaluation, policy.propertyBagValueFormat);
      if (existingBag[effectiveBagKey] !== bagValue) {
        existingBag[effectiveBagKey] = bagValue;
        bagChanged = true;
        changedBagKeys[effectiveBagKey] = bagValue;
        console.log(`${logPrefix} ${ws.displayName}: ${effectiveBagKey}=${bagValue}`);
      }
    }
  }

  await storage.setCopilotRules(ws.id, allRuleRecords);
  if (bagChanged) updates.propertyBag = existingBag;
  if (Object.keys(updates).length > 0) await storage.updateWorkspace(ws.id, updates);
  return { bagChanged, changedBagKeys };
}

export async function getDelegatedTokenForRetention(
  currentUserId?: string,
  organizationId?: string,
): Promise<string | null> {
  // getValidUserGraphToken applies the 5-minute proactive refresh threshold
  // and the per-user concurrency lock.
  if (currentUserId) {
    const token = await getValidUserGraphToken(currentUserId);
    if (token) return token;
  }

  if (organizationId) {
    const { db } = await import("../db");
    const { graphTokens } = await import("@shared/schema");
    const { eq, and, isNotNull } = await import("drizzle-orm");
    const orgTokens = await db
      .select()
      .from(graphTokens)
      .where(and(
        eq(graphTokens.organizationId, organizationId),
        eq(graphTokens.service, "graph"),
        isNotNull(graphTokens.refreshToken),
      ))
      .limit(5);
    for (const t of orgTokens) {
      const token = await getValidUserGraphToken(t.userId);
      if (token) return token;
    }
  }

  return null;
}

export async function getDelegatedSpoTokenForOrg(
  spoHost: string,
  currentUserId?: string,
  organizationId?: string,
): Promise<string | null> {
  if (currentUserId) {
    const token = await getDelegatedSpoToken(currentUserId, spoHost);
    if (token) return token;
  }
  if (organizationId) {
    const { db } = await import("../db");
    const { graphTokens } = await import("@shared/schema");
    const { eq, and } = await import("drizzle-orm");
    const orgTokens = await db
      .select()
      .from(graphTokens)
      .where(and(eq(graphTokens.organizationId, organizationId), eq(graphTokens.service, "graph")))
      .limit(5);
    for (const t of orgTokens) {
      if (t.refreshToken) {
        const token = await getDelegatedSpoToken(t.userId, spoHost);
        if (token) return token;
      }
    }
  }
  return null;
}

export function getEffectiveClientSecret(conn: { clientSecret?: string | null }): string {
  if (conn.clientSecret) {
    try {
      return decryptToken(conn.clientSecret);
    } catch {
      return conn.clientSecret;
    }
  }
  return process.env.AZURE_CLIENT_SECRET!;
}

// ---------------------------------------------------------------------------
// Main service
// ---------------------------------------------------------------------------

export async function runSharePointTenantSync(
  tenantConnectionId: string,
  options: TenantSyncOptions = {},
): Promise<TenantSyncResult> {
  const { sessionUserId, triggeredByUserId, triggeredByEmail, triggeredByOrgId, triggeredByIp } = options;

  const connection = await storage.getTenantConnection(tenantConnectionId);
  if (!connection) return { success: false, error: "Tenant connection not found" };

  const clientId = connection.clientId || process.env.AZURE_CLIENT_ID;
  const clientSecret = getEffectiveClientSecret(connection);

  if (!clientId || !clientSecret) {
    return { success: false, error: "Zenith app credentials not configured. Set AZURE_CLIENT_ID and AZURE_CLIENT_SECRET." };
  }

  const syncOrg = connection.organizationId
    ? await storage.getOrganization(connection.organizationId)
    : null;
  const syncOrgPlan = (syncOrg?.servicePlan || "TRIAL") as ServicePlanTier;
  const syncOrgFeatures = getPlanFeatures(syncOrgPlan);

  await storage.createAuditEntry({
    userId: triggeredByUserId || null,
    userEmail: triggeredByEmail || null,
    action: "TENANT_SYNC_STARTED",
    resource: "tenant_connection",
    resourceId: tenantConnectionId,
    organizationId: triggeredByOrgId || null,
    tenantConnectionId,
    details: { tenantName: connection.tenantName, tenantId: connection.tenantId },
    result: "SUCCESS",
    ipAddress: triggeredByIp || null,
  });

  try {
    const [siteResult, usageResult] = await Promise.all([
      fetchSharePointSites(connection.tenantId, clientId, clientSecret),
      fetchSiteUsageReport(connection.tenantId, clientId, clientSecret),
    ]);

    if (siteResult.error && siteResult.sites.length === 0) {
      await storage.updateTenantConnection(tenantConnectionId, {
        lastSyncAt: new Date(),
        lastSyncStatus: `ERROR: ${siteResult.error}`,
        lastSyncSiteCount: 0,
      });
      return { success: false, error: siteResult.error, sitesFound: 0 };
    }

    const sitesDiscoveredTotal = siteResult.sites.length;
    const maxSitesCap = syncOrgFeatures.maxSites;
    let sitesCapApplied = false;
    if (maxSitesCap > 0 && siteResult.sites.length > maxSitesCap) {
      console.log(`[sync-cap] ${syncOrgPlan} plan cap: limiting ${sitesDiscoveredTotal} to ${maxSitesCap}`);
      siteResult.sites = siteResult.sites.slice(0, maxSitesCap);
      sitesCapApplied = true;
    }

    const normalizeUrl = (url: string) => url.toLowerCase().replace(/\/+$/, "");

    const usageMap = new Map<string, (typeof usageResult.report)[0]>();
    const usageUrlMap = new Map<string, (typeof usageResult.report)[0]>();
    for (const row of usageResult.report) {
      if (row.siteId) usageMap.set(row.siteId.toLowerCase().trim(), row);
      if (row.siteUrl) usageUrlMap.set(normalizeUrl(row.siteUrl), row);
    }

    let token: string | null = null;
    try {
      token = await getAppToken(connection.tenantId, clientId, clientSecret);
    } catch {}

    const spoTokenCache = new Map<string, string | null>();
    const getSpoTokenForDomain = async (domain: string): Promise<string | null> => {
      if (spoTokenCache.has(domain)) return spoTokenCache.get(domain)!;
      try {
        const spoHost = domain.includes(".sharepoint.com")
          ? domain
          : `${domain.replace(/\..*$/, "")}.sharepoint.com`;
        const t = await getDelegatedSpoTokenForOrg(spoHost, sessionUserId, connection.organizationId);
        spoTokenCache.set(domain, t);
        return t;
      } catch (err: any) {
        console.warn(`[sync] Delegated SPO token failed for ${domain}: ${err.message}`);
        spoTokenCache.set(domain, null);
        return null;
      }
    };

    let upsertedCount = 0;
    let usageMatched = 0;
    const enrichErrors: string[] = [];
    const permissionWarnings: { area: string; permission: string; message: string; severity: "error" | "warning" }[] = [];

    if (!token) {
      permissionWarnings.push({
        area: "Graph API",
        permission: "Application credentials",
        message: "Could not acquire a Graph API token. Site enrichment (owners, analytics, lock state) was skipped.",
        severity: "error",
      });
    }

    const BATCH_SIZE = 5;
    const enrichCache = new Map<string, {
      driveOwner: any;
      analytics: any;
      groupOwners: any;
      groupMembers?: any;
      siteAdmins?: any[];
      lockState?: string;
      isArchived?: boolean;
      propertyBag?: Record<string, string>;
      webTemplate?: string | null;
    }>();

    if (token) {
      for (let i = 0; i < siteResult.sites.length; i += BATCH_SIZE) {
        const batch = siteResult.sites.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (site) => {
            const siteUrl = site.webUrl || "";
            const domain = siteUrl.match(/https?:\/\/([^/]+)/)?.[1] || "";
            const spoToken = domain ? await getSpoTokenForDomain(domain) : null;

            const siteUsageRow =
              usageMap.get(
                (site.id.split(",")[1] || site.id).toLowerCase().trim(),
              ) || (siteUrl ? usageUrlMap.get(normalizeUrl(siteUrl)) : undefined);
            const inferredType = inferSiteType(
              siteUsageRow?.rootWebTemplate,
              site.siteCollection?.root,
            );
            const isCommunicationSite = inferredType === "COMMUNICATION_SITE";

            const [
              driveResult,
              analyticsResult,
              groupOwnersResult,
              groupMembersResult,
              lockStateResult,
              propBagResult,
              webTemplateResult,
            ] = await Promise.allSettled([
              fetchSiteDriveOwner(token!, site.id),
              fetchSiteAnalytics(token!, site.id),
              fetchSiteGroupOwners(token!, site.id),
              isCommunicationSite
                ? Promise.resolve({ members: [] })
                : fetchSiteGroupMembers(token!, site.id),
              spoToken && siteUrl
                ? fetchSiteLockState(spoToken, siteUrl)
                : Promise.resolve({ lockState: "Unknown", isArchived: false }),
              spoToken && siteUrl
                ? fetchSitePropertyBag(spoToken, siteUrl)
                : Promise.resolve({ properties: {} }),
              // Only call when the usage report didn't already give us a template,
              // since this is an extra per-site SPO REST request.
              spoToken && siteUrl && !siteUsageRow?.rootWebTemplate
                ? fetchSiteWebTemplate(spoToken, siteUrl)
                : Promise.resolve({ webTemplate: null as string | null }),
            ]);

            const lockData =
              lockStateResult.status === "fulfilled"
                ? lockStateResult.value
                : { lockState: "Unknown", isArchived: false };
            const propBagData =
              propBagResult.status === "fulfilled" ? propBagResult.value : { properties: {} };
            const groupOwners =
              groupOwnersResult.status === "fulfilled" ? groupOwnersResult.value : { owners: [] };
            const groupMembers =
              groupMembersResult.status === "fulfilled"
                ? groupMembersResult.value
                : { members: [] };
            const webTemplate =
              webTemplateResult.status === "fulfilled" ? webTemplateResult.value.webTemplate : null;

            let siteAdmins: { id?: string; displayName: string; mail?: string; userPrincipalName?: string }[] | undefined;
            if (spoToken && siteUrl) {
              const adminsResult = await fetchSiteCollectionAdmins(spoToken, siteUrl);
              if (adminsResult.error) {
                console.log(`[site-owners] Error fetching admins for ${siteUrl}: ${adminsResult.error}`);
              }
              if (adminsResult.admins.length > 0) {
                siteAdmins = adminsResult.admins;
              }
            }

            return {
              siteId: site.id,
              driveOwner: driveResult.status === "fulfilled" ? driveResult.value : {},
              analytics: analyticsResult.status === "fulfilled" ? analyticsResult.value : {},
              groupOwners,
              groupMembers,
              siteAdmins,
              lockState: lockData.lockState,
              isArchived: lockData.isArchived === true,
              propertyBag:
                Object.keys(propBagData.properties).length > 0 ? propBagData.properties : undefined,
              webTemplate,
            };
          }),
        );
        for (const r of results) {
          if (r.status === "fulfilled") {
            enrichCache.set(r.value.siteId, {
              driveOwner: r.value.driveOwner,
              analytics: r.value.analytics,
              groupOwners: r.value.groupOwners,
              groupMembers: r.value.groupMembers,
              siteAdmins: r.value.siteAdmins,
              lockState: r.value.lockState,
              isArchived: r.value.isArchived,
              propertyBag: r.value.propertyBag,
              webTemplate: r.value.webTemplate,
            });
          }
        }
      }
    }

    let spoTokenFailed = false;
    for (const [, t] of Array.from(spoTokenCache.entries())) {
      if (t === null) spoTokenFailed = true;
    }
    if (spoTokenFailed) {
      permissionWarnings.push({
        area: "SharePoint REST API",
        permission: "Sites.Read.All",
        message:
          "Could not acquire a SharePoint token. Archive/lock state detection may be incomplete.",
        severity: "warning",
      });
    }

    for (const site of siteResult.sites) {
      const graphSiteIdParts = site.id.split(",");
      const siteGuid =
        graphSiteIdParts.length >= 2 ? graphSiteIdParts[1].trim() : site.id.trim();

      let usage = usageMap.get(siteGuid.toLowerCase());
      if (!usage && site.webUrl) usage = usageUrlMap.get(normalizeUrl(site.webUrl));
      if (usage) usageMatched++;

      const enriched = enrichCache.get(site.id) || {
        driveOwner: {},
        analytics: {},
        groupOwners: { owners: [] },
        groupMembers: { members: [] },
        siteAdmins: undefined,
        lockState: undefined,
        isArchived: false,
      };
      const driveOwner = enriched.driveOwner;
      const siteAnalytics = enriched.analytics;
      const groupOwners = enriched.groupOwners;
      const groupMembers = enriched.groupMembers || { members: [] };

      // Prefer the usage-report template (M365 admin truth), then fall back to
      // the per-site SPO REST web template fetched during enrichment so sites
      // without a usage-report row still get an accurate template.
      const resolvedRootWebTemplate = usage?.rootWebTemplate || enriched.webTemplate || null;
      const siteType = inferSiteType(resolvedRootWebTemplate || undefined, site.siteCollection?.root);

      const workspaceData: Record<string, any> = {
        displayName: site.displayName || "Untitled Site",
        siteUrl: site.webUrl,
        description: site.description || null,
        tenantConnectionId,
        m365ObjectId: site.id,
        type: siteType,
        siteCreatedDate: site.createdDateTime || null,
        lastContentModifiedDate: site.lastModifiedDateTime || null,
      };
      if (resolvedRootWebTemplate) {
        workspaceData.rootWebTemplate = resolvedRootWebTemplate;
      }

      workspaceData.ownerDisplayName = usage?.ownerDisplayName || driveOwner.ownerDisplayName || null;
      workspaceData.ownerPrincipalName =
        usage?.ownerPrincipalName || driveOwner.ownerEmail || null;

      {
        const mergedOwners: Array<{
          id?: string;
          displayName: string;
          mail?: string;
          userPrincipalName?: string;
        }> = [];
        const seenEmails = new Set<string>();

        if (groupOwners.owners && groupOwners.owners.length > 0) {
          for (const o of groupOwners.owners) {
            const key = (o.mail || o.userPrincipalName || "").toLowerCase();
            if (key && !seenEmails.has(key)) {
              seenEmails.add(key);
              mergedOwners.push({
                id: o.id,
                displayName: o.displayName || "",
                mail: o.mail,
                userPrincipalName: o.userPrincipalName,
              });
            }
          }
        }

        if (enriched.siteAdmins && enriched.siteAdmins.length > 0) {
          for (const a of enriched.siteAdmins) {
            const key = (a.mail || a.userPrincipalName || "").toLowerCase();
            if (key && !seenEmails.has(key)) {
              seenEmails.add(key);
              mergedOwners.push(a);
            }
          }
        }

        if (mergedOwners.length > 0) {
          workspaceData.siteOwners = mergedOwners;
          workspaceData.owners = mergedOwners.length;
        }
      }

      if (siteType !== "COMMUNICATION_SITE" && groupMembers.members && groupMembers.members.length >= 0) {
        const members = (groupMembers.members || []).map((m: any) => ({
          id: m.id,
          displayName: m.displayName || "",
          mail: m.mail,
          userPrincipalName: m.userPrincipalName,
        }));
        workspaceData.siteMembers = members;
      }

      const storageUsed = usage?.storageUsedBytes ?? driveOwner.storageUsedBytes ?? null;
      const storageAlloc = usage?.storageAllocatedBytes ?? driveOwner.storageAllocatedBytes ?? null;
      workspaceData.storageUsedBytes = storageUsed;
      workspaceData.storageAllocatedBytes = storageAlloc;

      const activityDate = usage?.lastActivityDate || siteAnalytics.lastActivityDate || null;
      workspaceData.lastActivityDate = activityDate;

      if (usage) {
        workspaceData.fileCount = usage.fileCount;
        workspaceData.activeFileCount = usage.activeFileCount;
        workspaceData.pageViewCount = usage.pageViewCount;
        workspaceData.visitedPageCount = usage.visitedPageCount;
        // rootWebTemplate already set above from resolvedRootWebTemplate when available;
        // don't clobber the SPO REST fallback with a null usage value.
        workspaceData.isDeleted = usage.isDeleted;
        workspaceData.reportRefreshDate = usage.reportRefreshDate || null;
        workspaceData.sensitivityLabelId = usage.sensitivityLabelId || null;
        workspaceData.sharingCapability = usage.externalSharing || null;
      }

      const archiveStatus = site.siteCollection?.archivalDetails?.archiveStatus || null;
      const graphArchived =
        archiveStatus === "recentlyArchived" || archiveStatus === "fullyArchived";

      const spoLockState = enriched.lockState;
      const usageLockState = usage?.lockState;

      // Honor the SPO REST `IsArchived` signal in addition to the Graph
      // `siteCollection.archivalDetails.archiveStatus` field. The Graph bulk
      // listing does not always populate `archivalDetails` for recently-
      // archived sites — without this, sites archived in the Microsoft 365
      // Admin "Archived sites" view (e.g. via Microsoft 365 Archive) appear
      // as live in our inventory and as `0 archived` in lifecycle reports.
      const spoArchivedFlag = enriched.isArchived === true;
      const archivedNow = graphArchived || spoArchivedFlag;
      workspaceData.isArchived = archivedNow;

      // BL-019: reconcile lifecycleState from Graph archivalDetails so any
      // PendingArchive / PendingRestore intent placed by the archive/unarchive
      // endpoints settles into a terminal Active/Archived state once Graph
      // confirms the transition. Without this, Pending* states could remain
      // stuck indefinitely and the badge in the UI would never clear.
      const existingForLifecycle = await storage.getWorkspaceByM365ObjectId(site.id);
      const priorLifecycle = ((existingForLifecycle as any)?.lifecycleState ||
        (archivedNow ? "Archived" : "Active")) as string;
      if (archivedNow) {
        workspaceData.lifecycleState = "Archived";
        if (!(existingForLifecycle as any)?.archivedAt && priorLifecycle !== "PendingArchive") {
          workspaceData.archivedAt = new Date();
        }
      } else {
        workspaceData.lifecycleState = "Active";
        workspaceData.archiveReason = null;
        workspaceData.archivedAt = null;
        workspaceData.archivedBy = null;
      }

      if (graphArchived || spoArchivedFlag) {
        workspaceData.lockState =
          spoLockState && spoLockState !== "Unknown"
            ? spoLockState
            : usageLockState || "Locked";
      } else if (spoLockState && spoLockState !== "Unknown") {
        workspaceData.lockState = spoLockState;
      } else if (usageLockState) {
        workspaceData.lockState = usageLockState;
      } else {
        workspaceData.lockState = spoLockState === "Unknown" ? "Unknown" : "Unlock";
      }

      if (storageUsed != null) {
        const usedMB = Math.round(storageUsed / (1024 * 1024));
        workspaceData.size =
          usedMB >= 1024 ? `${(usedMB / 1024).toFixed(1)} GB` : `${usedMB} MB`;
      }

      if (activityDate) {
        const d = new Date(activityDate);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) workspaceData.lastActive = "Today";
        else if (diffDays === 1) workspaceData.lastActive = "Yesterday";
        else if (diffDays <= 7) workspaceData.lastActive = `${diffDays} days ago`;
        else if (diffDays <= 30) workspaceData.lastActive = `${Math.floor(diffDays / 7)} weeks ago`;
        else workspaceData.lastActive = `${Math.floor(diffDays / 30)} months ago`;
      }

      if (usage) {
        if (usage.pageViewCount > 50) workspaceData.usage = "Very High";
        else if (usage.pageViewCount > 20) workspaceData.usage = "High";
        else if (usage.pageViewCount > 5) workspaceData.usage = "Medium";
        else workspaceData.usage = "Low";
      }

      const existing = await storage.getWorkspaceByM365ObjectId(site.id);

      if (enriched.propertyBag && Object.keys(enriched.propertyBag).length > 0) {
        const existingBag = (existing?.propertyBag as Record<string, string>) || {};
        workspaceData.propertyBag = { ...existingBag, ...enriched.propertyBag };
      } else if (existing?.propertyBag) {
        workspaceData.propertyBag = existing.propertyBag;
      }

      workspaceData.spoSyncHash = computeSpoSyncHash({
        sensitivityLabelId: workspaceData.sensitivityLabelId || null,
        propertyBag: workspaceData.propertyBag || null,
      });

      if (existing) {
        const governedFields: string[] = [
          "sensitivityLabelId",
          "department",
          "costCenter",
          "projectCode",
          "projectType",
          "sensitivity",
          "retentionPolicy",
        ];
        for (const field of governedFields) {
          const incoming = workspaceData[field];
          const current = (existing as any)[field];
          if ((!incoming || incoming === "") && current) {
            delete workspaceData[field];
          }
        }
        if (existing.localHash) workspaceData.localHash = existing.localHash;
        await storage.updateWorkspace(existing.id, workspaceData);
      } else {
        await storage.createWorkspace(workspaceData as any);
      }
      upsertedCount++;
    }

    // --- Reconcile missing sites (archived vs deleted) -----------------------
    // Sites can disappear from `GET /sites` for two different reasons:
    //   1. They were deleted (recycle bin) in M365 Admin / SharePoint Admin.
    //   2. They were archived via M365 Archive — Graph's site listing
    //      filters them out once `archivalDetails.archiveStatus` reaches
    //      `recentlyArchived` / `fullyArchived`.
    //
    // Both classes of sites are "missing" from the upsert loop, so without
    // an explicit reconcile pass our `workspaces` table keeps them flagged
    // `isDeleted=false AND isArchived=false` indefinitely.
    //
    // To distinguish the two, we probe Graph's per-site endpoint
    // (`GET /sites/{id}`) for every missing workspace:
    //   - HTTP 200 with an archive status  → site is archived, mark
    //     isArchived=true (do NOT set isDeleted — the site still exists).
    //   - HTTP 404 (or any other non-OK)   → site is genuinely gone,
    //     mark isDeleted=true.
    //
    // Safety: only run reconciliation when (a) the listing succeeded
    // (siteResult.error is empty) AND (b) the per-tenant site cap was NOT
    // applied — otherwise sites beyond the cap would be falsely marked deleted.
    let reconciledDeletedCount = 0;
    let reconciledArchivedCount = 0;
    if (!siteResult.error && !sitesCapApplied && token) {
      // Query workspaces directly (bypassing storage.getWorkspaces, which
      // hard-filters out archived AND deleted rows). We need archived rows
      // included so an archived-then-deleted site is still reconciled.
      const { db } = await import("../db");
      const { workspaces: workspacesTable } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const tenantWorkspaces = await db
        .select({
          id: workspacesTable.id,
          m365ObjectId: workspacesTable.m365ObjectId,
          isDeleted: workspacesTable.isDeleted,
          isArchived: workspacesTable.isArchived,
        })
        .from(workspacesTable)
        .where(eq(workspacesTable.tenantConnectionId, tenantConnectionId));

      const seenObjectIds = new Set(siteResult.sites.map((s) => s.id));
      let reconciledRecoveredCount = 0;
      for (const ws of tenantWorkspaces) {
        if (!ws.m365ObjectId) continue; // skip provisioned-but-unsynced rows
        if (seenObjectIds.has(ws.m365ObjectId)) continue;

        // Two cases to handle:
        //   (A) currently-alive workspace that dropped from the listing
        //       → classify as archived or deleted based on the probe.
        //   (B) already isDeleted=true but not archived — may have been
        //       mis-marked by an earlier version of this reconcile pass
        //       that conflated "archived" with "deleted". Probe to recover.
        const needsClassification = !ws.isDeleted;
        const needsRecovery = ws.isDeleted && !ws.isArchived;
        if (!needsClassification && !needsRecovery) continue;

        // Probe Graph per-site. Only definitive "not found" responses
        // (404/410) mark deleted. Transient failures (401/403/429/5xx,
        // network errors) leave flags untouched so the next sync can retry.
        const probe = await fetchSiteArchiveStatus(token, ws.m365ObjectId);
        if (probe.httpStatus === 200 && probe.isArchived) {
          // Site still exists in M365 Archive.
          if (needsRecovery) {
            // Recover a previously mis-marked row: clear isDeleted, set isArchived.
            await storage.updateWorkspace(ws.id, {
              isDeleted: false,
              isArchived: true,
              lifecycleState: "Archived",
            } as any);
            reconciledRecoveredCount++;
          } else if (!ws.isArchived) {
            await storage.updateWorkspace(ws.id, {
              isArchived: true,
              lifecycleState: "Archived",
            } as any);
            reconciledArchivedCount++;
          }
        } else if (
          needsClassification &&
          (probe.httpStatus === 404 || probe.httpStatus === 410)
        ) {
          await storage.updateWorkspace(ws.id, { isDeleted: true } as any);
          reconciledDeletedCount++;
        } else {
          // 200-without-archive-status, or transient non-OK, or 404 during
          // a recovery probe (already marked deleted — nothing to change).
          console.log(
            `[sync] Reconcile probe for ${ws.m365ObjectId} inconclusive (httpStatus=${probe.httpStatus ?? "network"}${probe.error ? `, err=${probe.error}` : ""}) — leaving unchanged`,
          );
        }
      }
      if (
        reconciledDeletedCount > 0 ||
        reconciledArchivedCount > 0 ||
        reconciledRecoveredCount > 0
      ) {
        console.log(
          `[sync] Reconciled missing sites for ${connection.tenantName}: ${reconciledArchivedCount} archived, ${reconciledDeletedCount} deleted, ${reconciledRecoveredCount} recovered (deleted→archived)`,
        );
      }
    }

    // --- Sensitivity labels ---
    let labelSyncResult: { synced: number; error?: string } = { synced: 0 };
    if (token) {
      try {
        const labelResult = await fetchSensitivityLabels(token);
        if (labelResult.error) labelSyncResult.error = labelResult.error;
        for (const label of labelResult.labels) {
          await storage.upsertSensitivityLabel({
            tenantId: connection.tenantId,
            labelId: label.id,
            name: label.name,
            description: label.description || null,
            color: label.color || null,
            tooltip: label.tooltip || null,
            sensitivity: label.sensitivity ?? null,
            isActive: label.isActive,
            contentFormats: label.contentFormats || null,
            hasProtection: label.hasProtection,
            parentLabelId: label.parentLabelId || null,
            appliesToGroupsSites: label.appliesToGroupsSites,
          });
          labelSyncResult.synced++;
        }
      } catch (e: any) {
        labelSyncResult.error = e.message;
      }
    }

    // --- Retention labels (delegated only) ---
    let retentionSyncResult: { synced: number; error?: string } = { synced: 0 };
    if (token) {
      try {
        const delegatedToken = await getDelegatedTokenForRetention(sessionUserId, connection.organizationId);
        if (delegatedToken) {
          const retResult = await fetchRetentionLabels(delegatedToken);
          if (retResult?.error) retentionSyncResult.error = retResult.error;
          if (retResult && retResult.labels.length > 0) {
            for (const label of retResult.labels) {
              await storage.upsertRetentionLabel({
                tenantId: connection.tenantId,
                labelId: label.labelId,
                name: label.name,
                description: label.description || null,
                retentionDuration: label.retentionDuration || null,
                retentionAction: label.retentionAction || null,
                behaviorDuringRetentionPeriod: label.behaviorDuringRetentionPeriod || null,
                actionAfterRetentionPeriod: label.actionAfterRetentionPeriod || null,
                isActive: label.isActive,
                isRecordLabel: label.isRecordLabel,
              });
              retentionSyncResult.synced++;
            }
          }
        } else {
          retentionSyncResult.error =
            "Retention labels require SSO authentication. Sign out and sign back in via SSO to grant the RecordsManagement.Read.All delegated permission.";
        }
      } catch (e: any) {
        retentionSyncResult.error = e.message;
      }
    }

    // --- Hub sites ---
    let hubSyncResult: { hubSitesFound: number; sitesEnriched: number; method?: string; error?: string } = {
      hubSitesFound: 0,
      sitesEnriched: 0,
    };
    try {
      const allWorkspacesForHub = await storage.getWorkspaces(undefined, tenantConnectionId);
      const normalizeHubUrl = (url: string) => url.toLowerCase().replace(/\/+$/, "");
      let hubDiscoveryDone = false;

      if (token) {
        const searchResult = await fetchHubSitesViaSearch(token);
        if (!searchResult.error && searchResult.hubSites.length > 0) {
          hubSyncResult.method = "graph-search";
          hubSyncResult.hubSitesFound = searchResult.hubSites.length;

          const hubUrlToInfo = new Map<string, { siteCollectionId: string }>();
          for (const hub of searchResult.hubSites) {
            hubUrlToInfo.set(normalizeHubUrl(hub.webUrl), { siteCollectionId: hub.siteCollectionId });
          }

          const graphIdToHubSiteCollectionId = new Map<string, string>();
          searchResult.associations.forEach((hubSiteCollectionId, graphId) => {
            graphIdToHubSiteCollectionId.set(graphId, hubSiteCollectionId);
          });

          for (const ws of allWorkspacesForHub) {
            const wsUrl = ws.siteUrl ? normalizeHubUrl(ws.siteUrl) : null;
            const hubInfo = wsUrl ? hubUrlToInfo.get(wsUrl) : null;

            if (hubInfo) {
              await storage.updateWorkspace(ws.id, {
                isHubSite: true,
                hubSiteId: hubInfo.siteCollectionId,
                parentHubSiteId: null,
              } as any);
              hubSyncResult.sitesEnriched++;
              continue;
            }

            const wsM365Id = ws.m365ObjectId?.toLowerCase();
            if (wsM365Id) {
              const hubSiteColId = graphIdToHubSiteCollectionId.get(wsM365Id);
              if (hubSiteColId) {
                const isThisSiteAHub = hubUrlToInfo.has(wsUrl || "");
                await storage.updateWorkspace(ws.id, {
                  isHubSite: isThisSiteAHub,
                  hubSiteId: hubSiteColId,
                  parentHubSiteId: null,
                } as any);
                hubSyncResult.sitesEnriched++;
                continue;
              }
            }

            await storage.updateWorkspace(ws.id, {
              isHubSite: false,
              hubSiteId: null,
              parentHubSiteId: null,
            } as any);
          }
          hubDiscoveryDone = true;
        } else if (searchResult.error) {
          console.warn(`[hub-sync] Graph Search failed: ${searchResult.error}`);
        }
      }

      if (!hubDiscoveryDone) {
        const spoHostFromSites = allWorkspacesForHub
          .map((w) => w.siteUrl)
          .filter(Boolean)
          .map((url) => {
            try { return new URL(url!).hostname; } catch { return null; }
          })
          .find((h) => h && h.endsWith(".sharepoint.com"));

        const spoHostDomain = spoHostFromSites || connection.domain;
        try {
          const spoHostForHub = spoHostDomain.includes(".sharepoint.com")
            ? spoHostDomain
            : `${spoHostDomain.replace(/\..*$/, "")}.sharepoint.com`;
          const spoToken = await getDelegatedSpoTokenForOrg(spoHostForHub, sessionUserId, connection.organizationId);
          if (!spoToken) {
            hubSyncResult.error =
              "No delegated SPO token available for hub site detection. Please sign out and sign back in with SSO.";
            throw new Error(hubSyncResult.error);
          }
          const hubResult = await fetchHubSites(spoToken, spoHostDomain);
          hubSyncResult.method = "spo-rest";
          if (hubResult.error) hubSyncResult.error = hubResult.error;
          hubSyncResult.hubSitesFound = hubResult.hubSites.length;

          const hubUrlToHubInfo = new Map<string, { hubSiteId: string; parentHubSiteId?: string }>();
          for (const h of hubResult.hubSites) {
            hubUrlToHubInfo.set(normalizeHubUrl(h.siteUrl), {
              hubSiteId: h.hubSiteId,
              parentHubSiteId: h.parentHubSiteId,
            });
          }

          for (const ws of allWorkspacesForHub) {
            if (ws.siteUrl) {
              const hubInfo = hubUrlToHubInfo.get(normalizeHubUrl(ws.siteUrl));
              if (hubInfo) {
                await storage.updateWorkspace(ws.id, {
                  isHubSite: true,
                  hubSiteId: hubInfo.hubSiteId,
                  parentHubSiteId: hubInfo.parentHubSiteId || null,
                } as any);
                hubSyncResult.sitesEnriched++;
              }
            }
          }

          const nonHubSites = allWorkspacesForHub.filter(
            (w) => w.siteUrl && !hubUrlToHubInfo.has(normalizeHubUrl(w.siteUrl)),
          );
          const HUB_BATCH_SIZE = 5;
          for (let i = 0; i < nonHubSites.length; i += HUB_BATCH_SIZE) {
            const batch = nonHubSites.slice(i, i + HUB_BATCH_SIZE);
            const results = await Promise.allSettled(
              batch.map(async (ws) => {
                const assoc = await fetchSiteHubAssociation(spoToken, ws.siteUrl!);
                return { workspaceId: ws.id, displayName: ws.displayName, ...assoc };
              }),
            );
            for (const r of results) {
              if (r.status === "fulfilled" && !r.value.error) {
                await storage.updateWorkspace(r.value.workspaceId, {
                  isHubSite: r.value.isHubSite,
                  hubSiteId: r.value.hubSiteId,
                  parentHubSiteId: null,
                } as any);
                hubSyncResult.sitesEnriched++;
              }
            }
          }
        } catch (spoErr: any) {
          hubSyncResult.error = spoErr.message;
        }
      }
    } catch (e: any) {
      hubSyncResult.error = hubSyncResult.error || e.message;
    }

    if (usageResult.error) {
      permissionWarnings.push({
        area: "Usage Report",
        permission: "Reports.Read.All",
        message: `Usage report unavailable: ${usageResult.error}. Storage, file counts, and activity data may be missing.`,
        severity: "warning",
      });
    }
    if (labelSyncResult.error) {
      permissionWarnings.push({
        area: "Sensitivity Labels",
        permission: "InformationProtectionPolicy.Read.All",
        message: `Sensitivity label sync failed: ${labelSyncResult.error}.`,
        severity: "warning",
      });
    }
    if (retentionSyncResult.error) {
      permissionWarnings.push({
        area: "Retention Labels",
        permission: "RecordsManagement.Read.All (delegated)",
        message: `Retention label sync failed: ${retentionSyncResult.error}`,
        severity: "warning",
      });
    }
    if (hubSyncResult.error) {
      permissionWarnings.push({
        area: "Hub Sites",
        permission: "Sites.Read.All",
        message: `Hub site discovery encountered an error: ${hubSyncResult.error}`,
        severity: "warning",
      });
    }

    // --- Policy evaluation ---
    let policyEvalCount = 0;
    let writebackPendingCount = 0;
    try {
      if (connection.organizationId) {
        const allSyncedWorkspaces = await storage.getWorkspaces(undefined, tenantConnectionId);
        for (const ws of allSyncedWorkspaces) {
          const evalResult = await evaluateAllPoliciesForWorkspace(
            ws,
            connection.organizationId,
            connection.tenantId,
            "[policy-eval]",
          );
          policyEvalCount++;

          if (evalResult.bagChanged && ws.siteUrl) {
            const refreshedWs = await storage.getWorkspace(ws.id);
            if (refreshedWs) {
              const newLocalHash = computeWritebackHash({
                sensitivityLabelId: refreshedWs.sensitivityLabelId,
                department: refreshedWs.department,
                costCenter: refreshedWs.costCenter,
                projectCode: refreshedWs.projectCode,
                propertyBag: refreshedWs.propertyBag,
              });
              await storage.updateWorkspace(ws.id, { localHash: newLocalHash } as any);
            }
            writebackPendingCount++;
          }
        }
        if (writebackPendingCount > 0) {
          console.log(`[policy-eval] ${writebackPendingCount} workspaces have pending property bag writebacks`);
        }
      }
    } catch (evalErr: any) {
      console.error(`[policy-eval] Error during post-sync evaluation: ${evalErr.message}`);
    }

    // --- Document library enumeration ---
    let librarySyncResult: { enumerated: number; totalLibraries: number; skipped: number; error?: string } = {
      enumerated: 0,
      totalLibraries: 0,
      skipped: 0,
    };
    if (token) {
      try {
        const allSyncedWorkspaces = await storage.getWorkspaces(undefined, tenantConnectionId);
        const LIBRARY_BATCH_SIZE = 10;
        for (let i = 0; i < allSyncedWorkspaces.length; i += LIBRARY_BATCH_SIZE) {
          const batch = allSyncedWorkspaces.slice(i, i + LIBRARY_BATCH_SIZE);
          const results = await Promise.allSettled(
            batch.map(async (ws) => {
              if (!ws.m365ObjectId) return { wsId: ws.id, libraries: [] };
              const result = await enumerateSiteDocumentLibraries(token!, ws.m365ObjectId);
              return { wsId: ws.id, libraries: result.libraries, error: result.error };
            }),
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value.libraries.length > 0) {
              const existingLibs = await storage.getDocumentLibraries(r.value.wsId);
              const existingMap = new Map(existingLibs.map((l) => [l.m365ListId, l]));
              for (const lib of r.value.libraries) {
                const existing = existingMap.get(lib.listId);
                if (existing && existing.lastModifiedAt === lib.lastModifiedAt) {
                  librarySyncResult.skipped++;
                  continue;
                }
                await storage.upsertDocumentLibrary({
                  workspaceId: r.value.wsId,
                  tenantConnectionId,
                  m365ListId: lib.listId,
                  displayName: lib.displayName,
                  description: null,
                  webUrl: null,
                  template: lib.template,
                  itemCount: lib.itemCount,
                  storageUsedBytes: null,
                  sensitivityLabelId: null,
                  isDefaultDocLib: false,
                  hidden: lib.hidden,
                  lastModifiedAt: lib.lastModifiedAt,
                  createdGraphAt: null,
                  lastSyncAt: new Date(),
                });
                librarySyncResult.totalLibraries++;
              }
              librarySyncResult.enumerated++;
            }
          }
        }
      } catch (e: any) {
        librarySyncResult.error = e.message;
      }
    }

    // --- Content types ---
    let contentTypeSyncResult: { synced: number; hubSitesScanned: number; error?: string } = {
      synced: 0,
      hubSitesScanned: 0,
    };
    if (token) {
      try {
        const hubWorkspaces = await storage.getWorkspaces(undefined, tenantConnectionId);
        const hubSiteWorkspaces = hubWorkspaces.filter((w) => w.isHubSite && w.m365ObjectId);
        const seenContentTypeIds = new Set<string>();
        for (const hubWs of hubSiteWorkspaces) {
          try {
            const result = await fetchContentTypes(token, hubWs.m365ObjectId!);
            if (result.error) {
              contentTypeSyncResult.error = result.error;
              continue;
            }
            contentTypeSyncResult.hubSitesScanned++;
            for (const ct of result.contentTypes) {
              if (seenContentTypeIds.has(ct.id)) continue;
              seenContentTypeIds.add(ct.id);
              await storage.upsertContentType({
                tenantConnectionId,
                contentTypeId: ct.id,
                name: ct.name,
                group: ct.group || null,
                description: ct.description || null,
                isHub: true,
                subscribedSiteCount: 0,
              });
              contentTypeSyncResult.synced++;
            }
          } catch (ctErr: any) {
            console.error(`[content-type-sync] Error for hub site ${hubWs.displayName}: ${ctErr.message}`);
          }
        }
      } catch (e: any) {
        contentTypeSyncResult.error = e.message;
      }
    }

    try {
      await storage.updateContentTypeUsageCounts(tenantConnectionId);
    } catch (rollupErr: any) {
      console.warn(`[content-type-sync] Usage count rollup failed: ${rollupErr.message}`);
    }

    if (contentTypeSyncResult.error) {
      permissionWarnings.push({
        area: "Content Types",
        permission: "Sites.Read.All",
        message: `Content type sync failed: ${contentTypeSyncResult.error}`,
        severity: "warning",
      });
    }

    await storage.updateTenantConnection(tenantConnectionId, {
      lastSyncAt: new Date(),
      lastSyncStatus: permissionWarnings.some((w) => w.severity === "error")
        ? "SUCCESS_WITH_ERRORS"
        : permissionWarnings.length > 0
        ? "SUCCESS_WITH_WARNINGS"
        : "SUCCESS",
      lastSyncSiteCount: sitesCapApplied ? sitesDiscoveredTotal : siteResult.sites.length,
      status: "ACTIVE",
      consentGranted: true,
    });

    await storage.createAuditEntry({
      userId: triggeredByUserId || null,
      userEmail: triggeredByEmail || null,
      action: "TENANT_SYNC_COMPLETED",
      resource: "tenant_connection",
      resourceId: tenantConnectionId,
      organizationId: triggeredByOrgId || null,
      tenantConnectionId,
      details: {
        tenantName: connection.tenantName,
        sitesFound: siteResult.sites.length,
        upserted: upsertedCount,
        warningCount: permissionWarnings.length,
      },
      result: "SUCCESS",
      ipAddress: triggeredByIp || null,
    });

    return {
      success: true,
      sitesFound: siteResult.sites.length,
      sitesDiscovered: sitesDiscoveredTotal,
      sitesCapApplied,
      upserted: upsertedCount,
      usageReportRows: usageResult.report.length,
      usageMatched,
      driveEnriched: enrichCache.size,
      usageReportError: usageResult.error || null,
      enrichErrors: enrichErrors.length > 0 ? enrichErrors : undefined,
      sensitivityLabels: labelSyncResult,
      retentionLabels: retentionSyncResult,
      hubSites: hubSyncResult,
      documentLibraries: librarySyncResult,
      contentTypes: contentTypeSyncResult,
      policyEvaluation: policyEvalCount > 0 ? { evaluated: policyEvalCount } : undefined,
      writebackPending:
        writebackPendingCount > 0
          ? {
              count: writebackPendingCount,
              message: `${writebackPendingCount} workspace(s) have policy outcome changes that need to be written back to SharePoint.`,
            }
          : undefined,
      permissionWarnings: permissionWarnings.length > 0 ? permissionWarnings : undefined,
    };
  } catch (err: any) {
    await storage.updateTenantConnection(tenantConnectionId, {
      lastSyncAt: new Date(),
      lastSyncStatus: `ERROR: ${err.message}`,
    });
    await storage.createAuditEntry({
      userId: triggeredByUserId || null,
      userEmail: triggeredByEmail || null,
      action: "TENANT_SYNC_FAILED",
      resource: "tenant_connection",
      resourceId: tenantConnectionId,
      organizationId: triggeredByOrgId || null,
      tenantConnectionId,
      details: { tenantName: connection.tenantName, error: err.message },
      result: "FAILURE",
      ipAddress: triggeredByIp || null,
    });
    return { success: false, error: err.message };
  }
}
