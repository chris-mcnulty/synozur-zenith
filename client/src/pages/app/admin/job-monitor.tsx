/**
 * BL-039 — Job Monitor admin page.
 *
 * Three stacked sections for the selected tenant connection:
 *
 *   A. Active Jobs — currently running jobs from the in-memory registry,
 *      auto-refreshed every 3 seconds, with per-job Cancel buttons.
 *   B. Dataset Freshness — declarative grid of every dataset with last-
 *      refreshed time, status badge (fresh / warning / stale / never),
 *      and a Refresh button that fires the matching job (where the job
 *      already has a per-tenant trigger endpoint).
 *   C. Recent History — paginated, filterable history from
 *      scheduled_job_runs with a detail drawer (full result JSON +
 *      error message).
 *
 * Restricted to governance_admin and tenant_admin (server-side enforced;
 * the route guard here mirrors that).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Activity, Database, History, RefreshCw, X, ChevronLeft, ChevronRight, AlertTriangle, CheckCircle2, Clock, CircleDashed, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

// ── Types (mirrors server/routes/jobs.ts response shapes) ───────────────────

type JobStatus = "running" | "completed" | "failed" | "cancelled";
type FreshnessStatus = "fresh" | "warning" | "stale" | "never";

interface ActiveJob {
  jobId: string;
  jobType: string;
  jobTypeLabel: string;
  tenantConnectionId: string | null;
  organizationId: string | null;
  startedAt: string;
  elapsedMs: number;
  triggeredBy: "manual" | "system" | "scheduled";
  triggeredByUserId: string | null;
  progressLabel: string | null;
  progressPct: number | null;
  itemsTotal: number | null;
  itemsProcessed: number | null;
  targetId: string | null;
  targetName: string | null;
  aborted: boolean;
}

interface DatasetFreshness {
  key: string;
  label: string;
  description: string;
  lastRefreshedAt: string | null;
  ageHours: number | null;
  status: FreshnessStatus;
  refreshJobType: string;
  isRefreshing: boolean;
  warningAfterHours: number;
  criticalAfterHours: number;
  dependsOn: string[];
}

interface JobRunRow {
  id: string;
  jobType: string;
  jobTypeLabel: string;
  organizationId: string | null;
  tenantConnectionId: string | null;
  status: JobStatus;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  triggeredBy: string;
  triggeredByUserId: string | null;
  targetId: string | null;
  targetName: string | null;
  itemsTotal: number | null;
  itemsProcessed: number | null;
  progressLabel: string | null;
  createdAt: string;
}

const JOB_STATUS_OPTIONS: JobStatus[] = ["running", "completed", "failed", "cancelled"];
const JOB_TYPE_OPTIONS: { key: string; label: string }[] = [
  { key: "tenantSync", label: "Tenant Sync" },
  { key: "sharingLinkDiscovery", label: "Sharing Link Discovery" },
  { key: "oneDriveInventory", label: "OneDrive Inventory" },
  { key: "teamsInventory", label: "Teams & Channels Inventory" },
  { key: "teamsRecordings", label: "Recordings Discovery" },
  { key: "userInventory", label: "User Inventory" },
  { key: "copilotSync", label: "Copilot Interaction Sync" },
  { key: "copilotAssessment", label: "Copilot Prompt Assessment" },
  { key: "iaAssessment", label: "IA Health Assessment" },
  { key: "emailStorageReport", label: "Email Storage Report" },
  { key: "governanceSnapshot", label: "Governance Snapshot" },
  { key: "licenseSync", label: "License Sync" },
  { key: "iaSync", label: "IA Column Sync" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}m ${remSec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}m`;
}

function statusBadge(status: JobStatus) {
  switch (status) {
    case "running":
      return (
        <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20" data-testid={`badge-status-${status}`}>
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Running
        </Badge>
      );
    case "completed":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20" data-testid={`badge-status-${status}`}>
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-500/10 text-red-500 border-red-500/20" data-testid={`badge-status-${status}`}>
          <AlertTriangle className="w-3 h-3 mr-1" />
          Failed
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20" data-testid={`badge-status-${status}`}>
          <X className="w-3 h-3 mr-1" />
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function freshnessBadge(status: FreshnessStatus) {
  switch (status) {
    case "fresh":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20" data-testid={`badge-freshness-${status}`}>
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Fresh
        </Badge>
      );
    case "warning":
      return (
        <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20" data-testid={`badge-freshness-${status}`}>
          <Clock className="w-3 h-3 mr-1" />
          Warning
        </Badge>
      );
    case "stale":
      return (
        <Badge className="bg-red-500/10 text-red-500 border-red-500/20" data-testid={`badge-freshness-${status}`}>
          <AlertTriangle className="w-3 h-3 mr-1" />
          Stale
        </Badge>
      );
    case "never":
      return (
        <Badge className="bg-muted text-muted-foreground border-border" data-testid={`badge-freshness-${status}`}>
          <CircleDashed className="w-3 h-3 mr-1" />
          Never synced
        </Badge>
      );
  }
}

function formatAge(ageHours: number | null): string {
  if (ageHours == null) return "—";
  if (ageHours < 1) return `${Math.round(ageHours * 60)} min`;
  if (ageHours < 24) return `${ageHours.toFixed(1)} h`;
  return `${(ageHours / 24).toFixed(1)} d`;
}

// ── Active Jobs Section ─────────────────────────────────────────────────────

function ActiveJobsPanel({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { toast } = useToast();
  const { data, isFetching, refetch } = useQuery<{ jobs: ActiveJob[] }>({
    queryKey: ["/api/jobs/active", tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(
        `/api/jobs/active?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 3_000,
    enabled: !!tenantConnectionId,
  });

  const cancelJob = useMutation({
    mutationFn: async (jobId: string) => {
      const res = await apiRequest("POST", `/api/jobs/${jobId}/cancel`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Cancellation requested", description: "The job will stop at its next safe checkpoint." });
      void queryClient.invalidateQueries({ queryKey: ["/api/jobs/active"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Cancel failed", description: err?.message ?? String(err) });
    },
  });

  const jobs = data?.jobs ?? [];

  return (
    <Card className="glass-panel" data-testid="card-active-jobs">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Active Jobs
              {jobs.length > 0 && (
                <Badge variant="outline" className="ml-2" data-testid="badge-active-count">
                  {jobs.length}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Live view of background jobs running for this tenant. Auto-refreshes every 3 seconds.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-active"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="empty-active-jobs">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No jobs are currently running.
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <div
                key={job.jobId}
                className="flex items-start justify-between gap-4 p-4 rounded-lg border bg-card/50"
                data-testid={`active-job-${job.jobId}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{job.jobTypeLabel}</span>
                    {job.aborted && (
                      <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                        Cancelling…
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>
                      Started {formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })}{" "}
                      · elapsed {formatDuration(job.elapsedMs)}
                    </div>
                    {job.progressLabel && (
                      <div className="text-foreground/80">{job.progressLabel}</div>
                    )}
                    {job.itemsTotal != null && job.itemsTotal > 0 && (
                      <div className="text-xs">
                        Progress: {job.itemsProcessed ?? 0} / {job.itemsTotal} (
                        {Math.round(((job.itemsProcessed ?? 0) / job.itemsTotal) * 100)}%)
                      </div>
                    )}
                    {job.targetName && (
                      <div className="text-xs opacity-70">Target: {job.targetName}</div>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={job.aborted || cancelJob.isPending}
                  onClick={() => cancelJob.mutate(job.jobId)}
                  data-testid={`button-cancel-${job.jobId}`}
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Dataset Freshness Section ───────────────────────────────────────────────

function DatasetFreshnessPanel({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { data, isFetching, refetch } = useQuery<{ datasets: DatasetFreshness[] }>({
    queryKey: ["/api/datasets/freshness", tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(
        `/api/datasets/freshness?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 15_000,
    enabled: !!tenantConnectionId,
  });

  const datasets = data?.datasets ?? [];

  return (
    <Card className="glass-panel" data-testid="card-dataset-freshness">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5 text-primary" />
              Dataset Freshness
            </CardTitle>
            <CardDescription>
              When each dataset was last refreshed for this tenant. Reports and assessments
              gate on these freshness windows.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="button-refresh-freshness"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {datasets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">Loading datasets…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {datasets.map((ds) => (
              <div
                key={ds.key}
                className="p-4 rounded-lg border bg-card/50 space-y-2"
                data-testid={`dataset-${ds.key}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">{ds.label}</div>
                  {freshnessBadge(ds.status)}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2">{ds.description}</div>
                <div className="text-xs space-y-0.5">
                  <div>
                    <span className="text-muted-foreground">Last refresh: </span>
                    {ds.lastRefreshedAt
                      ? formatDistanceToNow(new Date(ds.lastRefreshedAt), { addSuffix: true })
                      : "never"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Age: </span>
                    {formatAge(ds.ageHours)}{" "}
                    <span className="opacity-60">
                      (warn ≥ {ds.warningAfterHours}h, stale ≥ {ds.criticalAfterHours}h)
                    </span>
                  </div>
                  {ds.isRefreshing && (
                    <div className="text-sky-500 flex items-center gap-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Refresh running now
                    </div>
                  )}
                  {ds.dependsOn.length > 0 && (
                    <div className="opacity-60">
                      Depends on: {ds.dependsOn.join(", ")}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Job History Section ─────────────────────────────────────────────────────

function JobHistoryPanel({ tenantConnectionId }: { tenantConnectionId: string }) {
  const [jobType, setJobType] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedRun, setSelectedRun] = useState<JobRunRow | null>(null);
  const limit = 25;

  // Reset pagination when filters change
  useEffect(() => {
    setPage(0);
  }, [jobType, status, tenantConnectionId]);

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("tenantConnectionId", tenantConnectionId);
    if (jobType !== "all") params.set("jobType", jobType);
    if (status !== "all") params.set("status", status);
    params.set("limit", String(limit));
    params.set("offset", String(page * limit));
    return `/api/jobs/history?${params.toString()}`;
  }, [tenantConnectionId, jobType, status, page]);

  const { data, isFetching, refetch } = useQuery<{ rows: JobRunRow[]; total: number }>({
    queryKey: [queryUrl],
    queryFn: async () => {
      const res = await fetch(queryUrl, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <>
      <Card className="glass-panel" data-testid="card-job-history">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Recent Job History
              </CardTitle>
              <CardDescription>
                All scheduled / manual job runs for this tenant. Click any row for details.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              data-testid="button-refresh-history"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Job type</span>
              <Select value={jobType} onValueChange={setJobType}>
                <SelectTrigger className="w-[220px]" data-testid="select-history-job-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {JOB_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.key} value={o.key}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status</span>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-[160px]" data-testid="select-history-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {JOB_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Triggered by</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground" data-testid="empty-job-history">
                      No job runs match these filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setSelectedRun(row)}
                      data-testid={`history-row-${row.id}`}
                    >
                      <TableCell>
                        <div className="font-medium text-sm">{row.jobTypeLabel}</div>
                        {row.targetName && (
                          <div className="text-xs text-muted-foreground">{row.targetName}</div>
                        )}
                      </TableCell>
                      <TableCell>{statusBadge(row.status)}</TableCell>
                      <TableCell className="text-sm">
                        {formatDistanceToNow(new Date(row.startedAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-sm">{formatDuration(row.durationMs)}</TableCell>
                      <TableCell className="text-sm">
                        <Badge variant="outline">{row.triggeredBy}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <ChevronRight className="w-4 h-4 text-muted-foreground inline" />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <div className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} · {total} total
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  data-testid="button-history-prev"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  data-testid="button-history-next"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedRun} onOpenChange={(open) => !open && setSelectedRun(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="sheet-job-detail">
          {selectedRun && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedRun.jobTypeLabel}</SheetTitle>
                <SheetDescription>{selectedRun.id}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-muted-foreground text-xs">Status</div>
                    <div className="mt-1">{statusBadge(selectedRun.status)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Triggered by</div>
                    <div className="mt-1">
                      <Badge variant="outline">{selectedRun.triggeredBy}</Badge>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Started</div>
                    <div className="mt-1">{new Date(selectedRun.startedAt).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Completed</div>
                    <div className="mt-1">
                      {selectedRun.completedAt
                        ? new Date(selectedRun.completedAt).toLocaleString()
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground text-xs">Duration</div>
                    <div className="mt-1">{formatDuration(selectedRun.durationMs)}</div>
                  </div>
                  {selectedRun.targetName && (
                    <div>
                      <div className="text-muted-foreground text-xs">Target</div>
                      <div className="mt-1">{selectedRun.targetName}</div>
                    </div>
                  )}
                </div>

                {selectedRun.itemsTotal != null && (
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Progress</div>
                    <div>
                      {selectedRun.itemsProcessed ?? 0} / {selectedRun.itemsTotal}
                    </div>
                  </div>
                )}

                {selectedRun.errorMessage && (
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Error</div>
                    <pre className="rounded-md bg-red-500/10 text-red-500 p-3 text-xs whitespace-pre-wrap">
                      {selectedRun.errorMessage}
                    </pre>
                  </div>
                )}

                {selectedRun.result && (
                  <div>
                    <div className="text-muted-foreground text-xs mb-1">Result</div>
                    <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(selectedRun.result, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function JobMonitorPage() {
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id ?? "";

  if (!tenantConnectionId) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" />
            Job Monitor
          </h1>
          <p className="text-muted-foreground mt-1">
            Live view of background jobs, dataset freshness, and history.
          </p>
        </div>
        <Card className="glass-panel">
          <CardContent className="py-12 text-center text-muted-foreground">
            Select a tenant connection from the top bar to view its job activity.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" />
            Job Monitor
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Unified view of every background data-gathering job for{" "}
            <span className="font-medium text-foreground">{selectedTenant?.tenantName}</span>:
            what's running, when each dataset was last refreshed, and the full history.
          </p>
        </div>
      </div>

      <ActiveJobsPanel tenantConnectionId={tenantConnectionId} />
      <DatasetFreshnessPanel tenantConnectionId={tenantConnectionId} />
      <JobHistoryPanel tenantConnectionId={tenantConnectionId} />
    </div>
  );
}
