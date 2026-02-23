# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is an MVP Microsoft 365 governance platform designed for The Synozur Alliance. Its primary purpose is to provide governed SharePoint site provisioning, incorporating Deal and Portfolio Company context. Key capabilities include site inventory tracking, sensitivity label enforcement, and explainability for Copilot eligibility. All managed workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Microsoft Teams connectivity. The business vision is to streamline M365 governance, enhance security, and improve operational efficiency for organizations managing multiple M365 tenants.

## User Preferences
I prefer clear and direct communication. When making changes, please explain the reasoning and impact before proceeding. I value iterative development and would like to be involved in key decision points. Do not make changes to the `shared/schema.ts` file without explicit approval. Always keep the Entra App Registration permissions documented in this file — this is a permanent rule so the app can be maintained alongside the codebase.

### Permanent Rule: Data Ownership Scoping
Every time a new property, table, or data object is added, verify its ownership scope:
- **Tenant-owned**: Data intrinsic to the M365 tenant itself (e.g., departments, sensitivity labels, Purview policies). Scoped by M365 `tenantId` so all organizations connected to the same tenant share a single canonical list. Prevents drift between MSP and customer views.
- **Organization-owned**: Data specific to a Zenith organization's governance decisions (e.g., provisioning templates, RBAC roles, service plan settings). Scoped by `organizationId`.
- **Application-owned**: Data controlled by the Zenith platform itself (e.g., system defaults, feature flags, plan definitions). Not scoped to any tenant or org.

This rule applies to all object types going forward: workspaces, document libraries, Purview labels, compliance policies, etc.

## System Architecture

### UI/UX Decisions
The frontend is built with React, Vite, TanStack Query, shadcn/ui for components, and wouter for routing, aiming for a modern and responsive user experience.

### Technical Implementations
- **Frontend**: React + Vite + TanStack Query + shadcn/ui + wouter
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL
- **Authentication**: Microsoft Entra ID (SSO) with Zenith-managed RBAC. Dual authentication with email/password login is also supported. Tokens are encrypted at rest using AES-256-GCM.
- **Multi-Tenancy**: Primary multi-tenancy is at the Organization level, providing isolated Zenith experiences. Organizations can connect multiple M365 tenants.
- **Security Model**: Zenith acts as the system of authorization, while Entra ID handles authentication. It employs four layers of separation: Microsoft Entra ID (authentication), Zenith Control Plane (authorization), Zenith Data Plane (inventory), and Zenith RBAC (permissions). A single multi-tenant Entra app registration is used, requiring admin consent per tenant for application-level permissions.
- **Tenant Ownership**: Each M365 tenant has exactly one owning Zenith organization with defined ownership types (MSP, Customer, Hybrid). No auto-registration; tenants must be explicitly claimed.
- **RBAC**: Zenith implements a robust Role-Based Access Control system with roles like Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, and Read-Only Auditor. Access is visibility-scoped, ensuring zero existence leakage where users only see data relevant to their authorized tenants and scopes.
- **Service Plan Gating**: Features are gated by service plans (TRIAL, STANDARD, PROFESSIONAL, ENTERPRISE), enforced both server-side and client-side.
- **Key Design Decisions**:
    - All workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with an optional `teamsConnected` flag.
    - Automated `DEAL-` and `PORTCO-` prefixes for site naming conventions.
    - Enforcement of "Highly Confidential" sensitivity labels to block external sharing and Copilot indexing by default.
    - Requirement of dual ownership (Primary Steward + Secondary Owner) for workspaces to prevent orphaned sites.
    - Clear display of Copilot eligibility criteria.
    - Hub site hierarchy detection via SharePoint REST API (`SP.HubSites` + per-site `IsHubSite`/`HubSiteId`). Supports nested hubs (root hub → child hubs → associated sites) using `parentHubSiteId`. Hub enrichment runs as non-fatal step during tenant sync.

### System Design Choices
- **Database Schema**: Core tables include `workspaces`, `provisioning_requests`, `copilot_rules`, `tenant_connections`, `organizations`, `users`, `graph_tokens`, and `audit_log`.
- **Audit Trail**: All significant actions are logged with details on WHO, WHAT, WHERE, WHEN, and RESULT, stored in PostgreSQL for auditing and compliance.
- **API Endpoints**: A comprehensive set of RESTful APIs are provided for managing workspaces, provisioning requests, tenant connections, user authentication, and organization settings.

## Entra App Registration — Required Permissions

This section documents all Microsoft Entra ID (Azure AD) app registration permissions required by Zenith. This must be kept up to date whenever new Graph API functionality is added.

### App Registration Configuration
- **App Type**: Single multi-tenant app registration
- **Supported Account Types**: Accounts in any organizational directory (Multitenant)
- **Admin Consent**: Required per tenant via the admin consent flow (`/adminconsent`)
- **Redirect URI**: `{BASE_URL}/api/admin/tenants/consent/callback` (Web platform)

### Application Permissions (require admin consent)

| Permission | Type | Purpose | Used By |
|---|---|---|---|
| `Sites.Read.All` | Application | Read all SharePoint site collections, site properties, and drives | Site inventory sync, drive storage/owner enrichment |
| `Sites.Manage.All` | Application | Create, edit, and delete items and lists in all site collections | Write department to site property bag, future provisioning |
| `Group.Read.All` | Application | Read all Microsoft 365 group properties | Site-to-group mapping, Teams connectivity detection |
| `Directory.Read.All` | Application | Read directory data (users, groups, org info) | User/owner resolution, tenant validation |
| `Reports.Read.All` | Application | Read all usage reports | SharePoint site usage reports (storage, file counts, page views, activity, sensitivity labels, sharing settings) |
| `InformationProtectionPolicy.Read.All` | Application | Read all published labels and label policy settings | Purview sensitivity label inventory sync during tenant sync |

