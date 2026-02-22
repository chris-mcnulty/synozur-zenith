import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Workspace } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/lib/tenant-context";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Globe, 
  ShieldAlert,
  ShieldCheck,
  CheckSquare,
  X,
  Settings2,
  Save,
  Loader2,
  ExternalLink,
  HardDrive,
  FileText,
  Users,
  Activity,
  Building2,
  Upload
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function GovernancePage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const [bulkSensitivity, setBulkSensitivity] = useState("");
  const [bulkRetention, setBulkRetention] = useState("");
  const [bulkDepartment, setBulkDepartment] = useState("");
  const [bulkCostCenter, setBulkCostCenter] = useState("");

  const { selectedTenant } = useTenant();

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const tenantConnectionId = selectedTenant?.id || "";

  const { data: dictEntries = [] } = useQuery<{id: string; tenantId: string; category: string; value: string; createdAt: string}[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "data-dictionaries"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/data-dictionaries`).then(r => r.json()),
    enabled: !!tenantConnectionId,
  });

  const { data: sensitivityLabelsData = [] } = useQuery<{labelId: string; name: string; color: string | null; hasProtection: boolean; appliesToGroupsSites: boolean}[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "sensitivity-labels"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/sensitivity-labels`).then(r => r.json()),
    enabled: !!tenantConnectionId,
  });

  const labelMap = new Map(sensitivityLabelsData.map(l => [l.labelId, l]));

  const deptOptions = dictEntries.filter(e => e.category === "department");
  const costCenterOptions = dictEntries.filter(e => e.category === "cost_center");

  const { data: workspaces = [], isLoading, isError } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces", debouncedSearch, tenantConnectionId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      return fetch(`/api/workspaces?${params.toString()}`).then(r => r.json());
    },
  });

  const bulkMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/workspaces/bulk/update", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setIsBulkEditOpen(false);
      setSelectedIds(new Set());
      setBulkSensitivity("");
      setBulkRetention("");
      setBulkDepartment("");
      setBulkCostCenter("");
    },
  });

  const writebackMutation = useMutation({
    mutationFn: (workspaceIds: string[]) =>
      apiRequest("POST", "/api/workspaces/writeback/metadata", { workspaceIds }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      if (data.failed === 0) {
        toast({ title: "Metadata Synced", description: `Successfully synced metadata to SharePoint for ${data.succeeded} site(s).` });
      } else {
        toast({
          title: "Partial Sync",
          description: `${data.succeeded} succeeded, ${data.failed} failed. ${data.results.filter((r: any) => !r.success).map((r: any) => `${r.displayName}: ${r.error}`).join('; ')}`,
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to sync metadata to SharePoint";
      toast({ title: "Sync Failed", description: msg, variant: "destructive" });
    },
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === workspaces.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(workspaces.map(w => w.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkSave = () => {
    const updates: Record<string, string> = {};
    if (bulkSensitivity) {
      if (bulkSensitivity === "__clear__") {
        updates.sensitivityLabelId = "";
      } else {
        updates.sensitivityLabelId = bulkSensitivity;
      }
    }
    if (bulkRetention) updates.retentionPolicy = bulkRetention;
    if (bulkDepartment) updates.department = bulkDepartment === "__clear__" ? "" : bulkDepartment;
    if (bulkCostCenter) updates.costCenter = bulkCostCenter === "__clear__" ? "" : bulkCostCenter;

    bulkMutation.mutate({
      ids: Array.from(selectedIds),
      updates,
    });
  };

  const getIconForType = (type: string) => {
    switch(type) {
      case 'TEAM_SITE': return <Globe className="w-4 h-4 text-teal-500" />;
      case 'COMMUNICATION_SITE': return <Globe className="w-4 h-4 text-blue-500" />;
      case 'HUB_SITE': return <Globe className="w-4 h-4 text-purple-500" />;
      default: return <Globe className="w-4 h-4 text-teal-500" />;
    }
  };

  const getSiteTypeLabel = (type: string) => {
    switch(type) {
      case 'TEAM_SITE': return 'Team Site';
      case 'COMMUNICATION_SITE': return 'Communication Site';
      case 'HUB_SITE': return 'Hub Site';
      default: return 'SharePoint Site';
    }
  };

  const formatStorage = (usedBytes?: number | null, allocatedBytes?: number | null) => {
    if (usedBytes == null) return { used: "—", allocated: "—", percent: 0 };
    const usedMB = usedBytes / (1024 * 1024);
    const allocMB = allocatedBytes ? allocatedBytes / (1024 * 1024) : 0;
    const format = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
    const percent = allocMB > 0 ? Math.min(100, Math.round((usedMB / allocMB) * 100)) : 0;
    return { used: format(usedMB), allocated: allocMB > 0 ? format(allocMB) : "—", percent };
  };

  const getTemplateLabel = (template?: string | null) => {
    if (!template) return null;
    const t = template.toUpperCase();
    if (t.includes("GROUP")) return "Group";
    if (t.includes("SITEPAGEPUBLISHING")) return "Comm";
    if (t.includes("STS#3")) return "Modern Team";
    if (t.includes("STS#0")) return "Classic Team";
    if (t.includes("STS")) return "Team";
    return template;
  };

  const getSensitivityBadge = (ws: Workspace) => {
    const label = ws.sensitivityLabelId ? labelMap.get(ws.sensitivityLabelId) : null;
    if (label) {
      const colorDot = label.color ? (
        <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: label.color }} />
      ) : null;
      return (
        <Badge variant="outline" className="gap-1.5" data-testid={`badge-purview-label-${ws.id}`}>
          {colorDot}
          {label.name}
          {label.hasProtection && <ShieldCheck className="w-3 h-3 text-emerald-500" />}
        </Badge>
      );
    }
    switch(ws.sensitivity) {
      case 'HIGHLY_CONFIDENTIAL': return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20">Highly Confidential</Badge>;
      case 'CONFIDENTIAL': return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/20">Confidential</Badge>;
      case 'INTERNAL': return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20">Internal</Badge>;
      case 'PUBLIC': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20">Public</Badge>;
      default: return ws.sensitivity ? <Badge variant="outline">{ws.sensitivity}</Badge> : <Badge variant="secondary" className="text-muted-foreground">None</Badge>;
    }
  };

  if (isError) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Site Governance</h1>
            <p className="text-muted-foreground mt-1">Enumerate and inspect SharePoint sites across your tenant</p>
          </div>
        </div>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-8 text-center">
            <p className="text-destructive font-medium">Failed to load workspaces. Please try again later.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Site Governance</h1>
          <p className="text-muted-foreground mt-1">Enumerate and inspect SharePoint sites across your tenant</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 rounded-full" onClick={() => setShowFilterDrawer(true)}>
            <Filter className="w-4 h-4" />
            Filters
          </Button>
          <Button className="gap-2 rounded-full shadow-md shadow-primary/20">
            Export CSV
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <Badge className="bg-primary text-primary-foreground">{selectedIds.size}</Badge>
            <span className="text-sm font-medium text-primary">workspaces selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())} className="h-8 border-primary/20 text-primary hover:bg-primary/10">
              <X className="w-4 h-4 mr-1" /> Clear
            </Button>
            <Button size="sm" onClick={() => setIsBulkEditOpen(true)} className="h-8 gap-2 shadow-sm shadow-primary/20">
              <CheckSquare className="w-4 h-4" /> Bulk Edit Properties
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => writebackMutation.mutate(Array.from(selectedIds))}
              disabled={writebackMutation.isPending}
              className="h-8 gap-2 border-primary/20 text-primary hover:bg-primary/10"
              data-testid="button-sync-metadata"
            >
              {writebackMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Sync Metadata to SharePoint
            </Button>
          </div>
        </div>
      )}

      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle>Directory</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or owner..."
                className="pl-9 h-9 bg-background/50 rounded-full"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[40px] pl-4">
                      <Checkbox 
                        checked={selectedIds.size === workspaces.length && workspaces.length > 0} 
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="min-w-[240px]">Site</TableHead>
                    <TableHead className="min-w-[160px]">Owner</TableHead>
                    <TableHead className="min-w-[160px]">Storage</TableHead>
                    <TableHead className="min-w-[100px]">Files</TableHead>
                    <TableHead className="min-w-[100px]">Activity</TableHead>
                    <TableHead className="min-w-[100px]">Metadata</TableHead>
                    <TableHead>Sensitivity</TableHead>
                    <TableHead>Copilot</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspaces.map((ws) => {
                    const storage = formatStorage(ws.storageUsedBytes, ws.storageAllocatedBytes);
                    const templateLabel = getTemplateLabel(ws.rootWebTemplate);
                    return (
                    <TableRow 
                      key={ws.id} 
                      data-testid={`row-workspace-${ws.id}`}
                      className={`group transition-colors relative ${selectedIds.has(ws.id) ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/20'}`}
                    >
                      <TableCell className="pl-4 relative z-20" onClick={(e) => e.stopPropagation()}>
                        <Checkbox 
                          checked={selectedIds.has(ws.id)}
                          onCheckedChange={() => toggleSelect(ws.id)}
                          aria-label={`Select ${ws.displayName}`}
                          data-testid={`checkbox-workspace-${ws.id}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium cursor-pointer relative">
                        <Link href={`/app/governance/workspaces/${ws.id}`} className="absolute inset-0 z-10" />
                        <div className="flex items-center gap-3 relative z-0 pointer-events-none">
                          <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center shadow-sm shrink-0">
                            {getIconForType(ws.type)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-foreground text-sm font-medium truncate">{ws.displayName}</span>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {templateLabel && (
                                <span className="text-[10px] font-medium text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded">{templateLabel}</span>
                              )}
                              {!templateLabel && (
                                <span className="text-xs text-muted-foreground font-normal">{getSiteTypeLabel(ws.type)}</span>
                              )}
                              {ws.teamsConnected && (
                                <span className="text-[10px] font-semibold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">Teams</span>
                              )}
                              {ws.isDeleted && (
                                <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Deleted</span>
                              )}
                            </div>
                            {ws.siteUrl && (
                              <span className="text-[10px] text-muted-foreground/60 truncate max-w-[220px]">{ws.siteUrl.replace(/^https?:\/\//, '')}</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="relative z-10">
                        {ws.ownerDisplayName || ws.ownerPrincipalName ? (
                          <div className="flex flex-col min-w-0">
                            <span className="text-sm truncate max-w-[140px]" data-testid={`text-owner-${ws.id}`}>
                              {ws.ownerDisplayName || '—'}
                            </span>
                            {ws.ownerPrincipalName && (
                              <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{ws.ownerPrincipalName}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="relative z-10">
                        <div className="flex flex-col gap-1 min-w-[120px]">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium" data-testid={`text-storage-${ws.id}`}>{storage.used}</span>
                            {storage.allocated !== "—" && (
                              <span className="text-muted-foreground">/ {storage.allocated}</span>
                            )}
                          </div>
                          {storage.percent > 0 && (
                            <div className="w-full h-1.5 bg-muted/50 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all ${storage.percent > 90 ? 'bg-destructive' : storage.percent > 70 ? 'bg-amber-500' : 'bg-primary'}`}
                                style={{ width: `${storage.percent}%` }}
                              />
                            </div>
                          )}
                          {ws.storageUsedBytes != null && storage.percent > 0 && (
                            <span className="text-[10px] text-muted-foreground">{storage.percent}% used</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="relative z-10">
                        {ws.fileCount != null ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-medium" data-testid={`text-files-${ws.id}`}>{ws.fileCount.toLocaleString()}</span>
                            {ws.activeFileCount != null && (
                              <span className="text-[10px] text-muted-foreground">{ws.activeFileCount.toLocaleString()} active</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="relative z-10">
                        <div className="flex flex-col">
                          <span className="text-sm" data-testid={`text-activity-${ws.id}`}>{ws.lastActive || '—'}</span>
                          {ws.pageViewCount != null && ws.pageViewCount > 0 && (
                            <span className="text-[10px] text-muted-foreground">{ws.pageViewCount} views / 7d</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="relative z-10">
                        {(() => {
                          const requiredFields = [
                            { key: "department", label: "Dept" },
                            { key: "costCenter", label: "Cost" },
                          ];
                          const filled = requiredFields.filter(f => !!(ws as any)[f.key]).length;
                          const total = requiredFields.length;
                          const isComplete = filled === total;
                          return (
                            <Link href={`/app/governance/workspaces/${ws.id}`}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <div className="flex items-center gap-1.5 cursor-pointer" data-testid={`badge-metadata-${ws.id}`}>
                                    <div className={`w-2 h-2 rounded-full shrink-0 ${isComplete ? 'bg-emerald-500' : filled > 0 ? 'bg-amber-500' : 'bg-destructive'}`} />
                                    <span className={`text-xs font-medium ${isComplete ? 'text-emerald-600' : filled > 0 ? 'text-amber-600' : 'text-destructive'}`}>
                                      {filled}/{total}
                                    </span>
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">
                                  {requiredFields.map(f => (
                                    <div key={f.key} className="flex items-center gap-1.5">
                                      <span className={`${(ws as any)[f.key] ? 'text-emerald-500' : 'text-destructive'}`}>
                                        {(ws as any)[f.key] ? '✓' : '✗'}
                                      </span>
                                      {f.label}: {(ws as any)[f.key] || 'Missing'}
                                    </div>
                                  ))}
                                  <div className="text-muted-foreground mt-1">Click to edit</div>
                                </TooltipContent>
                              </Tooltip>
                            </Link>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="relative z-10">
                        {getSensitivityBadge(ws)}
                      </TableCell>
                      <TableCell className="relative z-10">
                        {ws.copilotReady ? (
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">Ready</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-muted-foreground">Not Eligible</Badge>
                        )}
                      </TableCell>
                      <TableCell className="relative z-10">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-actions-${ws.id}`}>
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[180px]">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                               <Link href={`/app/governance/workspaces/${ws.id}`}>Inspect Properties</Link>
                            </DropdownMenuItem>
                            {ws.siteUrl && (
                              <DropdownMenuItem asChild>
                                <a href={ws.siteUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                                  <ExternalLink className="w-3 h-3" /> Open in SharePoint
                                </a>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem>Request Attestation</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">Archive Workspace</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
              
              <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground">
                Showing {workspaces.length} workspaces
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bulk Edit Sheet */}
      <Sheet open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] border-l-border/50 bg-card/95 backdrop-blur-xl">
          <SheetHeader>
            <SheetTitle>Bulk Edit Properties</SheetTitle>
            <SheetDescription>
              Applying changes to {selectedIds.size} selected workspace{selectedIds.size !== 1 ? 's' : ''}.
            </SheetDescription>
          </SheetHeader>
          <div className="py-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Sensitivity Label (Purview)</Label>
                <Select value={bulkSensitivity} onValueChange={setBulkSensitivity}>
                  <SelectTrigger className="w-full bg-background/50" data-testid="select-bulk-sensitivity">
                    <SelectValue placeholder="Select Purview label..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__" className="text-muted-foreground">Clear label</SelectItem>
                    {sensitivityLabelsData.filter(l => l.appliesToGroupsSites).map((l) => (
                      <SelectItem key={l.labelId} value={l.labelId} data-testid={`select-bulk-label-${l.labelId}`}>
                        <span className="flex items-center gap-2">
                          {l.color && <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: l.color }} />}
                          {l.name}
                          {l.hasProtection && <ShieldCheck className="w-3 h-3 text-emerald-500" />}
                        </span>
                      </SelectItem>
                    ))}
                    {sensitivityLabelsData.filter(l => l.appliesToGroupsSites).length === 0 && (
                      <SelectItem value="__no_opts__" disabled className="text-muted-foreground text-xs">
                        No Purview labels synced — run tenant sync first
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Retention Policy</Label>
                <Select value={bulkRetention} onValueChange={setBulkRetention}>
                  <SelectTrigger className="w-full bg-background/50">
                    <SelectValue placeholder="Select retention policy..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Default 7 Year">Default 7 Year</SelectItem>
                    <SelectItem value="Executive 10 Year">Executive 10 Year</SelectItem>
                    <SelectItem value="No Retention (Delete)">No Retention (Delete)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={bulkDepartment} onValueChange={setBulkDepartment}>
                  <SelectTrigger className="w-full bg-background/50" data-testid="select-bulk-department">
                    <SelectValue placeholder="Select department..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__" className="text-muted-foreground">Clear</SelectItem>
                    {deptOptions.map((d) => (
                      <SelectItem key={d.id} value={d.value} data-testid={`select-bulk-department-${d.id}`}>
                        {d.value}
                      </SelectItem>
                    ))}
                    {deptOptions.length === 0 && (
                      <SelectItem value="__no_opts__" disabled className="text-muted-foreground text-xs">
                        No departments defined — add in Data Dictionaries
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Cost Center</Label>
                <Select value={bulkCostCenter} onValueChange={setBulkCostCenter}>
                  <SelectTrigger className="w-full bg-background/50" data-testid="select-bulk-cost-center">
                    <SelectValue placeholder="Select cost center..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__clear__" className="text-muted-foreground">Clear</SelectItem>
                    {costCenterOptions.map((d) => (
                      <SelectItem key={d.id} value={d.value} data-testid={`select-bulk-cost-center-${d.id}`}>
                        {d.value}
                      </SelectItem>
                    ))}
                    {costCenterOptions.length === 0 && (
                      <SelectItem value="__no_opts__" disabled className="text-muted-foreground text-xs">
                        No cost centers defined — add in Data Dictionaries
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-500">
              <span className="font-semibold block mb-1">Warning</span>
              Bulk applying a higher sensitivity label may immediately restrict access for existing external guests across these workspaces.
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkSave} disabled={bulkMutation.isPending} className="gap-2 shadow-md shadow-primary/20">
              {bulkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {bulkMutation.isPending ? "Applying..." : "Apply Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Filter Drawer */}
      <Sheet open={showFilterDrawer} onOpenChange={setShowFilterDrawer}>
        <SheetContent side="left" className="w-[300px] sm:w-[400px] border-r-border/50 bg-card/95 backdrop-blur-xl">
          <SheetHeader>
            <SheetTitle>Filter Directory</SheetTitle>
            <SheetDescription>
              Narrow down workspaces by attributes and policies.
            </SheetDescription>
          </SheetHeader>
          <div className="py-6 space-y-6">
            <div className="space-y-2">
              <Label>Workspace Type</Label>
              <Select defaultValue="all">
                <SelectTrigger className="w-full bg-background/50">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="team_site">Team Site</SelectItem>
                  <SelectItem value="communication_site">Communication Site</SelectItem>
                  <SelectItem value="hub_site">Hub Site</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Sensitivity Label</Label>
              <Select defaultValue="all">
                <SelectTrigger className="w-full bg-background/50">
                  <SelectValue placeholder="All labels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Labels</SelectItem>
                  <SelectItem value="__none__">No Label Assigned</SelectItem>
                  {sensitivityLabelsData.filter(l => l.appliesToGroupsSites).map((l) => (
                    <SelectItem key={l.labelId} value={l.labelId}>
                      <span className="flex items-center gap-2">
                        {l.color && <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: l.color }} />}
                        {l.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Metadata Status</Label>
              <Select defaultValue="missing">
                <SelectTrigger className="w-full bg-background/50 border-amber-500/50 focus:ring-amber-500/50">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Status</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="missing">Missing Required Fields</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setShowFilterDrawer(false)} className="w-full">
              Close Filters
            </Button>
            <Button onClick={() => setShowFilterDrawer(false)} className="w-full">
              Apply Filters
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}