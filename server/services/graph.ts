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

export async function archiveSite(token: string, graphSiteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${graphSiteId}/archive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { success: false, error: `Graph API ${res.status}: ${body}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function unarchiveSite(token: string, graphSiteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${graphSiteId}/unarchive`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { success: false, error: `Graph API ${res.status}: ${body}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
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

export async function fetchTenantVerifiedDomains(tenantId: string, clientId: string, clientSecret: string): Promise<{
  domains: string[];
  initialDomain: string | null;
  error?: string;
}> {
  try {
    const token = await getAppToken(tenantId, clientId, clientSecret);
    const res = await fetch("https://graph.microsoft.com/v1.0/organization?$select=verifiedDomains", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { domains: [], initialDomain: null, error: `Graph API returned ${res.status}` };
    }
    const data = await res.json();
    const org = data.value?.[0];
    const verifiedDomains: Array<{ name: string; isDefault?: boolean; isInitial?: boolean }> = org?.verifiedDomains || [];
    const domains = verifiedDomains.map(d => d.name.toLowerCase());
    const initialDomainObj = verifiedDomains.find(d => d.isInitial);
    const initialDomain = initialDomainObj ? initialDomainObj.name.toLowerCase() : null;
    return { domains, initialDomain };
  } catch (err: any) {
    return { domains: [], initialDomain: null, error: err.message };
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

export async function fetchSiteCollectionAdmins(
  spoToken: string,
  siteUrl: string
): Promise<{ admins: SiteGroupOwner[]; error?: string }> {
  try {
    const seenEmails = new Set<string>();
    const allAdmins: SiteGroupOwner[] = [];

    const parseUsers = (users: any[]) => {
      for (const u of users) {
        if (!u.Email) continue;
        if (u.LoginName?.includes('spocrwl') || u.LoginName?.includes('app@sharepoint')) continue;
        const key = u.Email.toLowerCase();
        if (seenEmails.has(key)) continue;
        seenEmails.add(key);
        allAdmins.push({
          id: String(u.Id),
          displayName: u.Title || '',
          mail: u.Email,
          userPrincipalName: u.LoginName?.replace('i:0#.f|membership|', '') || u.Email,
        });
      }
    };

    const [adminsRes, ownersGroupRes] = await Promise.allSettled([
      fetch(
        `${siteUrl}/_api/web/siteusers?$filter=IsSiteAdmin eq true&$select=Id,Title,Email,LoginName`,
        { headers: { Authorization: `Bearer ${spoToken}`, Accept: 'application/json;odata=nometadata' } }
      ),
      fetch(
        `${siteUrl}/_api/web/AssociatedOwnerGroup/Users?$select=Id,Title,Email,LoginName`,
        { headers: { Authorization: `Bearer ${spoToken}`, Accept: 'application/json;odata=nometadata' } }
      ),
    ]);

    if (adminsRes.status === 'fulfilled' && adminsRes.value.ok) {
      const data = await adminsRes.value.json();
      parseUsers(data.value || []);
    }

    if (ownersGroupRes.status === 'fulfilled' && ownersGroupRes.value.ok) {
      const data = await ownersGroupRes.value.json();
      parseUsers(data.value || []);
    } else if (ownersGroupRes.status === 'fulfilled') {
      console.log(`[site-owners] AssociatedOwnerGroup not available for ${siteUrl} (${ownersGroupRes.value.status})`);
    }

    return { admins: allAdmins };
  } catch (err: any) {
    return { admins: [], error: err.message };
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

export async function applySensitivityLabelToSpeContainer(
  token: string,
  containerId: string,
  sensitivityLabelId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sensitivityLabel: { id: sensitivityLabelId },
        }),
      }
    );
    if (res.ok) return { success: true };
    const errText = await res.text();
    let detail = errText;
    try {
      const parsed = JSON.parse(errText);
      detail = parsed.error?.message || parsed.message || errText;
    } catch {}
    return { success: false, error: `Graph API ${res.status}: ${detail.substring(0, 300)}` };
  } catch (err: any) {
    return { success: false, error: err.message };
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

export async function fetchSiteTelemetry(token: string, graphSiteId: string): Promise<{
  storageUsedBytes?: number;
  storageTotalBytes?: number;
  fileCount?: number;
  listCount?: number;
  lastActivityDate?: string;
}> {
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${graphSiteId}?$select=id`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return {};

    const driveRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${graphSiteId}/drive`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let storageUsedBytes: number | undefined;
    let storageTotalBytes: number | undefined;
    if (driveRes.ok) {
      const driveData = await driveRes.json();
      storageUsedBytes = driveData?.quota?.used;
      storageTotalBytes = driveData?.quota?.total;
    }

    const listsRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${graphSiteId}/lists?$select=id,list&$top=999`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let listCount: number | undefined;
    let fileCount: number | undefined;
    if (listsRes.ok) {
      const listsData = await listsRes.json();
      const allLists = listsData?.value || [];
      listCount = allLists.length;
      const docLibs = allLists.filter((l: any) => l.list?.template === 'documentLibrary' || l.list?.template === 'genericList');
      fileCount = docLibs.reduce((sum: number, l: any) => sum + (l.list?.contentTypesEnabled ? 0 : 0), 0);
    }

    const analytics = await fetchSiteAnalytics(token, graphSiteId);

    return {
      storageUsedBytes,
      storageTotalBytes,
      fileCount,
      listCount,
      lastActivityDate: analytics.lastActivityDate,
    };
  } catch (err) {
    console.error(`[graph] fetchSiteTelemetry error for ${graphSiteId}:`, err);
    return {};
  }
}

export interface SpeContainerFromGraph {
  id: string;
  displayName: string;
  description?: string;
  containerTypeId: string;
  status?: string;
  createdDateTime?: string;
  settings?: {
    isOcrEnabled?: boolean;
  };
}

export interface SpeContainerTypeFromGraph {
  containerTypeId: string;
  displayName: string;
  description?: string;
  owningAppId?: string;
}

export async function fetchAllSpeContainerTypes(
  graphToken: string,
  adminToken: string,
  adminHost: string
): Promise<SpeContainerTypeFromGraph[]> {
  console.log(`[spe] Trying Graph API for container types...`);
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/storage/fileStorage/containerTypes", {
      headers: { Authorization: `Bearer ${graphToken}` },
    });
    if (res.ok) {
      const data = await res.json();
      const types = data.value || [];
      console.log(`[spe] Graph API returned ${types.length} container types`);
      return types;
    }
    const errText = await res.text();
    console.warn(`[spe] Graph containerTypes ${res.status}: ${errText.slice(0, 300)}`);
  } catch (err: any) {
    console.warn(`[spe] Graph containerTypes error: ${err.message}`);
  }

  console.log(`[spe] Trying SPO Admin REST for container types...`);

  const spoEndpoints = [
    { name: "GetSPOContainerTypes (POST empty)", method: "POST", path: "/_api/SPO.Tenant/GetSPOContainerTypes", body: JSON.stringify({}) },
    { name: "GetSPOContainerTypes (POST no body)", method: "POST", path: "/_api/SPO.Tenant/GetSPOContainerTypes", body: undefined },
    { name: "GetSPOContainerTypes (GET)", method: "GET", path: "/_api/SPO.Tenant/GetSPOContainerTypes", body: undefined },
    { name: "ContainerTypes (GET)", method: "GET", path: "/_api/SPO.Tenant/ContainerTypes", body: undefined },
    { name: "GetSPOContainerTypes (POST with paging)", method: "POST", path: "/_api/SPO.Tenant/GetSPOContainerTypes", body: JSON.stringify({ "SortOrder": 0, "SortedByColumn": "", "StartIndex": 0, "PageSize": 100 }) },
  ];

  for (const ep of spoEndpoints) {
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${adminToken}`,
        Accept: "application/json;odata=verbose",
      };
      if (ep.body !== undefined) {
        headers["Content-Type"] = "application/json;odata=verbose";
      }
      const res = await fetch(`https://${adminHost}${ep.path}`, {
        method: ep.method,
        headers,
        body: ep.body,
      });
      const text = await res.text();
      console.log(`[spe] ${ep.name}: ${res.status} — ${text.slice(0, 800)}`);

      if (res.ok && text.length > 5) {
        try {
          const data = JSON.parse(text);

          const paths = [
            data?.d?.GetSPOContainerTypes?.ContainerTypeCollection?.results,
            data?.d?.GetSPOContainerTypes?.results,
            data?.d?.GetSPOContainerTypes,
            data?.d?.ContainerTypes?.results,
            data?.d?.results,
            data?.value,
          ];

          for (const items of paths) {
            if (Array.isArray(items) && items.length > 0) {
              console.log(`[spe] SUCCESS: ${ep.name} returned ${items.length} container types! First: ${JSON.stringify(items[0]).slice(0, 500)}`);
              return items.map((item: any) => ({
                containerTypeId: item.ContainerTypeId || item.containerTypeId || item.SPContainerTypeBillingClassification || "",
                displayName: item.DisplayName || item.displayName || item.ContainerTypeName || "",
                description: item.Description || item.description || "",
                owningAppId: item.OwningApplicationId || item.owningAppId || item.ApplicationId || item.OwningAppId || "",
              }));
            }
          }

          if (typeof data?.d?.GetSPOContainerTypes === "object" && data?.d?.GetSPOContainerTypes !== null) {
            const obj = data.d.GetSPOContainerTypes;
            const allKeys = Object.keys(obj).filter(k => k !== "__metadata");
            console.log(`[spe] GetSPOContainerTypes response keys: ${JSON.stringify(allKeys)}`);
            for (const key of allKeys) {
              const val = obj[key];
              if (val && typeof val === "object" && val.results && Array.isArray(val.results)) {
                console.log(`[spe] Found array at key "${key}" with ${val.results.length} items`);
                if (val.results.length > 0) {
                  console.log(`[spe] First item: ${JSON.stringify(val.results[0]).slice(0, 500)}`);
                  return val.results.map((item: any) => ({
                    containerTypeId: item.ContainerTypeId || item.containerTypeId || "",
                    displayName: item.DisplayName || item.displayName || item.ContainerTypeName || "",
                    description: item.Description || item.description || "",
                    owningAppId: item.OwningApplicationId || item.owningAppId || item.ApplicationId || "",
                  }));
                }
              }
            }
          }
        } catch {}
      }
    } catch (err: any) {
      console.warn(`[spe] ${ep.name} error: ${err.message}`);
    }
  }

  return [];
}

