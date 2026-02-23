# Zenith Product Backlog

**Microsoft 365 Governance Platform — The Synozur Alliance**

Prioritized backlog of features, enhancements, and technical improvements. Items are organized by priority and status.

---

## Table of Contents

1. [Priority Legend](#priority-legend)
2. [High Priority](#high-priority)
3. [Medium Priority](#medium-priority)
4. [Low Priority](#low-priority)
5. [Technical Debt](#technical-debt)
6. [Completed](#completed)

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| 🔴 Critical | Must-have for MVP or blocking other work |
| 🟠 High | Important for near-term delivery |
| 🟡 Medium | Valuable but not urgent |
| 🟢 Low | Nice-to-have, future consideration |
| ✅ Done | Completed and in production |

---

## High Priority

### 🟠 BL-001: Governed Site Provisioning Workflow
**Status:** In Progress | **Target:** Q1 2026
**Description:** End-to-end provisioning workflow for creating new SharePoint sites through governed templates with Deal and Portfolio Company context.
**Acceptance Criteria:**
- Provisioning request form with template selection
- Approval workflow (request → review → approve → create)
- Automated DEAL- and PORTCO- naming prefix enforcement
- Sensitivity label assignment during provisioning
- Dual ownership requirement (Primary Steward + Secondary Owner)
- Audit log entry for every provisioning action

### 🟠 BL-002: Lifecycle Review Queue
**Status:** Planned | **Target:** Q1 2026
**Description:** Identify and surface stale, orphaned, and non-compliant sites for administrative review and remediation.
**Acceptance Criteria:**
- Configurable staleness threshold (default: 90 days no activity)
- Orphaned site detection (no owner or owner departed)
- Compliance scoring based on metadata completeness, label assignment, ownership
- Bulk action support (archive, reassign owner, apply label)
- Scheduled scan with email digest

### 🟠 BL-003: Copilot Readiness Dashboard
**Status:** Planned | **Target:** Q2 2026
**Description:** Dedicated dashboard showing Copilot eligibility across all managed workspaces with remediation guidance.
**Acceptance Criteria:**
- Eligibility score per workspace (0-100)
- Blocking factors with remediation steps
- Organization-wide readiness percentage
- Trend tracking over time
- Export for compliance reporting

---

## Medium Priority

### 🟡 BL-004: Job Scheduling & Management System
**Status:** Backlog | **Design Doc:** [`docs/design/job-scheduling-system.md`](/docs/design/job-scheduling-system.md)
**Description:** Background job scheduling system for automating recurring governance operations — tenant syncs, stale site detection, compliance scans, label audits, and notification delivery. Architecture follows the proven Orbit pattern with database-backed audit trail, concurrency guards, abort support, and admin monitoring UI.
**Reference:** Orbit (`synozur-orbit`) `scheduled-jobs.ts` — best job scheduling implementation in the Synozur portfolio.
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

### 🟡 BL-005: Lifecycle Management
**Status:** Backlog
**Description:** Identify stale, orphaned, and non-compliant sites for administrative review and remediation.
**Acceptance Criteria:**
- Configurable staleness threshold (default: 90 days no activity)
- Orphaned site detection (no owner or owner departed)
- Compliance scoring based on metadata completeness, label assignment, ownership
- Bulk action support (archive, reassign owner, apply label)
- Scheduled scan with email digest

### 🟡 BL-006: External Sharing Governance
**Status:** Planned | **Target:** Q2 2026
**Description:** Monitor and enforce external sharing policies across managed SharePoint sites.
**Acceptance Criteria:**
- Sharing capability inventory per site
- Policy violation detection and alerting
- Domain allowlist/blocklist enforcement
- Guest user access reporting
- Bulk sharing restriction updates

### 🟡 BL-007: Document Library Inventory
**Status:** Planned | **Target:** H2 2026
**Description:** Extend governance to document library level within managed sites.
**Acceptance Criteria:**
- Library discovery and inventory per site
- Content type tracking
- Large file and version sprawl detection
- Storage optimization recommendations
- Library-level sensitivity label tracking

### 🟡 BL-008: Notification System
**Status:** Planned | **Target:** H2 2026
**Description:** Configurable notification system for governance events and policy violations.
**Acceptance Criteria:**
- Alert rules for sharing violations, missing labels, orphaned sites
- Email digest (daily/weekly configurable)
- In-app notification center
- Teams bot integration (future phase)
- Notification preferences per user

### 🟡 BL-009: Reporting & Analytics
**Status:** Planned | **Target:** H2 2026
**Description:** Executive reporting dashboard with governance KPIs and trend analysis.
**Acceptance Criteria:**
- Governance posture score over time
- Storage growth trends
- Label coverage metrics
- Activity trends and stale site ratio
- Scheduled PDF report delivery
- Export to Excel

### 🟡 BL-010: Provisioning Templates Library
**Status:** Planned | **Target:** Q2 2026
**Description:** Pre-built and custom provisioning templates for common site types.
**Acceptance Criteria:**
- Template CRUD for administrators
- Pre-built templates: Deal Room, Portfolio Company, Department, Project
- Template includes: site type, metadata defaults, sensitivity label, permissions model
- Template versioning
- Template usage tracking

---

## Low Priority

### 🟢 BL-011: AI-Powered Governance Insights
**Status:** Exploring | **Target:** 2027
**Description:** AI-driven classification recommendations and anomaly detection.
**Acceptance Criteria:**
- Site classification suggestions based on content and usage patterns
- Anomaly detection for unusual sharing or access spikes
- Natural language governance queries
- Predictive storage forecasting

### 🟢 BL-012: Cross-Platform Governance
**Status:** Exploring | **Target:** 2027
**Description:** Extend governance beyond SharePoint to OneDrive, Exchange, and Power Platform.
**Acceptance Criteria:**
- OneDrive personal site governance
- Exchange mailbox policy tracking
- Power Platform environment monitoring
- Unified governance dashboard

### 🟢 BL-013: Custom Workflow Automation
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

### 🟡 TD-001: Test Coverage
**Status:** Ongoing
**Description:** Expand automated test coverage across backend and frontend.
- Unit tests for storage layer
- Integration tests for sync workflow
- Frontend component tests
- E2E tests for critical workflows

### 🟡 TD-002: Error Handling Standardization
**Status:** Planned
**Description:** Standardize error handling and error response format across all API endpoints.
- Consistent error response shape
- Structured error codes
- Client-side error boundary improvements
- Retry logic for transient failures

### 🟢 TD-003: Performance Optimization
**Status:** Planned
**Description:** Optimize sync performance for large tenants.
- Batch size tuning for Graph API calls
- Delta sync support (only sync changed sites)
- Database query optimization for large workspace counts
- Frontend pagination for workspace lists

---

## Completed

### ✅ BL-100: Hub Site Hierarchy Detection
**Completed:** February 2026
- SharePoint REST API integration
- Nested hub support with parentHubSiteId
- Structures page with three-tab view

### ✅ BL-101: Purview Sensitivity Label Inventory
**Completed:** February 2026
- Real-time label sync from Graph API
- Label resolution across all governance views
- Purview page with categorized label views

### ✅ BL-102: Metadata Management
**Completed:** February 2026
- Department and custom metadata fields
- Data dictionary per tenant
- SharePoint property bag write-back

### ✅ BL-103: Service Plan Feature Gating
**Completed:** January 2026
- Four-tier service plans
- Server and client enforcement
- Feature matrix and upgrade prompts

### ✅ BL-104: Multi-Tenant Architecture
**Completed:** January 2026
- Organization-level tenancy
- Multi-tenant M365 connections
- Admin consent flow

### ✅ BL-105: Authentication & RBAC
**Completed:** January 2026
- Entra SSO + dual auth
- Six RBAC roles
- Zero existence leakage
