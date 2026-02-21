# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is a Microsoft 365 governance platform MVP built for The Synozur Alliance (Platinum Equity). It focuses on governed SharePoint site provisioning with Deal and Portfolio Company context, site inventory tracking, sensitivity label enforcement, and Copilot eligibility explainability. All workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Microsoft Teams connectivity.

## Architecture
- **Frontend**: React + Vite + TanStack Query + shadcn/ui + wouter routing
- **Backend**: Express.js + Drizzle ORM + PostgreSQL (Neon)
- **Database**: PostgreSQL with tables: workspaces, provisioning_requests, copilot_rules, tenant_connections, organizations
- **Auth**: Microsoft Entra ID (SSO) + Zenith-managed RBAC (planned)

## Synozur Product Suite
- **Zenith** — Microsoft 365 governance platform (this project)
- **Vega** — Strategy and OKR app. Code at: https://github.com/chris-mcnulty/synozur-vega

## Organizations & Tenants
- **Organization 1**: "The Synozur Alliance" — parent org, ENTERPRISE (unlimited) plan
- **Organization 2**: "Contoso" — demo/sample org, TRIAL (free) plan
- **Tenant 1**: Fabrikam (fabrikam.onmicrosoft.com) — DEMO, MSP ownership, no real M365 behind it
- **Tenant 2**: Cascadia Oceanic (cascadiaoceanic.onmicrosoft.com) — DEMO, Hybrid ownership, no real M365 behind it

## Security Architecture (Confirmed Design)

### Core Principle
"Zenith is the system of authorization; Entra is only the system of authentication."
Entra answers WHO you are. Zenith answers WHETHER you're allowed.

### Four Separation Layers
1. **Microsoft Entra ID** — Authentication, token issuance only
2. **Zenith Control Plane** — Authorization, ownership, visibility
3. **Zenith Data Plane** — Inventory, governance data
4. **Zenith RBAC** — Who can see/do what

### Entra App Design
- Single multi-tenant Entra app registration
- Admin consent required per tenant
- Application permissions (not delegated) for inventory: Sites.Read.All, Group.Read.All, Directory.Read.All
- Possessing Graph permissions does NOT grant Zenith operational access

### Tenant Ownership Model
- Each tenant has exactly ONE owning Zenith organization (exclusive)
- ownershipType: MSP | Customer | Hybrid
  - MSP: Synozur owns and operates
  - Customer: Customer owns and operates themselves
  - Hybrid: Customer owns, MSP has delegated operator access (NOT shared ownership)
- No auto-registration. Tenant must be explicitly claimed.
- Ownership changes require explicit admin approval + audit record

### Tenant Registration Flow
1. Zenith Platform Admin initiates "Connect New Tenant"
2. Redirect to target tenant's Entra admin consent
3. Target tenant's Global Admin approves consent
4. Initiating user claims ownership for their Zenith org
5. RBAC begins for that tenant

### Operator Allowlisting (MSP Safety)
- Operators are per-tenant-per-operator role assignments
- Same MSP operator gets different roles on different tenants
- Even valid Entra tokens are rejected if operator isn't explicitly allowlisted
- Synozur Alliance is typically the sole MSP operator

### Organization-Scoped Data Isolation
- Each org gets their own separate Zenith experience
- Cascadia sees their own inventory/dashboards when they log in
- When Synozur operates on Cascadia's tenant as MSP, they see through operator lens only
- Data is never mixed between orgs

### Zenith RBAC Roles
- Platform Owner — Zenith superadmin, full access + config
- Tenant Admin — Full inventory, tenant connection management
- Governance Admin — Governance within their visibility scope only
- Operator — Submit requests, update metadata within scope
- Viewer — Read-only within scope
- Read-Only Auditor — Audit trail access

### Visibility-Scoped Access (Zero Existence Leakage)
- Master inventory stored centrally but NEVER directly exposed to all users
- Every query filters by: authorized tenants + permitted scopes + object relationships
- Object relationship types: Owner/Steward, Member, Tenant-wide admin
- Provisioning requesters can see their pending sites
- If user is unauthorized: object doesn't appear, isn't counted, isn't searchable
- Dashboard stats are user-scoped (user sees "800 sites" not "1000 sites")
- Only Tenant Admin / Platform Owner see full master inventory

### Tenant Context
- Explicit tenant switching required (no combined cross-tenant views)
- Cross-tenant alerts dashboard may come later (future feature)

### Token Failure Handling
- On Graph token failure: flag data as stale with warning, don't dump inventory
- Show "Last synced X ago — consent may need renewal"
- Avoid destructive re-sync on transient failures

### Audit Trail
- Every decision logged: WHO, WHAT, WHERE, WHEN, RESULT
- Retention: 1 year default, 7 years enterprise, unlimited for unlimited tier
- Stored in PostgreSQL for MVP, append-only
- Supports SEC inquiries, PE governance, incident response