export async function fetchAllSpeContainers(
  graphToken: string,
  adminToken: string,
  adminHost: string,
  customApps?: Array<{ name: string; appId: string }>
): Promise<SpeContainerFromGraph[]> {
  const allContainers: SpeContainerFromGraph[] = [];

  console.log(`[spe] Trying Graph API for containers...`);
  try {
    let url: string | null = "https://graph.microsoft.com/v1.0/storage/fileStorage/containers?$top=999";
    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${graphToken}` },
      });
      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[spe] Graph containers ${res.status}: ${errText.slice(0, 300)}`);
        break;
      }
      const data = await res.json();
      const containers = data.value || [];
      allContainers.push(...containers);
      url = data["@odata.nextLink"] || null;
    }
    if (allContainers.length > 0) {
      console.log(`[spe] Graph API returned ${allContainers.length} containers`);
      return allContainers;
    }
  } catch (err: any) {
    console.warn(`[spe] Graph containers error: ${err.message}`);
  }

  console.log(`[spe] Graph returned 0 containers, trying beta API...`);
  try {
    let url: string | null = "https://graph.microsoft.com/beta/storage/fileStorage/containers?$top=999";
    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${graphToken}` },
      });
      if (!res.ok) {
        const errText = await res.text();
        console.warn(`[spe] Graph beta containers ${res.status}: ${errText.slice(0, 300)}`);
        break;
      }
      const data = await res.json();
      const containers = data.value || [];
      allContainers.push(...containers);
      url = data["@odata.nextLink"] || null;
    }
    if (allContainers.length > 0) {
      console.log(`[spe] Graph beta returned ${allContainers.length} containers`);
      return allContainers;
    }
  } catch (err: any) {
    console.warn(`[spe] Graph beta error: ${err.message}`);
  }

  if (!adminToken) {
    console.log(`[spe] No admin token available, cannot try SPO Admin REST`);
    return allContainers;
  }

  console.log(`[spe] Graph APIs returned 0, using SPO Admin REST...`);

  const seenContainerIds = new Set<string>();

  try {
    console.log(`[spe] Trying GetSPOContainers (all containers)...`);
    const allRes = await fetch(`https://${adminHost}/_api/SPO.Tenant/GetSPOContainers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        Accept: "application/json;odata=verbose",
        "Content-Type": "application/json;odata=verbose",
      },
      body: JSON.stringify({}),
    });

    if (allRes.ok) {
      const allData = await allRes.json();
      const rawBody = JSON.stringify(allData).slice(0, 500);
      console.log(`[spe] GetSPOContainers 200 — ${rawBody}`);

      const containerResults = allData?.d?.GetSPOContainers?.ContainerCollection?.results
        || allData?.d?.GetSPOContainers?.results
        || allData?.d?.results
        || [];

      if (containerResults.length > 0) {
        console.log(`[spe] GetSPOContainers returned ${containerResults.length} containers`);
        for (const item of containerResults) {
          const containerId = item.ContainerId || "";
          if (!containerId || seenContainerIds.has(containerId)) continue;
          seenContainerIds.add(containerId);

          const appName = item.OwningApplicationName || item.ApplicationName || "Unknown";
          allContainers.push({
            id: containerId,
            displayName: item.ContainerName || item.Title || `Container`,
            containerTypeId: item.ContainerTypeId || "",
            description: item.Description || "",
            status: item.Status === 1 ? "active" : item.Status === 2 ? "inactive" : String(item.Status || "active"),
            createdDateTime: item.CreatedOn || "",
            _owningAppName: appName,
            _owningAppId: item.OwningApplicationId || item.ApplicationId || "",
            _storageUsed: item.StorageUsedInBytes ?? item.StorageUsed ?? null,
            _storageTotal: item.StorageQuota ?? null,
            _sensitivityLabel: item.SensitivityLabel || null,
            _sharingCapability: item.SharingCapability ?? null,
            _lockState: item.LockState ?? null,
            _siteUrl: item.ContainerSiteUrl || item.SiteUrl || null,
            _ownerDisplayName: item.Owners || null,
            _ownerLoginName: item.OwnerLoginName || null,
          } as any);
        }

        if (allContainers.length > 0) {
          console.log(`[spe] GetSPOContainers found ${allContainers.length} total containers`);
          return allContainers;
        }
      }
    } else {
      const errText = await allRes.text();
      console.log(`[spe] GetSPOContainers ${allRes.status} — ${errText.slice(0, 300)}`);
    }
  } catch (err: any) {
    console.log(`[spe] GetSPOContainers error: ${err.message}`);
  }

  console.log(`[spe] Falling back to GetSPOContainersByApplicationId per-app probing...`);

  const KNOWN_SPE_APPS: Array<{ name: string; appId: string }> = [
    { name: "Microsoft Loop", appId: "a187e399-0c36-4b98-8f04-1edc167a0996" },
    { name: "Microsoft Designer", appId: "5e2795e3-ce8c-4cfb-b302-35fe5cd01597" },
    { name: "Microsoft Whiteboard", appId: "95de633a-083e-42f5-b444-a4295d8e9314" },
    { name: "Microsoft Copilot", appId: "fb8d773d-7ef8-4ec0-a117-179f88add510" },
    { name: "Microsoft Stream", appId: "cf53fce8-def6-4aeb-8d30-b158e7b1cf83" },
    { name: "Microsoft Clipchamp", appId: "1d34b7f4-45ac-40c3-a21c-309fdd0c6722" },
    { name: "Microsoft OneNote", appId: "0d4a2b35-7abf-4a8b-9c40-2f7e90f31c1e" },
    { name: "Microsoft Planner", appId: "09abbdfd-ed23-44ee-a2d9-a627aa1c90f3" },
    { name: "Microsoft Forms", appId: "c9a559d2-7aab-4f13-a6ed-e7e9c52aec87" },
    { name: "Microsoft ToDo", appId: "c44b4083-3bb0-49c1-b47d-974e53cbdf3c" },
    { name: "Microsoft Places", appId: "95e5571f-aec6-4c27-863a-0e1e35e9b78c" },
    { name: "SharePoint Online", appId: "00000003-0000-0ff1-ce00-000000000000" },
  ];

  if (customApps && customApps.length > 0) {
    for (const ca of customApps) {
      if (ca.appId && !KNOWN_SPE_APPS.some(k => k.appId === ca.appId)) {
        KNOWN_SPE_APPS.push({ name: ca.name, appId: ca.appId });
      }
    }
  }

  const addDiscoveredApp = (name: string, appId: string) => {
    if (appId && !KNOWN_SPE_APPS.some(k => k.appId === appId)) {
      console.log(`[spe] Discovered app: ${name} (${appId})`);
      KNOWN_SPE_APPS.push({ name, appId });
    }
  };

  try {
    console.log(`[spe] Auto-discovering SPE apps...`);
    const spoSpRes = await fetch(
      `https://graph.microsoft.com/v1.0/servicePrincipals?$filter=appId eq '00000003-0000-0ff1-ce00-000000000000'&$select=id`,
      { headers: { Authorization: `Bearer ${graphToken}` } }
    );
    if (spoSpRes.ok) {
      const spoSpData = await spoSpRes.json();
      const spoSpId = spoSpData?.value?.[0]?.id;
      if (spoSpId) {
        let nextLink: string | null = `https://graph.microsoft.com/v1.0/servicePrincipals/${spoSpId}/appRoleAssignedTo?$select=principalId,principalDisplayName,appRoleId&$top=999`;
        while (nextLink) {
          const roleRes = await fetch(nextLink, { headers: { Authorization: `Bearer ${graphToken}` } });
          if (!roleRes.ok) break;
          const roleData = await roleRes.json();
          for (const a of (roleData?.value || [])) {
            if (a.principalId && a.principalDisplayName) {
              if (!KNOWN_SPE_APPS.some(k => k.name === a.principalDisplayName)) {
                try {
                  const spRes = await fetch(
                    `https://graph.microsoft.com/v1.0/servicePrincipals/${a.principalId}?$select=appId,displayName`,
                    { headers: { Authorization: `Bearer ${graphToken}` } }
                  );
                  if (spRes.ok) {
                    const sp = await spRes.json();
                    if (sp?.appId) addDiscoveredApp(sp.displayName || a.principalDisplayName, sp.appId);
                  }
                } catch {}
              }
            }
          }
          nextLink = roleData?.["@odata.nextLink"] || null;
        }

        try {
          let grantLink: string | null = `https://graph.microsoft.com/v1.0/oauth2PermissionGrants?$filter=resourceId eq '${spoSpId}'&$top=999&$select=clientId,scope`;
          while (grantLink) {
            const grantRes = await fetch(grantLink, { headers: { Authorization: `Bearer ${graphToken}` } });
            if (!grantRes.ok) {
              console.log(`[spe] oauth2PermissionGrants: ${grantRes.status}`);
              break;
            }
            const grantData = await grantRes.json();
            for (const g of (grantData?.value || [])) {
              const scopes = (g.scope || "").toLowerCase();
              if (scopes.includes("container") || scopes.includes("filestorage") || scopes.includes("allsites") || scopes.includes("sites.")) {
                try {
                  const spRes = await fetch(
                    `https://graph.microsoft.com/v1.0/servicePrincipals/${g.clientId}?$select=appId,displayName`,
                    { headers: { Authorization: `Bearer ${graphToken}` } }
                  );
                  if (spRes.ok) {
                    const sp = await spRes.json();
                    if (sp?.appId) addDiscoveredApp(sp.displayName || `App-${g.clientId}`, sp.appId);
                  }
                } catch {}
              }
            }
            grantLink = grantData?.["@odata.nextLink"] || null;
          }
        } catch (err: any) {
          console.log(`[spe] oauth2PermissionGrants error: ${err.message}`);
        }
      }
    }

    const searchTerms = ["agent", "copilot", "constellation", "container", "embedded", "declarative"];
    for (const term of searchTerms) {
      try {
        const searchRes = await fetch(
          `https://graph.microsoft.com/v1.0/servicePrincipals?$search="displayName:${term}"&$select=appId,displayName&$top=50`,
          {
            headers: {
              Authorization: `Bearer ${graphToken}`,
              ConsistencyLevel: "eventual",
            },
          }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          for (const sp of (searchData?.value || [])) {
            if (sp?.appId) addDiscoveredApp(sp.displayName, sp.appId);
          }
        }
      } catch {}
    }

    console.log(`[spe] Total apps to probe after discovery: ${KNOWN_SPE_APPS.length}`);
  } catch (err: any) {
    console.warn(`[spe] Auto-discovery error: ${err.message}`);
  }

  for (const app of KNOWN_SPE_APPS) {
    try {
      const res = await fetch(`https://${adminHost}/_api/SPO.Tenant/GetSPOContainersByApplicationId`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken}`,
          Accept: "application/json;odata=verbose",
          "Content-Type": "application/json;odata=verbose",
        },
        body: JSON.stringify({ owningApplicationId: app.appId }),
      });

      if (!res.ok) {
        if (res.status === 500) {
          continue;
        }
        const errText = await res.text();
        console.warn(`[spe] ${app.name} (${app.appId}): ${res.status} — ${errText.slice(0, 200)}`);
        continue;
      }

      const data = await res.json();
      const containerCollection = data?.d?.GetSPOContainersByApplicationId?.ContainerCollection?.results || [];

      if (containerCollection.length > 0) {
        console.log(`[spe] ${app.name}: found ${containerCollection.length} containers`);
        for (const item of containerCollection) {
          const containerId = item.ContainerId || "";
          if (!containerId || seenContainerIds.has(containerId)) continue;
          seenContainerIds.add(containerId);

          allContainers.push({
            id: containerId,
            displayName: item.ContainerName || item.Title || `${app.name} Container`,
            containerTypeId: item.ContainerTypeId || "",
            description: item.Description || "",
            status: item.Status === 1 ? "active" : item.Status === 2 ? "inactive" : String(item.Status || "active"),
            createdDateTime: item.CreatedOn || "",
            _owningAppName: app.name,
            _owningAppId: app.appId,
            _storageUsed: item.StorageUsedInBytes ?? item.StorageUsed ?? null,
            _storageTotal: item.StorageQuota ?? null,
            _sensitivityLabel: item.SensitivityLabel || null,
            _sharingCapability: item.SharingCapability ?? null,
            _lockState: item.LockState ?? null,
            _siteUrl: item.ContainerSiteUrl || item.SiteUrl || null,
            _ownerDisplayName: item.Owners || null,
            _ownerLoginName: item.OwnerLoginName || null,
          } as any);
        }
      }
    } catch (err: any) {
      console.warn(`[spe] ${app.name} error: ${err.message}`);
    }
  }

  console.log(`[spe] SPO Admin REST found ${allContainers.length} total containers across ${KNOWN_SPE_APPS.length} app probes`);
  return allContainers;
}

export async function fetchSpeContainerDriveDetails(graphToken: string, containerId: string): Promise<{
  storageUsedInBytes?: number;
  itemCount?: number;
  owners?: Array<{ displayName?: string; userPrincipalName?: string }>;
  lastActivityDate?: string;
}> {
  const result: any = {};

  try {
    const driveRes = await fetch(`https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}/drive`, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });
    if (driveRes.ok) {
      const driveData = await driveRes.json();
      result.storageUsedInBytes = driveData?.quota?.used;
    }
  } catch {}

  try {
    const listItemsRes = await fetch(
      `https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}/drive/list/items?$top=1&$count=true`,
      {
        headers: {
          Authorization: `Bearer ${graphToken}`,
          ConsistencyLevel: "eventual",
        },
      },
    );
    if (listItemsRes.ok) {
      const listItemsData = await listItemsRes.json();
      const count = listItemsData["@odata.count"];
      if (typeof count === "number") {
        result.itemCount = count;
      }
    }
  } catch {}

  try {
    const permRes = await fetch(`https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}/permissions?$top=100`, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });
    if (permRes.ok) {
      const permData = await permRes.json();
      const perms = permData.value || [];
      result.owners = perms
        .filter((p: any) => p.roles?.includes("owner"))
        .map((p: any) => ({
          displayName: p.grantedToV2?.user?.displayName || p.grantedToV2?.group?.displayName,
          userPrincipalName: p.grantedToV2?.user?.userPrincipalName,
        }))
        .filter((o: any) => o.displayName);
    }
  } catch {}

  try {
    const rootRes = await fetch(`https://graph.microsoft.com/v1.0/storage/fileStorage/containers/${containerId}/drive/root`, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });
    if (rootRes.ok) {
      const rootData = await rootRes.json();
      result.lastActivityDate = rootData?.lastModifiedDateTime;
    }
  } catch {}

  return result;
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
): Promise<{ success: boolean; error?: string; data?: string }> {
  const normalizedUrl = siteUrl.replace(/\/$/, '');
  try {
    try {
      const tokenPayload = JSON.parse(Buffer.from(spoToken.split('.')[1], 'base64').toString());
      console.log(`[csom] Token audience: ${tokenPayload.aud}, roles/scp: ${tokenPayload.roles || tokenPayload.scp || 'none'}, upn: ${tokenPayload.upn || tokenPayload.unique_name || 'unknown'}`);
    } catch {}

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
            console.error(`[csom] ErrorInfo:`, JSON.stringify(item.ErrorInfo));
            return { success: false, error: `CSOM error: ${item.ErrorInfo.ErrorMessage}` };
          }
        }
      }
    } catch {}
    return { success: true, data: responseText };
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

    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('odata.')) continue;
      if (key.toLowerCase().startsWith('vti_')) continue;
      if (value === null || value === undefined) continue;
      const strVal = String(value);
      if (strVal === '') continue;
      props[key] = strVal;
    }

    return { properties: props };
  } catch (err: any) {
    return { properties: {}, error: err.message };
  }
}

const PROPERTY_BAG_BLOCKED_PREFIXES = ['vti_', 'ows_', 'docid_', '_vti_', '__', 'ecm_', 'ir_'];

function sanitizePropertyBagKeys(properties: Record<string, string>): { safe: Record<string, string>; blocked: string[] } {
  const safe: Record<string, string> = {};
  const blocked: string[] = [];
  for (const [key, value] of Object.entries(properties)) {
    const lower = key.toLowerCase();
    if (PROPERTY_BAG_BLOCKED_PREFIXES.some(p => lower.startsWith(p))) {
      blocked.push(key);
      continue;
    }
    safe[key] = value;
  }
  return { safe, blocked };
}

export async function writeSitePropertyBag(
  spoToken: string,
  siteUrl: string,
  properties: Record<string, string>,
  userId?: string
): Promise<{ success: boolean; error?: string; reindexRequested?: boolean }> {
  const { safe, blocked } = sanitizePropertyBagKeys(properties);
  if (blocked.length > 0) {
    console.warn(`[property-bag] BLOCKED ${blocked.length} reserved keys from write: ${blocked.join(', ')}`);
  }
  if (Object.keys(safe).length === 0) {
    return { success: false, error: `All property keys were blocked (reserved prefixes): ${blocked.join(', ')}` };
  }
  console.log(`[property-bag] Writing ${Object.keys(safe).length} properties to ${siteUrl}: ${Object.keys(safe).join(', ')}`);

  let writeResult: { success: boolean; error?: string };

  const result1 = await writeSitePropertyBagViaCsom(spoToken, siteUrl, safe);
  if (result1.success) {
    writeResult = result1;
  } else {
    console.warn(`[property-bag] Direct CSOM failed: ${result1.error}`);
    if (userId) {
      console.log(`[property-bag] Trying admin NoScript toggle approach (disable NoScript → write → re-enable)`);
      const result2 = await writeSitePropertyBagWithNoScriptToggle(spoToken, siteUrl, safe, userId);
      if (result2.success) {
        writeResult = result2;
      } else {
        console.warn(`[property-bag] Admin NoScript toggle failed: ${result2.error}`);
        return { success: false, error: result2.error };
      }
    } else {
      return { success: false, error: result1.error };
    }
  }

  let reindexRequested = false;
  try {
    const reindexResult = await requestSiteReindex(spoToken, siteUrl, userId);
    if (reindexResult.success) {
      reindexRequested = true;
      console.log(`[property-bag] Re-index requested for ${siteUrl} — crawl will pick up changes faster`);
    } else {
      console.warn(`[property-bag] Re-index request failed (non-blocking): ${reindexResult.error}`);
    }
  } catch (reindexErr: any) {
    console.warn(`[property-bag] Re-index request error (non-blocking): ${reindexErr.message}`);
  }

  return { success: true, reindexRequested };
}

