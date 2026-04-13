# Zenith Product Backlog

**Microsoft 365 Governance Platform — The Synozur Alliance**

Prioritized backlog of features, enhancements, and technical improvements. Items are organized by priority and status. Items graduate from the backlog to the [Roadmap](/app/support/roadmap) when delivery is committed.

**Last analyzed against specification:** February 2026
**Last UX review:** April 2026

---

## Table of Contents

1. [Priority Legend](#priority-legend)
2. [Spec Gap Summary](#spec-gap-summary)
3. [Critical Priority](#critical-priority)
4. [High Priority](#high-priority)
5. [Medium Priority](#medium-priority)
6. [UX & Experience Enhancements](#ux--experience-enhancements)
7. [Low Priority](#low-priority)
8. [Technical Debt](#technical-debt)
9. [Completed](#completed)

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

### 🟠 BL-028: Recordings Discovery — Meeting Metadata Enrichment (Phase 3)
**Status:** Backlog | **Depends on:** Teams Recordings Discovery (Phase 1 & 2, ✅ shipped)
**Description:** Phase 1/2 discover recording/transcript files and capture file-level metadata. Phase 3 enriches each discovered file with authoritative meeting metadata from the Online Meetings API — meeting subject, start time, participant count, and duration — enabling governance by meeting context rather than just filename.
**Design:** The linkage between a DriveItem and an `onlineMeeting` is not a direct foreign key. The approach is filename-based timestamp parsing to narrow a date window, then querying the organizer's meetings via `GET /users/{organizerId}/onlineMeetings?$filter=startDateTime ge {start} and startDateTime le {end}`. The match is confirmed via `GET /users/{userId}/onlineMeetings/{meetingId}/recordings`.
**Schema changes needed:**
- `teams_recordings`: add `meetingId` (text), `meetingDurationSeconds` (integer), `participantCount` (integer), `meetingEnriched` (boolean, default false)
**New Graph permissions required:**
- `Application: OnlineMeetings.Read.All, OnlineMeetingRecording.Read.All, OnlineMeetingTranscript.Read.All`
**Acceptance Criteria:**
- New service function `enrichRecordingsWithMeetingMetadata()` runs incrementally (only unenriched rows)
- Groups by organizer UPN to batch meeting lookups per user
- Fuzzy timestamp match (within 30 min of `fileCreatedAt`)
- Updates matched rows with meeting subject, start time, participant count, duration
- Marks all processed rows as `meetingEnriched = true` regardless of match outcome
- Unmatched rows get `meetingTitle` derived from filename as fallback
- Meeting metadata surface in recordings table and detail panel on the Recordings Discovery page
- Enrichment can be triggered as a follow-on step after discovery sync

### 🟠 BL-029: Recordings Discovery — Copilot & AI Accessibility Assessment (Phase 4)
**Status:** Backlog | **Depends on:** BL-028 (Phase 3 enrichment), BL-006 (Copilot Readiness Dashboard)
**Description:** Phase 1/2 derive a basic `copilotAccessible` flag by checking for "Highly Confidential" sensitivity labels. Phase 4 implements a rigorous, policy-driven accessibility assessment that mirrors how Microsoft 365 Copilot evaluates access to content — covering label encryption, external permissions, organizer licensing, and tenant-level Copilot deployment.
**Assessment dimensions:**
| Dimension | Data source |
|---|---|
| Sensitivity label encryption | Join `sensitivityLabelId` → `sensitivity_labels.hasProtection` |
| Retention hold | `retentionLabelName` → join `retention_labels.behaviorDuringRetentionPeriod` |
| External sharing | `GET /drives/{id}/items/{id}/permissions` — check for external principals |
| Organizer Copilot license | `GET /users/{id}/licenseDetails` — check for M365 Copilot SKU |
| Private channel | `channelType = private` — flag for awareness |
| Tenant Copilot deployment | Admin confirmation or org-level setting |
**Schema changes needed:**
- `teams_recordings`: add `organizerHasCopilotLicense` (boolean), `hasExternalPermissions` (boolean), `accessibilityAssessedAt` (timestamp)
**New Graph permissions required:** None beyond existing; `User.Read.All` covers `licenseDetails`.
**Acceptance Criteria:**
- Re-derive `copilotAccessible` and `accessibilityBlockers` for all recordings post-enrichment
- Sensitivity label join: mark as blocked if `hasProtection = true` AND label sensitivity score exceeds configurable threshold
- External permissions check for all `isShared = true` recordings
- Organizer license check for unique organizer UPNs (batch, not per-recording)
- Configurable per-org rules (some orgs allow Copilot on HC content)
- Assessment re-runs automatically after label sync (hook into label sync completion)
- Recordings page: expose detailed blocker categories (Label Encrypted / External Sharing / No Copilot License / Inaccessible)
- Summary card: "Fully Assessed" vs "Pending Assessment" coverage indicator
- Export (CSV) of all recordings with accessibility status for compliance reporting
- Service plan gated: Professional+ (aligns with BL-006 Copilot Readiness Dashboard)


### 🟡 BL-030: MSP Access Grant — Mutual Confirmation Handshake
**Status:** Backlog | **Depends on:** BL-001 (audit trail, ✅ instrumented)
**Description:** The current 6-digit, 10-minute access code has no intended-recipient verification — any authenticated organization that obtains the code can claim the grant. Enhancement: when an MSP redeems a customer's 6-digit code, the system generates a second 6-digit confirmation code which the MSP must relay back to the customer out-of-band; the customer enters it on their side to complete the grant. This creates a mutual confirmation loop — proof the MSP has a legitimate invitation, plus proof the customer still controls the process — without requiring either party to browse a directory of organizations.
**Acceptance Criteria:**
- Phase 1 (MSP side): `POST /api/admin/msp-access/redeem` validates the 6-digit code and, instead of immediately activating the grant, returns a new system-generated 6-digit confirmation code and sets grant status to `PENDING_CONFIRMATION`
- Phase 2 (Customer side): new endpoint `POST /api/admin/tenants/:id/msp-access/confirm` accepts the confirmation code and the grantId; validates the code matches and has not expired (separate 10-minute window); sets grant status to `ACTIVE`
- Expired confirmation codes cancel the grant (status → `EXPIRED`); customer must generate a new access code to retry
- Both steps emit audit events: `MSP_GRANT_CONFIRMATION_PENDING`, `MSP_GRANT_CONFIRMED`, `MSP_GRANT_EXPIRED`
- Schema change: add `confirmationCode` (text), `confirmationExpiresAt` (timestamp) to `mspAccessGrants`
- No UI change needed for Phase 1 (MSP enters code as today); customer UI shows a "Waiting for confirmation" step with the code to relay to the MSP

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

### 🟡 BL-027: Stale / Removed Site Detection During Sync
**Status:** Backlog | **Spec Reference:** Section 3.1
**Description:** During sync, sites that previously existed in Zenith's inventory but are no longer returned by the Microsoft Graph site enumeration are not detected or flagged. If a site is fully purged from the tenant (past recycle bin retention), Zenith retains the stale record indefinitely with no indication it's gone. Soft-deleted sites are handled correctly via the usage report's `isDeleted` flag, but fully removed sites are a blind spot.
**Design Considerations:**
- **Must avoid false positives from transient API failures.** A pagination error, throttling, or partial Graph response should not mass-flag healthy sites as deleted.
- Consider a "not seen" counter: increment each sync when a site is missing, only flag after N consecutive misses (e.g., 3 syncs).
- Consider a threshold safeguard: if more than X% of known sites are missing from a sync result, skip deletion detection entirely and log a warning.
- Consider a `lastSeenInSync` timestamp on each workspace to track when it was last confirmed by Graph.
- Flagged sites should get a distinct status (e.g., `REMOVED_FROM_TENANT`) rather than reusing `isDeleted`, to distinguish from soft-delete.
**Acceptance Criteria:**
- Track `lastSeenInSync` timestamp per workspace
- After N consecutive syncs where a site is absent, flag it as removed
- Threshold safeguard prevents mass false-positive flagging
- UI shows "Removed from Tenant" status distinct from "Deleted" (recycle bin)
- Audit log entry when a site is flagged as removed

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

## UX & Experience Enhancements

> Items in this section are non-functional-requirement improvements focused on navigation clarity, capability discovery, and user journey efficiency. They do not alter the Aurora design language, color palette (Purple `#810FFB` / Pink `#E60CB3`), glassmorphism (`glass-panel`) utility classes, or Avenir Next LT Pro typography. All changes are structural and informational — the visual aesthetic is preserved exactly.
>
> **Audit rationale (April 2026):** A full review of the app shell, routing tree, and navigation structure identified six friction points that impair new-user onboarding, capability discovery, and daily operational efficiency. These items address those gaps systematically.

---

### 🟠 BL-031: Sidebar Tenant Context Card
**Status:** Backlog | **Priority:** High | **Effort:** Small (1–2 hours) | **Files:** `client/src/components/layout/app-shell.tsx`

**Problem**

Zenith is a multi-tenant governance platform. The active M365 tenant is the single most important operational context for every action a user takes — syncing data, running policy evaluations, assessing Copilot readiness, and managing workspaces all operate against the selected tenant. Despite this, the desktop sidebar provides no visual confirmation of which tenant is currently active. The tenant name appears only in the mobile slide-out sheet header, and is otherwise invisible.

This creates a meaningful risk: a user may perform governance actions, trigger a sync, or run an AI assessment while unknowingly operating against the wrong tenant — particularly users managing multiple tenant connections on behalf of different portfolio companies.

**Current Behaviour**

- Desktop sidebar: logo → nav links. No tenant signal anywhere.
- Mobile sheet: tenant name shown in a small `bg-primary/5` pill near the top of the sheet body.
- The global tenant selector (`useTenant()` context) is available but not surfaced in the desktop sidebar.

**Proposed Solution**

Add a compact tenant context card to the desktop sidebar, positioned immediately below the logo bar and above the first nav group. The card shows:

1. **Tenant display name** — the `selectedTenant.displayName` or domain suffix derived from `selectedTenant.tenantId`.
2. **Sync status indicator** — a colored dot reflecting whether the last sync was recent (green), stale (amber), or failed (red), derived from `selectedTenant.lastSyncAt`.
3. **"Manage" affordance** — clicking the card navigates to `/app/admin/tenants` (Tenant Connections admin page).
4. **No-tenant state** — if no tenant is selected, show a subtle "No tenant selected" prompt with a link to `/app/admin/tenants`.
5. **Multi-tenant hint** — if `tenants.length > 1`, show a small "Switch" affordance (or tenant count pill) indicating multiple tenants are available.

The card should use the existing `bg-primary/5 rounded-xl` styling consistent with the mobile sheet's current tenant widget. It must not introduce new colors or break the glass-panel aesthetic.

**Acceptance Criteria**
- Desktop sidebar shows the active tenant name at all times below the Zenith logo.
- Sync status is communicated via a color dot: green (synced within 24h), amber (24–72h), red (>72h or sync error), grey (never synced).
- Card is interactive: click navigates to Tenant Connections.
- "No tenant" state shows a clear CTA prompt rather than an empty gap.
- If `tenants.length > 1`, the card shows a pill badge with the count and a "Switch" label.
- Mobile sidebar sheet already shows tenant context — no change needed there.
- Implementation uses only `useTenant()` hook data already available in `app-shell.tsx`. No new API calls.
- Card is visually distinct from nav items but does not overpower them. Max height: 56px.

**Design Notes**
- Use `bg-primary/5 border border-primary/10 rounded-xl` for the card container (matches existing mobile pattern).
- Sync dot: `w-2 h-2 rounded-full` with `bg-emerald-500` / `bg-amber-500` / `bg-red-500` / `bg-muted`.
- Tenant name: `text-sm font-semibold` truncated with ellipsis.
- Subdomain or domain: `text-xs text-muted-foreground` below the tenant name.

---

### 🟠 BL-032: Auto-Expand Nav Section to Active Route
**Status:** Backlog | **Priority:** High | **Effort:** Small (1–2 hours) | **Files:** `client/src/components/layout/app-shell.tsx`

**Problem**

The sidebar's collapsible section state is persisted to `localStorage` under the key `zenith_sidebar_collapsed`. This is a good pattern for users who intentionally collapse sections to reduce visual noise. However, it creates a navigation reliability problem: if a user collapses the "Management" section (or any of its sub-groups such as "Inventory" or "Governance") and then navigates to a page within that section — via the dashboard, a bookmark, a direct URL, or a link from another page — the sidebar shows no active route indicator. The user cannot see where they are in the navigation hierarchy.

This is particularly problematic for:
- New users exploring the product who collapse sections and navigate away.
- Existing users with all sections collapsed who receive a shared URL.
- Deep-link navigation from dashboard quick-action cards.

**Current Behaviour**

- `collapsedSections` is loaded from `localStorage` on mount via `loadCollapsedState()`.
- There is no `useEffect` watching `location` to re-open a section when the active route falls within it.
- A user who has collapsed "Management → Inventory" and navigates to `/app/governance` sees no active highlight in the sidebar.

**Proposed Solution**

Add a `useEffect` that runs whenever `location` changes. It inspects the current route against the full nav tree (both `navGroups` and `adminSubGroups`) and:

1. Identifies the top-level nav group containing the active route.
2. Identifies the sub-group containing the active route (if applicable).
3. Clears the `collapsed` flag for those specific keys in `collapsedSections`, writing the updated state back to `localStorage`.

The effect only **opens** sections — it does not collapse currently-open sections. This ensures the user always sees their active location without having their manually-expanded sections unexpectedly collapsed.

**Acceptance Criteria**
- Navigating to any page (via URL, link, or dashboard card) automatically expands the nav group and sub-group containing that page.
- The expansion does not collapse any other currently-open sections.
- The expanded state is persisted back to `localStorage` so a page refresh retains the correct state.
- Works for all three nav layers: top-level `navGroups`, `subGroups` within Management, and `adminSubGroups` within Administration.
- Works for the Administration section (currently toggled by `nav_admin` key).
- No visual jump or flash — the section opens before the nav renders (use the same `useState` initializer pattern as `loadCollapsedState`).

**Implementation Notes**

The route-to-section mapping is already implicit in the `navGroups` and `adminSubGroups` data structures. The `useEffect` can walk the tree to find a match:

```typescript
useEffect(() => {
  const keysToOpen: string[] = [];
  for (const group of navGroups) {
    const groupKey = `nav_${group.label}`;
    if (group.items?.some(i => location.startsWith(i.href))) {
      keysToOpen.push(groupKey);
    }
    if (group.subGroups) {
      for (const sg of group.subGroups) {
        if (sg.items.some(i => location.startsWith(i.href))) {
          keysToOpen.push(groupKey);
          keysToOpen.push(`nav_${group.label}_${sg.subLabel}`);
        }
      }
    }
  }
  // adminSubGroups check...
  if (keysToOpen.length > 0) {
    setCollapsedSections(prev => {
      const updated = { ...prev };
      keysToOpen.forEach(k => { updated[k] = false; });
      saveCollapsedState(updated);
      return updated;
    });
  }
}, [location]);
```

---

### 🟡 BL-033: Feature-Gate Badge Tooltips
**Status:** Backlog | **Priority:** Medium | **Effort:** Small (1–2 hours) | **Files:** `client/src/components/layout/app-shell.tsx`

**Problem**

The sidebar nav currently displays three types of badges on nav items:

1. **Plan badges** — `Pro+` and `Ent+` indicating the minimum service plan required to access the feature.
2. **Mock badges** — `MOCK` indicating the feature is a UI prototype not yet backed by a real implementation.
3. **Count badges** — e.g., `3` on "Approvals" indicating pending items.

The plan badges and mock badges are entirely silent — hovering them does nothing. A user who encounters a `Pro+` badge on "Copilot Readiness" or an `Ent+` badge on "IA Assessment" has no way to understand:
- What "Pro+" means (Professional tier).
- What tier their organization is currently on.
- How to upgrade.

Similarly, a user who sees `MOCK` has no way to know if the feature is in development, planned, or simply a demonstration placeholder.

This is a significant capability discovery gap. Features exist in the nav but are effectively hidden behind unexplained badges.

**Proposed Solution**

Wrap each badge type in a shadcn/ui `<Tooltip>` component within the `renderNavItem()` function. Tooltip content is badge-specific:

| Badge | Tooltip Content |
|---|---|
| `Pro+` | "Available on the Professional plan and above. Contact Synozur to upgrade." |
| `Ent+` | "Available on the Enterprise plan. Contact Synozur to upgrade." |
| `MOCK` | "This feature is in active development and will be available in a future release." |
| Numeric (e.g., `3`) | No tooltip needed — count is self-explanatory. |

Tooltips should appear on hover with a 300ms delay to avoid noise during fast navigation. The tooltip style should match the existing shadcn/ui `<Tooltip>` styling already used elsewhere in the app (e.g., workspace detail panels).

**Acceptance Criteria**
- Hovering a `Pro+` badge shows a tooltip explaining the Professional plan requirement.
- Hovering an `Ent+` badge shows a tooltip explaining the Enterprise plan requirement.
- Hovering a `MOCK` badge shows a tooltip explaining the feature is in development.
- Numeric count badges do not show a tooltip.
- Tooltips use the existing shadcn/ui `Tooltip`, `TooltipContent`, `TooltipTrigger` components — no new UI library imports.
- Tooltip delay is 300ms to avoid flashing during normal sidebar navigation.
- Tooltips do not obstruct nav items below them (correct placement: `side="right"` on a sidebar).
- The badge visual appearance is unchanged — only the hover behaviour is added.

**Design Notes**
- `TooltipProvider` is already mounted in `App.tsx` (`<TooltipProvider>`), so no wrapper changes are needed.
- Import `Tooltip`, `TooltipContent`, `TooltipTrigger` from `@/components/ui/tooltip`.
- Use `delayDuration={300}` on the `<Tooltip>` component.
- Tooltip placement: `side="right"` to appear to the right of the sidebar, not over other nav items.

---

### 🟡 BL-034: Contextual Page Breadcrumb in Header
**Status:** Backlog | **Priority:** Medium | **Effort:** Medium (2–4 hours) | **Files:** `client/src/components/layout/app-shell.tsx`

**Problem**

The top application header currently contains: App Switcher → Separator → Mobile Menu trigger → Search bar → Notification bell → User avatar dropdown. There is no indication of where the user currently is within the navigation hierarchy.

For a platform with 25+ distinct pages organized across multiple levels of nesting (e.g., Management → Governance → Policy Builder → What-If Planner), location clarity is essential. Users lose orientation when:
- Navigating via dashboard quick-action cards.
- Following a deep link shared by a colleague.
- Returning to the app after a break with a complex URL in the browser.
- Using the browser back button across multiple sections.

The header has available horizontal space on the left side (between the app switcher separator and the search bar) that is currently unused on desktop. This is the natural location for a breadcrumb.

**Proposed Solution**

Add a breadcrumb component to the header that maps the current `location` to a human-readable section path. The breadcrumb displays:

- **Top-level group** — e.g., "Management" or "Insights & Licensing"
- **Sub-group** (if applicable) — e.g., "Governance" or "Inventory"
- **Current page** — e.g., "Policy Builder"

The full example: `Management › Governance › Policy Builder`

The route-to-breadcrumb mapping is derived from the same `navGroups` and `adminSubGroups` data structures already defined in `app-shell.tsx`. A `buildBreadcrumb(location, navGroups, adminSubGroups)` helper function walks the tree to find the matching item and returns an ordered array of `{ label, href? }` segments.

**Special cases:**
- Dashboard: no breadcrumb (the landing page needs no orientation signal).
- Admin pages: show "Administration › {Sub-Group} › {Page Name}".
- Workspace detail pages (`/app/governance/workspaces/:id`): show "Management › Inventory › SharePoint Sites › Workspace".
- Unknown/unmatched routes: show nothing (graceful fallback).

The breadcrumb is hidden on mobile (where the hamburger menu is shown instead) and on screens smaller than `lg` breakpoint.

**Acceptance Criteria**
- Breadcrumb appears in the header between the app switcher separator and the search bar on `lg` screens and above.
- Correctly maps all nav items from `navGroups` and `adminSubGroups` to their breadcrumb segments.
- Workspace detail pages show an appropriate breadcrumb ending in "Workspace".
- Dashboard shows no breadcrumb (not needed — the page title is sufficient context).
- Administration pages show the correct sub-group label.
- Breadcrumb is hidden on mobile (`hidden lg:flex`).
- Separator between segments uses `›` (or a `ChevronRight` icon at `w-3 h-3 text-muted-foreground/40`).
- Current page segment is rendered in `text-foreground font-medium`; ancestor segments in `text-muted-foreground hover:text-foreground` as links.
- Breadcrumb does not wrap to a second line — truncate with ellipsis on very long paths.
- No additional API calls required — all data is derived from the route and the static nav config.

**Implementation Notes**

```typescript
type BreadcrumbSegment = { label: string; href?: string };

function buildBreadcrumb(location: string, navGroups: NavGroup[], adminSubGroups: AdminSubGroup[]): BreadcrumbSegment[] {
  // Walk navGroups first
  for (const group of navGroups) {
    if (group.items) {
      const match = group.items.find(i => location.startsWith(i.href));
      if (match) return [{ label: group.label }, { label: match.name }];
    }
    if (group.subGroups) {
      for (const sg of group.subGroups) {
        const match = sg.items.find(i => location.startsWith(i.href));
        if (match) return [{ label: group.label }, { label: sg.subLabel }, { label: match.name, href: match.href }];
      }
    }
  }
  // Walk adminSubGroups
  for (const sg of adminSubGroups) {
    const match = sg.items.find(i => location.startsWith(i.href));
    if (match) return [{ label: "Administration" }, { label: sg.subLabel }, { label: match.name, href: match.href }];
  }
  return [];
}
```

---

### 🟡 BL-035: Improved Empty and Mock States
**Status:** Backlog | **Priority:** Medium | **Effort:** Small (1–2 hours) | **Files:** `client/src/App.tsx`

**Problem**

Several pages in the app are UI prototypes not yet backed by real data or business logic. These pages route to the generic `EmptyPage` component defined in `App.tsx`:

```tsx
const EmptyPage = ({ title }: { title: string }) => (
  <div className="flex h-[50vh] items-center justify-center">
    <div className="text-center space-y-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-muted-foreground">This feature is part of the Zenith MVP mockup.</p>
    </div>
  </div>
);
```

This component is used for: `Provision`, `Approvals`, `Lifecycle`, `Reports`, and `Discover & Migrate`.

The current implementation has three problems:

1. **No icon** — the page is visually barren and indistinguishable at a glance from a broken page.
2. **Generic description** — "This feature is part of the Zenith MVP mockup" tells users nothing about what the feature is for or when it will be ready. It creates doubt about whether the page is intentionally empty or accidentally broken.
3. **No call to action** — there is nothing for the user to do. They land on the page, read a vague sentence, and must navigate away. No context, no roadmap signal, no link to related live functionality.

**Proposed Solution**

Replace the `EmptyPage` component with a richer `ComingSoonPage` component that accepts per-page configuration:

```tsx
type ComingSoonConfig = {
  title: string;
  description: string;
  icon: React.ElementType;
  relatedHref?: string;
  relatedLabel?: string;
  phase?: string;
};
```

Each mock route passes a tailored config:

| Route | Icon | Description | Related Link |
|---|---|---|---|
| `/app/provision` | `FolderPlus` | "Governed site provisioning with approval workflows, naming conventions, and sensitivity label assignment — coming in a future release." | Link to Governance page |
| `/app/approvals` | `CheckCircle2` | "Approval queue for pending provisioning requests, metadata change requests, and sensitivity label escalations." | Link to Dashboard |
| `/app/lifecycle` | `Clock` | "Automated lifecycle review hub for stale, orphaned, and non-compliant sites — with remediation queue and owner notifications." | Link to SharePoint Sites |
| `/app/reports` | `BarChart3` | "Executive governance reporting with trend analysis, compliance KPIs, and scheduled PDF delivery." | Link to Dashboard |
| `/app/discover` | `Search` | "Discover migration candidates across on-premises file shares and cloud storage — with AI-powered classification readiness scoring." | None |

The component should use the existing `glass-panel` card aesthetic and the `cosmic-gradient` or `bg-primary/5` background style, with an icon rendered in the primary color and a "Planned Feature" badge in amber. A secondary button (if `relatedHref` is provided) links to the closest live equivalent to keep users productive.

**Acceptance Criteria**
- All five mock routes (`/app/provision`, `/app/approvals`, `/app/lifecycle`, `/app/reports`, `/app/discover`) show a rich empty state with a feature-specific icon, title, and description.
- Each empty state includes a "Planned Feature" pill badge (amber) to communicate intentionality.
- Each empty state where `relatedHref` is defined includes a secondary action button linking to the related live feature.
- The empty state is visually consistent with the Aurora / glass-panel design language — no new colors or fonts.
- The component gracefully handles cases where no `relatedHref` is provided (renders without the action button).
- The generic `EmptyPage` component is removed from `App.tsx` and replaced with the new component.
- No changes to routing, RBAC, or feature toggle logic.

**Design Notes**
- Container: `glass-panel p-12 rounded-2xl max-w-lg mx-auto mt-16 text-center`
- Icon: `w-12 h-12 text-primary mx-auto mb-4 opacity-70`
- "Planned Feature" badge: `bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-semibold px-2.5 py-0.5 rounded-full`
- Title: `text-2xl font-bold mt-4`
- Description: `text-muted-foreground mt-2 leading-relaxed`
- Related link button: `variant="outline"` with the related page icon

---

### 🟡 BL-036: ⌘K Command Palette (Global Navigation Search)
**Status:** Backlog | **Priority:** Medium | **Effort:** Medium (3–5 hours) | **Files:** New `client/src/components/command-palette.tsx` + `client/src/components/layout/app-shell.tsx`

**Problem**

With 25+ distinct routes organized across multiple levels of nav hierarchy, capability discovery via the sidebar alone is slow and requires knowing where features are located. New users face a steep learning curve: they must understand the navigation structure (Management → Governance → Policy Builder) before they can find specific tools. Experienced users who know what they want to do are slowed down by having to visually scan and click through nested sections.

The existing search bar in the header is visually present but non-functional for navigation purposes — it does not search across features or pages.

There is no keyboard-first navigation path in the application. Every interaction requires mouse or touch navigation through the sidebar.

This is the highest-impact capability discovery improvement available without changing any page content or data.

**Proposed Solution**

Implement a global `⌘K` / `Ctrl+K` command palette — a modal dialog with a search input that indexes all navigation items and allows instant keyboard-driven navigation to any page in the app.

**Component: `CommandPalette`**

- **Trigger:** Global `keydown` listener for `Meta+K` (Mac) or `Ctrl+K` (Windows/Linux). Also triggered by clicking the existing search bar in the header (replace or augment the non-functional search bar UI).
- **Dialog:** Uses shadcn/ui `<Dialog>` with a full-width search input at the top.
- **Index:** All items from `navGroups`, `adminSubGroups`, and `platformAdminItems` — filtered by user's `effectiveRole` and enabled feature toggles (matching existing sidebar filtering logic).
- **Each result item shows:**
  - Feature icon (same icon used in the sidebar nav item)
  - Feature name
  - Section path (e.g., "Management › Governance" or "Administration › Access & Audit")
  - Plan badge if applicable (`Pro+`, `Ent+`)
  - Muted `MOCK` tag if applicable
- **Search behaviour:** Case-insensitive substring match on both feature name and section path. Results are filtered in real time as the user types. No external search library needed — the index is small (< 30 items).
- **Keyboard navigation within the palette:**
  - `↑` / `↓` arrows to move selection
  - `Enter` to navigate to the selected item (closes palette, routes via `useLocation`)
  - `Escape` to close without navigating
- **Empty state:** "No features match your search." with a hint to try broader terms.
- **Recent items (stretch goal):** Show the last 3 visited pages as "Recent" suggestions before the user starts typing, stored in `localStorage`.

**Integration in `app-shell.tsx`**

- Mount `<CommandPalette />` once inside `AppShell` so it is always available when the shell is rendered.
- Pass it the filtered nav items (already computed by `NavLinks` filtering logic) and a `useLocation` setter.
- The existing search bar `<Input>` in the header becomes the visual trigger for the palette (clicking it opens the dialog instead of typing inline).

**Acceptance Criteria**
- `⌘K` (Mac) and `Ctrl+K` (Windows/Linux) open the command palette from any page within the app shell.
- Clicking the search bar in the header also opens the command palette.
- All nav items visible to the current user's role and feature toggles are searchable.
- Items not accessible to the user's role or disabled by feature toggle do not appear.
- Search is case-insensitive and matches on both item name and section path.
- Keyboard navigation (`↑`, `↓`, `Enter`, `Escape`) is fully functional.
- Navigating to a selected item closes the palette and routes immediately.
- The palette renders within the existing Aurora / glass-panel design language: `bg-card/95 backdrop-blur-xl border border-border/40 rounded-2xl`.
- No new npm packages required — uses only shadcn/ui `Dialog`, `Command`, or equivalent components already available in the project, plus native DOM APIs.
- The palette is accessible: `role="dialog"`, `aria-label="Command palette"`, focus trapped within the dialog while open.
- On mobile, the palette is not triggered by `⌘K` (no keyboard) but remains accessible via the search bar tap.

**Implementation Notes**

The shadcn/ui library already includes a `Command` primitive (`cmdk` under the hood) which provides the filtered list, keyboard navigation, and empty state out of the box. Check `client/src/components/ui/` for an existing `command.tsx`. If present, the implementation reduces to:

```tsx
<CommandDialog open={open} onOpenChange={setOpen}>
  <CommandInput placeholder="Search features..." />
  <CommandList>
    <CommandEmpty>No features match your search.</CommandEmpty>
    {groupedItems.map(group => (
      <CommandGroup key={group.label} heading={group.label}>
        {group.items.map(item => (
          <CommandItem key={item.href} onSelect={() => { navigate(item.href); setOpen(false); }}>
            <item.icon className="w-4 h-4 mr-2 text-muted-foreground" />
            {item.name}
            {item.badge && <Badge>{item.badge}</Badge>}
          </CommandItem>
        ))}
      </CommandGroup>
    ))}
  </CommandList>
</CommandDialog>
```

**Dependency check before implementation:** Confirm `cmdk` is already included via shadcn/ui. If not, install it as it is a zero-config peer dependency of the shadcn Command component.

---

### 🟡 BL-037: Microsoft Planner Integration for Support Tickets
**Status:** ✅ Implemented (April 2026) | **Priority:** Medium | **Effort:** Small (2–4 hours) | **Parity:** Constellation ✅, Vega ✅, Zenith ✅

> **Implementation note:** Plan id and bucket id are stored in the `platform_settings` table (not as environment variables) so platform owners can re-target the integration without redeploying. This is required because the shared Synozur support Planner plan also receives tickets from Constellation and Vega — Zenith must drop into a specific bucket within that plan. Microsoft Graph credentials remain in environment variables (`MICROSOFT_GRAPH_TENANT_ID`/`CLIENT_ID`/`CLIENT_SECRET`, falling back to `AZURE_*` equivalents) since they are secrets.


**Background**

Constellation and Vega both create a Microsoft Planner task automatically whenever a support ticket is submitted through the in-app support form. Zenith has the same support ticket system (database-backed, SendGrid email notifications) but does not push tickets to Planner. Support engineers working across all three products must check Zenith's in-app queue separately, which breaks the unified triage workflow.

**Current State**

- `support_tickets` table exists in `shared/schema.ts` with full schema (subject, description, category, priority, status, submitter)
- `server/routes/support.ts` handles ticket creation and sends a SendGrid notification email to `support@synozur.com`
- No outbound call to Microsoft Graph or Planner at ticket creation time
- No Planner-related environment variables or configuration exist in Zenith

**Proposed Solution**

On ticket creation, after the ticket is persisted and the SendGrid email is sent, make a call to the Microsoft Graph API to create a task in the designated Planner plan. This mirrors the pattern used in Constellation and Vega.

**Implementation Steps**

1. **Environment configuration** — Add the following environment variables (match the names used in Constellation/Vega for consistency):
   - `PLANNER_PLAN_ID` — the ID of the Planner plan to post tasks into
   - `PLANNER_BUCKET_ID` — the bucket within that plan for new/incoming tickets
   - `MICROSOFT_GRAPH_TENANT_ID`, `MICROSOFT_GRAPH_CLIENT_ID`, `MICROSOFT_GRAPH_CLIENT_SECRET` — app-only credentials with `Tasks.ReadWrite` scope (check whether these already exist in the environment under another name before adding new ones)

2. **New service file: `server/services/planner.ts`**
   - `getPlannerAccessToken()` — acquires a client credentials token from `https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token` with scope `https://graph.microsoft.com/.graph`
   - `createPlannerTask(ticket: SupportTicket): Promise<string | null>` — posts to `POST https://graph.microsoft.com/v1.0/planner/tasks`, returns the created task ID or `null` on failure
   - Task body mapping:
     | Planner field | Zenith ticket field |
     |---|---|
     | `title` | `[{priority}] {subject}` |
     | `planId` | `PLANNER_PLAN_ID` env var |
     | `bucketId` | `PLANNER_BUCKET_ID` env var |
     | `assignments` | empty (unassigned) |
     | `dueDateTime` | none (leave null) |
   - Task details (second call to `PATCH /planner/tasks/{id}/details`):
     | Planner field | Value |
     |---|---|
     | `description` | ticket description |
     | `references` | link to Zenith support page for context |
   - Errors must be caught and logged — a Planner failure must **never** cause the ticket creation response to fail. The ticket must always be saved regardless.

3. **Wire into ticket creation route** (`server/routes/support.ts`)
   - After the ticket is inserted and the SendGrid email is dispatched, call `createPlannerTask(ticket)` in a non-blocking `try/catch`
   - Store the returned Planner task ID on the ticket record if the schema has a spare column, or log it — do not hold up the HTTP response waiting for Planner
   - Add a `plannerTaskId` column (`text`, nullable) to `support_tickets` schema if not already present, so the task ID is traceable

4. **Graceful degradation**
   - If any Planner env var is absent, skip the integration silently (log a warning, do not throw)
   - If the Graph API call fails, log the error with the ticket ID for manual follow-up but return 201 to the client as normal

**Schema Change (if `plannerTaskId` column is added)**
```sql
ALTER TABLE support_tickets ADD COLUMN planner_task_id TEXT;
```

**Acceptance Criteria**
- Submitting a support ticket via the in-app form creates a corresponding task in the configured Planner plan within a few seconds
- The task title includes the ticket priority and subject; the task description contains the full ticket description
- A Planner outage or misconfiguration does not prevent ticket submission — the user always receives a success response
- If `PLANNER_PLAN_ID` or `PLANNER_BUCKET_ID` are not set, the integration is skipped and a warning is written to the server log
- The Planner task ID is stored on the ticket record for traceability
- No new npm packages required — use Node.js built-in `fetch` (available in Node 18+) for the Graph API calls, consistent with the pattern in Constellation and Vega

**Files to create / modify**
| Action | File |
|---|---|
| Create | `server/services/planner.ts` |
| Modify | `server/routes/support.ts` |
| Modify | `shared/schema.ts` (add `plannerTaskId` column) |
| Modify | `server/storage.ts` (update insert/select types) |

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
**Completed:** February 2026 (Tasks #16, #17 — commits `b52eb6f`, `48b321f`)

**Purpose:** Give users an in-app help desk with threaded ticket communication and a structured markdown documentation library, matching feature parity with Orbit.

**Schema — `shared/schema.ts`**
- `support_tickets` table: `id`, `ticketNumber` (org-scoped integer), `organizationId`, `userId`, `category` (bug | feature_request | question | feedback), `subject`, `description`, `priority` (low | medium | high), `status` (open | in_progress | resolved | closed), `assignedTo`, `applicationSource`, `resolvedAt`, `resolvedBy`, `createdAt`, `updatedAt`
- `support_ticket_replies` table: `id`, `ticketId`, `userId`, `message`, `isInternal` (boolean — staff-only notes), `createdAt`
- Insert schemas and inferred types exported for both tables

**Storage — `server/storage.ts`**
- `getNextTicketNumber(orgId)` — org-scoped incrementing integer
- `createSupportTicket(data)` — insert and return
- `getSupportTickets(orgId, userId, isAdmin)` — scoped to org+user; Platform Owner sees all
- `getSupportTicket(id, orgId, userId?)` — enforces org and user scoping
- `getTicketReplies(ticketId, includeInternal)` — excludes internal notes for non-admins
- `addTicketReply(ticketId, userId, message, isInternal)` — also sets `updatedAt` and advances `status` to `in_progress` if currently `open`
- `closeTicket(id, userId)` — sets `status=closed`, `resolvedAt`, `resolvedBy`
- `updateTicketStatus(id, status)` — Platform Owner only; full lifecycle control

**Ticket API — `server/routes/support.ts`**
- `GET /api/support/tickets` — list scoped by org/role
- `POST /api/support/tickets` — create; triggers SendGrid emails
- `GET /api/support/tickets/:id` — detail + replies; enriches author name/email from users table
- `POST /api/support/tickets/:id/replies` — add reply; `isInternal` only honoured for Platform Owners
- `PATCH /api/support/tickets/:id/close` — close
- `PATCH /api/support/tickets/:id/status` — Platform Owner only status management

**Documentation API — `server/routes/docs.ts`**
- `GET /api/docs` — list available docs (filename, slug, exists, lastModified)
- `GET /api/docs/:filename` — return raw markdown; allow-list: `USER_GUIDE.md`, `ROADMAP.md`, `CHANGELOG.md`, `BACKLOG.md`
- Files served from root `docs/` directory

**Email Notifications — `server/email-support.ts`**
- On ticket creation: `sendSupportTicketNotification(ticket, user, org)` → `support@synozur.com`
- On ticket creation: `sendTicketConfirmationToSubmitter(ticket, user)` → submitter's email
- Both send async (non-blocking) so ticket creation response is fast

**Frontend — `client/src/pages/app/support.tsx`**
- Sidebar nav tabs: Tickets, Roadmap, What's New, User Guide, Backlog, About Zenith
- Ticket list with status/priority badges and "New Ticket" button
- New ticket form: category (select), priority (select), subject (input), description (textarea)
- Ticket detail: original description, threaded reply list, reply composer
- Platform Owner extras: internal-note checkbox on replies, status management dropdown
- Markdown docs: rendered with `react-markdown` + `remark-gfm`
- About panel: platform version badge, capability list, support email + website links
- Registered at `/app/support` and `/app/support/:tab` in `client/src/App.tsx`
- Navigation link added to `client/src/components/layout/app-shell.tsx`

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
