import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Clock,
  Search,
  Users,
  Globe,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Archive,
  CalendarDays,
  ShieldAlert,
  Building2,
  Loader2,
  UserX,
  Share2,
  Mail,
  Tag,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { DatasetFreshnessBanner } from "@/components/datasets";
import { apiRequest } from "@/lib/queryClient";

type FilterKey = "all" | "stale" | "orphaned" | "missingLabel" | "missingMetadata" | "externalUnclassified";
type SortKey = "scoreAsc" | "scoreDesc" | "lastActivityAsc" | "lastActivityDesc";

type ReviewItem = {
  id: string;
  displayName: string;
  type: string;
  siteUrl: string | null;
  tenantConnectionId: string | null;
  ownerDisplayName: string | null;
  ownerCount: number;
  sensitivity: string | null;
  sensitivityLabelId: string | null;
  retentionLabelId: string | null;
  externalSharing: boolean;
  lastActivityDate: string | null;
  daysSinceActivity: number | null;
  score: number;
  compliant: boolean;
  isStale: boolean;
  isOrphaned: boolean;
  missingLabel: boolean;
  missingMetadata: boolean;
  externallySharedUnclassified: boolean;
  breakdown: Array<{ key: string; label: string; weight: number; pass: boolean; remediation: string }>;
};

type ReviewResponse = {
  items: ReviewItem[];
  total: number;
  page: number;
  pageSize: number;
  rules: { staleThresholdDays: number; orphanedThresholdDays: number; labelRequired: boolean; metadataRequired: boolean };
};

type HealthResponse = {
  summary: {
    total: number;
    compliant: number;
    compliantPercent: number;
    stale: number;
    orphaned: number;
    missingLabel: number;
    externallyShared: number;
    averageScore: number;
    trendDelta: number;
  };
  trend: Array<{ date: string | null; averageScore: number; compliantCount: number; workspacesScanned: number }>;
  latestScan: { id: string; completedAt: string | null; workspacesScanned: number; averageScore: number } | null;
};

const typeIcon = (type: string) => {
  switch (type) {
    case "TEAM_SITE": return <Users className="w-4 h-4 text-blue-500" />;
    case "COMMUNICATION_SITE": return <Globe className="w-4 h-4 text-teal-500" />;
    case "HUB_SITE": return <Building2 className="w-4 h-4 text-indigo-500" />;
    default: return <FolderOpen className="w-4 h-4 text-muted-foreground" />;
  }
};

const typeLabel = (type: string): string => {
  switch (type) {
    case "TEAM_SITE": return "Team Site";
    case "COMMUNICATION_SITE": return "Communication Site";
    case "HUB_SITE": return "Hub Site";
    default: return type.replace(/_/g, " ");
  }
};

const scoreBadgeColor = (score: number): string => {
  if (score >= 80) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
  if (score >= 50) return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
  return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
};

const Sparkline = ({ data, height = 40 }: { data: number[]; height?: number }) => {
  if (data.length === 0) {
    return <div className="text-xs text-muted-foreground italic">No scan history yet</div>;
  }
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 100);
  const range = max - min || 1;
  const width = 200;
  const step = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((v, i) => `${i * step},${height - ((v - min) / range) * height}`).join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible" data-testid="sparkline-trend">
      <polyline fill="none" stroke="currentColor" strokeWidth="2" points={points} className="text-primary" />
      {data.map((v, i) => (
        <circle key={i} cx={i * step} cy={height - ((v - min) / range) * height} r="2" className="fill-primary" />
      ))}
    </svg>
  );
};