export async function requestSiteReindex(
  spoToken: string,
  siteUrl: string,
  userId?: string
): Promise<{ success: boolean; error?: string; searchVersion?: number }> {
  const normalizedUrl = siteUrl.replace(/\/+$/, '');
  try {
    const propsRes = await fetch(`${normalizedUrl}/_api/web/AllProperties`, {
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
      },
    });
    let currentVersion = 0;
    if (propsRes.ok) {
      const propsData = await propsRes.json();
      const raw = propsData['vti_searchversion'];
      if (raw !== undefined && raw !== null) {
        currentVersion = parseInt(String(raw), 10) || 0;
      }
    }
    const newVersion = currentVersion + 1;

    const csomXml = `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="2" ObjectPathId="1" /><ObjectPath Id="4" ObjectPathId="3" /><Method Name="SetFieldValue" Id="5" ObjectPathId="3"><Parameters><Parameter Type="String">vti_searchversion</Parameter><Parameter Type="String">${newVersion}</Parameter></Parameters></Method><Method Name="Update" Id="6" ObjectPathId="1" /></Actions><ObjectPaths><Property Id="1" ParentId="0" Name="Web" /><Property Id="3" ParentId="1" Name="AllProperties" /><StaticProperty Id="0" TypeId="{3747adcd-a3c3-41b9-bfab-4a64dd2f1e0a}" Name="Current" /></ObjectPaths></Request>`;

    const result = await executeCsomQuery(spoToken, normalizedUrl, csomXml);
    if (result.success) {
      console.log(`[reindex] Successfully requested re-index for ${normalizedUrl} (vti_searchversion: ${currentVersion} → ${newVersion})`);
      return { success: true, searchVersion: newVersion };
    }

    if (userId) {
      console.log(`[reindex] Direct CSOM failed, trying NoScript toggle for re-index`);
      const noScriptResult = await executeCsomWithNoScriptToggle(spoToken, normalizedUrl, csomXml, userId);
      if (noScriptResult.success) {
        console.log(`[reindex] Successfully requested re-index via NoScript toggle (vti_searchversion: ${currentVersion} → ${newVersion})`);
        return { success: true, searchVersion: newVersion };
      }
      return { success: false, error: noScriptResult.error };
    }

    return { success: false, error: result.error };
  } catch (err: any) {
    return { success: false, error: `Re-index request failed: ${err.message}` };
  }
}

async function writeSitePropertyBagViaRest(
  spoToken: string,
  siteUrl: string,
  properties: Record<string, string>
): Promise<{ success: boolean; error?: string }> {
  const normalizedUrl = siteUrl.replace(/\/$/, '');
  try {
    const { digest, error: digestError } = await getFormDigest(spoToken, normalizedUrl);
    if (digestError && !digest) {
      return { success: false, error: `Form digest failed: ${digestError}` };
    }

    const body: Record<string, any> = {
      "__metadata": { "type": "SP.PropertyValues" },
      ...properties,
    };

    console.log(`[property-bag] Trying REST MERGE on /_api/web/AllProperties`);
    const res = await fetch(`${normalizedUrl}/_api/web/AllProperties`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${spoToken}`,
        'Content-Type': 'application/json;odata=verbose',
        'X-HTTP-Method': 'MERGE',
        'X-RequestDigest': digest || '0',
        'If-Match': '*',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `REST MERGE ${res.status}: ${errText.substring(0, 200)}` };
    }

    console.log(`[property-bag] REST MERGE succeeded`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

function encodeIndexedPropertyKey(key: string): string {
  const buf = Buffer.alloc(key.length * 2);
  for (let i = 0; i < key.length; i++) {
    buf.writeUInt16LE(key.charCodeAt(i), i * 2);
  }
  return buf.toString('base64');
}

function buildIndexedPropertyKeysValue(existingValue: string | null, newKeys: string[]): string {
  const existingEntries = existingValue ? existingValue.split('|').filter(e => e.length > 0) : [];
  const encodedNewKeys = newKeys.map(k => encodeIndexedPropertyKey(k));
  for (const encoded of encodedNewKeys) {
    if (!existingEntries.includes(encoded)) {
      existingEntries.push(encoded);
    }
  }
  return existingEntries.join('|') + '|';
}

async function writeSitePropertyBagViaCsom(
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

  console.log(`[property-bag] Trying CSOM Web.AllProperties approach`);
  const result = await executeCsomQuery(spoToken, siteUrl, csomXml);
  if (!result.success) return result;

  const indexResult = await ensurePropertyKeysIndexed(spoToken, siteUrl, Object.keys(properties));
  if (!indexResult.success) {
    console.warn(`[property-bag] Properties written but indexing failed: ${indexResult.error}`);
  }
  return result;
}

async function ensurePropertyKeysIndexed(
  spoToken: string,
  siteUrl: string,
  keys: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[property-bag] Ensuring ${keys.length} property keys are indexed: ${keys.join(', ')}`);

    const rawUrl = `${siteUrl.replace(/\/+$/, '')}/_api/web/AllProperties`;
    let existingIndexedKeys = '';
    try {
      const rawRes = await fetch(rawUrl, {
        headers: {
          Authorization: `Bearer ${spoToken}`,
          Accept: "application/json;odata=nometadata",
        },
      });
      if (rawRes.ok) {
        const rawData = await rawRes.json();
        existingIndexedKeys = (rawData['vti_indexedpropertykeys'] as string) || '';
        console.log(`[property-bag] Existing vti_indexedpropertykeys: ${existingIndexedKeys ? existingIndexedKeys.substring(0, 80) + '...' : '(empty)'}`);
      }
    } catch (readErr: any) {
      console.warn(`[property-bag] Could not read existing indexed keys: ${readErr.message}`);
    }
    const updatedIndexedKeys = buildIndexedPropertyKeysValue(existingIndexedKeys, keys);

    if (updatedIndexedKeys === existingIndexedKeys) {
      console.log(`[property-bag] All keys already indexed, skipping`);
      return { success: true };
    }

    const safeVal = updatedIndexedKeys.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const indexCsomXml = `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="2" ObjectPathId="1" /><ObjectPath Id="4" ObjectPathId="3" /><Method Name="SetFieldValue" Id="5" ObjectPathId="3"><Parameters><Parameter Type="String">vti_indexedpropertykeys</Parameter><Parameter Type="String">${safeVal}</Parameter></Parameters></Method><Method Name="Update" Id="6" ObjectPathId="1" /></Actions><ObjectPaths><Property Id="1" ParentId="0" Name="Web" /><Property Id="3" ParentId="1" Name="AllProperties" /><StaticProperty Id="0" TypeId="{3747adcd-a3c3-41b9-bfab-4a64dd2f1e0a}" Name="Current" /></ObjectPaths></Request>`;

    const result = await executeCsomQuery(spoToken, siteUrl, indexCsomXml);
    if (result.success) {
      console.log(`[property-bag] Successfully indexed ${keys.length} property keys`);
    }
    return result;
  } catch (err: any) {
    return { success: false, error: `Indexing failed: ${err.message}` };
  }
}

async function writeSitePropertyBagWithNoScriptToggle(
  spoToken: string,
  siteUrl: string,
  properties: Record<string, string>,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const rawUrl = `${siteUrl.replace(/\/+$/, '')}/_api/web/AllProperties`;
  let existingIndexedKeys = '';
  try {
    const rawRes = await fetch(rawUrl, {
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
      },
    });
    if (rawRes.ok) {
      const rawData = await rawRes.json();
      existingIndexedKeys = (rawData['vti_indexedpropertykeys'] as string) || '';
    }
  } catch (readErr: any) {
    console.warn(`[property-bag] Could not read existing indexed keys for combined write: ${readErr.message}`);
  }

  const updatedIndexedKeys = buildIndexedPropertyKeysValue(existingIndexedKeys, Object.keys(properties));
  const needsIndexUpdate = updatedIndexedKeys !== existingIndexedKeys;

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
  if (needsIndexUpdate) {
    const safeIndexVal = updatedIndexedKeys.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    actionsXml += `<Method Name="SetFieldValue" Id="${actionId}" ObjectPathId="3"><Parameters><Parameter Type="String">vti_indexedpropertykeys</Parameter><Parameter Type="String">${safeIndexVal}</Parameter></Parameters></Method>`;
    actionId++;
    console.log(`[property-bag] Including vti_indexedpropertykeys update in NoScript write (${Object.keys(properties).length} keys)`);
  }
  actionsXml += `<Method Name="Update" Id="${actionId}" ObjectPathId="1" />`;
  const csomXml = `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions>${actionsXml}</Actions><ObjectPaths><Property Id="1" ParentId="0" Name="Web" /><Property Id="3" ParentId="1" Name="AllProperties" /><StaticProperty Id="0" TypeId="{3747adcd-a3c3-41b9-bfab-4a64dd2f1e0a}" Name="Current" /></ObjectPaths></Request>`;

  const result = await executeCsomWithNoScriptToggle(spoToken, siteUrl, csomXml, userId);
  if (result.success && needsIndexUpdate) {
    console.log(`[property-bag] Successfully wrote properties and indexed ${Object.keys(properties).length} keys in single NoScript window`);
  }
  return result;
}

export async function applySensitivityLabelToSite(
  spoToken: string,
  siteUrl: string,
  sensitivityLabelId: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  const csomXml = `<Request SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="2" ObjectPathId="1" /><SetProperty Id="3" ObjectPathId="1" Name="SensitivityLabelId"><Parameter Type="Guid">{${sensitivityLabelId}}</Parameter></SetProperty></Actions><ObjectPaths><Property Id="1" ParentId="0" Name="Site" /><StaticProperty Id="0" TypeId="{3747adcd-a3c3-41b9-bfab-4a64dd2f1e0a}" Name="Current" /></ObjectPaths></Request>`;

  const result = await executeCsomQuery(spoToken, siteUrl, csomXml);
  if (result.success) return result;
  console.warn(`[label-push] Direct Site.SensitivityLabelId failed: ${result.error}`);

  if (userId) {
    console.log(`[label-push] Trying admin API approach (SPO.Tenant.SetSiteProperties)`);
    const adminResult = await applySensitivityLabelViaAdminApi(siteUrl, sensitivityLabelId, userId);
    if (adminResult.success) return adminResult;
    console.warn(`[label-push] Admin API approach failed: ${adminResult.error}`);
  }
  return result;
}

export async function removeSensitivityLabelFromSite(
  spoToken: string,
  siteUrl: string,
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  const csomXml = `<Request SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="2" ObjectPathId="1" /><SetProperty Id="3" ObjectPathId="1" Name="SensitivityLabelId"><Parameter Type="Guid">{00000000-0000-0000-0000-000000000000}</Parameter></SetProperty></Actions><ObjectPaths><Property Id="1" ParentId="0" Name="Site" /><StaticProperty Id="0" TypeId="{3747adcd-a3c3-41b9-bfab-4a64dd2f1e0a}" Name="Current" /></ObjectPaths></Request>`;

  const result = await executeCsomQuery(spoToken, siteUrl, csomXml);
  if (result.success) return result;
  console.warn(`[label-push] Direct Site.SensitivityLabelId remove failed: ${result.error}`);

  if (userId) {
    console.log(`[label-push] Trying admin API approach for label removal`);
    const adminResult = await applySensitivityLabelViaAdminApi(siteUrl, '00000000-0000-0000-0000-000000000000', userId);
    if (adminResult.success) return adminResult;
    console.warn(`[label-push] Admin API remove failed: ${adminResult.error}`);
  }
  return result;
}

async function applySensitivityLabelViaAdminApi(
  siteUrl: string,
  sensitivityLabelId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const urlObj = new URL(siteUrl);
  const tenantPrefix = urlObj.hostname.split('.')[0];
  const adminHost = `${tenantPrefix}-admin.sharepoint.com`;
  const adminUrl = `https://${adminHost}`;

  const { getDelegatedSpoToken } = await import('../routes-entra');
  let adminToken: string | null = null;
  try {
    adminToken = await getDelegatedSpoToken(userId, adminHost);
  } catch (err: any) {
    return { success: false, error: `Failed to get admin SPO token: ${err.message}` };
  }
  if (!adminToken) {
    return { success: false, error: 'Could not acquire SharePoint Admin token' };
  }

  const csomXml = `<Request SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="2" ObjectPathId="1" /><ObjectPath Id="4" ObjectPathId="3" /><SetProperty Id="5" ObjectPathId="3" Name="SensitivityLabel"><Parameter Type="String">${sensitivityLabelId}</Parameter></SetProperty><Method Name="Update" Id="6" ObjectPathId="3" /></Actions><ObjectPaths><Constructor Id="1" TypeId="{268004ae-ef6b-4e9b-8425-127220d84719}" /><Method Id="3" ParentId="1" Name="GetSitePropertiesByUrl"><Parameters><Parameter Type="String">${siteUrl}</Parameter><Parameter Type="Boolean">false</Parameter></Parameters></Method></ObjectPaths></Request>`;

  console.log(`[label-push] Setting SensitivityLabel via SPO admin API for ${siteUrl}`);
  return executeCsomQuery(adminToken, adminUrl, csomXml);
}

