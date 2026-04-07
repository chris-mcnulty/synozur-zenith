import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DollarSign,
  Key,
  AlertTriangle,
  TrendingDown,
  Search,
  Loader2,
  RefreshCw,
  Download,
  ShieldAlert,
  UserX,
  Users,
  Layers,
  CheckCircle2,
  XCircle,
  Eye,
} from "lucide-react";

// Types

interface Subscription {
  id: string;
  skuDisplayName: string;
  skuPartNumber: string;
  totalUnits: number;
  consumedUnits: number;
  costPerUnit: number | null;
}

interface Assignment {
  id: string;
  userDisplayName: string;
  userPrincipalName: string;
  department: string | null;
  jobTitle: string | null;
  skuDisplayName: string;
  skuId: string;
  accountEnabled: boolean;
  lastSignInDateTime: string | null;
}

interface AssignmentsResponse {
  items: Assignment[];
  total: number;
  page: number;
  pageSize: number;
}

interface Finding {
  id: string;
  type: "unassigned" | "disabled_account" | "inactive_user" | "overlapping";
  userDisplayName: string | null;
  userPrincipalName: string | null;
  skuDisplayName: string | null;
  description: string;
  estimatedMonthlySavings: number | null;
  status: "open" | "acknowledged" | "dismissed" | "resolved";
}

// Helpers

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}

