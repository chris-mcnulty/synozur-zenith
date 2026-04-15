# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is an MVP Microsoft 365 governance platform designed for The Synozur Alliance. Its primary purpose is to provide governed SharePoint site provisioning with integrated Deal and Portfolio Company context. It offers capabilities for tracking site inventory, enforcing sensitivity labels, and explaining Copilot eligibility. The platform supports management of various SharePoint site types (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE), including optional Microsoft Teams connectivity. Zenith aims to enhance M365 governance, improve security posture, and optimize operational efficiency across multiple M365 tenants, leveraging a shared UI/UX and multitenant architecture consistent with other Synozur applications.

## User Preferences
I prefer clear and direct communication. When making changes, please explain the reasoning and impact before proceeding. I value iterative development and would like to be involved in key decision points. Do not make changes to the `shared/schema.ts` file without explicit approval. Always keep the Entra App Registration permissions documented in this file.

## Related Codebases
- **Orbit**: https://github.com/chris-mcnulty/synozur-orbit — full read access granted. This is a separate Synozur product in the same family as Zenith.

## System Architecture

### UI/UX Decisions
The frontend utilizes React, Vite, TanStack Query, shadcn/ui, and wouter to deliver a modern, responsive user experience adhering to the Synozur design language.

### Technical Implementations
- **Frontend**: React + Vite + TanStack Query + shadcn/ui + wouter
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL
- **Authentication**: Microsoft Entra ID for SSO with Zenith-managed RBAC; supports dual email/password login. Tokens are encrypted at rest.
- **Multi-Tenancy**: Organization-level multi-tenancy, allowing organizations to manage multiple M365 tenants. Data isolation is enforced at the organization level.
- **Security Model**: Zenith provides authorization and RBAC, while Entra ID handles authentication. It implements a four-layer separation: Entra ID (authentication), Zenith Control Plane (authorization), Zenith Data Plane (inventory), and Zenith RBAC (permissions). Client secrets for tenant connections are encrypted at rest using AES-256-GCM.
- **Tenant Ownership & MSP Access**: M365 tenants are owned by Zenith organizations with defined types (MSP, Customer, Hybrid). A consent mechanism allows MSP organizations to access customer tenants, controlled by generated access codes.
- **RBAC**: A robust Role-Based Access Control system (Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, Read-Only Auditor) controls access and operations.
- **Service Plan Gating**: Features are gated by service plans (TRIAL, STANDARD, PROFESSIONAL, ENTERPRISE) on both client and server sides.
- **Tenant Database Masking**: Optional per-tenant AES-256-GCM encryption for sensitive text fields in the database, ensuring data privacy at rest.
- **Hash-Based Writeback Dirty Checking**: Detects and manages changes requiring writeback to SharePoint using `spoSyncHash` and `localHash`.
- **Policy Status Writeback**: Governance policy evaluation results can be written back to SharePoint property bags, which are automatically indexed for search. Auto re-indexing triggers priority SharePoint crawls.
- **What-If Scenario Planner**: Allows simulation of policy rule changes against workspaces with a diff view.
- **Sync-Safe Governance Fields**: Preserves locally set governance fields during full tenant synchronization.
- **Policy Outcomes System**: Configurable policy outcomes define what each policy controls (e.g., Copilot Eligible, External Sharing) and can map to workspace fields or SharePoint property bags.
- **Key Design Decisions**: SharePoint sites are primary managed workspaces, with automated naming prefixes. Enforces "Highly Confidential" sensitivity labels. Tracks site owners and detects Hub site hierarchy.
- **Workspace Telemetry**: Captures point-in-time snapshots of site storage, content, and activity.
- **SharePoint Embedded (SPE)**: Provides full inventory of SPE containers (e.g., Loop, Whiteboard, Copilot) including usage, labels, and owner details, synced via Graph API.
- **Copilot Prompt Intelligence (BL-038)**: Syncs Copilot interaction history via `/beta` Graph endpoint with plain `fetch()` (not `graphFetchWithRetry`), per-user incremental watermarks, client-side date filtering (no `$filter` OData param — rejected by parser), and watermark-safe partial fetch handling (429/page-cap discards results to prevent data gaps). User list is built from `license_assignments` filtered by Copilot SKU with NO `accountEnabled` filter (removed — license sync defaults are inconsistent; Graph API naturally rejects disabled accounts). UX shows sync status with polling, interaction count, and completion banners.
- **Feature Toggle and Data Purge**: Per-tenant opt-in feature toggles for various data-gathering modules (e.g., OneDrive, Recordings, Teams, Telemetry, SPE), with options for data purging and in-memory cancellation of discovery processes.
- **Traffic Analytics**: Tracks anonymous page views for public and login pages, providing aggregated usage statistics for platform owners.
- **Support Ticket System**: In-app help desk with org-scoped support tickets, threaded replies (internal notes supported), and status management.
- **System Design Choices**: Custom field definitions are tenant-owned. Document libraries are first-class inventory entities. A multi-policy engine evaluates workspaces. All significant actions are logged. Comprehensive RESTful APIs are provided.
- **CSV Export/Import**: Allows exporting workspace data to CSV (including custom fields) and importing updates for editable fields based on Site URL.
- **Document Library Detail View**: Provides detailed views of content types, custom columns, and Syntex/AI models for document libraries, fetched live from Graph API.
- **AI Agent Skills**: Per-org agent skill toggles (Provision, Validate, Explain, Report & Recommend) persisted in `ai_agent_skills` table. Governance Admins+ can toggle via `PATCH /api/ai/agent-skills/:skillKey`. Defaults all skills to enabled on first access.
- **AI Connection Status**: `GET /api/ai/connection-status` returns live signals: Entra App Registration configured, last sync time, workspace count, active policy count, sensitivity label count. Powers the Governance Context Sources display.
- **AI Chat GPT Fallback**: GENERAL intent in the chat route optionally calls `completeForFeature('WORKSPACE_INSIGHT', ...)` from `server/services/ai-provider.ts` with workspace summary context. Falls back gracefully to static help text if OpenAI is not configured.
- **AI Assistant Nav**: Removed `isMock: true` flag from the "AI Assistant" nav item — the feature is now backed by real APIs.