async function executeCsomWithNoScriptToggle(
  spoToken: string,
  siteUrl: string,
  csomXml: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  const urlObj = new URL(siteUrl);
  const tenantPrefix = urlObj.hostname.split('.')[0];
  const adminHost = `${tenantPrefix}-admin.sharepoint.com`;

  const { getDelegatedSpoToken } = await import('../routes-entra');
  let adminToken: string | null = null;
  try {
    adminToken = await getDelegatedSpoToken(userId, adminHost);
  } catch (err: any) {
    return { success: false, error: `Failed to get admin SPO token: ${err.message}` };
  }
  if (!adminToken) {
    return { success: false, error: 'Could not acquire SharePoint Admin token' };
  }

  const adminUrl = `https://${adminHost}`;
  const disableXml = `<Request SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="2" ObjectPathId="1" /><ObjectPath Id="4" ObjectPathId="3" /><SetProperty Id="5" ObjectPathId="3" Name="DenyAddAndCustomizePages"><Parameter Type="Enum">1</Parameter></SetProperty><Method Name="Update" Id="6" ObjectPathId="3" /></Actions><ObjectPaths><Constructor Id="1" TypeId="{268004ae-ef6b-4e9b-8425-127220d84719}" /><Method Id="3" ParentId="1" Name="GetSitePropertiesByUrl"><Parameters><Parameter Type="String">${siteUrl}</Parameter><Parameter Type="Boolean">false</Parameter></Parameters></Method></ObjectPaths></Request>`;
  const enableXml = `<Request SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="2" ObjectPathId="1" /><ObjectPath Id="4" ObjectPathId="3" /><SetProperty Id="5" ObjectPathId="3" Name="DenyAddAndCustomizePages"><Parameter Type="Enum">2</Parameter></SetProperty><Method Name="Update" Id="6" ObjectPathId="3" /></Actions><ObjectPaths><Constructor Id="1" TypeId="{268004ae-ef6b-4e9b-8425-127220d84719}" /><Method Id="3" ParentId="1" Name="GetSitePropertiesByUrl"><Parameters><Parameter Type="String">${siteUrl}</Parameter><Parameter Type="Boolean">false</Parameter></Parameters></Method></ObjectPaths></Request>`;

  console.log(`[csom-noscript] Disabling NoScript on ${siteUrl}`);
  const disableResult = await executeCsomQuery(adminToken, adminUrl, disableXml);
  if (!disableResult.success) {
    return { success: false, error: `Failed to disable NoScript: ${disableResult.error}` };
  }

  await new Promise(r => setTimeout(r, 1000));

  const writeResult = await executeCsomQuery(spoToken, siteUrl, csomXml);

  console.log(`[csom-noscript] Re-enabling NoScript on ${siteUrl}`);
  const enableResult = await executeCsomQuery(adminToken, adminUrl, enableXml);
  if (!enableResult.success) {
    console.error(`[csom-noscript] WARNING: Failed to re-enable NoScript: ${enableResult.error}`);
  }

  return writeResult;
}

export async function batchToggleNoScript(
  siteUrls: string[],
  userId: string,
  enable: boolean
): Promise<Map<string, { success: boolean; error?: string }>> {
  if (siteUrls.length === 0) return new Map();

  const urlObj = new URL(siteUrls[0]);
  const tenantPrefix = urlObj.hostname.split('.')[0];
  const adminHost = `${tenantPrefix}-admin.sharepoint.com`;
  const adminUrl = `https://${adminHost}`;

  const { getDelegatedSpoToken } = await import('../routes-entra');
  const adminToken = await getDelegatedSpoToken(userId, adminHost);
  if (!adminToken) {
    const results = new Map<string, { success: boolean; error?: string }>();
    for (const url of siteUrls) {
      results.set(url, { success: false, error: 'Could not acquire SharePoint Admin token' });
    }
    return results;
  }

  const enumValue = enable ? '2' : '1';
  const action = enable ? 'Enabling' : 'Disabling';
  const results = new Map<string, { success: boolean; error?: string }>();
  const BATCH_SIZE = 5;

  for (let i = 0; i < siteUrls.length; i += BATCH_SIZE) {
    const batch = siteUrls.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (siteUrl) => {
      const xml = `<Request SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="Zenith" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="2" ObjectPathId="1" /><ObjectPath Id="4" ObjectPathId="3" /><SetProperty Id="5" ObjectPathId="3" Name="DenyAddAndCustomizePages"><Parameter Type="Enum">${enumValue}</Parameter></SetProperty><Method Name="Update" Id="6" ObjectPathId="3" /></Actions><ObjectPaths><Constructor Id="1" TypeId="{268004ae-ef6b-4e9b-8425-127220d84719}" /><Method Id="3" ParentId="1" Name="GetSitePropertiesByUrl"><Parameters><Parameter Type="String">${siteUrl}</Parameter><Parameter Type="Boolean">false</Parameter></Parameters></Method></ObjectPaths></Request>`;
      const result = await executeCsomQuery(adminToken, adminUrl, xml);
      console.log(`[bulk-noscript] ${action} NoScript on ${siteUrl}: ${result.success ? 'OK' : result.error}`);
      return { siteUrl, result };
    });
    const batchResults = await Promise.all(promises);
    for (const { siteUrl, result } of batchResults) {
      results.set(siteUrl, result);
    }
  }

  return results;
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

export interface SiteDocumentLibrary {
  listId: string;
  displayName: string;
  description: string | null;
  webUrl: string | null;
  template: string | null;
  itemCount: number;
  sensitivityLabelId: string | null;
  isDefaultDocLib: boolean;
  hidden: boolean;
  lastModifiedAt: string | null;
  createdAt: string | null;
  storageUsedBytes: number | null;
}

export interface SiteDocumentLibrarySummary {
  listId: string;
  displayName: string;
  itemCount: number;
  lastModifiedAt: string | null;
  hidden: boolean;
  template: string | null;
}

export async function enumerateSiteDocumentLibraries(
  token: string,
  graphSiteId: string
): Promise<{ libraries: SiteDocumentLibrarySummary[]; error?: string }> {
  try {
    const allLists: any[] = [];
    let nextLink: string | null = `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/lists?$select=id,displayName,lastModifiedDateTime,list&$top=200`;

    while (nextLink) {
      const listsRes = await fetch(nextLink, { headers: { Authorization: `Bearer ${token}` } });
      if (!listsRes.ok) {
        return { libraries: [], error: `Lists API returned ${listsRes.status}` };
      }
      const listsData = await listsRes.json();
      allLists.push(...(listsData.value || []));
      nextLink = listsData["@odata.nextLink"] || null;
    }

    const docLibs = allLists.filter((l: any) => l.list?.template === "documentLibrary");

    const libraries: SiteDocumentLibrarySummary[] = docLibs.map((lib: any) => ({
      listId: lib.id,
      displayName: lib.displayName || "Untitled",
      itemCount: lib.list?.itemCount ?? 0,
      lastModifiedAt: lib.lastModifiedDateTime || null,
      hidden: lib.list?.hidden || false,
      template: lib.list?.template || "documentLibrary",
    }));

    return { libraries };
  } catch (err: any) {
    return { libraries: [], error: err.message };
  }
}

