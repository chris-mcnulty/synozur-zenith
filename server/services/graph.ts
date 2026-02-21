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

export function clearTokenCache(tenantId?: string, clientId?: string) {
  if (tenantId && clientId) {
    tokenCache.delete(`${tenantId}:${clientId}`);
  } else {
    tokenCache.clear();
  }
}
