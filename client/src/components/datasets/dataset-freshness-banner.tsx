/**
 * BL-039 — DatasetFreshnessBanner: lightweight inline banner.
 *
 * Sits at the top of pages like Dashboard / Lifecycle, indicating when one
 * or more datasets they depend on are getting stale. Less aggressive than
 * DatasetGate — does not block actions, just nudges.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import type { DatasetFreshness } from "./dataset-types";

export interface DatasetFreshnessBannerProps {
  tenantConnectionId: string;
  /** Dataset keys to monitor. */
  datasets: string[];
  /** Optional href for the "View" link (defaults to Job Monitor). */
  manageHref?: string;
}

export function DatasetFreshnessBanner({
  tenantConnectionId,
  datasets,
  manageHref = "/app/admin/job-monitor",
}: DatasetFreshnessBannerProps) {
  const { data } = useQuery<{ datasets: DatasetFreshness[] }>({
    queryKey: ["/api/datasets/freshness", tenantConnectionId, "banner"],
    queryFn: async () => {
      const res = await fetch(
        `/api/datasets/freshness?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
    enabled: !!tenantConnectionId,
  });

  const relevant = useMemo(() => {
    const all = data?.datasets ?? [];
    const byKey = new Map(all.map((d) => [d.key, d]));
    return datasets
      .map((k) => byKey.get(k))
      .filter((d): d is DatasetFreshness => !!d);
  }, [data, datasets]);

  const stale = relevant.filter((d) => d.status === "stale" || d.status === "never");
  const warning = relevant.filter((d) => d.status === "warning");

  if (stale.length === 0 && warning.length === 0) return null;

  const isStale = stale.length > 0;
  const tone = isStale
    ? "bg-red-500/10 text-red-500 border-red-500/20"
    : "bg-amber-500/10 text-amber-500 border-amber-500/20";

  const subjects = (isStale ? stale : warning).map((d) => d.label).join(", ");

  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs flex items-center gap-2 ${tone}`}
      data-testid="dataset-freshness-banner"
    >
      {isStale ? (
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      ) : (
        <Info className="w-4 h-4 flex-shrink-0" />
      )}
      <div className="flex-1">
        {isStale ? (
          <>
            <span className="font-medium">Stale data: </span>
            {subjects}. Numbers below may be out of date.
          </>
        ) : (
          <>
            <span className="font-medium">Aging data: </span>
            {subjects}.
          </>
        )}
      </div>
      <Link
        href={manageHref}
        className="underline whitespace-nowrap"
        data-testid="link-banner-manage"
      >
        Manage
      </Link>
    </div>
  );
}
