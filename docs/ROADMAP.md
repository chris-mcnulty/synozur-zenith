# Zenith Product Roadmap

**Microsoft 365 Governance Platform — The Synozur Alliance**

The roadmap contains only features we have committed to build. For the full list of ideas, enhancements, and future possibilities, see the [Backlog](/app/support/backlog).

---

## Table of Contents

1. [Vision & Strategy](#vision--strategy)
2. [Current Focus (Q1 2026)](#current-focus-q1-2026)
3. [Committed — Next Up](#committed--next-up)
4. [Recommended for Roadmap (Pending Approval)](#recommended-for-roadmap-pending-approval)
5. [Recently Completed](#recently-completed)
6. [Feature Status Legend](#feature-status-legend)

---

## Vision & Strategy

### Our Mission
Zenith empowers organizations to govern their Microsoft 365 environments with confidence — providing visibility, security enforcement, and operational control over SharePoint sites, sensitivity labels, and collaboration workspaces from a single platform.

### Strategic Pillars

**1. Governed Provisioning**
- Template-based site creation with Deal and Portfolio Company context
- Automated naming conventions (DEAL-, PORTCO- prefixes)
- Dual ownership enforcement to prevent orphaned sites
- Sensitivity label assignment at provisioning time

**2. Security & Compliance**
- Purview sensitivity label inventory and enforcement
- Copilot eligibility explainability
- External sharing controls and monitoring
- Zero existence leakage security model

**3. Multi-Tenant MSP Architecture**
- Organization-level tenancy with multi-tenant M365 connections
- Single Entra app registration with admin consent per tenant
- MSP/Customer/Hybrid ownership models
- Service plan-based feature gating

**4. Operational Intelligence**
- Site inventory with rich usage analytics from Microsoft Graph
- Hub site hierarchy visualization
- Lifecycle management and stale site detection
- Metadata management with SharePoint property bag sync

### Success Metrics
- **Governance Coverage:** 100% of managed sites have assigned ownership and sensitivity labels
- **Provisioning Compliance:** 100% of new sites created through governed templates
- **Copilot Readiness:** Clear eligibility status for all managed workspaces
- **Security Posture:** Zero unclassified sites with external sharing enabled
- **Platform Reliability:** 99.5% uptime SLA

---

## Current Focus (Q1 2026)

### 🔄 Governed Site Provisioning (BL-005)

**Status:** 🔄 In Progress
**Target Completion:** March 2026
**Value Proposition:** Enable organizations to provision new SharePoint sites through governed templates with automatic naming conventions, sensitivity label assignment, and ownership requirements.

#### Deliverables
- Provisioning request workflow (request → review → approve → create)
- Template library with Deal and Portfolio Company site types
- Automated DEAL- and PORTCO- prefix enforcement
- Sensitivity label assignment during provisioning
- Dual ownership requirement (Primary Steward + Secondary Owner)
- Provisioning audit trail

---

## Committed — Next Up

### 🔄 Workspace Archive Lifecycle (BL-019 / BL-007)

**Status:** 🔄 Committed
**Target Completion:** Q1 2026
**Value Proposition:** Enable administrators to archive and restore SharePoint sites directly from Zenith, with full lifecycle tracking. This closes the gap between provisioning (creating governed sites) and lifecycle management (maintaining them over time). Currently the "Archive Workspace" action in Site Governance is non-functional, archive status is not synced from SharePoint, and there is no way to distinguish active from archived sites.

#### Deliverables
- **Archive state sync from Graph API:** Pull `isArchived` / lock state during tenant sync so archived sites are visually distinguished from active ones
- **Archive action:** Lock a SharePoint site via Graph API (`POST /sites/{id}/archive`) with confirmation dialog and reason capture
- **Unarchive / restore action:** Unlock a site via Graph API (`POST /sites/{id}/unarchive`) to bring it back to active state
- **Lifecycle status tracking:** New `lifecycleState` field on workspaces (Active, Archived, PendingArchive, PendingRestore)
- **Filtering in Site Governance:** Filter by lifecycle state so admins can view active sites, archived sites, or all
- **Audit trail:** Every archive/restore action logged with WHO, WHAT, WHEN, and reason
- **Service plan gating:** Standard+ for manual archive/restore

#### Graph API Permissions Required
- `Sites.ReadWrite.All` (Application) — needed to archive/unarchive sites (currently only `Sites.Read.All` is configured)

---

## Recommended for Roadmap (Pending Approval)

The following six backlog items are recommended for advancement to the committed roadmap, selected based on a gap analysis against the authoritative Zenith Engineering Product Specification. They are ordered by priority — security foundations first, then high-value governance capabilities.

### 📋 1. Comprehensive Audit Trail (BL-001)

**Recommended Priority:** Critical — Spec Compliance
**Backlog:** BL-001 | **Spec Reference:** Section 4.7
**Why Now:** The spec states "all privileged actions are logged" as an engineering acceptance criterion. Currently only 4 auth actions are logged. Every governance action, tenant change, access denial, and sync operation should produce an audit record. This is foundational for compliance and must be in place before other governance features can claim auditability.
**Effort Estimate:** Medium (primarily backend instrumentation — audit log table already exists)
**Dependencies:** None — can proceed immediately

### 📋 2. One-Owner Tenant Lock & Ownership Transfer (BL-002)

**Recommended Priority:** Critical — Spec Compliance
**Backlog:** BL-002 | **Spec Reference:** Section 4.3
**Why Now:** The spec explicitly requires "a tenant may belong to exactly one Zenith organization" and this is listed as an engineering acceptance criterion (Section 10: "No tenant with multiple owners"). Currently there is no enforcement. This is a core MSP safety mechanism — without it, unauthorized organizations could claim the same tenant.
**Effort Estimate:** Small-Medium (unique constraint + transfer workflow)
**Dependencies:** BL-001 (audit trail should capture ownership changes)

### 📋 3. Tenant Status Lifecycle (BL-004)

**Recommended Priority:** Critical — Spec Compliance
**Backlog:** BL-004 | **Spec Reference:** Section 4.2
**Why Now:** The spec defines four tenant statuses (Pending, Active, Suspended, Revoked) but only Pending and Active are implemented. Without Suspended/Revoked states, there is no way to gracefully offboard a tenant, respond to consent revocation, or handle payment lapses. All tenant-scoped API endpoints must respect status before processing.
**Effort Estimate:** Small-Medium (status field expansion + API guards)
**Dependencies:** BL-001 (status transitions must be audited)

### 📋 4. Operator Allowlisting (BL-003)

**Recommended Priority:** Critical — Spec Compliance
**Backlog:** BL-003 | **Spec Reference:** Section 4.4
**Why Now:** The spec requires "tokens from non-allowlisted operators are rejected." This is a core MSP safety mechanism alongside the one-owner tenant lock. Without it, any organization with a valid Entra token could potentially perform operations. This is a security gap that should be closed before the product goes live with real MSP customers.
**Effort Estimate:** Small-Medium (new table, middleware check, admin UI)
**Dependencies:** BL-002 (tenant ownership must be established first)

### 📋 5. Copilot Readiness Dashboard (BL-006)

**Recommended Priority:** High — Strategic Value
**Backlog:** BL-006 | **Spec Reference:** Section 3.3
**Why Now:** This is the highest-value feature that naturally follows the Purview label work you're doing right now. Once labels are configured and syncing, the next question every customer will ask is "What does this mean for Copilot?" The spec requires explainable AI eligibility — answering "Why is Copilot allowed (or blocked) here?" Currently only basic pass/fail rules exist with no scoring, remediation guidance, or exclusion model.
**Effort Estimate:** Medium (scoring engine, dashboard UI, remediation logic)
**Dependencies:** Purview label sync (in progress), BL-005 provisioning (for lifecycle classification)

### 📋 6. Lifecycle Management & Review Queue (BL-007)

**Recommended Priority:** High — Core Governance
**Backlog:** BL-007 | **Spec Reference:** Section 3.1
**Why Now:** Stale site detection, orphaned workspace identification, and lifecycle classification are core governance capabilities. The data needed (last activity dates, ownership, labels) is already being synced. This is the natural complement to provisioning — creating sites governed is only half the story; maintaining them throughout their lifecycle is the other half.
**Effort Estimate:** Medium (detection logic, review queue UI, bulk actions)
**Dependencies:** BL-001 (governance actions must be audited), BL-009 job scheduling (for scheduled scans — can be manual first)

---

## Recently Completed

The following major features have been delivered and are live. See the [Changelog](/app/support/changelog) for detailed release notes.

### ✅ Support & Documentation System
**Completed:** February 2026
- In-app Support & About section with Roadmap, Changelog, User Guide, and Backlog
- Markdown-based documentation served via API and rendered in the UI
- Sidebar navigation to documentation pages

### ✅ Hub Site Hierarchy Detection
**Completed:** February 2026
- SharePoint REST API integration for hub site detection
- Nested hub support (root hub → child hubs → associated sites)
- Per-site hub association via `_api/site` endpoint
- Structures page with Hub Hierarchy, Standalone, and Department views
- Non-fatal enrichment during tenant sync

### ✅ Purview Sensitivity Label Inventory
**Completed:** February 2026
- Real-time label sync from Microsoft Graph Information Protection API
- Label resolution across governance, workspace details, and bulk edit views
- Purview page with Site Labels, File Labels, and All Labels tabs
- Color dot and protection icon display
- Filtering by `appliesToGroupsSites` scope

### ✅ SharePoint Site Usage Analytics
**Completed:** February 2026
- Microsoft Graph usage reports integration (storage, file counts, page views, activity)
- Drive owner and storage enrichment per site
- Site analytics with last activity date
- Usage classification (Very High, High, Medium, Low)

### ✅ Metadata Management & Property Bag Sync
**Completed:** February 2026
- Scalable metadata system supporting 5-10 metadata types
- Department, classification, and custom metadata fields
- Data dictionary management per tenant
- SharePoint property bag write-back (gated by service plan)

### ✅ Multi-Tenant Architecture
**Completed:** January 2026
- Organization-level tenancy with isolated data
- Multi-tenant M365 connections per organization
- Single Entra app registration with admin consent flow
- MSP/Customer/Hybrid ownership types
- Tenant switcher for multi-org users

### ✅ Service Plan Feature Gating
**Completed:** January 2026
- Four tiers: Trial, Standard, Professional, Enterprise
- Server-side and client-side enforcement
- Feature matrix with upgrade prompts
- Plan management UI for administrators

### ✅ Authentication & RBAC
**Completed:** January 2026
- Microsoft Entra ID SSO (PKCE authorization code flow)
- Dual authentication (SSO + email/password)
- Role-based access: Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, Read-Only Auditor
- Visibility-scoped data access (zero existence leakage)
- AES-256-GCM token encryption at rest

### ✅ Core Site Inventory
**Completed:** January 2026
- Full SharePoint site inventory via Microsoft Graph
- Site type detection (Team, Communication, Hub)
- Teams connectivity tracking
- Owner and storage information
- Copilot eligibility assessment

---

## Feature Status Legend

| Status | Meaning |
|--------|---------|
| ✅ Complete | Feature is live in production |
| 🔄 In Progress | Currently under active development and committed |
| 📋 Recommended | Recommended for roadmap, pending approval to commit |