## Entra App Registration — Required Permissions (v4)

### Application Permissions (Microsoft Graph)
| Permission | Feature | Required |
|---|---|---|
| Sites.Read.All | Site Inventory | Yes |
| Sites.ReadWrite.All | SPE Container Management | Yes |
| Group.Read.All | Site Inventory | Yes |
| Group.ReadWrite.All | Sensitivity Label Write-Back | Yes |
| Directory.Read.All | Site Inventory | Yes |
| Reports.Read.All | Usage Analytics | Yes |
| User.Read.All | License Inventory | Yes |
| Mail.Read | Email Storage Report | Yes |
| InformationProtectionPolicy.Read.All | Purview Sensitivity Labels | Yes |
| RecordsManagement.Read.All | Purview Retention Labels | Yes (requires M365 E5 Compliance) |
| AiEnterpriseInteraction.Read.All | Copilot Prompt Intelligence | Yes (requires M365 Copilot) |
| AuditLog.Read.All | License Sign-In Activity | No (optional) |

### Delegated Permissions (Microsoft Graph)
openid, profile, email, User.Read, offline_access, RecordsManagement.Read.All, Group.ReadWrite.All

### SharePoint REST API Permissions
| Permission | Type | Feature |
|---|---|---|
| AllSites.FullControl | Delegated | SPE container management |
| Sites.FullControl.All | Application | SPE container management |

## AI Provider Environment Variables

The following environment variables are required for the AI Provider Foundation (Task 50):

| Variable | Required | Description |
|---|---|---|
| `AZURE_CLIENT_ID` | Yes (Azure Foundry) | Azure Entra App Registration client ID for managed identity auth |
| `AZURE_CLIENT_SECRET` | Yes (Azure Foundry) | Azure Entra App Registration client secret for managed identity auth |
| `AZURE_TENANT_ID` | Yes (Azure Foundry) | Azure tenant ID for Entra token acquisition |
| `AZURE_FOUNDRY_OPENAI_ENDPOINT` | Yes (Azure Foundry) | Base URL of the Azure OpenAI endpoint, e.g. `https://<resource>.openai.azure.com` |
| `AZURE_FOUNDRY_API_KEY` | Optional | Fallback API key if Entra credentials are not configured |
| `AZURE_FOUNDRY_PROJECT_ENDPOINT` | Optional | For Inference endpoint models (non-AOAI Azure Foundry deployments) |
| `OPENAI_API_KEY` | Optional (fallback) | OpenAI key for fallback provider |
| `ANTHROPIC_API_KEY` | Optional (fallback) | Anthropic key for fallback provider |

Azure AI Foundry is the primary/default provider, using managed identity (client credentials flow to Entra) as the preferred auth method. If `AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID` are set, a Bearer token is acquired from `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` with the `https://cognitiveservices.azure.com/.default` scope and cached with a 60-second refresh buffer. If Entra creds are absent, `AZURE_FOUNDRY_API_KEY` is used as a fallback auth method. Calls via Azure Foundry incur $0 estimated cost in the usage log (billed to the org's own Azure subscription). Replit OpenAI and Anthropic are available as fallback providers.

## External Dependencies
- **Microsoft 365 / SharePoint**: Core platform for M365 governance.
- **Microsoft Entra ID**: For SSO authentication and identity management.
- **PostgreSQL**: Primary application database.
- **Neon**: Managed PostgreSQL service.
- **Microsoft Graph API**: Used for interacting with Microsoft 365 services, including SharePoint, requiring specific application and delegated permissions.
- **connect-pg-simple**: PostgreSQL session store.
- **bcryptjs**: For password hashing.
- **MSAL-node**: Microsoft Authentication Library for Node.js, handling PKCE authorization code flow.