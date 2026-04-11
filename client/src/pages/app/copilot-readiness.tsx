import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  BrainCircuit,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  TrendingUp,
  ShieldOff,
  ArrowRight,
  RefreshCw,
  Ban,
  Sparkles,
  AlertTriangle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { UpgradeGate } from "@/components/upgrade-gate";

type ScoringCriterion = {
  key: string;
  label: string;
  weight: number;
  pass: boolean;
  description: string;
  remediation: string;
};

type WorkspaceReadiness = {
  workspaceId: string;
  displayName: string;
  siteUrl: string | null;
  tenantConnectionId: string | null;
  sensitivity: string;
  score: number;
  tier: "READY" | "NEARLY_READY" | "AT_RISK" | "BLOCKED" | "EXCLUDED";
  eligible: boolean;
  excluded: boolean;
  exclusionReason: string | null;
  criteria: ScoringCriterion[];
  blockers: ScoringCriterion[];
  passingCount: number;
  totalCount: number;
  remediationPriority: number;
};

type OrgReadinessSummary = {
  totalWorkspaces: number;
  evaluated: number;
  excluded: number;
  ready: number;
  nearlyReady: number;
  atRisk: number;
  blocked: number;
  averageScore: number;
  readinessPercent: number;
  blockerBreakdown: { key: string; label: string; count: number }[];
};

type ReadinessResponse = {
  summary: OrgReadinessSummary;
  workspaces: WorkspaceReadiness[];
  remediationQueue: WorkspaceReadiness[];
};

const TIER_META: Record<WorkspaceReadiness["tier"], { label: string; className: string; icon: React.ElementType }> = {
  READY: {
    label: "Ready",
    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    icon: CheckCircle2,
  },
  NEARLY_READY: {
    label: "Nearly Ready",
    className: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    icon: TrendingUp,
  },
  AT_RISK: {
    label: "At Risk",
    className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    icon: AlertTriangle,
  },
  BLOCKED: {
    label: "Blocked",
    className: "bg-red-500/10 text-red-500 border-red-500/20",
    icon: XCircle,
  },
  EXCLUDED: {
    label: "Excluded",
    className: "bg-muted/30 text-muted-foreground border-border",
    icon: Ban,
  },
};

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  let stroke = "stroke-red-500";
  if (score >= 100) stroke = "stroke-emerald-500";
  else if (score >= 80) stroke = "stroke-blue-500";
  else if (score >= 50) stroke = "stroke-amber-500";

  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={5}
        className="fill-none stroke-muted/40"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className={`fill-none ${stroke} transition-all`}
      />
    </svg>
  );
}

function ScoreBadge({ score }: { score: number }) {
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: 56, height: 56 }}>
      <ScoreRing score={score} size={56} />
      <span className="absolute text-sm font-bold">{score}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: WorkspaceReadiness["tier"] }) {
  const meta = TIER_META[tier];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`gap-1 ${meta.className}`}>
      <Icon className="w-3 h-3" /> {meta.label}
    </Badge>
  );
}