export default function LifecycleReviewHub() {
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("scoreAsc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pageSize = 20;

  const reviewKey = ["/api/lifecycle/review", tenantConnectionId, filter, sort, searchTerm, page];
  const { data: review, isLoading } = useQuery<ReviewResponse>({
    queryKey: reviewKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      if (filter !== "all") params.set("filter", filter);
      if (sort) params.set("sort", sort);
      if (searchTerm) params.set("search", searchTerm);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/lifecycle/review?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load review queue");
      return res.json();
    },
  });

  const { data: health } = useQuery<HealthResponse>({
    queryKey: ["/api/lifecycle/health", tenantConnectionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      const res = await fetch(`/api/lifecycle/health?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load health");
      return res.json();
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/lifecycle/review/scan", { tenantConnectionId });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Lifecycle scan complete", description: "Compliance scores have been refreshed." });
      qc.invalidateQueries({ queryKey: ["/api/lifecycle/review"] });
      qc.invalidateQueries({ queryKey: ["/api/lifecycle/health"] });
    },
    onError: (err: any) => {
      toast({ title: "Scan failed", description: err.message ?? String(err), variant: "destructive" });
    },
  });

  const emailOwnerMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const res = await apiRequest("POST", `/api/lifecycle/review/${workspaceId}/email-owner`, {});
      return res.json() as Promise<{ ok: boolean; recipient?: string; score?: number }>;
    },
    onSuccess: (data) => {
      toast({
        title: "Owner notified",
        description: data?.recipient
          ? `Remediation email sent to ${data.recipient}.`
          : "Remediation email sent.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Email failed", description: err.message ?? String(err), variant: "destructive" });
    },
  });

  const items = review?.items ?? [];
  const total = review?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const allSelected = items.length > 0 && items.every(i => selected.has(i.id));
  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selected);
      items.forEach(i => next.delete(i.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      items.forEach(i => next.add(i.id));
      setSelected(next);
    }
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const summary = health?.summary;
  const trendData = useMemo(() => (health?.trend ?? []).map(p => p.averageScore), [health?.trend]);

  const [bulkEmailing, setBulkEmailing] = useState(false);
  const handleBulkEmail = async () => {
    if (selected.size === 0) return;
    setBulkEmailing(true);
    const ids = Array.from(selected);
    let ok = 0;
    const failures: Array<{ id: string; error: string }> = [];
    // Call the API directly here (not via emailOwnerMutation.mutateAsync) so
    // that we don't fire one toast per row — only a single aggregate toast.
    for (const id of ids) {
      try {
        const res = await apiRequest("POST", `/api/lifecycle/review/${id}/email-owner`, {});
        await res.json();
        ok++;
      } catch (err: any) {
        failures.push({ id, error: err?.message ?? String(err) });
      }
    }
    const failed = failures.length;
    const itemsById = new Map(items.map(i => [i.id, i] as const));
    if (failed === 0) {
      toast({
        title: "Bulk emails sent",
        description: `${ok} of ${ids.length} owner emails delivered.`,
      });
    } else {
      const sample = failures.slice(0, 3).map(f => {
        const name = itemsById.get(f.id)?.displayName ?? f.id;
        return `${name}: ${f.error}`;
      }).join("; ");
      const more = failed > 3 ? ` (+${failed - 3} more)` : "";
      toast({
        title: `${ok} sent, ${failed} failed`,
        description: `${sample}${more}`,
        variant: "destructive",
      });
    }
    setBulkEmailing(false);
    setSelected(new Set());
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Site Lifecycle Review Queue</h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Server-side compliance scoring across stewardship, classification, activity, and sharing posture.
              No destructive actions occur without human confirmation.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              className="gap-2"
              data-testid="button-run-scan"
            >
              {scanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {scanMutation.isPending ? "Scanning..." : "Run Lifecycle Scan"}
            </Button>
          </div>
        </div>

        {tenantConnectionId && (
          <DatasetFreshnessBanner tenantConnectionId={tenantConnectionId} datasets={["workspaces"]} />
        )}

        {/* Health summary card with sparkline */}
        <Card className="glass-panel border-border/50 shadow-md" data-testid="card-health-summary">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ShieldAlert className="w-5 h-5 text-primary" />
                  Lifecycle Health Summary
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  Average compliance score across all in-scope workspaces, with the last 8 scan results.
                </CardDescription>
              </div>
              {health?.latestScan?.completedAt && (
                <span className="text-xs text-muted-foreground">
                  Last scan: {new Date(health.latestScan.completedAt).toLocaleString()}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="grid grid-cols-2 md:grid-cols-6 gap-6">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Avg Score</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold" data-testid="text-avg-score">{summary?.averageScore ?? 0}</span>
                  <span className="text-sm text-muted-foreground">/100</span>
                </div>
                {summary && summary.trendDelta !== 0 && (
                  <div className={`text-xs flex items-center gap-1 ${summary.trendDelta > 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {summary.trendDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {summary.trendDelta > 0 ? "+" : ""}{summary.trendDelta} vs prev
                  </div>
                )}
                {summary && summary.trendDelta === 0 && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Minus className="w-3 h-3" /> No prior scan
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Compliant</div>
                <div className="text-2xl font-semibold text-emerald-500" data-testid="text-compliant">{summary?.compliant ?? 0}</div>
                <div className="text-xs text-muted-foreground">{summary?.compliantPercent ?? 0}% of {summary?.total ?? 0}</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Stale</div>
                <div className="text-2xl font-semibold text-amber-500" data-testid="text-stale-count">{summary?.stale ?? 0}</div>
                <div className="text-xs text-muted-foreground">No recent activity</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Orphaned</div>
                <div className="text-2xl font-semibold text-indigo-500" data-testid="text-orphaned-count">{summary?.orphaned ?? 0}</div>
                <div className="text-xs text-muted-foreground">No primary steward</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Unlabeled</div>
                <div className="text-2xl font-semibold text-rose-500" data-testid="text-unlabeled-count">{summary?.missingLabel ?? 0}</div>
                <div className="text-xs text-muted-foreground">Missing sensitivity label</div>
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">8-Week Trend</div>
                <Sparkline data={trendData} />
                <div className="text-xs text-muted-foreground">{trendData.length} scan{trendData.length === 1 ? "" : "s"}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters & queue */}
        <Card className="glass-panel border-border/50 shadow-xl" data-testid="card-review-queue">
          <CardHeader className="pb-3 border-b border-border/40 bg-muted/10">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" />
                Review Queue
                <Badge variant="outline" className="ml-1 text-xs" data-testid="badge-total">{total}</Badge>
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search workspaces or owners..."
                    className="pl-9 h-9 w-64 bg-background/50"
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                    data-testid="input-search"
                  />
                </div>
                <Select value={filter} onValueChange={(v) => { setFilter(v as FilterKey); setPage(1); }}>
                  <SelectTrigger className="w-[200px] h-9" data-testid="select-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All workspaces</SelectItem>
                    <SelectItem value="stale">Stale (no recent activity)</SelectItem>
                    <SelectItem value="orphaned">Orphaned (no owner)</SelectItem>
                    <SelectItem value="missingLabel">Missing sensitivity label</SelectItem>
                    <SelectItem value="missingMetadata">Missing required metadata</SelectItem>
                    <SelectItem value="externalUnclassified">External & unclassified</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                  <SelectTrigger className="w-[180px] h-9" data-testid="select-sort">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scoreAsc">Lowest score first</SelectItem>
                    <SelectItem value="scoreDesc">Highest score first</SelectItem>
                    <SelectItem value="lastActivityDesc">Oldest activity first</SelectItem>
                    <SelectItem value="lastActivityAsc">Newest activity first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {selected.size > 0 && (
              <div className="flex items-center gap-3 mt-3 p-2 rounded-lg bg-primary/5 border border-primary/20">
                <span className="text-sm font-medium" data-testid="text-selection-count">{selected.size} selected</span>
                <Button size="sm" variant="default" className="h-8 gap-1.5" onClick={handleBulkEmail} disabled={bulkEmailing} data-testid="button-bulk-email">
                  {bulkEmailing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Email owners
                </Button>
                <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())} data-testid="button-clear-selection">
                  Clear
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading review queue...
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/40" />
                <p className="text-sm text-muted-foreground">
                  {searchTerm || filter !== "all" ? "No matches found." : "All workspaces are compliant — nothing in queue."}
                </p>
                {!health?.latestScan && (
                  <p className="text-xs text-muted-foreground/70">Run a lifecycle scan to populate compliance scores.</p>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="w-10 pl-6">
                      <Checkbox checked={allSelected} onCheckedChange={toggleAll} data-testid="checkbox-select-all" />
                    </TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Issues</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead className="text-right pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/10" data-testid={`row-review-${item.id}`}>
                      <TableCell className="pl-6">
                        <Checkbox
                          checked={selected.has(item.id)}
                          onCheckedChange={() => toggleOne(item.id)}
                          data-testid={`checkbox-row-${item.id}`}
                        />
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center shrink-0">
                            {typeIcon(item.type)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-sm truncate max-w-[240px]" title={item.displayName} data-testid={`text-workspace-name-${item.id}`}>
                              {item.displayName}
                            </span>
                            <span className="text-xs text-muted-foreground">{typeLabel(item.type)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="outline" className={`${scoreBadgeColor(item.score)} font-semibold`} data-testid={`badge-score-${item.id}`}>
                              {item.score}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="space-y-1.5 text-xs">
                              <div className="font-semibold mb-1">Compliance breakdown</div>
                              {item.breakdown.map((c) => (
                                <div key={c.key} className="flex items-start gap-2">
                                  {c.pass ? (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                                  ) : (
                                    <AlertCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                                  )}
                                  <div>
                                    <div className="font-medium">{c.label} ({c.weight}pt)</div>
                                    {!c.pass && <div className="text-muted-foreground">{c.remediation}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {item.isStale && <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/10 text-amber-600 border-amber-500/30"><Clock className="w-2.5 h-2.5" />Stale</Badge>}
                          {item.isOrphaned && <Badge variant="outline" className="text-[10px] gap-1 bg-indigo-500/10 text-indigo-600 border-indigo-500/30"><UserX className="w-2.5 h-2.5" />Orphaned</Badge>}
                          {item.missingLabel && <Badge variant="outline" className="text-[10px] gap-1 bg-rose-500/10 text-rose-600 border-rose-500/30"><Tag className="w-2.5 h-2.5" />Unlabeled</Badge>}
                          {item.missingMetadata && <Badge variant="outline" className="text-[10px] gap-1 bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/30">Missing meta</Badge>}
                          {item.externallySharedUnclassified && <Badge variant="outline" className="text-[10px] gap-1 bg-red-500/10 text-red-600 border-red-500/30"><Share2 className="w-2.5 h-2.5" />Ext + unclassified</Badge>}
                          {item.compliant && (
                            <Badge variant="outline" className="text-[10px] gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                              <CheckCircle2 className="w-2.5 h-2.5" />Compliant
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-sm truncate max-w-[160px] ${item.isOrphaned ? "text-red-500 font-medium" : ""}`} title={item.ownerDisplayName ?? ""}>
                            {item.ownerDisplayName ?? "No owner"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{item.ownerCount} steward{item.ownerCount === 1 ? "" : "s"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground" data-testid={`text-activity-${item.id}`}>
                          {item.daysSinceActivity == null ? "—" : `${item.daysSinceActivity}d ago`}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5"
                          disabled={!item.ownerDisplayName || emailOwnerMutation.isPending}
                          onClick={() => emailOwnerMutation.mutate(item.id)}
                          data-testid={`button-email-owner-${item.id}`}
                        >
                          <Mail className="w-3 h-3" /> Email owner
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          {!isLoading && total > 0 && (
            <CardFooter className="bg-muted/10 border-t border-border/40 p-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} data-testid="button-prev-page">
                  Previous
                </Button>
                <span data-testid="text-page-indicator">Page {page} / {totalPages}</span>
                <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} data-testid="button-next-page">
                  Next
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>

        <div className="flex justify-end">
          <Button variant="link" size="sm" className="text-xs text-muted-foreground" asChild>
            <Link href="/app/admin/policies">Manage Lifecycle Policies →</Link>
          </Button>
        </div>
      </div>
    </TooltipProvider>
  );
}
