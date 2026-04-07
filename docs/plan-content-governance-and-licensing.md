# Plan: Content Governance & Licensing Reporting for Zenith

## Overview

This plan adds two major feature areas to Zenith, inspired by competitive platforms but adapted to Zenith's existing multi-tenant architecture, policy engine, and Microsoft Graph integration:

1. **Content Governance Reporting** - Centralized visibility into SharePoint & OneDrive across risk, ownership, storage, and sharing
2. **Licensing Reporting & Optimization** - Visibility into M365 license usage, cost, and waste

---

## Feature 1: Content Governance Reporting

### What It Delivers

A dedicated **Content Governance** hub giving admins a centralized, cross-tenant view of SharePoint sites and OneDrive drives with reporting across four governance pillars: **Risk, Ownership, Storage, and Sharing**. End users get a **My OneDrive** self-service view.

### 1.1 New Database Tables

#### `content_governance_snapshots`
Point-in-time rollups computed from existing `workspaces`, `onedrive_inventory`, and `workspace_telemetry` tables. Enables trend analysis without re-querying live data.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| tenant_connection_id | varchar | FK to tenant_connections |
| snapshot_date | date | One row per tenant per day |
| total_sharepoint_sites | integer | |
| total_onedrive_accounts | integer | |
| inactive_onedrive_count | integer | No activity in 90+ days |
| unlicensed_onedrive_count | integer | User account disabled/unlicensed |
| orphaned_site_count | integer | Sites with 0 or 1 owner |
| sites_missing_labels | integer | No sensitivity label assigned |
| external_sharing_site_count | integer | External sharing enabled |
| anonymous_link_count | integer | Anyone-with-link shares |
| company_link_count | integer | Organization-wide shares |
| specific_people_link_count | integer | Targeted external shares |
| total_storage_used_bytes | bigint | Aggregate across all sites |
| total_onedrive_storage_used_bytes | bigint | Aggregate across OneDrives |
| sites_over_quota_warning | integer | Sites at >80% quota |
| created_at | timestamp | |

#### `sharing_links_inventory`
Per-site/per-drive sharing link details discovered via Graph API.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| tenant_connection_id | varchar | |
| resource_type | text | SHAREPOINT_SITE, ONEDRIVE |
| resource_id | text | Site ID or Drive ID |
| resource_name | text | Display name |
| link_id | text | Graph sharing link ID |
| link_type | text | anonymous, organization, specific |
| link_scope | text | read, write, review |
| created_by | text | UPN of link creator |
| created_at_graph | timestamp | When the link was created in M365 |
| expires_at | timestamp | Null if no expiry |
| is_active | boolean | |
| last_accessed_at | timestamp | If available from Graph |
| last_discovered_at | timestamp | |
| created_at | timestamp | |

#### `governance_review_tasks`
Automated or manually triggered review tasks.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| tenant_connection_id | varchar | |
| organization_id | varchar | |
| review_type | text | SHARING_REVIEW, OWNERSHIP_REVIEW, STORAGE_REVIEW, INACTIVE_REVIEW |
| trigger_type | text | MANUAL, THRESHOLD, SCHEDULED |
| trigger_config | jsonb | Threshold values, schedule cron, etc. |
| status | text | PENDING, IN_PROGRESS, COMPLETED, CANCELLED |
| target_resource_type | text | SHAREPOINT_SITE, ONEDRIVE, ALL |
| target_resource_ids | text[] | Specific resources, or empty for all |
| findings_count | integer | |
| resolved_count | integer | |
| assigned_to | varchar | User ID |
| due_date | timestamp | |
| completed_at | timestamp | |
| created_at | timestamp | |

#### `governance_review_findings`
Individual findings within a review task.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| review_task_id | varchar | FK to governance_review_tasks |
| resource_type | text | |
| resource_id | text | |
| resource_name | text | |
| finding_type | text | ANONYMOUS_LINK, EXPIRED_OWNER, OVER_QUOTA, INACTIVE_90D, etc. |
| severity | text | HIGH, MEDIUM, LOW, INFO |
| description | text | Human-readable description |
| recommended_action | text | |
| status | text | OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED |
| resolved_by | varchar | |
| resolved_at | timestamp | |
| created_at | timestamp | |

