const GRAPH_APP_ID = "00000003-0000-0000-c000-000000000000";

export interface RequiredPermission {
  roleId: string;
  name: string;
  description: string;
  feature: string;
  required: boolean;
  licenseNote?: string;
}

export const REQUIRED_PERMISSIONS: RequiredPermission[] = [
  {
    roleId: "332a536c-c7ef-4017-ab91-336970924f0d",
    name: "Sites.Read.All",
    description: "Read items in all site collections",
    feature: "Site Inventory",
    required: true,
  },
  {
    roleId: "5b567255-7703-4780-807c-7be8301ae99b",
    name: "Group.Read.All",
    description: "Read all groups",
    feature: "Site Inventory",
    required: true,
  },
  {
    roleId: "7ab1d382-f21e-4acd-a863-ba3e13f7da61",
    name: "Directory.Read.All",
    description: "Read directory data",
    feature: "Site Inventory",
    required: true,
  },
  {
    roleId: "230c1aed-a721-4c5d-9cb4-a90514e508ef",
    name: "Reports.Read.All",
    description: "Read all usage reports",
    feature: "Usage Analytics",
    required: true,
  },
  {
    roleId: "19da66cb-0fb0-4390-b071-ebc76a349482",
    name: "InformationProtectionPolicy.Read.All",
    description: "Read sensitivity labels and label policies",
    feature: "Purview Sensitivity Labels",
    required: true,
  },
  {
    roleId: "ac3a2b8e-03a3-4da9-9ce0-cbe28bf1accd",
    name: "RecordsManagement.Read.All",
    description: "Read records management configuration",
    feature: "Purview Retention Labels",
    required: true,
    licenseNote: "Requires M365 E5 Compliance or Records Management add-on",
  },
];

export const PERMISSIONS_VERSION = 2;

export interface PermissionCheckResult {
  granted: string[];
  missing: string[];
  details: Array<RequiredPermission & { status: "granted" | "missing" }>;
  allGranted: boolean;
  permissionsVersion: number;
}

export async function checkTenantPermissions(
  token: string,
  appId: string
): Promise<PermissionCheckResult> {
  const spUrl = `https://graph.microsoft.com/v1.0/servicePrincipals(appId='${appId}')/appRoleAssignments`;
  const res = await fetch(spUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to check permissions (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const assignments: any[] = data.value || [];

  const grantedRoleIds = new Set(
    assignments
      .filter((a: any) => a.resourceId || a.appRoleId)
      .map((a: any) => a.appRoleId)
  );

  const granted: string[] = [];
  const missing: string[] = [];
  const details: Array<RequiredPermission & { status: "granted" | "missing" }> = [];

  for (const perm of REQUIRED_PERMISSIONS) {
    const isGranted = grantedRoleIds.has(perm.roleId);
    if (isGranted) {
      granted.push(perm.name);
    } else {
      missing.push(perm.name);
    }
    details.push({ ...perm, status: isGranted ? "granted" : "missing" });
  }

  return {
    granted,
    missing,
    details,
    allGranted: missing.length === 0,
    permissionsVersion: PERMISSIONS_VERSION,
  };
}

export { GRAPH_APP_ID };
