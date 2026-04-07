import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/lib/tenant-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  HardDrive, Search, Loader2, RefreshCw, AlertTriangle, CheckCircle2,
  UserX, Clock, Link2, Trash2,
} from "lucide-react";

interface OneDriveItem {
  id: string;
  tenantConnectionId: string;
  userId: string;
  userDisplayName: string | null;
  userPrincipalName: string;
  userDepartment: string | null;
  userJobTitle: string | null;
  userMail: string | null;
  driveId: string | null;
  driveType: string | null;
  quotaTotalBytes: number | null;
  quotaUsedBytes: number | null;
  quotaRemainingBytes: number | null;
  quotaState: string | null;
  lastActivityDate: string | null;
  fileCount: number | null;
  activeFileCount: number | null;
  lastDiscoveredAt: string | null;
  discoveryStatus: string;
}

interface SharingLinkItem {
  id: string;
  resourceType: string;
  resourceName: string | null;
  linkType: string;
  linkScope: string | null;
  createdBy: string | null;
  isActive: boolean;
  expiresAt: string | null;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function quotaStateBadge(state: string | null) {
  switch (state) {
    case "normal":
      return <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-[10px]"><CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Normal</Badge>;
    case "nearing":
      return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />Nearing</Badge>;
    case "critical":
    case "exceeded":
      return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 text-[10px]"><AlertTriangle className="w-2.5 h-2.5 mr-0.5" />{state === "critical" ? "Critical" : "Exceeded"}</Badge>;
    default:
      return null;
  }
}

function usagePercent(used: number | null, total: number | null): number | null {
  if (used == null || total == null || total === 0) return null;
  return Math.round((used / total) * 100);
}

function isInactive(lastActivityDate: string | null): boolean {
  if (!lastActivityDate) return true;
  const diff = Date.now() - new Date(lastActivityDate).getTime();
  return diff > 90 * 24 * 60 * 60 * 1000; // 90 days
}

export default function OneDriveInventoryPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [quotaFilter, setQuotaFilter] = useState("all");
  const { selectedTenant, isFeatureEnabled } = useTenant();
  const { toast } = useToast();
  const tenantConnectionId = selectedTenant?.id;
  const featureDisabled = !isFeatureEnabled("onedriveInventory");

