import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { SavedViewsBar } from "@/components/saved-views-bar";
import { useSavedViewController, type ViewState } from "@/lib/saved-views";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Fingerprint, 
  ShieldCheck, 
  Database, 
  Archive, 
  RefreshCcw,
  Lock,
  Tag,
  Globe,
  Info,
  AlertCircle,
  Loader2,
  Download,
  BarChart3,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/lib/tenant-context";
import { queryClient } from "@/lib/queryClient";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SensitivityLabel = {
  id: string;
  tenantId: string;
  labelId: string;
  name: string;
  description: string | null;
  color: string | null;
  tooltip: string | null;
  sensitivity: number | null;
  isActive: boolean;
  contentFormats: string[] | null;
  hasProtection: boolean;
  parentLabelId: string | null;
  appliesToGroupsSites: boolean;
  syncedAt: string | null;
};

type RetentionLabel = {
  id: string;
  tenantId: string;
  labelId: string;
  name: string;
  description: string | null;
  retentionDuration: string | null;
  retentionAction: string | null;
  behaviorDuringRetentionPeriod: string | null;
  actionAfterRetentionPeriod: string | null;
  isActive: boolean;
  isRecordLabel: boolean;
  syncedAt: string | null;
};

type LabelCoverageWorkspace = {
  workspaceId: string;
  displayName: string;
  siteUrl: string | null;
  sensitivityLabelId: string | null;
  retentionLabelId: string | null;
  type: string;
  sensitivityLabelName: string | null;
  retentionLabelName: string | null;
};

type LabelCoverageStats = {
  totalSites: number;
  withSensitivityLabel: number;
  withRetentionLabel: number;
  unlabeled: number;
  sensitivityCoveragePercent: number;
  retentionCoveragePercent: number;
};

type LabelCoverageResponse = {
  workspaces: LabelCoverageWorkspace[];
  stats: LabelCoverageStats;
};

