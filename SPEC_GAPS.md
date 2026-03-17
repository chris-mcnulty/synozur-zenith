# Spec Gap Analysis: Zenith M365 Governance Platform

> Generated: 2026-03-17
> Branch: claude/identify-spec-gaps-VUr2c
> Source spec: `replit.md`

## Overview

The specification (`replit.md`) describes Zenith as an MVP Microsoft 365 governance platform with governed SharePoint provisioning, sensitivity label enforcement, Copilot eligibility explainability, multi-tenant RBAC, and service plan gating enforced both server-side and client-side. The analysis below identifies all gaps between that specification and the current implementation, ranked by severity.

---

## P0 — Critical Security Gaps (Production Blockers)

### 1. RBAC Middleware Defined But Not Applied to Any Route

**Spec**: "Zenith acts as the system of authorization… Zenith RBAC (permissions)… access is visibility-scoped, ensuring zero existence leakage."
**Reality**: `server/middleware/rbac.ts` defines `requireAuth()`, `requireRole()`, and `requirePermission()` middleware, but none are applied in `server/routes.ts`. Every API endpoint is completely unprotected — unauthenticated requests are served normally.
**Affected files**: `server/routes.ts`, `server/middleware/rbac.ts`

### 2. No Multi-Tenant Data Isolation on Workspaces and Provisioning Requests

