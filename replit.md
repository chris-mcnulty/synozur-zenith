# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is an MVP Microsoft 365 governance platform designed for The Synozur Alliance. Its primary purpose is to provide governed SharePoint site provisioning, incorporating Deal and Portfolio Company context. Key capabilities include site inventory tracking, sensitivity label enforcement, and explainability for Copilot eligibility. All managed workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Microsoft Teams connectivity. The business vision is to streamline M365 governance, enhance security, and improve operational efficiency for organizations managing multiple M365 tenants. Zenith is part of the Synozur application portfolio, sharing common UI/UX and multitenant architecture patterns with sibling apps like Constellation and Orbit.

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
- **Multi-Tenancy**: Primary multi-tenancy is at the Organization level, allowing organizations to connect multiple M365 tenants.
- **Security Model**: Zenith acts as the system of authorization, while Entra ID handles authentication. It employs four layers of separation: Microsoft Entra ID (authentication), Zenith Control Plane (authorization), Zenith Data Plane (inventory), and Zenith RBAC (permissions). A single multi-tenant Entra app registration is used.
- **Tenant Ownership**: Each M365 tenant has exactly one owning Zenith organization with defined ownership types (MSP, Customer, Hybrid).
- **RBAC**: Robust Role-Based Access Control system (Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, Read-Only Auditor) with visibility-scoped access.
- **Service Plan Gating**: Features are gated by service plans (TRIAL, STANDARD, PROFESSIONAL, ENTERPRISE), enforced server-side and client-side.

### Key Design Decisions
- All managed workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Teams connectivity.
- Automated `DEAL-` and `PORTCO-` prefixes for site naming conventions.
- Enforcement of "Highly Confidential" sensitivity labels to block external sharing and Copilot indexing by default.
- Requirement of dual ownership (Primary Steward + Secondary Owner) for workspaces to prevent orphaned sites.
- Clear display of Copilot eligibility criteria.
- Hub site hierarchy detection via SharePoint REST API (`SP.HubSites` + per-site `IsHubSite`/`HubSiteId`), supporting nested hubs.

### System Design Choices
- **Database Schema**: Core tables include `workspaces`, `provisioning_requests`, `governance_policies`, `copilot_rules`, `tenant_connections`, `organizations`, `users`, `graph_tokens`, and `audit_log`.
- **Multi-Policy Engine**: Organization-scoped `governance_policies` define composable rule sets (e.g., Copilot Readiness). Each policy contains a JSON array of rule definitions with built-in types: `SENSITIVITY_LABEL_REQUIRED`, `DEPARTMENT_REQUIRED`, `DUAL_OWNERSHIP`, `METADATA_COMPLETE`, `SHARING_POLICY`, `PROPERTY_BAG_CHECK`, `ATTESTATION` (future). Server-side evaluation engine in `server/services/policy-engine.ts` evaluates workspaces against policies and stores results in `copilot_rules`. Policies are organization-owned data.
- **Audit Trail**: All significant actions are logged with details on WHO, WHAT, WHERE, WHEN, and RESULT, stored in PostgreSQL for auditing and compliance.
- **API Endpoints**: Comprehensive RESTful APIs for managing workspaces, provisioning requests, tenant connections, user authentication, and organization settings.

## External Dependencies
- **Microsoft 365 / SharePoint**: Core platform for workspace management and governance.
- **Microsoft Entra ID (formerly Azure Active Directory)**: For Single Sign-On (SSO) authentication and identity management.
- **PostgreSQL**: Primary database for storing application data.
- **Neon**: Managed PostgreSQL service.
- **Microsoft Graph API**: Utilized for interacting with Microsoft 365 services, requiring specific application and delegated permissions (e.g., `Sites.Read.All`, `Sites.FullControl.All`, `Group.Read.All`, `Group.ReadWrite.All`, `Directory.Read.All`, `Reports.Read.All`, `InformationProtectionPolicy.Read.All`, `RecordsManagement.Read.All`, `openid`, `profile`, `email`, `User.Read`, `offline_access`). **Note**: The retention labels API (`/security/labels/retentionLabels`) does NOT support app-only tokens — this is a known Microsoft limitation. Zenith uses delegated (SSO user) tokens with refresh token support for this endpoint. **Note**: `Group.ReadWrite.All` is required as BOTH application permission (for reading group data) AND delegated permission (for sensitivity label write-back on M365 Group-connected sites). Microsoft explicitly does NOT support app-only tokens for updating `assignedLabels` on groups — only delegated user tokens work. Zenith uses app token to resolve group ID, then delegated token to apply/remove labels. For non-group sites (communication sites, etc.), Zenith uses SharePoint CSOM via ProcessQuery to set `Site.SensitivityLabelId` with an SPO app-only token — this works for ALL site types. Users must re-authenticate via SSO after adding `Group.ReadWrite.All` delegated scope to pick up the new permission. **Note**: `Sites.FullControl.All` (application permission) is required for hub site operations (JoinHubSite / UnJoinHubSite via SharePoint REST API). Without this permission, hub assignment changes are saved to Zenith's inventory but not applied to SharePoint.
- **connect-pg-simple**: PostgreSQL-backed session store.
- **bcryptjs**: Used for password hashing.
- **MSAL-node**: Microsoft Authentication Library for Node.js, used for handling PKCE authorization code flow for SSO.