### Threat Model Outcomes
- Unauthorized MSP attempts to attach → Denied
- Valid token but wrong org → Denied
- App consented but tenant unclaimed → Denied
- Inventory exists but user unauthorized → Object invisible
- Ownership transfer without approval → Impossible

## Key Design Decisions
- All workspaces are SharePoint sites with optional Teams connectivity (teamsConnected boolean)
- Site templates: TEAM_SITE, COMMUNICATION_SITE, HUB_SITE
- Deal/PortCo naming conventions (DEAL-, PORTCO- prefixes applied automatically)
- Highly Confidential sensitivity blocks external sharing and Copilot indexing by default
- Required dual ownership (Primary Steward + Secondary Owner) to prevent orphaned workspaces
- Copilot eligibility displayed with clear pass/fail criteria
- "Discover & Migrate" marked as Enterprise+ feature

## Service Plan Feature Gating
- Plans: TRIAL, STANDARD, PROFESSIONAL, ENTERPRISE (defined in shared/schema.ts PLAN_FEATURES)
- TRIAL/Free: Read-only. No M365 write-back. Inventory sync and governance views only.
- STANDARD+: M365 write-back enabled (provisioning, site creation, config changes)
- PROFESSIONAL+: Copilot readiness, lifecycle automation, self-service portal
- ENTERPRISE: All features + advanced reporting + unlimited retention
- Backend enforcement: requireFeature middleware in server/services/feature-gate.ts
- Frontend: useServicePlan hook + UpgradeGate component for conditional rendering
- Organization record stored in `organizations` table with servicePlan field
- Plan can be changed via PATCH /api/organization/plan

## Project Structure
- `shared/schema.ts` - Drizzle schema definitions for workspaces, provisioning_requests, copilot_rules, tenant_connections, organizations + PLAN_FEATURES
- `server/db.ts` - Database connection (pg + drizzle)
- `server/storage.ts` - DatabaseStorage class implementing IStorage interface
- `server/routes.ts` - API routes (/api/workspaces, /api/provisioning-requests, /api/stats, etc.)
- `server/services/graph.ts` - Microsoft Graph API client (token acquisition, site inventory)
- `server/services/feature-gate.ts` - Service plan feature gating middleware
- `server/seed.ts` - Database seeding script with 12 realistic workspaces
- `client/src/pages/app/` - All app pages (dashboard, governance, provision-new, workspace-details, etc.)
- `client/src/components/layout/app-shell.tsx` - Main layout shell
- `client/src/components/upgrade-gate.tsx` - UpgradeGate, UpgradeBadge, WriteBackGate components
- `client/src/hooks/use-service-plan.ts` - Hook for plan status and feature checks

## API Endpoints
- GET/POST /api/workspaces - List/create workspaces (search via ?search=)
- GET/PATCH/DELETE /api/workspaces/:id - Single workspace CRUD
- PATCH /api/workspaces/bulk/update - Bulk update workspaces
- GET/POST /api/provisioning-requests - List/create provisioning requests
- PATCH /api/provisioning-requests/:id/status - Update request status (PROVISIONED gated by m365WriteBack)
- GET/PUT /api/workspaces/:id/copilot-rules - Copilot eligibility rules
- GET /api/stats - Dashboard statistics
- GET /api/organization - Current org with plan features
- PATCH /api/organization/plan - Change plan tier
- GET /api/feature-check/:feature - Check if specific feature is enabled
- GET/POST /api/admin/tenants - Tenant connection CRUD
- POST /api/admin/tenants/test - Test tenant connection
- POST /api/admin/tenants/:id/sync - Sync SharePoint site inventory

## Recent Changes
- 2026-02-21: Added service plan feature gating — TRIAL plan blocks M365 write-back, enforced server-side + frontend upgrade prompts
- 2026-02-21: Added organizations table, useServicePlan hook, UpgradeGate component, dynamic service plans page
- 2026-02-21: Confirmed security design — multi-tenant, MSP-safe, zero existence leakage architecture
- 2026-02-21: Rebuilt Document Library page as governance tool for library structures, columns, versioning
- 2026-02-21: Flattened routing structure to fix wouter v3 nested Switch 404 issue
- 2026-02-21: Built comprehensive workspace details/properties page with edit mode, metadata editing, property bag view, lifecycle timeline
- 2026-02-21: Updated all org references to "The Synozur Alliance", tenants to synozur.onmicrosoft.com + cascadiaoceanic.onmicrosoft.com
- 2026-02-21: Refactored workspace types to SharePoint site templates (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with teamsConnected flag
- 2026-02-21: Converted from mockup to full-stack app with PostgreSQL
- 2026-02-21: Implemented complete backend (schema, storage, routes)
- 2026-02-21: Wired all frontend pages to real API endpoints
- 2026-02-21: Seeded 12 demo workspaces + 4 provisioning requests + copilot rules
