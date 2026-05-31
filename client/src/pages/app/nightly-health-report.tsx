import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  HeartPulse,
  Play,
  Loader2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  HardDrive,
  ShieldAlert,
} from "lucide-react";
import { UpgradeGate } from "@/components/upgrade-gate";
import { useTenant } from "@/lib/tenant-context";
import { format } from "date-fns";
import type { NightlyHealthSnapshot } from "@shared/schema";

type ReportStatus = "RUNNING" | "COMPLETED" | "FAILED";

interface HealthReport {
  id: string;
  status: ReportStatus;
  reportDate: string;
  startedAt: string;
  completedAt: string | null;
  triggeredBy: string;
  snapshot: NightlyHealthSnapshot | null;
  sitesOver75: number | null;
  sitesOver90: number | null;
  issueCount: number | null;
  emailRecipientCount: number | null;
  error: string | null;
}

interface HealthListItem {
  id: string;
  status: ReportStatus;
  reportDate: string;
  startedAt: string;
  completedAt: string | null;
  triggeredBy: string;
  sitesOver75: number | null;
  sitesOver90: number | null;
  issueCount: number | null;
  emailRecipientCount: number | null;
  error: string | null;
}

interface ScheduleSettings {
  tenantConnectionId: string;
  nightlyRefreshScheduleEnabled: boolean;
  nightlyHealthReportEnabled: boolean;
  nightlyHealthReportEmailEnabled: boolean;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function statusBadge(status: ReportStatus) {
  if (status === "COMPLETED") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">
        <CheckCircle2 className="w-3 h-3" /> Completed
      </Badge>
    );
  }
  if (status === "RUNNING") {
    return (
      <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Running
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 gap-1">
      <XCircle className="w-3 h-3" /> Failed
    </Badge>
  );
}

function severityBadge(severity: "info" | "warning" | "critical", count: number) {
  const cls =
    severity === "critical"
      ? "bg-red-500/10 text-red-500 border-red-500/20"
      : severity === "warning"
        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
        : "bg-primary/10 text-primary border-primary/20";
  return (
    <Badge variant="outline" className={`text-sm font-bold ${cls}`}>
      {count}
    </Badge>
  );
}

