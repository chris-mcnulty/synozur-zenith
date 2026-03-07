# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is an MVP Microsoft 365 governance platform for The Synozur Alliance, focusing on governed SharePoint site provisioning with Deal and Portfolio Company context. It tracks site inventory, enforces sensitivity labels, and provides Copilot eligibility explainability. It manages SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Microsoft Teams connectivity. The platform aims to streamline M365 governance, enhance security, and improve operational efficiency across multiple M365 tenants, sharing UI/UX and multitenant architecture with other Synozur applications like Constellation, Orbit, and Vega.

## User Preferences
I prefer clear and direct communication. When making changes, please explain the reasoning and impact before proceeding. I value iterative development and would like to be involved in key decision points. Do not make changes to the `shared/schema.ts` file without explicit approval. Always keep the Entra App Registration permissions documented in this file.

## System Architecture

### UI/UX Decisions
The frontend uses React, Vite, TanStack Query, shadcn/ui, and wouter for a modern, responsive user experience consistent with the Synozur design language.

### Technical Implementations
- **Frontend**: React + Vite + TanStack Query + shadcn/ui + wouter
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL
- **Authentication**: Microsoft Entra ID (SSO) with Zenith-managed RBAC. Dual email/password login is also supported. Tokens are encrypted at rest. Frontend auth guard redirects to `/login` when session expires. Production uses `REPLIT_DOMAINS` with custom domain preference for redirect URI construction.
- **Multi-Tenancy**: Primarily organization-level, allowing organizations to connect multiple M365 tenants. Users can belong to multiple organizations with distinct roles.
- **Security Model**: Zenith manages authorization and RBAC, while Entra ID handles authentication. It employs a four-layer separation: Entra ID (authentication), Zenith Control Plane (authorization), Zenith Data Plane (inventory), and Zenith RBAC (permissions).
- **Tenant Ownership**: Each M365 tenant is owned by one Zenith organization with defined ownership types (MSP, Customer, Hybrid). Self-service tenant onboarding flow: enter domain → validate → Microsoft admin consent → auto-discover tenant name → link to org. Select-tenant page shows real org memberships and tenant connections from API.
- **RBAC**: A robust Role-Based Access Control system (Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, Read-Only Auditor) gates access and write operations. All API routes enforce authentication. Sidebar nav items are filtered by role — admin sections hidden from non-admin users. Entra configure/test routes require Tenant Admin role.
- **Service Plan Gating**: Features are gated by service plans (TRIAL, STANDARD, PROFESSIONAL, ENTERPRISE) server-side and client-side.
- **Hash-Based Writeback Dirty Checking**: Uses `spoSyncHash` and `localHash` to detect and manage changes requiring writeback to SharePoint, optimizing bulk updates.
- **Policy Status Writeback**: Governance policy evaluation results can be written back to SharePoint property bags. Property bag keys are automatically added to `vti_indexedpropertykeys` (Base64 UTF-16LE encoded, pipe-delimited) so they become crawled properties for SharePoint search.
- **What-If Scenario Planner**: Simulate policy rule changes against all workspaces before applying, with diff view showing newly passing/failing workspaces.
- **Sync-Safe Governance Fields**: Preserves locally-set governance fields during full tenant sync to prevent overwriting by stale usage reports.
- **Key Design Decisions**: SharePoint sites are the primary managed workspaces, with automated `DEAL-` and `PORTCO-` prefixes for naming. Enforces "Highly Confidential" sensitivity labels. Tracks site owners by merging Graph group owners and SharePoint site collection admins. Auto-evaluates Copilot readiness after sync. Detects Hub site hierarchy.
- **System Design Choices**: Custom field definitions are tenant-owned. Document libraries are tracked as first-class inventory entities with a three-tier sync strategy. The database schema includes core tables for workspaces, policies, users, and organizations. A multi-policy engine evaluates workspaces against customizable governance policies. All significant actions are logged for audit. Comprehensive RESTful APIs are provided.
- **CSV Export/Import**: Tenant-level workspace export to CSV includes all inventory fields plus custom fields (prefixed `CF:`). Import matches on Site URL and supports updating Zenith-editable fields (Department, Cost Center, Project Code, Stewards, Project Type, Sensitivity, Description) and custom fields. Import uses a dry-run preview step before applying changes.
- **Document Library Detail View**: Clicking a library row in the Document Libraries page opens a slide-over panel showing Content Types, Custom Columns, Syntex/AI models, and All Columns fetched live from Graph API (`/sites/{id}/lists/{id}/contentTypes` and `/columns`).

## External Dependencies
- **Microsoft 365 / SharePoint**: Core platform for M365 governance.
- **Microsoft Entra ID**: For SSO authentication and identity management.
- **PostgreSQL**: Primary application database.
- **Neon**: Managed PostgreSQL service.
- **Microsoft Graph API**: For interacting with Microsoft 365 services, requiring specific application and delegated permissions. Notably, retention labels and sensitivity label updates for M365 Groups require delegated user tokens. All SharePoint operations currently use delegated user tokens.
- **connect-pg-simple**: PostgreSQL session store.
- **bcryptjs**: For password hashing.
- **MSAL-node**: Microsoft Authentication Library for Node.js, handling PKCE authorization code flow.