export default function PurviewConfigPage() {
  const { toast } = useToast();
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id;
  const [isSyncingSensitivity, setIsSyncingSensitivity] = useState(false);
  const [isSyncingRetention, setIsSyncingRetention] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [retentionSyncError, setRetentionSyncError] = useState<string | null>(null);
  const [coverageSearch, setCoverageSearch] = useState("");
  const [coverageFilter, setCoverageFilter] = useState<"all" | "labeled" | "unlabeled">("all");
  const [resyncBannerDismissed, setResyncBannerDismissed] = useState(false);

  const buildViewState = useCallback<() => ViewState>(() => ({
    filterJson: { coverageSearch, coverageFilter },
    sortJson: {},
    columnsJson: {},
  }), [coverageSearch, coverageFilter]);

  const applyViewState = useCallback((state: ViewState) => {
    const f = state.filterJson as { coverageSearch?: string; coverageFilter?: "all" | "labeled" | "unlabeled" };
    if (typeof f.coverageSearch === "string") setCoverageSearch(f.coverageSearch);
    if (f.coverageFilter === "all" || f.coverageFilter === "labeled" || f.coverageFilter === "unlabeled") {
      setCoverageFilter(f.coverageFilter);
    }
  }, []);

  const viewState = useMemo<ViewState>(() => buildViewState(), [buildViewState]);

  const { activeViewId, applyView, clearActiveView, syncStateToUrl } = useSavedViewController({
    page: "purview",
    buildState: buildViewState,
    applyState: applyViewState,
  });

  useEffect(() => { syncStateToUrl(); }, [viewState, syncStateToUrl]);

  useEffect(() => {
    setResyncBannerDismissed(false);
  }, [tenantConnectionId]);

  const { data: labels = [], isLoading, refetch, isRefetching } = useQuery<SensitivityLabel[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "sensitivity-labels"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/sensitivity-labels`).then(r => r.json()),
    enabled: !!tenantConnectionId,
  });

  const { data: retentionLabelsData = [], isLoading: isLoadingRetention } = useQuery<RetentionLabel[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "retention-labels"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/retention-labels`).then(r => r.json()),
    enabled: !!tenantConnectionId,
  });

  const { data: coverageData, isLoading: isLoadingCoverage } = useQuery<LabelCoverageResponse>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "label-coverage"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/label-coverage`).then(r => r.json()),
    enabled: !!tenantConnectionId,
  });

  const siteLabels = labels.filter(l => l.appliesToGroupsSites);
  const fileLabels = labels.filter(l => !l.appliesToGroupsSites);
  const lastSynced = labels.length > 0 ? labels.reduce((latest, l) => {
    if (!l.syncedAt) return latest;
    return !latest || new Date(l.syncedAt) > new Date(latest) ? l.syncedAt : latest;
  }, null as string | null) : null;

  const SCOPE_FIX_DATE = new Date("2026-04-20T00:00:00Z");
  const needsSensitivityResync =
    labels.length > 0 &&
    (!lastSynced || new Date(lastSynced) < SCOPE_FIX_DATE);

  const retentionLastSynced = retentionLabelsData.length > 0 ? retentionLabelsData.reduce((latest, l) => {
    if (!l.syncedAt) return latest;
    return !latest || new Date(l.syncedAt) > new Date(latest) ? l.syncedAt : latest;
  }, null as string | null) : null;

  const handleSyncSensitivityLabels = async () => {
    if (!tenantConnectionId) return;
    setIsSyncingSensitivity(true);
    setResyncBannerDismissed(true);
    setSyncError(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/sensitivity-labels/sync`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncError(data.error);
        toast({ title: "Label sync completed with errors", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Sensitivity labels synced", description: `${data.synced} labels synced from Microsoft Purview.` });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantConnectionId, "sensitivity-labels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantConnectionId, "label-coverage"] });
    } catch (err: any) {
      setSyncError(err.message);
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSyncingSensitivity(false);
    }
  };

  const handleSyncRetentionLabels = async () => {
    if (!tenantConnectionId) return;
    setIsSyncingRetention(true);
    setRetentionSyncError(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/retention-labels/sync`, { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setRetentionSyncError(data.error);
        toast({ title: "Retention sync completed with errors", description: data.error, variant: "destructive" });
      } else {
        toast({ title: "Retention labels synced", description: `${data.synced} retention labels synced from Microsoft Purview.` });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantConnectionId, "retention-labels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantConnectionId, "label-coverage"] });
    } catch (err: any) {
      setRetentionSyncError(err.message);
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    } finally {
      setIsSyncingRetention(false);
    }
  };

  const filteredCoverageWorkspaces = (coverageData?.workspaces || []).filter(w => {
    const matchesSearch = !coverageSearch || 
      w.displayName.toLowerCase().includes(coverageSearch.toLowerCase()) ||
      (w.siteUrl && w.siteUrl.toLowerCase().includes(coverageSearch.toLowerCase()));
    
    if (!matchesSearch) return false;
    if (coverageFilter === "labeled") return w.sensitivityLabelId || w.retentionLabelId;
    if (coverageFilter === "unlabeled") return !w.sensitivityLabelId && !w.retentionLabelId;
    return true;
  });

  const renderLabelRow = (label: SensitivityLabel) => (
    <TableRow key={label.labelId} data-testid={`row-label-${label.labelId}`}>
      <TableCell>
        <div className="flex items-center gap-2">
          {label.color && (
            <span className="w-3 h-3 rounded-full border border-border/50 shrink-0" style={{ backgroundColor: label.color }} />
          )}
          <div>
            <div className="font-medium text-sm">{label.name}</div>
            {label.description && (
              <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">{label.description}</div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {label.appliesToGroupsSites && (
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
              <Globe className="w-2.5 h-2.5 mr-1" />Sites
            </Badge>
          )}
          {label.contentFormats && label.contentFormats.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[10px] bg-muted/50">
                  <Tag className="w-2.5 h-2.5 mr-1" />Files
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Formats: {label.contentFormats.join(", ")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell>
        {label.hasProtection ? (
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            <Lock className="w-2.5 h-2.5 mr-1" />Protected
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        )}
      </TableCell>
      <TableCell>
        {label.sensitivity != null ? (
          <span className="text-xs font-mono">{label.sensitivity}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {label.isActive ? (
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Active</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
        )}
      </TableCell>
    </TableRow>
  );

  const stats = coverageData?.stats;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-purview-title">Purview Integration</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Sensitivity and retention label inventory, coverage tracking, and governance alignment with Microsoft Purview.
          </p>
        </div>
      </div>

      <SavedViewsBar
        page="purview"
        currentState={viewState}
        activeViewId={activeViewId}
        onApplyView={applyView}
        onClearView={clearActiveView}
      />

      {(syncError || retentionSyncError) && (
        <Card className="border-red-500/20 bg-red-500/5" data-testid="card-sync-error">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm text-red-600">Label Sync Error</h4>
              <p className="text-xs text-red-500 mt-1">{syncError || retentionSyncError}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Common causes: missing permissions on the Entra app registration
                ({syncError ? <code className="bg-muted px-1 rounded">InformationProtectionPolicy.Read.All</code> : <code className="bg-muted px-1 rounded">RecordsManagement.Read.All</code>}),
                or the tenant lacks the required M365 licensing.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!tenantConnectionId && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-6 text-center">
            <Info className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <p className="text-sm text-amber-600">Select a tenant connection to view its Purview label inventory.</p>
          </CardContent>
        </Card>
      )}

      {tenantConnectionId && (
        <Tabs defaultValue="coverage" className="w-full space-y-6">
          <TabsList className="bg-transparent h-12 gap-6 w-full justify-start border-b border-border/50 p-0 rounded-none mb-2">
            <TabsTrigger 
              value="coverage" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
              data-testid="tab-label-coverage"
            >
              <BarChart3 className="w-4 h-4 mr-2" /> Label Coverage
            </TabsTrigger>
            <TabsTrigger 
              value="siteLabels" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
              data-testid="tab-site-labels"
            >
              <Globe className="w-4 h-4 mr-2" /> Site Labels
              <Badge variant="secondary" className="ml-2 text-[10px]">{siteLabels.length}</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="retentionLabels" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
              data-testid="tab-retention-labels"
            >
              <Clock className="w-4 h-4 mr-2" /> Retention Labels
              <Badge variant="secondary" className="ml-2 text-[10px]">{retentionLabelsData.length}</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="allLabels" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
              data-testid="tab-all-labels"
            >
              <ShieldCheck className="w-4 h-4 mr-2" /> All Labels
              <Badge variant="secondary" className="ml-2 text-[10px]">{labels.length}</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="orchestration" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
              data-testid="tab-orchestration"
            >
              <Fingerprint className="w-4 h-4 mr-2" /> Orchestration
            </TabsTrigger>
          </TabsList>

          {/* ── Label Coverage Tab ── */}
          <TabsContent value="coverage" className="space-y-6 m-0 animate-in fade-in slide-in-from-bottom-4">
            {isLoadingCoverage ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading coverage data...</div>
            ) : stats ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="glass-panel border-border/50">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold" data-testid="text-total-sites">{stats.totalSites}</div>
                      <div className="text-xs text-muted-foreground mt-1">Total Sites</div>
                    </CardContent>
                  </Card>
                  <Card className="glass-panel border-border/50">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-blue-600" data-testid="text-sensitivity-coverage">{stats.sensitivityCoveragePercent}%</div>
                      <div className="text-xs text-muted-foreground mt-1">Sensitivity Coverage</div>
                      <div className="text-[10px] text-muted-foreground">{stats.withSensitivityLabel} of {stats.totalSites} sites</div>
                    </CardContent>
                  </Card>
                  <Card className="glass-panel border-border/50">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-purple-600" data-testid="text-retention-coverage">{stats.retentionCoveragePercent}%</div>
                      <div className="text-xs text-muted-foreground mt-1">Retention Coverage</div>
                      <div className="text-[10px] text-muted-foreground">{stats.withRetentionLabel} of {stats.totalSites} sites</div>
                    </CardContent>
                  </Card>
                  <Card className={`glass-panel border-border/50 ${stats.unlabeled > 0 ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
                    <CardContent className="p-4 text-center">
                      <div className={`text-2xl font-bold ${stats.unlabeled > 0 ? "text-amber-600" : "text-emerald-600"}`} data-testid="text-unlabeled-count">{stats.unlabeled}</div>
                      <div className="text-xs text-muted-foreground mt-1">Unlabeled Sites</div>
                      <div className="text-[10px] text-muted-foreground">No sensitivity or retention label</div>
                    </CardContent>
                  </Card>
                </div>

                <Card className="glass-panel border-border/50 shadow-xl">
                  <CardHeader className="pb-4 border-b border-border/40">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Workspace Label Mapping</CardTitle>
                        <CardDescription>
                          Shows which sensitivity and retention labels are applied to each site in your inventory.
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-3">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search sites..."
                          value={coverageSearch}
                          onChange={(e) => setCoverageSearch(e.target.value)}
                          className="pl-9 h-9"
                          data-testid="input-coverage-search"
                        />
                      </div>
                      <div className="flex gap-1.5">
                        {(["all", "labeled", "unlabeled"] as const).map(f => (
                          <Button
                            key={f}
                            variant={coverageFilter === f ? "default" : "outline"}
                            size="sm"
                            onClick={() => setCoverageFilter(f)}
                            className="text-xs h-9"
                            data-testid={`button-filter-${f}`}
                          >
                            {f === "all" ? "All" : f === "labeled" ? "Labeled" : "Unlabeled"}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {filteredCoverageWorkspaces.length === 0 ? (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        {coverageSearch ? "No sites match your search." : "No sites found for this tenant. Run a site sync first."}
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Site</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Sensitivity Label</TableHead>
                            <TableHead>Retention Label</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredCoverageWorkspaces.slice(0, 100).map(w => (
                            <TableRow key={w.workspaceId} data-testid={`row-coverage-${w.workspaceId}`}>
                              <TableCell>
                                <div>
                                  <div className="font-medium text-sm">{w.displayName}</div>
                                  {w.siteUrl && (
                                    <div className="text-[11px] text-muted-foreground truncate max-w-xs">{w.siteUrl}</div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-[10px]">{w.type}</Badge>
                              </TableCell>
                              <TableCell>
                                {w.sensitivityLabelName ? (
                                  <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
                                    <ShieldCheck className="w-2.5 h-2.5 mr-1" />{w.sensitivityLabelName}
                                  </Badge>
                                ) : w.sensitivityLabelId ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Badge variant="outline" className="text-[10px] bg-muted/50">
                                        <Tag className="w-2.5 h-2.5 mr-1" />ID: {w.sensitivityLabelId.substring(0, 8)}...
                                      </Badge>
                                    </TooltipTrigger>
                                    <TooltipContent>Label ID not found in synced inventory. Sync labels to resolve.</TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <span className="flex items-center gap-1 text-xs text-amber-600">
                                    <XCircle className="w-3 h-3" /> None
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {w.retentionLabelName ? (
                                  <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/20">
                                    <Clock className="w-2.5 h-2.5 mr-1" />{w.retentionLabelName}
                                  </Badge>
                                ) : w.retentionLabelId ? (
                                  <Badge variant="outline" className="text-[10px] bg-muted/50">
                                    <Tag className="w-2.5 h-2.5 mr-1" />ID: {w.retentionLabelId.substring(0, 8)}...
                                  </Badge>
                                ) : (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <XCircle className="w-3 h-3" /> None
                                  </span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    {filteredCoverageWorkspaces.length > 100 && (
                      <div className="p-3 text-center text-xs text-muted-foreground border-t">
                        Showing 100 of {filteredCoverageWorkspaces.length} sites. Use search to narrow results.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </TabsContent>

          {/* ── Site Sensitivity Labels Tab ── */}
          <TabsContent value="siteLabels" className="space-y-6 m-0 animate-in fade-in slide-in-from-bottom-4">
            {needsSensitivityResync && !resyncBannerDismissed && (
              <Card className="border-amber-500/30 bg-amber-500/5" data-testid="card-resync-banner">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm text-amber-700">Re-sync recommended</h4>
                    <p className="text-xs text-amber-600 mt-1">
                      A fix was applied on April 20, 2026 to correctly detect which sensitivity labels apply to Groups &amp; sites.
                      Your stored labels were last synced before this fix and may show incorrect scope data.
                      Click <strong>Sync from Purview</strong> to re-fetch and correct all label scopes.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncSensitivityLabels}
                    disabled={isSyncingSensitivity}
                    className="shrink-0 gap-1.5 border-amber-400/50 text-amber-700 hover:bg-amber-500/10"
                    data-testid="button-resync-banner"
                  >
                    {isSyncingSensitivity ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                    Sync Now
                  </Button>
                </CardContent>
              </Card>
            )}
            <div className="flex items-center justify-between">
              <div />
              <div className="flex gap-3 items-center">
                {lastSynced && (
                  <span className="text-xs text-muted-foreground">
                    Last synced: {new Date(lastSynced).toLocaleString()}
                  </span>
                )}
                <Button onClick={handleSyncSensitivityLabels} disabled={isSyncingSensitivity} className="gap-2 shadow-md shadow-primary/20" data-testid="button-sync-sensitivity-labels">
                  {isSyncingSensitivity ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Sync from Purview
                </Button>
              </div>
            </div>
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle>Site & Group Sensitivity Labels</CardTitle>
                <CardDescription>
                  Labels with "Groups & sites" scope that can be applied to SharePoint sites, Microsoft Teams, and M365 Groups.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading labels...</div>
                ) : siteLabels.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">No site-scoped labels found. Click "Sync from Purview" to import labels.</p>
                    <p className="text-xs text-muted-foreground">Ensure "Groups & sites" scope is enabled on your labels in the Purview portal.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Protection</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteLabels.map(renderLabelRow)}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Retention Labels Tab ── */}
          <TabsContent value="retentionLabels" className="space-y-6 m-0 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center justify-between">
              <div />
              <div className="flex gap-3 items-center">
                {retentionLastSynced && (
                  <span className="text-xs text-muted-foreground">
                    Last synced: {new Date(retentionLastSynced).toLocaleString()}
                  </span>
                )}
                <Button onClick={handleSyncRetentionLabels} disabled={isSyncingRetention} className="gap-2 shadow-md shadow-primary/20" data-testid="button-sync-retention-labels">
                  {isSyncingRetention ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Sync Retention Labels
                </Button>
              </div>
            </div>
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle>Retention Labels</CardTitle>
                <CardDescription>
                  Retention labels from Microsoft Purview Records Management. These define how long content is retained and what happens after the retention period.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoadingRetention ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading retention labels...</div>
                ) : retentionLabelsData.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <Clock className="w-10 h-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">No retention labels synced yet. Click "Sync Retention Labels" to import from Purview.</p>
                    <p className="text-xs text-muted-foreground">
                      Requires <code className="bg-muted px-1 rounded">RecordsManagement.Read.All</code> permission and M365 E5 Compliance or Records Management license.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>During Retention</TableHead>
                        <TableHead>After Retention</TableHead>
                        <TableHead>Record</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {retentionLabelsData.map(label => (
                        <TableRow key={label.labelId} data-testid={`row-retention-${label.labelId}`}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-sm">{label.name}</div>
                              {label.description && (
                                <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">{label.description}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {label.retentionDuration ? (
                              <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/20">
                                <Clock className="w-2.5 h-2.5 mr-1" />{label.retentionDuration}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="text-xs capitalize">{label.behaviorDuringRetentionPeriod?.replace(/([A-Z])/g, ' $1').trim() || "—"}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-xs capitalize">{label.actionAfterRetentionPeriod?.replace(/([A-Z])/g, ' $1').trim() || "—"}</span>
                          </TableCell>
                          <TableCell>
                            {label.isRecordLabel ? (
                              <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                                <Lock className="w-2.5 h-2.5 mr-1" />Record
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">No</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {label.isActive ? (
                              <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Active</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {retentionSyncError && (
              <Card className="border-red-500/20 bg-red-500/5">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-sm text-red-600">Retention Label Sync Error</h4>
                    <p className="text-xs text-red-500 mt-1">{retentionSyncError}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Microsoft's retention labels API requires <strong>delegated (SSO) authentication</strong> — app-only tokens are not supported by Microsoft for this endpoint.
                      To fix this: <strong>sign out and sign back in via SSO</strong> to grant the updated <code className="bg-muted px-1 rounded">RecordsManagement.Read.All</code> delegated permission.
                      A tenant admin must consent to this permission on first login.
                      This feature also requires Microsoft 365 E5 Compliance or Records Management add-on license.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── All Labels Tab ── */}
          <TabsContent value="allLabels" className="space-y-6 m-0 animate-in fade-in slide-in-from-bottom-4">
            {needsSensitivityResync && !resyncBannerDismissed && (
              <Card className="border-amber-500/30 bg-amber-500/5" data-testid="card-resync-banner-all">
                <CardContent className="p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm text-amber-700">Re-sync recommended</h4>
                    <p className="text-xs text-amber-600 mt-1">
                      A fix was applied on April 20, 2026 to correctly detect which sensitivity labels apply to Groups &amp; sites.
                      Your stored labels were last synced before this fix and may show incorrect scope data.
                      Re-syncing will correct the <strong>appliesToGroupsSites</strong> flag for all labels.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleSyncSensitivityLabels}
                    disabled={isSyncingSensitivity}
                    className="shrink-0 gap-1.5 border-amber-400/50 text-amber-700 hover:bg-amber-500/10"
                    data-testid="button-resync-banner-all"
                  >
                    {isSyncingSensitivity ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5" />}
                    Sync Now
                  </Button>
                </CardContent>
              </Card>
            )}
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle>Complete Sensitivity Label Inventory</CardTitle>
                <CardDescription>
                  All sensitivity labels synced from Microsoft Purview for this tenant.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading labels...</div>
                ) : labels.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">No labels synced yet. Run a sync to import your Purview label inventory.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Protection</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {labels.map(renderLabelRow)}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Orchestration Tab ── */}
          <TabsContent value="orchestration" className="space-y-6 m-0 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="glass-panel border-border/50 min-h-[200px] flex items-center justify-center">
                <div className="text-center space-y-3 p-6">
                  <Fingerprint className="w-10 h-10 text-muted-foreground mx-auto" />
                  <h3 className="font-semibold text-base">Adaptive DLP Scopes</h3>
                  <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
                    Map Zenith metadata conditions to Purview Adaptive Scopes.
                  </p>
                  <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                </div>
              </Card>

              <Card className="glass-panel border-border/50 min-h-[200px] flex items-center justify-center">
                <div className="text-center space-y-3 p-6">
                  <Database className="w-10 h-10 text-muted-foreground mx-auto" />
                  <h3 className="font-semibold text-base">Retention Mapping</h3>
                  <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
                    Map workspace lifecycle rules to Purview retention policies.
                  </p>
                  <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                </div>
              </Card>

              <Card className="glass-panel border-border/50 min-h-[200px] flex items-center justify-center">
                <div className="text-center space-y-3 p-6">
                  <Archive className="w-10 h-10 text-muted-foreground mx-auto" />
                  <h3 className="font-semibold text-base">Records Management</h3>
                  <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
                    Define file plans and disposition rules based on content types.
                  </p>
                  <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">
          <Info className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">How Label Sync Works</h4>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            Sensitivity labels are imported from Microsoft Purview via the Graph API. Labels must be published in a label policy to be discoverable.
            Site-scoped labels (with "Groups & sites" scope) can be assigned to SharePoint sites. Retention labels require a separate sync and 
            the <code className="bg-muted px-1 rounded text-[10px]">RecordsManagement.Read.All</code> permission. Label coverage shows which 
            sites have labels applied based on the latest site inventory sync.
          </p>
        </div>
      </div>
    </div>
  );
}
