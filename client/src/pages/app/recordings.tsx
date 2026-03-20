import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import type { TeamsRecording, TeamsDiscoveryRun } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Video,
  FileText,
  Search,
  RefreshCw,
  Cloud,
  Users,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  HardDrive,
  MonitorPlay,
  Clock,
  Filter,
} from "lucide-react";

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StorageTypeBadge({ type }: { type: string }) {
  if (type === "SHAREPOINT_CHANNEL") {
    return (
      <Badge variant="outline" className="gap-1 text-blue-700 border-blue-300 bg-blue-50">
        <Users className="h-3 w-3" />
        Channel
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-purple-700 border-purple-300 bg-purple-50">
      <Cloud className="h-3 w-3" />
      OneDrive
    </Badge>
  );
}

function FileTypeBadge({ type }: { type: string }) {
  if (type === "RECORDING") {
    return (
      <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300 bg-emerald-50">
        <Video className="h-3 w-3" />
        Recording
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
      <FileText className="h-3 w-3" />
      Transcript
    </Badge>
  );
}

function CopilotBadge({ accessible, blockers }: { accessible: boolean | null | undefined; blockers: string[] | null | undefined }) {
  if (accessible === null || accessible === undefined) {
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <AlertCircle className="h-3 w-3" />
        Unknown
      </Badge>
    );
  }
  if (accessible) {
    return (
      <Badge variant="outline" className="gap-1 text-green-700 border-green-300 bg-green-50">
        <CheckCircle2 className="h-3 w-3" />
        Accessible
      </Badge>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant="outline" className="gap-1 text-red-700 border-red-300 bg-red-50">
          <XCircle className="h-3 w-3" />
          Blocked
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <ul className="text-xs space-y-1 max-w-64">
          {(blockers ?? []).map((b, i) => <li key={i}>• {b}</li>)}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
    RUNNING: { label: "Running", className: "text-blue-700 border-blue-300 bg-blue-50", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    COMPLETED: { label: "Completed", className: "text-green-700 border-green-300 bg-green-50", icon: <CheckCircle2 className="h-3 w-3" /> },
    PARTIAL: { label: "Partial", className: "text-amber-700 border-amber-300 bg-amber-50", icon: <AlertCircle className="h-3 w-3" /> },
    FAILED: { label: "Failed", className: "text-red-700 border-red-300 bg-red-50", icon: <XCircle className="h-3 w-3" /> },
  };
  const cfg = map[status] ?? map.FAILED;
  return (
    <Badge variant="outline" className={`gap-1 ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}

type QuickFilter = "all" | "recordings" | "transcripts" | "channel" | "onedrive" | "no-label" | "copilot-blocked";

export default function RecordingsPage() {
  const { selectedTenant } = useTenant();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [selected, setSelected] = useState<TeamsRecording | null>(null);

  const tenantConnectionId = selectedTenant?.id;
  const [page, setPage] = useState(1);
  const pageSize = 50;

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [tenantConnectionId, search]);

  const { data: paginatedData, isLoading } = useQuery<{
    rows: TeamsRecording[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }>({
    queryKey: ["/api/recordings", tenantConnectionId, search, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      if (search) params.set("search", search);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/recordings?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load recordings");
      return res.json();
    },
    enabled: true,
  });

  const recordings = paginatedData?.rows ?? [];
  const totalResults = paginatedData?.total ?? 0;
  const totalPages = paginatedData?.totalPages ?? 1;

  const { data: latestRun } = useQuery<TeamsDiscoveryRun | null>({
    queryKey: ["/api/recordings/latest-run", tenantConnectionId],
    queryFn: async () => {
      if (!tenantConnectionId) return null;
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/recordings/latest-run`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenantConnectionId,
    refetchInterval: (data) => (data?.status === "RUNNING" ? 3000 : false),
  });

  // Invalidate the recordings list whenever a discovery run transitions from
  // RUNNING to a terminal state so the table reflects newly-discovered files.
  const prevRunStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const currentStatus = latestRun?.status;
    const prevStatus = prevRunStatusRef.current;
    if (
      prevStatus === "RUNNING" &&
      currentStatus !== undefined &&
      currentStatus !== "RUNNING"
    ) {
      queryClient.invalidateQueries({ queryKey: ["/api/recordings"] });
      setPage(1);
    }
    prevRunStatusRef.current = currentStatus;
  }, [latestRun?.status]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!tenantConnectionId) throw new Error("No tenant selected");
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/recordings/sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to start discovery");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Discovery started", description: "Scanning Teams channels and OneDrive folders..." });
      queryClient.invalidateQueries({ queryKey: ["/api/recordings/latest-run", tenantConnectionId] });
    },
    onError: (err: any) => {
      toast({ title: "Discovery failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = recordings.filter((r) => {
    if (quickFilter === "recordings") return r.fileType === "RECORDING";
    if (quickFilter === "transcripts") return r.fileType === "TRANSCRIPT";
    if (quickFilter === "channel") return r.storageType === "SHAREPOINT_CHANNEL";
    if (quickFilter === "onedrive") return r.storageType === "ONEDRIVE";
    if (quickFilter === "no-label") return !r.sensitivityLabelName;
    if (quickFilter === "copilot-blocked") return r.copilotAccessible === false;
    return true;
  });

  const totalRecordings = recordings.filter(r => r.fileType === "RECORDING").length;
  const totalTranscripts = recordings.filter(r => r.fileType === "TRANSCRIPT").length;
  const channelCount = recordings.filter(r => r.storageType === "SHAREPOINT_CHANNEL").length;
  const onedriveCount = recordings.filter(r => r.storageType === "ONEDRIVE").length;
  const labelledCount = recordings.filter(r => r.sensitivityLabelName).length;
  const blockedCount = recordings.filter(r => r.copilotAccessible === false).length;

  const isRunning = latestRun?.status === "RUNNING" || syncMutation.isPending;

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recordings Discovery</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Teams meeting recordings and transcripts across channels and OneDrive
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={isRunning || !tenantConnectionId}
        >
          {isRunning ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scanning…</>
          ) : (
            <><RefreshCw className="mr-2 h-4 w-4" />Run Discovery</>
          )}
        </Button>
      </div>

      {/* Last run banner */}
      {latestRun && (
        <div className="flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm bg-muted/40">
          <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">Last run:</span>
          <RunStatusBadge status={latestRun.status} />
          <span className="text-muted-foreground">{formatDate(latestRun.startedAt?.toString())}</span>
          {latestRun.status !== "RUNNING" && (
            <span className="text-muted-foreground ml-auto text-xs">
              {latestRun.recordingsFound ?? 0} recordings · {latestRun.transcriptsFound ?? 0} transcripts ·{" "}
              {latestRun.teamsScanned ?? 0} teams · {latestRun.onedrivesScanned ?? 0} OneDrives scanned
            </span>
          )}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Recordings", value: totalRecordings, icon: <MonitorPlay className="h-4 w-4 text-emerald-600" /> },
          { label: "Transcripts", value: totalTranscripts, icon: <FileText className="h-4 w-4 text-amber-600" /> },
          { label: "In Channels", value: channelCount, icon: <Users className="h-4 w-4 text-blue-600" /> },
          { label: "In OneDrive", value: onedriveCount, icon: <Cloud className="h-4 w-4 text-purple-600" /> },
          { label: "Labelled", value: labelledCount, icon: <ShieldCheck className="h-4 w-4 text-green-600" /> },
          { label: "Copilot Blocked", value: blockedCount, icon: <ShieldAlert className="h-4 w-4 text-red-600" /> },
        ].map(({ label, value, icon }) => (
          <Card key={label} className="py-3">
            <CardContent className="p-4 flex flex-col gap-1">
              <div className="flex items-center gap-2 text-muted-foreground text-xs">
                {icon}
                {label}
              </div>
              <span className="text-2xl font-bold">{value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by filename, team, or user…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["all", "recordings", "transcripts", "channel", "onedrive", "no-label", "copilot-blocked"] as QuickFilter[]).map(f => (
            <Button
              key={f}
              variant={quickFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setQuickFilter(f)}
            >
              {f === "all" ? "All" :
               f === "recordings" ? "Recordings" :
               f === "transcripts" ? "Transcripts" :
               f === "channel" ? "Channel" :
               f === "onedrive" ? "OneDrive" :
               f === "no-label" ? "No Label" :
               "Copilot Blocked"}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading recordings…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <Video className="h-10 w-10 opacity-30" />
              <p className="text-sm">
                {recordings.length === 0
                  ? "No recordings discovered yet. Run a discovery scan to begin."
                  : "No recordings match the current filter."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Storage</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Organizer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Sensitivity</TableHead>
                  <TableHead>Copilot</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="font-medium max-w-64 truncate" title={r.fileName}>
                      {r.fileName}
                    </TableCell>
                    <TableCell><FileTypeBadge type={r.fileType} /></TableCell>
                    <TableCell><StorageTypeBadge type={r.storageType} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-48 truncate">
                      {r.storageType === "SHAREPOINT_CHANNEL"
                        ? r.teamDisplayName && r.channelDisplayName
                          ? `${r.teamDisplayName} › ${r.channelDisplayName}`
                          : r.teamDisplayName ?? "—"
                        : r.userPrincipalName ?? r.userDisplayName ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.organizerDisplayName ?? r.organizer ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(r.fileCreatedAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatBytes(r.fileSizeBytes)}
                    </TableCell>
                    <TableCell>
                      {r.sensitivityLabelName ? (
                        <Badge variant="outline" className="text-xs">
                          {r.sensitivityLabelName}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <CopilotBadge accessible={r.copilotAccessible} blockers={r.accessibilityBlockers} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t text-sm text-muted-foreground">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalResults)} of {totalResults}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Detail panel */}
      <Sheet open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <SheetContent className="w-[480px] sm:max-w-[480px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="pb-4">
                <SheetTitle className="flex items-center gap-2 text-base leading-tight pr-6">
                  {selected.fileType === "RECORDING"
                    ? <MonitorPlay className="h-5 w-5 text-emerald-600 shrink-0" />
                    : <FileText className="h-5 w-5 text-amber-600 shrink-0" />}
                  {selected.fileName}
                </SheetTitle>
                <SheetDescription>
                  <div className="flex gap-2 flex-wrap mt-1">
                    <FileTypeBadge type={selected.fileType} />
                    <StorageTypeBadge type={selected.storageType} />
                    <CopilotBadge accessible={selected.copilotAccessible} blockers={selected.accessibilityBlockers} />
                  </div>
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-5">
                {/* File details */}
                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">File Details</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{formatDate(selected.fileCreatedAt)}</dd>
                    <dt className="text-muted-foreground">Modified</dt>
                    <dd>{formatDate(selected.fileModifiedAt)}</dd>
                    <dt className="text-muted-foreground">Size</dt>
                    <dd>{formatBytes(selected.fileSizeBytes)}</dd>
                    <dt className="text-muted-foreground">Shared</dt>
                    <dd>{selected.isShared ? "Yes" : "No"}</dd>
                  </dl>
                  {selected.fileUrl && (
                    <a
                      href={selected.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      Open in Microsoft 365 <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </section>

                {/* Location */}
                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Storage Location</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    {selected.storageType === "SHAREPOINT_CHANNEL" ? (
                      <>
                        <dt className="text-muted-foreground">Team</dt>
                        <dd>{selected.teamDisplayName ?? "—"}</dd>
                        <dt className="text-muted-foreground">Channel</dt>
                        <dd>{selected.channelDisplayName ?? "—"}</dd>
                        <dt className="text-muted-foreground">Channel type</dt>
                        <dd className="capitalize">{selected.channelType ?? "standard"}</dd>
                      </>
                    ) : (
                      <>
                        <dt className="text-muted-foreground">User</dt>
                        <dd>{selected.userDisplayName ?? "—"}</dd>
                        <dt className="text-muted-foreground">UPN</dt>
                        <dd className="break-all">{selected.userPrincipalName ?? "—"}</dd>
                      </>
                    )}
                    {selected.filePath && (
                      <>
                        <dt className="text-muted-foreground col-span-2 mt-1">Path</dt>
                        <dd className="col-span-2 text-xs text-muted-foreground break-all">{selected.filePath}</dd>
                      </>
                    )}
                  </dl>
                </section>

                {/* Organizer */}
                {(selected.organizer || selected.organizerDisplayName) && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Meeting Organizer</h3>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <dt className="text-muted-foreground">Name</dt>
                      <dd>{selected.organizerDisplayName ?? "—"}</dd>
                      <dt className="text-muted-foreground">UPN</dt>
                      <dd className="break-all">{selected.organizer ?? "—"}</dd>
                    </dl>
                  </section>
                )}

                {/* Governance */}
                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Governance</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Sensitivity label</dt>
                    <dd>
                      {selected.sensitivityLabelName
                        ? <Badge variant="outline" className="text-xs">{selected.sensitivityLabelName}</Badge>
                        : <span className="text-muted-foreground">None</span>}
                    </dd>
                    <dt className="text-muted-foreground">Retention label</dt>
                    <dd>{selected.retentionLabelName ?? <span className="text-muted-foreground">None</span>}</dd>
                  </dl>
                </section>

                {/* Copilot accessibility */}
                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Copilot / AI Accessibility</h3>
                  {selected.accessibilityBlockers && selected.accessibilityBlockers.length > 0 ? (
                    <ul className="space-y-1">
                      {selected.accessibilityBlockers.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-amber-700">
                          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                          {b}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No accessibility blockers detected.</p>
                  )}
                </section>

                {/* Discovery metadata */}
                <section>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Discovery</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted-foreground">Last seen</dt>
                    <dd>{formatDate(selected.lastDiscoveredAt?.toString())}</dd>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="capitalize">{selected.discoveryStatus?.toLowerCase() ?? "active"}</dd>
                  </dl>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
