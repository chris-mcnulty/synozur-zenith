# Zenith Changelog

**Microsoft 365 Governance Platform — The Synozur Alliance**

Version history and release notes for Zenith, organized from newest to oldest releases.

---

## Table of Contents

1. [Current Version](#current-version)
2. [Recent Releases](#recent-releases)
3. [Version History](#version-history)

---

## Current Version

### Version 0.9.0 (February 23, 2026)

**Release Date:** February 23, 2026
**Status:** Development Release
**Codename:** Hub Site Hierarchy

This release introduces hub site hierarchy detection from SharePoint REST API, nested hub support, and a rebuilt Structures page with three viewing modes.

#### ✨ New Features

**Hub Site Hierarchy Detection**
- SharePoint REST API token acquisition with separate SPO audience
- Hub site discovery via `SP.HubSites` REST endpoint
- Per-site hub association detection via `_api/site` endpoint
- Nested hub support: root hubs can contain child hubs, which contain associated sites
- Hub hierarchy stored in workspaces with `isHubSite`, `hubSiteId`, and `parentHubSiteId`
- Non-fatal enrichment during tenant sync (hub detection failures don't block site inventory)

**Rebuilt Structures Page**
- Three-tab view: Hub Hierarchy, Standalone Sites, Departments
- Recursive tree rendering for nested hub-to-hub relationships
- Visual differentiation between root hubs (purple) and child hubs (indigo)
- Search across all tabs
- Site count badges per hub and per department

#### 🔧 Technical Changes
- Added `parentHubSiteId` column to workspaces table
- Added `getSpoToken()` for SharePoint REST API authentication (different token audience from Graph API)
- Added `/api/structures` endpoint computing hub hierarchy from workspace data
- SPO token cache isolated from Graph token cache with clientId in cache key

---

## Recent Releases

### Version 0.8.0 (February 2026)

**Release Date:** February 2026
**Status:** Development Release
**Codename:** Purview & Real Data

This release replaces all mock sensitivity label data with real Purview labels from tenant inventory and rebuilds the Purview and Structures pages to use live data.

#### ✨ New Features

**Purview Sensitivity Label Integration**
- Real sensitivity label sync from Microsoft Graph `informationProtection/policy/labels`
- Label resolution across governance page, workspace details, bulk edit, and filter drawers
- Purview page rebuilt with Site Labels, File Labels, and All Labels tabs
- Color dot indicators and protection icons for label display
- Filtering by `appliesToGroupsSites` scope for site-applicable labels

**Structures Page (Initial Build)**
- Department-based site grouping with expandable sections
- Site type breakdown with badge indicators
- Search across departments and sites

**Metadata Management**
- Scalable metadata system supporting 5-10 metadata types
- Data dictionary management per tenant connection
- SharePoint property bag write-back for department and custom fields
- Write-back gated by service plan (Standard+)

#### 🐛 Bug Fixes
- Fixed label display showing raw IDs instead of label names
- Fixed sensitivity filter showing hardcoded options instead of tenant labels

---

### Version 0.7.0 (February 2026)

**Release Date:** February 2026
**Status:** Development Release
**Codename:** Usage Analytics

#### ✨ New Features

**SharePoint Usage Reports**
- Microsoft Graph usage report integration (SharePoint site usage detail)
- Storage used/allocated bytes from usage reports
- File count and active file count metrics
- Page view and visited page counts
- Last activity date tracking
- Usage classification (Very High, High, Medium, Low)

**Site Enrichment**
- Drive owner and storage enrichment via Graph API
- Site analytics with last activity date
- Root web template detection for site type inference

---

### Version 0.6.0 (January 2026)

**Release Date:** January 2026
**Status:** Development Release
**Codename:** Service Plans & Feature Gating

#### ✨ New Features

**Service Plan System**
- Four service plan tiers: Trial, Standard, Professional, Enterprise
- Feature matrix with per-plan capabilities
- Server-side enforcement via middleware
- Client-side upgrade prompts and gated UI components
- Plan management admin page

**Admin Consent Flow**
- Single multi-tenant Entra app registration
- Admin consent URL generation with all application permissions
- Consent callback handler with tenant activation
- Automatic token acquisition after consent

---

### Version 0.5.0 (January 2026)

**Release Date:** January 2026
**Status:** Development Release
**Codename:** Authentication & RBAC

#### ✨ New Features

**Microsoft Entra ID SSO**
- PKCE authorization code flow via MSAL-node
- Automatic user provisioning on first SSO login
- Token encryption at rest (AES-256-GCM)

**Dual Authentication**
- Email/password login alongside SSO
- bcrypt password hashing
- Session management via connect-pg-simple

**Role-Based Access Control**
- Six roles: Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, Read-Only Auditor
- Visibility-scoped data access (zero existence leakage)
- Role-based navigation and UI controls

---

### Version 0.4.0 (January 2026)

**Release Date:** January 2026
**Status:** Development Release
**Codename:** Multi-Tenant Foundation

#### ✨ New Features

**Multi-Tenant Architecture**
- Organization-level tenancy with isolated experiences
- Multi-tenant M365 connections per organization
- MSP/Customer/Hybrid ownership types
- Tenant connection management UI
- Demo tenant support for testing

**Core Site Inventory**
- SharePoint site discovery via Microsoft Graph
- Site type detection (Team, Communication, Hub)
- Teams connectivity flag
- Owner and storage tracking
- Workspace detail pages

**Copilot Eligibility**
- Initial Copilot eligibility assessment per workspace
- Blocking factor identification
- Eligibility display on workspace detail pages

---

## Version History

| Version | Date | Codename | Highlights |
|---------|------|----------|------------|
| 0.9.0 | Feb 23, 2026 | Hub Site Hierarchy | Nested hub detection, SPO REST API, Structures rebuild |
| 0.8.0 | Feb 2026 | Purview & Real Data | Real Purview labels, metadata management, Structures page |
| 0.7.0 | Feb 2026 | Usage Analytics | SharePoint usage reports, site enrichment |
| 0.6.0 | Jan 2026 | Service Plans & Feature Gating | Service plan tiers, admin consent flow |
| 0.5.0 | Jan 2026 | Authentication & RBAC | Entra SSO, dual auth, RBAC roles |
| 0.4.0 | Jan 2026 | Multi-Tenant Foundation | Multi-tenancy, site inventory, Copilot eligibility |