export async function fetchSiteDocumentLibraries(
  token: string,
  graphSiteId: string
): Promise<{ libraries: SiteDocumentLibrary[]; error?: string }> {
  try {
    const allLists: any[] = [];
    let nextLink: string | null = `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/lists?$top=200`;

    while (nextLink) {
      const listsRes = await fetch(nextLink, { headers: { Authorization: `Bearer ${token}` } });
      if (!listsRes.ok) {
        const errText = await listsRes.text();
        console.log(`[graph] fetchSiteDocumentLibraries failed for ${graphSiteId}: ${listsRes.status} ${errText.substring(0, 200)}`);
        return { libraries: [], error: `Lists API returned ${listsRes.status}` };
      }
      const listsData = await listsRes.json();
      allLists.push(...(listsData.value || []));
      nextLink = listsData["@odata.nextLink"] || null;
    }

    const docLibs = allLists.filter((l: any) => l.list?.template === "documentLibrary");
    console.log(`[graph] fetchSiteDocumentLibraries ${graphSiteId}: ${docLibs.length} doc libs found (${allLists.length} total lists, paginated)`);

    interface DriveInfo {
      listId: string | null;
      name: string;
      itemCount: number;
      storageUsedBytes: number | null;
      sensitivityLabelId: string | null;
    }
    const driveByListId = new Map<string, DriveInfo>();
    const driveByName = new Map<string, DriveInfo>();

    try {
      const drivesRes = await fetch(
        `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/drives?$select=id,name,quota,webUrl`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (drivesRes.ok) {
        const drivesData = await drivesRes.json();
        const drives: any[] = drivesData.value || [];

        for (const drive of drives) {
          const info: DriveInfo = {
            listId: null,
            name: drive.name || "",
            itemCount: 0,
            storageUsedBytes: drive.quota?.used ?? null,
            sensitivityLabelId: null,
          };

          try {
            const listRes = await fetch(
              `https://graph.microsoft.com/v1.0/drives/${drive.id}/list?$select=id`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (listRes.ok) {
              const listData = await listRes.json();
              info.listId = listData.id || null;
            }
          } catch {}

          try {
            const itemsRes = await fetch(
              `https://graph.microsoft.com/v1.0/drives/${drive.id}/list/items?$top=1&$select=id&$count=true`,
              { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } }
            );
            if (itemsRes.ok) {
              const itemsData = await itemsRes.json();
              if (itemsData["@odata.count"] != null) {
                info.itemCount = itemsData["@odata.count"];
              } else {
                info.itemCount = (itemsData.value || []).length > 0 ? -1 : 0;
              }
            }
          } catch {}

          if (info.itemCount <= 0) {
            try {
              const childrenRes = await fetch(
                `https://graph.microsoft.com/v1.0/drives/${drive.id}/root/children?$select=id&$top=999&$count=true`,
                { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } }
              );
              if (childrenRes.ok) {
                const childrenData = await childrenRes.json();
                const count = childrenData["@odata.count"] ?? (childrenData.value || []).length;
                if (count > 0) info.itemCount = count;
              }
            } catch {}
          }

          try {
            const driveDetailRes = await fetch(
              `https://graph.microsoft.com/beta/drives/${drive.id}?$select=sensitivityLabel`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (driveDetailRes.ok) {
              const driveDetail = await driveDetailRes.json();
              info.sensitivityLabelId = driveDetail.sensitivityLabel?.labelId || null;
            }
          } catch {}

          if (info.listId) driveByListId.set(info.listId, info);
          driveByName.set(info.name.toLowerCase(), info);

          console.log(`[graph] drive "${drive.name}" → listId=${info.listId}, items=${info.itemCount}, storage=${info.storageUsedBytes}, label=${info.sensitivityLabelId}`);
        }
      }
    } catch (err: any) {
      console.log(`[graph] drives API error for ${graphSiteId}: ${err.message}`);
    }

    const DEFAULT_LIB_NAMES = ["documents", "shared documents", "site assets", "style library", "form templates"];

    const libraries: SiteDocumentLibrary[] = docLibs.map((lib: any) => {
      const driveInfo = driveByListId.get(lib.id)
        || driveByName.get((lib.displayName || "").toLowerCase())
        || null;

      const listItemCount = lib.list?.itemCount ?? 0;
      const driveItemCount = driveInfo?.itemCount ?? 0;
      const finalItemCount = driveItemCount > 0 ? driveItemCount : listItemCount;

      return {
        listId: lib.id,
        displayName: lib.displayName || "Untitled",
        description: lib.description || null,
        webUrl: lib.webUrl || null,
        template: lib.list?.template || "documentLibrary",
        itemCount: finalItemCount,
        sensitivityLabelId: driveInfo?.sensitivityLabelId || null,
        isDefaultDocLib: DEFAULT_LIB_NAMES.includes((lib.displayName || "").toLowerCase()),
        hidden: lib.list?.hidden || false,
        lastModifiedAt: lib.lastModifiedDateTime || null,
        createdAt: lib.createdDateTime || null,
        storageUsedBytes: driveInfo?.storageUsedBytes ?? null,
      };
    });

    console.log(`[graph] fetchSiteDocumentLibraries result:`, libraries.map(l => `${l.displayName}: items=${l.itemCount}, storage=${l.storageUsedBytes}, label=${l.sensitivityLabelId}`).join(' | '));
    return { libraries };
  } catch (err: any) {
    console.error(`[graph] fetchSiteDocumentLibraries error for ${graphSiteId}:`, err.message);
    return { libraries: [], error: err.message };
  }
}

export interface LibraryContentType {
  id: string;
  name: string;
  description: string | null;
  hidden: boolean;
  group: string | null;
  parentId: string | null;
  isInherited: boolean;
  isBuiltIn: boolean;
}

export interface LibraryColumn {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  type: string;
  hidden: boolean;
  readOnly: boolean;
  sealed: boolean;
  indexed: boolean;
  required: boolean;
  columnGroup: string | null;
  isSyntexManaged: boolean;
  isCustom: boolean;
}

export async function fetchLibraryDetails(
  token: string,
  graphSiteId: string,
  listId: string
): Promise<{
  contentTypes: LibraryContentType[];
  columns: LibraryColumn[];
  error?: string;
}> {
  try {
    const [ctRes, colRes] = await Promise.all([
      fetch(
        `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/lists/${listId}/contentTypes?$top=100&$select=id,name,displayName,description,hidden,group,parentId,inheritedFrom,isBuiltIn`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
      fetch(
        `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/lists/${listId}/columns?$top=200`,
        { headers: { Authorization: `Bearer ${token}` } }
      ),
    ]);

    const contentTypes: LibraryContentType[] = [];
    if (ctRes.ok) {
      const ctData = await ctRes.json();
      for (const ct of ctData.value || []) {
        contentTypes.push({
          id: ct.id,
          name: ct.name || ct.displayName || "Unknown",
          description: ct.description || null,
          hidden: ct.hidden || false,
          group: ct.group || null,
          parentId: ct.parentId || null,
          // Graph returns `inheritedFrom` only when the CT is inherited from
          // a parent scope (site or content-type hub). Use its presence as
          // the signal; some responses also expose a boolean, so accept both.
          isInherited: Boolean(ct.inheritedFrom) || ct.isInherited === true,
          isBuiltIn: ct.isBuiltIn === true,
        });
      }
    } else {
      console.log(`[graph] fetchLibraryDetails contentTypes failed: ${ctRes.status} ${(await ctRes.text()).substring(0, 200)}`);
    }

    const SYSTEM_COLUMNS = new Set([
      "ContentType", "Created", "Modified", "Author", "Editor",
      "_ModerationStatus", "_ModerationComments", "FileLeafRef",
      "FileDirRef", "FSObjType", "PermMask", "FileRef",
      "File_x0020_Type", "HTML_x0020_File_x0020_Type",
      "ItemChildCount", "FolderChildCount", "SMTotalSize",
      "SMLastModifiedDate", "SMTotalFileStreamSize",
      "SMTotalFileCount", "owshiddenversion", "ScopeId",
      "UniqueId", "SyncClientId", "ProgId",
      "_ComplianceFlags", "_ComplianceTag", "_ComplianceTagWrittenTime",
      "_ComplianceTagUserId", "_IsRecord", "AccessPolicy",
      "_VirusStatus", "_VirusVendorID", "_VirusInfo",
      "AppAuthor", "AppEditor", "ComplianceAssetId",
      "_CommentFlags", "_CommentCount",
      "ParentUniqueId", "ParentLeafName",
      "DocConcurrencyNumber", "BSN", "_CheckinComment",
      "MetaInfo", "_Level", "_IsCurrentVersion",
      "ItemType", "Restricted", "OriginatorId",
      "NoExecute", "ContentVersion",
      "_HasCopyDestinations", "_CopySource",
      "CheckoutUser", "CheckedOutTitle",
      "FileSystemObjectType",
      "_UIVersion", "_UIVersionString",
      "InstanceID", "Order", "GUID",
      "WorkflowVersion", "WorkflowInstanceID",
      "LinkFilename", "LinkFilenameNoMenu",
      "LinkTitle", "LinkTitleNoMenu",
      "SelectTitle", "Edit", "DocIcon",
      "ServerUrl", "EncodedAbsUrl",
      "BaseName", "FileSizeDisplay",
      "PropertyBag",
    ]);

    const SYNTEX_PREFIXES = ["Syntex", "AIBuilder", "FormProcessing", "DocumentUnderstanding"];

    const columns: LibraryColumn[] = [];
    if (colRes.ok) {
      const colData = await colRes.json();
      for (const col of colData.value || []) {
        const colType = col.text ? "text" :
          col.number ? "number" :
          col.dateTime ? "dateTime" :
          col.choice ? "choice" :
          col.lookup ? "lookup" :
          col.boolean ? "boolean" :
          col.currency ? "currency" :
          col.personOrGroup ? "personOrGroup" :
          col.calculated ? "calculated" :
          col.hyperlinkOrPicture ? "hyperlinkOrPicture" :
          col.thumbnail ? "thumbnail" :
          col.contentApprovalStatus ? "contentApprovalStatus" :
          col.term ? "term" :
          col.geolocation ? "geolocation" :
          "unknown";

        const name = col.name || "";
        const isSyntexManaged = SYNTEX_PREFIXES.some(p => name.startsWith(p)) ||
          (col.description || "").toLowerCase().includes("syntex");
        const isSystem = SYSTEM_COLUMNS.has(name) || name.startsWith("ows_") || name.startsWith("_");
        const isCustom = !isSystem && !col.readOnly && !col.sealed &&
          col.columnGroup !== "Core Document Columns" &&
          col.columnGroup !== "Core Task and Issue Columns" &&
          col.columnGroup !== "Base Columns" &&
          col.columnGroup !== "_Hidden";

        columns.push({
          id: col.id,
          name,
          displayName: col.displayName || name,
          description: col.description || null,
          type: colType,
          hidden: col.hidden || false,
          readOnly: col.readOnly || false,
          sealed: col.sealed || false,
          indexed: col.indexed || false,
          required: col.required || false,
          columnGroup: col.columnGroup || null,
          isSyntexManaged,
          isCustom,
        });
      }
    } else {
      console.log(`[graph] fetchLibraryDetails columns failed: ${colRes.status} ${(await colRes.text()).substring(0, 200)}`);
    }

    console.log(`[graph] fetchLibraryDetails ${listId}: ${contentTypes.length} content types, ${columns.length} columns (${columns.filter(c => c.isCustom).length} custom, ${columns.filter(c => c.isSyntexManaged).length} Syntex)`);
    return { contentTypes, columns };
  } catch (err: any) {
    console.error(`[graph] fetchLibraryDetails error:`, err.message);
    return { contentTypes: [], columns: [], error: err.message };
  }
}

// ── Teams & Channels Inventory Discovery ──────────────────────────────────────
// Rich team properties for full inventory (not just recordings).
export interface TeamInventoryInfo {
  id: string;
  displayName: string;
  description: string | null;
  mailNickname: string | null;
  visibility: string | null;
  isArchived: boolean;
  classification: string | null;
  createdDateTime: string | null;
  renewedDateTime: string | null;
  memberCount: number | null;
  ownerCount: number | null;
  guestCount: number | null;
  sharepointSiteUrl: string | null;
  sharepointSiteId: string | null;
  sensitivityLabel: string | null;
}

export interface ChannelInventoryInfo {
  id: string;
  teamId: string;
  displayName: string;
  description: string | null;
  membershipType: string;
  email: string | null;
  webUrl: string | null;
  createdDateTime: string | null;
  memberCount: number | null;
}

export interface OneDriveInventoryInfo {
  userId: string;
  userDisplayName: string | null;
  userPrincipalName: string;
  userDepartment: string | null;
  userJobTitle: string | null;
  userMail: string | null;
  driveId: string | null;
  driveType: string | null;
  quotaTotalBytes: number | null;
  quotaUsedBytes: number | null;
  quotaRemainingBytes: number | null;
  quotaState: string | null;
  lastActivityDate: string | null;
  fileCount: number | null;
  activeFileCount: number | null;
}

// ── Graph throttle-aware fetch helpers ────────────────────────────────────────

const GRAPH_MAX_RETRIES = 5;
/** Max concurrent Graph requests outside of $batch calls. */
const GRAPH_CONCURRENCY = 5;
/** Max sub-requests per Graph $batch call (hard Graph limit is 20). */
const GRAPH_BATCH_SIZE = 20;
/** Maximum backoff delay in milliseconds for retry logic. */
const GRAPH_MAX_BACKOFF_MS = 64000;

/**
 * Fetch a Graph URL with automatic retry/backoff for 429 and 5xx responses.
 * Respects the Retry-After header returned by Graph on 429 responses.
 */
export async function graphFetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = GRAPH_MAX_RETRIES,
): Promise<Response> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    const res = await fetch(url, options);
    const isTransient = res.status === 429 || (res.status >= 500 && res.status <= 599);
    if (!isTransient || attempt === maxRetries) return res;
    const retryAfterRaw = res.status === 429 ? res.headers.get("Retry-After") : null;
    const delayMs = retryAfterRaw
      ? parseInt(retryAfterRaw, 10) * 1000
      : Math.min(Math.pow(2, attempt) * 1000, GRAPH_MAX_BACKOFF_MS);
    console.warn(`[graph] HTTP ${res.status}; retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt + 1}/${maxRetries})`);
    await new Promise(r => setTimeout(r, delayMs));
    attempt++;
  }
  // Unreachable, but satisfies the TypeScript return type
  return fetch(url, options);
}

interface GraphBatchRequest {
  id: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
}

interface GraphBatchResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Execute one or more Graph $batch calls. Splits requests into chunks of
 * GRAPH_BATCH_SIZE, retries any sub-requests throttled with 429, and returns
 * a Map keyed by request id.
 */
async function graphBatch(
  token: string,
  requests: GraphBatchRequest[],
  maxRetries = GRAPH_MAX_RETRIES,
): Promise<Map<string, GraphBatchResponse>> {
  const results = new Map<string, GraphBatchResponse>();
  let pending = [...requests];

  for (let attempt = 0; attempt <= maxRetries && pending.length > 0; attempt++) {
    const chunks: GraphBatchRequest[][] = [];
    for (let i = 0; i < pending.length; i += GRAPH_BATCH_SIZE) {
      chunks.push(pending.slice(i, i + GRAPH_BATCH_SIZE));
    }
    pending = [];

    for (const chunk of chunks) {
      const batchRes = await graphFetchWithRetry(
        "https://graph.microsoft.com/v1.0/$batch",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ requests: chunk }),
        },
      );

      if (!batchRes.ok) {
        for (const req of chunk) {
          results.set(req.id, { id: req.id, status: batchRes.status });
        }
        continue;
      }

      const batchData = await batchRes.json();
      for (const resp of batchData.responses as GraphBatchResponse[]) {
        if (resp.status === 429) {
          const original = chunk.find(r => r.id === resp.id);
          if (original) pending.push(original);
        } else {
          results.set(resp.id, resp);
        }
      }
    }

    if (pending.length > 0) {
      const delayMs = Math.min(Math.pow(2, attempt) * 1000, GRAPH_MAX_BACKOFF_MS);
      console.warn(`[graph] ${pending.length} batch sub-requests throttled; retrying in ${delayMs / 1000}s`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // Any still-pending requests exceeded retries – store a 429 tombstone
  for (const req of pending) {
    results.set(req.id, { id: req.id, status: 429 });
  }

  return results;
}

/**
 * Parse an integer count from a Graph $batch sub-response body.
 * The body may be a plain number (e.g. 42) or a numeric string.
 */
function parseCountFromBatchBody(body: any): number | null {
  if (body === undefined || body === null || body === "") return null;
  const n = parseInt(String(body), 10);
  return isNaN(n) ? null : n || null;
}

/**
 * Process items with a maximum concurrency limit.
 */
async function asyncPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(fn));
  }
}

// ── Teams Inventory ────────────────────────────────────────────────────────────

/**
 * Fetch all Teams with rich property inventory. Includes description,
 * visibility, archived status, classification, dates, and member counts.
 */
export async function fetchAllTeamsInventory(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<TeamInventoryInfo[]> {
  const token = await getAppToken(tenantId, clientId, clientSecret);
  const teams: TeamInventoryInfo[] = [];

  // Step 1: Fetch all Teams-enabled groups with extended properties
  let url =
    `https://graph.microsoft.com/v1.0/groups` +
    `?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')` +
    `&$select=id,displayName,description,mailNickname,visibility,classification,createdDateTime,renewedDateTime,assignedLabels` +
    `&$top=999`;

  const rawGroups: any[] = [];
  while (url) {
    const res = await graphFetchWithRetry(url, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
    });
    if (!res.ok) {
      const errorBody = (await res.text()).substring(0, 200);
      console.error(`[graph] fetchAllTeamsInventory groups ${res.status}: ${errorBody}`);
      throw new Error(`fetchAllTeamsInventory groups failed: HTTP ${res.status} - ${errorBody}`);
    }
    const data = await res.json();
    rawGroups.push(...(data.value || []));
    url = data["@odata.nextLink"] ?? null;
  }

  // Step 2: Enrich each group with Teams-specific properties and member counts
  for (const g of rawGroups) {
    let isArchived = false;

    // Fetch team-level properties (isArchived)
    try {
      const teamRes = await fetch(
        `https://graph.microsoft.com/v1.0/teams/${g.id}?$select=isArchived`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (teamRes.ok) {
        const teamData = await teamRes.json();
        isArchived = teamData.isArchived === true;
      }
    } catch {}

    // Fetch member/owner/guest counts
    let memberCount: number | null = null;
    let ownerCount: number | null = null;
    let guestCount: number | null = null;

    try {
      const membersRes = await fetch(
        `https://graph.microsoft.com/v1.0/groups/${g.id}/members/$count`,
        { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } },
      );
      if (membersRes.ok) {
        memberCount = parseInt(await membersRes.text(), 10) || null;
      }
    } catch {}

    try {
      const ownersRes = await fetch(
        `https://graph.microsoft.com/v1.0/groups/${g.id}/owners/$count`,
        { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } },
      );
      if (ownersRes.ok) {
        ownerCount = parseInt(await ownersRes.text(), 10) || null;
      }
    } catch {}

    try {
      const guestRes = await fetch(
        `https://graph.microsoft.com/v1.0/groups/${g.id}/members/microsoft.graph.user/$count` +
          `?$filter=userType eq 'Guest'`,
        { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } },
      );
      if (guestRes.ok) {
        guestCount = parseInt(await guestRes.text(), 10) || null;
      }
    } catch {}

    // SharePoint site backing URL
    let sharepointSiteUrl: string | null = null;
    let sharepointSiteId: string | null = null;
    try {
      const siteRes = await fetch(
        `https://graph.microsoft.com/v1.0/groups/${g.id}/sites/root?$select=id,webUrl`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (siteRes.ok) {
        const siteData = await siteRes.json();
        sharepointSiteUrl = siteData.webUrl ?? null;
        sharepointSiteId = siteData.id ?? null;
      }
    } catch {}

    const sensitivityLabel = g.assignedLabels?.[0]?.displayName ?? null;

    teams.push({
      id: g.id,
      displayName: g.displayName ?? g.id,
      description: g.description ?? null,
      mailNickname: g.mailNickname ?? null,
      visibility: g.visibility ?? null,
      isArchived,
      classification: g.classification ?? null,
      createdDateTime: g.createdDateTime ?? null,
      renewedDateTime: g.renewedDateTime ?? null,
      memberCount,
      ownerCount,
      guestCount,
      sharepointSiteUrl,
      sharepointSiteId,
      sensitivityLabel,
    });
  }

  console.log(`[graph] fetchAllTeamsInventory: ${teams.length} teams`);
  return teams;
}

/**
 * Fetch all channels for a team with rich properties.
 */