### 1.2 New & Modified Graph API Calls

Add to `server/services/graph.ts`:

| Function | Graph Endpoint | Purpose |
|---|---|---|
| `getSharingLinks(siteId)` | `GET /sites/{id}/drive/root/permissions` | Enumerate sharing links on a site's default drive |
| `getOneDriveSharingLinks(userId)` | `GET /users/{id}/drive/root/permissions` | Sharing links on a user's OneDrive |
| `getOneDriveUsageReport()` | `GET /reports/getOneDriveUsageAccountDetail` | Full OneDrive usage report (storage, activity, license status) |
| `getSharePointUsageReport()` | `GET /reports/getSharePointSiteUsageDetail` | Full SharePoint usage (already partially exists, extend) |
| `getUserLicenseStatus(userId)` | `GET /users/{id}/licenseDetails` | Check if user has active OneDrive license |
| `revokeSharingLink(siteId, linkId)` | `DELETE /sites/{id}/drive/root/permissions/{permId}` | Revoke a specific sharing link |

**Existing functions to leverage:**
- `fetchSharePointSites()` - already fetches site inventory
- `fetchSiteOwners()` - already fetches site ownership
- `fetchWorkspaceTelemetry()` - already captures storage metrics

### 1.3 New Backend Routes

#### `server/routes/content-governance.ts`

| Method | Path | Description |
|---|---|---|
| GET | `/api/content-governance/dashboard` | Aggregated stats across 4 pillars for selected tenant |
| GET | `/api/content-governance/risk` | Risk report: sites missing labels, no retention, external-facing |
| GET | `/api/content-governance/ownership` | Ownership report: orphaned sites, inactive OneDrives, unlicensed users |
| GET | `/api/content-governance/storage` | Storage report: usage breakdown, growth trends, quota warnings |
| GET | `/api/content-governance/sharing` | Sharing report: link inventory with filtering |
| GET | `/api/content-governance/sharing/links` | Paginated sharing links list |
| DELETE | `/api/content-governance/sharing/links/:id` | Revoke a sharing link |
| POST | `/api/content-governance/reviews` | Create a governance review task |
| GET | `/api/content-governance/reviews` | List review tasks |
| GET | `/api/content-governance/reviews/:id` | Review task details with findings |
| PATCH | `/api/content-governance/reviews/:id/findings/:findingId` | Update finding status |
| POST | `/api/content-governance/snapshot` | Trigger a governance snapshot |
| GET | `/api/content-governance/trends` | Storage/sharing/risk trends over time |
| GET | `/api/content-governance/my-onedrive` | End-user self-service view of their own OneDrive |

### 1.4 New Frontend Pages

#### `client/src/pages/app/content-governance.tsx` - Main Hub

Four-tab layout (Risk | Ownership | Storage | Sharing) with:
- **Summary cards** at top: total sites, total OneDrives, risk score, storage used
- **Risk tab**: Table of sites missing sensitivity labels, lacking retention policies, with external sharing enabled but no approval
- **Ownership tab**: Orphaned sites (0-1 owners), inactive OneDrives (90+ days), unlicensed OneDrives (disabled user accounts)
- **Storage tab**: Storage usage bar charts by department/site type, growth trend line chart, quota warning list
- **Sharing tab**: Sharing link inventory table with filters (type, scope, created by, expiry), bulk revoke action

#### `client/src/pages/app/my-onedrive.tsx` - End-User Self-Service

Available to all roles (including `viewer`):
- Storage usage donut chart
- File count and last activity
- Active sharing links with ability to revoke own links
- Governance status (sensitivity label, retention)

#### `client/src/pages/app/governance-reviews.tsx` - Review Management

