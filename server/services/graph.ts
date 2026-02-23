interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

export async function getAppToken(tenantId: string, clientId: string, clientSecret: string): Promise<string> {
  const cacheKey = `${tenantId}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.accessToken;
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    let errorDetail = errorText;
    try {
      const parsed = JSON.parse(errorText);
      errorDetail = parsed.error_description || parsed.error || errorText;
    } catch {}
    throw new Error(`Token acquisition failed: ${errorDetail}`);
  }

  const data = await res.json();
  tokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

const spoTokenCache = new Map<string, TokenCache>();

export async function getSpoToken(tenantId: string, clientId: string, clientSecret: string, domain: string): Promise<string> {
  const spoHost = domain.includes(".sharepoint.com") ? domain : `${domain.replace(/\..*$/, '')}.sharepoint.com`;
  const cacheKey = `spo:${tenantId}:${clientId}:${spoHost}`;
  const cached = spoTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.accessToken;
  }

  const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: `https://${spoHost}/.default`,
    grant_type: "client_credentials",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    let errorDetail = errorText;
    try {
      const parsed = JSON.parse(errorText);
      errorDetail = parsed.error_description || parsed.error || errorText;
    } catch {}
    throw new Error(`SPO token acquisition failed: ${errorDetail}`);
  }

  const data = await res.json();
  spoTokenCache.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

export interface HubSiteInfo {
  hubSiteId: string;
  siteId: string;
  siteUrl: string;
  title: string;
  description?: string;
  parentHubSiteId?: string;
}

export async function fetchHubSites(spoToken: string, domain: string): Promise<{
  hubSites: HubSiteInfo[];
  error?: string;
}> {
  try {
    const spoHost = domain.includes(".sharepoint.com") ? domain : `${domain.replace(/\..*$/, '')}.sharepoint.com`;
    const url = `https://${spoHost}/_api/SP.HubSites`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return { hubSites: [], error: `SP.HubSites API error ${res.status}: ${errText.substring(0, 200)}` };
    }

    const data = await res.json();
    const emptyGuid = "00000000-0000-0000-0000-000000000000";
    const hubSites: HubSiteInfo[] = (data.value || []).map((h: any) => ({
      hubSiteId: h.ID || h.Id,
      siteId: h.SiteId,
      siteUrl: h.SiteUrl,
      title: h.Title,
      description: h.Description || undefined,
      parentHubSiteId: h.ParentHubSiteId && h.ParentHubSiteId !== emptyGuid ? h.ParentHubSiteId : undefined,
    }));

    return { hubSites };
  } catch (err: any) {
    return { hubSites: [], error: err.message };
  }
}

export async function fetchSiteHubAssociation(spoToken: string, siteUrl: string): Promise<{
  isHubSite: boolean;
  hubSiteId: string | null;
  error?: string;
}> {
  try {
    const url = `${siteUrl.replace(/\/+$/, '')}/_api/site?$select=IsHubSite,HubSiteId`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
      },
    });

    if (!res.ok) {
      return { isHubSite: false, hubSiteId: null, error: `${res.status}` };
    }

    const data = await res.json();
    const hubSiteId = data.HubSiteId;
    const emptyGuid = "00000000-0000-0000-0000-000000000000";
    return {
      isHubSite: data.IsHubSite === true,
      hubSiteId: hubSiteId && hubSiteId !== emptyGuid ? hubSiteId : null,
    };
  } catch (err: any) {
    return { isHubSite: false, hubSiteId: null, error: err.message };
  }
}