**Spec**: "Primary multi-tenancy is at the Organization level, providing isolated Zenith experiences… zero existence leakage where users only see data relevant to their authorized tenants."
**Reality**: `GET /api/workspaces`, `GET /api/provisioning-requests`, and all related CRUD endpoints have zero `organizationId` filtering. Any user (even unauthenticated, per gap #1) can read and mutate workspaces belonging to any organization.
**Affected files**: `server/routes.ts` (workspace and provisioning handlers), `server/storage.ts`

### 3. Tenant Connection Client Secrets Stored in Plaintext

**Spec**: "Tokens are encrypted at rest using AES-256-GCM."
**Reality**: `tenantConnections.clientSecret` is written to the database in plaintext. The AES-256-GCM utility in `server/utils/encryption.ts` exists and is used for user-level graph tokens, but is not applied to credential storage for tenant connections.
**Affected files**: `server/routes.ts` (tenant connection POST/PATCH), `server/utils/encryption.ts`

---

## P1 — Core Functionality Missing

### 4. Provisioning Never Calls the Graph API (No Actual Write-Back)

**Spec**: "Governed SharePoint site provisioning" as the primary capability; `m365WriteBack` feature flag implies real site creation.
**Reality**: `PATCH /api/provisioning-requests/:id/status` updates a database record to `PROVISIONED` but makes no Microsoft Graph API call to create a SharePoint site. `server/services/graph.ts` only implements read operations (`fetchSharePointSites`). The `m365WriteBack` feature gate is checked, but no write path exists behind it.
**Affected files**: `server/routes.ts` (provisioning status PATCH), `server/services/graph.ts`

### 5. Service Plan Feature Gating Not Enforced Server-Side

**Spec**: "Service Plan Gating: Features are gated by service plans… enforced both server-side and client-side."
**Reality**: `server/services/feature-gate.ts` defines a `requireFeature()` middleware, but it is applied on only one endpoint. Features `copilotReadiness`, `lifecycleAutomation`, `selfServicePortal`, and `advancedReporting` have client-side gates only — bypassing the UI entirely circumvents all restrictions.
**Affected files**: `server/routes.ts`, `server/services/feature-gate.ts`

### 6. Audit Log Captures Only Auth Events; No API Endpoint to Read It

**Spec**: "All significant actions are logged with details on WHO, WHAT, WHERE, WHEN, and RESULT, stored in PostgreSQL for auditing and compliance."
**Reality**: The `auditLog` table has the correct schema. However: (a) only `USER_SIGNUP`, `USER_LOGIN`, `PASSWORD_RESET_REQUESTED`, and `PASSWORD_RESET_COMPLETED` are ever written — no workspace, provisioning, tenant, or governance events; (b) no `GET /api/audit-log` endpoint exists; (c) no frontend page surfaces audit data. `storage.getAuditLog()` is defined but never called from routes.
**Affected files**: `server/routes-auth.ts`, `server/storage.ts`, `server/routes.ts`

### 7. Dual Ownership Not Enforced on Workspace Creation or Update

**Spec**: "Requirement of dual ownership (Primary Steward + Secondary Owner) for workspaces to prevent orphaned sites."
**Reality**: `workspaces.primarySteward` and `secondarySteward` fields exist in the schema and the provisioning form collects them, but the server performs no validation that both fields are populated. Workspaces can be saved without either steward.
**Affected files**: `server/routes.ts` (workspace POST/PATCH validation), `shared/schema.ts`

---

## P2 — Feature Gaps Against Spec Promises

### 8. No User Management API (List, Create, Update Roles, Delete)

**Spec**: Six named roles (Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, Read-Only Auditor) managed within Zenith RBAC.
**Reality**: No API endpoints exist to list users, create users, change roles, or deactivate accounts. The `/app/admin/users` frontend page renders static mock data arrays. Role assignment after initial registration is impossible.
**Affected files**: `server/routes.ts` (missing user management routes), `client/src/pages/app/users.tsx`

### 9. Sensitivity Label Rules Not Validated Server-Side

**Spec**: "Enforcement of 'Highly Confidential' sensitivity labels to block external sharing and Copilot indexing by default."
**Reality**: The frontend displays external-sharing and Copilot-exclusion implications per sensitivity tier, but the backend accepts any `externalSharing` / `copilotReady` combination regardless of the `sensitivity` value set. A `PATCH /api/workspaces/:id` with `{ sensitivity: "HIGHLY_CONFIDENTIAL", externalSharing: true }` succeeds without error.
**Affected files**: `server/routes.ts` (workspace PATCH validation)

### 10. Purview Integration Is a UI Mockup

**Spec**: Sensitivity label enforcement and Purview integration implied by the four-tier label model and external sharing controls.
**Reality**: The `/app/purview` page shows Zenith→Purview label mappings and an "Adaptive DLP Scopes" tab, but all data is hardcoded and the "Force Sync to Purview" button performs no API call. No backend Purview integration exists.
**Affected files**: `client/src/pages/app/purview.tsx`

### 11. Email Delivery Not Implemented (Verification and Password Reset Non-Functional)

**Spec**: "Dual authentication with email/password login is also supported."
**Reality**: Email verification tokens and password reset tokens are generated and persisted in the database, but there is no email-sending service. Tokens can never be delivered, making both flows non-functional for real users.
**Affected files**: `server/routes-auth.ts` (verify-email, request-password-reset handlers)

---

## P3 — Secondary / Enhancement Gaps

### 12. AI Copilot Page Is a Static Mockup

**Spec**: Copilot eligibility and explainability is a key platform capability.
**Reality**: `/app/ai-copilot` contains hardcoded chat history simulating governance policy explanations. No backend AI service integration exists.
**Affected files**: `client/src/pages/app/ai-copilot.tsx`

### 13. Policy Builder Page Is Not Implemented

**Spec**: Policy-based governance control implied by the RBAC and sensitivity enforcement model.
**Reality**: The route `/app/admin/policies` appears in the nav (marked "Ent+") but the page has no implementation beyond a placeholder.
**Affected files**: `client/src/pages/app/` (policies page)

### 14. Frontend Route Guards Missing

**Spec**: Role-based visibility scoping for all UI surfaces.
**Reality**: All frontend routes are accessible to any logged-in user regardless of role. No auth hook or route guard enforces role-based page access. Admin pages (user management, system admin, org settings) are visible to `VIEWER` and `AUDITOR` roles.
**Affected files**: `client/src/App.tsx`, `client/src/components/layout/app-shell.tsx`

### 15. Graph API App-Token Cache Is Non-Persistent (In-Memory)

**Spec**: Reliable M365 connectivity for multi-tenant governance operations.
**Reality**: `server/services/graph.ts` caches app-only tokens in a JavaScript `Map`. The cache is lost on every server restart, causing unnecessary re-authentication on cold starts.
**Affected files**: `server/services/graph.ts`

### 16. No Refresh Logic for User-Delegated Graph Tokens

**Spec**: Persistent M365 connectivity via stored tokens.
**Reality**: The `graphTokens` table stores `refreshToken` and `expiresAt`, but no code path exists to refresh an expired user-delegated token. Once a token expires it is silently stale.
**Affected files**: `server/routes-entra.ts`, `server/services/graph.ts`

### 17. No Rate Limiting or CORS Configuration

**Spec**: Production-grade security platform.
**Reality**: No rate limiting middleware and no explicit CORS configuration are present in `server/index.ts`.
**Affected files**: `server/index.ts`

---

## Summary Table

| # | Gap | Priority | Domain |
|---|-----|----------|--------|
| 1 | RBAC middleware not applied to any route | P0 | Security |
| 2 | No org-level data isolation on workspaces / provisioning | P0 | Security |
| 3 | Client secrets stored in plaintext | P0 | Security |
| 4 | Provisioning never calls Graph API (no write-back) | P1 | Core Feature |
| 5 | Feature gating enforced client-side only | P1 | Core Feature |
| 6 | Audit log incomplete + no read endpoint | P1 | Core Feature |
| 7 | Dual ownership not enforced server-side | P1 | Core Feature |
| 8 | No user management API | P2 | Feature |
| 9 | Sensitivity label rules not validated server-side | P2 | Feature |
| 10 | Purview integration is mockup only | P2 | Feature |
| 11 | Email delivery not implemented | P2 | Feature |
| 12 | AI Copilot page is static mockup | P3 | Enhancement |
| 13 | Policy Builder page is not implemented | P3 | Enhancement |
| 14 | Frontend route guards missing | P3 | Enhancement |
| 15 | Graph token cache non-persistent | P3 | Enhancement |
| 16 | No Graph token refresh logic | P3 | Enhancement |
| 17 | No rate limiting or CORS config | P3 | Enhancement |

---

## Verification Steps

To reproduce the highest-priority gaps:

1. **Gap #1** — `curl http://localhost:5000/api/workspaces` without any session cookie → expect 401, currently returns data.
2. **Gap #2** — Create two organizations with separate users; log in as org A and call `GET /api/workspaces` → org B workspaces are returned.
3. **Gap #3** — After creating a tenant connection, query `SELECT client_secret FROM tenant_connections` → value is plaintext.
4. **Gap #4** — Approve a provisioning request to `PROVISIONED` → no SharePoint site is created in Microsoft 365.
5. **Gap #9** — `PATCH /api/workspaces/:id` with `{ "sensitivity": "HIGHLY_CONFIDENTIAL", "externalSharing": true }` → server returns 200 with no validation error.
