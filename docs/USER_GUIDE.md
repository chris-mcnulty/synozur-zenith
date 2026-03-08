# Zenith User Guide

**Welcome to Zenith — Microsoft 365 Governance Platform**

Version 1.0 | Last Updated: March 8, 2026

---

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Dashboard Overview](#dashboard-overview)
4. [Site Inventory](#site-inventory)
5. [Workspace Details](#workspace-details)
6. [Governance](#governance)
7. [Governance Policies](#governance-policies)
8. [Policy Outcomes](#policy-outcomes)
9. [SharePoint Property Bag Writeback](#sharepoint-property-bag-writeback)
10. [Making Property Bag Values Searchable in SharePoint](#making-property-bag-values-searchable-in-sharepoint)
11. [Configuring Microsoft Purview Adaptive Scopes with Zenith Properties](#configuring-microsoft-purview-adaptive-scopes-with-zenith-properties)
12. [What-If Scenario Planner](#what-if-scenario-planner)
13. [Sensitivity Labels (Purview)](#sensitivity-labels-purview)
14. [Site Structures](#site-structures)
15. [Provisioning](#provisioning)
16. [CSV Export and Import](#csv-export-and-import)
17. [Document Library Inventory](#document-library-inventory)
18. [Tenant Management](#tenant-management)
19. [Organization Settings](#organization-settings)
20. [User Roles & Permissions](#user-roles--permissions)
21. [Service Plans](#service-plans)
22. [Common Workflows](#common-workflows)
23. [Troubleshooting](#troubleshooting)

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
- **Policy Outcomes**: Configurable governance outcomes that drive workspace fields, catalog columns, and Purview integration
- **Property Bag Writeback**: Push governance results to SharePoint property bags with automatic search indexing

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
- **Policy Outcome Columns**: Dynamic columns showing Pass/Fail for each configured outcome (see [Policy Outcomes](#policy-outcomes))

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
- Policy outcome results grouped by outcome name
- Per-outcome pass/fail status with rule-level breakdown
- Sensitivity label assignment and status
- External sharing capability
- Ownership compliance (primary + secondary owner)

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

### Dynamic Outcome Columns

The Governance workspace catalog dynamically displays columns for each policy outcome that has been configured as visible. These columns show Pass/Fail badges based on the most recent policy evaluation. Admins control which outcome columns appear and which are available as filters through the Policy Outcomes management panel in the Policy Builder.

### Governance Actions
- **Bulk Edit**: Update department, sensitivity label, or metadata for multiple sites at once
- **Filter by Compliance**: Find sites missing labels, owners, or metadata
- **Export Report**: Download governance report for stakeholder review

---

## Governance Policies

Governance policies define the rules that Zenith evaluates against each workspace. Each policy contains one or more rules that check workspace attributes such as:

- **Sensitivity label** — Does the site have an appropriate sensitivity label applied?
- **Department assignment** — Is a department assigned to the site?
- **Dual ownership** — Does the site have at least two owners?
- **Metadata completeness** — Are required metadata fields populated?
- **Sharing policy** — Is the site's sharing configuration within acceptable limits?

### Creating a Policy

1. Navigate to **Admin > Policy Builder**
2. Click **New Policy**
3. Give the policy a name and description
4. Assign an **Outcome** (see [Policy Outcomes](#policy-outcomes))
5. Add one or more rules
6. Set the status to **Active** to enable evaluation
7. Save the policy

### Policy Evaluation

Policies are evaluated automatically after a tenant sync and can also be triggered manually. Each workspace is checked against all active policies, and the results are stored for display in the workspace catalog and workspace detail panels. Evaluation is outcome-driven — each policy's result updates the workspace field and/or property bag key associated with its assigned outcome.

---

## Policy Outcomes

Policy Outcomes define **what each policy controls**. Instead of hardcoding what a policy means (e.g., "Copilot Readiness"), Zenith uses a configurable outcome system that determines what workspace fields a policy updates, what property bag keys it writes to SharePoint, and how its results appear in the workspace catalog.

### Built-In Outcomes

Every organization is automatically seeded with five built-in outcomes:

| Outcome | Key | Description |
|---|---|---|
| **Copilot Eligible** | `copilot_eligible` | Determines whether a workspace meets requirements for Microsoft 365 Copilot deployment. Maps to the `copilotReady` workspace field. |
| **External Sharing Approved** | `external_sharing` | Validates workspace external sharing configuration meets governance standards |
| **PII Approved** | `pii_approved` | Confirms workspace has appropriate controls for personally identifiable information |
| **Sensitive Data Approved** | `sensitive_data` | Validates workspace meets requirements for handling sensitive or classified data |
| **General Compliance** | `general_compliance` | Baseline governance compliance check for all workspaces |

### How Outcomes Work

- Each policy can be assigned to **one outcome** via the Policy Builder
- Each outcome can have **one policy** assigned to it at a time
- When a policy is evaluated, the result (PASS/FAIL) is associated with its outcome
- Outcomes with a `workspaceField` mapping (e.g., Copilot Eligible maps to `copilotReady`) automatically update the corresponding workspace field when the policy is evaluated
- Outcomes with a `propertyBagKey` mapping will have their evaluation result written to the SharePoint site's property bag during writeback

### Managing Outcomes

In the Policy Builder, the **Policy Outcomes** panel (collapsed by default at the top of the page) lets you:

- **Toggle column visibility** (eye icon) — Control which outcomes appear as columns in the workspace catalog
- **Toggle filter availability** (filter icon) — Control which outcomes are available as filters in the catalog
- **Add custom outcomes** — Create organization-specific outcomes beyond the five built-ins
- **Delete custom outcomes** — Remove custom outcomes (built-in outcomes cannot be deleted)

### Custom Outcomes

Governance Admins can create custom outcomes for organization-specific governance requirements. Custom outcomes can optionally include:

- A **property bag key** for SharePoint writeback (e.g., `ZenithRetentionCompliant`)
- A **workspace field** mapping (if a corresponding database field exists)

Custom outcomes appear in the Policy Builder's outcome selector and can be assigned to any policy.

---

## SharePoint Property Bag Writeback

Zenith can write governance policy evaluation results back to each SharePoint site's property bag. This creates a bridge between Zenith's governance decisions and SharePoint-native capabilities like search, Power Automate, and Microsoft Purview.

### Use Cases

- Making governance status visible to SharePoint search
- Enabling **Microsoft Purview Adaptive Scopes** to target sites by governance status (see [Configuring Purview Adaptive Scopes](#configuring-microsoft-purview-adaptive-scopes-with-zenith-properties))
- Creating SharePoint views filtered by governance properties
- Triggering Power Automate flows based on site governance state
- Reporting on governance posture through SharePoint search queries

### How It Works

1. **Configure a property bag key** on a policy's outcome or directly on the policy (e.g., `ZenithCopilotReady`)
2. **Choose a value format**:
   - `PASS_FAIL` — Writes `PASS` or `FAIL` (default, recommended for Purview)
   - `READY_NOTREADY` — Writes `Ready` or `Not Ready`
   - `SCORE_DATE` — Writes `PASS|3/5|2026-03-08` (result, score, evaluation date)
3. **Trigger a writeback** — Use the bulk writeback function from Admin, or let it happen automatically during sync
4. Zenith writes the value to the site's property bag via SharePoint CSOM

### Automatic Search Indexing

When Zenith writes a property bag value, it **automatically adds the key to `vti_indexedpropertykeys`** on the SharePoint site. This is a critical step that makes the property visible to SharePoint's search crawler.

Specifically, Zenith:

1. Reads the existing `vti_indexedpropertykeys` value from the site
2. Encodes the new property bag key as **Base64 UTF-16LE** (the format SharePoint requires)
3. Appends the encoded key to the pipe-delimited list (without duplicating existing entries)
4. Writes the updated `vti_indexedpropertykeys` value back via CSOM

This means you do **not** need to manually add keys to `vti_indexedpropertykeys` — Zenith handles it automatically every time it writes a property bag value.

### Permissions Required

To write property bags, the authenticated user must be a **Site Collection Administrator** or **Site Owner** on the target SharePoint site. If permissions are insufficient, Zenith saves the evaluation result locally but reports the writeback as failed with a clear error message.

---

## Making Property Bag Values Searchable in SharePoint

After Zenith writes and indexes a property bag value, additional one-time configuration is needed in the SharePoint Admin Center to make the values fully searchable and usable in Purview Adaptive Scopes.

### Step 1: Wait for the Search Crawl

After Zenith writes the property bag values, SharePoint's search crawler must process the sites. This typically takes anywhere from a few minutes to several hours, depending on crawl schedules.

**To speed this up for a specific site:**

1. Go to the SharePoint site → **Site Settings** (gear icon → Site Information → View all site settings)
2. Under **Search**, click **Search and Offline Availability**
3. Click **Reindex site**
4. Confirm the reindex request

**To speed this up for the entire tenant:**

This cannot be done from the UI at tenant level. You would need to use PowerShell:

```powershell
# Requires PnP PowerShell module
Connect-PnPOnline -Url "https://contoso-admin.sharepoint.com" -Interactive
$sites = Get-PnPTenantSite
foreach ($site in $sites) {
    Request-PnPReindexWeb -Identity $site.Url
}
```

### Step 2: Verify the Crawled Property Exists

1. Go to the **SharePoint Admin Center** → **More features** → **Search**
2. Click **Manage Search Schema**
3. In the **Crawled Properties** tab, search for your property key
4. Zenith-written properties will appear with the prefix `ows_` (e.g., `ows_ZenithCopilotReady`)
5. If you don't see it, the crawl hasn't processed the site yet — wait and check again

### Step 3: Map the Crawled Property to a Managed Property

1. Still in **Manage Search Schema**, switch to the **Managed Properties** tab
2. Click **New Managed Property**
3. Configure:
   - **Property name**: Use a clear name (e.g., `ZenithCopilotReady`)
   - **Type**: Text
   - **Searchable**: Yes
   - **Queryable**: Yes (required for Purview Adaptive Scopes)
   - **Retrievable**: Yes
   - **Refinable**: Yes (recommended — enables use as a filter)
4. Under **Mappings to crawled properties**, click **Add a mapping**
5. Search for and select the crawled property (e.g., `ows_ZenithCopilotReady`)
6. Save the managed property

Alternatively, you can map to an existing `RefinableStringXX` managed property if you want to avoid creating new ones. Note the property name you choose — you will need it exactly for Purview.

### Step 4: Wait for Another Crawl

After creating the managed property mapping, another search crawl is needed to populate the managed property with values. Again, you can request a reindex to speed this up.

### Step 5: Verify the Managed Property Is Working

Use SharePoint search to confirm the property is queryable:

1. Go to any SharePoint site's search box
2. Search for: `ZenithCopilotReady:PASS`
3. If results appear, the managed property is working correctly

---

## Configuring Microsoft Purview Adaptive Scopes with Zenith Properties

Once your Zenith property bag values are mapped to managed properties in SharePoint search (see previous section), you can use them in **Microsoft Purview Adaptive Scopes**. This allows you to apply retention policies, sensitivity labels, or records management rules only to sites that meet (or fail) specific governance criteria set in Zenith.

### What Are Adaptive Scopes?

Adaptive Scopes are dynamic filters in Microsoft Purview that automatically include or exclude content locations (SharePoint sites, OneDrive accounts, Exchange mailboxes) based on property queries. Unlike static scopes, Adaptive Scopes continuously re-evaluate membership — as Zenith updates property bag values and SharePoint recrawls, sites automatically move in or out of scope.

### Creating an Adaptive Scope with Zenith Properties

1. Go to the **Microsoft Purview compliance portal** (compliance.microsoft.com)
2. Navigate to **Data lifecycle management** → **Adaptive scopes** (or **Records management** → **Adaptive scopes**)
3. Click **Create scope**
4. Give the scope a name (e.g., "Copilot-Ready SharePoint Sites")
5. For scope type, select **SharePoint sites**
6. In the query builder:
   - Under **Site properties**, look for your managed property name
   - If your managed property doesn't appear in the dropdown, select **Custom property** and type the managed property name exactly (case-sensitive)
   - Set the condition (e.g., `ZenithCopilotReady` **is equal to** `PASS`)
7. Save the scope

### Example Adaptive Scope Configurations

| Use Case | Managed Property | Condition | Value |
|---|---|---|---|
| Apply retention only to Copilot-ready sites | `ZenithCopilotReady` | is equal to | `PASS` |
| Restrict external sharing on non-compliant sites | `ZenithExternalSharing` | is equal to | `FAIL` |
| Apply sensitivity labels to PII-approved sites | `ZenithPIIApproved` | is equal to | `PASS` |
| Target general compliance failures for review | `ZenithGeneralCompliance` | is equal to | `FAIL` |

### Using the Adaptive Scope in a Purview Policy

After creating the Adaptive Scope:

1. Create or edit a **Retention Policy**, **Sensitivity Label Policy**, or **Records Management Policy** in Purview
2. When choosing locations, select **Adaptive scopes**
3. Select your Zenith-based scope (e.g., "Copilot-Ready SharePoint Sites")
4. Complete the policy configuration and publish

### Important Considerations

- **Crawl latency**: There is always a delay between Zenith updating a property bag value and Purview reflecting the change. SharePoint search must recrawl the site and update the managed property before Purview's Adaptive Scope query picks up the change. Expect a delay of **4–24 hours** in most tenants.
- **Case sensitivity**: Managed property names in Purview's query builder are case-sensitive. Ensure the property name matches exactly what you configured in the search schema.
- **Value format matters**: Use the `PASS_FAIL` value format in Zenith for the simplest Purview queries. The `SCORE_DATE` format includes pipes and additional data that may be harder to query against.
- **One policy per outcome**: Since each Zenith outcome maps to one policy, the property bag value reflects the result of that single policy's evaluation. If you reassign an outcome to a different policy, the property bag value will update on the next writeback.
- **Scope evaluation frequency**: Purview evaluates Adaptive Scope membership approximately every 1–3 days. Combined with search crawl latency, expect a total delay of up to **2–4 days** from when Zenith writes a property bag value to when a Purview policy is applied or removed from a site.
- **License requirements**: Adaptive Scopes require **Microsoft 365 E5**, **E5 Compliance**, or **E5 Information Governance** licenses.

### End-to-End Flow Summary

```
Zenith evaluates policy
    → Writes result to SharePoint property bag (e.g., ZenithCopilotReady = PASS)
    → Automatically adds key to vti_indexedpropertykeys (makes it a crawled property)
        → SharePoint search crawler picks up the crawled property
            → Admin maps crawled property to a managed property (one-time setup in SPO Admin Center)
                → SharePoint search recrawls to populate managed property values
                    → Purview Adaptive Scope queries the managed property
                        → Purview policy applies to matching sites
```

---

## What-If Scenario Planner

The What-If Scenario Planner lets you simulate policy rule changes against all workspaces before applying them to a live policy.

1. Open a policy in the **Policy Builder**
2. Click **What-If**
3. Modify rules in the simulation (add, remove, or change thresholds)
4. View a diff showing which workspaces would newly pass or fail under the simulated rules
5. Decide whether to apply the changes to the live policy

This is useful for understanding the blast radius of a rule change before it affects governance evaluations and writeback.

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

## CSV Export and Import

### Exporting Workspaces

Export your workspace inventory to CSV from the workspace catalog. The export includes all standard fields plus any custom fields (prefixed with `CF:` in the column headers).

### Importing Changes

1. Click **Import** in the workspace catalog
2. Upload a CSV file (must include a `Site URL` column for matching)
3. Zenith performs a **dry-run preview** showing what will change
4. Review the changes and confirm to apply

Editable fields via import: Department, Cost Center, Project Code, Owners, Project Type, Sensitivity, Description, and any custom fields.

---

## Document Library Inventory

Zenith tracks document libraries as first-class inventory entities. Click any library row in the Document Libraries page to open a detail panel showing:

- **Content Types** configured on the library
- **Custom Columns** defined on the library
- **Syntex/AI Models** applied to the library
- **All Columns** (full column inventory fetched live from Microsoft Graph)

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
| **Governance Admin** | Governance policy management | Create/manage policies, outcomes, review compliance |
| **Operator** | Day-to-day operations | Provision sites, update metadata, trigger writebacks |
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

### Workflow: Configure Policy Outcomes and Purview Integration
1. Open **Admin > Policy Builder** and expand the **Policy Outcomes** panel
2. Review the five built-in outcomes; add custom outcomes if needed
3. Toggle column visibility and filter availability for each outcome
4. Create or edit a governance policy and assign it to an outcome
5. Configure a **property bag key** on the outcome or policy (e.g., `ZenithCopilotReady`)
6. Run a sync or manual evaluation to generate policy results
7. Trigger a **bulk writeback** to push results to SharePoint property bags
8. In the **SharePoint Admin Center**, map the crawled property (`ows_ZenithCopilotReady`) to a managed property
9. In the **Purview compliance portal**, create an Adaptive Scope using the managed property
10. Apply the Adaptive Scope to a retention or sensitivity label policy

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

### Property Bag Writeback Fails
- The authenticated user must be a **Site Collection Administrator** or **Site Owner** on the target site
- Ensure you are signed in via SSO (delegated SharePoint tokens are required for property bag writes)
- If the error mentions "Access denied", your account lacks sufficient permissions on that specific site
- Zenith saves the result locally even if the SharePoint writeback fails

### Crawled Property Not Appearing in Search Schema
- The search crawl may not have processed the site yet — wait up to 24 hours or trigger a manual reindex
- Verify the property bag value was actually written by checking the workspace detail panel in Zenith
- Ensure `vti_indexedpropertykeys` includes your property key (Zenith does this automatically)

### Purview Adaptive Scope Not Matching Sites
- Verify the managed property name in Purview matches exactly (case-sensitive) what you configured in the search schema
- Confirm the managed property has values by searching in SharePoint (e.g., `ZenithCopilotReady:PASS`)
- Adaptive Scopes re-evaluate every 1–3 days — allow time for the scope to pick up changes
- Ensure the sites have been recrawled after the managed property mapping was created

### Can't Access Certain Features
- Check your assigned role in organization settings
- Some features require a higher service plan tier
- Contact your organization's Platform Owner for role changes
