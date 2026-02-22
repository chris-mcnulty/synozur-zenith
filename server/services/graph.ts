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
    const token = await getAppToken(tenantId, clientId, clientSecret);

    const allSites: GraphSite[] = [];
    let nextLink: string | null = "https://graph.microsoft.com/v1.0/sites?$top=100&$select=id,displayName,webUrl,description,createdDateTime,lastModifiedDateTime,isPersonalSite,root,siteCollection";

    while (nextLink) {
      const res: Response = await fetch(nextLink, {
        headers: { Authorization: `Bearer ${token}` },
      });

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
    const token = await getAppToken(tenantId, clientId, clientSecret);

    const allRows: SiteUsageReportRow[] = [];
    let nextLink: string | null = "https://graph.microsoft.com/beta/reports/getSharePointSiteUsageDetail(period='D7')?$format=application/json";

    while (nextLink) {
      const res: Response = await fetch(nextLink, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

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
    contentFormats?: string[];
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
        detail = parsed.error?.message || parsed.error?.code || errText;
      } catch {}
      return { labels: [], error: `Graph API ${res.status}: ${detail}` };
    }

    const data = await res.json();
    const rawLabels = data.value || [];

    const labels = rawLabels.map((l: any) => {
      const contentFormats: string[] = l.contentFormats || [];
      const appliesToGroupsSites = contentFormats.includes("schematizeddata") ||
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

export function clearTokenCache(tenantId?: string, clientId?: string) {
  if (tenantId && clientId) {
    tokenCache.delete(`${tenantId}:${clientId}`);
  } else {
    tokenCache.clear();
  }
}