For `governance_admin+`:
- List of active/past reviews
- Create review wizard (pick type, set threshold triggers)
- Review detail view with findings table
- Bulk resolve/dismiss actions

### 1.5 Navigation Changes

Add to `app-shell.tsx` navGroups:

```
// Under "Insights & Intelligence" group:
{ name: "Content Governance", href: "/app/content-governance", icon: ShieldAlert }

// Under "Overview" group (available to all roles):
{ name: "My OneDrive", href: "/app/my-onedrive", icon: HardDrive }
```

### 1.6 Service Plan Gating

| Feature | TRIAL | STANDARD | PROFESSIONAL | ENTERPRISE |
|---|---|---|---|---|
| Content Governance Dashboard | - | Read-only | Full | Full |
| Sharing Link Inventory | - | - | Read-only | Full + Revoke |
| Governance Reviews | - | - | Manual only | Manual + Automated |
| My OneDrive (self-service) | - | Basic | Full | Full |
| Trend Analysis | - | - | 30 days | Unlimited |

Add to `PLAN_FEATURES`:
```typescript
contentGovernanceDashboard: false | "readonly" | "full",
sharingLinkManagement: false | "readonly" | "full",
governanceReviews: false | "manual" | "full",
myOneDriveSelfService: false | "basic" | "full",
trendRetentionDays: 0 | 30 | 90 | -1 (unlimited),
```

### 1.7 Automated Review Triggers

New service: `server/services/governance-review-engine.ts`

Threshold-based triggers (ENTERPRISE tier only):
- **Storage threshold**: Auto-create review when any site exceeds X% of quota
- **Inactive threshold**: Auto-flag OneDrives inactive for X days
- **Sharing spike**: Auto-review sites where anonymous link count exceeds X
- **Ownership gap**: Auto-flag sites where owner count drops below 2

Triggers are evaluated during the existing inventory sync cycle and create `governance_review_tasks` entries.

---

## Feature 2: Licensing Reporting & Optimization

### What It Delivers

A **Licensing** hub that pulls M365 license data via Graph API, combines it with Zenith's user/tenant knowledge, and surfaces spend analysis, waste detection, and optimization recommendations.

### 2.1 New Database Tables

#### `license_subscriptions`
Tracks M365 subscriptions (SKUs) in the tenant.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| tenant_connection_id | varchar | |
| sku_id | text | M365 SKU GUID |
| sku_part_number | text | e.g. ENTERPRISEPACK, SPE_E5 |
| display_name | text | Friendly name |
| total_units | integer | Purchased count |
| consumed_units | integer | Assigned count |
| suspended_units | integer | |
| warning_units | integer | |
| enabled_service_plans | jsonb | Array of included service plan names |
| custom_price_per_unit | numeric(10,2) | Admin-overridable price |
| billing_cycle | text | MONTHLY, ANNUAL |
| last_synced_at | timestamp | |
| created_at | timestamp | |

#### `license_assignments`
Per-user license assignment detail.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| tenant_connection_id | varchar | |
| user_id | text | M365 user object ID |
| user_principal_name | text | |
| user_display_name | text | |
| user_department | text | |
| user_job_title | text | |
| account_enabled | boolean | Is the Entra account active? |
| last_sign_in_date | text | From signInActivity |
| sku_id | text | |
| sku_part_number | text | |
| assigned_date | text | |
| disabled_plans | text[] | Service plans disabled within SKU |
| last_synced_at | timestamp | |
| created_at | timestamp | |

#### `license_optimization_rules`
Admin-configurable rules for detecting waste.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| tenant_connection_id | varchar | |
| organization_id | varchar | |
| rule_type | text | INACTIVE_USER, DISABLED_ACCOUNT, OVERLAP_DETECTION, UNASSIGNED_LICENSE |
| config | jsonb | Thresholds (e.g. inactive_days: 90) |
| is_active | boolean | |
| created_at | timestamp | |

#### `license_optimization_findings`
Results from running optimization rules.