export async function fetchTeamChannelsInventory(
  teamId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<ChannelInventoryInfo[]> {
  const token = await getAppToken(tenantId, clientId, clientSecret);
  const rawChannels: any[] = [];
  let url: string | null =
    `https://graph.microsoft.com/v1.0/teams/${teamId}/channels` +
    `?$select=id,displayName,description,membershipType,email,webUrl,createdDateTime`;

  while (url) {
    const res = await graphFetchWithRetry(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      if ((res.status === 403 || res.status === 404) && rawChannels.length === 0) {
        console.warn(`[graph] fetchTeamChannelsInventory ${teamId} ${res.status}`);
        return [];
      }
      const errorText = (await res.text()).substring(0, 200);
      throw new Error(`fetchTeamChannelsInventory ${teamId} ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    rawChannels.push(...(data.value || []));
    url = data["@odata.nextLink"] ?? null;
  }

  // Fetch member counts for all channels concurrently (with concurrency limit)
  const channels: ChannelInventoryInfo[] = rawChannels.map(c => ({
    id: c.id,
    teamId,
    displayName: c.displayName ?? c.id,
    description: c.description ?? null,
    membershipType: c.membershipType || "standard",
    email: c.email ?? null,
    webUrl: c.webUrl ?? null,
    createdDateTime: c.createdDateTime ?? null,
    memberCount: null as number | null,
  }));

  await asyncPool(channels, GRAPH_CONCURRENCY, async (ch) => {
    try {
      const mRes = await graphFetchWithRetry(
        `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${ch.id}/members/$count`,
        { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" } },
      );
      if (mRes.ok) {
        ch.memberCount = parseInt(await mRes.text(), 10) || null;
      }
    } catch {}
  });

  return channels;
}

/**
 * Fetch all OneDrive for Business inventories for tenant users.
 * Returns drive quota, file counts, and user department/title info.
 */
export async function fetchAllOneDriveInventories(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<OneDriveInventoryInfo[]> {
  const token = await getAppToken(tenantId, clientId, clientSecret);
  const results: OneDriveInventoryInfo[] = [];

  // Step 1: Fetch usage report to get activity data
  const usageReport = await getOneDriveUsageReport(token);
  const usageByUpn = new Map<string, OneDriveUsageRow>();
  if (usageReport.error) {
    console.warn(`[graph] fetchAllOneDriveInventories: usage report failed: ${usageReport.error}`);
  } else {
    for (const row of usageReport.rows) {
      if (row.ownerPrincipalName) {
        usageByUpn.set(row.ownerPrincipalName.toLowerCase(), row);
      }
    }
    console.log(`[graph] fetchAllOneDriveInventories: loaded ${usageByUpn.size} usage report rows`);
  }

  // Step 2: Fetch all enabled member users with dept/title
  const users: Array<{ id: string; displayName: string | null; userPrincipalName: string; department: string | null; jobTitle: string | null; mail: string | null }> = [];
  let url =
    `https://graph.microsoft.com/v1.0/users` +
    `?$filter=accountEnabled eq true and userType eq 'Member'` +
    `&$select=id,displayName,userPrincipalName,department,jobTitle,mail&$top=999`;

  while (url) {
    const res = await graphFetchWithRetry(url, {
      headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: "eventual" },
    });
    if (!res.ok) {
      throw new Error(
        `[graph] fetchAllOneDriveInventories: failed to fetch users (HTTP ${res.status})`,
      );
    }
    const data = await res.json();
    for (const u of data.value || []) {
      users.push({
        id: u.id,
        displayName: u.displayName ?? null,
        userPrincipalName: u.userPrincipalName,
        department: u.department ?? null,
        jobTitle: u.jobTitle ?? null,
        mail: u.mail ?? null,
      });
    }
    url = data["@odata.nextLink"] ?? null;
  }

  // Step 3: Fetch drive info for each user concurrently (with concurrency limit)
  await asyncPool(users, GRAPH_CONCURRENCY, async (user) => {
    const usageRow = usageByUpn.get(user.userPrincipalName.toLowerCase());
    try {
      const driveRes = await graphFetchWithRetry(
        `https://graph.microsoft.com/v1.0/users/${user.id}/drive?$select=id,driveType,quota`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!driveRes.ok) {
        if (driveRes.status === 404) {
          results.push({
            userId: user.id,
            userDisplayName: user.displayName,
            userPrincipalName: user.userPrincipalName,
            userDepartment: user.department,
            userJobTitle: user.jobTitle,
            userMail: user.mail,
            driveId: null,
            driveType: null,
            quotaTotalBytes: null,
            quotaUsedBytes: null,
            quotaRemainingBytes: null,
            quotaState: null,
            lastActivityDate: usageRow?.lastActivityDate || null,
            fileCount: usageRow?.fileCount ?? null,
            activeFileCount: usageRow?.activeFileCount ?? null,
          });
        }
        if (driveRes.status === 401) {
          console.error(
            `[graph] OneDrive inventory for ${user.userPrincipalName}: 401 Unauthorized — token may be invalid or expired`,
          );
        } else if (driveRes.status === 403) {
          console.error(
            `[graph] OneDrive inventory for ${user.userPrincipalName}: 403 Forbidden — app may be missing Files.Read.All or Sites.Read.All permission`,
          );
        } else {
          console.warn(
            `[graph] OneDrive inventory for ${user.userPrincipalName}: unexpected status ${driveRes.status}`,
          );
        }
        return;
      }
      const driveData = await driveRes.json();
      const quota = driveData.quota ?? {};

      results.push({
        userId: user.id,
        userDisplayName: user.displayName,
        userPrincipalName: user.userPrincipalName,
        userDepartment: user.department,
        userJobTitle: user.jobTitle,
        userMail: user.mail,
        driveId: driveData.id ?? null,
        driveType: driveData.driveType ?? null,
        quotaTotalBytes: quota.total ?? null,
        quotaUsedBytes: quota.used ?? null,
        quotaRemainingBytes: quota.remaining ?? null,
        quotaState: quota.state ?? null,
        lastActivityDate: usageRow?.lastActivityDate || null,
        fileCount: usageRow?.fileCount ?? null,
        activeFileCount: usageRow?.activeFileCount ?? null,
      });
    } catch (err: any) {
      console.warn(`[graph] OneDrive inventory for ${user.userPrincipalName}: ${err.message}`);
    }
  });

  console.log(`[graph] fetchAllOneDriveInventories: ${results.length} users`);
  return results;
}

// ── Teams Recordings Discovery ────────────────────────────────────────────────
// New permissions required on the Entra app registration:
//   Application: Channel.ReadBasic.All, Team.ReadBasic.All
// Existing permissions that cover the rest:
//   Application: Group.Read.All, Sites.Read.All, User.Read.All, Files.Read.All

export interface TeamInfo {
  id: string;
  displayName: string;
}

export interface ChannelInfo {
  id: string;
  displayName: string;
  membershipType: string; // standard | private | shared
}

export interface RecordingFileItem {
  driveId: string;
  driveItemId: string;
  fileName: string;
  fileUrl: string | null;
  filePath: string | null;
  fileType: "RECORDING" | "TRANSCRIPT";
  fileSizeBytes: number | null;
  fileCreatedAt: string | null;
  fileModifiedAt: string | null;
  sensitivityLabelId: string | null;
  sensitivityLabelName: string | null;
  isShared: boolean;
  organizer: string | null;
  organizerDisplayName: string | null;
}

export interface TenantUserInfo {
  id: string;
  displayName: string | null;
  userPrincipalName: string;
}

function classifyFile(name: string): "RECORDING" | "TRANSCRIPT" | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".vtt") || lower.endsWith(".docx") && lower.includes("transcript")) return "TRANSCRIPT";
  if (lower.endsWith(".mp4") || lower.endsWith(".m4a") || lower.endsWith(".m4v")) return "RECORDING";
  return null;
}

function mapDriveItem(item: any, driveId: string): RecordingFileItem | null {
  const fileType = classifyFile(item.name || "");
  if (!fileType) return null;

  return {
    driveId,
    driveItemId: item.id,
    fileName: item.name,
    fileUrl: item.webUrl ?? null,
    filePath: item.parentReference?.path ?? null,
    fileType,
    fileSizeBytes: item.size ?? null,
    fileCreatedAt: item.createdDateTime ?? null,
    fileModifiedAt: item.lastModifiedDateTime ?? null,
    sensitivityLabelId: item.sensitivityLabel?.id ?? null,
    sensitivityLabelName: item.sensitivityLabel?.displayName ?? null,
    isShared: !!item.shared,
    organizer: item.createdBy?.user?.email ?? item.createdBy?.user?.displayName ?? null,
    organizerDisplayName: item.createdBy?.user?.displayName ?? null,
  };
}

// Enumerate all M365 groups that have Teams provisioned.
export async function fetchAllTeams(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<TeamInfo[]> {
  const token = await getAppToken(tenantId, clientId, clientSecret);
  const teams: TeamInfo[] = [];
  let url = `https://graph.microsoft.com/v1.0/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')&$select=id,displayName&$top=999`;

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: "eventual",
      },
    });
    if (!res.ok) {
      const errorBody = (await res.text()).substring(0, 200);
      console.error(`[graph] fetchAllTeams ${res.status}: ${errorBody}`);
      throw new Error(
        `[graph] fetchAllTeams failed after fetching ${teams.length} teams: HTTP ${res.status} ${res.statusText ?? ""} - ${errorBody}`,
      );
    }
    const data = await res.json();
    for (const g of (data.value || [])) {
      teams.push({ id: g.id, displayName: g.displayName });
    }
    url = data["@odata.nextLink"] ?? null;
  }

  console.log(`[graph] fetchAllTeams: ${teams.length} teams`);
  return teams;
}

// Enumerate channels for a given team.
export async function fetchTeamChannels(
  teamId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<ChannelInfo[]> {
  const token = await getAppToken(tenantId, clientId, clientSecret);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${teamId}/channels?$select=id,displayName,membershipType`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    if (res.status === 403 || res.status === 404) {
      console.warn(`[graph] fetchTeamChannels ${teamId} ${res.status}`);
      return [];
    }
    const errorText = await res.text();
    const truncated = errorText.substring(0, 200);
    throw new Error(`[graph] fetchTeamChannels ${teamId} ${res.status}: ${truncated}`);
  }
  const data = await res.json();
  return (data.value || []).map((c: any) => ({
    id: c.id,
    displayName: c.displayName,
    membershipType: c.membershipType || "standard",
  }));
}

// Return recording/transcript files found inside a channel's /Recordings/ folder.
// Returns [] if the folder does not exist or is inaccessible.
export async function fetchChannelRecordingItems(
  teamId: string,
  channelId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<RecordingFileItem[]> {
  const token = await getAppToken(tenantId, clientId, clientSecret);

  // Step 1: resolve the channel's files folder to get driveId + itemId
  const folderRes = await fetch(
    `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/filesFolder`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!folderRes.ok) {
    if (folderRes.status !== 404 && folderRes.status !== 403) {
      console.warn(`[graph] fetchChannelRecordingItems filesFolder ${channelId} ${folderRes.status}`);
    }
    return [];
  }
  const folder = await folderRes.json();
  const driveId: string = folder.parentReference?.driveId ?? folder.id;
  const folderId: string = folder.id;

  // Step 2: look for /Recordings/ subfolder children
  const recordingsRes = await fetch(
    `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}:/Recordings:/children` +
    `?$select=id,name,size,createdDateTime,lastModifiedDateTime,webUrl,file,shared,sensitivityLabel,createdBy,parentReference`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!recordingsRes.ok) {
    // 404 means no Recordings folder — normal for channels with no recorded meetings
    return [];
  }
  const recordingsData = await recordingsRes.json();
  const items: RecordingFileItem[] = [];
  for (const item of recordingsData.value || []) {
    const mapped = mapDriveItem(item, driveId);
    if (mapped) items.push(mapped);
  }
  return items;
}

// Return recording/transcript files found in a user's OneDrive /Recordings/ folder.
// Returns [] if the folder does not exist (404) or if access is denied (403).
export async function fetchUserOneDriveRecordingItems(
  userId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<{ items: RecordingFileItem[]; skipped: boolean }> {
  const token = await getAppToken(tenantId, clientId, clientSecret);
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${userId}/drive/root:/Recordings:/children` +
    `?$select=id,name,size,createdDateTime,lastModifiedDateTime,webUrl,file,shared,sensitivityLabel,createdBy,parentReference`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (res.status === 403 || res.status === 401) {
    return { items: [], skipped: true };
  }
  if (res.status === 404) {
    // No Recordings folder — user has no recorded meetings in OneDrive
    return { items: [], skipped: false };
  }
  if (!res.ok) {
    const bodyText = await res.text();
    const snippet = bodyText.substring(0, 500);
    console.error(
      `[graph] fetchUserOneDriveRecordingItems ${userId} ${res.status}: ${snippet}`,
    );
    throw new Error(
      `fetchUserOneDriveRecordingItems failed for user ${userId} with status ${res.status}`,
    );
  }

  const data = await res.json();
  // driveId comes from the parentReference of items; resolve from first item or via drive endpoint
  let driveId = data.value?.[0]?.parentReference?.driveId ?? "";
  if (!driveId) {
    // Fallback: resolve user drive id
    const driveRes = await fetch(
      `https://graph.microsoft.com/v1.0/users/${userId}/drive?$select=id`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (driveRes.ok) {
      const driveData = await driveRes.json();
      driveId = driveData.id ?? "";
    }
  }

  const items: RecordingFileItem[] = [];
  for (const item of data.value || []) {
    const mapped = mapDriveItem(item, driveId);
    if (mapped) items.push(mapped);
  }
  return { items, skipped: false };
}

// Enumerate all enabled users in the tenant (for OneDrive scanning).
// Paginates automatically. Filters out guest accounts.
export async function fetchTenantUsers(
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<TenantUserInfo[]> {
  const token = await getAppToken(tenantId, clientId, clientSecret);
  const users: TenantUserInfo[] = [];
  let url =
    `https://graph.microsoft.com/v1.0/users` +
    `?$filter=accountEnabled eq true and userType eq 'Member'` +
    `&$select=id,displayName,userPrincipalName&$top=999`;

  while (url) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        ConsistencyLevel: "eventual",
      },
    });
    if (!res.ok) {
      console.error(`[graph] fetchTenantUsers ${res.status}: ${(await res.text()).substring(0, 200)}`);
      break;
    }
    const data = await res.json();
    for (const u of data.value || []) {
      users.push({ id: u.id, displayName: u.displayName ?? null, userPrincipalName: u.userPrincipalName });
    }
    url = data["@odata.nextLink"] ?? null;
  }

  console.log(`[graph] fetchTenantUsers: ${users.length} member users`);
  return users;
}

