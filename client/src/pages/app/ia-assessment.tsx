import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import {
  Network,
  Play,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  Clock,
  Download,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { UpgradeGate } from "@/components/upgrade-gate";
import { useTenant } from "@/lib/tenant-context";
import { format } from "date-fns";
import ReactMarkdown from "react-markdown";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type IAAssessmentStatus = "RUNNING" | "COMPLETED" | "FAILED";

interface IAOffender {
  workspaceId: string;
  displayName: string;
  siteUrl: string | null;
  reason: string;
}

interface IADimensionResult {
  key: string;
  label: string;
  score: number;
  weight: number;
  aiCommentary: string;
  worstOffenders: IAOffender[];
}

interface IARoadmapItem {
  horizon: "30_DAY" | "60_DAY" | "90_DAY";
  action: string;
  expectedImpact: string;
}

interface IAAssessmentRun {
  id: string;
  tenantConnectionId: string;
  orgId: string;
  triggeredBy: string | null;
  status: IAAssessmentStatus;
  overallScore: number | null;
  executiveSummary: string | null;
  dimensions: IADimensionResult[] | null;
  roadmap: IARoadmapItem[] | null;
  totalSites: number | null;
  evaluatedSites: number | null;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  errorMessage: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface RunHistoryResponse {
  runs: IAAssessmentRun[];
  total: number;
  limit: number;
  offset: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-blue-500";
  if (score >= 40) return "text-amber-500";
  return "text-red-500";
}

function scoreStroke(score: number): string {
  if (score >= 80) return "stroke-emerald-500";
  if (score >= 60) return "stroke-blue-500";
  if (score >= 40) return "stroke-amber-500";
  return "stroke-red-500";
}

function ScoreGauge({ score, size = 120 }: { score: number; size?: number }) {
  const radius = (size - 10) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  const stroke = scoreStroke(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={8}
          className="fill-none stroke-muted/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`fill-none ${stroke} transition-all duration-700`}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={`text-3xl font-bold ${scoreColor(score)}`}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

function DimensionCard({
  dimension,
  expanded,
  onToggle,
}: {
  dimension: IADimensionResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-border/50 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-4 p-4 hover:bg-muted/10 transition-colors text-left"
        onClick={onToggle}
        data-testid={`button-dimension-${dimension.key}`}
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-background border border-border/60 shrink-0">
          <span className={`text-sm font-bold ${scoreColor(dimension.score)}`}>{dimension.score}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">{dimension.label}</span>
            <Badge variant="outline" className="text-[10px]">weight {dimension.weight}%</Badge>
          </div>
          <Progress
            value={dimension.score}
            className="h-1.5 mt-2"
          />
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="bg-muted/5 border-t border-border/40 p-5 space-y-4" data-testid={`detail-dimension-${dimension.key}`}>
          <div className="text-sm text-muted-foreground leading-relaxed">
            {dimension.aiCommentary}
          </div>

          {dimension.worstOffenders.length > 0 && (
            <div>
              <h5 className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">
                Worst Offenders
              </h5>
              <div className="space-y-2">
                {dimension.worstOffenders.map(o => (
                  <div
                    key={o.workspaceId}
                    className="flex items-start gap-3 p-2.5 rounded-lg border border-amber-500/20 bg-amber-500/5"
                    data-testid={`offender-${dimension.key}-${o.workspaceId}`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="text-xs font-medium truncate">{o.displayName}</div>
                      <div className="text-xs text-muted-foreground">{o.reason}</div>
                      {o.siteUrl && (
                        <a
                          href={o.siteUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-primary hover:underline"
                        >
                          Open in SharePoint ↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function downloadMarkdown(run: IAAssessmentRun) {
  const lines: string[] = [
    `# IA Assessment Report`,
    ``,
    `**Date:** ${format(new Date(run.createdAt), "PPpp")}`,
    `**Overall IA Health Score:** ${run.overallScore ?? "N/A"} / 100`,
    `**Total Sites:** ${run.totalSites ?? "—"} | **Evaluated:** ${run.evaluatedSites ?? "—"}`,
    ``,
    `## Executive Summary`,
    ``,
    run.executiveSummary ?? "_Not available_",
    ``,
    `## Dimension Scores`,
    ``,
  ];

  if (run.dimensions) {
    for (const d of run.dimensions) {
      lines.push(`### ${d.label} — ${d.score}/100`);
      lines.push(``);
      lines.push(d.aiCommentary);
      lines.push(``);
      if (d.worstOffenders.length > 0) {
        lines.push(`**Worst Offenders:**`);
        for (const o of d.worstOffenders) {
          lines.push(`- **${o.displayName}**: ${o.reason}`);
        }
        lines.push(``);
      }
    }
  }

  if (run.roadmap && run.roadmap.length > 0) {
    lines.push(`## 30/60/90-Day Roadmap`);
    lines.push(``);
    for (const item of run.roadmap) {
      const horizonLabel = item.horizon === "30_DAY" ? "30 Days" : item.horizon === "60_DAY" ? "60 Days" : "90 Days";
      lines.push(`### ${horizonLabel}`);
      lines.push(`**Action:** ${item.action}`);
      lines.push(`**Expected Impact:** ${item.expectedImpact}`);
      lines.push(``);
    }
  }

  const content = lines.join("\n");
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ia-assessment-${run.id.slice(0, 8)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function IAAssessmentPage() {
  const { selectedTenant } = useTenant();
  const selectedTenantId = selectedTenant?.id ?? "";
  const [pollingRunId, setPollingRunId] = useState<string | null>(null);
  const [expandedDimension, setExpandedDimension] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Poll active run
  const { data: polledRun, isLoading: pollingLoading } = useQuery<IAAssessmentRun>({
    queryKey: ["ia-assessment-run", pollingRunId],
    queryFn: async () => {
      const res = await fetch(`/api/ia-assessment/${pollingRunId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch run");
      return res.json();
    },
    enabled: !!pollingRunId,
    refetchInterval: (data) => {
      if (!data) return 3000;
      const run = data as IAAssessmentRun;
      return run.status === "RUNNING" ? 3000 : false;
    },
  });

  // When polling completes, refresh history
  useEffect(() => {
    if (polledRun && polledRun.status !== "RUNNING") {
      setPollingRunId(null);
      setActiveRunId(polledRun.id);
      queryClient.invalidateQueries({ queryKey: ["ia-assessment-history"] });
    }
  }, [polledRun]);

  // History
  const { data: history, isLoading: historyLoading } = useQuery<RunHistoryResponse>({
    queryKey: ["ia-assessment-history", selectedTenantId],
    queryFn: async () => {
      const params = selectedTenantId ? `?tenantConnectionId=${selectedTenantId}` : "";
      const res = await fetch(`/api/ia-assessment/history${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json();
    },
    enabled: true,
  });

  // Load specific run for viewing
  const { data: viewingRun, isLoading: viewingLoading } = useQuery<IAAssessmentRun>({
    queryKey: ["ia-assessment-run", activeRunId],
    queryFn: async () => {
      const res = await fetch(`/api/ia-assessment/${activeRunId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch run");
      return res.json();
    },
    enabled: !!activeRunId && activeRunId !== pollingRunId,
  });

  const triggerMutation = useMutation({
    mutationFn: async (tenantConnectionId: string) => {
      const res = await fetch("/api/ia-assessment", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantConnectionId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to start assessment");
      }
      return res.json() as Promise<{ runId: string }>;
    },
    onSuccess: (data) => {
      setPollingRunId(data.runId);
      setActiveRunId(null);
    },
  });

  const activeRun = polledRun ?? viewingRun ?? null;
  const isPolling = !!pollingRunId && polledRun?.status === "RUNNING";
  const isCompleted = activeRun?.status === "COMPLETED";

  const radarData = isCompleted && activeRun?.dimensions
    ? activeRun.dimensions.map(d => ({ subject: d.label, score: d.score, fullMark: 100 }))
    : [];

  return (
    <UpgradeGate
      feature="iaAssessment"
      fallback={
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <Network className="w-12 h-12 text-primary" />
          <h2 className="text-2xl font-bold">IA Assessment</h2>
          <p className="text-muted-foreground max-w-md">
            AI-powered Information Architecture analysis is available on the Enterprise plan.
            Upgrade to get IA health scores, dimension breakdowns, and actionable roadmaps.
          </p>
        </div>
      }
    >
      <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Network className="w-8 h-8 text-primary" />
              IA Assessment
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              AI-powered Information Architecture health analysis — naming, hub governance,
              metadata completeness, sensitivity coverage, lifecycle, library structure,
              content type deployment, and metadata schema scoring with a 30/60/90-day roadmap.
            </p>
          </div>
        </div>

        {/* Controls */}
        <Card className="glass-panel">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Run New Assessment</CardTitle>
            <CardDescription>
              Click Run Assessment to analyze the selected tenant. Analysis takes 15–60 seconds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <Button
                onClick={() => {
                  if (selectedTenantId) triggerMutation.mutate(selectedTenantId);
                }}
                disabled={!selectedTenantId || isPolling || triggerMutation.isPending}
                className="gap-2"
                data-testid="button-run-assessment"
              >
                {isPolling || triggerMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</>
                ) : (
                  <><Play className="w-4 h-4" /> Run Assessment</>
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

            {isPolling && (
              <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground animate-pulse">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                AI is analyzing your workspace inventory… this may take up to a minute.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assessment results */}
        {activeRun && activeRun.status === "FAILED" && (
          <Card className="glass-panel border-red-500/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-red-500">
                <XCircle className="w-4 h-4" /> Assessment Failed
              </CardTitle>
              <CardDescription>{activeRun.errorMessage || "An unexpected error occurred."}</CardDescription>
            </CardHeader>
          </Card>
        )}

        {isCompleted && activeRun && (
          <>
            {/* Score overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="glass-panel md:col-span-1 flex flex-col items-center justify-center py-8">
                <p className="text-sm text-muted-foreground mb-3 font-medium">IA Health Score</p>
                <ScoreGauge score={activeRun.overallScore ?? 0} data-testid="gauge-ia-health-score" />
                <div className="mt-4 text-xs text-muted-foreground text-center space-y-1">
                  <div>{activeRun.evaluatedSites ?? "—"} sites evaluated</div>
                  <div>{format(new Date(activeRun.createdAt), "PPp")}</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4 gap-2 text-xs"
                  onClick={() => downloadMarkdown(activeRun)}
                  data-testid="button-download-report"
                >
                  <Download className="w-3 h-3" /> Download Report
                </Button>
              </Card>

              <Card className="glass-panel md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" /> Dimension Radar
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {radarData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis
                          dataKey="subject"
                          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                        />
                        <Radar
                          name="Score"
                          dataKey="score"
                          stroke="hsl(var(--primary))"
                          fill="hsl(var(--primary))"
                          fillOpacity={0.15}
                          strokeWidth={2}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            borderRadius: 8,
                          }}
                          formatter={(val: number) => [`${val}/100`, "Score"]}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
                      No dimension data
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Executive summary */}
            {activeRun.executiveSummary && (
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" /> Executive Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed"
                    data-testid="text-executive-summary"
                  >
                    <ReactMarkdown>{activeRun.executiveSummary}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Dimension breakdown */}
            {activeRun.dimensions && activeRun.dimensions.length > 0 && (
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-base">Dimension Breakdown</CardTitle>
                  <CardDescription>
                    Click a dimension to see AI commentary and worst-offending sites.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeRun.dimensions.map(d => (
                    <DimensionCard
                      key={d.key}
                      dimension={d}
                      expanded={expandedDimension === d.key}
                      onToggle={() =>
                        setExpandedDimension(prev => (prev === d.key ? null : d.key))
                      }
                    />
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Roadmap */}
            {activeRun.roadmap && activeRun.roadmap.length > 0 && (
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" /> 30/60/90-Day Roadmap
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(["30_DAY", "60_DAY", "90_DAY"] as const).map(horizon => {
                      const item = activeRun.roadmap!.find(r => r.horizon === horizon);
                      const horizonLabel =
                        horizon === "30_DAY" ? "30 Days" : horizon === "60_DAY" ? "60 Days" : "90 Days";
                      const color =
                        horizon === "30_DAY"
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : horizon === "60_DAY"
                          ? "border-blue-500/30 bg-blue-500/5"
                          : "border-purple-500/30 bg-purple-500/5";
                      return (
                        <div
                          key={horizon}
                          className={`rounded-xl p-4 border ${color} space-y-2`}
                          data-testid={`roadmap-${horizon}`}
                        >
                          <Badge variant="outline" className="text-xs font-mono">
                            {horizonLabel}
                          </Badge>
                          {item ? (
                            <>
                              <p className="text-sm font-medium leading-snug">{item.action}</p>
                              <p className="text-xs text-muted-foreground">{item.expectedImpact}</p>
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground italic">No item</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Run history */}
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-base">Assessment History</CardTitle>
            <CardDescription>Previous runs, newest first. Click a row to view its results.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading history…
              </div>
            ) : !history || history.runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                <Network className="w-6 h-6" />
                <p className="text-sm">No assessments yet — run your first one above.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Sites</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.runs.map(run => (
                    <TableRow
                      key={run.id}
                      className="cursor-pointer"
                      onClick={() => setActiveRunId(run.id)}
                      data-testid={`row-run-${run.id}`}
                    >
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(run.createdAt), "PPp")}
                      </TableCell>
                      <TableCell>
                        {run.status === "COMPLETED" ? (
                          <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3" /> Completed
                          </Badge>
                        ) : run.status === "RUNNING" ? (
                          <Badge variant="outline" className="gap-1 bg-blue-500/10 text-blue-500 border-blue-500/20">
                            <Loader2 className="w-3 h-3 animate-spin" /> Running
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 bg-red-500/10 text-red-500 border-red-500/20">
                            <XCircle className="w-3 h-3" /> Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold">
                        {run.overallScore != null ? (
                          <span className={scoreColor(run.overallScore)}>{run.overallScore}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {run.evaluatedSites ?? "—"}
                      </TableCell>
                      <TableCell>
                        {run.status === "COMPLETED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs"
                            onClick={(e) => { e.stopPropagation(); downloadMarkdown(run); }}
                            data-testid={`button-download-${run.id}`}
                          >
                            <Download className="w-3 h-3" />
                          </Button>
                        )}
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
