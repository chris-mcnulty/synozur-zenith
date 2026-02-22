# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is an MVP Microsoft 365 governance platform designed for The Synozur Alliance. Its primary purpose is to provide governed SharePoint site provisioning, incorporating Deal and Portfolio Company context. Key capabilities include site inventory tracking, sensitivity label enforcement, and explainability for Copilot eligibility. All managed workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Microsoft Teams connectivity. The business vision is to streamline M365 governance, enhance security, and improve operational efficiency for organizations managing multiple M365 tenants.

## User Preferences
I prefer clear and direct communication. When making changes, please explain the reasoning and impact before proceeding. I value iterative development and would like to be involved in key decision points. Do not make changes to the `shared/schema.ts` file without explicit approval.

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

## External Dependencies
- **Microsoft 365 / SharePoint**: Core platform for workspace management and governance.
- **Microsoft Entra ID (formerly Azure Active Directory)**: Used for Single Sign-On (SSO) authentication and identity management.
- **PostgreSQL**: Primary database for storing application data, including user information, workspace inventory, and audit logs.
- **Neon**: Managed PostgreSQL service.
- **Microsoft Graph API**: Utilized for interacting with Microsoft 365 services, such as reading site information (`Sites.Read.All`), group details (`Group.Read.All`), and directory information (`Directory.Read.All`).
- **connect-pg-simple**: PostgreSQL-backed session store.
- **bcryptjs**: Used for password hashing.
- **MSAL-node**: Microsoft Authentication Library for Node.js, used for handling PKCE authorization code flow for SSO.