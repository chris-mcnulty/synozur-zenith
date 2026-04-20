/**
 * BL-039 — DatasetGate: Pre-Report Refresh Gate.
 *
 * Wraps a "Run Report" or "Run Assessment" action so the user is forced to
 * confront dataset staleness before launching an expensive job.
 *
 * Render-prop API:
 *
 *   <DatasetGate
 *     tenantConnectionId={tenantId}
 *     requiredDatasets={["userInventory"]}
 *     blockOnStale
 *   >
 *     {({ allFresh, refreshing, refreshDataset, datasets }) => (
 *       <Button disabled={!allFresh || refreshing} onClick={launchReport}>
 *         Run Report
 *       </Button>
 *     )}
 *   </DatasetGate>
 *
 * Pass `blockOnStale={false}` to render but not block; the consumer decides
 * what to do with `allFresh`.
 */
import { useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Database, AlertTriangle, Info } from "lucide-react";
import { DatasetRow } from "./dataset-row";
import type { DatasetFreshness } from "./dataset-types";

export interface DatasetGateRenderArgs {
  /** Datasets fetched from the server, only those listed in `requiredDatasets`. */
  datasets: DatasetFreshness[];
  /** True when every required dataset is "fresh". */
  allFresh: boolean;
  /** True while a refresh mutation is in flight or the registry shows isRefreshing. */
  refreshing: boolean;
  /** True before the first successful fetch. */
  loading: boolean;
  /** Refresh a specific dataset. */
  refreshDataset: (datasetKey: string) => void;
  /** Refresh every required dataset that is not currently fresh. */
  refreshAllStale: () => void;
}

export interface DatasetGateProps {
  tenantConnectionId: string;
  requiredDatasets: string[];
  /**
   * When true (default), the gate's outer card auto-renders a header +
   * dataset rows above the children. When false, the gate is "headless" —
   * children render alone using the render-prop args.
   */
  showCard?: boolean;
  /** Optional title override. */
  title?: string;
  /** Optional description override. */
  description?: string;
  children: (args: DatasetGateRenderArgs) => React.ReactNode;
}

export function DatasetGate({
  tenantConnectionId,
  requiredDatasets,
  showCard = true,
  title = "Data readiness",
  description = "These datasets must be fresh before launching this report.",
  children,
}: DatasetGateProps) {
  const { toast } = useToast();

  const queryKey = useMemo(
    () => ["/api/datasets/freshness", tenantConnectionId, "gate"] as const,
    [tenantConnectionId],
  );

  const { data, isFetching, isLoading } = useQuery<{ datasets: DatasetFreshness[] }>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(
        `/api/datasets/freshness?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 10_000,
    enabled: !!tenantConnectionId,
  });

  // Only datasets the consumer cares about, preserving the order they were declared in.
  const relevant = useMemo(() => {
    const all = data?.datasets ?? [];
    const byKey = new Map(all.map((d) => [d.key, d]));
    return requiredDatasets
      .map((k) => byKey.get(k))
      .filter((d): d is DatasetFreshness => !!d);
  }, [data, requiredDatasets]);

  const allFresh = relevant.length > 0 && relevant.every((d) => d.status === "fresh");
  const anyRefreshing = relevant.some((d) => d.isRefreshing);

  const refreshMutation = useMutation({
    mutationFn: async (datasetKey: string) => {
      const res = await apiRequest(
        "POST",
        `/api/datasets/${encodeURIComponent(datasetKey)}/refresh`,
        { tenantConnectionId },
      );
      return res.json();
    },
    onSuccess: (body, datasetKey) => {
      const def = relevant.find((d) => d.key === datasetKey);
      const label = def?.label ?? datasetKey;
      if (body?.alreadyRunning) {
        toast({
          title: `${label} refresh already running`,
          description: "Hang tight — the existing run will populate the dataset.",
        });
      } else {
        toast({
          title: `${label} refresh started`,
          description: "Status will update as the job progresses.",
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["/api/datasets/freshness"] });
    },
    onError: (err: any, datasetKey) => {
      const def = relevant.find((d) => d.key === datasetKey);
      const label = def?.label ?? datasetKey;
      toast({
        variant: "destructive",
        title: `${label} refresh failed`,
        description: err?.message ?? String(err),
      });
    },
  });

  const refreshDataset = useCallback(
    (datasetKey: string) => {
      refreshMutation.mutate(datasetKey);
    },
    [refreshMutation],
  );

  const refreshAllStale = useCallback(() => {
    relevant.forEach((d) => {
      if (d.status !== "fresh") refreshMutation.mutate(d.key);
    });
  }, [relevant, refreshMutation]);

  const renderArgs: DatasetGateRenderArgs = {
    datasets: relevant,
    allFresh,
    refreshing: refreshMutation.isPending || anyRefreshing || isFetching,
    loading: isLoading,
    refreshDataset,
    refreshAllStale,
  };

  if (!showCard) {
    return <>{children(renderArgs)}</>;
  }

  const hasStale = relevant.some((d) => d.status === "stale" || d.status === "never");
  const hasWarning = relevant.some((d) => d.status === "warning");

  return (
    <Card className="glass-panel" data-testid="card-dataset-gate">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Database className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Checking dataset freshness…</div>
        ) : relevant.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No required datasets configured.
          </div>
        ) : (
          <>
            {hasStale && (
              <div
                className="flex items-start gap-2 p-3 rounded-md bg-red-500/10 text-red-500 text-xs"
                data-testid="alert-stale"
              >
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  One or more required datasets are stale or have never been synced. Refresh
                  before running this report — results may otherwise miss recent activity.
                </div>
              </div>
            )}
            {!hasStale && hasWarning && (
              <div
                className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 text-amber-500 text-xs"
                data-testid="alert-warning"
              >
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  Some datasets are getting stale. Consider refreshing for the most accurate
                  results.
                </div>
              </div>
            )}
            <div className="space-y-2">
              {relevant.map((d) => (
                <DatasetRow
                  key={d.key}
                  dataset={d}
                  onRefresh={() => refreshDataset(d.key)}
                  refreshing={refreshMutation.isPending && refreshMutation.variables === d.key}
                />
              ))}
            </div>
          </>
        )}
        <div className="pt-2">{children(renderArgs)}</div>
      </CardContent>
    </Card>
  );
}
