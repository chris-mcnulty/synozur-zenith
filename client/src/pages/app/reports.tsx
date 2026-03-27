import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  Download, 
  TrendingUp, 
  Users, 
  Activity,
  Globe,
  Database,
  ShieldCheck,
  PieChart,
  Loader2,
  Building2,
  FolderOpen,
  AlertCircle,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { useTenant } from "@/lib/tenant-context";

type Workspace = {
  id: string;
  type: string;
  projectType: string;
  department: string | null;
  siteOwners: Array<{ displayName: string }> | null;
  lastActivityDate: string | null;
  externalSharing: boolean;
  sensitivity: string;
};

type Policy = { id: string; name: string; isActive: boolean };

const daysSince = (date: string | null): number => {
  if (!date) return 9999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
};

export default function ReportsPage() {
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id;

  const { data: workspaces = [], isLoading: loadingWs } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces", tenantConnectionId, "reports"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      const res = await fetch(`/api/workspaces?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });

  const { data: policies = [], isLoading: loadingPolicies } = useQuery<Policy[]>({
    queryKey: ["/api/policies"],
    queryFn: () => fetch("/api/policies", { credentials: "include" }).then(r => r.ok ? r.json() : []),
  });

  const isLoading = loadingWs || loadingPolicies;

  const total = workspaces.length;
  const activePolicies = policies.filter(p => p.isActive).length;
  const activeWorkspaces = workspaces.filter(w => daysSince(w.lastActivityDate) < 90).length;
  const orphaned = workspaces.filter(w => {
    const owners = Array.isArray(w.siteOwners) ? w.siteOwners : [];
    return owners.length === 0;
  }).length;

  const byType = [
    { label: "Team Sites", key: "TEAM_SITE", color: "bg-blue-500" },
    { label: "Communication Sites", key: "COMMUNICATION_SITE", color: "bg-teal-500" },
    { label: "Hub Sites", key: "HUB_SITE", color: "bg-indigo-500" },
  ].map(t => ({
    ...t,
    count: workspaces.filter(w => w.type === t.key).length,
    pct: total > 0 ? Math.round((workspaces.filter(w => w.type === t.key).length / total) * 100) : 0,
  }));

  const byProject = [
    { label: "Deal Sites", key: "DEAL", color: "bg-emerald-500" },
    { label: "Portfolio Company Sites", key: "PORTCO", color: "bg-amber-500" },
    { label: "General Sites", key: "GENERAL", color: "bg-muted-foreground" },
  ].map(t => ({
    ...t,
    count: workspaces.filter(w => w.projectType === t.key).length,
    pct: total > 0 ? Math.round((workspaces.filter(w => w.projectType === t.key).length / total) * 100) : 0,
  }));

  const byDepartment = Array.from(
    workspaces.reduce((map, w) => {
      const dept = w.department || "Unclassified";
      if (!map.has(dept)) map.set(dept, { dept, count: 0, withOwners: 0, external: 0, active: 0 });
      const entry = map.get(dept)!;
      entry.count++;
      if ((Array.isArray(w.siteOwners) ? w.siteOwners : []).length >= 2) entry.withOwners++;
      if (w.externalSharing) entry.external++;
      if (daysSince(w.lastActivityDate) < 90) entry.active++;
      return map;
    }, new Map<string, { dept: string; count: number; withOwners: number; external: number; active: number }>())
  )
    .map(([, v]) => v)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const complianceRate = total > 0 ? Math.round((activeWorkspaces / total) * 100) : 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Telemetry</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Live governance metrics and workspace analytics across your managed M365 environment.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="outline" className="gap-2 shadow-sm" disabled>
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted/50 border border-border/50 p-1">
          <TabsTrigger value="overview" className="rounded-md data-[state=active]:shadow-sm" data-testid="tab-overview">Platform Overview</TabsTrigger>
          <TabsTrigger value="breakdown" className="rounded-md data-[state=active]:shadow-sm" data-testid="tab-breakdown">Workspace Breakdown</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="glass-panel border-border/50 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Managed Workspaces</CardTitle>
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading
                  ? <div className="h-8 w-20 bg-muted/40 animate-pulse rounded" />
                  : <div className="text-2xl font-bold" data-testid="stat-total-workspaces">{total.toLocaleString()}</div>}
                <div className="flex items-center gap-1 mt-1 text-xs font-medium text-muted-foreground">
                  {!isLoading && <span>{activeWorkspaces.toLocaleString()} active in last 90 days</span>}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-border/50 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Policies</CardTitle>
                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-purple-500" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading
                  ? <div className="h-8 w-20 bg-muted/40 animate-pulse rounded" />
                  : <div className="text-2xl font-bold" data-testid="stat-active-policies">{activePolicies}</div>}
                <div className="text-xs text-muted-foreground mt-1">
                  {!isLoading && <span>{policies.length} total policies defined</span>}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-border/50 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Activity Rate</CardTitle>
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading
                  ? <div className="h-8 w-20 bg-muted/40 animate-pulse rounded" />
                  : <div className="text-2xl font-bold" data-testid="stat-activity-rate">{complianceRate}%</div>}
                <div className="text-xs text-muted-foreground mt-1">Active in last 90 days</div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-border/50 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Orphaned Workspaces</CardTitle>
                <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading
                  ? <div className="h-8 w-20 bg-muted/40 animate-pulse rounded" />
                  : <div className="text-2xl font-bold text-red-500" data-testid="stat-orphaned">{orphaned}</div>}
                <div className="text-xs text-muted-foreground mt-1">No owners assigned in Entra ID</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="glass-panel border-border/50 shadow-xl lg:col-span-2">
              <CardHeader className="pb-4 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <PieChart className="w-5 h-5 text-primary" />
                      Workspace Type Distribution
                    </CardTitle>
                    <CardDescription>Live breakdown of your managed M365 site inventory by site type</CardDescription>
                  </div>
                  {!isLoading && <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary">{total} Total Sites</Badge>}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading workspace data...
                  </div>
                ) : total === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                    <Database className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No workspaces synced yet.</p>
                    <p className="text-xs text-muted-foreground/70">Run a tenant sync to populate workspace analytics.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">By Site Type</p>
                      <div className="space-y-4">
                        {byType.map(t => (
                          <div key={t.key} className="space-y-1.5" data-testid={`dist-type-${t.key}`}>
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2">
                                <div className={`w-2.5 h-2.5 rounded-full ${t.color}`} />
                                <span className="font-medium">{t.label}</span>
                              </div>
                              <div className="flex items-center gap-2 text-muted-foreground">
                                <span>{t.count.toLocaleString()}</span>
                                <span className="text-xs font-bold text-foreground">{t.pct}%</span>
                              </div>
                            </div>
                            <Progress value={t.pct} className={`h-2 bg-muted [&>div]:${t.color}`} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-border/40 pt-4">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">By Project Context</p>
                      <div className="grid grid-cols-3 gap-3">
                        {byProject.map(p => (
                          <div key={p.key} className="text-center p-3 rounded-lg bg-muted/30 border border-border/40" data-testid={`dist-project-${p.key}`}>
                            <div className="text-xl font-bold">{p.count}</div>
                            <div className="text-xs text-muted-foreground mt-1">{p.label}</div>
                            <Badge variant="outline" className="mt-1 text-[10px]">{p.pct}%</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Governance Health
                  </CardTitle>
                  <CardDescription className="text-xs">Key compliance indicators</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Activity Coverage</span>
                      <span className="text-muted-foreground">{isLoading ? "—" : `${complianceRate}%`}</span>
                    </div>
                    <Progress value={complianceRate} className="h-2 bg-blue-500/10 [&>div]:bg-blue-500" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Ownership Coverage</span>
                      <span className="text-muted-foreground">
                        {isLoading ? "—" : total > 0 ? `${Math.round(((total - orphaned) / total) * 100)}%` : "—"}
                      </span>
                    </div>
                    <Progress
                      value={total > 0 ? Math.round(((total - orphaned) / total) * 100) : 0}
                      className="h-2 bg-emerald-500/10 [&>div]:bg-emerald-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">External Sharing</span>
                      <span className="text-muted-foreground">
                        {isLoading ? "—" : total > 0 ? `${Math.round((workspaces.filter(w => w.externalSharing).length / total) * 100)}%` : "—"}
                      </span>
                    </div>
                    <Progress
                      value={total > 0 ? Math.round((workspaces.filter(w => w.externalSharing).length / total) * 100) : 0}
                      className="h-2 bg-amber-500/10 [&>div]:bg-amber-500"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {byDepartment.length > 0 && (
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="w-5 h-5 text-primary" />
                  Departmental Workspace Distribution
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Department</TableHead>
                      <TableHead>Workspaces</TableHead>
                      <TableHead>Dual-Owner Coverage</TableHead>
                      <TableHead>External Sharing</TableHead>
                      <TableHead className="pr-6">Active (90d)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byDepartment.map((dept) => (
                      <TableRow key={dept.dept} className="hover:bg-muted/10 transition-colors" data-testid={`row-dept-${dept.dept}`}>
                        <TableCell className="pl-6 font-medium">{dept.dept}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-muted/30 font-mono">{dept.count}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full ${dept.withOwners / dept.count > 0.8 ? "bg-emerald-500" : dept.withOwners / dept.count > 0.5 ? "bg-amber-500" : "bg-red-500"}`}
                                style={{ width: `${Math.round((dept.withOwners / dept.count) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {Math.round((dept.withOwners / dept.count) * 100)}%
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {dept.external > 0
                            ? <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">{dept.external}</Badge>
                            : <span className="text-muted-foreground/40 text-sm">—</span>}
                        </TableCell>
                        <TableCell className="pr-6">
                          <div className="flex items-center gap-1.5">
                            <TrendingUp className={`w-3.5 h-3.5 ${dept.active / dept.count > 0.7 ? "text-emerald-500" : "text-muted-foreground"}`} />
                            <span className="text-sm">{dept.active} / {dept.count}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-6">
          <Card className="glass-panel border-border/50">
            {isLoading ? (
              <CardContent className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading workspace data...
              </CardContent>
            ) : total === 0 ? (
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <FolderOpen className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No workspace data available.</p>
                <p className="text-xs text-muted-foreground/70">Select a tenant and run a sync to see analytics.</p>
              </CardContent>
            ) : (
              <>
                <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    Sensitivity Label Coverage
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {(["HIGHLY_CONFIDENTIAL", "CONFIDENTIAL", "INTERNAL", "PUBLIC"] as const).map(label => {
                      const count = workspaces.filter(w => w.sensitivity === label).length;
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      const colorMap: Record<string, string> = {
                        HIGHLY_CONFIDENTIAL: "bg-red-500",
                        CONFIDENTIAL: "bg-amber-500",
                        INTERNAL: "bg-blue-500",
                        PUBLIC: "bg-emerald-500",
                      };
                      const labelMap: Record<string, string> = {
                        HIGHLY_CONFIDENTIAL: "Highly Confidential",
                        CONFIDENTIAL: "Confidential",
                        INTERNAL: "Internal",
                        PUBLIC: "Public",
                      };
                      return (
                        <div key={label} className="space-y-1.5" data-testid={`dist-sensitivity-${label}`}>
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <div className={`w-2.5 h-2.5 rounded-full ${colorMap[label]}`} />
                              <span className="font-medium">{labelMap[label]}</span>
                            </div>
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span>{count.toLocaleString()} sites</span>
                              <span className="text-xs font-bold text-foreground w-10 text-right">{pct}%</span>
                            </div>
                          </div>
                          <Progress value={pct} className={`h-2.5 bg-muted [&>div]:${colorMap[label]}`} />
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
