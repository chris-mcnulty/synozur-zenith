# BL-039 — Job Monitor, Dataset Freshness & Pre-Report Refresh Prompts

**Design Document — Orbit-pattern Job Management for Zenith**

**Status:** Proposed
**Priority:** 🟠 High
**Depends on:** None (consolidates existing patterns)
**Supersedes:** `docs/design/job-scheduling-system.md` Phase 1 + Phase 3

---

## 1 Problem Statement

Zenith today runs **12+ background data-gathering jobs** across 8 different tracking tables, each with its own schema shape, status lifecycle, cancellation support (or lack thereof), and frontend polling logic. The result:

| Issue | Impact |
|-------|--------|
| **No unified view** of running jobs — admins check each feature page separately | Slow incident response; no way to see "what's running right now?" |
| **Inconsistent cancellation** — only 5 of 12 jobs check `isCancelled()`; the rest run to completion or crash | Admins cannot stop a runaway discovery |
| **No central dataset freshness model** — each report invents its own staleness check | Copilot Readiness, IA Assessment, and Governance Snapshots run on data of unknown age |
| **Ad-hoc refresh prompts** — only the Email Storage Report warns about stale user inventory | Users run expensive reports on week-old data without realising it |
| **No concurrency guard in most jobs** — only Copilot Prompt Assessment checks for an existing RUNNING row | Two admins can accidentally launch the same discovery simultaneously |

### What the Orbit pattern already solves

The sibling project **synozur-orbit** addresses all five issues with:
- A single `scheduled_job_runs` tracking table
- An in-memory `JobStatus` registry with `AbortController` per job
- A generic `trackJobRun<T>()` wrapper that creates/completes/fails the DB record automatically
- Concurrency guards (`isRunning` check before launch)
- A unified admin UI showing all jobs, their status, and manual trigger/cancel buttons

The existing design doc (`docs/design/job-scheduling-system.md`) described this architecture but deferred implementation. This plan takes the first actionable slice: **monitoring, cancellation, dataset freshness, and pre-report prompts** — without the cron scheduler (Phase 2 / future work).

---

## 2 Goals (this plan)

1. **Unified Job Monitor** — one backend registry + one admin page that shows every running or recent background job, with cancel capability.
2. **Dataset Freshness Registry** — a declarative map of "datasets" (user inventory, workspace list, sharing links, copilot interactions, …) with staleness thresholds, so any page can ask "is dataset X fresh enough?"
3. **Pre-Report Refresh Gate** — a reusable React component that checks required datasets before allowing a report/assessment to launch, offering one-click refresh for anything stale.

### Non-goals (deferred)

- Cron-style scheduling / automatic recurrence (future BL item)
- Job frequency configuration UI
- Webhook / email notifications on job completion
- Cross-tenant job coordination for MSPs

---

## 3 Architecture

### 3.1 Unified Job Registry (backend)

A single in-memory registry replaces the scattered per-service tracking. Every background job — regardless of which "run" table it also writes to — registers here.

```
server/services/job-registry.ts

┌─────────────────────────────────────────────────┐
│  activeJobs: Map<string, ActiveJob>             │
│                                                 │
│  ActiveJob {                                    │
│    jobId: string          (uuid)                │
│    jobType: JobType       (enum)                │
│    tenantConnectionId: string                   │
│    status: "running"                            │
│    startedAt: Date                              │
│    triggeredBy: "manual" | "system"             │
│    triggeredByUserId: number | null             │
│    abortController: AbortController             │
│    progressLabel: string  ("Scanning site 14…") │
│    progressPct: number | null                   │
│    meta: Record<string, unknown>                │
│  }                                              │
│                                                 │
│  Methods:                                       │
│    register(opts) → ActiveJob                   │
│    complete(jobId, result)                       │
│    fail(jobId, error)                            │
│    cancel(jobId) → void                         │
│    getActive(tenantConnectionId?) → ActiveJob[]  │
│    isRunning(jobType, tenantConnectionId) → bool │
│    updateProgress(jobId, label, pct)             │
│    cleanupStale(maxAgeMs = 3_600_000)            │
└─────────────────────────────────────────────────┘
```

**JobType enum** (single source of truth):

