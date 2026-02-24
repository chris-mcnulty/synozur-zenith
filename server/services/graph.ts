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

export async function fetchHubSitesViaSearch(graphToken: string, region: string = "NAM"): Promise<{
  hubSites: { siteCollectionId: string; displayName: string; webUrl: string; graphId: string }[];
  associations: Map<string, string>;
  error?: string;
}> {
  const associations = new Map<string, string>();

  try {
    const hubSearchRes = await fetch("https://graph.microsoft.com/v1.0/search/query", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${graphToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [{
          entityTypes: ["site"],
          query: { queryString: "IsHubSite:true" },
          region,
          size: 100,
        }],
      }),
    });

    if (!hubSearchRes.ok) {
      const errText = await hubSearchRes.text();
      return { hubSites: [], associations, error: `Graph Search API error ${hubSearchRes.status}: ${errText.substring(0, 200)}` };
    }

    const hubSearchData = await hubSearchRes.json();
    const hubHits = hubSearchData.value?.[0]?.hitsContainers?.[0]?.hits || [];

    if (hubHits.length === 0) {
      return { hubSites: [], associations };
    }

    const resolvedHubs: { siteCollectionId: string; displayName: string; webUrl: string; graphId: string }[] = [];
    for (const hit of hubHits) {
      const graphId = hit.hitId;
      const siteCollectionId = graphId?.split(',')?.[1];
      if (!siteCollectionId) continue;

      try {
        const siteRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${graphId}`, {
          headers: { Authorization: `Bearer ${graphToken}` },
        });
        if (siteRes.ok) {
          const siteData = await siteRes.json();
          resolvedHubs.push({
            siteCollectionId,
            displayName: siteData.displayName,
            webUrl: siteData.webUrl,
            graphId,
          });
        }
      } catch {}
    }

    for (const hub of resolvedHubs) {
      try {
        const assocRes = await fetch("https://graph.microsoft.com/v1.0/search/query", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${graphToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requests: [{
              entityTypes: ["site"],
              query: { queryString: `DepartmentId:{${hub.siteCollectionId}}` },
              region,
              size: 500,
            }],
          }),
        });

        if (assocRes.ok) {
          const assocData = await assocRes.json();
          const assocHits = assocData.value?.[0]?.hitsContainers?.[0]?.hits || [];
          for (const assocHit of assocHits) {
            if (assocHit.hitId) {
              associations.set(assocHit.hitId.toLowerCase(), hub.siteCollectionId);
            }
          }
        }
      } catch {}
    }

    return { hubSites: resolvedHubs, associations };
  } catch (err: any) {
    return { hubSites: [], associations, error: err.message };
  }
}

export async function fetchHubSites(spoToken: string, domain: string, graphToken?: string): Promise<{
  hubSites: HubSiteInfo[];
  error?: string;
}> {
  const spoHost = domain.includes(".sharepoint.com") ? domain : `${domain.replace(/\..*$/, '')}.sharepoint.com`;
  const url = `https://${spoHost}/_api/SP.HubSites`;
  const emptyGuid = "00000000-0000-0000-0000-000000000000";

  const parseHubResponse = (data: any): HubSiteInfo[] => {
    return (data.value || []).map((h: any) => ({
      hubSiteId: h.ID || h.Id,
      siteId: h.SiteId,
      siteUrl: h.SiteUrl,
      title: h.Title,
      description: h.Description || undefined,
      parentHubSiteId: h.ParentHubSiteId && h.ParentHubSiteId !== emptyGuid ? h.ParentHubSiteId : undefined,
    }));
  };

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
      },
    });

    if (res.ok) {
      const data = await res.json();
      return { hubSites: parseHubResponse(data) };
    }

    const errText = await res.text();
    const spoError = `SP.HubSites API error ${res.status} (SPO token): ${errText.substring(0, 200)}`;
    console.warn(`[hub-sync] ${spoError}`);

    if (res.status === 401 && graphToken) {
      console.log(`[hub-sync] SPO token got 401, trying Graph app token as fallback...`);
      const graphRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${graphToken}`,
          Accept: "application/json;odata=nometadata",
        },
      });

      if (graphRes.ok) {
        console.log(`[hub-sync] Graph token succeeded for SP.HubSites!`);
        const data = await graphRes.json();
        return { hubSites: parseHubResponse(data) };
      }

      const graphErrText = await graphRes.text();
      console.warn(`[hub-sync] Graph token also failed for SP.HubSites: ${graphRes.status} ${graphErrText.substring(0, 200)}`);
      return { hubSites: [], error: `SPO token 401, Graph token ${graphRes.status}. Add SharePoint > Sites.Read.All application permission in Entra app registration.` };
    }

    return { hubSites: [], error: spoError };
  } catch (err: any) {
    return { hubSites: [], error: err.message };
  }
}

export async function fetchSiteHubAssociation(spoToken: string, siteUrl: string, graphToken?: string): Promise<{
  isHubSite: boolean;
  hubSiteId: string | null;
  error?: string;
}> {
  const url = `${siteUrl.replace(/\/+$/, '')}/_api/site?$select=IsHubSite,HubSiteId`;
  const emptyGuid = "00000000-0000-0000-0000-000000000000";

  const parseResponse = (data: any) => {
    const hubSiteId = data.HubSiteId;
    return {
      isHubSite: data.IsHubSite === true,
      hubSiteId: hubSiteId && hubSiteId !== emptyGuid ? hubSiteId : null,
    };
  };

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
      },
    });

    if (res.ok) {
      const data = await res.json();
      return parseResponse(data);
    }

    if (res.status === 401 && graphToken) {
      const graphRes = await fetch(url, {
        headers: {
          Authorization: `Bearer ${graphToken}`,
          Accept: "application/json;odata=nometadata",
        },
      });

      if (graphRes.ok) {
        const data = await graphRes.json();
        return parseResponse(data);
      }

      return { isHubSite: false, hubSiteId: null, error: `SPO:401,Graph:${graphRes.status}` };
    }

    return { isHubSite: false, hubSiteId: null, error: `${res.status}` };
  } catch (err: any) {
    return { isHubSite: false, hubSiteId: null, error: err.message };
  }
}

export async function joinHubSite(spoToken: string, siteUrl: string, hubSiteId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const url = `${siteUrl.replace(/\/+$/, '')}/_api/site/JoinHubSite('${hubSiteId}')`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
        "Content-Length": "0",
      },
    });

    if (res.ok) {
      return { success: true };
    }

    const errText = await res.text();
    return { success: false, error: `SharePoint API ${res.status}: ${errText.substring(0, 300)}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function leaveHubSite(spoToken: string, siteUrl: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const url = `${siteUrl.replace(/\/+$/, '')}/_api/site/UnJoinHubSite`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
        "Content-Length": "0",
      },
    });

    if (res.ok) {
      return { success: true };
    }

    const errText = await res.text();
    return { success: false, error: `SharePoint API ${res.status}: ${errText.substring(0, 300)}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function fetchSiteArchiveStatus(token: string, graphSiteId: string): Promise<{
  isArchived: boolean;
  archiveStatus: string | null;
  error?: string;
}> {
  try {
    const res = await fetch(`https://graph.microsoft.com/beta/sites/${graphSiteId}?$select=id,siteCollection`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      return { isArchived: false, archiveStatus: null, error: `Graph API ${res.status}` };
    }

    const data = await res.json();
    const archiveStatus = data?.siteCollection?.archivalDetails?.archiveStatus || null;
    const isArchived = archiveStatus === 'recentlyArchived' || archiveStatus === 'fullyArchived';

    if (archiveStatus) {
      console.log(`[archive-status] ${graphSiteId} → ${archiveStatus} (isArchived=${isArchived})`);
    }

    return { isArchived, archiveStatus };
  } catch (err: any) {
    return { isArchived: false, archiveStatus: null, error: err.message };
  }
}

