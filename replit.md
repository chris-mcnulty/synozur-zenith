# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is an MVP Microsoft 365 governance platform designed for The Synozur Alliance. Its primary purpose is to provide governed SharePoint site provisioning, incorporating Deal and Portfolio Company context. Key capabilities include site inventory tracking, sensitivity label enforcement, and explainability for Copilot eligibility. All managed workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Microsoft Teams connectivity. The business vision is to streamline M365 governance, enhance security, and improve operational efficiency for organizations managing multiple M365 tenants.

## User Preferences
I prefer clear and direct communication. When making changes, please explain the reasoning and impact before proceeding. I value iterative development and would like to be involved in key decision points. Do not make changes to the `shared/schema.ts` file without explicit approval. Always keep the Entra App Registration permissions documented in this file — this is a permanent rule so the app can be maintained alongside the codebase.

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

## External Dependencies
- **Microsoft 365 / SharePoint**: Core platform for workspace management and governance.
- **Microsoft Entra ID (formerly Azure Active Directory)**: Used for Single Sign-On (SSO) authentication and identity management.
- **PostgreSQL**: Primary database for storing application data, including user information, workspace inventory, and audit logs.
- **Neon**: Managed PostgreSQL service.
- **Microsoft Graph API**: Utilized for interacting with Microsoft 365 services. See the "Entra App Registration — Required Permissions" section above for the full list of required permissions.
- **connect-pg-simple**: PostgreSQL-backed session store.
- **bcryptjs**: Used for password hashing.
- **MSAL-node**: Microsoft Authentication Library for Node.js, used for handling PKCE authorization code flow for SSO.