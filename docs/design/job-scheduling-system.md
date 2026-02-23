# Zenith Job Scheduling & Management System

**Design Document — Based on Orbit Pattern**

**Status:** Backlog (Medium Priority)
**Reference:** Orbit (`synozur-orbit`) scheduled-jobs.ts — the best job scheduling implementation in the Synozur portfolio

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture (Orbit Pattern)](#architecture-orbit-pattern)
3. [Zenith Job Types](#zenith-job-types)
4. [Data Model](#data-model)
5. [Core Components](#core-components)
6. [Admin UI](#admin-ui)
7. [Implementation Plan](#implementation-plan)

---

## Overview

Zenith needs a background job scheduling system to automate recurring governance operations — tenant syncs, stale site detection, compliance scans, label audits, and notification delivery. This design follows the proven pattern from Orbit's `scheduled-jobs.ts`, adapted for Zenith's M365 governance domain.

### Design Goals
- Database-backed audit trail for every job execution
- Per-tenant and per-job-type configuration
- Graceful cancellation via AbortController
- Concurrency guards to prevent overlapping runs
- Stuck job detection and automatic cleanup
- Admin monitoring UI with manual trigger support
- Multi-tenant isolation (jobs scoped to organization/tenant)

---

## Architecture (Orbit Pattern)

Orbit's job scheduling uses a lightweight, in-process architecture with no external job queue dependencies. Key design decisions:

### In-Memory Job Status Registry
```typescript
interface JobStatus {
  lastRun: Date | null;
  isRunning: boolean;
  nextRun: Date | null;
  abortController: AbortController | null;
}

const jobStatus: Record<string, JobStatus> = {
  tenantSync: { lastRun: null, isRunning: false, nextRun: null, abortController: null },
  staleSiteScan: { lastRun: null, isRunning: false, nextRun: null, abortController: null },
  // ... more job types
};
```

### Database-Backed Job Run Tracking
Every job execution creates a `scheduled_job_runs` record:
- `trackJobStart()` — creates a "running" record with job type, tenant, target info
- `trackJobComplete()` — updates with status (completed/failed), result JSON, error message
- `trackJobRun<T>()` — generic wrapper that handles start/complete/fail automatically

### Concurrency & Safety
- **isRunning guard**: Each job type checks `isRunning` before starting; skips if already active
- **AbortController**: Each job gets an AbortController for graceful cancellation (e.g., admin clicks "Cancel")
- **Stuck job cleanup**: A periodic sweep marks jobs as failed if they've been running > 1 hour
- **Non-fatal per-item errors**: Individual item failures don't stop the overall job

### Tenant-Scoped Execution
Jobs iterate all active tenants, respect per-tenant frequency settings (daily/weekly/disabled), and check elapsed time since last run before processing.

---

## Zenith Job Types

### Tier 1: Core Jobs (Standard Plan+)

| Job Type | Description | Default Frequency | Trigger |
|----------|-------------|-------------------|---------|
| `tenantSync` | Full tenant sync — sites, usage, labels, hubs | Daily | Scheduled + Manual |
| `staleSiteScan` | Detect sites with no activity beyond threshold | Weekly | Scheduled + Manual |
| `labelAudit` | Verify sensitivity label compliance across sites | Weekly | Scheduled + Manual |
| `ownershipCheck` | Detect orphaned sites (missing/departed owners) | Weekly | Scheduled + Manual |

### Tier 2: Governance Jobs (Professional Plan+)

| Job Type | Description | Default Frequency | Trigger |
|----------|-------------|-------------------|---------|
| `copilotReadiness` | Recalculate Copilot eligibility scores | Daily | Scheduled + Manual |
| `sharingAudit` | Scan external sharing settings for policy violations | Daily | Scheduled + Manual |
| `complianceScore` | Calculate governance compliance scores per workspace | Weekly | Scheduled + Manual |
| `metadataSync` | Sync metadata changes to SharePoint property bags | On-demand | Manual |

### Tier 3: Communication Jobs (All Plans)

| Job Type | Description | Default Frequency | Trigger |
|----------|-------------|-------------------|---------|
| `ownerReminder` | Notify site owners of pending governance actions | Weekly | Scheduled |
| `digestEmail` | Weekly governance digest to admins | Weekly | Scheduled |
| `planExpiration` | Check and enforce service plan expirations | Daily | Scheduled |

---

## Data Model

### scheduled_job_runs Table
**Ownership:** Organization-owned (scoped by organizationId)

```
scheduled_job_runs
├── id: uuid (PK)
├── organizationId: integer (FK → organizations)
├── jobType: text (e.g., "tenantSync", "staleSiteScan")
├── tenantConnectionId: integer (FK → tenant_connections, nullable)
├── targetId: text (nullable — specific workspace or resource ID)
├── targetName: text (nullable — human-readable target description)
├── status: text ("running" | "completed" | "failed" | "cancelled")
├── startedAt: timestamp
├── completedAt: timestamp (nullable)
├── result: jsonb (nullable — structured output from the job)
├── errorMessage: text (nullable)
├── triggeredBy: text ("scheduled" | "manual" | "system")
├── triggeredByUserId: integer (nullable — who clicked manual trigger)
└── createdAt: timestamp
```

### scheduled_job_configs Table
**Ownership:** Organization-owned

```
scheduled_job_configs
├── id: uuid (PK)
├── organizationId: integer (FK → organizations)
├── jobType: text
├── frequency: text ("hourly" | "daily" | "weekly" | "disabled")
├── enabled: boolean (default true)
├── lastRunAt: timestamp (nullable)
├── nextRunAt: timestamp (nullable)
├── config: jsonb (job-specific settings, e.g., staleness threshold days)
└── updatedAt: timestamp
```

---

## Core Components

### 1. Job Scheduler Service (`server/services/job-scheduler.ts`)
- Initializes job intervals on server startup
- Manages the in-memory job status registry
- Provides `startJob()`, `cancelJob()`, `getJobStatus()` methods
- Cleans up stuck jobs on startup and periodically

### 2. Job Runner Functions (`server/services/jobs/*.ts`)
Individual job implementations, each following the pattern:
```typescript
export async function runTenantSyncJob(
  organizationId: number,
  abortSignal: AbortSignal
): Promise<JobResult> {
  // 1. Get tenant connections for this org
  // 2. For each active tenant, check frequency
  // 3. Execute sync work (sites, labels, hubs, usage)
  // 4. Return structured result
}
```

### 3. Job Tracking Layer (`server/services/job-tracking.ts`)
Reusable `trackJobRun<T>()` wrapper (from Orbit pattern):
```typescript
async function trackJobRun<T>(
  jobType: string,
  organizationId: number,
  tenantConnectionId: number | null,
  targetName: string,
  work: () => Promise<T>
): Promise<string | null>
```

### 4. API Routes (`server/routes/jobs.ts`)
- `GET /api/jobs/status` — current status of all job types
- `GET /api/jobs/history` — paginated job run history with filters
- `POST /api/jobs/:type/trigger` — manual trigger for a specific job
- `POST /api/jobs/:type/cancel` — cancel a running job
- `GET /api/jobs/config` — get job frequency configurations
- `PUT /api/jobs/config/:type` — update job frequency

### 5. Admin UI (`client/src/pages/app/admin/scheduled-jobs.tsx`)
Following Constellation/Orbit admin page patterns:
- Overview cards: total runs, success rate, failures, average duration
- Job type cards with status indicators, last run, next run, manual trigger button
- Run history table with filtering by job type, status, date range
- Configuration panel for frequency settings per job type

---

## Implementation Plan

### Phase 1: Foundation
- Add `scheduled_job_runs` and `scheduled_job_configs` tables to schema
- Implement `job-tracking.ts` with `trackJobRun<T>()` wrapper
- Implement `job-scheduler.ts` with interval management and stuck job cleanup
- Add API routes for status, history, trigger, and cancel

### Phase 2: Core Jobs
- Refactor existing tenant sync into a schedulable job
- Implement stale site scan job
- Implement label audit job
- Implement ownership check job

### Phase 3: Admin UI
- Build scheduled jobs admin page (following Orbit/Constellation pattern)
- Job status overview with cards and indicators
- Run history with filtering and pagination
- Manual trigger and cancel buttons
- Frequency configuration panel

### Phase 4: Advanced Jobs
- Copilot readiness recalculation job
- External sharing audit job
- Compliance scoring job
- Notification/digest delivery jobs

---

## Open Questions

1. **Service plan gating for job types** — Should advanced job types (copilotReadiness, sharingAudit) be gated by service plan, or should all jobs run for all plans?
2. **Cross-tenant job coordination** — When an MSP manages multiple tenants, should jobs for all tenants run in parallel or sequentially with delays between them?
3. **Job result retention** — How long should completed job run records be retained? Suggest 90 days with configurable cleanup.
4. **Webhook notifications** — Should job completion/failure trigger webhooks or in-app notifications to admins?