export async function testConnection(tenantId: string, clientId: string, clientSecret: string): Promise<{
  success: boolean;
  tenantName?: string;
  permissions?: string[];
  error?: string;
}> {
  try {
    const token = await getAppToken(tenantId, clientId, clientSecret);

    const orgRes = await fetch("https://graph.microsoft.com/v1.0/organization", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!orgRes.ok) {
      return { success: false, error: `Graph API returned ${orgRes.status}: ${orgRes.statusText}` };
    }

    const orgData = await orgRes.json();
    const org = orgData.value?.[0];
    const tenantName = org?.displayName || "Unknown";

    const permissionsRes = await fetch("https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '" + clientId + "'&$select=oauth2PermissionScopes,appRoles", {
      headers: { Authorization: `Bearer ${token}` },
    });

    let permissions: string[] = [];
    if (permissionsRes.ok) {
      const permData = await permissionsRes.json();
      const sp = permData.value?.[0];
      if (sp?.appRoles) {
        permissions = sp.appRoles.map((r: any) => r.value).filter(Boolean);
      }
    }

    return { success: true, tenantName, permissions };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export interface GraphSite {
  id: string;
  displayName: string;
  webUrl: string;
  description?: string;
  createdDateTime?: string;
  lastModifiedDateTime?: string;
  isPersonalSite?: boolean;
  root?: object;
  siteCollection?: {
    hostname?: string;
    root?: object;
  };
}

export async function fetchSharePointSites(tenantId: string, clientId: string, clientSecret: string): Promise<{
  sites: GraphSite[];
  error?: string;
}> {
  try {
    let token = await getAppToken(tenantId, clientId, clientSecret);

    const allSites: GraphSite[] = [];
    let nextLink: string | null = "https://graph.microsoft.com/v1.0/sites?$top=100&$select=id,displayName,webUrl,description,createdDateTime,lastModifiedDateTime,isPersonalSite,root,siteCollection";
    let retriedAuth = false;

    while (nextLink) {
      const res: Response = await fetch(nextLink, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 401 && !retriedAuth) {
        retriedAuth = true;
        clearTokenCache(tenantId, clientId);
        token = await getAppToken(tenantId, clientId, clientSecret);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        return { sites: allSites, error: `Graph API error ${res.status}: ${errText}` };
      }

      const data: any = await res.json();
      const sites: GraphSite[] = data.value || [];

      const filteredSites = sites.filter(s =>
        !s.isPersonalSite &&
        s.displayName &&
        s.displayName !== "Root" &&
        !s.webUrl?.includes("/personal/")
      );

      allSites.push(...filteredSites);
      nextLink = data["@odata.nextLink"] || null;
    }

    return { sites: allSites };
  } catch (err: any) {
    return { sites: [], error: err.message };
  }
}

export interface SiteUsageReportRow {
  siteId: string;
  siteUrl: string;
  ownerDisplayName: string;
  ownerPrincipalName: string;
  isDeleted: boolean;
  lastActivityDate: string;
  fileCount: number;
  activeFileCount: number;
  pageViewCount: number;
  visitedPageCount: number;
  storageUsedBytes: number;
  storageAllocatedBytes: number;
  rootWebTemplate: string;
  sensitivityLabelId: string;
  externalSharing: string;
  reportRefreshDate: string;
  reportPeriod: string;
}

export async function fetchSiteUsageReport(tenantId: string, clientId: string, clientSecret: string): Promise<{
  report: SiteUsageReportRow[];
  error?: string;
}> {
  try {
    let token = await getAppToken(tenantId, clientId, clientSecret);

    const allRows: SiteUsageReportRow[] = [];
    let nextLink: string | null = "https://graph.microsoft.com/beta/reports/getSharePointSiteUsageDetail(period='D7')?$format=application/json";
    let retriedAuth = false;

    while (nextLink) {
      const res: Response = await fetch(nextLink, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (res.status === 401 && !retriedAuth) {
        retriedAuth = true;
        clearTokenCache(tenantId, clientId);
        token = await getAppToken(tenantId, clientId, clientSecret);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text();
        return { report: allRows, error: `Usage report API error ${res.status}: ${errText}` };
      }

      const data: any = await res.json();
      const rows: any[] = data.value || [];

      for (const row of rows) {
        allRows.push({
          siteId: row.siteId || '',
          siteUrl: row.siteUrl || '',
          ownerDisplayName: row.ownerDisplayName || '',
          ownerPrincipalName: row.ownerPrincipalName || '',
          isDeleted: row.isDeleted === true,
          lastActivityDate: row.lastActivityDate || '',
          fileCount: row.fileCount ?? 0,
          activeFileCount: row.activeFileCount ?? 0,
          pageViewCount: row.pageViewCount ?? 0,
          visitedPageCount: row.visitedPageCount ?? 0,
          storageUsedBytes: row.storageUsedInBytes ?? 0,
          storageAllocatedBytes: row.storageAllocatedInBytes ?? 0,
          rootWebTemplate: row.rootWebTemplate || '',
          sensitivityLabelId: row.siteSensitivityLabelId || '',
          externalSharing: row.externalSharing || '',
          reportRefreshDate: row.reportRefreshDate || '',
          reportPeriod: String(row.reportPeriod || ''),
        });
      }

      nextLink = data["@odata.nextLink"] || null;
    }

    return { report: allRows };
  } catch (err: any) {
    return { report: [], error: err.message };
  }
}

export interface SiteDriveOwner {
  siteId: string;
  ownerEmail?: string;
  ownerDisplayName?: string;
}

export async function fetchSiteDriveOwner(token: string, graphSiteId: string): Promise<SiteDriveOwner & { storageUsedBytes?: number; storageAllocatedBytes?: number }> {
  try {
    const res: Response = await fetch(`https://graph.microsoft.com/v1.0/sites/${graphSiteId}/drive`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return { siteId: graphSiteId };
    }

    const data: any = await res.json();
    const owner = data?.owner?.user;
    const quota = data?.quota;
    return {
      siteId: graphSiteId,
      ownerEmail: owner?.email || owner?.userPrincipalName,
      ownerDisplayName: owner?.displayName,
      storageUsedBytes: quota?.used ?? undefined,
      storageAllocatedBytes: quota?.total ?? undefined,
    };
  } catch {
    return { siteId: graphSiteId };
  }
}

export interface SiteGroupOwner {
  id: string;
  displayName: string;
  mail?: string;
  userPrincipalName?: string;
}

export async function fetchSiteGroupOwners(
  token: string,
  graphSiteId: string
): Promise<{ owners: SiteGroupOwner[]; groupId?: string; error?: string }> {
  try {
    let groupId: string | undefined;

    const driveRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/drive`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (driveRes.ok) {
      const driveData = await driveRes.json();
      const ownerGroup = driveData?.owner?.group;
      if (ownerGroup?.id) {
        groupId = ownerGroup.id;
      }
    }

    if (!groupId) {
      return { owners: [], error: "No M365 Group associated with this site" };
    }

    const ownersRes = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${groupId}/owners?$select=id,displayName,mail,userPrincipalName`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!ownersRes.ok) {
      const errText = await ownersRes.text();
      return { owners: [], groupId, error: `Group owners API error ${ownersRes.status}: ${errText}` };
    }

    const ownersData = await ownersRes.json();
    const owners: SiteGroupOwner[] = (ownersData.value || []).map((o: any) => ({
      id: o.id,
      displayName: o.displayName || '',
      mail: o.mail,
      userPrincipalName: o.userPrincipalName,
    }));

    return { owners, groupId };
  } catch (err: any) {
    return { owners: [], error: err.message };
  }
}

export async function fetchSiteAnalytics(token: string, graphSiteId: string): Promise<{
  lastActivityDate?: string;
  fileCount?: number;
  activeFileCount?: number;
  pageViewCount?: number;
  visitedPageCount?: number;
}> {
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${graphSiteId}/analytics/lastSevenDays`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return {};

    const data = await res.json();
    return {
      lastActivityDate: data?.lastActivityDateTime,
    };
  } catch {
    return {};
  }
}

export async function writeSitePropertyBag(
  token: string,
  graphSiteId: string,
  properties: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/lists/Site Information/items/1/fields`;
    const res: Response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(properties),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Graph API ${res.status}: ${errText}` };
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function fetchSensitivityLabels(token: string): Promise<{
  labels: Array<{
    id: string;
    name: string;
    description?: string;
    color?: string;
    tooltip?: string;
    sensitivity?: number;
    isActive: boolean;
    contentFormats?: string[] | null;
    hasProtection: boolean;
    parentLabelId?: string;
    appliesToGroupsSites: boolean;
  }>;
  error?: string;
}> {
  try {
    const url = "https://graph.microsoft.com/beta/security/informationProtection/sensitivityLabels";
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      let detail = errText;
      try {
        const parsed = JSON.parse(errText);
        const errObj = parsed.error || {};
        const parts = [errObj.code, errObj.message].filter(Boolean);
        if (errObj.innerError?.code) parts.push(`(${errObj.innerError.code})`);
        if (errObj.innerError?.message && errObj.innerError.message !== errObj.message) parts.push(errObj.innerError.message);
        detail = parts.length > 0 ? parts.join(" - ") : errText;
      } catch {}
      if (res.status === 403 && (detail.includes("UnknownError") || detail.includes("Access"))) {
        return { labels: [], error: `Graph API 403: Access denied. Ensure the Entra app registration has the 'InformationProtectionPolicy.Read.All' application permission with admin consent granted for this tenant. Some tenants may also require an M365 E3/E5 license with Information Protection capabilities.` };
      }
      return { labels: [], error: `Graph API ${res.status}: ${detail}` };
    }

    const data = await res.json();
    const rawLabels = data.value || [];

    const allLabels: any[] = [];
    let nextUrl: string | null = null;

    allLabels.push(...rawLabels);
    nextUrl = data["@odata.nextLink"] || null;

    while (nextUrl) {
      const nextRes = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!nextRes.ok) break;
      const nextData = await nextRes.json();
      allLabels.push(...(nextData.value || []));
      nextUrl = nextData["@odata.nextLink"] || null;
    }

    const labels = allLabels.map((l: any) => {
      const contentFormats: string[] = l.contentFormats || [];
      const appliesToGroupsSites =
        contentFormats.includes("site") ||
        contentFormats.includes("unifiedgroup") ||
        contentFormats.includes("schematizeddata") ||
        (l.parent && l.parent["@odata.type"]?.includes("group")) ||
        false;

      return {
        id: l.id,
        name: l.name || l.displayName || "Unknown",
        description: l.description || null,
        color: l.color || null,
        tooltip: l.tooltip || null,
        sensitivity: l.sensitivity ?? l.priority ?? null,
        isActive: l.isActive !== false && l.isEnabled !== false,
        contentFormats: contentFormats.length > 0 ? contentFormats : null,
        hasProtection: l.hasProtection === true,
        parentLabelId: l.parent?.id || null,
        appliesToGroupsSites,
      };
    });

    return { labels };
  } catch (e: any) {
    return { labels: [], error: e.message };
  }
}

export async function fetchRetentionLabels(token: string): Promise<{
  labels: Array<{
    labelId: string;
    name: string;
    description?: string | null;
    retentionDuration?: string | null;
    retentionAction?: string | null;
    behaviorDuringRetentionPeriod?: string | null;
    actionAfterRetentionPeriod?: string | null;
    isActive: boolean;
    isRecordLabel: boolean;
  }>;
  error?: string;
}> {
  const endpoints = [
    "https://graph.microsoft.com/v1.0/security/labels/retentionLabels",
    "https://graph.microsoft.com/beta/security/labels/retentionLabels",
  ];

  const MAX_RETRIES = 3;
  let lastError = "";

  for (const url of endpoints) {
    const apiVersion = url.includes("/v1.0/") ? "v1.0" : "beta";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const delay = Math.pow(2, attempt) * 1000;
          console.log(`[retention-sync] Retry ${attempt}/${MAX_RETRIES} for ${apiVersion} endpoint in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const errText = await res.text();
          let detail = errText;
          try {
            const parsed = JSON.parse(errText);
            const errObj = parsed.error || {};
            const parts = [errObj.code, errObj.message].filter(Boolean);
            if (errObj.innerError?.code) parts.push(`(${errObj.innerError.code})`);
            detail = parts.length > 0 ? parts.join(" - ") : errText;
          } catch {}

          if (res.status === 401 || res.status === 403) {
            return { labels: [], error: `Graph API ${res.status}: Access denied. Ensure the Entra app registration has the 'RecordsManagement.Read.All' application permission with admin consent granted for this tenant.` };
          }
          if (res.status === 404) {
            return { labels: [], error: `Retention labels not available for this tenant. The tenant may not have the required Microsoft Purview license.` };
          }

          const isTransient = res.status === 500 || res.status === 502 || res.status === 503 || res.status === 429;
          if (isTransient && (detail.includes("DataInsights") || detail.includes("Forbidden"))) {
            console.warn(`[retention-sync] Transient DataInsights error on ${apiVersion} (attempt ${attempt + 1}): ${detail.substring(0, 200)}`);
            lastError = `Graph API ${res.status} (${apiVersion}): ${detail}`;
            continue;
          }

          if (isTransient) {
            lastError = `Graph API ${res.status} (${apiVersion}): ${detail}`;
            continue;
          }

          return { labels: [], error: `Graph API ${res.status}: ${detail}` };
        }

        const data = await res.json();
        const rawLabels = data.value || [];

        let allLabels = [...rawLabels];
        let nextLink = data["@odata.nextLink"];
        while (nextLink) {
          const nextRes = await fetch(nextLink, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!nextRes.ok) break;
          const nextData = await nextRes.json();
          allLabels.push(...(nextData.value || []));
          nextLink = nextData["@odata.nextLink"];
        }

        const labels = allLabels.map((l: any) => ({
          labelId: l.id,
          name: l.displayName || l.name || "Unknown",
          description: l.descriptionForUsers || l.descriptionForAdmins || l.description || null,
          retentionDuration: l.retentionDuration?.days
            ? `${l.retentionDuration.days} days`
            : l.retentionDuration?.years
            ? `${l.retentionDuration.years} years`
            : l.retentionDuration?.months
            ? `${l.retentionDuration.months} months`
            : null,
          retentionAction: l.defaultRecordBehavior || null,
          behaviorDuringRetentionPeriod: l.behaviorDuringRetentionPeriod || null,
          actionAfterRetentionPeriod: l.actionAfterRetentionPeriod || null,
          isActive: l.isInUse !== false,
          isRecordLabel: l.defaultRecordBehavior === "startLocked" || l.defaultRecordBehavior === "startUnlocked",
        }));

        console.log(`[retention-sync] Successfully fetched ${labels.length} retention labels via ${apiVersion}`);
        return { labels };
      } catch (e: any) {
        lastError = e.message;
        console.warn(`[retention-sync] Exception on ${apiVersion} (attempt ${attempt + 1}): ${e.message}`);
      }
    }

    console.warn(`[retention-sync] All ${MAX_RETRIES} attempts failed for ${apiVersion}, trying next endpoint...`);
  }

  return { labels: [], error: `Retention label sync failed after retries. This is a known intermittent issue with Microsoft's Purview backend. Please try again in a few minutes. Last error: ${lastError}` };
}

export function clearTokenCache(tenantId?: string, clientId?: string) {
  if (tenantId && clientId) {
    tokenCache.delete(`${tenantId}:${clientId}`);
  } else {
    tokenCache.clear();
  }
}
