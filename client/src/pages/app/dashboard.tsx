import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  ShieldCheck, 
  AlertTriangle, 
  FolderPlus, 
  Clock, 
  ArrowUpRight,
  Database,
  Users,
  Lock
} from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useServicePlan } from "@/hooks/use-service-plan";

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

  const { plan, isTrial, canWriteBack, features } = useServicePlan();

  const totalWorkspaces = stats?.totalWorkspaces ?? 0;
  const metadataCompliance = totalWorkspaces > 0 ? Math.round((stats!.metadataComplete / totalWorkspaces) * 100) : 0;
  const copilotReadiness = totalWorkspaces > 0 ? Math.round((stats!.copilotReady / totalWorkspaces) * 100) : 0;
  const pendingApprovals = stats?.pendingRequests ?? 0;

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
          <p className="text-muted-foreground mt-1">Governance overview for The Synozur Alliance (PROD)</p>
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
            <div className="text-3xl font-bold" data-testid="text-total-workspaces">{isLoading ? "..." : totalWorkspaces.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center">
              <span className="text-emerald-500 font-medium flex items-center mr-1">
                <ArrowUpRight className="w-3 h-3 mr-1"/> 12%
              </span> 
              from last month
            </p>
          </CardContent>
        </Card>
        
        <Card className="glass-panel hover:border-primary/30 transition-colors cursor-default">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Metadata Compliance</CardTitle>
            <ShieldCheck className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-metadata-compliance">{isLoading ? "..." : `${metadataCompliance}%`}</div>
            <Progress value={isLoading ? 0 : metadataCompliance} className="h-2 mt-3 bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all duration-1000 ease-in-out" style={{ width: isLoading ? "0%" : `${metadataCompliance}%` }} />
            </Progress>
          </CardContent>
        </Card>

        <Card className="glass-panel hover:border-primary/30 transition-colors cursor-default border-amber-500/20 shadow-amber-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Approvals</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500" data-testid="text-pending-approvals">{isLoading ? "..." : pendingApprovals}</div>
            <p className="text-xs text-muted-foreground mt-1 text-amber-500/80 font-medium">
              Requires attention
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel hover:border-primary/30 transition-colors cursor-default">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">External Guests</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">342</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across 56 workspaces
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
                {[
                  { title: "Missing Required Metadata", count: 12, desc: "Workspaces missing Department tag", urgency: "High" },
                  { title: "Inactive Owners", count: 5, desc: "Teams with less than 2 active owners", urgency: "Medium" },
                  { title: "Naming Policy Violations", count: 3, desc: "Manually created groups violating prefix rule", urgency: "Low" }
                ].map((alert, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-card border border-border hover:border-destructive/30 transition-colors">
                    <div>
                      <h4 className="font-semibold text-sm">{alert.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{alert.desc}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={alert.urgency === 'High' ? 'destructive' : 'secondary'} className={alert.urgency === 'High' ? 'shadow-sm shadow-destructive/20' : ''}>
                        {alert.count} items
                      </Badge>
                      <Button variant="ghost" size="sm" className="text-xs h-8">Review</Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Event-driven updates from Microsoft Graph.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {[
                  { action: "Workspace Provisioned", target: "Project Phoenix (Teams)", time: "10 mins ago", type: "system", dot: "bg-emerald-500" },
                  { action: "Sensitivity Label Applied", target: "HR Confidential (SharePoint)", time: "1 hour ago", type: "user", dot: "bg-blue-500" },
                  { action: "Lifecycle Archived", target: "2023 Marketing Campaign", time: "3 hours ago", type: "system", dot: "bg-purple-500" },
                ].map((log, i) => (
                  <div key={i} className="flex items-start gap-4 p-4 rounded-xl border border-border/50 bg-card/50 shadow-sm transition-all hover:bg-card hover:border-border group">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-background border border-border mt-1">
                      <div className={`w-2 h-2 rounded-full ${log.dot} shadow-[0_0_8px_rgba(var(--primary),0.8)]`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-1">
                        <div className="font-semibold text-sm">{log.action}</div>
                        <time className="font-mono text-xs text-muted-foreground">{log.time}</time>
                      </div>
                      <div className="text-sm text-muted-foreground">{log.target}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <Button variant="outline" className="w-full text-muted-foreground rounded-full">View Full Audit Log</Button>
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
              <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50">
                <span className="text-sm font-medium">Graph Webhook</span>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1.5 px-2 py-0.5 shadow-sm shadow-emerald-500/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Connected
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50">
                <span className="text-sm font-medium">Purview Sync</span>
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1.5 px-2 py-0.5 shadow-sm shadow-emerald-500/10">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/50">
                <span className="text-sm font-medium">Last Event</span>
                <span className="text-sm font-mono text-muted-foreground">2 mins ago</span>
              </div>
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
                <span className="text-4xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary" data-testid="text-copilot-readiness">{isLoading ? "..." : `${copilotReadiness}%`}</span>
                <span className="text-sm text-muted-foreground mb-1 font-medium">of workspaces</span>
              </div>
              <Progress value={isLoading ? 0 : copilotReadiness} className="h-2.5 mb-5 bg-muted overflow-hidden rounded-full">
                <div className="h-full bg-gradient-to-r from-primary to-secondary transition-all duration-1000 ease-in-out" style={{ width: isLoading ? "0%" : `${copilotReadiness}%` }} />
              </Progress>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Workspaces meeting minimum classification and external sharing policies required for secure Copilot indexing.
              </p>
              <Button variant="link" className="px-0 mt-4 text-primary font-medium">View detailed report →</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}