```typescript
export const JOB_TYPES = {
  tenantSync:           { label: "Tenant Sync",               dataset: "workspaces" },
  sharingLinkDiscovery: { label: "Sharing Link Discovery",    dataset: "sharingLinks" },
  oneDriveInventory:    { label: "OneDrive Inventory",        dataset: "onedriveInventory" },
  teamsInventory:       { label: "Teams & Channels Inventory", dataset: "teamsInventory" },
  teamsRecordings:      { label: "Recordings Discovery",      dataset: "recordings" },
  userInventory:        { label: "User Inventory",            dataset: "userInventory" },
  copilotSync:          { label: "Copilot Interaction Sync",  dataset: "copilotInteractions" },
  copilotAssessment:    { label: "Copilot Prompt Assessment", dataset: "copilotAssessments" },
  iaAssessment:         { label: "IA Health Assessment",      dataset: "iaAssessment" },
  emailStorageReport:   { label: "Email Storage Report",      dataset: "emailStorageReport" },
  governanceSnapshot:   { label: "Governance Snapshot",       dataset: "governanceSnapshot" },
  licenseSync:          { label: "License Sync",              dataset: "licenses" },
  iaSync:               { label: "IA Column Sync",            dataset: "iaColumns" },
} as const;

export type JobType = keyof typeof JOB_TYPES;
```

### 3.2 trackJobRun wrapper

A generic function that every job calls instead of managing its own try/catch/finally:

```typescript
async function trackJobRun<T>(
  jobType: JobType,
  tenantConnectionId: string,
  triggeredBy: "manual" | "system" | "scheduled",
  triggeredByUserId: number | null,
  work: (signal: AbortSignal, updateProgress: ProgressFn) => Promise<T>,
): Promise<{ jobId: string; result: T }>
```

Internally:
1. Checks `isRunning(jobType, tenantConnectionId)` → throws 409 if duplicate
2. Creates an `AbortController`
3. Calls `register()` to add to the in-memory map
4. Inserts a row in `scheduled_job_runs` (status = `running`)
5. Invokes `work(signal, updateProgress)`
6. On success: updates the row to `completed`, calls `complete(jobId, result)`
7. On failure/abort: updates to `failed` or `cancelled`, calls `fail(jobId, err)`
8. Runs in a `finally` block so the registry is always cleaned up

### 3.3 Scheduled Job Runs table

Reuse the schema from the existing design doc verbatim:

```
scheduled_job_runs
├── id: uuid (PK)
├── organization_id: integer (FK → organizations)
├── job_type: text
├── tenant_connection_id: text (nullable)
├── status: text  ("running" | "completed" | "failed" | "cancelled")
├── started_at: timestamp
├── completed_at: timestamp (nullable)
├── duration_ms: integer (nullable, computed on completion)
├── result: jsonb (nullable — structured output)
├── error_message: text (nullable)
├── triggered_by: text ("manual" | "system" | "scheduled")
├── triggered_by_user_id: integer (nullable)
├── target_id: text (nullable — specific workspace or resource ID)
├── target_name: text (nullable — human-readable target description)
├── items_total: integer (nullable — for progress %)
├── items_processed: integer (nullable)
└── created_at: timestamp
```

This becomes the **single audit trail** for all jobs. The existing per-service "run" tables (`sharing_link_discovery_runs`, `copilot_sync_runs`, etc.) remain as-is for service-specific detail; `scheduled_job_runs` provides the cross-cutting view.

### 3.4 Dataset Freshness Registry

A declarative configuration that maps each "dataset" to its freshness rules:

```typescript
// server/services/dataset-freshness.ts

export interface DatasetDefinition {
  key: string;
  label: string;
  description: string;
  staleness: {
    warningAfterHours: number;   // amber indicator
    criticalAfterHours: number;  // red indicator — strongly recommend refresh
  };
  refreshJobType: JobType;
  getLastRefreshedAt: (tenantConnectionId: string) => Promise<Date | null>;
  /** Datasets this one depends on (e.g. emailStorageReport needs userInventory) */
  dependsOn?: string[];
}

export const DATASETS: DatasetDefinition[] = [
  {
    key: "workspaces",
    label: "Workspace Inventory",
    description: "Sites, groups, usage metrics, sensitivity labels",
    staleness: { warningAfterHours: 24, criticalAfterHours: 72 },
    refreshJobType: "tenantSync",
    getLastRefreshedAt: (tcId) => storage.getLastTenantSyncTime(tcId),
  },
  {
    key: "userInventory",
    label: "User Directory Cache",
    description: "Entra ID users — names, UPNs, departments",
    staleness: { warningAfterHours: 48, criticalAfterHours: 168 },
    refreshJobType: "userInventory",
    getLastRefreshedAt: (tcId) => storage.getLatestUserInventoryCompletedAt(tcId),
  },
  {
    key: "sharingLinks",
    label: "Sharing Link Scan",
    description: "External, anonymous, and org-wide sharing links",
    staleness: { warningAfterHours: 24, criticalAfterHours: 72 },
    refreshJobType: "sharingLinkDiscovery",
    getLastRefreshedAt: (tcId) => storage.getLatestSharingLinkRunCompletedAt(tcId),
  },
  {
    key: "copilotInteractions",
    label: "Copilot Interactions",
    description: "User prompts and AI responses from M365 Copilot",
    staleness: { warningAfterHours: 24, criticalAfterHours: 72 },
    refreshJobType: "copilotSync",
    getLastRefreshedAt: (tcId) => storage.getLatestCopilotSyncCompletedAt(tcId),
  },
  // ... one entry per dataset
];
```

**API endpoint:**

```
GET /api/datasets/freshness?tenantConnectionId=...
→ [
    { key: "workspaces", label: "…", lastRefreshedAt: "…", ageHours: 26.4,
      status: "warning", refreshJobType: "tenantSync", isRefreshing: false },
    { key: "userInventory", …, status: "fresh" },
    …
  ]
```

### 3.5 Pre-Report Refresh Gate (frontend)

A reusable component that any report/assessment page can wrap its "Run" button with:

```tsx
<DatasetGate
  requiredDatasets={["workspaces", "userInventory"]}
  tenantConnectionId={tenantId}
  onAllFresh={() => launchReport()}
>
  {({ datasets, refreshing, refreshDataset, allFresh }) => (
    <Card>
      <CardHeader>
        <CardTitle>Data Readiness</CardTitle>
      </CardHeader>
      <CardContent>
        {datasets.map(ds => (
          <DatasetRow
            key={ds.key}
            dataset={ds}
            onRefresh={() => refreshDataset(ds.key)}
          />
        ))}
      </CardContent>
      <CardFooter>
        <Button disabled={!allFresh || refreshing} onClick={onAllFresh}>
          Run Report
        </Button>
      </CardFooter>
    </Card>
  )}
</DatasetGate>
```

**DatasetRow** shows:
- Dataset name + last refreshed timestamp
- Status badge: 🟢 Fresh / 🟡 Warning (>N hours) / 🔴 Stale (>M hours) / ⚪ Never synced
- "Refresh Now" button (disabled if that job is already running)
- If the dataset depends on another stale dataset, shows a chained warning

### 3.6 Job Monitor admin page

**Route:** `/app/admin/job-monitor`

**Layout (3 sections):**

**A. Active Jobs panel** (top)
- Cards for each currently running job
- Each card shows: job type label, tenant name, started time, elapsed duration, progress bar (if `items_total` is set), progress label
- "Cancel" button per job (calls `POST /api/jobs/:jobId/cancel`)
- Auto-refreshes every 3 seconds via polling

**B. Dataset Freshness dashboard** (middle)
- Grid of cards, one per dataset per tenant
- Each card: dataset label, last refreshed relative time, staleness badge
- "Refresh" button per dataset (launches the appropriate job)
- Filter by tenant connection

**C. Recent Job History** (bottom)
- Table: job type, tenant, status badge, started, duration, triggered by, errors
- Filterable by job type, status, date range
- Click row → detail drawer with full `result` JSON and error message
- Paginated, most recent first

---

## 4 Retrofitting Existing Jobs

Each existing background job needs to be wrapped with `trackJobRun()` and wired into the registry. The migration is mechanical — the inner logic doesn't change.

### 4.1 Per-job changes