| Column | Type | Notes |
|---|---|---|
| id | varchar PK | UUID |
| tenant_connection_id | varchar | |
| rule_id | varchar | FK to license_optimization_rules |
| finding_type | text | Same as rule_type |
| user_id | text | Affected user (if applicable) |
| user_principal_name | text | |
| sku_id | text | Affected SKU |
| sku_display_name | text | |
| estimated_monthly_savings | numeric(10,2) | |
| description | text | |
| status | text | OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED |
| resolved_at | timestamp | |
| created_at | timestamp | |

### 2.2 New Graph API Calls

Add to `server/services/graph.ts`:

| Function | Graph Endpoint | Purpose |
|---|---|---|
| `getSubscribedSkus()` | `GET /subscribedSkus` | List all license SKUs in the tenant |
| `getUserLicenses(userId)` | `GET /users/{id}/licenseDetails` | Get assigned licenses for a user |
| `getAllUserLicenses()` | `GET /users?$select=id,displayName,userPrincipalName,department,jobTitle,accountEnabled,assignedLicenses,signInActivity` | Bulk fetch user license info |
| `getServicePlanDetails(skuId)` | `GET /subscribedSkus/{id}` | Get service plan breakdown within a SKU |

**Note:** `signInActivity` requires `AuditLog.Read.All` permission and Entra ID P1/P2 licensing.

### 2.3 New Backend Routes

#### `server/routes/licensing.ts`

| Method | Path | Description |
|---|---|---|
| GET | `/api/licensing/dashboard` | Summary: total spend, assigned vs unassigned, waste estimate |
| GET | `/api/licensing/subscriptions` | List all SKUs with unit counts and pricing |
| PATCH | `/api/licensing/subscriptions/:id/price` | Set custom price per unit |
| GET | `/api/licensing/assignments` | Paginated user license assignments with filters |
| GET | `/api/licensing/assignments/export` | CSV export of assignments |
| POST | `/api/licensing/sync` | Trigger license data sync from Graph |
| GET | `/api/licensing/optimization` | Optimization findings summary |
| GET | `/api/licensing/optimization/findings` | Paginated findings list |
| PATCH | `/api/licensing/optimization/findings/:id` | Update finding status |
| GET | `/api/licensing/optimization/rules` | List optimization rules |
| POST | `/api/licensing/optimization/rules` | Create/update optimization rule |
| GET | `/api/licensing/overlap` | Detect overlapping SKUs with redundant service plans |
| GET | `/api/licensing/trends` | License usage trends over time |

### 2.4 New Frontend Pages

#### `client/src/pages/app/licensing.tsx` - Main Hub

Three-tab layout (Overview | Assignments | Optimization):

- **Overview tab**:
  - KPI cards: Total Monthly Spend, Assigned / Total Licenses, Waste Estimate, Optimization Score
  - License utilization table: SKU name, purchased, assigned, unassigned, cost/unit, total cost
  - Editable price column (admins can set custom pricing to match their EA/CSP agreements)
  
- **Assignments tab**:
  - User-level table: name, UPN, department, licenses, account status, last sign-in
  - Filters: SKU, department, account status (enabled/disabled), activity (active/inactive)
  - Color-coded rows: red for disabled accounts with licenses, amber for inactive 90+ days
  - CSV export button

- **Optimization tab**:
  - Findings cards grouped by type:
    - **Unassigned Licenses**: SKUs with available units going to waste
    - **Disabled Accounts**: Disabled users still consuming licenses
    - **Inactive Users**: Users with no sign-in for 90+ days
    - **Overlapping Licenses**: Users with multiple SKUs containing duplicate service plans (e.g., E3 + E5)
  - Each finding shows estimated savings
  - Bulk acknowledge/dismiss/resolve actions
  - Configurable rule thresholds

#### `client/src/pages/app/licensing-overlap.tsx` - Overlap Detail

Visual matrix showing which service plans overlap across SKUs assigned to the same user. Helps identify where a user has E3 + E5 (E3 is fully redundant).

### 2.5 Navigation Changes

