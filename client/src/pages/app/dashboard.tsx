import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ShieldCheck, 
  AlertTriangle, 
  FolderPlus, 
  Clock, 
  ArrowUpRight,
  Database,
  Lock,
  Wifi
} from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useServicePlan } from "@/hooks/use-service-plan";

type AlertItem = {
  title: string;
  count: number;
  desc: string;
  urgency: string;
};

type ActivityEntry = {
  id: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  userEmail?: string | null;
  result: string;
  createdAt: string | null;
};

type TenantStatus = {
  id: string;
  tenantName: string;
  domain: string;
  status: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
};

type DashboardData = {
  alerts: AlertItem[];
  recentActivity: ActivityEntry[];
  serviceStatus: TenantStatus[];
  activeTenantsCount: number;
};

type Organization = {
  id: string;
  name: string;
  domain: string;
  servicePlan: string;
};

function humaniseAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "Unknown time";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffSecs < 60) return "just now";
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
}

function tenantStatusBadge(status: string) {
  if (status === "ACTIVE") {
    return (
      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1.5 px-2 py-0.5 shadow-sm shadow-emerald-500/10">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
        Active
      </Badge>
    );
  }
  if (status === "PENDING") {
    return (
      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 gap-1.5 px-2 py-0.5">
        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        Pending
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1.5 px-2 py-0.5">
      <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
      {status}
    </Badge>
  );
}

function activityDotColor(result: string): string {
  if (result === "SUCCESS") return "bg-emerald-500";
  if (result === "FAILURE") return "bg-destructive";
  return "bg-blue-500";
}

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<{
    totalWorkspaces: number;
    copilotReady: number;
    copilotNotReady: number;
    metadataComplete: number;
    metadataMissing: number;
    highlyConfidential: number;
    pendingRequests: number;
    totalRequests: number;
  }>({ queryKey: ["/api/stats"] });

  const { data: dashData, isLoading: isDashLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  const { data: org } = useQuery<Organization>({
    queryKey: ["/api/organization"],
  });

  const { isTrial } = useServicePlan();

  const totalWorkspaces = stats?.totalWorkspaces ?? 0;
  const metadataCompliance = totalWorkspaces > 0 ? Math.round((stats!.metadataComplete / totalWorkspaces) * 100) : 0;
  const copilotReadiness = totalWorkspaces > 0 ? Math.round((stats!.copilotReady / totalWorkspaces) * 100) : 0;
  const pendingApprovals = stats?.pendingRequests ?? 0;

  const orgName = org?.name ?? "your organisation";
  const activeTenantsCount = dashData?.activeTenantsCount ?? 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      {isTrial && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between" data-testid="banner-trial">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Lock className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Trial Plan Active</p>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/70">Read-only mode: inventory sync and governance views are available. Microsoft 365 write-back (provisioning, site creation) requires a Standard plan or higher.</p>
            </div>
          </div>
          <Link href="/app/admin/service-plans">
            <Button size="sm" className="gap-1.5 shrink-0 shadow-sm">
              View Plans <ArrowUpRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-1" data-testid="text-org-subtitle">
            Governance overview for {orgName}
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/app/provision/new">
            <Button className="gap-2 rounded-full shadow-md shadow-primary/20">
              <FolderPlus className="w-4 h-4" />
              New Workspace
            </Button>
          </Link>
        </div>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="glass-panel hover:border-primary/30 transition-colors cursor-default">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Workspaces</CardTitle>
            <Database className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-workspaces">{isLoading ? <Skeleton className="h-9 w-20" /> : totalWorkspaces.toLocaleString()}</div>
          </CardContent>
        </Card>
        
        <Card className="glass-panel hover:border-primary/30 transition-colors cursor-default">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Metadata Compliance</CardTitle>
            <ShieldCheck className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-metadata-compliance">{isLoading ? <Skeleton className="h-9 w-16" /> : `${metadataCompliance}%`}</div>
            {isLoading ? <Skeleton className="h-2 mt-3" /> : (
              <Progress value={metadataCompliance} className="h-2 mt-3 bg-muted overflow-hidden [&>div]:bg-primary" />
            )}
          </CardContent>
        </Card>

        <Card className="glass-panel hover:border-primary/30 transition-colors cursor-default border-amber-500/20 shadow-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500" data-testid="text-pending-approvals">{isLoading ? <Skeleton className="h-9 w-12" /> : pendingApprovals}</div>
            <p className="text-xs text-muted-foreground mt-1 text-amber-500/80 font-medium">
              Requires attention
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel hover:border-primary/30 transition-colors cursor-default">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Connected Tenants</CardTitle>
            <Wifi className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-connected-tenants">{isDashLoading ? <Skeleton className="h-9 w-12" /> : activeTenantsCount}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Active tenant connections
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Alerts & Lifecycle */}
        <div className="lg:col-span-2 space-y-8">
          <Card className="border-destructive/30 shadow-lg shadow-destructive/5 glass-panel">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <CardTitle>Governance Alerts</CardTitle>
              </div>
              <CardDescription>Items requiring immediate administrator action.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isDashLoading ? (
                  <div className="space-y-4">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-border">
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-40" />
                          <Skeleton className="h-3 w-64" />
                        </div>
                        <Skeleton className="h-6 w-16 ml-4 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : (dashData?.alerts ?? []).map((alert, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-card border border-border hover:border-destructive/30 transition-colors" data-testid={`alert-item-${i}`}>
                    <div>
                      <h4 className="font-semibold text-sm">{alert.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{alert.desc}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={alert.urgency === "High" ? "destructive" : "secondary"} className={alert.urgency === "High" ? "shadow-sm shadow-destructive/20" : ""} data-testid={`badge-alert-count-${i}`}>
                        {alert.count} items
                      </Badge>
                      <Link href="/app/governance">
                        <Button variant="ghost" size="sm" className="text-xs h-8" data-testid={`button-review-alert-${i}`}>Review</Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Latest audit log entries for your organisation.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {isDashLoading ? (
                  <div className="space-y-6">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-border/50">
                        <Skeleton className="w-8 h-8 rounded-full shrink-0 mt-1" />
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center justify-between">
                            <Skeleton className="h-4 w-36" />
                            <Skeleton className="h-3 w-16" />
                          </div>
                          <Skeleton className="h-3 w-56" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (dashData?.recentActivity ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">No recent activity found.</p>
                ) : (dashData?.recentActivity ?? []).map((entry) => (
                  <div key={entry.id} className="flex items-start gap-4 p-4 rounded-xl border border-border/50 bg-card/50 shadow-sm transition-all hover:bg-card hover:border-border group" data-testid={`activity-entry-${entry.id}`}>
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background border border-border mt-1">
                      <div className={`w-2 h-2 rounded-full ${activityDotColor(entry.result)} shadow-[0_0_8px_rgba(var(--primary),0.8)]`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                        <div className="font-semibold text-sm">{humaniseAction(entry.action)}</div>
                        <time className="font-mono text-xs text-muted-foreground">{relativeTime(entry.createdAt)}</time>
                      </div>
                      <div className="text-sm text-muted-foreground">{entry.resource}{entry.userEmail ? ` · ${entry.userEmail}` : ""}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <Link href="/app/admin/audit-log">
                  <Button variant="outline" className="w-full text-muted-foreground rounded-full" data-testid="button-view-audit-log">View Full Audit Log</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Service Info & Quick Links */}
        <div className="space-y-8">
          <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/20 shadow-lg shadow-primary/5">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                Service Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isDashLoading ? (
                <div className="space-y-4">
                  {[0, 1].map((i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex items-center justify-between p-3 rounded-lg border border-border/50">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-5 w-16 rounded-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (dashData?.serviceStatus ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No tenant connections configured.</p>
              ) : (dashData?.serviceStatus ?? []).map((tenant) => (
                <div key={tenant.id} className="space-y-2" data-testid={`service-tenant-${tenant.id}`}>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50">
                    <span className="text-sm font-medium truncate max-w-[55%]">{tenant.tenantName}</span>
                    {tenantStatusBadge(tenant.status)}
                  </div>
                  {tenant.lastSyncAt && (
                    <div className="flex items-center justify-between px-3 text-xs text-muted-foreground">
                      <span>Last sync</span>
                      <span className="font-mono">{relativeTime(tenant.lastSyncAt)}{tenant.lastSyncStatus ? ` · ${tenant.lastSyncStatus}` : ""}</span>
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="glass-panel relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader>
              <CardTitle className="text-lg">Copilot Readiness</CardTitle>
              <CardDescription>Based on metadata and policies</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between mb-3">
                <span className="text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary" data-testid="text-copilot-readiness">{isLoading ? <Skeleton className="h-10 w-20" /> : `${copilotReadiness}%`}</span>
                <span className="text-sm text-muted-foreground mb-1 font-medium">of workspaces</span>
              </div>
              {isLoading ? <Skeleton className="h-2.5 mb-5 rounded-full" /> : (
                <Progress
                  value={copilotReadiness}
                  className="h-2.5 mb-5 bg-muted overflow-hidden rounded-full [&>div]:bg-gradient-to-r [&>div]:from-primary [&>div]:to-secondary"
                />
              )}
              <p className="text-sm text-muted-foreground leading-relaxed">
                Workspaces meeting minimum classification and external sharing policies required for secure Copilot indexing.
              </p>
              <Link href="/app/governance">
                <Button variant="link" className="px-0 mt-4 text-primary font-medium" data-testid="button-copilot-report">View detailed report →</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