  const { data: drives = [], isLoading } = useQuery<OneDriveItem[]>({
    queryKey: ["/api/onedrive-inventory", tenantConnectionId, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      const res = await fetch(`/api/onedrive-inventory?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load OneDrive inventory");
      return res.json();
    },
  });

  const { data: sharingLinks = [] } = useQuery<SharingLinkItem[]>({
    queryKey: ["/api/content-governance/sharing/links", tenantConnectionId, "ONEDRIVE"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      params.set("resourceType", "ONEDRIVE");
      const res = await fetch(`/api/content-governance/sharing/links?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!tenantConnectionId) throw new Error("No tenant selected");
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/onedrive-inventory/sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to start sync");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "OneDrive sync started", description: "Discovering all user drives and quota data…" });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/onedrive-inventory", tenantConnectionId] });
      }, 8000);
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/content-governance/sharing/links/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to revoke");
    },
    onSuccess: () => {
      toast({ title: "Link revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/content-governance/sharing/links"] });
    },
  });

  // Compute stats
  const totalUsed = drives.reduce((s, d) => s + (d.quotaUsedBytes ?? 0), 0);
  const inactiveCount = drives.filter(d => isInactive(d.lastActivityDate)).length;
  const noDriveCount = drives.filter(d => !d.driveId).length;
  const criticalCount = drives.filter(d => d.quotaState === "critical" || d.quotaState === "exceeded").length;
  const avgUtilization = useMemo(() => {
    const withQuota = drives.filter(d => d.quotaTotalBytes && d.quotaTotalBytes > 0);
    if (withQuota.length === 0) return 0;
    const totalPct = withQuota.reduce((s, d) => s + ((d.quotaUsedBytes ?? 0) / d.quotaTotalBytes!) * 100, 0);
    return Math.round(totalPct / withQuota.length);
  }, [drives]);

  // Apply filters
  const filteredDrives = useMemo(() => {
    let result = drives;
    if (statusFilter === "active") result = result.filter(d => !isInactive(d.lastActivityDate));
    if (statusFilter === "inactive") result = result.filter(d => isInactive(d.lastActivityDate));
    if (statusFilter === "no-drive") result = result.filter(d => !d.driveId);
    if (quotaFilter === "normal") result = result.filter(d => d.quotaState === "normal");
    if (quotaFilter === "nearing") result = result.filter(d => d.quotaState === "nearing");
    if (quotaFilter === "critical") result = result.filter(d => d.quotaState === "critical" || d.quotaState === "exceeded");
    return result;
  }, [drives, statusFilter, quotaFilter]);

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {featureDisabled && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="banner-feature-disabled">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700">OneDrive Inventory is disabled</p>
              <p className="text-xs text-muted-foreground">Enable this feature in Tenant Settings to discover and sync OneDrive data.</p>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <HardDrive className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">OneDrive Inventory</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Full inventory of OneDrive for Business drives across connected tenants.
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !tenantConnectionId || featureDisabled}
          title={featureDisabled ? "Enable OneDrive Inventory in Feature Settings" : !tenantConnectionId ? "Select a tenant to sync" : undefined}
        >
          {syncMutation.isPending
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Syncing…</>
            : <><RefreshCw className="mr-2 h-4 w-4" />Sync OneDrives</>}
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Users</p>
            <p className="text-2xl font-bold">{drives.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Used</p>
            <p className="text-2xl font-bold">{formatBytes(totalUsed)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-1 mb-1">
              <Clock className="w-3 h-3 text-amber-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Inactive (90d+)</p>
            </div>
            <p className="text-2xl font-bold text-amber-600">{inactiveCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-1 mb-1">
              <UserX className="w-3 h-3 text-red-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">No Drive</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{noDriveCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Critical/Exceeded</p>
            <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Avg Utilization</p>
            <p className="text-2xl font-bold">{avgUtilization}%</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inventory" className="w-full">
        <TabsList>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="sharing">Sharing Links ({sharingLinks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="inventory" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, UPN, or department..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive (90d+)</SelectItem>
                <SelectItem value="no-drive">No Drive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={quotaFilter} onValueChange={setQuotaFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Quota" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Quota</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="nearing">Nearing</SelectItem>
                <SelectItem value="critical">Critical/Exceeded</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading OneDrive inventory...
                </div>
              ) : filteredDrives.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
                  <HardDrive className="h-10 w-10 opacity-30" />
                  <p className="text-sm">
                    {drives.length === 0
                      ? 'No OneDrives discovered yet. Select a tenant and click "Sync OneDrives" to begin.'
                      : "No drives match the current filters."}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Used</TableHead>
                      <TableHead>Allocated</TableHead>
                      <TableHead>Usage %</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Activity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDrives.map(d => {
                      const pct = usagePercent(d.quotaUsedBytes, d.quotaTotalBytes);
                      const inactive = isInactive(d.lastActivityDate);
                      return (
                        <TableRow
                          key={d.id}
                          className={
                            !d.driveId ? "bg-red-50/30 dark:bg-red-950/10" :
                            inactive ? "bg-amber-50/30 dark:bg-amber-950/10" : ""
                          }
                        >
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium text-sm">{d.userDisplayName ?? "—"}</span>
                              <span className="text-xs text-muted-foreground">{d.userPrincipalName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{d.userDepartment ?? "—"}</TableCell>
                          <TableCell className="text-sm">{d.driveId ? formatBytes(d.quotaUsedBytes) : "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{d.driveId ? formatBytes(d.quotaTotalBytes) : "No drive"}</TableCell>
                          <TableCell>
                            {pct != null ? (
                              <div className="flex items-center gap-2">
                                <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                                    style={{ width: `${Math.min(pct, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-muted-foreground">{pct}%</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {quotaStateBadge(d.quotaState)}
                              {!d.driveId && (
                                <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 text-[10px]">
                                  <UserX className="w-2.5 h-2.5 mr-0.5" />No Drive
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {inactive ? (
                              <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]">
                                <Clock className="w-2.5 h-2.5 mr-0.5" />Inactive
                              </Badge>
                            ) : d.lastActivityDate ? (
                              <span className="text-xs text-muted-foreground">{new Date(d.lastActivityDate).toLocaleDateString()}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
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

        <TabsContent value="sharing" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="w-4 h-4" /> OneDrive Sharing Links
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {sharingLinks.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  No OneDrive sharing links discovered
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sharingLinks.map(link => (
                      <TableRow key={link.id} className={link.linkType === "anonymous" ? "bg-red-50/30 dark:bg-red-950/10" : ""}>
                        <TableCell className="font-medium text-sm">{link.resourceName ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={link.linkType === "anonymous" ? "destructive" : "outline"} className="text-[10px]">
                            {link.linkType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{link.linkScope ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{link.createdBy ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : "Never"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-red-600 hover:text-red-700"
                            onClick={() => revokeMutation.mutate(link.id)}
                            disabled={revokeMutation.isPending}
                          >
                            <Trash2 className="w-3 h-3 mr-1" /> Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
