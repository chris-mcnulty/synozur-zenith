# Zenith Product Backlog

**Microsoft 365 Governance Platform — The Synozur Alliance**

Prioritized backlog of features, enhancements, and technical improvements. Items are organized by priority and status. Items graduate from the backlog to the [Roadmap](/app/support/roadmap) when delivery is committed.

**Last analyzed against specification:** February 2026

---

## Table of Contents

1. [Priority Legend](#priority-legend)
2. [Spec Gap Summary](#spec-gap-summary)
3. [Critical Priority](#critical-priority)
4. [High Priority](#high-priority)
5. [Medium Priority](#medium-priority)
6. [Low Priority](#low-priority)
7. [Technical Debt](#technical-debt)
8. [Completed](#completed)

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| 🔴 Critical | Must-have for specification compliance or blocking other work |
| 🟠 High | Important for near-term delivery |
| 🟡 Medium | Valuable but not urgent |
| 🟢 Low | Nice-to-have, future consideration |
| ✅ Done | Completed and in production |

---

## Spec Gap Summary

Gap analysis performed against the authoritative Zenith Engineering Product Specification. The following areas have incomplete or missing implementation:

| Spec Section | Area | Status | Gap Severity | Backlog |
|-------------|------|--------|-------------|---------|
| 3.1 | Governed Provisioning — no M365 site/group creation | UI + request CRUD only | **High** | BL-005 |
| 3.1 | Governed Provisioning — M365 Groups & Teams | Partial | Medium | BL-005, BL-018 |
| 3.1 | Document Library Management | UI only (mock data) | Medium | BL-015 |
| 3.1 | Content Type Hub & Syndication | UI only (mock data) | Medium | BL-016 |
| 3.1 | Syntex / AI Builder Model Governance | UI only (mock data) | Medium | BL-017 |
| 3.1 | Teams Inventory & Channel Governance | Missing | Medium | BL-018 |
| 3.1 | Archive & Backup Management | UI only (mock data) | Medium | BL-019 |
| 3.1 | SharePoint Embedded Container Governance | UI only (mock data) | Medium | BL-020 |
| 3.1 | Lifecycle Review & Stale Site Detection | UI only (mock data) | High | BL-007 |
| 3.2 | Retention & Lifecycle Classification enforcement | Partial | Medium | BL-012 |
| 3.3 | Copilot Explainability (scoring, remediation, exclusions) | Partial | High | BL-006 |
| 4.2 | Tenant Status Lifecycle (Suspended/Revoked) | Missing | Critical | BL-004 |
| 4.3 | One-Owner Tenant Lock & Ownership Transfer | Missing | Critical | BL-002 |
| 4.4 | Operator Allowlisting | Missing | Critical | BL-003 |
| 4.7 | Comprehensive Audit Trail (governance actions, access denials) | Partial | Critical | BL-001 |
| 4.7 | Audit Log Immutability & Export | Missing | High | BL-008, TD-001 |
| 5 | MGDC Integration (Enterprise tier) | Missing | Low | BL-021 |
| 6 | File Share Analysis Module (Enterprise tier) | Missing | Low | BL-022 |
| 7 | Native M365 Policy Integration (SPO Advanced Mgmt, Teams policies, Entra access models) | Missing | Medium | BL-023 |
| 9 | Job Scheduling & Management System | Design doc exists, no implementation | **High** | BL-009 |
| 10 | Engineering Acceptance Criteria — multi-owner prevention | Not enforced | Critical | BL-002 |
| 10 | Engineering Acceptance Criteria — no polling-based data collection | Needs guardrails | Medium | BL-009 |

---

## Critical Priority

### 🔴 BL-001: Comprehensive Audit Trail
**Status:** Backlog | **Spec Reference:** Section 4.7
**Description:** The spec requires "all privileged actions are logged" with immutable, exportable audit logs. Currently only authentication events (signup, login, password reset) are logged. Governance actions, tenant changes, operator changes, and access denials are not captured.
**Current State:** `audit_log` table exists with correct schema (WHO/WHAT/WHERE/WHEN/RESULT). Only 4 action types logged (USER_SIGNUP, USER_LOGIN, PASSWORD_RESET_REQUESTED, PASSWORD_RESET_COMPLETED).
**Acceptance Criteria:**
- Log all tenant registration and status changes (TENANT_REGISTERED, TENANT_SUSPENDED, TENANT_REVOKED, TENANT_REACTIVATED)
- Log all ownership changes (OWNERSHIP_TRANSFERRED, OWNERSHIP_CLAIMED)
- Log all governance actions (WORKSPACE_PROVISIONED, LABEL_ASSIGNED, METADATA_UPDATED, SHARING_CHANGED, SITE_ARCHIVED)
- Log all operator changes (OPERATOR_ADDED, OPERATOR_REMOVED, OPERATOR_PERMISSIONS_CHANGED)
- Log all access denials (ACCESS_DENIED with target resource, reason, requesting user)
- Log all sync operations (TENANT_SYNC_STARTED, TENANT_SYNC_COMPLETED, TENANT_SYNC_FAILED)
- Log RBAC changes (ROLE_ASSIGNED, ROLE_REVOKED)
- Ensure audit records cannot be deleted via API (no DELETE endpoint for audit_log)
- Audit log viewer UI at `/app/admin/audit-log` with filtering by action type, user, date range, resource
- Audit log export (CSV/JSON) for compliance reporting
- Retention policy enforcement per service plan (30 days Trial, 365 days Standard, 7yr Professional, unlimited Enterprise)

### 🔴 BL-002: One-Owner Tenant Lock & Ownership Transfer
**Status:** Backlog | **Spec Reference:** Section 4.3
**Description:** The spec mandates that a tenant may belong to exactly one Zenith organization. Additional MSPs must be blocked by default. Ownership transfer requires tenant admin approval, an audit record, and explicit reassignment. Currently there is no enforcement preventing a tenant from being claimed by multiple organizations.
**Acceptance Criteria:**
- Enforce unique constraint: a `tenantId` in `tenant_connections` can only be associated with one `organizationId`
- Reject tenant registration attempts where the tenant is already owned by another organization (return clear error: "This tenant is already managed by another organization")
- Ownership transfer workflow: current owner initiates → tenant admin approves → audit record created → new owner assigned
- Transfer request table or status field to track pending transfers
- All ownership changes logged in audit trail (OWNERSHIP_TRANSFERRED action)
- Admin UI showing current ownership status and transfer history

### 🔴 BL-003: Operator Allowlisting
**Status:** Backlog | **Spec Reference:** Section 4.4
**Description:** The spec requires an explicit allowlist of operator organizations. Tokens from non-allowlisted operators must be rejected. This is a core MSP safety mechanism.
**Acceptance Criteria:**
- New `operator_allowlist` table (organizationId, operatorOrgId, operatorTenantId, permittedRoles, status, grantedBy, grantedAt)
- Ownership: Organization-owned — each org defines which external operators can access their tenants
- API token validation checks operator allowlist before granting access
- Non-allowlisted operator tokens rejected with 403
- Admin UI for managing operator allowlist (add/remove operators, set permitted roles)
- Audit log entries for operator allowlist changes
- Platform Owner can view all operator relationships across the platform

### 🔴 BL-004: Tenant Status Lifecycle
**Status:** Backlog | **Spec Reference:** Section 4.2
**Description:** The spec defines four tenant statuses: Pending, Active, Suspended, Revoked. Currently only Pending and Active are implemented. Suspended and Revoked states are missing, along with the transitions between them.
**Acceptance Criteria:**
- Add SUSPENDED and REVOKED to tenant connection status options
- Suspended tenants: data retained but all sync/governance operations blocked, workspaces hidden from non-admin users
- Revoked tenants: tokens invalidated, all governance operations permanently blocked, data retained for audit
- Status transition rules: Pending → Active (on consent), Active → Suspended (admin action), Suspended → Active (admin reactivation), Active/Suspended → Revoked (admin action, irreversible without Platform Owner override)
- Automatic suspension triggers (e.g., consent revoked in Entra, payment lapsed)
- UI indicators on tenant cards showing status with appropriate colors/icons
- All status transitions logged in audit trail
- API enforcement: all tenant-scoped endpoints check status before processing

---

## High Priority

### 🟠 BL-005: Governed Site Provisioning Workflow
**Status:** In Progress | **Target:** Q1 2026 | **Spec Reference:** Section 3.1
**Description:** End-to-end provisioning workflow for creating new collaboration workspaces through governed templates with Deal and Portfolio Company context.
**Current State:** Provisioning request form (`provision-new.tsx`) and approvals queue (`approvals.tsx`) exist with database-backed request CRUD. However, **no actual M365 site/group/team creation exists** — approving a request only changes its status. No `createSite`, `createTeam`, or `createGroup` Graph API calls are implemented anywhere. Sensitivity label assignment is captured as text, not linked to synced Purview label IDs.
**Acceptance Criteria:**
- Provisioning request form with template selection (currently hardcoded, needs template library)
- Approval workflow (request → review → approve → **create in M365**)
- **Graph API site creation** via `POST /sites` (SPO REST) or `POST /groups` (Graph) — requires `Sites.Manage.All` or `Group.ReadWrite.All`
- Automated DEAL- and PORTCO- naming prefix enforcement (client-side exists, needs server-side validation)
- **Sensitivity label assignment during provisioning** — link to synced Purview label ID, assign via Graph API
- **Default sharing posture enforcement at creation time** — currently client-derived, needs server-side enforcement
- Dual ownership requirement (Primary Steward + Secondary Owner) — form fields exist, needs server validation
- Lifecycle classification selection (Deal, PortCo, Internal, Department, Project)
- M365 Group creation support (not just SharePoint sites) — spec Section 3.1
- Teams-connected site provisioning option — requires `Team.Create` permission
- Audit log entry for every provisioning action (request, approve, reject, provision, fail)
- Retention policy assignment during provisioning
- **Post-provisioning**: write Zenith property bag metadata to new site, add to workspace inventory

### 🟠 BL-006: Copilot Readiness Dashboard
**Status:** Backlog | **Spec Reference:** Section 3.3
**Description:** Dedicated dashboard showing Copilot eligibility across all managed workspaces with explainable AI readiness. The spec requires answering "Why is Copilot allowed (or blocked) here?" with clear reasoning.
**Current State:** Basic copilot_rules table with per-workspace PASS/FAIL rules. ai-copilot.tsx page exists with rule display. No scoring, no remediation guidance, no explicit exclusion model.
**Acceptance Criteria:**
- Eligibility score per workspace (0-100) based on weighted criteria
- Blocking factors with specific remediation steps ("Apply 'Confidential' sensitivity label", "Disable external sharing")
- Explicit exclusion model (e.g., Family Office sites always excluded regardless of other criteria)
- Organization-wide readiness percentage and trend tracking
- Criteria evaluated: sensitivity labels, metadata completeness, governance state, sharing posture, ownership status
- Remediation queue: sorted by impact (sites closest to eligibility first)
- Export for compliance reporting
- Service plan gated (Professional+)

### 🟠 BL-007: Lifecycle Management & Review Queue
**Status:** Backlog | **Spec Reference:** Section 3.1 (lifecycle classification)
**Description:** Identify and surface stale, orphaned, and non-compliant sites for administrative review and remediation. Lifecycle classification assigned at provisioning time must be enforced throughout the workspace lifecycle.
**Acceptance Criteria:**
- Configurable staleness threshold (default: 90 days no activity)
- Orphaned site detection (no owner, owner account disabled, owner departed)
- Compliance scoring based on: metadata completeness, label assignment, ownership, sharing posture
- Lifecycle classification tracking (Deal → Closed, PortCo → Divested, Internal → Archived)
- Lifecycle review queue with priority ranking
- Bulk action support (archive, reassign owner, apply label, update metadata)
- Retention policy alignment and enforcement
- Scheduled scan with configurable frequency
- Notification to site owners when sites approach lifecycle thresholds

### 🟠 BL-008: Audit Log Viewer & Export
**Status:** Backlog | **Spec Reference:** Section 4.7
**Description:** Admin interface for viewing, filtering, searching, and exporting the audit trail. The spec requires audit logs to be immutable and exportable.
**Acceptance Criteria:**
- Admin UI at `/app/admin/audit-log`
- Filtering by: action type, user, date range, resource type, organization, tenant, result (success/failure)
- Full-text search across audit details
- Pagination for large result sets
- Export to CSV and JSON formats
- Retention indicator showing how long records will be kept (per service plan)
- No DELETE/UPDATE operations exposed on audit log records (immutability)
- RBAC: visible to Platform Owner, Tenant Admin, and Read-Only Auditor roles only

---

## Medium Priority

### 🟡 BL-009: Job Scheduling & Management System
**Status:** Backlog | **Design Doc:** [`docs/design/job-scheduling-system.md`](/docs/design/job-scheduling-system.md)
**Description:** Background job scheduling system for automating recurring governance operations — tenant syncs, stale site detection, compliance scans, label audits, and notification delivery. Architecture follows the proven Orbit pattern with database-backed audit trail, concurrency guards, abort support, and admin monitoring UI.
**Reference:** Orbit (`synozur-orbit`) `scheduled-jobs.ts` — best job scheduling implementation in the Synozur portfolio.
**Constraint (Spec Section 10):** The spec states "No polling-based data collection." Jobs must be scheduled administrative operations (manual trigger or timed interval), NOT continuous polling or real-time monitoring. Each job runs once and completes — no long-lived polling loops or webhook listeners. This is consistent with Orbit's pattern (scheduled intervals, not continuous polling).
**Acceptance Criteria:**
- `scheduled_job_runs` table with full audit trail (job type, tenant, status, result, error, triggered by)
- `scheduled_job_configs` table with per-org frequency settings (hourly/daily/weekly/disabled)
- In-memory job status registry with `isRunning` concurrency guards and `AbortController` for cancellation
- Generic `trackJobRun<T>()` wrapper for automatic start/complete/fail tracking
- Stuck job cleanup (auto-fail jobs running > 1 hour)
- Refactor existing tenant sync into first schedulable job
- Core jobs: tenantSync, staleSiteScan, labelAudit, ownershipCheck
- Advanced jobs (Professional+): copilotReadiness, sharingAudit, complianceScore
- Communication jobs: ownerReminder, digestEmail, planExpiration
- Admin UI at `/app/admin/scheduled-jobs` with overview cards, run history, manual triggers, frequency config
- Service plan gating for advanced job types

### 🟡 BL-010: External Sharing Governance
**Status:** Backlog | **Spec Reference:** Section 3.1 (default sharing posture)
**Description:** Monitor and enforce external sharing policies across managed SharePoint sites. The spec requires default sharing posture enforcement at provisioning and ongoing governance.
**Acceptance Criteria:**
- Sharing capability inventory per site (synced from Graph API sharingCapability field)
- Policy violation detection: sites with sharing enabled that shouldn't have it per sensitivity label
- Domain allowlist/blocklist enforcement (domainBlocklist table exists)
- Guest user access reporting
- Bulk sharing restriction updates via Graph API (service plan gated)
- Default sharing posture enforcement at provisioning time

### 🟡 BL-011: Provisioning Templates Library
**Status:** Backlog | **Spec Reference:** Section 3.1
**Description:** Pre-built and custom provisioning templates for common site types. The spec calls for intent-based provisioning requests replacing ad-hoc creation.
**Acceptance Criteria:**
- Template CRUD for administrators
- Pre-built templates: Deal Room, Portfolio Company, Department, Project, Internal
- Template includes: site type (Team Site, Communication Site, M365 Group), metadata defaults, sensitivity label, sharing posture, permissions model, retention policy
- Template versioning
- Template usage tracking and analytics

### 🟡 BL-012: Retention & Lifecycle Classification Enforcement
**Status:** Backlog | **Spec Reference:** Section 3.2
**Description:** The spec requires retention and lifecycle alignment for every governed workspace. Currently `retentionPolicy` is a text field with a static default. No enforcement or validation against M365 retention policies.
**Acceptance Criteria:**
- Sync retention labels/policies from Microsoft Purview via Graph API
- Map workspace lifecycle classification (Deal, PortCo, Internal) to appropriate retention policies
- Validate retention policy assignment at provisioning time
- Surface retention gaps in governance dashboard (sites without retention policies)
- Retention policy change tracking in audit log

### 🟡 BL-013: Notification System
**Status:** Backlog
**Description:** Configurable notification system for governance events and policy violations.
**Acceptance Criteria:**
- Alert rules for sharing violations, missing labels, orphaned sites
- Email digest (daily/weekly configurable)
- In-app notification center
- Teams bot integration (future phase)
- Notification preferences per user

### 🟡 BL-014: Reporting & Analytics
**Status:** Backlog
**Description:** Executive reporting dashboard with governance KPIs and trend analysis.
**Acceptance Criteria:**
- Governance posture score over time
- Storage growth trends
- Label coverage metrics
- Activity trends and stale site ratio
- Scheduled PDF report delivery
- Export to Excel

### 🟡 BL-015: Document Library Management
**Status:** Backlog | **UI exists:** `document-library.tsx` (532 lines, mock data only)
**Description:** Extend governance to document library level within managed sites. A full UI page already exists with library inventory views, column detail, versioning settings, and sensitivity indicators — but it is entirely driven by hardcoded mock data. This item covers connecting it to real data via Microsoft Graph API.
**Acceptance Criteria:**
- Sync document libraries per site via Graph API (`/sites/{id}/lists` filtered to documentLibrary template)
- Library properties: item count, storage used, versioning config, content types applied, sensitivity label
- Large file and version sprawl detection (configurable thresholds)
- Storage optimization recommendations (libraries over quota, excessive versions)
- Library-level sensitivity label tracking and compliance reporting
- Replace all mock data in existing UI with live Graph data
- Library-level governance actions (require checkout, version limits, IRM enforcement) — service plan gated

### 🟡 BL-016: Content Type Hub & Syndication Management
**Status:** Backlog | **UI exists:** `content-types.tsx` (285 lines, mock data only)
**Description:** Manage and monitor SharePoint Content Type Hub syndication across managed sites. A UI page exists with content type inventory, syndication status, and error reporting — all driven by mock data. This item covers connecting to real Graph API content type endpoints and adding governance controls.
**Acceptance Criteria:**
- Sync content types from Content Type Hub via Graph API (`/sites/{hubSiteId}/contentTypes`)
- Track content type syndication/publishing status across sites
- Monitor syndication errors and conflicts (column type mismatches, locked sites)
- Content type column inventory (site columns, managed metadata columns)
- Content type compliance: which sites are missing required content types
- Force-sync capability for specific content types or sites
- Replace all mock data in existing UI with live Graph data
- Content type usage analytics (which content types are most/least used)

### 🟡 BL-017: Syntex / AI Builder Model Governance
**Status:** Backlog | **UI exists:** `syntex.tsx` (351 lines, mock data only)
**Description:** Govern SharePoint Syntex (now Microsoft Syntex / AI Builder) document processing models across managed sites. A UI page exists with model inventory, accuracy tracking, autofill rules, and processing statistics — all driven by mock data. This item covers connecting to real Syntex APIs and adding governance visibility.
**Acceptance Criteria:**
- Sync Syntex/AI Builder models via Graph API or SharePoint REST API
- Model inventory: name, type (Document Understanding, Form Processing, Prebuilt), status, accuracy, library associations
- Autofill rule tracking: which extracted fields map to which site columns
- Processing statistics: documents processed, success/failure rates
- Model lifecycle governance: who created, when trained, where applied
- Replace all mock data in existing UI with live Graph data
- Enterprise tier only (Syntex requires separate Microsoft licensing)

### 🟡 BL-018: Teams Inventory & Channel Governance
**Status:** Backlog | **Spec Reference:** Section 3.1 (Microsoft Teams provisioning)
**Description:** The spec lists Microsoft Teams as a core provisionable workspace type alongside SharePoint sites and M365 Groups. Currently Teams connectivity is tracked only as a boolean flag (`teamsConnected`) on workspaces. There is no dedicated Teams inventory, channel listing, or Teams-specific governance.
**Acceptance Criteria:**
- Teams inventory via Graph API (`/groups?$filter=resourceProvisioningOptions/Any(x:x eq 'Team')`)
- Team details: display name, description, visibility (public/private), member count, owner count, archive status
- Channel listing per team: standard, private, and shared channels
- Channel governance: which channels have guests, which are private, naming convention compliance
- Teams ↔ SharePoint site linkage (every Team has an underlying SharePoint site — show bidirectional relationship)
- Orphaned Teams detection (Teams with no owners or inactive Teams)
- Teams provisioning support in governed provisioning workflow (BL-005)
- Teams creation policy awareness (who can create Teams in the tenant)
- Graph API permissions needed: `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `TeamMember.Read.All`

### 🟡 BL-019: Archive & Backup Management
**Status:** Backlog | **UI exists:** `archive-backup.tsx` (294 lines, mock data only) | **Spec Reference:** Section 3.1 (lifecycle)
**Description:** Workspace archival and M365 backup management. A full UI page exists with archive inventory, backup policies, restore queue, and storage statistics — all driven by hardcoded mock data. No backend API, no database tables, no Graph API integration. This is a complete prototype shell with nothing behind it.
**Current State:** UI design prototype only. Zero backend.
**Acceptance Criteria:**
- Archive workflow: lock site via Graph API (`PATCH /sites/{id}` with `isLocked: true`), update workspace status
- Archive inventory table (database-backed) — which sites are archived, when, by whom, retention period
- Backup policy management — define backup frequency, scope (by sensitivity, by site collection, by user set), retention
- Integration with Microsoft 365 Backup Storage (via Graph API `/solutions/backupRestore`)
- Restore workflow: request → approval → restore from backup → verify
- Storage tracking: archived vs. active storage consumption
- Retention enforcement: auto-delete after retention period expires (with admin warning)
- Replace all mock data in existing UI with live data
- Audit trail for every archive/restore/delete action
- Graph API permissions needed: `Sites.Manage.All`, `BackupRestore.ReadWrite.All` (for M365 Backup)
- Service plan gated (Professional+ for backup policies, Standard+ for manual archive)

### 🟡 BL-020: SharePoint Embedded (SPE) Container Governance
**Status:** Backlog | **UI exists:** `embedded-containers.tsx` (277 lines, mock data only) | **Spec Reference:** Section 3.1
**Description:** Governance for SharePoint Embedded containers — headless SharePoint storage used by custom applications. A full UI page exists with container type registry, active container inventory, storage usage, and API call statistics — all driven by hardcoded mock data. Zero backend.
**Current State:** UI design prototype only. Zero backend.
**Acceptance Criteria:**
- Container Type registry: register Entra App IDs, set per-type storage quotas
- Container inventory via Graph API (`/storage/fileStorage/containers`)
- Container properties: name, type, storage used, quota, status, owning app, permissions model
- Storage quota monitoring and alerting (containers approaching/exceeding quota)
- Sensitivity label tracking on containers (SPE containers support labels)
- Sharing policy enforcement on containers
- Container lifecycle: create, archive, delete with governance controls
- Replace all mock data in existing UI with live data
- Graph API permissions needed: `FileStorageContainer.Selected` or `FileStorageContainer.ReadWrite.All`
- Enterprise tier only (SPE requires separate Microsoft licensing)

---

## Low Priority

### 🟢 BL-021: MGDC Integration (Enterprise Tier)
**Status:** Backlog | **Spec Reference:** Sections 5.1, 5.2
**Description:** Microsoft Graph Data Connect integration for large-scale file share analysis and deep content classification. Per the spec, MGDC is Enterprise tier only, explicitly opt-in, and used only for large-scale data readiness programs.
**Acceptance Criteria:**
- MGDC pipeline setup for file share inventory
- Enterprise/Unlimited tier gating
- Explicit opt-in per tenant (admin must enable)
- File share inventory extraction
- Migration candidate analysis
- AI data readiness assessment
- Non-interactive, read-only, time-bounded operations
- No user behavior monitoring (spec non-goal)

### 🟢 BL-022: File Share Analysis Module (Enterprise Tier)
**Status:** Backlog | **Spec Reference:** Section 6
**Description:** Separate module for analyzing on-premises and cloud file shares to identify migration candidates and assess classification readiness. Logically distinct from core governance.
**Acceptance Criteria:**
- File share discovery and inventory
- Migration candidate scoring (age, usage, sensitivity, size)
- Classification readiness assessment
- Governance design recommendations
- Non-interactive, read-only, time-bounded
- Enterprise tier only

### 🟢 BL-023: Native M365 Policy Integration
**Status:** Backlog | **Spec Reference:** Section 7
**Description:** Integration with native Microsoft 365 policy controls. The spec positions Zenith as configuring, validating, and reporting on native Microsoft controls — not replacing them. This covers SharePoint Advanced Management, Teams policies, and Entra ID access models.
**Acceptance Criteria:**
- SharePoint Advanced Management: restricted access control detection, site lifecycle policies, default sensitivity label policies
- Teams policies: Teams creation policies, guest access policies, channel governance
- Entra ID access models: conditional access policy awareness, app consent policy visibility
- Policy compliance reporting: which workspaces comply/violate each native policy
- Read-only posture — Zenith reports on policy state, does not replace the admin centers

### 🟢 BL-024: AI-Powered Governance Insights
**Status:** Exploring | **Target:** 2027
**Description:** AI-driven classification recommendations and anomaly detection.
**Acceptance Criteria:**
- Site classification suggestions based on content and usage patterns
- Anomaly detection for unusual sharing or access spikes
- Natural language governance queries
- Predictive storage forecasting

### 🟢 BL-025: Cross-Platform Governance
**Status:** Exploring | **Target:** 2027 | **Spec Reference:** Section 3.1 (Teams, M365 Groups)
**Description:** Extend governance beyond SharePoint to OneDrive, Exchange, and Power Platform.
**Acceptance Criteria:**
- OneDrive personal site governance
- Exchange mailbox policy tracking
- Power Platform environment monitoring
- Unified governance dashboard

### 🟢 BL-026: Custom Workflow Automation
**Status:** Exploring | **Target:** 2027
**Description:** User-defined governance workflows and automation rules.
**Acceptance Criteria:**
- Visual workflow builder
- Trigger-action model (event → condition → action)
- Pre-built automation templates
- Execution history and audit trail
- API webhook support

---

## Technical Debt

### 🔴 TD-001: Audit Log Immutability Enforcement
**Status:** Backlog | **Spec Reference:** Section 4.7
**Description:** The spec requires audit logs to be immutable. Currently there are no database-level protections against deletion or modification of audit records.
- Add database trigger or policy to prevent DELETE/UPDATE on audit_log table
- Remove any existing DELETE endpoints for audit records
- Consider append-only table design or write-ahead log
- Audit retention cleanup should be a system-level scheduled job, not an API action

### 🟡 TD-002: Test Coverage
**Status:** Ongoing
**Description:** Expand automated test coverage across backend and frontend.
- Unit tests for storage layer
- Integration tests for sync workflow
- Frontend component tests
- E2E tests for critical workflows (provisioning, tenant registration, RBAC)

### 🟡 TD-003: Error Handling Standardization
**Status:** Planned
**Description:** Standardize error handling and error response format across all API endpoints.
- Consistent error response shape (`{ error: string, code: string, details?: any }`)
- Structured error codes for programmatic handling
- Client-side error boundary improvements
- Retry logic for transient Graph API failures

### 🟢 TD-004: Performance Optimization
**Status:** Planned
**Description:** Optimize sync performance for large tenants.
- Batch size tuning for Graph API calls
- Delta sync support (only sync changed sites)
- Database query optimization for large workspace counts
- Frontend pagination for workspace lists

### 🟢 TD-005: Non-Goal Boundary Enforcement
**Status:** Backlog | **Spec Reference:** Section 8
**Description:** Verify the product does not cross explicit non-goal boundaries from the spec. The spec states Zenith does NOT provide usage analytics, monitor user behavior, track file-level activity, replace SIEM/SOC tooling, or perform continuous polling. Current site-level usage data (page views, activity dates) is governance metadata, not behavioral surveillance — but this boundary should be clearly documented and enforced in code comments and API documentation.
- Review all data collection to ensure it stays within governance scope
- Add code-level documentation on data boundaries
- Ensure no user-level activity tracking is introduced

---

## Completed

### ✅ BL-100: Support & Documentation System
**Completed:** February 2026
- In-app Support & About section
- Markdown-based docs with API endpoint
- Sidebar navigation

### ✅ BL-101: Hub Site Hierarchy Detection
**Completed:** February 2026
- SharePoint REST API integration
- Nested hub support with parentHubSiteId
- Structures page with three-tab view

### ✅ BL-102: Purview Sensitivity Label Inventory
**Completed:** February 2026
- Real-time label sync from Graph API
- Label resolution across all governance views
- Purview page with categorized label views

### ✅ BL-103: Metadata Management
**Completed:** February 2026
- Department and custom metadata fields
- Data dictionary per tenant
- SharePoint property bag write-back

### ✅ BL-104: Service Plan Feature Gating
**Completed:** January 2026
- Four-tier service plans
- Server and client enforcement
- Feature matrix and upgrade prompts

### ✅ BL-105: Multi-Tenant Architecture
**Completed:** January 2026
- Organization-level tenancy
- Multi-tenant M365 connections
- Admin consent flow

### ✅ BL-106: Authentication & RBAC
**Completed:** January 2026
- Entra SSO + dual auth
- Six RBAC roles
- Zero existence leakage

### ✅ BL-107: Core Site Inventory
**Completed:** January 2026
- Full SharePoint site inventory via Graph API
- Site type detection and Teams connectivity
- Usage analytics and storage tracking
