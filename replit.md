# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is an MVP Microsoft 365 governance platform designed for The Synozur Alliance. Its primary purpose is to provide governed SharePoint site provisioning with integrated Deal and Portfolio Company context. It offers capabilities for tracking site inventory, enforcing sensitivity labels, and explaining Copilot eligibility. The platform supports management of various SharePoint site types (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE), including optional Microsoft Teams connectivity. Zenith aims to enhance M365 governance, improve security posture, and optimize operational efficiency across multiple M365 tenants, leveraging a shared UI/UX and multitenant architecture consistent with other Synozur applications.

## User Preferences
I prefer clear and direct communication. When making changes, please explain the reasoning and impact before proceeding. I value iterative development and would like to be involved in key decision points. Do not make changes to the `shared/schema.ts` file without explicit approval. Always keep the Entra App Registration permissions documented in this file.

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
- **Feature Toggle and Data Purge**: Per-tenant opt-in feature toggles for various data-gathering modules (e.g., OneDrive, Recordings, Teams, Telemetry, SPE), with options for data purging and in-memory cancellation of discovery processes.
- **Traffic Analytics**: Tracks anonymous page views for public and login pages, providing aggregated usage statistics for platform owners.
- **Support Ticket System**: In-app help desk with org-scoped support tickets, threaded replies (internal notes supported), and status management.
- **System Design Choices**: Custom field definitions are tenant-owned. Document libraries are first-class inventory entities. A multi-policy engine evaluates workspaces. All significant actions are logged. Comprehensive RESTful APIs are provided.
- **CSV Export/Import**: Allows exporting workspace data to CSV (including custom fields) and importing updates for editable fields based on Site URL.
- **Document Library Detail View**: Provides detailed views of content types, custom columns, and Syntex/AI models for document libraries, fetched live from Graph API.

## External Dependencies
- **Microsoft 365 / SharePoint**: Core platform for M365 governance.
- **Microsoft Entra ID**: For SSO authentication and identity management.
- **PostgreSQL**: Primary application database.
- **Neon**: Managed PostgreSQL service.
- **Microsoft Graph API**: Used for interacting with Microsoft 365 services, including SharePoint, requiring specific application and delegated permissions.
- **connect-pg-simple**: PostgreSQL session store.
- **bcryptjs**: For password hashing.
- **MSAL-node**: Microsoft Authentication Library for Node.js, handling PKCE authorization code flow.