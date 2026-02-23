# Zenith User Guide

**Welcome to Zenith — Microsoft 365 Governance Platform**

Version 0.9 | Last Updated: February 23, 2026

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Dashboard Overview](#dashboard-overview)
4. [Site Inventory](#site-inventory)
5. [Workspace Details](#workspace-details)
6. [Governance](#governance)
7. [Sensitivity Labels (Purview)](#sensitivity-labels-purview)
8. [Site Structures](#site-structures)
9. [Provisioning](#provisioning)
10. [Tenant Management](#tenant-management)
11. [Organization Settings](#organization-settings)
12. [User Roles & Permissions](#user-roles--permissions)
13. [Service Plans](#service-plans)
14. [Common Workflows](#common-workflows)
15. [Troubleshooting](#troubleshooting)

---

## Introduction

### What is Zenith?

Zenith is a Microsoft 365 governance platform built for organizations that need visibility and control over their SharePoint environment. It provides a centralized view of all SharePoint sites across connected tenants, with tools for enforcing security policies, managing metadata, tracking Copilot eligibility, and provisioning new workspaces through governed templates.

### Key Capabilities

- **Site Inventory**: Discover and track all SharePoint sites across your M365 tenants
- **Governance Dashboard**: Monitor compliance, ownership, and sensitivity label coverage
- **Purview Integration**: Real-time sensitivity label inventory from Microsoft Purview
- **Hub Site Hierarchy**: Visualize hub-to-hub and hub-to-site relationships
- **Copilot Eligibility**: Understand which sites are ready for Microsoft 365 Copilot
- **Provisioning**: Create new sites through governed templates with naming conventions
- **Metadata Management**: Maintain consistent metadata across all managed sites
- **Multi-Tenant Support**: Connect and manage multiple M365 tenants from a single platform

### Who Should Use This Guide?

This guide is for all Zenith users, including:
- **Governance Administrators** managing site policies and compliance
- **Tenant Administrators** connecting and configuring M365 tenants
- **Operators** handling day-to-day provisioning and site management
- **Viewers** monitoring governance posture and reports
- **Platform Owners** overseeing the entire Zenith deployment

---

## Getting Started

### Signing In

#### Microsoft SSO (Production)
1. Navigate to the Zenith login page
2. Click **"Sign in with Microsoft"**
3. Enter your Microsoft 365 credentials
4. Grant permissions when prompted (first-time only)
5. You'll be redirected to your Zenith dashboard

#### Email and Password (Development)
1. Navigate to the Zenith login page
2. Enter your email address and password
3. Click **"Sign In"**

### First Login

After your first sign-in:
1. **Select a Tenant**: If your organization has multiple M365 tenant connections, select the one you want to work with
2. **Review the Dashboard**: Familiarize yourself with the governance overview
3. **Check Your Role**: Navigate to organization settings to confirm your assigned role

### Navigating the Interface

The left sidebar provides access to all Zenith features:

- **Dashboard**: Governance overview with key metrics
- **Workspaces**: Browse and search all managed SharePoint sites
- **Governance**: Compliance monitoring, ownership tracking, label coverage
- **Purview**: Sensitivity label inventory from Microsoft Purview
- **Structures**: Hub site hierarchy and site architecture
- **Copilot**: AI/Copilot readiness assessment
- **Provisioning**: Request new sites through governed templates
- **Admin**: Tenant connections, organization settings, user management

---

## Dashboard Overview

The Dashboard provides an at-a-glance view of your governance posture.

### Key Metrics
- **Total Sites**: Number of SharePoint sites in your inventory
- **Labeled Sites**: Sites with a sensitivity label applied
- **Owned Sites**: Sites with at least one assigned owner
- **Copilot Ready**: Sites meeting all Copilot eligibility criteria

### Quick Actions
- Sync tenant data
- View recent provisioning requests
- Access governance alerts

---

## Site Inventory

The Workspaces page is your central directory of all SharePoint sites discovered during tenant sync.

### Browsing Sites
- Use the search bar to find sites by name or URL
- Filter by site type (Team Site, Communication Site, Hub Site)
- Filter by tenant connection
- Filter by department or sensitivity label

### Site Information
Each site shows:
- **Display Name**: The site title from SharePoint
- **Site URL**: Direct link to the SharePoint site
- **Type**: Team Site, Communication Site, or Hub Site
- **Owner**: Primary owner from SharePoint or usage reports
- **Department**: Assigned department (if configured)
- **Sensitivity Label**: Applied Purview label (if any)
- **Last Activity**: Date of most recent activity
- **Storage Used**: Current storage consumption
- **Teams Connected**: Whether the site has a linked Microsoft Team

### Exporting Data
Use the export options to download your site inventory for offline analysis.

---

## Workspace Details

Click any site in the inventory to view its full details.

### Overview Tab
- Site properties from SharePoint (URL, created date, description)
- Owner information (display name, email)
- Storage metrics (used, allocated, percentage)
- Usage statistics (file count, page views, last activity)
- Root web template

### Governance Tab
- Sensitivity label assignment and status
- Copilot eligibility with blocking factors
- External sharing capability
- Ownership compliance (primary steward + secondary owner)

### Metadata Tab
- Department assignment
- Custom metadata fields from data dictionary
- Property bag sync status
- Last sync timestamp

---

## Governance

The Governance page provides a compliance-focused view of your managed sites.

### Compliance Metrics
- **Label Coverage**: Percentage of sites with sensitivity labels applied
- **Ownership Coverage**: Percentage of sites with assigned owners
- **Metadata Completeness**: Percentage of sites with all required metadata

### Governance Actions
- **Bulk Edit**: Update department, sensitivity label, or metadata for multiple sites at once
- **Filter by Compliance**: Find sites missing labels, owners, or metadata
- **Export Report**: Download governance report for stakeholder review

---

## Sensitivity Labels (Purview)

The Purview page shows all sensitivity labels synced from your connected M365 tenants.

### Label Categories
- **Site Labels**: Labels with "Groups & sites" scope — applicable to SharePoint sites, Teams, and M365 Groups
- **File Labels**: Labels applicable to documents and files
- **All Labels**: Complete label inventory regardless of scope

### Label Properties
Each label displays:
- **Name**: Label display name from Purview
- **Color**: Visual indicator assigned in Purview
- **Description**: Label description and purpose
- **Protection**: Whether the label applies encryption or access restrictions
- **Priority**: Label ordering (higher priority takes precedence)
- **Scope**: Content formats the label applies to

### Important Notes
- Labels must be **published** in a label policy to be assignable via code
- The tenant admin must enable `EnableMIPLabels` in Entra for site-level labels
- Container labels govern collaboration surfaces, not documents within them

---

## Site Structures

The Structures page visualizes the architectural relationships between SharePoint sites.

### Hub Hierarchy Tab
Displays the hub site tree with nested relationships:
- **Root Hubs**: Top-level hub sites (shown in purple)
- **Child Hubs**: Hubs joined to a parent hub (shown in indigo)
- **Associated Sites**: Regular sites linked to a hub

Click any site in the hierarchy to navigate to its workspace details.

### Standalone Tab
Sites not associated with any hub. These may be candidates for hub association during governance review.

### Departments Tab
Sites grouped by their assigned department, useful for understanding organizational site distribution.

### How Hub Data Is Populated
Hub site data is fetched from the SharePoint REST API during tenant sync:
1. `SP.HubSites` endpoint returns all hub sites with their IDs and parent relationships
2. Per-site `_api/site` calls detect which hub each site is associated with
3. Hub enrichment is non-fatal — failures don't block the overall sync

---

## Provisioning

Request new SharePoint sites through governed templates.

### Creating a Provisioning Request
1. Navigate to **Provision New**
2. Select a site template (Deal Room, Portfolio Company, Department, Custom)
3. Enter the site details (name, description, department)
4. Assign a Primary Steward and Secondary Owner
5. Select a sensitivity label
6. Submit the request for approval

### Naming Conventions
- **Deal sites**: Automatically prefixed with `DEAL-`
- **Portfolio Company sites**: Automatically prefixed with `PORTCO-`
- Custom prefixes can be configured per template

### Approval Workflow
Provisioning requests follow an approval workflow based on your organization's configuration. Approved requests automatically create the SharePoint site with the specified settings.

---

## Tenant Management

### Connecting a New Tenant
1. Navigate to **Admin > Tenants**
2. Click **Add Tenant Connection**
3. Enter the tenant domain (e.g., `contoso.onmicrosoft.com`)
4. Initiate admin consent — the tenant admin will be redirected to Microsoft to approve Zenith's permissions
5. After consent is granted, the tenant appears as Active
6. Click **Sync** to pull site inventory

### Syncing Tenant Data
Sync fetches the latest data from your M365 tenant:
- SharePoint sites and properties
- Site usage reports (storage, activity, file counts)
- Drive owner and storage enrichment
- Purview sensitivity labels
- Hub site hierarchy (via SharePoint REST API)

### Demo Tenants
For testing, you can create demo tenants with sample data. Demo tenants have fake tenant IDs and cannot sync with real Microsoft services.

---

## Organization Settings

### Company Information
- Organization name and display settings
- Contact information
- Branding preferences

### User Management
- Invite users to your organization
- Assign roles (Governance Admin, Operator, Viewer, etc.)
- Manage user access and permissions

### Data Dictionaries
- Define custom metadata fields per tenant connection
- Configure dropdown options for categorization
- Set required vs. optional metadata fields

---

## User Roles & Permissions

| Role | Description | Key Capabilities |
|------|-------------|-----------------|
| **Platform Owner** | Full platform access | All capabilities, platform settings, user management |
| **Tenant Admin** | Tenant connection management | Add/remove tenants, configure sync, manage consent |
| **Governance Admin** | Governance policy management | Set labels, manage templates, review compliance |
| **Operator** | Day-to-day operations | Provision sites, update metadata, manage workspaces |
| **Viewer** | Read-only access | View dashboards, inventory, and reports |
| **Read-Only Auditor** | Audit access | View audit logs and compliance reports only |

---

## Service Plans

Zenith features are gated by service plan tier:

| Feature | Trial | Standard | Professional | Enterprise |
|---------|-------|----------|-------------|------------|
| Site Inventory | ✅ | ✅ | ✅ | ✅ |
| Governance Dashboard | ✅ | ✅ | ✅ | ✅ |
| Purview Labels | ✅ | ✅ | ✅ | ✅ |
| Hub Structures | ✅ | ✅ | ✅ | ✅ |
| Metadata Write-Back | ❌ | ✅ | ✅ | ✅ |
| Governed Provisioning | ❌ | ✅ | ✅ | ✅ |
| Copilot Dashboard | ❌ | ❌ | ✅ | ✅ |
| Advanced Reporting | ❌ | ❌ | ✅ | ✅ |
| Custom Workflows | ❌ | ❌ | ❌ | ✅ |
| API Access | ❌ | ❌ | ❌ | ✅ |

---

## Common Workflows

### Workflow: Onboard a New M365 Tenant
1. Admin navigates to Tenant Management
2. Add new tenant connection with domain
3. Initiate admin consent (tenant admin approves permissions)
4. Run initial sync to populate site inventory
5. Review discovered sites in Workspaces
6. Assign departments and metadata via Governance

### Workflow: Assess Copilot Readiness
1. Review the Copilot page for eligibility scores
2. Identify blocking factors per site
3. Remediate: apply sensitivity labels, assign owners, complete metadata
4. Re-sync to update eligibility status
5. Export readiness report for stakeholders

### Workflow: Review Governance Compliance
1. Open the Governance page
2. Filter for sites missing labels or owners
3. Use bulk edit to apply labels or assign ownership
4. Review the Structures page for hub association gaps
5. Export governance report

---

## Troubleshooting

### Sync Fails with Token Error
- Verify admin consent has been granted for the tenant
- Check that `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` are configured
- Ensure the Entra app registration has the required permissions

### Sensitivity Labels Not Appearing
- Labels must be published in a Purview label policy
- The `EnableMIPLabels` flag must be enabled in Entra directory settings
- Labels need "Groups & sites" scope for site-level application
- See the Purview troubleshooting section in the admin documentation

### Hub Sites Not Detected
- Hub site detection requires SharePoint REST API access
- The app registration needs `Sites.Read.All` permission
- Run a full tenant sync — hub enrichment happens during sync
- Hub detection is non-fatal; check sync results for hub-specific errors

### External Sharing Settings Not Showing
- Sharing capability data comes from SharePoint usage reports
- Reports may be delayed up to 48 hours from Microsoft
- Ensure `Reports.Read.All` permission is granted

### Can't Access Certain Features
- Check your assigned role in organization settings
- Some features require a higher service plan tier
- Contact your organization's Platform Owner for role changes
