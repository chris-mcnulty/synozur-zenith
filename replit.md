# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is an MVP Microsoft 365 governance platform for The Synozur Alliance. It provides governed SharePoint site provisioning with integrated Deal and Portfolio Company context, tracks site inventory, enforces sensitivity labels, and explains Copilot eligibility. Zenith supports various SharePoint site types and optional Microsoft Teams connectivity. It aims to enhance M365 governance, improve security posture, and optimize operational efficiency across multiple M365 tenants, leveraging a shared UI/UX and multitenant architecture.

## User Preferences
I prefer clear and direct communication. When making changes, please explain the reasoning and impact before proceeding. I value iterative development and would like to be involved in key decision points. Do not make changes to the `shared/schema.ts` file without explicit approval. Always keep the Entra App Registration permissions documented in this file.

## System Architecture

### UI/UX Decisions
The frontend uses React, Vite, TanStack Query, shadcn/ui, and wouter, adhering to the Synozur design language.

### Technical Implementations
- **Frontend**: React + Vite + TanStack Query + shadcn/ui + wouter
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL
- **Authentication**: Microsoft Entra ID for SSO with Zenith-managed RBAC; supports dual email/password login. Tokens are encrypted at rest.
- **Multi-Tenancy**: Organization-level multi-tenancy with data isolation, allowing management of multiple M365 tenants.
- **Security Model**: Entra ID for authentication, Zenith Control Plane for authorization, Zenith Data Plane for inventory, and Zenith RBAC for permissions. Client secrets are encrypted at rest using AES-256-GCM.
- **Tenant Ownership & MSP Access**: M365 tenants are owned by Zenith organizations (MSP, Customer, Hybrid). MSP organizations can access customer tenants via a consent mechanism and access codes.
- **Tenant Scope Helpers**: Differentiates between owned tenants and accessible tenants (owned + MSP-granted) for various views and access checks.
- **RBAC**: Robust Role-Based Access Control system (Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, Read-Only Auditor).
- **Service Plan Gating**: Features are gated by service plans (TRIAL, STANDARD, PROFESSIONAL, ENTERPRISE) on client and server.
- **Tenant Database Masking**: Optional per-tenant AES-256-GCM encryption for sensitive database fields.
- **Hash-Based Writeback Dirty Checking**: Manages changes requiring writeback to SharePoint using `spoSyncHash` and `localHash`.
- **Policy Status Writeback**: Governance policy evaluation results can be written back to SharePoint property bags for indexing and search.
- **What-If Scenario Planner**: Simulates policy rule changes against workspaces with diff views.
- **Sync-Safe Governance Fields**: Preserves local governance fields during full tenant synchronization.
- **Policy Outcomes System**: Configurable policy outcomes define what each policy controls (e.g., Copilot Eligible, External Sharing) and map to workspace fields or SharePoint property bags.
- **Key Design Decisions**: SharePoint sites are primary managed workspaces, with automated naming prefixes. Enforces "Highly Confidential" sensitivity labels and tracks site owners and Hub site hierarchy.
- **Workspace Telemetry**: Captures point-in-time snapshots of site storage, content, and activity.
- **SharePoint Embedded (SPE)**: Provides inventory of SPE containers (e.g., Loop, Whiteboard, Copilot) via Graph API.
- **Copilot Prompt Intelligence**: Syncs Copilot user prompts and AI responses using `/beta/copilot/users/{userId}/interactionHistory/getAllEnterpriseInteractions`, with incremental collection and robust error handling.
- **AI Model Defaults**: AI features default to GPT-5.2 via Replit OpenAI, with Workspace Insight defaulting to GPT-5 Mini. Configurable per-feature.
- **Tailwind Typography**: Enabled for Markdown rendering in prose components.
- **Feature Toggle and Data Purge**: Per-tenant opt-in feature toggles for data-gathering modules (e.g., OneDrive, Recordings), with data purging options.
- **Traffic Analytics**: Tracks anonymous page views for usage statistics.
- **Support Ticket System**: In-app help desk with org-scoped support tickets and status management.
- **System Design Choices**: Custom field definitions are tenant-owned. Document libraries are first-class inventory entities. A multi-policy engine evaluates workspaces. All significant actions are logged. Comprehensive RESTful APIs are provided.
- **Comprehensive Audit Trail**: Every privileged mutation is logged to `audit_log` via `server/services/audit-logger.ts`. RBAC access denials and sync job events are also logged. Audit logs are append-only with configurable retention.
- **CSV Export/Import**: Allows exporting workspace data to CSV and importing updates.
- **Document Library Detail View**: Provides detailed views of content types, custom columns, and Syntex/AI models for document libraries, fetched live from Graph API.
- **AI Agent Skills**: Per-org agent skill toggles (Provision, Validate, Explain, Report & Recommend) persisted in `ai_agent_skills` table.
- **AI Connection Status**: `GET /api/ai/connection-status` returns live signals for AI configuration and last sync times.
- **AI Chat GPT Fallback**: GENERAL intent in chat routes can call `completeForFeature('WORKSPACE_INSIGHT', ...)` with workspace summary context, falling back to static help text if OpenAI is not configured.
- **Galaxy Partner API**: Curated `/api/galaxy/v1/*` surface for the sibling Galaxy portal. Two-factor auth: OAuth2 client_credentials bearer token (HS256, signed with `GALAXY_TOKEN_SIGNING_SECRET`) + per-request `X-Galaxy-User` RS256 JWT verified against the registered client's public key. Tables: `galaxy_clients`, `galaxy_tokens`, `galaxy_user_acknowledgements`. Scope/feature/org guards, per-client + per-user rate limiting, audit instrumentation with `details.source='galaxy'`. Platform Owner UI at `/app/admin/galaxy-api` for client registration, secret rotation (shown once), enable/disable, and deletion. OpenAPI spec served at `/api/galaxy/v1/openapi.json`. JWT signing uses Node built-in `crypto` (no `jsonwebtoken` dep).
- **User Invite Flow (BL-045)**: When an admin creates a user via `POST /api/auth/users`, a `sendUserInviteEmail` is dispatched with the verification token as the invite link. `POST /api/auth/users/:id/resend-invite` re-issues the token and resends. Cross-org user search (`searchUsersAcrossOrgs`) is Platform-Owner-only and pushes ILIKE + row-cap into Postgres. Audit actions: `USER_INVITE_SENT`, `USER_INVITE_RESENT`.
- **Library Default Sensitivity Labels (PR46)**: Document libraries can have a default sensitivity label set via the SharePoint REST API (`DefaultSensitivityLabelForLibrary`), distinct from the site-level label. Zenith reads the current library default label and persists it in three new `document_libraries` columns (`default_sensitivity_label_id`, `default_sensitivity_label_name`, `default_sensitivity_label_synced_at`). Setting the default requires the `m365WriteBack` plan feature; retroactive application to existing files additionally requires the `libraryRetroLabeling` plan feature (Professional/Enterprise) and metered Microsoft Graph APIs enabled on the customer tenant (`driveItem:assignSensitivityLabel` beta, per-call metered). A metering status probe is surfaced in tenant settings. Bulk async retro-labelling jobs are tracked via `bulk-job-store`. New service: `server/services/library-labels.ts`. New routes: `GET/POST/PATCH /api/sharepoint/libraries/:id/default-label`, `POST /api/sharepoint/libraries/:id/apply-label-retroactively`. Audit actions: `apply_library_default_label`, `apply_library_default_label_retro`, `sync_library_default_labels`, `LABEL_ASSIGNED`, `BULK_ACTION_APPLIED`.
- **Invitation Accept Page (BL-050)**: Public `/verify-email` route handles both self-signup email verification and invite-token acceptance. The `mode=invite` query param distinguishes invite flows — when present the server mints a short-lived `resetToken` so the user is forced into a password-set step before being signed in. Existing `POST /api/auth/reset-password` redeems the token unchanged. Audit action: `EMAIL_VERIFIED`.
- **On-Demand Tenant Health Check (BL-051)**: `POST /api/tenants/:id/health-check` calls `runManualHealthCheckForTenant` synchronously (Tenant Admin+). A `manualChecksInFlight` Set provides a race guard — rapid double-clicks or concurrent admin clicks get a 409. Result recorded in `tenant_health_checks` with `triggeredBy='manual'`. "Check Health Now" dropdown item added to the tenant connections admin page; invalidates both the tenant list and health widget queries on completion.
- **Tenant Connection Health Monitor (BL-046)**: Nightly scheduler (`tenant-health-scheduler.ts`) pings `GET /organization` on the Graph API for every active tenant connection. Results stored in `tenant_health_checks`; denormalized `health_status` / `health_last_checked_at` / `health_consecutive_failures` on `tenant_connections` feeds `GET /api/tenants/health` without a join. Transitions to `degraded` after 2 consecutive failures; recovers on next success. Non-blocking — does not affect `Suspended`/`Revoked` status. Notifications and audit events fire only on state transitions.

