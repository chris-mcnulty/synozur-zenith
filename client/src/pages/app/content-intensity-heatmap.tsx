/**
 * Content Intensity Heat Map page
 *
 * Visualises the IA hierarchy (Hub → Workspace → Library) coloured by the
 * percentile rank of each signal within its cohort.  Cells expand lazily as
 * the user clicks a row to reveal children.
 */

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Flame,
  Loader2,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Info,
  Layers,
  ArrowUpRight,
} from "lucide-react";
import { UpgradeGate } from "@/components/upgrade-gate";
import { useTenant } from "@/lib/tenant-context";
import type {
  HeatmapSnapshot,
  HeatmapNode,
  SignalDescriptor,
  SignalKey,
} from "@shared/heatmap-types";

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/**
 * Maps a 0–100 percentile to a Tailwind-style CSS variable-backed colour.
 * null → neutral grey.
 */
function intensityBg(percentile: number | null): string {
  if (percentile === null) return "bg-muted/30 text-muted-foreground";
  if (percentile >= 90) return "bg-red-600/80 text-white";
  if (percentile >= 75) return "bg-orange-500/75 text-white";
  if (percentile >= 55) return "bg-amber-400/70 text-black";
  if (percentile >= 35) return "bg-yellow-300/60 text-black";
  if (percentile >= 15) return "bg-emerald-400/50 text-black";
  return "bg-emerald-600/30 text-emerald-900 dark:text-emerald-100";
}

function intensityLabel(percentile: number | null): string {
  if (percentile === null) return "No data";
  if (percentile >= 90) return "Critical";
  if (percentile >= 75) return "High";
  if (percentile >= 55) return "Medium-High";
  if (percentile >= 35) return "Medium";
  if (percentile >= 15) return "Low-Medium";
  return "Low";
}

// ---------------------------------------------------------------------------
// Signal cell display
// ---------------------------------------------------------------------------

function formatRaw(value: number | null, unit: SignalDescriptor["unit"]): string {
  if (value === null) return "—";
  switch (unit) {
    case "bytes": {
      if (value >= 1e9) return `${(value / 1e9).toFixed(1)} GB`;
      if (value >= 1e6) return `${(value / 1e6).toFixed(1)} MB`;
      if (value >= 1e3) return `${(value / 1e3).toFixed(1)} KB`;
      return `${value} B`;
    }
    case "days":
      return `${value}d`;
    case "percent":
      return `${value}%`;
    case "count":
      return value.toLocaleString();
    case "score":
      return String(value);
    default:
      return String(value);
  }
}

interface SignalCellProps {
  node: HeatmapNode;
  descriptor: SignalDescriptor;
}

