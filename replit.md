# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is an MVP Microsoft 365 governance platform designed for The Synozur Alliance. Its primary purpose is to provide governed SharePoint site provisioning, incorporating Deal and Portfolio Company context. Key capabilities include site inventory tracking, sensitivity label enforcement, and explainability for Copilot eligibility. All managed workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Microsoft Teams connectivity. The business vision is to streamline M365 governance, enhance security, and improve operational efficiency for organizations managing multiple M365 tenants. Zenith is part of the Synozur application portfolio, sharing common UI/UX and multitenant architecture patterns.

## User Preferences
I prefer clear and direct communication. When making changes, please explain the reasoning and impact before proceeding. I value iterative development and would like to be involved in key decision points. Do not make changes to the `shared/schema.ts` file without explicit approval. Always keep the Entra App Registration permissions documented in this file — this is a permanent rule so the app can be maintained alongside the codebase.

### Permanent Rule: Data Ownership Scoping
Every time a new property, table, or data object is added, verify its ownership scope:
- **Tenant-owned**: Data intrinsic to the M365 tenant itself (e.g., departments, sensitivity labels, Purview policies). Scoped by M365 `tenantId`.
- **Organization-owned**: Data specific to a Zenith organization's governance decisions (e.g., provisioning templates, RBAC roles, service plan settings). Scoped by `organizationId`.
- **Application-owned**: Data controlled by the Zenith platform itself (e.g., system defaults, feature flags, plan definitions).

## System Architecture

### UI/UX Decisions
The frontend is built with React, Vite, TanStack Query, shadcn/ui for components, and wouter for routing, aiming for a modern and responsive user experience consistent with the Synozur portfolio's shared design language.

### Technical Implementations
- **Frontend**: React + Vite + TanStack Query + shadcn/ui + wouter
- **Backend**: Express.js + Drizzle ORM
- **Database**: PostgreSQL
- **Authentication**: Microsoft Entra ID (SSO) with Zenith-managed RBAC. Dual authentication with email/password login is also supported. Tokens are encrypted at rest using AES-256-GCM.
- **Multi-Tenancy**: Primary multi-tenancy is at the Organization level, allowing organizations to connect multiple M365 tenants. Users can belong to multiple organizations, each with a distinct role. `activeOrganizationId` in the session determines the current org context.
- **Security Model**: Zenith acts as the system of authorization, while Entra ID handles authentication. It employs four layers of separation: Microsoft Entra ID (authentication), Zenith Control Plane (authorization), Zenith Data Plane (inventory), and Zenith RBAC (permissions). A single multi-tenant Entra app registration is used.
- **Tenant Ownership**: Each M365 tenant has exactly one owning Zenith organization with defined ownership types (MSP, Customer, Hybrid).
- **RBAC**: Robust Role-Based Access Control system (Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, Read-Only Auditor) with visibility-scoped access. Write operations (label push, property bag writeback, hub assignment, metadata writeback, copilot rules) are gated by Zenith RBAC middleware. Provisioning requests require Operator or higher; provisioning approval and tenant sync require Tenant Admin or higher. Read operations (inventory sync) are best-effort with the current user's delegated token.
- **Service Plan Gating**: Features are gated by service plans (TRIAL, STANDARD, PROFESSIONAL, ENTERPRISE), enforced server-side and client-side.
- **Hash-Based Writeback Dirty Checking**: Utilizes `spoSyncHash` (SHA-256 of SharePoint state) and `localHash` (SHA-256 of Zenith state) to determine if a workspace needs writeback. Bulk writeback processes only dirty workspaces efficiently.
- **Policy status writeback**: Governance policies can write evaluation results to SharePoint property bags during metadata writeback, configurable via Policy Builder UI.
- **Sync-safe governance fields**: Zenith preserves locally-set governance fields during full tenant sync if incoming sync values are empty, preventing data loss from stale reports.

### Key Design Decisions
- All managed workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Teams connectivity.
- Automated `DEAL-` and `PORTCO-` prefixes for site naming conventions.
- Enforcement of "Highly Confidential" sensitivity labels to block external sharing and Copilot indexing by default.
- Ownership tracked as `siteOwners` jsonb array on each workspace, sourced from SharePoint, requiring dual ownership by governance policy. Owners are a merge of Graph group owners and SharePoint site collection admins.
- Post-sync auto-evaluation of `COPILOT_READINESS` governance policy for all workspaces.
- Clear display of Copilot eligibility criteria.
- Hub site hierarchy detection via SharePoint REST API.

### System Design Choices
- **Custom Field Definitions**: Tenant-owned `custom_field_definitions` table allows admins to define additional inventory fields with various types and options, stored in `customFields` jsonb on `workspaces`.
- **Document Libraries**: Tenant-owned `document_libraries` table stores per-workspace library inventory, including display name, item count, storage, and sensitivity label. Synced via Graph API.
- **Database Schema**: Core tables include `workspaces`, `provisioning_requests`, `governance_policies`, `copilot_rules`, `tenant_connections`, `organizations`, `organization_users`, `users`, `graph_tokens`, `audit_log`, `custom_field_definitions`, and `document_libraries`.
- **Multi-Policy Engine**: Organization-scoped `governance_policies` define composable rule sets (e.g., Copilot Readiness) using a JSON array of rule definitions. Server-side evaluation engine assesses workspaces against policies.
- **Audit Trail**: All significant actions are logged for auditing and compliance.
- **API Endpoints**: Comprehensive RESTful APIs for managing various system entities.

## External Dependencies
- **Microsoft 365 / SharePoint**: Core platform for workspace management and governance.
- **Microsoft Entra ID (formerly Azure Active Directory)**: For Single Sign-On (SSO) authentication and identity management.
- **PostgreSQL**: Primary database for storing application data.
- **Neon**: Managed PostgreSQL service.
- **Microsoft Graph API**: Utilized for interacting with Microsoft 365 services, requiring specific application and delegated permissions (e.g., `Sites.Read.All`, `Sites.FullControl.All`, `Group.Read.All`, `Group.ReadWrite.All`, `Directory.Read.All`, `Reports.Read.All`, `InformationProtectionPolicy.Read.All`, `RecordsManagement.Read.All`, `openid`, `profile`, `email`, `User.Read`, `offline_access`). Note: Retention labels API and M365 Group `assignedLabels` updates require delegated tokens. SharePoint CSOM operations also use delegated user tokens due to tenant restrictions.
- **connect-pg-simple**: PostgreSQL-backed session store.
- **bcryptjs**: Used for password hashing.
- **MSAL-node**: Microsoft Authentication Library for Node.js, used for handling PKCE authorization code flow for SSO.