## External PR Integration Process
When a PR is merged into the Zenith repo from an external branch (including Claude-authored branches):
1. Run `git show --stat <merge_commit>` to list all changed files.
2. Check `shared/schema.ts` for new tables or columns — each must be reflected in `ensureTenantConnectionsSchema()` in `server/index.ts` as `CREATE TABLE IF NOT EXISTS` or `ADD COLUMN IF NOT EXISTS` blocks (the migration SQL files alone are not automatically applied at startup).
3. Check `server/storage.ts` for new interface methods and verify their implementations are present.
4. Check `server/index.ts` for new scheduler registrations (`startXxxScheduler`) to confirm they are wired.
5. Check `server/services/audit-logger.ts` for new `AUDIT_ACTIONS` keys and verify `notification-events.ts` has matching templates.
6. Update `replit.md` with a bullet for each new feature under Technical Implementations.
7. Restart the app and confirm the startup log shows `Schema migration ensureTenantConnectionsSchema completed` without errors.

## External Dependencies
- **Microsoft 365 / SharePoint**: Core platform for M365 governance.
- **Microsoft Entra ID**: For SSO authentication and identity management.
- **PostgreSQL**: Primary application database.
- **Neon**: Managed PostgreSQL service.
- **Microsoft Graph API**: For interacting with Microsoft 365 services, requiring specific application and delegated permissions.
- **connect-pg-simple**: PostgreSQL session store.
- **bcryptjs**: For password hashing.
- **MSAL-node**: Microsoft Authentication Library for Node.js.