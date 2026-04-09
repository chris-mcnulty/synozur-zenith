import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import type { EmailStorageReport, UserInventoryRun } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Mail,
  Users,
  RefreshCw,
  Play,
  XCircle,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Clock,
  Info,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  BarChart2,
  Lock,
} from "lucide-react";

// ── Formatters ────────────────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[Math.min(i, 4)]}`;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d as string);
  if (isNaN(date.getTime())) return "—";
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    RUNNING:   { label: "Running",   cls: "text-blue-700 border-blue-300 bg-blue-50",     icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    COMPLETED: { label: "Completed", cls: "text-green-700 border-green-300 bg-green-50",  icon: <CheckCircle2 className="h-3 w-3" /> },
    PARTIAL:   { label: "Partial",   cls: "text-amber-700 border-amber-300 bg-amber-50",  icon: <AlertCircle className="h-3 w-3" /> },
    FAILED:    { label: "Failed",    cls: "text-red-700 border-red-300 bg-red-50",        icon: <XCircle className="h-3 w-3" /> },
    CANCELLED: { label: "Cancelled", cls: "text-slate-600 border-slate-300 bg-slate-50",  icon: <XCircle className="h-3 w-3" /> },
  };
  const cfg = map[status] ?? map.FAILED;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.cls}`} data-testid={`badge-run-status-${status.toLowerCase()}`}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <Card className="py-3">
      <CardContent className="p-4 flex flex-col gap-1">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {icon}
          {label}
        </div>
        <span className="text-xl font-bold">{value}</span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  );
}

function RunResults({ report }: { report: EmailStorageReport }) {
  const tenantId = report.tenantConnectionId;
  const s = report.summary;

  const csvHref = `/api/admin/tenants/${tenantId}/email-storage-report/runs/${report.id}/export.csv`;

  return (
    <div className="space-y-4 mt-2" data-testid="section-run-results">
      {/* Summary stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Messages Analysed"
          value={(report.messagesAnalyzed ?? 0).toLocaleString()}
          icon={<Mail className="h-4 w-4 text-blue-500" />}
        />
        <StatCard
          label="With Attachments"
          value={(report.messagesWithAttachments ?? 0).toLocaleString()}
          sub={s ? pct(s.pctWithAttachments) + " of messages" : undefined}
          icon={<BarChart2 className="h-4 w-4 text-purple-500" />}
        />
        <StatCard
          label="Est. Attachment Storage"
          value={formatBytes(report.estimatedAttachmentBytes ?? 0)}
          sub={report.mode === "ESTIMATE" ? "Estimate mode" : "Metadata mode"}
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
        />
        <StatCard
          label="Users Processed"
          value={`${report.usersProcessed ?? 0} / ${report.usersPlanned ?? 0}`}
          sub={report.inventoryTotalCount != null ? `${report.inventoryTotalCount} total in tenant` : undefined}
          icon={<Users className="h-4 w-4 text-amber-500" />}
        />
      </div>

      {s && (
        <>
          {/* Internal / External */}
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Internal Traffic</CardTitle>
                <CardDescription className="text-xs">Recipients in tenant-verified domains</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Messages</span><span className="font-medium">{s.internal.messages.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Est. Bytes</span><span className="font-medium">{formatBytes(s.internal.bytes)}</span></div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">External Traffic</CardTitle>
                <CardDescription className="text-xs">Recipients outside tenant domains</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Messages</span><span className="font-medium">{s.external.messages.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Est. Bytes</span><span className="font-medium">{formatBytes(s.external.bytes)}</span></div>
              </CardContent>
            </Card>
          </div>

          {/* Size stats */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><BarChart2 className="h-4 w-4" /> Message Size Distribution (attachment messages)</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-5 gap-2 text-center text-sm">
                {[
                  { label: "Avg", value: formatBytes(s.sizeStats.avgBytes) },
                  { label: "Median", value: formatBytes(s.sizeStats.medianBytes) },
                  { label: "P90", value: formatBytes(s.sizeStats.p90Bytes) },
                  { label: "P95", value: formatBytes(s.sizeStats.p95Bytes) },
                  { label: "Max", value: formatBytes(s.sizeStats.maxBytes) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col gap-0.5">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="font-semibold text-sm">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top senders */}
          {s.topSenders.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Top Senders by Attachment Volume</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Sender</TableHead>
                      <TableHead className="text-right">Messages</TableHead>
                      <TableHead className="text-right pr-4">Est. Bytes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.topSenders.map((sender, i) => (
                      <TableRow key={i} data-testid={`row-top-sender-${i}`}>
                        <TableCell className="pl-4 font-mono text-xs">{sender.sender}</TableCell>
                        <TableCell className="text-right text-sm">{sender.count.toLocaleString()}</TableCell>
                        <TableCell className="text-right pr-4 text-sm">{formatBytes(sender.bytes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Top recipient domains */}
          {s.topRecipientDomains.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm">Top Recipient Domains</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Domain</TableHead>
                      <TableHead className="text-right">Messages</TableHead>
                      <TableHead className="text-right pr-4">Est. Bytes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.topRecipientDomains.map((d, i) => (
                      <TableRow key={i} data-testid={`row-top-domain-${i}`}>
                        <TableCell className="pl-4 font-mono text-xs">{d.domain}</TableCell>
                        <TableCell className="text-right text-sm">{d.count.toLocaleString()}</TableCell>
                        <TableCell className="text-right pr-4 text-sm">{formatBytes(d.bytes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Accuracy caveats */}
      {report.accuracyCaveats && report.accuracyCaveats.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-1" data-testid="section-accuracy-caveats">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Accuracy Notes
          </p>
          <ul className="space-y-0.5">
            {report.accuracyCaveats.map((c, i) => (
              <li key={i} className="text-xs text-muted-foreground">• {c}</li>
            ))}
          </ul>
        </div>
      )}

      {/* CSV export */}
      {(report.status === "COMPLETED" || report.status === "PARTIAL") && (
        <div className="flex justify-end">
          <a href={csvHref} download data-testid="link-export-csv">
            <Button variant="outline" size="sm" className="gap-2">
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </a>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmailStorageReportPage() {
  const { selectedTenant } = useTenant();
  const { toast } = useToast();
  const tenantId = selectedTenant?.id ?? "";

  // Form state
  const [windowDays, setWindowDays] = useState<"7" | "30" | "90">("30");
  const [mode, setMode] = useState<"ESTIMATE" | "METADATA">("ESTIMATE");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxUsers, setMaxUsers] = useState("");
  const [maxMessagesPerUser, setMaxMessagesPerUser] = useState("");

  // Which run is expanded to show results
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: inventoryStatus, isLoading: inventoryLoading } = useQuery<{
    total: number;
    ageHours: number | null;
    stale: boolean;
    maxAgeHours: number;
  }>({
    queryKey: ["/api/admin/tenants", tenantId, "user-inventory"],
    queryFn: async () => {
      if (!tenantId) return { total: 0, ageHours: null, stale: false, maxAgeHours: 24 };
      const res = await fetch(`/api/admin/tenants/${tenantId}/user-inventory?limit=1`, { credentials: "include" });
      if (!res.ok) return { total: 0, ageHours: null, stale: false, maxAgeHours: 24 };
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: 30_000,
  });

  const { data: inventoryRuns = [] } = useQuery<UserInventoryRun[]>({
    queryKey: ["/api/admin/tenants", tenantId, "user-inventory-runs"],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/admin/tenants/${tenantId}/user-inventory/runs?limit=1`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: (data) => (Array.isArray(data) && data[0]?.status === "RUNNING" ? 3000 : 30_000),
  });

  const latestInventoryRun = inventoryRuns[0] ?? null;
  const inventoryRunning = latestInventoryRun?.status === "RUNNING";

  const { data: reportRuns = [], isError: runsError } = useQuery<EmailStorageReport[]>({
    queryKey: ["/api/admin/tenants", tenantId, "email-storage-report-runs"],
    queryFn: async () => {
      if (!tenantId) return [];
      const res = await fetch(`/api/admin/tenants/${tenantId}/email-storage-report/runs?limit=20`, { credentials: "include" });
      if (res.status === 403) throw Object.assign(new Error("Enterprise plan required"), { status: 403 });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantId,
    refetchInterval: (data) => (Array.isArray(data) && data.some((r: EmailStorageReport) => r.status === "RUNNING") ? 3000 : false),
    retry: false,
  });

  // Auto-expand the most recently started run when a new one appears
  const prevRunCountRef = useRef(0);
  useEffect(() => {
    if (reportRuns.length > prevRunCountRef.current && reportRuns[0]) {
      setExpandedRunId(reportRuns[0].id);
    }
    prevRunCountRef.current = reportRuns.length;
  }, [reportRuns.length]);

  // Invalidate when a running report completes
  const prevRunningRef = useRef(false);
  const anyRunning = reportRuns.some(r => r.status === "RUNNING");
  useEffect(() => {
    if (prevRunningRef.current && !anyRunning) {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId, "email-storage-report-runs"] });
    }
    prevRunningRef.current = anyRunning;
  }, [anyRunning, tenantId]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const syncInventoryMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/user-inventory/sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to start inventory sync");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User inventory sync started", description: "Enumerating Entra users in the background." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId, "user-inventory-runs"] });
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const runReportMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        windowDays: Number(windowDays),
        mode,
      };
      const mu = Number(maxUsers);
      if (maxUsers && Number.isFinite(mu) && mu > 0) body.maxUsers = mu;
      const mm = Number(maxMessagesPerUser);
      if (maxMessagesPerUser && Number.isFinite(mm) && mm > 0) body.maxMessagesPerUser = mm;

      const res = await fetch(`/api/admin/tenants/${tenantId}/email-storage-report/run`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message ?? "Failed to start report");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Report started", description: `Report ID: ${data.reportId}` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId, "email-storage-report-runs"] });
    },
    onError: (err: any) => {
      toast({ title: "Report failed to start", description: err.message, variant: "destructive" });
    },
  });

  const cancelReportMutation = useMutation({
    mutationFn: async (runId: string) => {
      const res = await fetch(`/api/admin/tenants/${tenantId}/email-storage-report/runs/${runId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to cancel report");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Cancellation requested", description: "The report will stop at the next checkpoint." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId, "email-storage-report-runs"] });
    },
    onError: (err: any) => {
      toast({ title: "Cancel failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Derived state ────────────────────────────────────────────────────────────

  const inventoryTotal = inventoryStatus?.total ?? 0;
  const inventoryAgeHours = inventoryStatus?.ageHours ?? null;
  const inventoryStale = inventoryStatus?.stale ?? false;
  const inventoryEmpty = inventoryTotal === 0;
  const enterpriseGated = runsError;
  const activeRun = reportRuns.find(r => r.status === "RUNNING");

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-email-storage-report">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Email Content Storage Report
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Estimate how much content is propagated via email attachments across your tenant.
            Identifies top senders, recipient domains, and internal vs external traffic patterns.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-purple-700 border-purple-300 bg-purple-50 gap-1 mt-1">
          <Lock className="h-3 w-3" />
          Enterprise
        </Badge>
      </div>

      {/* Enterprise gate banner */}
      {enterpriseGated && (
        <div className="flex items-start gap-3 rounded-lg border border-purple-500/40 bg-purple-500/10 px-4 py-3" data-testid="banner-enterprise-gate">
          <Lock className="w-4 h-4 text-purple-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-purple-700 dark:text-purple-400">Enterprise Plan Required</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              The Email Content Storage Report is available on the Enterprise service plan. Contact your administrator to upgrade.
            </p>
          </div>
        </div>
      )}

      {!enterpriseGated && (
        <>
          {/* Step 1 + Step 2 side by side */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* Step 1: User Inventory */}
            <Card className="glass-panel border-border/50">
              <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Step 1 — User Inventory
                </CardTitle>
                <CardDescription className="text-xs">
                  The report reads users from a local cache. Sync this first if it's empty or stale.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {inventoryLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading inventory status…
                  </div>
                ) : (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Cached users</dt>
                    <dd className="font-semibold" data-testid="stat-inventory-total">
                      {inventoryTotal.toLocaleString()}
                      {inventoryEmpty && <span className="ml-2 text-xs text-amber-600">(empty)</span>}
                    </dd>
                    <dt className="text-muted-foreground">Last synced</dt>
                    <dd data-testid="stat-inventory-age">
                      {inventoryAgeHours != null
                        ? `${inventoryAgeHours.toFixed(1)}h ago`
                        : "Never"}
                      {inventoryStale && (
                        <Badge variant="outline" className="ml-2 text-amber-600 border-amber-300 bg-amber-50 text-xs">
                          Stale
                        </Badge>
                      )}
                    </dd>
                    {latestInventoryRun && (
                      <>
                        <dt className="text-muted-foreground">Last run status</dt>
                        <dd>
                          {inventoryRunning
                            ? <span className="flex items-center gap-1 text-blue-600 text-sm"><Loader2 className="h-3 w-3 animate-spin" /> Running…</span>
                            : <span className="text-sm">{latestInventoryRun.status}</span>}
                        </dd>
                      </>
                    )}
                  </dl>
                )}

                {inventoryStale && !inventoryEmpty && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Inventory is stale. Re-sync before running a report for accurate results.
                  </div>
                )}

                {inventoryEmpty && !inventoryRunning && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    No users cached. Sync the inventory before running a report.
                  </div>
                )}

                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 w-full"
                  onClick={() => syncInventoryMutation.mutate()}
                  disabled={inventoryRunning || syncInventoryMutation.isPending || !tenantId}
                  data-testid="button-sync-inventory"
                >
                  {inventoryRunning || syncInventoryMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Syncing…</>
                    : <><RefreshCw className="h-4 w-4" /> Sync User Inventory</>}
                </Button>
              </CardContent>
            </Card>

            {/* Step 2: Run Report */}
            <Card className="glass-panel border-border/50">
              <CardHeader className="pb-3 border-b border-border/40">
                <CardTitle className="text-base flex items-center gap-2">
                  <Play className="h-4 w-4 text-primary" />
                  Step 2 — Run Report
                </CardTitle>
                <CardDescription className="text-xs">
                  Configure the analysis window and mode, then start the report. Runs in the background.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="window-days">Analysis Window</Label>
                    <Select value={windowDays} onValueChange={(v) => setWindowDays(v as "7" | "30" | "90")}>
                      <SelectTrigger id="window-days" className="h-8 text-sm" data-testid="select-window-days">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">Last 7 days</SelectItem>
                        <SelectItem value="30">Last 30 days</SelectItem>
                        <SelectItem value="90">Last 90 days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" htmlFor="report-mode">Mode</Label>
                    <Select value={mode} onValueChange={(v) => setMode(v as "ESTIMATE" | "METADATA")}>
                      <SelectTrigger id="report-mode" className="h-8 text-sm" data-testid="select-report-mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ESTIMATE">Estimate (fast)</SelectItem>
                        <SelectItem value="METADATA">Metadata (detailed)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="text-xs text-muted-foreground flex items-start gap-1.5 bg-muted/40 rounded px-3 py-2">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-500" />
                  {mode === "ESTIMATE"
                    ? "Estimate mode uses message total size as a proxy for attachments. Fast and safe for all tenants."
                    : "Metadata mode fetches per-attachment details for large messages. Slower and subject to tighter caps."}
                </div>

                {/* Advanced options */}
                <div>
                  <button
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowAdvanced(v => !v)}
                    data-testid="toggle-advanced-options"
                  >
                    {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    Advanced caps
                  </button>

                  {showAdvanced && (
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor="max-users">Max Users</Label>
                        <Input
                          id="max-users"
                          className="h-8 text-sm"
                          placeholder="200 (default)"
                          value={maxUsers}
                          onChange={e => setMaxUsers(e.target.value)}
                          data-testid="input-max-users"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs" htmlFor="max-msgs">Max Messages / User</Label>
                        <Input
                          id="max-msgs"
                          className="h-8 text-sm"
                          placeholder="2000 (default)"
                          value={maxMessagesPerUser}
                          onChange={e => setMaxMessagesPerUser(e.target.value)}
                          data-testid="input-max-messages-per-user"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={() => runReportMutation.mutate()}
                  disabled={
                    inventoryEmpty ||
                    runReportMutation.isPending ||
                    !!activeRun ||
                    !tenantId
                  }
                  data-testid="button-run-report"
                >
                  {runReportMutation.isPending
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Starting…</>
                    : activeRun
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Report running…</>
                    : <><Play className="h-4 w-4" /> Run Email Report</>}
                </Button>

                {inventoryEmpty && (
                  <p className="text-xs text-center text-muted-foreground">
                    Sync the user inventory first (Step 1) to enable this button.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Run history */}
          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    Report History
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Click a row to expand the results. Running reports update automatically.
                  </CardDescription>
                </div>
                {activeRun && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2 text-red-600 border-red-300 hover:bg-red-50"
                    onClick={() => cancelReportMutation.mutate(activeRun.id)}
                    disabled={cancelReportMutation.isPending}
                    data-testid="button-cancel-report"
                  >
                    <XCircle className="h-4 w-4" />
                    Cancel Running Report
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {reportRuns.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-36 gap-3 text-muted-foreground">
                  <Mail className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No reports run yet. Use Step 2 above to start your first report.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4 w-6"></TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Mode</TableHead>
                      <TableHead>Window</TableHead>
                      <TableHead className="text-right">Users</TableHead>
                      <TableHead className="text-right">Messages</TableHead>
                      <TableHead className="text-right">Est. Storage</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportRuns.map((run) => {
                      const isExpanded = expandedRunId === run.id;
                      return (
                        <>
                          <TableRow
                            key={run.id}
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                            data-testid={`row-report-run-${run.id}`}
                          >
                            <TableCell className="pl-4 pr-0">
                              {isExpanded
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            </TableCell>
                            <TableCell className="text-sm">{formatDate(run.startedAt)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {run.mode}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{run.windowDays}d</TableCell>
                            <TableCell className="text-right text-sm">
                              {run.usersProcessed ?? 0} / {run.usersPlanned ?? 0}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {(run.messagesAnalyzed ?? 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-sm">
                              {formatBytes(run.estimatedAttachmentBytes ?? 0)}
                            </TableCell>
                            <TableCell>
                              <RunStatusBadge status={run.status} />
                            </TableCell>
                          </TableRow>

                          {isExpanded && (
                            <TableRow key={`${run.id}-detail`} className="bg-muted/5 hover:bg-muted/5">
                              <TableCell colSpan={8} className="px-4 pb-6 pt-2">
                                {run.status === "RUNNING" ? (
                                  <div className="flex items-center gap-3 text-sm text-muted-foreground py-4">
                                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                    Report is running — processed {run.usersProcessed ?? 0} of {run.usersPlanned ?? 0} users,{" "}
                                    {(run.messagesAnalyzed ?? 0).toLocaleString()} messages so far.
                                    Results will appear here when complete.
                                  </div>
                                ) : (
                                  <RunResults report={run} />
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* How it works */}
          <Card className="glass-panel border-border/50 bg-muted/5">
            <CardContent className="flex items-start gap-3 pt-4 pb-4">
              <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">How it works: </span>
                The report reads from a cached user inventory (never enumerates Entra live during a run), then pages through
                each user's sent-items folder via the Microsoft Graph API within the configured time window.
                In <span className="font-medium">Estimate</span> mode, message total size is used as a proxy for attachment bytes.
                In <span className="font-medium">Metadata</span> mode, per-attachment sizes are fetched for messages above the size threshold.
                All runs are bounded by configurable caps to keep Graph API usage predictable.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