export default function CopilotReadinessPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [excludeDialog, setExcludeDialog] = useState<{ workspaceId: string; displayName: string; currentlyExcluded: boolean } | null>(null);
  const [exclusionReason, setExclusionReason] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery<ReadinessResponse>({
    queryKey: ["copilot-readiness"],
    queryFn: async () => {
      const res = await fetch("/api/copilot-readiness", { credentials: "include" });
      if (res.status === 403) {
        const err = await res.json();
        throw new Error(err.message || "Copilot readiness is not available on your current plan.");
      }
      if (!res.ok) throw new Error("Failed to fetch readiness data");
      return res.json();
    },
  });

  const exclusionMutation = useMutation({
    mutationFn: async ({ workspaceId, excluded, reason }: { workspaceId: string; excluded: boolean; reason?: string }) => {
      const res = await fetch(`/api/workspaces/${workspaceId}/copilot-exclusion`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excluded, reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update exclusion");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["copilot-readiness"] });
      setExcludeDialog(null);
      setExclusionReason("");
    },
  });

  const summary = data?.summary;
  const workspaces = data?.workspaces ?? [];
  const remediationQueue = data?.remediationQueue ?? [];

  const excludedWorkspaces = useMemo(() => workspaces.filter(w => w.excluded), [workspaces]);

  const handleToggleExclusion = () => {
    if (!excludeDialog) return;
    exclusionMutation.mutate({
      workspaceId: excludeDialog.workspaceId,
      excluded: !excludeDialog.currentlyExcluded,
      reason: exclusionReason || undefined,
    });
  };

  return (
    <UpgradeGate
      feature="copilotReadiness"
      fallback={
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <BrainCircuit className="w-12 h-12 text-primary" />
          <h2 className="text-2xl font-bold">Copilot Readiness Dashboard</h2>
          <p className="text-muted-foreground max-w-md">
            Explainable Copilot eligibility analysis is available on the Professional plan and above.
            Upgrade to score, rank, and remediate workspaces at scale.
          </p>
        </div>
      }
    >
      <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Sparkles className="w-8 h-8 text-primary" />
              Copilot Readiness
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Explainable 0–100 readiness scores per workspace with ranked remediation queue.
              Answers the question — "Why is Copilot allowed (or blocked) here?"
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={isFetching}
            onClick={() => refetch()}
            data-testid="button-refresh-readiness"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Computing readiness scores…
          </div>
        )}

        {!isLoading && summary && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="glass-panel" data-testid="card-summary-score">
                <CardHeader className="pb-2">
                  <CardDescription>Average Readiness Score</CardDescription>
                  <div className="flex items-center gap-4 pt-2">
                    <ScoreBadge score={summary.averageScore} />
                    <div>
                      <div className="text-3xl font-bold">{summary.averageScore}</div>
                      <p className="text-xs text-muted-foreground">across {summary.evaluated} workspaces</p>
                    </div>
                  </div>
                </CardHeader>
              </Card>

              <Card className="glass-panel" data-testid="card-summary-ready">
                <CardHeader className="pb-2">
                  <CardDescription>Copilot Ready</CardDescription>
                  <div className="flex items-end gap-2 pt-2">
                    <div className="text-3xl font-bold text-emerald-500">{summary.ready}</div>
                    <div className="text-sm text-muted-foreground pb-1">/ {summary.evaluated}</div>
                  </div>
                  <Progress value={summary.readinessPercent} className="h-2 mt-2" />
                  <p className="text-xs text-muted-foreground mt-1">{summary.readinessPercent}% of evaluated workspaces</p>
                </CardHeader>
              </Card>

              <Card className="glass-panel" data-testid="card-summary-nearly">
                <CardHeader className="pb-2">
                  <CardDescription>Nearly Ready</CardDescription>
                  <div className="text-3xl font-bold text-blue-500 pt-2">{summary.nearlyReady}</div>
                  <p className="text-xs text-muted-foreground mt-1">score ≥ 80, one or two blockers remaining</p>
                </CardHeader>
              </Card>

              <Card className="glass-panel" data-testid="card-summary-blocked">
                <CardHeader className="pb-2">
                  <CardDescription>At Risk / Blocked</CardDescription>
                  <div className="flex items-end gap-4 pt-2">
                    <div>
                      <div className="text-3xl font-bold text-amber-500">{summary.atRisk}</div>
                      <p className="text-xs text-muted-foreground">at risk</p>
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-red-500">{summary.blocked}</div>
                      <p className="text-xs text-muted-foreground">blocked</p>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </div>

            {/* Top blockers */}
            {summary.blockerBreakdown.length > 0 && (
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ShieldAlert className="w-4 h-4 text-primary" /> Top Blockers
                  </CardTitle>
                  <CardDescription>
                    Aggregate failing criteria across {summary.evaluated} evaluated workspaces — fix the
                    top items for maximum org-wide readiness impact.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {summary.blockerBreakdown.slice(0, 8).map(b => (
                      <div
                        key={b.key}
                        className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/40"
                        data-testid={`blocker-${b.key}`}
                      >
                        <span className="text-sm font-medium truncate pr-2">{b.label}</span>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                          {b.count}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Remediation queue */}
            <Card className="glass-panel">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="w-4 h-4 text-primary" /> Remediation Queue
                </CardTitle>
                <CardDescription>
                  Workspaces closest to Copilot eligibility appear first. Click a row to see the
                  blocker breakdown and remediation steps.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {remediationQueue.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-emerald-500" />
                    <p className="font-medium">All evaluated workspaces are Copilot Ready.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {remediationQueue.map((ws, idx) => {
                      const isExpanded = expandedId === ws.workspaceId;
                      return (
                        <div key={ws.workspaceId} data-testid={`row-remediation-${ws.workspaceId}`}>
                          <button
                            type="button"
                            className="w-full flex items-center gap-4 p-4 hover:bg-muted/10 transition-colors text-left"
                            onClick={() => setExpandedId(isExpanded ? null : ws.workspaceId)}
                          >
                            <div className="w-8 text-sm font-mono text-muted-foreground">#{idx + 1}</div>
                            <ScoreBadge score={ws.score} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium truncate" data-testid={`text-workspace-name-${ws.workspaceId}`}>{ws.displayName}</span>
                                <TierBadge tier={ws.tier} />
                              </div>
                              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                <span>{ws.blockers.length} blocker{ws.blockers.length === 1 ? "" : "s"}</span>
                                <span>·</span>
                                <span>{ws.passingCount}/{ws.totalCount} criteria passing</span>
                                {ws.sensitivity && (
                                  <>
                                    <span>·</span>
                                    <span className="uppercase text-[10px] font-mono">{ws.sensitivity}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <ChevronDown
                              className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            />
                          </button>

                          {isExpanded && (
                            <div className="bg-muted/5 border-t border-border/50 p-6 space-y-4" data-testid={`detail-${ws.workspaceId}`}>
                              <div className="space-y-2">
                                <h4 className="text-sm font-semibold flex items-center gap-2">
                                  <ShieldAlert className="w-4 h-4 text-red-500" /> Blockers to Resolve
                                </h4>
                                {ws.blockers.map(b => (
                                  <div
                                    key={b.key}
                                    className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 space-y-1"
                                    data-testid={`blocker-detail-${ws.workspaceId}-${b.key}`}
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-sm font-medium">{b.label}</span>
                                      <Badge variant="outline" className="text-[10px]">weight {b.weight}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{b.description}</p>
                                    <p className="text-xs text-foreground flex items-center gap-1 pt-1">
                                      <ArrowRight className="w-3 h-3 text-primary" /> {b.remediation}
                                    </p>
                                  </div>
                                ))}
                              </div>

                              {ws.criteria.filter(c => c.pass).length > 0 && (
                                <div className="space-y-2">
                                  <h4 className="text-sm font-semibold flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Passing Criteria
                                  </h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {ws.criteria.filter(c => c.pass).map(c => (
                                      <div
                                        key={c.key}
                                        className="text-xs p-2 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-300 flex items-center gap-2"
                                      >
                                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                                        {c.label}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-between pt-2 border-t border-border/40">
                                {ws.siteUrl && (
                                  <a
                                    href={ws.siteUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-primary hover:underline"
                                  >
                                    Open in SharePoint ↗
                                  </a>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-2 text-xs"
                                  onClick={() =>
                                    setExcludeDialog({
                                      workspaceId: ws.workspaceId,
                                      displayName: ws.displayName,
                                      currentlyExcluded: ws.excluded,
                                    })
                                  }
                                  data-testid={`button-exclude-${ws.workspaceId}`}
                                >
                                  <ShieldOff className="w-3 h-3" />
                                  {ws.excluded ? "Remove Exclusion" : "Exclude from Copilot"}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Exclusions */}
            {excludedWorkspaces.length > 0 && (
              <Card className="glass-panel">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Ban className="w-4 h-4 text-muted-foreground" /> Explicit Exclusions
                  </CardTitle>
                  <CardDescription>
                    Workspaces explicitly excluded from Copilot readiness scoring. These are not
                    counted in the org-wide average.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y divide-border/50">
                    {excludedWorkspaces.map(ws => (
                      <div
                        key={ws.workspaceId}
                        className="flex items-center justify-between p-4"
                        data-testid={`row-exclusion-${ws.workspaceId}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{ws.displayName}</span>
                            <TierBadge tier="EXCLUDED" />
                          </div>
                          {ws.exclusionReason && (
                            <p className="text-xs text-muted-foreground mt-1 truncate max-w-xl">
                              {ws.exclusionReason}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setExcludeDialog({
                              workspaceId: ws.workspaceId,
                              displayName: ws.displayName,
                              currentlyExcluded: true,
                            })
                          }
                          data-testid={`button-remove-exclusion-${ws.workspaceId}`}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Exclusion dialog */}
        <Dialog open={!!excludeDialog} onOpenChange={o => !o && setExcludeDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {excludeDialog?.currentlyExcluded ? "Remove Copilot Exclusion" : "Exclude from Copilot Readiness"}
              </DialogTitle>
              <DialogDescription>
                {excludeDialog?.currentlyExcluded
                  ? `Re-include "${excludeDialog?.displayName}" in Copilot readiness scoring.`
                  : `"${excludeDialog?.displayName}" will be excluded from readiness scoring and org-wide averages. Use this for workspaces that should never be Copilot-eligible (e.g. Family Office sites, legal hold workspaces).`}
              </DialogDescription>
            </DialogHeader>
            {!excludeDialog?.currentlyExcluded && (
              <div className="space-y-2">
                <Label htmlFor="exclusion-reason">Reason (optional)</Label>
                <Input
                  id="exclusion-reason"
                  placeholder="e.g. Family Office site — always excluded"
                  value={exclusionReason}
                  onChange={e => setExclusionReason(e.target.value)}
                  data-testid="input-exclusion-reason"
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setExcludeDialog(null)}>Cancel</Button>
              <Button
                onClick={handleToggleExclusion}
                disabled={exclusionMutation.isPending}
                data-testid="button-confirm-exclusion"
              >
                {exclusionMutation.isPending ? "Saving…" : excludeDialog?.currentlyExcluded ? "Remove Exclusion" : "Exclude"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </UpgradeGate>
  );
}
