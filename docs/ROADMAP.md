# Zenith Product Roadmap

**Microsoft 365 Governance Platform — The Synozur Alliance**

The roadmap contains only features we have committed to build. For the full list of ideas, enhancements, and future possibilities, see the [Backlog](/app/support/backlog).

---

## Table of Contents

1. [Vision & Strategy](#vision--strategy)
2. [Current Focus (Q1 2026)](#current-focus-q1-2026)
3. [Recently Completed](#recently-completed)
4. [Feature Status Legend](#feature-status-legend)

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

### 🔄 Governed Site Provisioning

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