export interface GraphContentType {
  id: string;
  name: string;
  group?: string;
  description?: string;
  isBuiltIn?: boolean;
}

export async function fetchContentTypes(graphToken: string, siteId: string): Promise<{
  contentTypes: GraphContentType[];
  error?: string;
}> {
  const allContentTypes: GraphContentType[] = [];
  let url: string | null = `https://graph.microsoft.com/v1.0/sites/${siteId}/contentTypes?$select=id,name,group,description,isBuiltIn&$top=100`;

  try {
    while (url) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${graphToken}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        return { contentTypes: [], error: `Graph API ${res.status}: ${errText.substring(0, 200)}` };
      }

      const data = await res.json();
      for (const ct of data.value || []) {
        allContentTypes.push({
          id: ct.id,
          name: ct.name,
          group: ct.group || undefined,
          description: ct.description || undefined,
          isBuiltIn: ct.isBuiltIn ?? false,
        });
      }
      url = data["@odata.nextLink"] ?? null;
    }

    console.log(`[content-types] Fetched ${allContentTypes.length} content types from site ${siteId}`);
    return { contentTypes: allContentTypes };
  } catch (err: any) {
    return { contentTypes: [], error: err.message };
  }
}

// ── Provisioning: Site / Group / Team Creation ───────────────────────────────

export interface ProvisionedSite {
  siteUrl: string;
  graphSiteId: string;
  groupId?: string;
}

/**
 * Create a Communication Site via SharePoint REST API.
 * Requires Sites.FullControl.All or Sites.Manage.All application permission.
 */
export async function createSharePointSite(
  graphToken: string,
  spoHost: string,
  displayName: string,
  alias: string,
  description: string = "",
): Promise<{ success: boolean; siteUrl?: string; graphSiteId?: string; error?: string }> {
  const url = `https://${spoHost}/_api/SPSiteManager/create`;
  const body = {
    request: {
      Title: displayName,
      Url: `https://${spoHost}/sites/${alias}`,
      Lcid: 1033,
      ShareByEmailEnabled: false,
      Description: description,
      WebTemplate: "SITEPAGEPUBLISHING#0",
      SiteDesignId: "00000000-0000-0000-0000-000000000000",
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${graphToken}`,
        "Content-Type": "application/json;odata=verbose",
        Accept: "application/json;odata=nometadata",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `SPO create site ${res.status}: ${errText.substring(0, 400)}` };
    }

    const data = await res.json();
    const siteUrl = data.SiteUrl || data.SiteStatus?.SiteUrl;
    if (!siteUrl) {
      return { success: false, error: "Site created but URL not returned" };
    }

    const graphSiteRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${spoHost}:/sites/${alias}?$select=id,webUrl`, {
      headers: { Authorization: `Bearer ${graphToken}` },
    });
    let graphSiteId = "";
    if (graphSiteRes.ok) {
      const siteData = await graphSiteRes.json();
      graphSiteId = siteData.id || "";
    }

    return { success: true, siteUrl, graphSiteId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Create an M365 Group (Team Site) via Graph API.
 * owners should be an array of UPNs or object IDs.
 */
export async function createM365Group(
  graphToken: string,
  displayName: string,
  mailNickname: string,
  description: string = "",
  ownerIds: string[],
  visibility: "Private" | "Public" = "Private",
): Promise<{ success: boolean; groupId?: string; siteUrl?: string; graphSiteId?: string; error?: string }> {
  const body: Record<string, any> = {
    displayName,
    mailNickname,
    description,
    groupTypes: ["Unified"],
    mailEnabled: true,
    securityEnabled: false,
    visibility,
    "members@odata.bind": ownerIds.map(id => `https://graph.microsoft.com/v1.0/users/${id}`),
    "owners@odata.bind": ownerIds.map(id => `https://graph.microsoft.com/v1.0/users/${id}`),
  };

  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/groups", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${graphToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Graph create group ${res.status}: ${errText.substring(0, 400)}` };
    }

    const data = await res.json();
    const groupId = data.id;
    if (!groupId) {
      return { success: false, error: "Group created but ID not returned" };
    }

    // Wait for provisioning then fetch site URL
    let siteUrl: string | undefined;
    let graphSiteId: string | undefined;
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(r => setTimeout(r, 5000));
      const siteRes = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}/sites/root?$select=id,webUrl`, {
        headers: { Authorization: `Bearer ${graphToken}` },
      });
      if (siteRes.ok) {
        const siteData = await siteRes.json();
        siteUrl = siteData.webUrl;
        graphSiteId = siteData.id;
        break;
      }
    }

    return { success: true, groupId, siteUrl, graphSiteId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Provision a Team on top of an existing M365 Group.
 */
export async function createTeam(
  graphToken: string,
  groupId: string,
): Promise<{ success: boolean; teamId?: string; error?: string }> {
  const body = {
    "template@odata.bind": "https://graph.microsoft.com/v1.0/teamsTemplates('standard')",
    group: { id: groupId },
  };

  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/teams", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${graphToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // Teams provisioning returns 202 Accepted with a Location header
    if (res.status === 202 || res.ok) {
      const location = res.headers.get("Location");
      // Extract operation ID from location header if available
      const teamId = location ? location.split("/").pop() : groupId;
      return { success: true, teamId };
    }

    const errText = await res.text();
    return { success: false, error: `Graph create team ${res.status}: ${errText.substring(0, 400)}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Assign a sensitivity label to an M365 Group/Site via Graph API.
 */
export async function assignSensitivityLabelToGroup(
  graphToken: string,
  groupId: string,
  labelId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/groups/${groupId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${graphToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        assignedLabels: [{ labelId }],
      }),
    });

    if (res.ok || res.status === 204) {
      return { success: true };
    }

    const errText = await res.text();
    return { success: false, error: `Graph assign label ${res.status}: ${errText.substring(0, 300)}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Resolve owner UPNs/emails to Graph user object IDs.
 * Returns the subset that could be resolved.
 */
export async function resolveOwnerIds(
  graphToken: string,
  owners: Array<{ displayName: string; mail?: string; userPrincipalName?: string }>,
): Promise<string[]> {
  const ids: string[] = [];
  for (const owner of owners) {
    const upn = owner.userPrincipalName || owner.mail;
    if (!upn) continue;
    try {
      const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(upn)}?$select=id`, {
        headers: { Authorization: `Bearer ${graphToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id) ids.push(data.id);
      }
    } catch {}
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Sharing Links
// ---------------------------------------------------------------------------

export interface SharingLinkPermission {
  id: string;
  roles: string[];
  link: {
    scope: string;
    type: string;
    webUrl: string;
    preventsDownload?: boolean;
  };
  grantedToIdentitiesV2?: any[];
  expirationDateTime?: string;
  hasPassword?: boolean;
  itemId?: string;
  itemName?: string;
  itemPath?: string;
}

export interface DriveItemSharingResult {
  permissions: SharingLinkPermission[];
  itemsScanned: number;
  errors: Array<{ context: string; message: string }>;
}

async function fetchAllPages<T>(url: string, token: string): Promise<{ items: T[]; error?: string }> {
  const items: T[] = [];
  let nextUrl: string | null = url;
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const errText = await res.text();
      return { items, error: `Graph API error ${res.status}: ${errText.substring(0, 300)}` };
    }
    const data = await res.json();
    items.push(...(data.value || []));
    nextUrl = data["@odata.nextLink"] || null;
  }
  return { items };
}

function mapPermissionToLink(p: any, item?: { id: string; name: string; path: string }): SharingLinkPermission {
  return {
    id: p.id,
    roles: p.roles || [],
    link: {
      scope: p.link.scope,
      type: p.link.type,
      webUrl: p.link.webUrl,
      preventsDownload: p.link.preventsDownload,
    },
    grantedToIdentitiesV2: p.grantedToIdentitiesV2,
    expirationDateTime: p.expirationDateTime,
    hasPassword: p.hasPassword,
    itemId: item?.id,
    itemName: item?.name,
    itemPath: item?.path,
  };
}

async function scanDriveForSharedItems(
  token: string,
  driveBaseUrl: string,
  contextLabel: string,
): Promise<DriveItemSharingResult> {
  const permissions: SharingLinkPermission[] = [];
  const errors: Array<{ context: string; message: string }> = [];
  let itemsScanned = 0;

  const rootPermsResult = await fetchAllPages<any>(`${driveBaseUrl}/root/permissions`, token);
  if (rootPermsResult.error) {
    errors.push({ context: `${contextLabel}:rootPerms`, message: rootPermsResult.error });
  }
  for (const p of rootPermsResult.items) {
    if (p.link) {
      permissions.push(mapPermissionToLink(p, { id: "root", name: "/", path: "/" }));
    }
  }
  itemsScanned++;

  const queue: Array<{ folderId: string | null; folderPath: string }> = [{ folderId: null, folderPath: "" }];

  while (queue.length > 0) {
    const { folderId, folderPath } = queue.shift()!;
    const url = folderId
      ? `${driveBaseUrl}/items/${folderId}/children?$select=id,name,folder,shared&$top=200`
      : `${driveBaseUrl}/root/children?$select=id,name,folder,shared&$top=200`;
    const { items: children, error } = await fetchAllPages<any>(url, token);
    if (error) {
      errors.push({ context: `${contextLabel}:list:${folderPath || "/"}`, message: error });
      continue;
    }
    for (const child of children) {
      const childPath = `${folderPath}/${child.name}`;
      const isFolder = !!child.folder;
      itemsScanned++;
      if (isFolder) {
        queue.push({ folderId: child.id, folderPath: childPath });
      }
      if (child.shared) {
        try {
          const { items: perms, error: permError } = await fetchAllPages<any>(
            `${driveBaseUrl}/items/${child.id}/permissions`,
            token,
          );
          if (permError) {
            errors.push({ context: `${contextLabel}:perm:${child.name}`, message: permError });
            continue;
          }
          for (const p of perms) {
            if (p.link) {
              permissions.push(mapPermissionToLink(p, { id: child.id, name: child.name, path: childPath }));
            }
          }
        } catch (err: any) {
          errors.push({ context: `${contextLabel}:perm:${child.name}`, message: err.message });
        }
      }
    }
  }

  return { permissions, itemsScanned, errors };
}

export async function getSharingLinks(
  token: string,
  siteId: string,
): Promise<DriveItemSharingResult> {
  const allPermissions: SharingLinkPermission[] = [];
  const allErrors: Array<{ context: string; message: string }> = [];
  let totalItemsScanned = 0;

  try {
    const drivesResult = await fetchAllPages<any>(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drives?$select=id,name`,
      token,
    );
    if (drivesResult.error) {
      allErrors.push({ context: `sp:${siteId}:drives`, message: drivesResult.error });
      return { permissions: allPermissions, itemsScanned: totalItemsScanned, errors: allErrors };
    }

    const drives = drivesResult.items;
    if (drives.length === 0) {
      const fallback = await scanDriveForSharedItems(
        token,
        `https://graph.microsoft.com/v1.0/sites/${siteId}/drive`,
        `sp:${siteId}:default`,
      );
      return fallback;
    }

    for (const drive of drives) {
      try {
        const result = await scanDriveForSharedItems(
          token,
          `https://graph.microsoft.com/v1.0/drives/${drive.id}`,
          `sp:${siteId}:${drive.name}`,
        );
        allPermissions.push(...result.permissions);
        allErrors.push(...result.errors);
        totalItemsScanned += result.itemsScanned;
      } catch (err: any) {
        allErrors.push({ context: `sp:${siteId}:${drive.name}`, message: err.message });
      }
    }
  } catch (err: any) {
    allErrors.push({ context: `sp:${siteId}`, message: err.message });
  }

  return { permissions: allPermissions, itemsScanned: totalItemsScanned, errors: allErrors };
}

export async function getOneDriveSharingLinks(
  token: string,
  userId: string,
): Promise<DriveItemSharingResult> {
  try {
    return await scanDriveForSharedItems(
      token,
      `https://graph.microsoft.com/v1.0/users/${userId}/drive`,
      `od:${userId}`,
    );
  } catch (err: any) {
    return { permissions: [], itemsScanned: 0, errors: [{ context: `od:${userId}`, message: err.message }] };
  }
}

export async function revokeSharingLink(
  token: string,
  siteId: string,
  permissionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/permissions/${permissionId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (res.ok || res.status === 204) {
      return { success: true };
    }

    const errText = await res.text();
    return { success: false, error: `Graph DELETE permission ${res.status}: ${errText.substring(0, 300)}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// License / SKU management
// ---------------------------------------------------------------------------

export interface SubscribedSku {
  id: string;
  skuId: string;
  skuPartNumber: string;
  appliesTo: string;
  capabilityStatus: string;
  consumedUnits: number;
  prepaidUnits: {
    enabled: number;
    suspended: number;
    warning: number;
    lockedOut: number;
  };
  servicePlans: {
    servicePlanId: string;
    servicePlanName: string;
    provisioningStatus: string;
    appliesTo: string;
  }[];
}

export async function getSubscribedSkus(
  token: string,
): Promise<{ skus: SubscribedSku[]; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/subscribedSkus`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      const errText = await res.text();
      return { skus: [], error: `Graph API error ${res.status}: ${errText.substring(0, 300)}` };
    }

    const data = await res.json();
    const skus: SubscribedSku[] = (data.value || []).map((s: any) => ({
      id: s.id,
      skuId: s.skuId,
      skuPartNumber: s.skuPartNumber,
      appliesTo: s.appliesTo || '',
      capabilityStatus: s.capabilityStatus || '',
      consumedUnits: s.consumedUnits ?? 0,
      prepaidUnits: {
        enabled: s.prepaidUnits?.enabled ?? 0,
        suspended: s.prepaidUnits?.suspended ?? 0,
        warning: s.prepaidUnits?.warning ?? 0,
        lockedOut: s.prepaidUnits?.lockedOut ?? 0,
      },
      servicePlans: (s.servicePlans || []).map((sp: any) => ({
        servicePlanId: sp.servicePlanId,
        servicePlanName: sp.servicePlanName,
        provisioningStatus: sp.provisioningStatus,
        appliesTo: sp.appliesTo,
      })),
    }));

    return { skus };
  } catch (err: any) {
    return { skus: [], error: err.message };
  }
}

// ---------------------------------------------------------------------------
// All user license details (paginated)
// ---------------------------------------------------------------------------

export interface UserLicenseInfo {
  id: string;
  displayName: string | null;
  userPrincipalName: string;
  department: string | null;
  jobTitle: string | null;
  accountEnabled: boolean;
  assignedLicenses: { skuId: string; disabledPlans: string[] }[];
  signInActivity?: { lastSignInDateTime: string | null };
}

export async function getAllUserLicenseDetails(
  token: string,
): Promise<{ users: UserLicenseInfo[]; error?: string }> {
  const baseFields = "id,displayName,userPrincipalName,department,jobTitle,accountEnabled,assignedLicenses";

  const fetchAllPages = async (selectFields: string): Promise<{ users: UserLicenseInfo[]; error?: string; status?: number }> => {
    const users: UserLicenseInfo[] = [];
    let url: string | null =
      `https://graph.microsoft.com/v1.0/users` +
      `?$select=${selectFields}` +
      `&$top=999`;

    while (url) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          ConsistencyLevel: "eventual",
        },
      });

      if (!res.ok) {
        const errText = await res.text();
        return { users, error: `Graph API error ${res.status}: ${errText.substring(0, 300)}`, status: res.status };
      }

      const data = await res.json();
      for (const u of data.value || []) {
        users.push({
          id: u.id,
          displayName: u.displayName ?? null,
          userPrincipalName: u.userPrincipalName,
          department: u.department ?? null,
          jobTitle: u.jobTitle ?? null,
          accountEnabled: u.accountEnabled ?? false,
          assignedLicenses: (u.assignedLicenses || []).map((l: any) => ({
            skuId: l.skuId,
            disabledPlans: l.disabledPlans || [],
          })),
          signInActivity: u.signInActivity ? { lastSignInDateTime: u.signInActivity.lastSignInDateTime ?? null } : undefined,
        });
      }
      url = data["@odata.nextLink"] ?? null;
    }
    return { users };
  };

  try {
    const result = await fetchAllPages(`${baseFields},signInActivity`);
    if (result.status === 403 && result.error?.includes("AuditLog.Read.All")) {
      console.log("[graph] signInActivity requires AuditLog.Read.All — retrying without it");
      const fallback = await fetchAllPages(baseFields);
      if (fallback.error) return fallback;
      console.log(`[graph] getAllUserLicenseDetails: ${fallback.users.length} users (no signInActivity)`);
      return fallback;
    }
    if (result.error) return result;
    console.log(`[graph] getAllUserLicenseDetails: ${result.users.length} users`);
    return { users: result.users };
  } catch (err: any) {
    return { users: [], error: err.message };
  }
}