export default function NightlyHealthReportPage() {
  const { selectedTenantId } = useTenant();
  const tenantConnectionId = selectedTenantId ?? "";
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  const { data: settings } = useQuery<ScheduleSettings>({
    queryKey: ["nightly-health-settings", tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(
        `/api/nightly-health-reports/settings?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`Failed to load settings (${res.status})`);
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const settingsMutation = useMutation({
    mutationFn: async (patch: Partial<Omit<ScheduleSettings, "tenantConnectionId">>) => {
      const res = await apiRequest("PATCH", "/api/nightly-health-reports/settings", {
        tenantConnectionId,
        ...patch,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["nightly-health-settings", tenantConnectionId] });
    },
  });

  const { data: historyList } = useQuery<HealthListItem[]>({
    queryKey: ["nightly-health-history", tenantConnectionId],
    queryFn: async () => {
      if (!tenantConnectionId) return [];
      const res = await fetch(
        `/api/nightly-health-reports?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const effectiveReportId =
    activeReportId ??
    historyList?.find((r) => r.status === "RUNNING")?.id ??
    historyList?.find((r) => r.status === "COMPLETED")?.id ??
    null;

  const { data: activeReport } = useQuery<HealthReport>({
    queryKey: ["nightly-health-report", effectiveReportId],
    queryFn: async () => {
      const res = await fetch(`/api/nightly-health-reports/${effectiveReportId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
      return res.json();
    },
    enabled: !!effectiveReportId,
    refetchInterval: (q) => {
      const data = q.state.data as HealthReport | undefined;
      return data && data.status === "RUNNING" ? 3000 : false;
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/nightly-health-reports", { tenantConnectionId });
      return res.json() as Promise<{ reportId: string }>;
    },
    onSuccess: (data) => {
      setActiveReportId(data.reportId);
      queryClient.invalidateQueries({ queryKey: ["nightly-health-history", tenantConnectionId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const res = await apiRequest("DELETE", `/api/nightly-health-reports/${reportId}`);
      return res.json();
    },
    onSuccess: (_data, reportId) => {
      if (activeReportId === reportId) setActiveReportId(null);
      queryClient.invalidateQueries({ queryKey: ["nightly-health-history", tenantConnectionId] });
      queryClient.invalidateQueries({ queryKey: ["nightly-health-report"] });
    },
  });

  const isPolling = activeReport?.status === "RUNNING" || triggerMutation.isPending;
  const snapshot = activeReport?.snapshot ?? null;

  return (
    <UpgradeGate
      feature="scheduledHealthReports"
      fallback={
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <HeartPulse className="w-12 h-12 text-primary" />
          <h2 className="text-2xl font-bold">Nightly Data Refresh & Health Reports</h2>
          <p className="text-muted-foreground max-w-md">
            Automatic nightly refresh of sites and libraries plus a governance health report —
            flagging sites over 75% and 90% of storage quota and other issues — is available on
            the Enterprise plan. Reports are delivered in-product and by email.
          </p>
        </div>
      }
    >
      <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <HeartPulse className="w-8 h-8 text-primary" />
            Nightly Health Report
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Each night Zenith refreshes your sites and document libraries, then reports on storage
            quota pressure and governance health issues across the suite. Reports are available
            here and emailed to your admins.
          </p>
        </div>

        {/* Schedule controls */}
        <Card className="glass-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Nightly Schedule</CardTitle>
            <CardDescription>
              Each option is independent — you can keep the nightly data refresh running while
              turning report generation and/or email delivery off.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-medium">Nightly data refresh</Label>
                <p className="text-xs text-muted-foreground">Refresh sites & libraries from Microsoft 365 every night.</p>
              </div>
              <Switch
                checked={settings?.nightlyRefreshScheduleEnabled ?? true}
                disabled={!settings || settingsMutation.isPending}
                onCheckedChange={(v) => settingsMutation.mutate({ nightlyRefreshScheduleEnabled: v })}
                data-testid="switch-nightly-refresh"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-medium">Generate health report</Label>
                <p className="text-xs text-muted-foreground">Produce the in-product governance health report after each refresh.</p>
              </div>
              <Switch
                checked={settings?.nightlyHealthReportEnabled ?? true}
                disabled={!settings || settingsMutation.isPending}
                onCheckedChange={(v) => settingsMutation.mutate({ nightlyHealthReportEnabled: v })}
                data-testid="switch-health-report"
              />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm font-medium">Email delivery</Label>
                <p className="text-xs text-muted-foreground">Email the report to Tenant &amp; Governance Admins.</p>
              </div>
              <Switch
                checked={settings?.nightlyHealthReportEmailEnabled ?? true}
                disabled={!settings || settingsMutation.isPending}
                onCheckedChange={(v) => settingsMutation.mutate({ nightlyHealthReportEmailEnabled: v })}
                data-testid="switch-email-delivery"
              />
            </div>

            <div className="pt-2 border-t border-border flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Button
                onClick={() => triggerMutation.mutate()}
                disabled={!tenantConnectionId || isPolling}
                className="gap-2"
                data-testid="button-generate-health-report"
              >
                {isPolling ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                ) : (
                  <><Play className="w-4 h-4" /> Generate Report Now</>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                Runs against the most recently synced data. Generation takes a few seconds.
              </p>
              {triggerMutation.isError && (
                <p className="text-sm text-red-500">
                  {triggerMutation.error instanceof Error ? triggerMutation.error.message : "Failed to start"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {activeReport && activeReport.status === "FAILED" && (
          <Card className="glass-panel border-red-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-red-500">
                <XCircle className="w-4 h-4" /> Report Failed
              </CardTitle>
              <CardDescription>{activeReport.error || "An unexpected error occurred."}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {activeReport && activeReport.status === "COMPLETED" && snapshot && (
          <>
            {/* Metadata */}
            <Card className="glass-panel">
              <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {format(new Date(activeReport.startedAt), "PPp")}
                </div>
                <div className="flex items-center gap-2">
                  Refreshed: {snapshot.refreshedAt ? format(new Date(snapshot.refreshedAt), "PPp") : "last sync"}
                </div>
                <div className="flex items-center gap-2">
                  {snapshot.totals.sitesEvaluated} sites · {snapshot.totals.librariesEvaluated} libraries evaluated
                </div>
                {typeof activeReport.emailRecipientCount === "number" && activeReport.emailRecipientCount > 0 && (
                  <div className="flex items-center gap-2">Emailed {activeReport.emailRecipientCount} admin(s)</div>
                )}
              </CardContent>
            </Card>

            {/* Storage KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="glass-panel border-red-500/20">
                <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Sites over 90% quota</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold text-red-500">{snapshot.storage.sitesOver90}</div></CardContent>
              </Card>
              <Card className="glass-panel border-amber-500/20">
                <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Sites over 75% quota</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold text-amber-500">{snapshot.storage.sitesOver75}</div></CardContent>
              </Card>
              <Card className="glass-panel">
                <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Sites missing labels</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{snapshot.governance.sitesMissingLabels}</div></CardContent>
              </Card>
              <Card className="glass-panel">
                <CardHeader className="pb-2"><CardTitle className="text-xs font-medium text-muted-foreground">Stale sites (90d+)</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold">{snapshot.governance.staleWorkspaces}</div></CardContent>
              </Card>
            </div>

            {/* Issues */}
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-primary" /> Governance Health Issues
                </CardTitle>
                <CardDescription>Issues requiring attention across the suite.</CardDescription>
              </CardHeader>
              <CardContent>
                {snapshot.issues.length === 0 ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> No issues flagged — all clear.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {snapshot.issues.map((issue, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-[10px] font-mono">{issue.category}</Badge>
                            <p className="font-medium">{issue.title}</p>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{issue.detail}</p>
                        </div>
                        {severityBadge(issue.severity, issue.count)}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Over-quota sites */}
            {snapshot.storage.topSites.length > 0 && (
              <Card className="glass-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-primary" /> Sites Over Storage Quota Threshold
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site</TableHead>
                        <TableHead className="text-right">Used / Quota</TableHead>
                        <TableHead className="text-right">% Used</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshot.storage.topSites.map((s) => (
                        <TableRow key={s.workspaceId}>
                          <TableCell className="truncate max-w-md">
                            {s.siteUrl ? (
                              <a href={s.siteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {s.displayName}
                              </a>
                            ) : (
                              s.displayName
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {formatBytes(s.storageUsedBytes)} / {formatBytes(s.storageAllocatedBytes)}
                          </TableCell>
                          <TableCell className={`text-right font-bold ${s.severity === "critical" ? "text-red-500" : "text-amber-500"}`}>
                            {s.percentUsed}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Caveats */}
            {snapshot.dataCaveats.length > 0 && (
              <Card className="glass-panel border-amber-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-amber-600 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" /> Data caveats
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  {snapshot.dataCaveats.map((c, i) => (<p key={i}>• {c}</p>))}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* History */}
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-base">Report History</CardTitle>
            <CardDescription>Past nightly and on-demand reports for this tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            {!historyList || historyList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reports yet. Generate one above or wait for tonight's scheduled run.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">&gt;90%</TableHead>
                    <TableHead className="text-right">&gt;75%</TableHead>
                    <TableHead className="text-right">Issues</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyList.map((r) => (
                    <TableRow key={r.id} className={effectiveReportId === r.id ? "bg-primary/5" : ""}>
                      <TableCell className="text-xs">{format(new Date(r.startedAt), "PP")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground capitalize">{r.triggeredBy}</TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-right text-xs">{r.sitesOver90 ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{r.sitesOver75 ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs">{r.issueCount ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setActiveReportId(r.id)}
                            disabled={r.status !== "COMPLETED"}
                            data-testid={`button-view-${r.id}`}
                          >
                            View
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-500 hover:text-red-500 hover:bg-red-500/10"
                                disabled={r.status === "RUNNING" || deleteMutation.isPending}
                                data-testid={`button-delete-${r.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this report?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  The report will be permanently deleted. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(r.id)}
                                  className="bg-red-500 hover:bg-red-600"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </UpgradeGate>
  );
}
