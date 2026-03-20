import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  HardDrive,
  Search,
  Loader2,
  Users,
  AlertTriangle,
  CheckCircle2,
  Cloud,
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

export default function OneDriveInventoryPage() {
  const [search, setSearch] = useState("");

  const { data: drives = [], isLoading } = useQuery<OneDriveItem[]>({
    queryKey: ["/api/onedrive-inventory", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      const res = await fetch(`/api/onedrive-inventory?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load OneDrive inventory");
      return res.json();
    },
  });

  const provisionedCount = drives.filter(d => d.driveId).length;
  const notProvisionedCount = drives.filter(d => !d.driveId).length;
  const totalUsed = drives.reduce((s, d) => s + (d.quotaUsedBytes ?? 0), 0);
  const totalAllocated = drives.reduce((s, d) => s + (d.quotaTotalBytes ?? 0), 0);
  const criticalCount = drives.filter(d => d.quotaState === "critical" || d.quotaState === "exceeded").length;
  const departments = new Set(drives.map(d => d.userDepartment).filter(Boolean));

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <HardDrive className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">OneDrive Inventory</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Full inventory of OneDrive for Business drives across connected tenants.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Users</p>
            <p className="text-2xl font-bold">{drives.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Provisioned</p>
            <p className="text-2xl font-bold text-emerald-600">{provisionedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">No Drive</p>
            <p className="text-2xl font-bold text-muted-foreground">{notProvisionedCount}</p>
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
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Critical/Exceeded</p>
            <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, UPN, or department..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading OneDrive inventory...
            </div>
          ) : drives.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <HardDrive className="h-10 w-10 opacity-30" />
              <p className="text-sm">No OneDrives discovered yet. Run an inventory sync from the tenant admin page.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Usage %</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drives.map(d => {
                  const pct = usagePercent(d.quotaUsedBytes, d.quotaTotalBytes);
                  return (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{d.userDisplayName ?? "—"}</span>
                          <span className="text-xs text-muted-foreground">{d.userPrincipalName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.userDepartment ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{d.userJobTitle ?? "—"}</TableCell>
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
                      <TableCell>{quotaStateBadge(d.quotaState)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