function daysSince(date: string | null): number {
  if (!date) return 9999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

// Overview Tab

function OverviewTab({ tenantConnectionId }: { tenantConnectionId: string | undefined }) {
  const { toast } = useToast();
  const [editingPrices, setEditingPrices] = useState<Record<string, string>>({});

  const { data: subscriptions = [], isLoading } = useQuery<Subscription[]>({
    queryKey: ["/api/licensing/subscriptions", tenantConnectionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      const res = await fetch(`/api/licensing/subscriptions?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const priceMutation = useMutation({
    mutationFn: async ({ id, costPerUnit }: { id: string; costPerUnit: number }) => {
      const res = await fetch(`/api/licensing/subscriptions/${id}/price`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ costPerUnit }),
      });
      if (!res.ok) throw new Error("Failed to update price");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/licensing/subscriptions", tenantConnectionId] });
      toast({ title: "Price updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update price", description: err.message, variant: "destructive" });
    },
  });

  const handlePriceBlur = (sub: Subscription) => {
    const raw = editingPrices[sub.id];
    if (raw == null) return;
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed >= 0 && parsed !== (sub.costPerUnit ?? -1)) {
      priceMutation.mutate({ id: sub.id, costPerUnit: parsed });
    }
    setEditingPrices((prev) => {
      const next = { ...prev };
      delete next[sub.id];
      return next;
    });
  };

  const totalLicenses = subscriptions.reduce((s, sub) => s + sub.totalUnits, 0);
  const totalConsumed = subscriptions.reduce((s, sub) => s + sub.consumedUnits, 0);
  const totalUnassigned = totalLicenses - totalConsumed;
  const totalMonthlySpend = subscriptions.reduce(
    (s, sub) => s + (sub.costPerUnit ?? 0) * sub.totalUnits,
    0,
  );
  const estimatedWaste = subscriptions.reduce(
    (s, sub) => s + (sub.costPerUnit ?? 0) * (sub.totalUnits - sub.consumedUnits),
    0,
  );

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-panel border-border/50 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Monthly Spend</CardTitle>
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-20 bg-muted/40 animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(totalMonthlySpend)}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Licenses</CardTitle>
            <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Key className="w-4 h-4 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-20 bg-muted/40 animate-pulse rounded" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalConsumed.toLocaleString()} / {totalLicenses.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-1">consumed / total</div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unassigned Licenses</CardTitle>
            <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-20 bg-muted/40 animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold text-amber-500">{totalUnassigned.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50 shadow-sm">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Estimated Waste</CardTitle>
            <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-20 bg-muted/40 animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold text-red-500">{formatCurrency(estimatedWaste)}</div>
            )}
            <div className="text-xs text-muted-foreground mt-1">from unassigned licenses</div>
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions Table */}
      <Card className="glass-panel border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading subscriptions...
            </div>
          ) : subscriptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <Key className="h-10 w-10 opacity-30" />
              <p className="text-sm">No subscriptions found. Sync licenses to populate data.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-6">SKU Display Name</TableHead>
                  <TableHead>Part Number</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Unassigned</TableHead>
                  <TableHead>Cost/Unit</TableHead>
                  <TableHead className="pr-6">Monthly Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subscriptions.map((sub) => {
                  const unassigned = sub.totalUnits - sub.consumedUnits;
                  const costPerUnit = editingPrices[sub.id] != null
                    ? editingPrices[sub.id]
                    : sub.costPerUnit?.toFixed(2) ?? "";
                  const monthlyCost = (sub.costPerUnit ?? 0) * sub.totalUnits;
                  return (
                    <TableRow key={sub.id} className="hover:bg-muted/10 transition-colors">
                      <TableCell className="pl-6 font-medium">{sub.skuDisplayName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">{sub.skuPartNumber}</TableCell>
                      <TableCell>{sub.totalUnits.toLocaleString()}</TableCell>
                      <TableCell>{sub.consumedUnits.toLocaleString()}</TableCell>
                      <TableCell>
                        {unassigned > 0 ? (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-300">
                            {unassigned.toLocaleString()}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-24 h-8 text-sm"
                          placeholder="0.00"
                          value={costPerUnit}
                          onChange={(e) =>
                            setEditingPrices((prev) => ({ ...prev, [sub.id]: e.target.value }))
                          }
                          onBlur={() => handlePriceBlur(sub)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      </TableCell>
                      <TableCell className="pr-6 font-medium">{formatCurrency(monthlyCost)}</TableCell>
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

// Assignments Tab

function AssignmentsTab({ tenantConnectionId }: { tenantConnectionId: string | undefined }) {
  const [search, setSearch] = useState("");
  const [skuFilter, setSkuFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const { data, isLoading } = useQuery<AssignmentsResponse>({
    queryKey: ["/api/licensing/assignments", tenantConnectionId, search, skuFilter, statusFilter, activityFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      if (search) params.set("search", search);
      if (skuFilter !== "all") params.set("skuId", skuFilter);
      if (statusFilter !== "all") params.set("accountStatus", statusFilter);
      if (activityFilter !== "all") params.set("activity", activityFilter);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await fetch(`/api/licensing/assignments?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load assignments");
      return res.json();
    },
  });

  const { data: subscriptions = [] } = useQuery<Subscription[]>({
    queryKey: ["/api/licensing/subscriptions", tenantConnectionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      const res = await fetch(`/api/licensing/subscriptions?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const assignments = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
    if (search) params.set("search", search);
    if (skuFilter !== "all") params.set("skuId", skuFilter);
    if (statusFilter !== "all") params.set("accountStatus", statusFilter);
    if (activityFilter !== "all") params.set("activity", activityFilter);
    const res = await fetch(`/api/licensing/assignments/export?${params}`, { credentials: "include" });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "license-assignments.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const skuOptions = Array.from(
    new Map(subscriptions.map((s) => [s.id, { id: s.id, name: s.skuDisplayName }])).values(),
  );

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or UPN..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <Select value={skuFilter} onValueChange={(v) => { setSkuFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All SKUs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All SKUs</SelectItem>
            {skuOptions.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Account Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            <SelectItem value="enabled">Enabled</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activityFilter} onValueChange={(v) => { setActivityFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Activity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Activity</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive 90d+</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" className="gap-2 shadow-sm" onClick={handleExport}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Table */}
      <Card className="glass-panel border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading assignments...
            </div>
          ) : assignments.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <Users className="h-10 w-10 opacity-30" />
              <p className="text-sm">No license assignments found.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-6">User</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>License</TableHead>
                  <TableHead>Account Status</TableHead>
                  <TableHead className="pr-6">Last Sign-In</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => {
                  const inactive = daysSince(a.lastSignInDateTime) >= 90;
                  const rowClass = !a.accountEnabled
                    ? "bg-red-500/5 hover:bg-red-500/10"
                    : inactive
                      ? "bg-amber-500/5 hover:bg-amber-500/10"
                      : "hover:bg-muted/10";
                  return (
                    <TableRow key={a.id} className={`${rowClass} transition-colors`}>
                      <TableCell className="pl-6">
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{a.userDisplayName}</span>
                          <span className="text-xs text-muted-foreground">{a.userPrincipalName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.department ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.jobTitle ?? "—"}</TableCell>
                      <TableCell className="text-sm">{a.skuDisplayName}</TableCell>
                      <TableCell>
                        {a.accountEnabled ? (
                          <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-[10px]">
                            <CheckCircle2 className="w-2.5 h-2.5 mr-0.5" />Enabled
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 text-[10px]">
                            <XCircle className="w-2.5 h-2.5 mr-0.5" />Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="pr-6 text-sm text-muted-foreground">
                        {a.lastSignInDateTime
                          ? new Date(a.lastSignInDateTime).toLocaleDateString()
                          : "Never"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total.toLocaleString()}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Optimization Tab

function OptimizationTab({ tenantConnectionId }: { tenantConnectionId: string | undefined }) {
  const { toast } = useToast();

  const { data: findings = [], isLoading } = useQuery<Finding[]>({
    queryKey: ["/api/licensing/optimization/findings", tenantConnectionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      const res = await fetch(`/api/licensing/optimization/findings?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      const res = await fetch(`/api/licensing/optimization/findings/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: action }),
      });
      if (!res.ok) throw new Error(`Failed to ${action} finding`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/licensing/optimization/findings", tenantConnectionId] });
      toast({ title: "Finding updated" });
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  const countByType = (type: Finding["type"]) => findings.filter((f) => f.type === type).length;

  const typeLabel: Record<Finding["type"], string> = {
    unassigned: "Unassigned Licenses",
    disabled_account: "Disabled Accounts",
    inactive_user: "Inactive Users",
    overlapping: "Overlapping Licenses",
  };

  const typeIcon: Record<Finding["type"], typeof AlertTriangle> = {
    unassigned: Key,
    disabled_account: UserX,
    inactive_user: Users,
    overlapping: Layers,
  };

  const typeColor: Record<Finding["type"], string> = {
    unassigned: "amber",
    disabled_account: "red",
    inactive_user: "blue",
    overlapping: "purple",
  };

  const statusBadge = (status: Finding["status"]) => {
    switch (status) {
      case "open":
        return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]">Open</Badge>;
      case "acknowledged":
        return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-[10px]">Acknowledged</Badge>;
      case "dismissed":
        return <Badge variant="outline" className="text-muted-foreground border-border bg-muted/30 text-[10px]">Dismissed</Badge>;
      case "resolved":
        return <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-[10px]">Resolved</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(["unassigned", "disabled_account", "inactive_user", "overlapping"] as Finding["type"][]).map((type) => {
          const Icon = typeIcon[type];
          const color = typeColor[type];
          return (
            <Card key={type} className="glass-panel border-border/50 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">{typeLabel[type]}</CardTitle>
                <div className={`w-8 h-8 rounded-full bg-${color}-500/10 flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 text-${color}-500`} />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-8 w-12 bg-muted/40 animate-pulse rounded" />
                ) : (
                  <div className="text-2xl font-bold">{countByType(type)}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Findings Table */}
      <Card className="glass-panel border-border/50">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading optimization findings...
            </div>
          ) : findings.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
              <ShieldAlert className="h-10 w-10 opacity-30" />
              <p className="text-sm">No optimization findings. Sync licenses and run analysis to detect savings.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-6">Type</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>License</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Est. Savings</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findings.map((f) => (
                  <TableRow key={f.id} className="hover:bg-muted/10 transition-colors">
                    <TableCell className="pl-6">
                      <Badge variant="outline" className="text-[10px]">{typeLabel[f.type]}</Badge>
                    </TableCell>
                    <TableCell>
                      {f.userDisplayName ? (
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">{f.userDisplayName}</span>
                          <span className="text-xs text-muted-foreground">{f.userPrincipalName}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{f.skuDisplayName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">{f.description}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {f.estimatedMonthlySavings != null ? (
                        <span className="text-emerald-600">{formatCurrency(f.estimatedMonthlySavings)}/mo</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(f.status)}</TableCell>
                    <TableCell className="pr-6">
                      {f.status === "open" && (
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => actionMutation.mutate({ id: f.id, action: "acknowledge" })}
                            disabled={actionMutation.isPending}
                          >
                            <Eye className="w-3 h-3 mr-1" />
                            Acknowledge
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => actionMutation.mutate({ id: f.id, action: "dismiss" })}
                            disabled={actionMutation.isPending}
                          >
                            <XCircle className="w-3 h-3 mr-1" />
                            Dismiss
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-emerald-600"
                            onClick={() => actionMutation.mutate({ id: f.id, action: "resolve" })}
                            disabled={actionMutation.isPending}
                          >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Resolve
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Main Page

export default function LicensingPage() {
  const { selectedTenant, isFeatureEnabled } = useTenant();
  const { toast } = useToast();
  const tenantConnectionId = selectedTenant?.id;
  const featureDisabled = !isFeatureEnabled?.("licensing");

  if (featureDisabled) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-muted-foreground" />
              Licensing unavailable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              The Licensing feature is not enabled for the selected tenant.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (featureDisabled) throw new Error("Licensing is not enabled for the selected tenant");
      if (!tenantConnectionId) throw new Error("No tenant selected");
      const res = await fetch("/api/licensing/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantConnectionId }),
      });
      if (!res.ok) throw new Error("Failed to start license sync");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "License sync started", description: "Fetching subscription and assignment data from Microsoft 365..." });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/licensing/subscriptions", tenantConnectionId] });
        queryClient.invalidateQueries({ queryKey: ["/api/licensing/assignments", tenantConnectionId] });
        queryClient.invalidateQueries({ queryKey: ["/api/licensing/optimization/findings", tenantConnectionId] });
      }, 8000);
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Licensing</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Microsoft 365 license inventory, assignments, and cost optimization.
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !tenantConnectionId}
        >
          {syncMutation.isPending ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Syncing...</>
          ) : (
            <><RefreshCw className="mr-2 h-4 w-4" />Sync Licenses</>
          )}
        </Button>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted/50 border border-border/50 p-1">
          <TabsTrigger value="overview" className="rounded-md data-[state=active]:shadow-sm">
            Overview
          </TabsTrigger>
          <TabsTrigger value="assignments" className="rounded-md data-[state=active]:shadow-sm">
            Assignments
          </TabsTrigger>
          <TabsTrigger value="optimization" className="rounded-md data-[state=active]:shadow-sm">
            Optimization
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab tenantConnectionId={tenantConnectionId} />
        </TabsContent>

        <TabsContent value="assignments" className="space-y-6">
          <AssignmentsTab tenantConnectionId={tenantConnectionId} />
        </TabsContent>

        <TabsContent value="optimization" className="space-y-6">
          <OptimizationTab tenantConnectionId={tenantConnectionId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
