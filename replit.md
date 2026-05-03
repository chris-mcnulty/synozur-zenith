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

## External Dependencies
- **Microsoft 365 / SharePoint**: Core platform for M365 governance.
- **Microsoft Entra ID**: For SSO authentication and identity management.
- **PostgreSQL**: Primary application database.
- **Neon**: Managed PostgreSQL service.
- **Microsoft Graph API**: For interacting with Microsoft 365 services, requiring specific application and delegated permissions.
- **connect-pg-simple**: PostgreSQL session store.
- **bcryptjs**: For password hashing.
- **MSAL-node**: Microsoft Authentication Library for Node.js.