Add to `app-shell.tsx` navGroups, under a new **"Cost & Licensing"** group:

```
{
  label: "Cost & Licensing",
  minRole: "operator",
  items: [
    { name: "License Overview", href: "/app/licensing", icon: CreditCard },
  ]
}
```

### 2.6 Service Plan Gating

| Feature | TRIAL | STANDARD | PROFESSIONAL | ENTERPRISE |
|---|---|---|---|---|
| License Overview | - | Read-only | Full | Full |
| Custom Pricing | - | - | Yes | Yes |
| Optimization Findings | - | - | Basic | Full + Overlap |
| CSV Export | - | Yes | Yes | Yes |
| Trend Analysis | - | - | 30 days | Unlimited |

Add to `PLAN_FEATURES`:
```typescript
licensingDashboard: false | "readonly" | "full",
licensingCustomPricing: boolean,
licensingOptimization: false | "basic" | "full",
```

### 2.7 License Sync Service

New service: `server/services/license-sync.ts`

- Runs on-demand (POST `/api/licensing/sync`) or as part of tenant inventory sync
- Fetches `subscribedSkus` and bulk user license assignments
- Upserts into `license_subscriptions` and `license_assignments`
- After sync, runs optimization rules and generates findings
- Stores last sync timestamp on tenant connection

---

## Implementation Phases

### Phase 1: Foundation (Schema + Graph + Basic API)
1. Add all new database tables via Drizzle migrations
2. Implement new Graph API functions in `graph.ts`
3. Add `contentGovernanceEnabled` and `licensingEnabled` feature toggles to `tenant_connections`
4. Add new plan features to `PLAN_FEATURES` constant
5. Create skeleton route files registered in `routes.ts`

### Phase 2: Content Governance Backend
1. Implement snapshot computation service (aggregates from existing tables)
2. Implement sharing link discovery service
3. Build content governance API routes (dashboard, risk, ownership, storage, sharing)
4. Add governance review task CRUD

### Phase 3: Content Governance Frontend
1. Build Content Governance hub page with 4-tab layout
2. Build My OneDrive self-service page
3. Build Governance Reviews management page
4. Add navigation entries and route guards
5. Wire up to backend APIs

### Phase 4: Licensing Backend
1. Implement license sync service
2. Implement optimization rule engine
3. Implement overlap detection algorithm
4. Build licensing API routes

### Phase 5: Licensing Frontend
1. Build Licensing hub page with 3-tab layout
2. Build overlap detail page
3. Add CSV export functionality
4. Add navigation entries and route guards

### Phase 6: Automated Reviews & Polish
1. Implement threshold-based governance review triggers
2. Add trend computation jobs
3. Add audit logging for all new actions
4. End-to-end testing and service plan gating verification

---

## Graph API Permissions Required

New permissions needed beyond current set:

| Permission | Type | Purpose |
|---|---|---|
| `Reports.Read.All` | Application | OneDrive/SharePoint usage reports |
| `Sites.Read.All` | Application | Already likely present; sharing link enumeration |
| `Files.Read.All` | Application | Drive permission enumeration |
| `Directory.Read.All` | Application | License and user data |
| `AuditLog.Read.All` | Application | Sign-in activity (requires Entra P1+) |
| `Organization.Read.All` | Application | Subscribed SKUs |

---

## Key Architectural Decisions

1. **Snapshot-based reporting**: Governance stats are snapshotted daily rather than computed on-the-fly, enabling trend analysis and avoiding expensive live queries
2. **Leverage existing tables**: OneDrive inventory, workspace telemetry, and site ownership data already exist - governance reporting aggregates from these
3. **Review task pattern**: Follows the same CRUD + status pattern as existing provisioning requests
4. **Custom pricing**: License costs stored per-tenant since EA/CSP pricing varies by customer
5. **Overlap detection**: Computed by comparing service plan arrays across SKUs assigned to the same user
6. **Self-service boundary**: End users (viewer role) can only see their own OneDrive data and revoke their own sharing links - no cross-user visibility