export async function fetchSiteLockState(spoToken: string, siteUrl: string): Promise<{
  lockState: string;
  isArchived: boolean;
  error?: string;
}> {
  const url = `${siteUrl.replace(/\/+$/, '')}/_api/site?$select=ReadOnly,WriteLocked,LockIssue,IsArchived`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
      },
    });

    if (res.status === 403 || res.status === 401) {
      return { lockState: "Unknown", isArchived: false, error: `Permission denied (${res.status}) — site may be archived or inaccessible` };
    }

    if (!res.ok) {
      return { lockState: "Unknown", isArchived: false, error: `API ${res.status}` };
    }

    const data = await res.json();
    const isArchived = data.IsArchived === true;

    if (isArchived) {
      console.log(`[lock-state] ${siteUrl} → Archived`);
      return { lockState: data.ReadOnly ? "ReadOnly" : "Unlock", isArchived: true };
    }
    if (data.ReadOnly === true) {
      console.log(`[lock-state] ${siteUrl} → ReadOnly`);
      return { lockState: "ReadOnly", isArchived: false };
    }
    if (data.WriteLocked === true) {
      console.log(`[lock-state] ${siteUrl} → NoAdditions (WriteLocked)`);
      return { lockState: "NoAdditions", isArchived: false };
    }
    return { lockState: "Unlock", isArchived: false };
  } catch (err: any) {
    return { lockState: "Unknown", isArchived: false, error: err.message };
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
    archivalDetails?: {
      archiveStatus?: string;
    };
  };
}

