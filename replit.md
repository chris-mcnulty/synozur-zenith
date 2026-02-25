# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is an MVP Microsoft 365 governance platform designed for The Synozur Alliance. Its primary purpose is to provide governed SharePoint site provisioning, incorporating Deal and Portfolio Company context. Key capabilities include site inventory tracking, sensitivity label enforcement, and explainability for Copilot eligibility. All managed workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Microsoft Teams connectivity. The business vision is to streamline M365 governance, enhance security, and improve operational efficiency for organizations managing multiple M365 tenants. Zenith is part of the Synozur application portfolio, sharing common UI/UX and multitenant architecture patterns with sibling apps like Constellation, Orbit, and Vega.

### Synozur Application Portfolio
- **Zenith**: Microsoft 365 governance platform (this app)
- **Constellation**: Sibling app (shared design language and multitenant architecture). Codebase: https://github.com/chris-mcnulty/synozur-scdp
- **Orbit**: Sibling app (shared design language and multitenant architecture)
- **Vega**: Strategy and OKRs app. Codebase: https://github.com/chris-mcnulty/synozur-vega

## User Preferences
I prefer clear and direct communication. When making changes, please explain the reasoning and impact before proceeding. I value iterative development and would like to be involved in key decision points. Do not make changes to the `shared/schema.ts` file without explicit approval. Always keep the Entra App Registration permissions documented in this file — this is a permanent rule so the app can be maintained alongside the codebase.

### Permanent Rule: Data Ownership Scoping
Every time a new property, table, or data object is added, verify its ownership scope:
- **Tenant-owned**: Data intrinsic to the M365 tenant itself (e.g., departments, sensitivity labels, Purview policies). Scoped by M365 `tenantId` so all organizations connected to the same tenant share a single canonical list. Prevents drift between MSP and customer views.
- **Organization-owned**: Data specific to a Zenith organization's governance decisions (e.g., provisioning templates, RBAC roles, service plan settings). Scoped by `organizationId`.
- **Application-owned**: Data controlled by the Zenith platform itself (e.g., system defaults, feature flags, plan definitions). Not scoped to any tenant or org.

## System Architecture

### UI/UX Decisions
The frontend is built with React, Vite, TanStack Query, shadcn/ui for components, and wouter for routing, aiming for a modern and responsive user experience consistent with the Synozur portfolio's shared design language.

### Technical Implementations
- **Frontend**: React + Vite + TanStack Query + shadcn/ui + wouter
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL
- **Authentication**: Microsoft Entra ID (SSO) with Zenith-managed RBAC. Dual authentication with email/password login is also supported. Tokens are encrypted at rest using AES-256-GCM.
- **Multi-Tenancy**: Primary multi-tenancy is at the Organization level, allowing organizations to connect multiple M365 tenants. Users can belong to multiple organizations via the `organization_users` junction table, each with a distinct role. An `activeOrganizationId` in the session determines the current org context. Organization access is controlled by `inviteOnly` (boolean) and `allowedDomains` (string array) columns on the `organizations` table.
- **Security Model**: Zenith acts as the system of authorization, while Entra ID handles authentication. It employs four layers of separation: Microsoft Entra ID (authentication), Zenith Control Plane (authorization), Zenith Data Plane (inventory), and Zenith RBAC (permissions). A single multi-tenant Entra app registration is used.
- **Tenant Ownership**: Each M365 tenant has exactly one owning Zenith organization with defined ownership types (MSP, Customer, Hybrid).
- **RBAC**: Robust Role-Based Access Control system (Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, Read-Only Auditor) with visibility-scoped access. **Write operations** (label push, property bag writeback, hub assignment, metadata writeback, copilot rules) are gated by Zenith RBAC middleware — Governance Admin or higher required. **Provisioning requests** require Operator or higher; **provisioning approval** and **tenant sync** require Tenant Admin or higher. **Read operations** (inventory sync) are best-effort with the current user's delegated token; warnings are surfaced when data is incomplete due to insufficient SharePoint permissions. Users performing SPO write-back must be SharePoint administrators in the tenant — Zenith does not escalate privileges or use another user's token for write operations.
- **Service Plan Gating**: Features are gated by service plans (TRIAL, STANDARD, PROFESSIONAL, ENTERPRISE), enforced server-side and client-side.

### Hash-Based Writeback Dirty Checking
- **`spoSyncHash`** (text): SHA-256 of writeback-eligible properties as read from SharePoint during last sync. Computed by `computeSpoSyncHash()` from `sensitivityLabelId` + property bag keys (Department, CostCenter, ProjectCode, ZenithAI).
- **`localHash`** (text): SHA-256 of the same properties as stored in Zenith after local edits. Computed by `computeWritebackHash()`.
- **Comparison**: When `localHash !== spoSyncHash`, the workspace is "dirty" and needs writeback. After successful writeback, `spoSyncHash` is set to match `localHash`.
- **Bulk writeback** (`POST /api/admin/tenants/:id/writeback`): Finds all dirty workspaces, batches NoScript disable → writes → NoScript re-enable. Processes 5 sites concurrently. Only writes to sites that actually changed.
- **Hash utility**: `server/services/writeback-hash.ts` — deterministic SHA-256 over sorted key-value pairs.
- **Scale optimization**: At 2000 sites, only the delta (e.g., 30-50 dirty sites) requires CSOM writeback. NoScript toggle is batched once for all dirty sites instead of per-site.
- **Sensitivity label push via admin API**: For non-group sites where `Site.SensitivityLabelId` CSOM fails, Zenith falls back to the SPO admin API (`GetSitePropertiesByUrl` + `SensitivityLabel` property), the same approach as `Set-SPOSite -SensitivityLabel`.

