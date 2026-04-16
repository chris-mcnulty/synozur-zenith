import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  BarChart3,
  Play,
  Loader2,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { UpgradeGate } from "@/components/upgrade-gate";
import { useTenant } from "@/lib/tenant-context";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";
import type {
  M365OverviewSnapshot,
  M365OverviewRecommendation,
} from "@shared/schema";

type ReportStatus = "RUNNING" | "COMPLETED" | "FAILED";

interface OverviewReport {
  id: string;
  status: ReportStatus;
  windowStart: string;
  windowEnd: string;
  startedAt: string;
  completedAt: string | null;
  snapshot: M365OverviewSnapshot | null;
  narrative: string | null;
  recommendations: M365OverviewRecommendation[] | null;
  modelUsed: string | null;
  tokensUsed: number | null;
  error: string | null;
}

interface OverviewListItem {
  id: string;
  status: ReportStatus;
  windowStart: string;
  windowEnd: string;
  startedAt: string;
  completedAt: string | null;
  modelUsed: string | null;
  tokensUsed: number | null;
  recommendationCount: number;
  error: string | null;
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

function impactColor(impact: M365OverviewRecommendation["impact"]): string {
  if (impact === "HIGH") return "bg-red-500/10 text-red-500 border-red-500/20";
  if (impact === "MEDIUM") return "bg-amber-500/10 text-amber-500 border-amber-500/20";
  return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
}

function categoryIcon(category: M365OverviewRecommendation["category"]) {
  return <Badge variant="outline" className="text-[10px] font-mono">{category}</Badge>;
}

function KpiTile({
  label,
  value,
  deltaPct,
  unit,
}: {
  label: string;
  value: number;
  deltaPct: number | null;
  unit?: "count" | "bytes" | "percent";
}) {
  const displayValue =
    unit === "bytes" ? formatBytes(value) :
    unit === "percent" ? `${value}%` :
    value.toLocaleString();

  const trending = deltaPct === null ? null : deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat";

  return (
    <Card className="glass-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold" data-testid={`kpi-${label}`}>{displayValue}</div>
        {trending && (
          <div className={`mt-1 flex items-center gap-1 text-xs ${
            trending === "up" ? "text-emerald-500" : trending === "down" ? "text-red-500" : "text-muted-foreground"
          }`}>
            {trending === "up" && <TrendingUp className="w-3 h-3" />}
            {trending === "down" && <TrendingDown className="w-3 h-3" />}
            <span>{deltaPct! > 0 ? "+" : ""}{deltaPct}% vs prior 30d</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function M365OverviewReportPage() {
  const { selectedTenantId } = useTenant();
  const tenantConnectionId = selectedTenantId ?? "";

  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  // History list
  const { data: historyList } = useQuery<OverviewListItem[]>({
    queryKey: ["m365-overview-history", tenantConnectionId],
    queryFn: async () => {
      if (!tenantConnectionId) return [];
      const res = await fetch(
        `/api/m365-overview-reports?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`,
        { credentials: "include" },
      );
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  // Pick newest running/completed report if none selected
  const effectiveReportId = activeReportId
    ?? historyList?.find(r => r.status === "RUNNING")?.id
    ?? historyList?.find(r => r.status === "COMPLETED")?.id
    ?? null;

  // Detail + polling (only polls while RUNNING)
  const { data: activeReport } = useQuery<OverviewReport>({
    queryKey: ["m365-overview-report", effectiveReportId],
    queryFn: async () => {
      const res = await fetch(`/api/m365-overview-reports/${effectiveReportId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Failed to load report (${res.status})`);
      return res.json();
    },
    enabled: !!effectiveReportId,
    refetchInterval: (q) => {
      const data = q.state.data as OverviewReport | undefined;
      return data && data.status === "RUNNING" ? 3000 : false;
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/m365-overview-reports", {
        tenantConnectionId,
      });
      return res.json() as Promise<{ reportId: string }>;
    },
    onSuccess: (data) => {
      setActiveReportId(data.reportId);
      queryClient.invalidateQueries({ queryKey: ["m365-overview-history", tenantConnectionId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (reportId: string) => {
      const res = await apiRequest("DELETE", `/api/m365-overview-reports/${reportId}`);
      return res.json();
    },
    onSuccess: (_data, reportId) => {
      if (activeReportId === reportId) setActiveReportId(null);
      queryClient.invalidateQueries({ queryKey: ["m365-overview-history", tenantConnectionId] });
      queryClient.invalidateQueries({ queryKey: ["m365-overview-report"] });
    },
  });

  const isPolling = activeReport?.status === "RUNNING" || triggerMutation.isPending;
  const snapshot = activeReport?.snapshot ?? null;
  const recommendations = useMemo(
    () => (activeReport?.recommendations ?? []).slice().sort((a, b) => a.rank - b.rank),
    [activeReport?.recommendations],
  );

  return (
    <UpgradeGate
      feature="m365OverviewReport"
      fallback={
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <BarChart3 className="w-12 h-12 text-primary" />
          <h2 className="text-2xl font-bold">M365 30-Day Overview Report</h2>
          <p className="text-muted-foreground max-w-md">
            AI-authored executive overview of tenant change and risk in the last 30 days
            is available on the Enterprise plan. Upgrade to generate, persist, and share
            governance narratives for your leadership team.
          </p>
        </div>
      }
    >
      <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-primary" />
              M365 30-Day Overview
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              An AI-authored executive summary of what changed in your Microsoft 365
              tenant in the last 30 days — new sites, remixed channels, sharing posture,
              Copilot prompt quality, and prioritized recommendations.
            </p>
          </div>
        </div>

        {/* Controls */}
        <Card className="glass-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Generate New Report</CardTitle>
            <CardDescription>
              Generation takes 10–30 seconds. Reports are persisted and can be deleted anytime.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Button
                onClick={() => triggerMutation.mutate()}
                disabled={!tenantConnectionId || isPolling}
                className="gap-2"
                data-testid="button-generate-overview"
              >
                {isPolling ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>
                ) : (
                  <><Play className="w-4 h-4" /> Generate Report</>
                )}
              </Button>

              {triggerMutation.isError && (
                <p className="text-sm text-red-500">
                  {triggerMutation.error instanceof Error
                    ? triggerMutation.error.message
                    : "Failed to start"}
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
            {/* Header metadata */}
            <Card className="glass-panel">
              <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Window: {format(new Date(snapshot.windowStart), "MMM d")} – {format(new Date(snapshot.windowEnd), "MMM d, yyyy")}
                </div>
                {activeReport.modelUsed && (
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Model: <span className="font-mono text-xs">{activeReport.modelUsed}</span>
                  </div>
                )}
                {typeof activeReport.tokensUsed === "number" && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {activeReport.tokensUsed.toLocaleString()} tokens
                  </div>
                )}
              </CardContent>
            </Card>

            {/* KPI tiles */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {snapshot.kpis.map((kpi) => (
                <KpiTile
                  key={kpi.label}
                  label={kpi.label}
                  value={kpi.value}
                  deltaPct={kpi.deltaPct}
                  unit={kpi.unit}
                />
              ))}
            </div>

            {/* Executive narrative */}
            {activeReport.narrative && (
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" /> Executive Narrative
                  </CardTitle>
                  <CardDescription>
                    AI-authored summary combining change deltas and analytics signals.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
                    <ReactMarkdown>{activeReport.narrative}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 30-day changes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="glass-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Sites & Storage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">New sites</span><span className="font-semibold">{snapshot.sites.newSites}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Archived</span><span className="font-semibold">{snapshot.sites.archivedSites}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Deleted</span><span className="font-semibold">{snapshot.sites.deletedSites}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Newly inactive</span><span className="font-semibold">{snapshot.sites.newlyInactive}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Top-10 storage total</span><span className="font-semibold">{formatBytes(snapshot.sites.storageTop10Bytes)}</span></div>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Teams & Channels</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">New teams</span><span className="font-semibold">{snapshot.teams.newTeams}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">New channels</span><span className="font-semibold">{snapshot.teams.newChannels}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Remixed channels</span><span className="font-semibold">{snapshot.teams.remixedChannels}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Private channels</span><span className="font-semibold">{snapshot.teams.privateChannels}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Shared channels</span><span className="font-semibold">{snapshot.teams.sharedChannels}</span></div>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Libraries & IA</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">New libraries</span><span className="font-semibold">{snapshot.libraries.newLibraries}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Version sprawl</span><span className="font-semibold">{snapshot.libraries.versionSprawlFlagged}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Deep hierarchy</span><span className="font-semibold">{snapshot.libraries.deepFolderFlagged}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Unlabeled</span><span className="font-semibold">{snapshot.libraries.unlabeledLibraries}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Avg max folder depth</span><span className="font-semibold">{snapshot.libraries.averageMaxFolderDepth ?? "—"}</span></div>
                </CardContent>
              </Card>

              <Card className="glass-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Sharing & Copilot</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">New external links</span><span className="font-semibold">{snapshot.sharing.newExternalLinks}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Anonymous links</span><span className="font-semibold">{snapshot.sharing.anonymousLinks}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Expiring ≤7d</span><span className="font-semibold">{snapshot.sharing.expiringSoon}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Copilot interactions</span><span className="font-semibold">{snapshot.copilot.totalInteractions.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Unique users</span><span className="font-semibold">{snapshot.copilot.uniqueUsers.toLocaleString()}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Problematic share</span><span className="font-semibold">{Math.round(snapshot.copilot.problematicShare * 1000) / 10}%</span></div>
                </CardContent>
              </Card>
            </div>

            {/* Top growth sites */}
            {snapshot.sites.topGrowth.length > 0 && (
              <Card className="glass-panel">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Largest Sites by Storage</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Site</TableHead>
                        <TableHead className="text-right">Storage Used</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {snapshot.sites.topGrowth.map((w) => (
                        <TableRow key={w.workspaceId}>
                          <TableCell className="truncate max-w-md">
                            {w.siteUrl ? (
                              <a href={w.siteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                {w.displayName}
                              </a>
                            ) : (
                              w.displayName
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatBytes(w.storageUsedBytes)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-primary" /> Prioritized Recommendations
                  </CardTitle>
                  <CardDescription>
                    Ranked by AI using the underlying 30-day metrics and analytics signals.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recommendations.map((r) => {
                    const recommendationKey = `${r.rank}-${r.title}-${r.category}-${r.impact}-${r.effort}`;

                    return (
                      <div
                        key={recommendationKey}
                        className="rounded-xl border border-border p-4 space-y-2"
                        data-testid={`recommendation-${recommendationKey}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-7 h-7 shrink-0 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                              {r.rank}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium">{r.title}</p>
                              <p className="text-sm text-muted-foreground mt-0.5">{r.rationale}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge variant="outline" className={`text-[10px] ${impactColor(r.impact)}`}>
                              {r.impact} IMPACT
                            </Badge>
                            <Badge variant="outline" className="text-[10px]">
                              {r.effort} EFFORT
                            </Badge>
                            {categoryIcon(r.category)}
                          </div>
                        </div>
                        {r.evidenceRefs && r.evidenceRefs.length > 0 && (
                          <div className="flex flex-wrap gap-1 pl-10">
                            {r.evidenceRefs.map((e, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] font-mono bg-muted/30">
                                {e}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Data caveats */}
            {snapshot.dataCaveats.length > 0 && (
              <Card className="glass-panel border-amber-500/20">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-medium text-amber-600 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" /> Data caveats
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  {snapshot.dataCaveats.map((c, i) => (
                    <p key={i}>• {c}</p>
                  ))}
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Report history */}
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-base">Report History</CardTitle>
            <CardDescription>Past overview reports for this tenant. Select to view or delete.</CardDescription>
          </CardHeader>
          <CardContent>
            {!historyList || historyList.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reports yet. Click Generate Report above to create one.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Generated</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recs</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyList.map((r) => (
                    <TableRow
                      key={r.id}
                      className={effectiveReportId === r.id ? "bg-primary/5" : ""}
                    >
                      <TableCell className="text-xs">
                        {format(new Date(r.startedAt), "PPp")}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(r.windowStart), "MMM d")} – {format(new Date(r.windowEnd), "MMM d")}
                      </TableCell>
                      <TableCell>{statusBadge(r.status)}</TableCell>
                      <TableCell className="text-xs">{r.recommendationCount}</TableCell>
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
                                  The report and its AI narrative will be permanently deleted.
                                  This action cannot be undone.
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