| Job | Current tracking | Cancellation today | Changes needed |
|-----|-----------------|-------------------|---------------|
| Tenant Sync | `tenant_connections.lastSyncAt` | ❌ None | Wrap in `trackJobRun`, pass `signal` to loop |
| Sharing Link Discovery | `sharing_link_discovery_runs` | ✅ `isCancelled()` | Wrap in `trackJobRun`, replace `isCancelled()` with `signal.aborted` |
| OneDrive Inventory | `onedrive_inventory` (no run table) | ✅ `isCancelled()` | Wrap in `trackJobRun`, replace `isCancelled()` with `signal.aborted` |
| Teams Inventory | `teams_discovery_runs` | ✅ `isCancelled()` | Wrap, replace cancellation |
| Teams Recordings | `teams_discovery_runs` | ✅ `isCancelled()` | Wrap, replace cancellation |
| User Inventory | `user_inventory_runs` | ❌ None | Wrap, add `signal.aborted` checks in paging loop |
| Copilot Sync | `copilot_sync_runs` | ❌ None | Wrap, add `signal.aborted` checks |
| Copilot Assessment | `copilot_prompt_assessments` | ❌ None | Wrap, add `signal.aborted` checks |
| IA Assessment | `ai_assessment_runs` | ❌ None | Wrap, add `signal.aborted` checks |
| Email Storage Report | `email_storage_reports` | ✅ `isCancelled()` | Wrap, replace with `signal.aborted` |
| Governance Snapshot | `content_governance_snapshots` | ❌ None | Wrap in `trackJobRun` |
| License Sync | None (synchronous) | ❌ N/A | Convert to async + wrap |
| IA Column Sync | None | ❌ None | Wrap in `trackJobRun` |

### 4.2 Cancellation migration

The existing `discovery-cancellation.ts` service (in-memory `Map<string, Set<string>>`) gets **replaced** by the `AbortController` on `ActiveJob`. Each job receives `signal: AbortSignal` and checks `signal.aborted` at loop boundaries instead of calling `isCancelled(tenantConnectionId, scope)`.

**Scope-to-job mapping:** The current cancellation system supports cancelling by `tenantConnectionId + scope` (e.g. "cancel all sharingLinks discovery for tenant X"). The new `AbortController` model is jobId-centric. To preserve scope-level cancellation semantics, `cancel()` on the registry will accept either a `jobId` or a `(jobType, tenantConnectionId)` pair — the latter aborts all active jobs of that type for that tenant.

```typescript
cancel(jobId: string): void;
cancelByScope(jobType: JobType, tenantConnectionId: string): void;
```

**AbortSignal propagation:** `graphFetchWithRetry` will be extended with an optional `signal` parameter so that cancellation can abort in-flight HTTP requests (not just loop-boundary checks). For long retry sleeps, the signal listener will reject the sleep promise immediately.

**Startup reconciliation:** On server boot, `cleanupStale()` runs automatically and marks any `scheduled_job_runs` rows with status `running` and `started_at` older than 1 hour as `failed` with `error_message = "Process restarted — job orphaned"`. This prevents stale RUNNING rows from blocking new runs via the concurrency guard.

Benefits:
- One cancellation mechanism instead of two
- `AbortController.abort()` aborts both loop iteration and in-flight `fetch()` calls
- Cleanup is automatic — no manual `clearCancellation()` calls needed
- Orphaned jobs from process crashes are detected and cleaned up on startup

### 4.3 Concurrency guard

`trackJobRun()` checks `isRunning(jobType, tenantConnectionId)` before launching. This replaces the ad-hoc "check for existing RUNNING row" queries that only some services implement today.

---

## 5 API Routes