function SignalCell({ node, descriptor }: SignalCellProps) {
  const cell = node.signals[descriptor.key];
  const rawDisplay = formatRaw(cell?.rawValue ?? null, descriptor.unit);
  const pct = cell?.percentile ?? null;
  const bg = intensityBg(pct);

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`w-14 h-10 flex flex-col items-center justify-center rounded text-[10px] font-mono cursor-default select-none ${bg}`}
          >
            <span className="leading-none">{rawDisplay}</span>
            {pct !== null && (
              <span className="leading-none opacity-70 text-[8px]">p{pct}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-semibold">{descriptor.label}</p>
          <p className="text-muted-foreground">{descriptor.description}</p>
          {pct !== null && (
            <p className="mt-1">
              Percentile <strong>{pct}</strong> — {intensityLabel(pct)} intensity
              {cell?.cohortSize ? ` (cohort: ${cell.cohortSize})` : ""}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Row component
// ---------------------------------------------------------------------------

const INDENT: Record<string, string> = {
  hub: "pl-0",
  workspace: "pl-6",
  library: "pl-12",
};

const LEVEL_BADGE: Record<string, string> = {
  hub: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  workspace: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  library: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
};

interface HeatmapRowProps {
  node: HeatmapNode;
  descriptors: SignalDescriptor[];
  expanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
}

function HeatmapRow({
  node,
  descriptors,
  expanded,
  hasChildren,
  onToggle,
}: HeatmapRowProps) {
  const indent = INDENT[node.level] ?? "";
  const levelBadge = LEVEL_BADGE[node.level] ?? "";
  const compositeBg = intensityBg(node.compositePercentile);
  const applicableDescriptors = descriptors.filter(d =>
    d.appliesTo.includes(node.level),
  );

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/30 rounded group">
      {/* Expand toggle + indentation */}
      <div className={`flex-shrink-0 flex items-center ${indent}`}>
        {hasChildren ? (
          <button
            onClick={onToggle}
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
          </button>
        ) : (
          <span className="w-5 h-5" />
        )}
      </div>

      {/* Level badge */}
      <Badge
        variant="outline"
        className={`text-[9px] px-1 py-0 flex-shrink-0 capitalize ${levelBadge}`}
      >
        {node.level}
      </Badge>

      {/* Display name — with drill-through link for workspace and library nodes */}
      <span className="flex-1 min-w-0 flex items-center gap-1">
        {node.level === "workspace" && node.workspaceId ? (
          <Link
            href={`/app/governance/workspaces/${node.workspaceId}`}
            className="truncate text-sm hover:text-primary hover:underline"
            title={node.displayName}
          >
            {node.displayName}
          </Link>
        ) : node.level === "library" ? (
          <Link
            href="/app/information-architecture"
            className="truncate text-sm hover:text-primary hover:underline"
            title={node.displayName}
          >
            {node.displayName}
          </Link>
        ) : (
          <span className="truncate text-sm" title={node.displayName}>
            {node.displayName}
          </span>
        )}
        {(node.level === "workspace" || node.level === "library") && (
          <ArrowUpRight className="w-3 h-3 flex-shrink-0 text-muted-foreground opacity-0 group-hover:opacity-60" />
        )}
      </span>

      {/* Composite */}
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={`w-16 h-10 flex flex-col items-center justify-center rounded text-[10px] font-semibold flex-shrink-0 ${compositeBg}`}
            >
              {node.compositeIntensity != null ? (
                <>
                  <span>{node.compositeIntensity}</span>
                  <span className="opacity-70 text-[8px]">
                    {intensityLabel(node.compositePercentile)}
                  </span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Composite intensity (mean of signal percentiles).
            {node.compositePercentile != null &&
              ` Ranked p${node.compositePercentile} in cohort.`}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Signal cells */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {applicableDescriptors.map(d => (
          <SignalCell key={d.key} node={node} descriptor={d} />
        ))}
        {/* Placeholder cells for signals not applicable at this level */}
        {descriptors
          .filter(d => !d.appliesTo.includes(node.level))
          .map(d => (
            <div key={d.key} className="w-14 h-10" />
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ContentIntensityHeatmapPage() {
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id ?? "";

  const {
    data: snapshot,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<HeatmapSnapshot>({
    queryKey: [
      "/api/content-intensity-heatmap",
      { tenantConnectionId },
    ],
    queryFn: async () => {
      const res = await fetch(
        `/api/content-intensity-heatmap?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to load heat map");
      }
      return res.json();
    },
    enabled: !!tenantConnectionId,
    staleTime: 1000 * 60 * 5,
  });

  // ── Expand/collapse state ────────────────────────────────────────────────
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Flatten visible nodes ────────────────────────────────────────────────
  const visibleNodes = useMemo(() => {
    if (!snapshot) return [];
    const result: HeatmapNode[] = [];

    function walk(id: string) {
      const node = snapshot.nodes[id];
      if (!node) return;
      result.push(node);
      if (expanded.has(id)) {
        for (const childId of node.childIds) {
          walk(childId);
        }
      }
    }

    for (const rootId of snapshot.roots) {
      walk(rootId);
    }
    return result;
  }, [snapshot, expanded]);

  const descriptors = snapshot?.signalDescriptors ?? [];

  // ── Signal column headers ────────────────────────────────────────────────
  return (
    <UpgradeGate feature="contentIntensityHeatmap">
      <div className="flex flex-col gap-6 p-6 min-h-full">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Flame className="w-6 h-6 text-orange-500" />
              Content Intensity Heat Map
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Visualise the relative intensity of each hub, workspace, and library
              based on volume, activity, and IA quality signals.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 flex-shrink-0"
          >
            {isFetching ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {/* Stats bar */}
        {snapshot && (
          <div className="flex flex-wrap gap-4">
            {(
              [
                ["Hubs", snapshot.counts.hubs],
                ["Workspaces", snapshot.counts.workspaces],
                ["Libraries", snapshot.counts.libraries],
              ] as [string, number][]
            ).map(([label, count]) => (
              <Card key={label} className="flex-1 min-w-[100px]">
                <CardContent className="pt-4 pb-3">
                  <p className="text-2xl font-bold">{count.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </CardContent>
              </Card>
            ))}
            {!snapshot.iaAssessmentIncluded && (
              <Card className="flex-1 min-w-[280px] border-amber-500/20 bg-amber-500/5">
                <CardContent className="pt-4 pb-3 flex items-center gap-2 text-amber-600 text-sm">
                  <Info className="w-4 h-4 flex-shrink-0" />
                  <span>
                    Run an{" "}
                    <Link href="/app/ia-assessment" className="underline underline-offset-2 hover:text-amber-700">
                      IA Assessment
                    </Link>{" "}
                    to populate workspace-level IA offender signals.
                  </span>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Heat map table */}
        <Card className="glass-panel overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="w-4 h-4" /> Hierarchy View
            </CardTitle>
            <CardDescription>
              Click a row to expand its children. Cells show raw values and
              their within-cohort percentile rank (p0 = coolest, p100 = hottest).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Building heat map…</span>
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Flame className="w-6 h-6 text-destructive" />
                <p className="text-sm">Failed to load heat map.</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            ) : !snapshot || snapshot.roots.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Flame className="w-6 h-6" />
                <p className="text-sm">
                  No inventory data found for this tenant. Sync sites first.
                </p>
              </div>
            ) : (
              <div className="min-w-max">
                {/* Column headers */}
                <div className="flex items-center gap-2 px-2 py-1 border-b bg-muted/20 text-[10px] text-muted-foreground uppercase tracking-wide">
                  {/* toggle + indent placeholder */}
                  <div className="w-5 flex-shrink-0" />
                  {/* level badge */}
                  <div className="w-16 flex-shrink-0">Level</div>
                  {/* name */}
                  <div className="flex-1 min-w-[160px]">Name</div>
                  {/* composite */}
                  <div className="w-16 text-center flex-shrink-0">Composite</div>
                  {/* signal columns */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {descriptors.map(d => (
                      <TooltipProvider key={d.key} delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="w-14 text-center truncate cursor-help">
                              {d.shortLabel}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="text-xs max-w-xs">
                            <p className="font-semibold">{d.label}</p>
                            <p className="text-muted-foreground">{d.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </div>

                {/* Data rows */}
                <div className="divide-y divide-border/30">
                  {visibleNodes.map(node => (
                    <HeatmapRow
                      key={node.id}
                      node={node}
                      descriptors={descriptors}
                      expanded={expanded.has(node.id)}
                      hasChildren={node.childIds.length > 0}
                      onToggle={() => toggle(node.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Intensity legend */}
        <Card className="glass-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Intensity Scale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[
                [90, "Critical"],
                [75, "High"],
                [55, "Medium-High"],
                [35, "Medium"],
                [15, "Low-Medium"],
                [5, "Low"],
              ].map(([pct, label]) => (
                <div
                  key={label}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${intensityBg(pct as number)}`}
                >
                  <span className="font-semibold">p&ge;{pct}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </UpgradeGate>
  );
}
