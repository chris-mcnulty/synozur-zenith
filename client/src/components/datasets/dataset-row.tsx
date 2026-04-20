/**
 * BL-039 — DatasetRow: single dataset status row with refresh button.
 *
 * Shared between the Pre-Report Refresh Gate and the Job Monitor admin page.
 * Status badge: 🟢 Fresh / 🟡 Warning / 🔴 Stale / ⚪ Never synced.
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { DatasetFreshness, FreshnessStatus } from "./dataset-types";

function freshnessBadge(status: FreshnessStatus) {
  switch (status) {
    case "fresh":
      return (
        <Badge
          className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
          data-testid={`badge-freshness-${status}`}
        >
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Fresh
        </Badge>
      );
    case "warning":
      return (
        <Badge
          className="bg-amber-500/10 text-amber-500 border-amber-500/20"
          data-testid={`badge-freshness-${status}`}
        >
          <Clock className="w-3 h-3 mr-1" />
          Warning
        </Badge>
      );
    case "stale":
      return (
        <Badge
          className="bg-red-500/10 text-red-500 border-red-500/20"
          data-testid={`badge-freshness-${status}`}
        >
          <AlertTriangle className="w-3 h-3 mr-1" />
          Stale
        </Badge>
      );
    case "never":
      return (
        <Badge
          className="bg-muted text-muted-foreground border-border"
          data-testid={`badge-freshness-${status}`}
        >
          <CircleDashed className="w-3 h-3 mr-1" />
          Never synced
        </Badge>
      );
  }
}

export interface DatasetRowProps {
  dataset: DatasetFreshness;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  refreshing?: boolean;
}

export function DatasetRow({
  dataset,
  onRefresh,
  refreshDisabled,
  refreshing,
}: DatasetRowProps) {
  const isRefreshing = refreshing || dataset.isRefreshing;
  return (
    <div
      className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-card/50"
      data-testid={`dataset-row-${dataset.key}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm">{dataset.label}</span>
          {freshnessBadge(dataset.status)}
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>
            Last refreshed:{" "}
            {dataset.lastRefreshedAt
              ? formatDistanceToNow(new Date(dataset.lastRefreshedAt), {
                  addSuffix: true,
                })
              : "never"}
          </div>
          {dataset.dependsOn.length > 0 && (
            <div className="opacity-70">
              Depends on: {dataset.dependsOn.join(", ")}
            </div>
          )}
        </div>
      </div>
      {onRefresh && (
        <Button
          variant="outline"
          size="sm"
          disabled={refreshDisabled || isRefreshing}
          onClick={onRefresh}
          data-testid={`button-refresh-${dataset.key}`}
        >
          {isRefreshing ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Refreshing
            </>
          ) : (
            <>
              <RefreshCw className="w-3 h-3 mr-1" />
              Refresh
            </>
          )}
        </Button>
      )}
    </div>
  );
}