All routes under `/api/jobs/` — protected by `GOVERNANCE_ADMIN` or `TENANT_ADMIN` role.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/jobs/active` | List all currently running jobs (optionally filtered by `?tenantConnectionId=`) |
| `GET` | `/api/jobs/history` | Paginated history from `scheduled_job_runs` with filters: `jobType`, `status`, `tenantConnectionId`, `from`, `to` |
| `GET` | `/api/jobs/:jobId` | Single job detail (from DB) |
| `POST` | `/api/jobs/:jobType/trigger` | Manual trigger — body: `{ tenantConnectionId }` |
| `POST` | `/api/jobs/:jobId/cancel` | Cancel a running job |
| `GET` | `/api/datasets/freshness` | Dataset freshness status for a tenant connection |
| `POST` | `/api/datasets/:datasetKey/refresh` | Shortcut to trigger the refresh job for a specific dataset |

---

## 6 Frontend Components

### New shared components

| Component | Location | Purpose |
|-----------|----------|---------|
| `DatasetGate` | `client/src/components/datasets/dataset-gate.tsx` | Render-prop component checking dataset freshness before allowing an action |
| `DatasetRow` | `client/src/components/datasets/dataset-row.tsx` | Single dataset status row with refresh button |
| `DatasetFreshnessBanner` | `client/src/components/datasets/freshness-banner.tsx` | Lightweight inline banner ("2 datasets are stale — refresh before running") |
| `ActiveJobCard` | `client/src/components/jobs/active-job-card.tsx` | Running job card with progress + cancel |
| `JobHistoryTable` | `client/src/components/jobs/job-history-table.tsx` | Paginated, filterable history table |

### Pages consuming DatasetGate

| Page | Required datasets |
|------|------------------|
| Email Storage Report | `userInventory` |
| Copilot Prompt Intelligence | `copilotInteractions` |
| Copilot Readiness | `workspaces`, `copilotInteractions`, `licenses` |
| IA Assessment | `workspaces`, `iaColumns` |
| Governance Snapshot | `workspaces`, `sharingLinks` |
| Sharing Link Report | `sharingLinks`, `workspaces` |
| Content Intensity Heatmap | `workspaces` |
| Teams Governance | `teamsInventory` |
| OneDrive Report | `onedriveInventory` |

**Note:** Required datasets should be validated by tracing each page's backend report/assessment data inputs. During Phase 4 implementation, audit each page's API calls and ensure every consumed dataset is listed.

### Pages using DatasetFreshnessBanner (lighter touch)

| Page | Relevant datasets |
|------|------------------|
| Dashboard / Reports | `workspaces` |
| Lifecycle Management | `workspaces` |

---

## 7 Implementation Phases

### Phase 1: Foundation (backend)
**Effort:** ~2 sessions

1. Add `scheduled_job_runs` table to `shared/schema.ts` + migration
2. Build `server/services/job-registry.ts` — in-memory registry with `register`, `complete`, `fail`, `cancel`, `isRunning`, `updateProgress`, `cleanupStale`
3. Build `server/services/job-tracking.ts` — `trackJobRun<T>()` wrapper
4. Build `server/services/dataset-freshness.ts` — dataset definitions + freshness query
5. Add storage methods: `insertScheduledJobRun`, `updateScheduledJobRun`, `getScheduledJobRuns` (paginated), `getScheduledJobRun`
6. Add API routes: `/api/jobs/*` and `/api/datasets/freshness`
7. Add `scheduled_job_runs` to `ensureTenantConnectionsSchema()` for production

### Phase 2: Retrofit existing jobs
**Effort:** ~2 sessions

Migration strategy: **endpoint-by-endpoint rollout with dual-write.** During the transition period, each wrapped job both writes to `scheduled_job_runs` (via `trackJobRun`) AND continues to write to its original per-service run table. This ensures existing frontend pages that query per-service tables (e.g. the Copilot Prompt Intelligence page reading `copilot_sync_runs`) continue to work without modification. Once the Job Monitor page and DatasetGate are in place (Phase 3-4) and all frontend consumers are migrated, the dual-write is removed.

Rollout order (lowest risk first):
1. **License Sync** — currently synchronous, no run table, no UI polling it. Safest first candidate.
2. **Governance Snapshot** — no cancellation, simple lifecycle, minimal frontend coupling.
3. **User Inventory** — has a run table but straightforward paging loop. Add `signal.aborted` checks.
4. **Copilot Sync** — recently added `copilot_sync_runs`; dual-write preserves new polling UI.
5. **Copilot Assessment** — similar to Copilot Sync.
6. **IA Assessment** — has `ai_assessment_runs`; dual-write needed for existing UI.
7. **IA Column Sync** — no run table, no frontend polling.
8. **Email Storage Report** — already has `isCancelled()`; migrate to `signal.aborted`.
9. **Sharing Link Discovery** — already has `isCancelled()` + run table; dual-write + signal migration.
10. **OneDrive Inventory** — already has `isCancelled()`.
11. **Teams Inventory** — already has `isCancelled()` + `teams_discovery_runs`.
12. **Teams Recordings** — shares `teams_discovery_runs` table; migrate alongside Teams Inventory.
13. **Tenant Sync** — most complex, most dependencies. Last.

Per-job steps:
1. Wrap in `trackJobRun()` with dual-write to original run table
2. Replace `isCancelled()` / `clearCancellation()` calls with `signal.aborted` (where applicable)
3. Add `signal.aborted` checks to jobs that currently have no cancellation
4. Pass `AbortSignal` to `graphFetchWithRetry` where applicable
5. Keep `discovery-cancellation.ts` as a thin adapter during transition (delegates to `jobRegistry.cancelByScope`)
6. Remove ad-hoc concurrency checks (the wrapper handles it)

### Phase 3: Admin UI — Job Monitor page
**Effort:** ~1 session

1. Build `/app/admin/job-monitor` page with three sections (Active, Freshness, History)
2. Add nav entry under Admin section
3. Active jobs panel with cancel buttons + 3-second polling
4. Dataset freshness grid with per-tenant filtering + refresh buttons
5. Job history table with filters and detail drawer

### Phase 4: Pre-Report Refresh Gate
**Effort:** ~1 session

1. Build `DatasetGate`, `DatasetRow`, `DatasetFreshnessBanner` components
2. Integrate `DatasetGate` into the 7 report/assessment pages listed above
3. Integrate `DatasetFreshnessBanner` into Dashboard and Lifecycle pages
4. Remove the ad-hoc staleness logic from Email Storage Report (replaced by `DatasetGate`)

---

## 8 Staleness Thresholds (defaults)

| Dataset | Warning | Critical | Rationale |
|---------|---------|----------|-----------|
| Workspace Inventory | 24 h | 72 h | Sites change daily; 3-day-old data is unreliable for governance |
| User Directory Cache | 48 h | 168 h (7 d) | User attributes change slowly; weekly is acceptable |
| Sharing Links | 24 h | 72 h | Links can be created/modified any time |
| Copilot Interactions | 24 h | 72 h | 30-day rolling retention from Graph; daily sync recommended |
| Copilot Assessments | 72 h | 168 h | Derived data; changes only when interactions change |
| IA Columns | 48 h | 168 h | Content types/columns change infrequently |
| IA Assessment | 72 h | 168 h | Derived from IA columns; changes slowly |
| OneDrive Inventory | 24 h | 72 h | Storage metrics shift daily |
| Teams Inventory | 24 h | 72 h | Team creation/archival is frequent |
| Recordings | 48 h | 168 h | Recordings accumulate but don't change |
| Email Storage Report | 168 h | 720 h (30 d) | Expensive to run; acceptable to be weekly |
| Licenses | 24 h | 72 h | Assignment changes can affect Copilot readiness |
| Governance Snapshot | 24 h | 72 h | Point-in-time; re-snapshot daily |

Thresholds are configurable per-organization via `scheduled_job_configs` (future — when scheduling is added). For now, defaults live in `dataset-freshness.ts`.

---

## 9 Migration from current patterns

### What stays
- All existing per-service "run" tables (`sharing_link_discovery_runs`, `copilot_sync_runs`, etc.) remain for service-specific detail queries
- The existing job services (`runSharingLinkDiscovery`, `runUserInventoryRefresh`, etc.) keep their internal logic unchanged
- All existing API endpoints continue to work

### What changes
- Each job's route handler calls `trackJobRun()` instead of manually inserting/updating its own run table
- The job function receives `(signal, updateProgress)` as new parameters
- `discovery-cancellation.ts` becomes a thin adapter that delegates to `jobRegistry.cancel()` during the transition, then is removed

### What's new
- `scheduled_job_runs` table (cross-cutting audit trail)
- `job-registry.ts`, `job-tracking.ts`, `dataset-freshness.ts` services
- `/api/jobs/*` and `/api/datasets/freshness` routes
- Job Monitor admin page
- `DatasetGate` and `DatasetFreshnessBanner` components

---

## 10 Open Questions

1. **Retain per-service run tables long-term?** — They duplicate `scheduled_job_runs` to a degree. Recommendation: keep them for 1-2 releases for backward compatibility, then migrate report-specific detail (e.g. `messages_analyzed`, `users_processed`) into the `result` JSONB column of `scheduled_job_runs` and drop the old tables.

2. **AbortSignal propagation to Graph fetch** — `graphFetchWithRetry` currently doesn't accept an `AbortSignal`. Should we add it? Recommendation: yes, as an optional parameter. This lets cancellation abort in-flight HTTP requests rather than waiting for the current request to complete before checking `signal.aborted`.

3. **Job history retention** — Recommend 90 days. Configurable via a platform setting. Old rows cleaned up by `cleanupStale()` or a separate maintenance job.

4. **Notification on failure** — Out of scope for BL-039 but recommended as a fast follow: when a job fails, surface a toast or in-app notification to admins who are online, and queue an email digest of failures.
