import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import type { SpeContainer, SpeContainerType, SensitivityLabel } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Box,
  Search,
  Database,
  Settings2,
  HardDrive,
  Activity,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  FileText,
  Users,
  Clock,
  Loader2,
  ChevronRight,
  Plus,
  Trash2,
  X,
  AlertCircle,
} from "lucide-react";

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
}

type SortField = "displayName" | "storage" | "fileCount" | "lastActivity" | "sensitivityLabel";
type SortDir = "asc" | "desc";
type QuickFilter = "all" | "active" | "warning" | "no-label" | "external-sharing";

export default function EmbeddedContainersPage() {
  const { toast } = useToast();
  const { selectedTenant, isFeatureEnabled } = useTenant();
  const tenantConnectionId = selectedTenant?.id;
  const featureDisabled = !isFeatureEnabled("speDiscovery");

  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("displayName");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [addAppOpen, setAddAppOpen] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [newAppId, setNewAppId] = useState("");
  const [newAppDesc, setNewAppDesc] = useState("");

  useState(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  });

  const { data: containers = [], isLoading: containersLoading } = useQuery<SpeContainer[]>({
    queryKey: ["/api/spe/containers", tenantConnectionId, debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const res = await fetch(`/api/spe/containers?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch containers");
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const { data: containerTypes = [], isLoading: typesLoading } = useQuery<SpeContainerType[]>({
    queryKey: ["/api/spe/container-types", tenantConnectionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      const res = await fetch(`/api/spe/container-types?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch container types");
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/spe/tenants/${tenantConnectionId}/sync`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/spe/containers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/spe/container-types"] });
      toast({
        title: "SPE Sync Complete",
        description: `${data.containerTypes ?? 0} container types, ${data.containers ?? 0} containers synced.${data.errors ? ` ${data.errors} errors.` : ""}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "SPE Sync Failed", description: err.message, variant: "destructive" });
    },
  });

  const addAppMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/spe/container-types", {
        tenantConnectionId,
        displayName: newAppName.trim(),
        azureAppId: newAppId.trim().toLowerCase(),
        description: newAppDesc.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spe/container-types"] });
      toast({ title: "Application Registered", description: `${newAppName} has been added. Run Sync to discover its containers.` });
      setAddAppOpen(false);
      setNewAppName("");
      setNewAppId("");
      setNewAppDesc("");
    },
    onError: (err: any) => {
      toast({ title: "Registration Failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteTypeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/spe/container-types/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spe/container-types"] });
      toast({ title: "Application Removed" });
    },
    onError: (err: any) => {
      toast({ title: "Delete Failed", description: err.message, variant: "destructive" });
    },
  });

  const selectedContainer = useMemo(() =>
    containers.find(c => c.id === selectedContainerId),
    [containers, selectedContainerId]
  );

  const typeNameMap = useMemo(() => {
    const m = new Map<string, string>();
    containerTypes.forEach(ct => m.set(ct.id, ct.displayName));
    return m;
  }, [containerTypes]);

  const filteredContainers = useMemo(() => {
    let list = [...containers];

    if (quickFilter === "active") list = list.filter(c => c.status === "Active");
    else if (quickFilter === "warning") list = list.filter(c => c.status === "Warning" || (c.storageUsedBytes && c.storageAllocatedBytes && c.storageUsedBytes / c.storageAllocatedBytes > 0.9));
    else if (quickFilter === "no-label") list = list.filter(c => !c.sensitivityLabel);
    else if (quickFilter === "external-sharing") list = list.filter(c => c.externalSharing);

    if (filterType) list = list.filter(c => c.containerTypeId === filterType);

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "displayName": cmp = (a.displayName || "").localeCompare(b.displayName || ""); break;
        case "storage": cmp = (a.storageUsedBytes || 0) - (b.storageUsedBytes || 0); break;
        case "fileCount": cmp = (a.fileCount || 0) - (b.fileCount || 0); break;
        case "lastActivity": cmp = (a.lastActivityDate || "").localeCompare(b.lastActivityDate || ""); break;
        case "sensitivityLabel": cmp = (a.sensitivityLabel || "").localeCompare(b.sensitivityLabel || ""); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [containers, quickFilter, filterType, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 text-primary" /> : <ArrowDown className="w-3 h-3 text-primary" />;
  };

  const totalStorage = useMemo(() => containers.reduce((sum, c) => sum + (c.storageUsedBytes || 0), 0), [containers]);
  const totalAllocated = useMemo(() => containers.reduce((sum, c) => sum + (c.storageAllocatedBytes || 0), 0), [containers]);
  const totalFiles = useMemo(() => containers.reduce((sum, c) => sum + (c.fileCount || 0), 0), [containers]);
  const labeledCount = useMemo(() => containers.filter(c => c.sensitivityLabel).length, [containers]);

  const getLabelColor = (label: string | null | undefined) => {
    if (!label) return "";
    const l = label.toLowerCase();
    if (l.includes("highly confidential")) return "bg-red-500/10 text-red-600 border-red-500/20";
    if (l.includes("confidential")) return "bg-orange-500/10 text-orange-600 border-orange-500/20";
    if (l.includes("internal")) return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    if (l.includes("public")) return "bg-green-500/10 text-green-600 border-green-500/20";
    return "bg-muted/50 text-muted-foreground border-border/50";
  };

  const isEmpty = !containersLoading && containers.length === 0;

  if (!tenantConnectionId) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center text-muted-foreground space-y-2">
          <Box className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <p className="font-medium">Select a tenant to view SharePoint Embedded containers</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {featureDisabled && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5" data-testid="banner-feature-disabled">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-700">SPE Container Discovery is disabled</p>
            <p className="text-xs text-muted-foreground">Enable this feature in Tenant Settings to discover and sync SharePoint Embedded containers.</p>
          </div>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-spe">SharePoint Embedded</h1>
          <p className="text-muted-foreground mt-1">Manage headless SharePoint containers, usage, and Purview labeling.</p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || featureDisabled}
          className="gap-2 shadow-md shadow-primary/20"
          data-testid="button-sync-spe"
          title={featureDisabled ? "Enable SPE Container Discovery in Feature Settings" : undefined}
        >
          {syncMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          <Database className="w-4 h-4" />
          {syncMutation.isPending ? "Syncing..." : "Sync Containers"}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { title: "Total Containers", value: containers.length.toLocaleString(), sub: `${containerTypes.length} type${containerTypes.length !== 1 ? "s" : ""} registered`, icon: <Box className="w-5 h-5 text-blue-500" /> },
          { title: "Total Storage", value: formatBytes(totalStorage), sub: totalAllocated ? `${Math.round(totalStorage / totalAllocated * 100)}% of ${formatBytes(totalAllocated)}` : "—", icon: <HardDrive className="w-5 h-5 text-purple-500" /> },
          { title: "Total Files", value: totalFiles.toLocaleString(), sub: `Across all containers`, icon: <FileText className="w-5 h-5 text-emerald-500" /> },
          { title: "Purview Labels", value: `${labeledCount}/${containers.length}`, sub: containers.length > 0 ? `${Math.round(labeledCount / containers.length * 100)}% labeled` : "—", icon: <Tag className="w-5 h-5 text-orange-500" /> },
        ].map((stat, i) => (
          <Card key={i} className="glass-panel border-border/50" data-testid={`card-stat-${i}`}>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">{stat.icon}</div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs font-medium text-muted-foreground mt-1">{stat.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="containers" className="w-full">
        <TabsList className="bg-muted/50 p-1 w-full justify-start rounded-xl h-auto">
          <TabsTrigger value="containers" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-containers">
            <Box className="w-4 h-4 mr-2" />
            Containers ({filteredContainers.length})
          </TabsTrigger>
          <TabsTrigger value="types" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-types">
            <Settings2 className="w-4 h-4 mr-2" />
            Container Types ({containerTypes.length})
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="containers" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Box className="w-5 h-5 text-primary" />
                      Embedded Containers
                    </CardTitle>
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search containers..."
                        className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setDebouncedSearch(e.target.value); }}
                        data-testid="input-search-containers"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {([
                      { key: "all", label: "All Containers" },
                      { key: "active", label: "Active" },
                      { key: "warning", label: "Near Limit" },
                      { key: "no-label", label: "No Label" },
                      { key: "external-sharing", label: "External Sharing" },
                    ] as { key: QuickFilter; label: string }[]).map(f => (
                      <Button
                        key={f.key}
                        variant={quickFilter === f.key ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs rounded-full"
                        onClick={() => setQuickFilter(f.key)}
                        data-testid={`filter-${f.key}`}
                      >
                        {f.label}
                      </Button>
                    ))}
                    {filterType && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs rounded-full gap-1"
                        onClick={() => setFilterType(null)}
                      >
                        Type: {typeNameMap.get(filterType) || "Unknown"}
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {containersLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredContainers.length === 0 ? (
                  <div className="flex items-center justify-center py-20 text-muted-foreground">
                    <div className="text-center space-y-2">
                      <Box className="w-10 h-10 mx-auto text-muted-foreground/40" />
                      <p className="font-medium">No containers found</p>
                      {containers.length === 0 && <p className="text-sm">Click "Sync Containers" to pull SPE containers from your connected tenant.</p>}
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="pl-6 cursor-pointer select-none" onClick={() => toggleSort("displayName")}>
                          <span className="inline-flex items-center gap-1">Container <SortIcon field="displayName" /></span>
                        </TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead className="w-[180px] cursor-pointer select-none" onClick={() => toggleSort("storage")}>
                          <span className="inline-flex items-center gap-1">Storage <SortIcon field="storage" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("fileCount")}>
                          <span className="inline-flex items-center gap-1">Files <SortIcon field="fileCount" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("lastActivity")}>
                          <span className="inline-flex items-center gap-1">Activity <SortIcon field="lastActivity" /></span>
                        </TableHead>
                        <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("sensitivityLabel")}>
                          <span className="inline-flex items-center gap-1">Sensitivity <SortIcon field="sensitivityLabel" /></span>
                        </TableHead>
                        <TableHead>Retention</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContainers.map((container) => {
                        const pctUsed = container.storageAllocatedBytes
                          ? ((container.storageUsedBytes || 0) / container.storageAllocatedBytes) * 100
                          : 0;
                        const isNearLimit = pctUsed > 90;
                        const typeName = container.containerTypeId ? typeNameMap.get(container.containerTypeId) : null;

                        return (
                          <TableRow
                            key={container.id}
                            className="group hover:bg-muted/10 transition-colors cursor-pointer"
                            onClick={() => setSelectedContainerId(container.id)}
                            data-testid={`row-container-${container.id}`}
                          >
                            <TableCell className="pl-6">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center shadow-sm shrink-0">
                                  <Box className="w-4 h-4 text-blue-500" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm font-medium truncate">{container.displayName}</span>
                                  <span className="text-[10px] text-muted-foreground font-mono">{container.m365ContainerId || container.id.slice(0, 12)}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              {typeName ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-auto p-0 text-xs text-muted-foreground hover:text-primary font-normal"
                                  onClick={(e) => { e.stopPropagation(); setFilterType(container.containerTypeId); }}
                                >
                                  {typeName}
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {container.ownerDisplayName ? (
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm truncate max-w-[120px]">{container.ownerDisplayName}</span>
                                  {container.ownerPrincipalName && (
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">{container.ownerPrincipalName}</span>
                                  )}
                                </div>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1.5 w-[160px]">
                                <div className="flex justify-between text-xs">
                                  <span className={isNearLimit ? "text-red-500 font-medium" : "text-muted-foreground"}>
                                    {formatBytes(container.storageUsedBytes)}
                                  </span>
                                  <span className="text-muted-foreground">{formatBytes(container.storageAllocatedBytes)}</span>
                                </div>
                                <Progress
                                  value={pctUsed}
                                  className="h-1.5"
                                  indicatorColor={isNearLimit ? "bg-red-500" : pctUsed > 70 ? "bg-amber-500" : "bg-primary"}
                                />
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-sm">{(container.fileCount || 0).toLocaleString()}</span>
                                {container.activeFileCount != null && (
                                  <span className="text-[10px] text-muted-foreground">{container.activeFileCount.toLocaleString()} active</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">{formatDate(container.lastActivityDate)}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {container.sensitivityLabel ? (
                                <Badge variant="outline" className={`text-[10px] ${getLabelColor(container.sensitivityLabel)}`}>
                                  <ShieldCheck className="w-3 h-3 mr-1" />
                                  {container.sensitivityLabel}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] bg-muted/30 text-muted-foreground border-border/50">
                                  No Label
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {container.retentionLabel ? (
                                <Badge variant="outline" className="text-[10px] bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                                  {container.retentionLabel}
                                </Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                container.status === "Active" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                container.status === "Warning" ? "bg-orange-500/10 text-orange-600 border-orange-500/20" :
                                container.status === "Inactive" ? "bg-gray-500/10 text-gray-500 border-gray-500/20" :
                                "bg-muted/50 text-muted-foreground border-border/50"
                              }>
                                {container.status === "Warning" && <ShieldAlert className="w-3 h-3 mr-1" />}
                                {container.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="types" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Settings2 className="w-5 h-5 text-primary" />
                      Container Types
                    </CardTitle>
                    <CardDescription className="mt-1">Register SPE applications by their Entra App ID. Known Microsoft apps are synced automatically. Add third-party or custom apps here.</CardDescription>
                  </div>
                  <Dialog open={addAppOpen} onOpenChange={setAddAppOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2" data-testid="button-add-app">
                        <Plus className="w-4 h-4" />
                        Add Application
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Register SPE Application</DialogTitle>
                        <DialogDescription>
                          Add a third-party or custom SPE application by entering its Entra App Registration ID (GUID). Its containers will be discovered on the next sync.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <div className="space-y-2">
                          <Label htmlFor="app-name">Application Name</Label>
                          <Input
                            id="app-name"
                            placeholder="e.g. Constellation, Acme Document Manager"
                            value={newAppName}
                            onChange={(e) => setNewAppName(e.target.value)}
                            data-testid="input-app-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="app-id">Entra App ID (GUID)</Label>
                          <Input
                            id="app-id"
                            placeholder="e.g. a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                            className="font-mono text-sm"
                            value={newAppId}
                            onChange={(e) => setNewAppId(e.target.value)}
                            data-testid="input-app-id"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="app-desc">Description (optional)</Label>
                          <Input
                            id="app-desc"
                            placeholder="e.g. Portfolio company document containers"
                            value={newAppDesc}
                            onChange={(e) => setNewAppDesc(e.target.value)}
                            data-testid="input-app-desc"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAddAppOpen(false)}>Cancel</Button>
                        <Button
                          onClick={() => addAppMutation.mutate()}
                          disabled={!newAppName.trim() || !newAppId.trim() || addAppMutation.isPending}
                          data-testid="button-confirm-add-app"
                        >
                          {addAppMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                          Register Application
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {typesLoading ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : containerTypes.length === 0 ? (
                  <div className="flex items-center justify-center py-20 text-muted-foreground">
                    <div className="text-center space-y-3">
                      <Settings2 className="w-10 h-10 mx-auto text-muted-foreground/40" />
                      <p className="font-medium">No applications registered</p>
                      <p className="text-sm">Click "Add Application" to register a third-party SPE app, then sync to discover its containers.</p>
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="pl-6">Application Name</TableHead>
                        <TableHead>Entra App ID</TableHead>
                        <TableHead>Containers</TableHead>
                        <TableHead>Default Quota</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {containerTypes.map((ct) => {
                        const containerCount = containers.filter(c => c.containerTypeId === ct.id).length;
                        return (
                          <TableRow key={ct.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-type-${ct.id}`}>
                            <TableCell className="pl-6">
                              <div className="flex flex-col">
                                <span className="font-medium text-sm">{ct.displayName}</span>
                                {ct.description && <span className="text-[10px] text-muted-foreground">{ct.description}</span>}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-xs text-muted-foreground">
                                {ct.azureAppId || "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-0 text-sm font-medium hover:text-primary"
                                onClick={() => { setFilterType(ct.id); }}
                              >
                                {containerCount}
                                <ChevronRight className="w-3 h-3 ml-1" />
                              </Button>
                            </TableCell>
                            <TableCell className="text-sm">{ct.defaultStorageLimitBytes ? formatBytes(ct.defaultStorageLimitBytes) : "—"}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                ct.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                                "bg-gray-500/10 text-gray-500 border-gray-500/20"
                              }>
                                {ct.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => deleteTypeMutation.mutate(ct.id)}
                                    data-testid={`button-delete-type-${ct.id}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Remove application</TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>

      <Sheet open={!!selectedContainer} onOpenChange={(open) => { if (!open) setSelectedContainerId(null); }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedContainer && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Box className="w-5 h-5 text-blue-500" />
                  {selectedContainer.displayName}
                </SheetTitle>
              </SheetHeader>
              <ContainerDetailPanel container={selectedContainer} typeNameMap={typeNameMap} tenantConnectionId={tenantConnectionId || ""} />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ContainerDetailPanel({ container, typeNameMap, tenantConnectionId }: { container: SpeContainer; typeNameMap: Map<string, string>; tenantConnectionId: string }) {
  const { toast } = useToast();
  const [selectedLabelId, setSelectedLabelId] = useState<string>(container.sensitivityLabelId || "none");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setSelectedLabelId(container.sensitivityLabelId || "none");
    setIsDirty(false);
  }, [container.id, container.sensitivityLabelId]);

  const { data: usageHistory = [] } = useQuery({
    queryKey: ["/api/spe/containers", container.id, "usage"],
    queryFn: async () => {
      const res = await fetch(`/api/spe/containers/${container.id}/usage?limit=10`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: sensitivityLabels = [] } = useQuery<SensitivityLabel[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "sensitivity-labels"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/sensitivity-labels`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const labelMutation = useMutation({
    mutationFn: async ({ labelId, labelName }: { labelId: string; labelName: string | null }) => {
      const res = await apiRequest("PATCH", `/api/spe/containers/${container.id}`, {
        sensitivityLabelId: labelId === "none" ? "" : labelId,
        sensitivityLabel: labelName,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/spe/containers"] });
      setIsDirty(false);
      toast({ title: "Label Updated", description: "Sensitivity label applied to container in Microsoft 365." });
    },
    onError: (err: any) => {
      setSelectedLabelId(container.sensitivityLabelId || "none");
      setIsDirty(false);
      toast({ title: "Label Update Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleLabelChange = (value: string) => {
    setSelectedLabelId(value);
    setIsDirty(value !== (container.sensitivityLabelId || "none"));
  };

  const handleSaveLabel = () => {
    const chosenLabel = sensitivityLabels.find(l => l.labelId === selectedLabelId);
    labelMutation.mutate({
      labelId: selectedLabelId,
      labelName: chosenLabel?.name ?? null,
    });
  };

  const pctUsed = container.storageAllocatedBytes
    ? ((container.storageUsedBytes || 0) / container.storageAllocatedBytes) * 100
    : 0;
  const isNearLimit = pctUsed > 90;

  const getLabelColor = (label: string | null | undefined) => {
    if (!label) return "";
    const l = label.toLowerCase();
    if (l.includes("highly confidential")) return "bg-red-500/10 text-red-600 border-red-500/20";
    if (l.includes("confidential")) return "bg-orange-500/10 text-orange-600 border-orange-500/20";
    if (l.includes("internal")) return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    return "bg-muted/50 text-muted-foreground border-border/50";
  };

  return (
    <div className="space-y-6 mt-6">
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Status</div>
            <Badge variant="outline" className={
              container.status === "Active" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
              container.status === "Warning" ? "bg-orange-500/10 text-orange-600 border-orange-500/20" :
              "bg-gray-500/10 text-gray-500 border-gray-500/20"
            }>
              {container.status}
            </Badge>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground mb-1">Type</div>
            <span className="text-sm font-medium">{container.containerTypeId ? typeNameMap.get(container.containerTypeId) || "—" : "—"}</span>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><HardDrive className="w-4 h-4" /> Storage</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className={isNearLimit ? "text-red-500 font-medium" : ""}>
                {formatBytes(container.storageUsedBytes)}
              </span>
              <span className="text-muted-foreground">{formatBytes(container.storageAllocatedBytes)}</span>
            </div>
            <Progress
              value={pctUsed}
              className="h-2"
              indicatorColor={isNearLimit ? "bg-red-500" : pctUsed > 70 ? "bg-amber-500" : "bg-primary"}
            />
            <div className="text-xs text-muted-foreground text-right">{Math.round(pctUsed)}% used</div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <div><span className="text-muted-foreground">Total Files</span></div>
            <div className="text-right font-medium">{(container.fileCount || 0).toLocaleString()}</div>
            <div><span className="text-muted-foreground">Active Files</span></div>
            <div className="text-right font-medium">{(container.activeFileCount || 0).toLocaleString()}</div>
            <div><span className="text-muted-foreground">Last Activity</span></div>
            <div className="text-right">{formatDate(container.lastActivityDate)}</div>
            <div><span className="text-muted-foreground">Created</span></div>
            <div className="text-right">{formatDate(container.containerCreatedDate)}</div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> Purview Labels</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <div className="text-xs text-muted-foreground mb-2">Sensitivity Label</div>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedLabelId}
                  onValueChange={handleLabelChange}
                  disabled={labelMutation.isPending}
                >
                  <SelectTrigger className="h-8 text-sm flex-1" data-testid="select-sensitivity-label">
                    <SelectValue placeholder="Select a label…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground">No label</span>
                    </SelectItem>
                    {sensitivityLabels.map((label) => (
                      <SelectItem key={label.labelId} value={label.labelId} data-testid={`option-label-${label.labelId}`}>
                        <span className={getLabelColor(label.name) ? `px-1.5 py-0.5 rounded text-xs font-medium ${getLabelColor(label.name)}` : ""}>
                          {label.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isDirty && (
                  <Button
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={handleSaveLabel}
                    disabled={labelMutation.isPending}
                    data-testid="button-save-sensitivity-label"
                  >
                    {labelMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
                  </Button>
                )}
              </div>
              {sensitivityLabels.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No labels synced for this tenant. Run a label sync first.</p>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">Retention Label</div>
              {container.retentionLabel ? (
                <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20">
                  {container.retentionLabel}
                </Badge>
              ) : (
                <span className="text-sm text-muted-foreground">None assigned</span>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">External Sharing</div>
              <Badge variant="outline" className={container.externalSharing ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-muted/30 text-muted-foreground border-border/50"}>
                {container.externalSharing ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Owner & Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-y-3 text-sm">
            <div><span className="text-muted-foreground">Owner</span></div>
            <div className="text-right font-medium">{container.ownerDisplayName || "—"}</div>
            {container.ownerPrincipalName && (
              <>
                <div><span className="text-muted-foreground">UPN</span></div>
                <div className="text-right text-xs text-muted-foreground">{container.ownerPrincipalName}</div>
              </>
            )}
            <div><span className="text-muted-foreground">Permissions</span></div>
            <div className="text-right">{container.permissions || "—"}</div>
          </div>
        </CardContent>
      </Card>

      {usageHistory.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4" /> Usage Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {usageHistory.slice(0, 5).map((u: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-border/20 last:border-0">
                  <span className="text-xs text-muted-foreground">
                    {new Date(u.snapshotAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs">{formatBytes(u.storageUsedBytes)}</span>
                    <span className="text-xs text-muted-foreground">{(u.fileCount || 0).toLocaleString()} files</span>
                    {u.activeUsers != null && <span className="text-xs text-muted-foreground">{u.activeUsers} users</span>}
                    {u.apiCallCount != null && <span className="text-xs text-muted-foreground">{u.apiCallCount.toLocaleString()} API calls</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
