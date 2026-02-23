import React, { useState, useEffect, useMemo } from "react";
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
  Upload,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Network,
  ChevronDown,
  ChevronRight,
  Layers,
  List,
  Unlink,
  Trash2,
  Eye,
  Tag,
  Sparkles,
  AlertCircle
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function GovernancePage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [groupByHubs, setGroupByHubs] = useState(false);
  const [collapsedHubs, setCollapsedHubs] = useState<Set<string>>(new Set());
  const [hubAssignDialogOpen, setHubAssignDialogOpen] = useState(false);
  const [hubAssignTargetIds, setHubAssignTargetIds] = useState<string[]>([]);
  const [hubAssignValue, setHubAssignValue] = useState<string>("");

  const [sortColumn, setSortColumn] = useState<string>("displayName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const [filterType, setFilterType] = useState("all");
  const [filterSensitivity, setFilterSensitivity] = useState("all");
  const [filterMetadata, setFilterMetadata] = useState("all");
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [filterSize, setFilterSize] = useState("all");
  const [filterAge, setFilterAge] = useState("all");
  const [filterCopilot, setFilterCopilot] = useState("all");
  const [filterStatus, setFilterStatus] = useState("active");

  const [bulkSensitivity, setBulkSensitivity] = useState("");
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
    if (selectedIds.size === filteredAndSortedWorkspaces.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedWorkspaces.map(w => w.id)));
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

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDirection === "asc"
      ? <ArrowUp className="w-3 h-3 ml-1" />
      : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const clearAllFilters = () => {
    setFilterType("all");
    setFilterSensitivity("all");
    setFilterMetadata("all");
    setFilterDepartment("all");
    setFilterSize("all");
    setFilterAge("all");
    setFilterCopilot("all");
    setFilterStatus("active");
  };

  const isDefaultView = filterStatus === "active";
  const activeFilterCount = [filterType, filterSensitivity, filterMetadata, filterDepartment, filterSize, filterAge, filterCopilot].filter(v => v !== "all").length
    + (filterStatus !== "active" ? 1 : 0);

  const filteredAndSortedWorkspaces = useMemo(() => {
    let result = [...workspaces];

    if (filterType !== "all") {
      result = result.filter(ws => ws.type.toLowerCase() === filterType.toLowerCase());
    }

    if (filterSensitivity !== "all") {
      if (filterSensitivity === "__none__" || filterSensitivity === "__blank__") {
        result = result.filter(ws => !ws.sensitivityLabelId);
      } else if (filterSensitivity === "__not_blank__") {
        result = result.filter(ws => !!ws.sensitivityLabelId);
      } else {
        result = result.filter(ws => ws.sensitivityLabelId === filterSensitivity);
      }
    }

    if (filterMetadata !== "all") {
      result = result.filter(ws => {
        const filled = [ws.department, ws.costCenter].filter(Boolean).length;
        if (filterMetadata === "complete") return filled === 2;
        if (filterMetadata === "missing") return filled < 2;
        return true;
      });
    }

    if (filterDepartment !== "all") {
      if (filterDepartment === "__blank__") {
        result = result.filter(ws => !ws.department);
      } else if (filterDepartment === "__not_blank__") {
        result = result.filter(ws => !!ws.department);
      } else {
        result = result.filter(ws => ws.department === filterDepartment);
      }
    }

    if (filterSize !== "all") {
      if (filterSize === "__blank__") {
        result = result.filter(ws => ws.storageUsedBytes == null);
      } else if (filterSize === "__not_blank__") {
        result = result.filter(ws => ws.storageUsedBytes != null);
      } else {
        const MB = 1024 * 1024;
        const GB = 1024 * MB;
        result = result.filter(ws => {
          const bytes = ws.storageUsedBytes ?? 0;
          switch (filterSize) {
            case "lt10mb": return bytes < 10 * MB;
            case "10to100mb": return bytes >= 10 * MB && bytes < 100 * MB;
            case "100mbto1gb": return bytes >= 100 * MB && bytes < GB;
            case "gt1gb": return bytes >= GB;
            default: return true;
          }
        });
      }
    }

    if (filterAge !== "all") {
      if (filterAge === "__blank__") {
        result = result.filter(ws => !ws.siteCreatedDate);
      } else if (filterAge === "__not_blank__") {
        result = result.filter(ws => !!ws.siteCreatedDate);
      } else {
        const now = Date.now();
        const DAY = 86400000;
        result = result.filter(ws => {
          if (!ws.siteCreatedDate) return false;
          const created = new Date(ws.siteCreatedDate).getTime();
          const age = now - created;
          switch (filterAge) {
            case "lt30d": return age < 30 * DAY;
            case "1to6m": return age >= 30 * DAY && age < 180 * DAY;
            case "6to12m": return age >= 180 * DAY && age < 365 * DAY;
            case "gt1y": return age >= 365 * DAY;
            default: return true;
          }
        });
      }
    }

    if (filterCopilot !== "all") {
      result = result.filter(ws => {
        if (filterCopilot === "ready") return ws.copilotReady === true;
        if (filterCopilot === "not_ready") return ws.copilotReady !== true;
        return true;
      });
    }

    if (filterStatus !== "all") {
      result = result.filter(ws => {
        const state = ws.lockState || "Unlock";
        if (filterStatus === "active") return state === "Unlock" && !ws.isDeleted;
        if (filterStatus === "locked") return state === "NoAccess";
        if (filterStatus === "readonly") return state === "ReadOnly";
        if (filterStatus === "noadd") return state === "NoAdditions";
        if (filterStatus === "deleted") return ws.isDeleted === true;
        if (filterStatus === "archived") return state !== "Unlock";
        return true;
      });
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "displayName":
          cmp = (a.displayName || "").localeCompare(b.displayName || "");
          break;
        case "storageUsedBytes":
          cmp = (a.storageUsedBytes ?? 0) - (b.storageUsedBytes ?? 0);
          break;
        case "fileCount":
          cmp = (a.fileCount ?? 0) - (b.fileCount ?? 0);
          break;
        case "lastActivityDate": {
          const da = a.lastActivityDate ? new Date(a.lastActivityDate).getTime() : 0;
          const db = b.lastActivityDate ? new Date(b.lastActivityDate).getTime() : 0;
          cmp = da - db;
          break;
        }
        default:
          cmp = (a.displayName || "").localeCompare(b.displayName || "");
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return result;
  }, [workspaces, filterType, filterSensitivity, filterMetadata, filterDepartment, filterSize, filterAge, filterCopilot, filterStatus, sortColumn, sortDirection]);

  const hubSites = useMemo(() => workspaces.filter(ws => ws.isHubSite), [workspaces]);

  const hubNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const ws of workspaces) {
      if (ws.isHubSite && ws.hubSiteId) {
        map.set(ws.hubSiteId, ws.displayName || "Unknown Hub");
      }
    }
    return map;
  }, [workspaces]);

  const hubGroups = useMemo(() => {
    if (!groupByHubs) return null;

    const groups: { hubId: string; hubName: string; hubSiteUrl: string | null; sites: Workspace[] }[] = [];
    const hubMap = new Map<string, Workspace>();

    for (const ws of workspaces) {
      if (ws.isHubSite && ws.hubSiteId) {
        hubMap.set(ws.hubSiteId, ws);
      }
    }

    const grouped = new Map<string, Workspace[]>();
    const standalone: Workspace[] = [];

    for (const ws of filteredAndSortedWorkspaces) {
      if (ws.hubSiteId && !ws.isHubSite) {
        const list = grouped.get(ws.hubSiteId) || [];
        list.push(ws);
        grouped.set(ws.hubSiteId, list);
      } else if (!ws.isHubSite) {
        standalone.push(ws);
      }
    }

    for (const [hubId, hubWs] of hubMap.entries()) {
      const sites = grouped.get(hubId) || [];
      const hubInFiltered = filteredAndSortedWorkspaces.some(ws => ws.id === hubWs.id);
      if (sites.length > 0 || hubInFiltered) {
        groups.push({
          hubId,
          hubName: hubWs.displayName || "Unknown Hub",
          hubSiteUrl: hubWs.siteUrl,
          sites,
        });
      }
    }

    groups.sort((a, b) => a.hubName.localeCompare(b.hubName));

    if (standalone.length > 0) {
      groups.push({
        hubId: "__standalone__",
        hubName: "Standalone Sites",
        hubSiteUrl: null,
        sites: standalone,
      });
    }

    return groups;
  }, [groupByHubs, filteredAndSortedWorkspaces, workspaces]);

  const toggleHubCollapse = (hubId: string) => {
    setCollapsedHubs(prev => {
      const next = new Set(prev);
      if (next.has(hubId)) next.delete(hubId);
      else next.add(hubId);
      return next;
    });
  };

  const toggleSelectGroup = (sites: Workspace[]) => {
    const ids = sites.map(s => s.id);
    const allSelected = ids.every(id => selectedIds.has(id));
    const newSet = new Set(selectedIds);
    if (allSelected) {
      ids.forEach(id => newSet.delete(id));
    } else {
      ids.forEach(id => newSet.add(id));
    }
    setSelectedIds(newSet);
  };

  const hubAssignMutation = useMutation({
    mutationFn: async (data: { workspaceIds: string[]; hubSiteId: string | null }) => {
      const res = await apiRequest("PATCH", "/api/workspaces/bulk/hub-assignment", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setHubAssignDialogOpen(false);
      setHubAssignTargetIds([]);
      setHubAssignValue("");
      const sync = data?.spoSync;
      if (sync && sync.succeeded > 0 && sync.failed === 0) {
        toast({ title: "Hub Assignment Synced", description: `Updated in Zenith and SharePoint (${sync.succeeded} site${sync.succeeded > 1 ? 's' : ''}).` });
      } else if (sync && sync.succeeded > 0) {
        toast({ title: "Partially Synced", description: `Saved in Zenith. ${sync.succeeded}/${sync.attempted} synced to SharePoint, ${sync.failed} failed.`, variant: "default" });
      } else if (sync && sync.failed > 0) {
        toast({ title: "Saved to Zenith", description: "Hub assignment saved locally. SharePoint sync failed — ensure Sites.FullControl.All permission is granted in Entra.", variant: "default" });
      } else {
        toast({ title: "Hub Assignment Updated", description: "Site hub associations have been updated." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Update Failed", description: err?.message || "Failed to update hub assignment", variant: "destructive" });
    },
  });

  const openHubAssignDialog = (targetIds: string[]) => {
    setHubAssignTargetIds(targetIds);
    const selectedSites = targetIds.map(id => workspaces.find(ws => ws.id === id)).filter(Boolean);
    const hubIds = new Set(selectedSites.map(ws => ws!.hubSiteId || "__standalone__"));
    if (hubIds.size === 1) {
      setHubAssignValue(Array.from(hubIds)[0]);
    } else {
      setHubAssignValue("");
    }
    setHubAssignDialogOpen(true);
  };

  const getHubNameForSite = (ws: Workspace) => {
    if (!ws.hubSiteId || ws.isHubSite) return null;
    return hubNameMap.get(ws.hubSiteId) || null;
  };

  const renderWorkspaceRow = (ws: Workspace) => {
    const storage = formatStorage(ws.storageUsedBytes, ws.storageAllocatedBytes);
    const templateLabel = getTemplateLabel(ws.rootWebTemplate);
    const hubName = getHubNameForSite(ws);
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
                {ws.isHubSite && (
                  <span className="text-[10px] font-semibold text-purple-500 bg-purple-500/10 px-1.5 py-0.5 rounded">Hub</span>
                )}
                {ws.teamsConnected && (
                  <span className="text-[10px] font-semibold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">Teams</span>
                )}
                {ws.isDeleted && (
                  <span className="text-[10px] font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">Deleted</span>
                )}
                {ws.lockState && ws.lockState !== "Unlock" && (
                  <span className="text-[10px] font-semibold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">
                    {ws.lockState === "NoAccess" ? "Locked" : ws.lockState === "ReadOnly" ? "Read-Only" : ws.lockState}
                  </span>
                )}
                {!groupByHubs && hubName && (
                  <span className="text-[10px] font-medium text-purple-500/80 bg-purple-500/5 px-1.5 py-0.5 rounded inline-flex items-center gap-0.5">
                    <Network className="w-2.5 h-2.5" />{hubName}
                  </span>
                )}
              </div>
              {ws.siteUrl && (
                <a href={ws.siteUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-muted-foreground/60 hover:text-primary truncate max-w-[220px] inline-flex items-center gap-1 pointer-events-auto relative z-20" data-testid={`link-site-url-${ws.id}`}>
                  {ws.siteUrl.replace(/^https?:\/\//, '')}
                  <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </a>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="relative z-10">
          {ws.ownerDisplayName || ws.ownerPrincipalName ? (
            <div className="flex flex-col min-w-0">
              <span className="text-sm truncate max-w-[140px]" data-testid={`text-owner-${ws.id}`}>
                {ws.ownerDisplayName || '\u2014'}
              </span>
              {ws.ownerPrincipalName && (
                <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{ws.ownerPrincipalName}</span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">\u2014</span>
          )}
        </TableCell>
        <TableCell className="relative z-10">
          <div className="flex flex-col gap-1 min-w-[120px]">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium" data-testid={`text-storage-${ws.id}`}>{storage.used}</span>
              {storage.allocated !== "\u2014" && (
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
            <span className="text-xs text-muted-foreground">\u2014</span>
          )}
        </TableCell>
        <TableCell className="relative z-10">
          <div className="flex flex-col">
            <span className="text-sm" data-testid={`text-activity-${ws.id}`}>{ws.lastActive || '\u2014'}</span>
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
                          {(ws as any)[f.key] ? '\u2713' : '\u2717'}
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
            <DropdownMenuContent align="end" className="w-[200px]">
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
              {!ws.isHubSite && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => openHubAssignDialog([ws.id])} className="gap-2" data-testid={`button-hub-assign-${ws.id}`}>
                    <Network className="w-3 h-3" /> Assign to Hub
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem>Request Attestation</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive">Archive Workspace</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    );
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
          <div className="flex items-center border rounded-full overflow-hidden" data-testid="view-toggle">
            <Button
              variant={groupByHubs ? "ghost" : "secondary"}
              size="sm"
              className={`gap-1.5 rounded-none rounded-l-full px-3 h-9 ${!groupByHubs ? 'bg-muted' : ''}`}
              onClick={() => setGroupByHubs(false)}
              data-testid="button-view-flat"
            >
              <List className="w-3.5 h-3.5" />
              Flat
            </Button>
            <Button
              variant={groupByHubs ? "secondary" : "ghost"}
              size="sm"
              className={`gap-1.5 rounded-none rounded-r-full px-3 h-9 ${groupByHubs ? 'bg-muted' : ''}`}
              onClick={() => setGroupByHubs(true)}
              data-testid="button-view-hubs"
            >
              <Network className="w-3.5 h-3.5" />
              Group by Hubs
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" className="gap-2 rounded-full relative" onClick={() => setShowFilterDrawer(true)} data-testid="button-open-filters">
              <Filter className="w-4 h-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground" data-testid="badge-active-filter-count">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
            {activeFilterCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-1 text-xs text-muted-foreground hover:text-destructive rounded-full h-8 px-2" data-testid="button-reset-filters">
                <X className="w-3 h-3" />
                Reset
              </Button>
            )}
          </div>
          <Button className="gap-2 rounded-full shadow-md shadow-primary/20">
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap" data-testid="quick-filters">
        <span className="text-xs text-muted-foreground mr-1">Quick filters:</span>
        <Button
          variant={filterStatus === "all" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 rounded-full text-xs gap-1.5 px-3"
          onClick={() => { clearAllFilters(); setFilterStatus("all"); }}
          data-testid="chip-all-sites"
        >
          <Eye className="w-3 h-3" />
          All Sites
        </Button>
        <Button
          variant={filterStatus === "active" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 rounded-full text-xs gap-1.5 px-3"
          onClick={() => { clearAllFilters(); }}
          data-testid="chip-active-only"
        >
          <CheckSquare className="w-3 h-3" />
          Active Only
        </Button>
        <span className="w-px h-4 bg-border" />
        <Button
          variant={filterMetadata === "missing" ? "secondary" : "ghost"}
          size="sm"
          className={`h-7 rounded-full text-xs gap-1.5 px-3 ${filterMetadata === "missing" ? "bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border border-amber-500/20" : ""}`}
          onClick={() => {
            clearAllFilters();
            setFilterMetadata("missing");
          }}
          data-testid="chip-missing-metadata"
        >
          <AlertCircle className="w-3 h-3" />
          Missing Metadata
        </Button>
        <Button
          variant={filterSensitivity === "__none__" ? "secondary" : "ghost"}
          size="sm"
          className={`h-7 rounded-full text-xs gap-1.5 px-3 ${filterSensitivity === "__none__" ? "bg-red-500/15 text-red-600 hover:bg-red-500/25 border border-red-500/20" : ""}`}
          onClick={() => {
            clearAllFilters();
            setFilterSensitivity("__none__");
          }}
          data-testid="chip-no-label"
        >
          <Tag className="w-3 h-3" />
          No Label
        </Button>
        <Button
          variant={filterCopilot === "not_ready" ? "secondary" : "ghost"}
          size="sm"
          className={`h-7 rounded-full text-xs gap-1.5 px-3 ${filterCopilot === "not_ready" ? "bg-purple-500/15 text-purple-600 hover:bg-purple-500/25 border border-purple-500/20" : ""}`}
          onClick={() => {
            clearAllFilters();
            setFilterCopilot("not_ready");
          }}
          data-testid="chip-not-copilot"
        >
          <Sparkles className="w-3 h-3" />
          Not Copilot Ready
        </Button>
        <Button
          variant={filterStatus === "deleted" ? "secondary" : "ghost"}
          size="sm"
          className={`h-7 rounded-full text-xs gap-1.5 px-3 ${filterStatus === "deleted" ? "bg-destructive/15 text-destructive hover:bg-destructive/25 border border-destructive/20" : ""}`}
          onClick={() => {
            clearAllFilters();
            setFilterStatus("deleted");
          }}
          data-testid="chip-deleted"
        >
          <Trash2 className="w-3 h-3" />
          Deleted
        </Button>
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
              onClick={() => openHubAssignDialog(Array.from(selectedIds))}
              className="h-8 gap-2 border-primary/20 text-primary hover:bg-primary/10"
              data-testid="button-bulk-hub-assign"
            >
              <Network className="w-4 h-4" /> Assign to Hub
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
              <div className="flex items-center justify-between px-6 py-2 border-b border-border/30 bg-muted/10">
                <span className="text-xs text-muted-foreground" data-testid="text-results-summary">
                  {filteredAndSortedWorkspaces.length === workspaces.length
                    ? `${workspaces.length} workspace${workspaces.length !== 1 ? 's' : ''}`
                    : `${filteredAndSortedWorkspaces.length} of ${workspaces.length} workspace${workspaces.length !== 1 ? 's' : ''}`}
                  {activeFilterCount > 0 && ` \u00B7 ${activeFilterCount} filter${activeFilterCount !== 1 ? 's' : ''} applied`}
                  {searchTerm && ` \u00B7 search: "${searchTerm}"`}
                </span>
                {selectedIds.size > 0 && (
                  <span className="text-xs text-primary font-medium">{selectedIds.size} selected</span>
                )}
              </div>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[40px] pl-4">
                      <Checkbox 
                        checked={selectedIds.size === filteredAndSortedWorkspaces.length && filteredAndSortedWorkspaces.length > 0} 
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="min-w-[240px] cursor-pointer select-none" onClick={() => handleSort("displayName")} data-testid="sort-header-site">
                      <span className="inline-flex items-center">Site{getSortIcon("displayName")}</span>
                    </TableHead>
                    <TableHead className="min-w-[160px]">Owner</TableHead>
                    <TableHead className="min-w-[160px] cursor-pointer select-none" onClick={() => handleSort("storageUsedBytes")} data-testid="sort-header-storage">
                      <span className="inline-flex items-center">Storage{getSortIcon("storageUsedBytes")}</span>
                    </TableHead>
                    <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("fileCount")} data-testid="sort-header-files">
                      <span className="inline-flex items-center">Files{getSortIcon("fileCount")}</span>
                    </TableHead>
                    <TableHead className="min-w-[100px] cursor-pointer select-none" onClick={() => handleSort("lastActivityDate")} data-testid="sort-header-activity">
                      <span className="inline-flex items-center">Activity{getSortIcon("lastActivityDate")}</span>
                    </TableHead>
                    <TableHead className="min-w-[100px]">Metadata</TableHead>
                    <TableHead>Sensitivity</TableHead>
                    <TableHead>Copilot</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupByHubs && hubGroups ? (
                    hubGroups.map((group) => {
                      const isCollapsed = collapsedHubs.has(group.hubId);
                      const groupSiteIds = group.sites.map(s => s.id);
                      const allGroupSelected = groupSiteIds.length > 0 && groupSiteIds.every(id => selectedIds.has(id));
                      return (
                        <React.Fragment key={group.hubId}>
                          <TableRow
                            className="bg-muted/40 hover:bg-muted/60 cursor-pointer border-b-0"
                            data-testid={`hub-group-${group.hubId}`}
                          >
                            <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                              {groupSiteIds.length > 0 && (
                                <Checkbox
                                  checked={allGroupSelected}
                                  onCheckedChange={() => toggleSelectGroup(group.sites)}
                                  aria-label={`Select all in ${group.hubName}`}
                                  data-testid={`checkbox-hub-group-${group.hubId}`}
                                />
                              )}
                            </TableCell>
                            <TableCell colSpan={9} onClick={() => toggleHubCollapse(group.hubId)}>
                              <div className="flex items-center gap-2">
                                {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                                {group.hubId === "__standalone__" ? (
                                  <Unlink className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <Network className="w-4 h-4 text-purple-500" />
                                )}
                                <span className="font-semibold text-sm">{group.hubName}</span>
                                <Badge variant="secondary" className="text-[10px] h-5">{group.sites.length} site{group.sites.length !== 1 ? 's' : ''}</Badge>
                                {group.hubSiteUrl && (
                                  <a
                                    href={group.hubSiteUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[10px] text-muted-foreground/60 hover:text-primary ml-2 inline-flex items-center gap-1"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {group.hubSiteUrl.replace(/^https?:\/\//, '')}
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                          {!isCollapsed && group.sites.map((ws) => renderWorkspaceRow(ws))}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    filteredAndSortedWorkspaces.map((ws) => renderWorkspaceRow(ws))
                  )}
                </TableBody>
              </Table>
              </div>
              
              <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground" data-testid="text-workspace-count">
                {activeFilterCount > 0
                  ? `Showing ${filteredAndSortedWorkspaces.length} of ${workspaces.length} workspaces`
                  : `Showing ${workspaces.length} workspaces`}
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
          <div className="py-6 space-y-6 overflow-y-auto max-h-[calc(100vh-200px)]">
            <div className="space-y-2">
              <Label>Workspace Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-full bg-background/50" data-testid="filter-type">
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
              <Select value={filterSensitivity} onValueChange={setFilterSensitivity}>
                <SelectTrigger className="w-full bg-background/50" data-testid="filter-sensitivity">
                  <SelectValue placeholder="All labels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Labels</SelectItem>
                  <SelectItem value="__none__">Blank (No Label)</SelectItem>
                  <SelectItem value="__not_blank__">Not Blank (Has Label)</SelectItem>
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
              <Select value={filterMetadata} onValueChange={setFilterMetadata}>
                <SelectTrigger className="w-full bg-background/50" data-testid="filter-metadata">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Status</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="missing">Missing Required Fields</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                <SelectTrigger className="w-full bg-background/50" data-testid="filter-department">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  <SelectItem value="__blank__">Blank (No Department)</SelectItem>
                  <SelectItem value="__not_blank__">Not Blank</SelectItem>
                  {deptOptions.map((d) => (
                    <SelectItem key={d.id} value={d.value}>
                      {d.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Size</Label>
              <Select value={filterSize} onValueChange={setFilterSize}>
                <SelectTrigger className="w-full bg-background/50" data-testid="filter-size">
                  <SelectValue placeholder="All Sizes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sizes</SelectItem>
                  <SelectItem value="__blank__">Blank (No Data)</SelectItem>
                  <SelectItem value="__not_blank__">Not Blank</SelectItem>
                  <SelectItem value="lt10mb">&lt; 10 MB</SelectItem>
                  <SelectItem value="10to100mb">10 MB – 100 MB</SelectItem>
                  <SelectItem value="100mbto1gb">100 MB – 1 GB</SelectItem>
                  <SelectItem value="gt1gb">&gt; 1 GB</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Age</Label>
              <Select value={filterAge} onValueChange={setFilterAge}>
                <SelectTrigger className="w-full bg-background/50" data-testid="filter-age">
                  <SelectValue placeholder="All Ages" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ages</SelectItem>
                  <SelectItem value="__blank__">Blank (No Date)</SelectItem>
                  <SelectItem value="__not_blank__">Not Blank</SelectItem>
                  <SelectItem value="lt30d">&lt; 30 days</SelectItem>
                  <SelectItem value="1to6m">1-6 months</SelectItem>
                  <SelectItem value="6to12m">6-12 months</SelectItem>
                  <SelectItem value="gt1y">&gt; 1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Copilot Ready</Label>
              <Select value={filterCopilot} onValueChange={setFilterCopilot}>
                <SelectTrigger className="w-full bg-background/50" data-testid="filter-copilot">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="not_ready">Not Ready</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Site Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full bg-background/50" data-testid="filter-status">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived (Any Lock)</SelectItem>
                  <SelectItem value="readonly">Read-Only</SelectItem>
                  <SelectItem value="locked">Locked (No Access)</SelectItem>
                  <SelectItem value="noadd">No Additions</SelectItem>
                  <SelectItem value="deleted">Deleted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter>
            {activeFilterCount > 0 && (
              <Button variant="ghost" onClick={clearAllFilters} className="w-full text-destructive hover:text-destructive" data-testid="button-clear-all-filters">
                <X className="w-4 h-4 mr-1" /> Clear All ({activeFilterCount})
              </Button>
            )}
            <Button onClick={() => setShowFilterDrawer(false)} className="w-full" data-testid="button-close-filters">
              Close Filters
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={hubAssignDialogOpen} onOpenChange={setHubAssignDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Network className="w-5 h-5 text-purple-500" />
              Assign to Hub
            </DialogTitle>
            <DialogDescription>
              {hubAssignTargetIds.length === 1
                ? `Change hub association for "${workspaces.find(w => w.id === hubAssignTargetIds[0])?.displayName || 'this site'}".`
                : `Change hub association for ${hubAssignTargetIds.length} selected sites.`}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label>Hub Site</Label>
              <Select value={hubAssignValue} onValueChange={setHubAssignValue}>
                <SelectTrigger className="w-full" data-testid="select-hub-assign">
                  <SelectValue placeholder="Mixed — select a hub..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__standalone__">
                    <span className="flex items-center gap-2">
                      <Unlink className="w-3.5 h-3.5 text-muted-foreground" />
                      Standalone (no hub)
                    </span>
                  </SelectItem>
                  {hubSites.map((hub) => (
                    <SelectItem key={hub.hubSiteId!} value={hub.hubSiteId!} data-testid={`select-hub-option-${hub.hubSiteId}`}>
                      <span className="flex items-center gap-2">
                        <Network className="w-3.5 h-3.5 text-purple-500" />
                        {hub.displayName}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-500">
              Hub association changes are saved to Zenith's inventory. To apply changes to SharePoint, SharePoint Admin permissions are required.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHubAssignDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                hubAssignMutation.mutate({
                  workspaceIds: hubAssignTargetIds,
                  hubSiteId: hubAssignValue === "__standalone__" ? null : hubAssignValue,
                });
              }}
              disabled={hubAssignMutation.isPending || !hubAssignValue}
              className="gap-2"
              data-testid="button-confirm-hub-assign"
            >
              {hubAssignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {hubAssignMutation.isPending ? "Saving..." : "Save Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}