export async function fetchSharePointSites(tenantId: string, clientId: string, clientSecret: string): Promise<{
  sites: GraphSite[];
  error?: string;
}> {
  try {
    let token = await getAppToken(tenantId, clientId, clientSecret);

    const allSites: GraphSite[] = [];
    let nextLink: string | null = "https://graph.microsoft.com/beta/sites?$top=100&$select=id,displayName,webUrl,description,createdDateTime,lastModifiedDateTime,isPersonalSite,root,siteCollection";
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
  lockState: string;
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
          lockState: row.lockState || 'Unlock',
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

export async function getGroupIdForSite(
  token: string,
  graphSiteId: string
): Promise<{ groupId?: string; error?: string }> {
  try {
    const driveRes = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/drive`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!driveRes.ok) {
      const errText = await driveRes.text();
      return { error: `Drive API error ${driveRes.status}: ${errText}` };
    }

    const driveData = await driveRes.json();
    const groupId = driveData?.owner?.group?.id;
    if (!groupId) {
      return { error: "No M365 Group associated with this site" };
    }

    return { groupId };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function applySensitivityLabelToGroup(
  token: string,
  groupId: string,
  sensitivityLabelId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${groupId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignedLabels: [{ labelId: sensitivityLabelId }],
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Graph API error ${res.status}: ${errText}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function removeSensitivityLabelFromGroup(
  token: string,
  groupId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/groups/${groupId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignedLabels: [],
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Graph API error ${res.status}: ${errText}` };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
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

async function getFormDigest(
  spoToken: string,
  siteUrl: string
): Promise<{ digest: string; error?: string }> {
  const normalizedUrl = siteUrl.replace(/\/$/, '');
  const contextUrl = `${normalizedUrl}/_api/contextinfo`;
  console.log(`[csom] Requesting form digest from: ${contextUrl}`);
  try {
    const res = await fetch(contextUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: 'application/json;odata=nometadata',
        'Content-Length': '0',
      },
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[csom] ContextInfo failed ${res.status}: headers=${JSON.stringify(Object.fromEntries(res.headers.entries()))}, body=${errText.slice(0, 500)}`);
      return { digest: '', error: `ContextInfo ${res.status}: ${errText}` };
    }
    const data = await res.json();
    const digest = data.FormDigestValue || data.d?.GetContextWebInformation?.FormDigestValue;
    if (!digest) {
      console.error(`[csom] No FormDigestValue in response: ${JSON.stringify(data).slice(0, 500)}`);
      return { digest: '', error: `No FormDigestValue in response: ${JSON.stringify(data).slice(0, 200)}` };
    }
    console.log(`[csom] Got form digest successfully (length: ${digest.length})`);
    return { digest };
  } catch (e: any) {
    return { digest: '', error: e.message };
  }
}

async function executeCsomQuery(
  spoToken: string,
  siteUrl: string,
  csomXml: string
): Promise<{ success: boolean; error?: string }> {
  const normalizedUrl = siteUrl.replace(/\/$/, '');
  try {
    const { digest, error: digestError } = await getFormDigest(spoToken, normalizedUrl);
    if (digestError) {
      console.warn(`[csom] Form digest failed (${digestError}), trying X-RequestDigest: 0`);
    }

    const res = await fetch(`${normalizedUrl}/_vti_bin/client.svc/ProcessQuery`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${spoToken}`,
        'Content-Type': 'text/xml',
        Accept: 'application/json;odata=nometadata',
        'X-RequestDigest': digest || '0',
      },
      body: csomXml,
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `CSOM ${res.status}: ${errText}` };
    }

    const responseText = await res.text();
    try {
      const parsed = JSON.parse(responseText);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item?.ErrorInfo) {
            return { success: false, error: `CSOM error: ${item.ErrorInfo.ErrorMessage}` };
          }
        }
      }
    } catch {}
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function fetchSitePropertyBag(
  spoToken: string,
  siteUrl: string
): Promise<{ properties: Record<string, string>; error?: string }> {
  const url = `${siteUrl.replace(/\/+$/, '')}/_api/web/AllProperties`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
      },
    });

    if (!res.ok) {
      return { properties: {}, error: `API ${res.status}: ${res.statusText}` };
    }

    const data = await res.json();
    const props: Record<string, string> = {};

    const skipPrefixes = [
      'vti_',
      '__',
      'odata.',
      'dlc_',
      'ecm_',
      'taxonomy',
      'clientformcustomformatter',
    ];
    const skipSuffixes = [
      'vti',
    ];
    const skipKeys = new Set([
      'allowinfodb',
      'profileschemaversion',
      'siteclassification',
    ]);

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) continue;
      const strVal = String(value);
      if (strVal === '' || strVal === 'null' || strVal === 'undefined') continue;
      const lk = key.toLowerCase();
      if (skipKeys.has(lk)) continue;
      if (skipPrefixes.some(p => lk.startsWith(p))) continue;
      if (skipSuffixes.some(s => lk.endsWith(s))) continue;
      const guidOnly = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (guidOnly.test(key)) continue;
      if (guidOnly.test(strVal) && !lk.includes('label') && !lk.includes('group') && !lk.includes('hub')) continue;
      props[key] = strVal;
    }

    return { properties: props };
  } catch (err: any) {
    return { properties: {}, error: err.message };
  }
}