// ---------------------------------------------------------------------------
// OneDrive usage report (CSV → parsed objects)
// ---------------------------------------------------------------------------

export interface OneDriveUsageRow {
  reportRefreshDate: string;
  ownerDisplayName: string;
  ownerPrincipalName: string;
  isDeleted: boolean;
  lastActivityDate: string;
  fileCount: number;
  activeFileCount: number;
  storageUsedBytes: number;
  storageAllocatedBytes: number;
  siteUrl: string;
  reportPeriod: string;
}

function parseCsvToObjects<T = Record<string, string>>(csv: string): T[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  // Strip BOM if present
  const headerLine = lines[0].replace(/^\uFEFF/, "");
  const headers = headerLine.split(",").map(h => h.trim());
  const results: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = line.split(",");
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = (values[j] || "").trim();
    }
    results.push(obj as T);
  }

  return results;
}

export async function getOneDriveUsageReport(
  token: string,
): Promise<{ rows: OneDriveUsageRow[]; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/reports/getOneDriveUsageAccountDetail(period='D30')`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return { rows: [], error: `Graph report API error ${res.status}: ${errText.substring(0, 300)}` };
    }

    const csvText = await res.text();
    const raw = parseCsvToObjects(csvText);

    const rows: OneDriveUsageRow[] = raw.map((r: any) => ({
      reportRefreshDate: r["Report Refresh Date"] || '',
      ownerDisplayName: r["Owner Display Name"] || '',
      ownerPrincipalName: r["Owner Principal Name"] || '',
      isDeleted: r["Is Deleted"] === "TRUE",
      lastActivityDate: r["Last Activity Date"] || '',
      fileCount: parseInt(r["File Count"] || '0', 10) || 0,
      activeFileCount: parseInt(r["Active File Count"] || '0', 10) || 0,
      storageUsedBytes: parseInt(r["Storage Used (Byte)"] || '0', 10) || 0,
      storageAllocatedBytes: parseInt(r["Storage Allocated (Byte)"] || '0', 10) || 0,
      siteUrl: r["Site URL"] || '',
      reportPeriod: r["Report Period"] || '',
    }));

    return { rows };
  } catch (err: any) {
    return { rows: [], error: err.message };
  }
}

// ---------------------------------------------------------------------------
// SharePoint site usage report (CSV → parsed objects)
// ---------------------------------------------------------------------------

export interface SharePointSiteUsageRow {
  reportRefreshDate: string;
  siteId: string;
  siteUrl: string;
  ownerDisplayName: string;
  ownerPrincipalName: string;
  isDeleted: boolean;
  lastActivityDate: string;
  siteSensitivityLabelId: string;
  externalSharing: string;
  unmanagedDevicePolicy: string;
  geolocation: string;
  fileCount: number;
  activeFileCount: number;
  pageViewCount: number;
  visitedPageCount: number;
  storageUsedBytes: number;
  storageAllocatedBytes: number;
  rootWebTemplate: string;
  reportPeriod: string;
}

export async function getSharePointSiteUsageReport(
  token: string,
): Promise<{ rows: SharePointSiteUsageRow[]; error?: string }> {
  try {
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/reports/getSharePointSiteUsageDetail(period='D30')`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      return { rows: [], error: `Graph report API error ${res.status}: ${errText.substring(0, 300)}` };
    }

    const csvText = await res.text();
    const raw = parseCsvToObjects(csvText);

    const rows: SharePointSiteUsageRow[] = raw.map((r: any) => ({
      reportRefreshDate: r["Report Refresh Date"] || '',
      siteId: r["Site Id"] || '',
      siteUrl: r["Site URL"] || '',
      ownerDisplayName: r["Owner Display Name"] || '',
      ownerPrincipalName: r["Owner Principal Name"] || '',
      isDeleted: r["Is Deleted"] === "TRUE",
      lastActivityDate: r["Last Activity Date"] || '',
      siteSensitivityLabelId: r["Site Sensitivity Label Id"] || '',
      externalSharing: r["External Sharing"] || '',
      unmanagedDevicePolicy: r["Unmanaged Device Policy"] || '',
      geolocation: r["Geo Location"] || '',
      fileCount: parseInt(r["File Count"] || '0', 10) || 0,
      activeFileCount: parseInt(r["Active File Count"] || '0', 10) || 0,
      pageViewCount: parseInt(r["Page View Count"] || '0', 10) || 0,
      visitedPageCount: parseInt(r["Visited Page Count"] || '0', 10) || 0,
      storageUsedBytes: parseInt(r["Storage Used (Byte)"] || '0', 10) || 0,
      storageAllocatedBytes: parseInt(r["Storage Allocated (Byte)"] || '0', 10) || 0,
      rootWebTemplate: r["Root Web Template"] || '',
      reportPeriod: r["Report Period"] || '',
    }));

    return { rows };
  } catch (err: any) {
    return { rows: [], error: err.message };
  }
}

// ── User Inventory & Email Content Storage helpers ───────────────────────────
// Narrow, least-privilege Graph helpers used by the Zenith User Inventory
// layer and the Email Content Storage Report. These do NOT enumerate Entra
// beyond what is strictly required for the inventory refresh.

export interface InventoryUser {
  id: string;
  userPrincipalName: string;
  mail: string | null;
  displayName: string | null;
  accountEnabled: boolean;
  userType: "Member" | "Guest" | string;
}

/**
 * Fetch a single page of tenant users for inventory refresh. Returns the
 * raw nextLink so callers can checkpoint between pages (throttling-safe).
 *
 * Selects only the minimal fields required by the User Inventory schema.
 * This is the ONLY Graph /users enumeration Zenith performs — reports must
 * consume the cached inventory, not call this directly.
 */
export async function fetchUserInventoryPage(
  token: string,
  nextLink?: string,
): Promise<{ users: InventoryUser[]; nextLink: string | null; status: number }> {
  const url =
    nextLink ??
    "https://graph.microsoft.com/v1.0/users" +
      "?$select=id,userPrincipalName,mail,displayName,accountEnabled,userType" +
      "&$top=999";

  const res = await graphFetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      ConsistencyLevel: "eventual",
    },
  });

  if (!res.ok) {
    return { users: [], nextLink: null, status: res.status };
  }

  const data: any = await res.json();
  const users: InventoryUser[] = (data.value || []).map((u: any) => ({
    id: u.id,
    userPrincipalName: u.userPrincipalName,
    mail: u.mail ?? null,
    displayName: u.displayName ?? null,
    accountEnabled: u.accountEnabled !== false,
    userType: u.userType ?? "Member",
  }));

  return {
    users,
    nextLink: (data["@odata.nextLink"] as string) ?? null,
    status: res.status,
  };
}

export interface SentMessageMeta {
  id: string;
  sentDateTime: string | null;
  hasAttachments: boolean;
  size: number;                // message size in bytes (proxy for attachment size)
  senderAddress: string | null;
  recipientAddresses: string[];
}

/**
 * Fetch a single page of Sent Items messages for a user, with minimal
 * $select and a receivedDateTime range filter. Message body and subject are
 * never requested — only metadata needed for storage estimation.
 *
 * The 429/5xx retry behavior is delegated to graphFetchWithRetry.
 */
export async function fetchSentMessagesPage(
  token: string,
  userId: string,
  startIso: string,
  endIso: string,
  pageSize: number,
  nextLink?: string,
): Promise<{ messages: SentMessageMeta[]; nextLink: string | null; status: number }> {
  const top = Math.min(Math.max(pageSize, 1), 1000);
  const filter = `receivedDateTime ge ${startIso} and receivedDateTime lt ${endIso}`;
  const select = "id,sentDateTime,hasAttachments,sender,toRecipients,ccRecipients,bccRecipients";
  const url =
    nextLink ??
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}` +
      `/mailFolders('sentitems')/messages` +
      `?$select=${select}` +
      `&$filter=${encodeURIComponent(filter)}` +
      `&$top=${top}` +
      `&$orderby=receivedDateTime desc`;

  const res = await graphFetchWithRetry(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    let errorBody = "";
    try {
      errorBody = await res.text();
    } catch {}
    console.warn(
      `[fetchSentMessagesPage] Graph returned status ${res.status} for user ${userId}: ${errorBody.substring(0, 500)}`,
    );
    return { messages: [], nextLink: null, status: res.status };
  }

  const data: any = await res.json();

  const toAddr = (r: any): string | null => {
    const a = r?.emailAddress?.address;
    return typeof a === "string" && a.length > 0 ? a : null;
  };

  const messages: SentMessageMeta[] = (data.value || []).map((m: any) => {
    const recipients: string[] = [];
    for (const key of ["toRecipients", "ccRecipients", "bccRecipients"]) {
      for (const r of m[key] || []) {
        const addr = toAddr(r);
        if (addr) recipients.push(addr);
      }
    }
    return {
      id: m.id,
      sentDateTime: m.sentDateTime ?? null,
      hasAttachments: !!m.hasAttachments,
      size: typeof m.size === "number" ? m.size : 0,
      senderAddress: toAddr(m.sender) ?? toAddr(m.from),
      recipientAddresses: recipients,
    };
  });

  return {
    messages,
    nextLink: (data["@odata.nextLink"] as string) ?? null,
    status: res.status,
  };
}

export interface AttachmentMeta {
  name: string | null;
  contentType: string | null;
  size: number;
  odataType: string | null;
  isInline: boolean;
}

/**
 * Fetch attachment metadata for a single message (METADATA mode only).
 * Never downloads attachment content — $select restricts the response
 * to name/contentType/size. Bounded by the caller via maxAttachmentsPerMessage.
 */
export async function fetchMessageAttachmentsMeta(
  token: string,
  userId: string,
  messageId: string,
  maxAttachments: number,
): Promise<{ attachments: AttachmentMeta[]; status: number }> {
  const top = Math.min(Math.max(maxAttachments, 1), 100);
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}` +
    `/messages/${encodeURIComponent(messageId)}/attachments` +
    `?$select=name,contentType,size,isInline&$top=${top}`;

  const res = await graphFetchWithRetry(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return { attachments: [], status: res.status };
  }

  const data: any = await res.json();
  const attachments: AttachmentMeta[] = (data.value || []).slice(0, top).map((a: any) => ({
    name: typeof a.name === "string" ? a.name : null,
    contentType: typeof a.contentType === "string" ? a.contentType : null,
    size: typeof a.size === "number" ? a.size : 0,
    odataType: typeof a["@odata.type"] === "string" ? a["@odata.type"] : null,
    isInline: !!a.isInline,
  }));

  return { attachments, status: res.status };
}
