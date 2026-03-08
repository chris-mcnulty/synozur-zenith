# Zenith User Guide

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Workspace Catalog](#workspace-catalog)
4. [Governance Policies](#governance-policies)
5. [Policy Outcomes](#policy-outcomes)
6. [SharePoint Property Bag Writeback](#sharepoint-property-bag-writeback)
7. [Making Property Bag Values Searchable in SharePoint](#making-property-bag-values-searchable-in-sharepoint)
8. [Configuring Microsoft Purview Adaptive Scopes with Zenith Properties](#configuring-microsoft-purview-adaptive-scopes-with-zenith-properties)
9. [CSV Export and Import](#csv-export-and-import)
10. [Document Library Inventory](#document-library-inventory)
11. [What-If Scenario Planner](#what-if-scenario-planner)
12. [Roles and Permissions](#roles-and-permissions)

---

## Overview

Zenith is a Microsoft 365 governance platform for The Synozur Alliance. It provides governed SharePoint site provisioning, site inventory tracking, sensitivity label enforcement, and Copilot eligibility explainability. Zenith manages SharePoint sites (Team Sites, Communication Sites, and Hub Sites) with optional Microsoft Teams connectivity.

---

## Getting Started

### Signing In

Zenith supports two authentication methods:

- **Microsoft Entra ID SSO** — Sign in with your organizational Microsoft account. This is the recommended method for production use.
- **Email and Password** — A secondary login option for users without Entra ID access.

### Selecting a Tenant

After signing in, select the M365 tenant you want to manage. If you belong to multiple organizations, you will see all your available tenants listed.

### Connecting a New Tenant

Tenant Admins can onboard new M365 tenants through the self-service flow:

1. Navigate to **Admin > Tenants**
2. Enter the tenant domain (e.g., `contoso.onmicrosoft.com`)
3. Complete the Microsoft admin consent flow
4. Zenith auto-discovers the tenant name and links it to your organization

---

## Workspace Catalog

The workspace catalog is the central inventory of all SharePoint sites in your connected tenants. It displays:

- Site name, URL, and type (Team Site, Communication Site, Hub Site)
- Department, cost center, and project code
- Sensitivity labels
- Site owners
- Policy outcome columns (dynamically configured — see [Policy Outcomes](#policy-outcomes))
- Custom fields defined by your organization

### Filtering and Sorting

Use the filter drawer to narrow the catalog by site type, department, sensitivity, hub membership, and policy outcome status. Quick filter chips are available for common filters.

### Syncing Inventory

Trigger a full tenant sync from the Admin panel to pull the latest site data from Microsoft Graph. Zenith merges Graph group owners and SharePoint site collection admins to build a complete ownership picture.

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

Policies are evaluated automatically after a tenant sync and can also be triggered manually. Each workspace is checked against all active policies, and the results are stored for display in the workspace catalog and detail panels.

---

## Policy Outcomes

Policy Outcomes define **what each policy controls**. Instead of hardcoding what a policy means (e.g., "Copilot Readiness"), Zenith uses a configurable outcome system.

### Built-In Outcomes

Every organization is seeded with five built-in outcomes:

| Outcome | Key | Description |
|---|---|---|
| **Copilot Eligible** | `copilot_eligible` | Determines whether a workspace meets requirements for Microsoft 365 Copilot deployment |
| **External Sharing Approved** | `external_sharing` | Validates workspace external sharing configuration meets governance standards |
| **PII Approved** | `pii_approved` | Confirms workspace has appropriate controls for personally identifiable information |
| **Sensitive Data Approved** | `sensitive_data` | Validates workspace meets requirements for handling sensitive or classified data |
| **General Compliance** | `general_compliance` | Baseline governance compliance check for all workspaces |

### How Outcomes Work

- Each policy can be assigned to **one outcome** via the Policy Builder
- Each outcome can have **one policy** assigned to it at a time
- When a policy is evaluated, the result (PASS/FAIL) is associated with its outcome
- Outcomes with a `workspaceField` mapping (e.g., Copilot Eligible maps to `copilotReady`) automatically update the corresponding workspace field

### Managing Outcomes

In the Policy Builder, the **Policy Outcomes** panel (collapsed by default) lets you:

- **Toggle column visibility** — Control which outcomes appear as columns in the workspace catalog (eye icon)
- **Toggle filter availability** — Control which outcomes are available as filters in the catalog (filter icon)
- **Add custom outcomes** — Create organization-specific outcomes beyond the five built-ins
- **Delete custom outcomes** — Remove custom outcomes (built-in outcomes cannot be deleted)

### Custom Outcomes

Admins can create custom outcomes for organization-specific governance requirements. Custom outcomes can optionally include:

- A **property bag key** for SharePoint writeback
- A **workspace field** mapping (if a corresponding database field exists)

---

## SharePoint Property Bag Writeback

Zenith can write governance policy evaluation results back to each SharePoint site's property bag. This is useful for:

- Making governance status visible to SharePoint search
- Enabling Microsoft Purview Adaptive Scopes to target sites by governance status
- Creating SharePoint views filtered by governance properties
- Integrating with Power Automate flows that read site properties

### How It Works

1. **Configure a property bag key** on a policy or its outcome (e.g., `ZenithCopilotReady`)
2. **Choose a value format**:
   - `PASS_FAIL` — Writes `PASS` or `FAIL` (default)
   - `READY_NOTREADY` — Writes `Ready` or `Not Ready`
   - `SCORE_DATE` — Writes `PASS|3/5|2026-03-08` (result, score, date)
3. **Trigger a writeback** — Use the bulk writeback function from Admin or let it happen automatically during sync
4. Zenith writes the value to the site's property bag via SharePoint CSOM

### Automatic Search Indexing

When Zenith writes a property bag value, it **automatically adds the key to `vti_indexedpropertykeys`** on the SharePoint site. This is a critical step that makes the property visible to SharePoint's search crawler.

Specifically, Zenith:

1. Reads the existing `vti_indexedpropertykeys` value from the site
2. Encodes the new property bag key as **Base64 UTF-16LE** (the format SharePoint requires)
3. Appends the encoded key to the pipe-delimited list (without duplicating existing entries)
4. Writes the updated `vti_indexedpropertykeys` value back via CSOM

This means you do **not** need to manually add keys to `vti_indexedpropertykeys` — Zenith handles it automatically.

### Permissions Required

To write property bags, the authenticated user must be a **Site Collection Administrator** or **Site Owner** on the target SharePoint site. If permissions are insufficient, Zenith saves the evaluation result locally but reports the writeback as failed with a clear error message.

---

## Making Property Bag Values Searchable in SharePoint

After Zenith writes and indexes a property bag value, you need to perform additional configuration in SharePoint and the Microsoft 365 admin center to make the values fully searchable and usable in Purview.

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

Alternatively, you can map to an existing `RefinableStringXX` managed property if you want to avoid creating new ones. Note the property name you choose — you will need it for Purview.

### Step 4: Wait for Another Crawl

After creating the managed property mapping, another search crawl is needed to populate the managed property with values. Again, you can request a reindex to speed this up.

### Step 5: Verify the Managed Property Is Working

Use SharePoint search to confirm the property is queryable:

1. Go to any SharePoint site's search box
2. Search for: `ZenithCopilotReady:PASS`
3. If results appear, the managed property is working correctly

---

## Configuring Microsoft Purview Adaptive Scopes with Zenith Properties

Once your Zenith property bag values are mapped to managed properties in SharePoint search (see previous section), you can use them in **Microsoft Purview Adaptive Scopes**. This allows you to apply retention policies, sensitivity labels, or records management rules only to sites that meet (or fail) specific governance criteria.

### What Are Adaptive Scopes?

Adaptive Scopes are dynamic filters in Microsoft Purview that automatically include or exclude content locations (SharePoint sites, OneDrive accounts, Exchange mailboxes) based on property queries. Unlike static scopes, Adaptive Scopes continuously re-evaluate membership — as Zenith updates property bag values, sites automatically move in or out of scope.

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

### Using the Adaptive Scope in a Policy

After creating the Adaptive Scope:

1. Create or edit a **Retention Policy**, **Sensitivity Label Policy**, or **Records Management Policy** in Purview
2. When choosing locations, select **Adaptive scopes**
3. Select your Zenith-based scope (e.g., "Copilot-Ready SharePoint Sites")
4. Complete the policy configuration and publish

### Important Considerations

- **Crawl latency**: There is always a delay between Zenith updating a property bag value and Purview reflecting the change. This is because SharePoint search must recrawl the site and update the managed property before Purview's Adaptive Scope query picks up the change. Expect a delay of **4–24 hours** in most tenants.
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
            → Admin maps crawled property to a managed property (one-time setup)
                → SharePoint search recrawls to populate managed property values
                    → Purview Adaptive Scope queries the managed property
                        → Purview policy applies to matching sites
```

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

## What-If Scenario Planner

The What-If Scenario Planner lets you simulate policy rule changes before applying them.

1. Open a policy in the Policy Builder
2. Click **What-If**
3. Modify rules in the simulation (add, remove, or change thresholds)
4. View a diff showing which workspaces would newly pass or fail under the simulated rules
5. Decide whether to apply the changes to the live policy

---

## Roles and Permissions

Zenith uses Role-Based Access Control (RBAC) to gate access:

| Role | Description |
|---|---|
| **Platform Owner** | Full access to all features and all organizations |
| **Tenant Admin** | Manage tenant connections, Entra configuration, and all governance features |
| **Governance Admin** | Create and manage policies, outcomes, and governance settings |
| **Operator** | Run syncs, trigger writebacks, manage workspace metadata |
| **Viewer** | Read-only access to workspace catalog and governance status |
| **Read-Only Auditor** | Read-only access with audit log visibility |

Admin sections (Policy Builder, Tenant Management, Outcomes) are hidden from non-admin users in the sidebar navigation.