export async function writeSitePropertyBag(
  spoToken: string,
  siteUrl: string,
  properties: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  let actionId = 5;
  let actionsXml = '';
  actionsXml += '<ObjectPath Id="2" ObjectPathId="1" />';
  actionsXml += '<ObjectPath Id="4" ObjectPathId="3" />';

  for (const [key, value] of Object.entries(properties)) {
    const safeKey = key.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const safeVal = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    actionsXml += `<Method Name="SetFieldValue" Id="${actionId}" ObjectPathId="3"><Parameters><Parameter Type="String">${safeKey}</Parameter><Parameter Type="String">${safeVal}</Parameter></Parameters></Method>`;
    actionId++;
  }
  actionsXml += `<Method Name="Update" Id="${actionId}" ObjectPathId="1" />`;

  const csomXml = `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions>${actionsXml}</Actions><ObjectPaths><Property Id="1" ParentId="0" Name="Web" /><Property Id="3" ParentId="1" Name="AllProperties" /><StaticProperty Id="0" TypeId="{3747adcd-a3c3-41b9-bfab-4a64dd2f1e0a}" Name="Current" /></ObjectPaths></Request>`;

  return executeCsomQuery(spoToken, siteUrl, csomXml);
}

export async function applySensitivityLabelToSite(
  spoToken: string,
  siteUrl: string,
  sensitivityLabelId: string
): Promise<{ success: boolean; error?: string }> {
  const csomXml = `<Request SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="2" ObjectPathId="1" /><SetProperty Id="3" ObjectPathId="1" Name="SensitivityLabelId"><Parameter Type="Guid">{${sensitivityLabelId}}</Parameter></SetProperty></Actions><ObjectPaths><Property Id="1" ParentId="0" Name="Site" /><StaticProperty Id="0" TypeId="{3747adcd-a3c3-41b9-bfab-4a64dd2f1e0a}" Name="Current" /></ObjectPaths></Request>`;

  return executeCsomQuery(spoToken, siteUrl, csomXml);
}

export async function removeSensitivityLabelFromSite(
  spoToken: string,
  siteUrl: string
): Promise<{ success: boolean; error?: string }> {
  const csomXml = `<Request SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="2" ObjectPathId="1" /><SetProperty Id="3" ObjectPathId="1" Name="SensitivityLabelId"><Parameter Type="Guid">{00000000-0000-0000-0000-000000000000}</Parameter></SetProperty></Actions><ObjectPaths><Property Id="1" ParentId="0" Name="Site" /><StaticProperty Id="0" TypeId="{3747adcd-a3c3-41b9-bfab-4a64dd2f1e0a}" Name="Current" /></ObjectPaths></Request>`;

  return executeCsomQuery(spoToken, siteUrl, csomXml);
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

export interface EntraUser {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  jobTitle: string | null;
  department: string | null;
}

export async function searchEntraUsers(token: string, query: string, limit: number = 10): Promise<{
  users: EntraUser[];
  error?: string;
}> {
  try {
    const escapedQuery = query.replace(/'/g, "''");
    const filter = `startswith(displayName,'${escapedQuery}') or startswith(mail,'${escapedQuery}') or startswith(userPrincipalName,'${escapedQuery}')`;
    const url = `https://graph.microsoft.com/v1.0/users?$filter=${encodeURIComponent(filter)}&$select=id,displayName,mail,userPrincipalName,jobTitle,department&$top=${limit}&$orderby=displayName`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      return { users: [], error: `Graph API error ${res.status}: ${errText}` };
    }

    const data = await res.json();
    const users: EntraUser[] = (data.value || []).map((u: any) => ({
      id: u.id,
      displayName: u.displayName || '',
      mail: u.mail || null,
      userPrincipalName: u.userPrincipalName || '',
      jobTitle: u.jobTitle || null,
      department: u.department || null,
    }));

    return { users };
  } catch (err: any) {
    return { users: [], error: err.message };
  }
}

export function clearTokenCache(tenantId?: string, clientId?: string) {
  if (tenantId && clientId) {
    tokenCache.delete(`${tenantId}:${clientId}`);
  } else {
    tokenCache.clear();
  }
}