### Delegated Permissions (for SSO user login)

| Permission | Type | Purpose | Used By |
|---|---|---|---|
| `openid` | Delegated | Sign users in | Entra SSO login (PKCE auth code flow) |
| `profile` | Delegated | Read user basic profile | Display name, job title during SSO |
| `email` | Delegated | Read user email address | User identity matching |
| `User.Read` | Delegated | Read signed-in user profile | SSO user profile population |

### Environment Secrets
- `AZURE_CLIENT_ID` — The Application (client) ID from the Entra app registration
- `AZURE_CLIENT_SECRET` — A client secret generated for the app registration
- `AZURE_TENANT_ID` — The home tenant ID where the app is registered (used for SSO)
- `TOKEN_ENCRYPTION_SECRET` — AES-256-GCM key for encrypting stored tokens at rest

### Notes
- Application permissions use client credentials flow (no user context) for background sync operations
- The admin consent URL includes all application permissions; tenant admins must approve during onboarding
- When adding new Graph API calls, always update this section with the required permission

### Tenant Prerequisites
- **Site-level sensitivity label application**: Before Zenith (or any app) can apply sensitivity labels at the SharePoint site level, the tenant admin must first enable AIP integration via PowerShell: `Set-SPOTenant -EnableAIPIntegration $true` (or the equivalent API call). Without this, label application calls will fail. Reference: https://learn.microsoft.com/en-us/purview/sensitivity-labels-sharepoint-onedrive-files
- **Verifying sensitivity labels**: Tenant admins can verify their published sensitivity labels at: https://purview.microsoft.com/informationprotection/informationprotectionlabels/sensitivitylabels

### Troubleshooting: "Groups & sites" Grayed Out in Purview Label Scope
If the "Groups & sites" scope is grayed out/disabled when creating a sensitivity label in the Purview portal, it means **container sensitivity labels are not enabled in Entra ID** for that tenant. The `EnableMIPLabels` flag in the `Group.Unified` Entra directory settings must be set to `True`. This is required before labels can target Microsoft Teams, M365 Groups, and SharePoint sites.

**Fix (run once per tenant as Global Admin):**
1. Connect to Entra ID: `Install-Module AzureADPreview -Force; Import-Module AzureADPreview; Connect-AzureAD`
2. Check if the Group.Unified settings object exists: `$setting = Get-AzureADDirectorySetting | Where-Object DisplayName -eq "Group.Unified"; $setting.Values`
3. If the object **exists**: `$setting["EnableMIPLabels"] = "True"; Set-AzureADDirectorySetting -Id $setting.Id -DirectorySetting $setting`
4. If the object **does not exist** (common): `$template = Get-AzureADDirectorySettingTemplate | Where-Object DisplayName -eq "Group.Unified"; $setting = $template.CreateDirectorySetting(); $setting["EnableMIPLabels"] = "True"; New-AzureADDirectorySetting -DirectorySetting $setting`

**After enabling:**
- No restart or policy republish required
- Purview UI updates within 5–30 minutes (worst case: sign out/in of Purview portal)
- "Groups & sites" becomes selectable; container labels can then control team privacy, guest access, external sharing, and Conditional Access enforcement

**Important distinction:** Container labels govern the collaboration surface (Teams, Groups, Sites), NOT the documents inside them. They do not label files automatically, encrypt SharePoint content, or replace file-level sensitivity labels.

### Troubleshooting: Labels Not Discoverable or Assignable via Code
Sensitivity labels **must be published** in a label policy before they can be applied via code (Graph API, PnP PowerShell, SPO). Publishing is what authorizes usage by SharePoint Online, Teams, M365 Groups, and APIs — not just by users in Office apps. An unpublished label is invisible to SharePoint and all code paths.

**Requirements for code-based label assignment:**
1. The label must exist in Purview
2. The label scope must include "Groups & sites"
3. The label must be published in a label policy
4. The identity applying it (user account, service principal, or managed identity) must be in scope of that policy

If any of these are false, code-based assignment fails or the label is not discoverable.

**Symptoms of unpublished/out-of-scope labels:**
- `Get-PnPSiteSensitivityLabel` returns nothing
- `Set-PnPSite -SensitivityLabel` fails or silently no-ops
- Graph API calls reject the label ID
- Label does not appear in site metadata

**Publishing scope for automation:** The label policy must include at least one of: the user account running the script, the service principal / managed identity (for app-only auth), or an admin unit containing those. Publishing to "All users" works and is common.

**What publishing does NOT do:** It does not auto-apply labels to sites, force users to label files, encrypt content, or grant site owners control. It simply makes the label eligible for use by platforms and APIs.

**Minimum viable setup for site labeling via code:**
1. Enable container labeling in Entra (EnableMIPLabels = True) — see troubleshooting above
2. Create label with "Groups & sites" scope in Purview
3. Publish label in a label policy targeting the automation identity (or all users)
4. Apply via code (Graph API / PnP / SPO)

## External Dependencies
- **Microsoft 365 / SharePoint**: Core platform for workspace management and governance.
- **Microsoft Entra ID (formerly Azure Active Directory)**: Used for Single Sign-On (SSO) authentication and identity management.
- **PostgreSQL**: Primary database for storing application data, including user information, workspace inventory, and audit logs.
- **Neon**: Managed PostgreSQL service.
- **Microsoft Graph API**: Utilized for interacting with Microsoft 365 services. See the "Entra App Registration — Required Permissions" section above for the full list of required permissions.
- **connect-pg-simple**: PostgreSQL-backed session store.
- **bcryptjs**: Used for password hashing.
- **MSAL-node**: Microsoft Authentication Library for Node.js, used for handling PKCE authorization code flow for SSO.