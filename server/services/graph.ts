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

// ── Per-site telemetry ────────────────────────────────────────────────────────

export interface SiteTelemetry {
  siteId: string;
  storageUsedBytes?: number;
  storageTotalBytes?: number;
  fileCount?: number;
  /** Number of items immediately under the drive root — top-level structure proxy */
  folderCount?: number;
  listCount?: number;
  documentLibraryCount?: number;
  contentTypes?: { id: string; name: string }[];
  sensitivityLabel?: string;
  sensitivityLabelId?: string;
  lastActivityDate?: string;
  error?: string;
}

/**
 * Fetches governance telemetry for a single SharePoint site via MS Graph.
 * All sub-calls are made concurrently; individual failures degrade gracefully
 * rather than aborting the whole snapshot.
 */
export async function fetchSiteTelemetry(
  tenantId: string,
  clientId: string,
  clientSecret: string,
  siteId: string,
): Promise<SiteTelemetry> {
  const result: SiteTelemetry = { siteId };

  try {
    const token = await getAppToken(tenantId, clientId, clientSecret);
    const h = { Authorization: `Bearer ${token}` };
    const v1 = "https://graph.microsoft.com/v1.0";

    // Fan-out: drive quota, content types, lists, sensitivity label (beta)
    const [driveResult, ctResult, listsResult, rootResult, betaResult] =
      await Promise.allSettled([
        fetch(`${v1}/sites/${siteId}/drive?$select=id,quota,lastModifiedDateTime`, { headers: h }),
        fetch(`${v1}/sites/${siteId}/contentTypes?$select=id,name&$top=100`, { headers: h }),
        fetch(`${v1}/sites/${siteId}/lists?$select=id,displayName,list&$top=100`, { headers: h }),
        fetch(`${v1}/sites/${siteId}/drive/root?$select=id,folder`, { headers: h }),
        fetch(`https://graph.microsoft.com/beta/sites/${siteId}?$select=id,sensitivity`, { headers: h }),
      ]);

    // Drive quota → storage bytes, file count, last-activity
    if (driveResult.status === "fulfilled" && driveResult.value.ok) {
      const d = await driveResult.value.json();
      result.storageUsedBytes = d.quota?.used ?? undefined;
      result.storageTotalBytes = d.quota?.total ?? undefined;
      result.fileCount = d.quota?.fileCount ?? undefined;
      if (d.lastModifiedDateTime) result.lastActivityDate = d.lastModifiedDateTime;
    }

    // Drive root folder — childCount = total items at root (top-level structure proxy)
    if (rootResult.status === "fulfilled" && rootResult.value.ok) {
      const r = await rootResult.value.json();
      result.folderCount = r.folder?.childCount ?? undefined;
    }

    // Content types — filter out low-signal built-in system types
    if (ctResult.status === "fulfilled" && ctResult.value.ok) {
      const ct = await ctResult.value.json();
      result.contentTypes = (ct.value ?? [])
        .filter((c: any) => c.name && !/^0x/.test(c.id))  // skip hidden system types
        .map((c: any) => ({ id: c.id as string, name: c.name as string }));
    }

    // Lists → total list count + document library count
    if (listsResult.status === "fulfilled" && listsResult.value.ok) {
      const ls = await listsResult.value.json();
      const lists: any[] = ls.value ?? [];
      result.listCount = lists.length;
      result.documentLibraryCount = lists.filter(
        (l) => l.list?.template === "documentLibrary",
      ).length;
    }

    // Sensitivity label — beta API, best-effort; may not be available in all tenants
    if (betaResult.status === "fulfilled" && betaResult.value.ok) {
      const beta = await betaResult.value.json();
      if (beta.sensitivity && typeof beta.sensitivity === "object") {
        result.sensitivityLabel = beta.sensitivity.displayName ?? undefined;
        result.sensitivityLabelId = beta.sensitivity.id ?? undefined;
      }
    }
  } catch (err: any) {
    result.error = err.message;
  }

  return result;
}

export function clearTokenCache(tenantId?: string, clientId?: string) {
  if (tenantId && clientId) {
    tokenCache.delete(`${tenantId}:${clientId}`);
  } else {
    tokenCache.clear();
  }
}