### Key Design Decisions
- All managed workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Teams connectivity.
- Automated `DEAL-` and `PORTCO-` prefixes for site naming conventions.
- Enforcement of "Highly Confidential" sensitivity labels to block external sharing and Copilot indexing by default.
- Ownership tracked as `siteOwners` jsonb array on each workspace — group-connected sites use `/groups/{groupId}/owners`, non-group sites use `/_api/web/siteusers?$filter=IsSiteAdmin eq true`. Owners are read-only in the UI (sourced from SharePoint, not manually editable in Zenith). Dual ownership (>= 2 owners) required by governance policy.
- `fetchSiteCollectionAdmins()` in `server/services/graph.ts` queries SharePoint REST API for actual site collection admins when no M365 group owners are available.
- **Owner merging**: For all sites, both Graph group owners AND SharePoint site collection admins are fetched and merged with email-based deduplication. This ensures users added as site collection admins (but not group owners) appear in the owner count.
- Post-sync auto-evaluation: After sync completes, the COPILOT_READINESS governance policy is automatically evaluated for all workspaces, updating `copilotReady` and `copilot_rules`.
- Clear display of Copilot eligibility criteria.
- Hub site hierarchy detection via SharePoint REST API (`SP.HubSites` + per-site `IsHubSite`/`HubSiteId`), supporting nested hubs.

### System Design Choices
- **Database Schema**: Core tables include `workspaces`, `provisioning_requests`, `governance_policies`, `copilot_rules`, `tenant_connections`, `organizations`, `organization_users`, `users`, `graph_tokens`, and `audit_log`. The `organization_users` table is a junction table enabling multi-org membership with fields: `id`, `userId`, `organizationId`, `role` (ZenithRole), `isPrimary` (boolean), `joinedAt`. Organizations also have `allowedDomains` (text array) and `inviteOnly` (boolean) columns for access control.
- **Multi-Policy Engine**: Organization-scoped `governance_policies` define composable rule sets (e.g., Copilot Readiness). Each policy contains a JSON array of rule definitions with built-in types: `SENSITIVITY_LABEL_REQUIRED`, `DEPARTMENT_REQUIRED`, `DUAL_OWNERSHIP`, `METADATA_COMPLETE`, `SHARING_POLICY`, `PROPERTY_BAG_CHECK`, `ATTESTATION` (future). Server-side evaluation engine in `server/services/policy-engine.ts` evaluates workspaces against policies and stores results in `copilot_rules`. Policies are organization-owned data.
- **Audit Trail**: All significant actions are logged with details on WHO, WHAT, WHERE, WHEN, and RESULT, stored in PostgreSQL for auditing and compliance.
- **API Endpoints**: Comprehensive RESTful APIs for managing workspaces, provisioning requests, tenant connections, user authentication, and organization settings.

## External Dependencies
- **Microsoft 365 / SharePoint**: Core platform for workspace management and governance.
- **Microsoft Entra ID (formerly Azure Active Directory)**: For Single Sign-On (SSO) authentication and identity management.
- **PostgreSQL**: Primary database for storing application data.
- **Neon**: Managed PostgreSQL service.
- **Microsoft Graph API**: Utilized for interacting with Microsoft 365 services, requiring specific application and delegated permissions (e.g., `Sites.Read.All`, `Sites.FullControl.All`, `Group.Read.All`, `Group.ReadWrite.All`, `Directory.Read.All`, `Reports.Read.All`, `InformationProtectionPolicy.Read.All`, `RecordsManagement.Read.All`, `openid`, `profile`, `email`, `User.Read`, `offline_access`). **Note**: The retention labels API (`/security/labels/retentionLabels`) does NOT support app-only tokens — this is a known Microsoft limitation. Zenith uses delegated (SSO user) tokens with refresh token support for this endpoint. **Note**: `Group.ReadWrite.All` is required as BOTH application permission (for reading group data) AND delegated permission (for sensitivity label write-back on M365 Group-connected sites). Microsoft explicitly does NOT support app-only tokens for updating `assignedLabels` on groups — only delegated user tokens work. Zenith uses app token to resolve group ID, then delegated token to apply/remove labels. For non-group sites (communication sites, etc.), Zenith uses SharePoint CSOM via ProcessQuery to set `Site.SensitivityLabelId` with a **delegated SPO token** (acquired via MSAL refresh token exchange scoped to `https://{tenant}.sharepoint.com/AllSites.FullControl`). The Synozur tenant has custom app authentication disabled, blocking app-only SPO tokens — all SharePoint REST/CSOM operations (lock state, hub sites, property bags, sensitivity labels on non-group sites) use delegated user tokens. The `getDelegatedSpoToken()` function in `routes-entra.ts` exchanges the user's Graph refresh token for a SharePoint-scoped delegated token. Users must re-authenticate via SSO after adding `Group.ReadWrite.All` delegated scope to pick up the new permission. **Note**: `Sites.FullControl.All` (application permission) is still configured in Entra for potential future use, but currently all SPO operations use delegated tokens due to tenant restrictions. Hub assignment changes require a delegated SPO token; without one, changes are saved to Zenith's inventory but not applied to SharePoint.
- **connect-pg-simple**: PostgreSQL-backed session store.
- **bcryptjs**: Used for password hashing.
- **MSAL-node**: Microsoft Authentication Library for Node.js, used for handling PKCE authorization code flow for SSO.