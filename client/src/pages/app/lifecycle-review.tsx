import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Clock, 
  Search, 
  Users, 
  Globe, 
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Archive,
  CalendarDays,
  ShieldAlert,
  ArrowRight,
  Building2,
  Loader2,
  UserX,
  Share2,
} from "lucide-react";
import { useTenant } from "@/lib/tenant-context";

type Workspace = {
  id: string;
  displayName: string;
  siteUrl: string | null;
  type: string;
  projectType: string;
  lastActivityDate: string | null;
  externalSharing: boolean;
  siteOwners: Array<{ id?: string; displayName: string; mail?: string }> | null;
  department: string | null;
  sensitivity: string;
};

const daysSince = (date: string | null): number => {
  if (!date) return 9999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
};

const activityScore = (date: string | null): number => {
  const d = daysSince(date);
  if (d >= 365) return 0;
  return Math.max(0, Math.round(100 - (d / 365) * 100));
};

const dueLabel = (d: number): string => {
  if (d >= 180) return `${d - 180}d overdue`;
  if (d >= 90) return `Due in ${180 - d}d`;
  return "Active";
};

const typeIcon = (type: string) => {
  switch (type) {
    case "TEAM_SITE": return <Users className="w-4 h-4 text-blue-500" />;
    case "COMMUNICATION_SITE": return <Globe className="w-4 h-4 text-teal-500" />;
    case "HUB_SITE": return <Building2 className="w-4 h-4 text-indigo-500" />;
    default: return <FolderOpen className="w-4 h-4 text-muted-foreground" />;
  }
};

const typeLabel = (type: string): string => {
  switch (type) {
    case "TEAM_SITE": return "Team Site";
    case "COMMUNICATION_SITE": return "Communication Site";
    case "HUB_SITE": return "Hub Site";
    default: return type.replace(/_/g, " ");
  }
};

export default function LifecycleReviewHub() {
  const [searchTerm, setSearchTerm] = useState("");
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id;

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces", tenantConnectionId, "lifecycle"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      const res = await fetch(`/api/workspaces?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: true,
  });

  const stats = useMemo(() => {
    const overdue = workspaces.filter(w => daysSince(w.lastActivityDate) >= 180);
    const atRisk = workspaces.filter(w => {
      const d = daysSince(w.lastActivityDate);
      return d >= 90 && d < 180;
    });
    const orphaned = workspaces.filter(w => {
      const owners = Array.isArray(w.siteOwners) ? w.siteOwners : [];
      return owners.length === 0;
    });
    const active = workspaces.filter(w => daysSince(w.lastActivityDate) < 90);
    const rate = workspaces.length > 0
      ? Math.round((active.length / workspaces.length) * 100)
      : 0;
    return { overdue: overdue.length, atRisk: atRisk.length, orphaned: orphaned.length, rate };
  }, [workspaces]);

  const reviewQueue = useMemo(() => {
    return workspaces
      .filter(w => daysSince(w.lastActivityDate) >= 90)
      .sort((a, b) => daysSince(b.lastActivityDate) - daysSince(a.lastActivityDate))
      .map(w => {
        const d = daysSince(w.lastActivityDate);
        const owners = Array.isArray(w.siteOwners) ? w.siteOwners : [];
        const orphaned = owners.length === 0;
        let reviewType = "Time-based Renewal";
        if (orphaned) reviewType = "Ownership Confirmation";
        else if (w.externalSharing) reviewType = "External Guest Review";
        return {
          ...w,
          reviewType,
          dueStr: dueLabel(d),
          isOverdue: d >= 180,
          ownerName: orphaned ? "No owner assigned" : owners[0]?.displayName ?? "Unknown",
          orphaned,
          score: activityScore(w.lastActivityDate),
        };
      });
  }, [workspaces]);

  const filtered = searchTerm
    ? reviewQueue.filter(r =>
        r.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.reviewType.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : reviewQueue;

  if (!tenantConnectionId && !isLoading && workspaces.length === 0) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workspace Review Hub</h1>
          <p className="text-muted-foreground mt-1">Manage lifecycle events, ownership confirmations, and retention policies.</p>
        </div>
        <Card className="glass-panel border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Building2 className="w-12 h-12 text-muted-foreground/40" />
            <div>
              <p className="text-lg font-medium text-muted-foreground">No tenant selected</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Select a tenant to view workspaces requiring lifecycle review.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workspace Review Hub</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Lifecycle reviews are triggered automatically by inactivity thresholds. No destructive actions occur without human confirmation.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 shadow-sm" disabled>
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            Schedule Mass Review
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="glass-panel border-red-500/20 shadow-red-500/5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-red-500 uppercase tracking-wider">Overdue Reviews</CardTitle>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
              : <div className="text-3xl font-bold text-red-500" data-testid="stat-overdue">{stats.overdue}</div>}
            <p className="text-xs text-red-500/80 mt-1">Inactive 180+ days</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">At Risk</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
              : <div className="text-3xl font-bold" data-testid="stat-at-risk">{stats.atRisk}</div>}
            <p className="text-xs text-muted-foreground mt-1">Inactive 90–180 days</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Orphaned</CardTitle>
            <UserX className="w-4 h-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
              : <div className="text-3xl font-bold" data-testid="stat-orphaned">{stats.orphaned}</div>}
            <p className="text-xs text-muted-foreground mt-1">No active owner in Entra ID</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-500 uppercase tracking-wider">Active Rate</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
              : (
                <>
                  <div className="text-3xl font-bold" data-testid="stat-active-rate">{stats.rate}%</div>
                  <Progress value={stats.rate} className="h-1.5 bg-emerald-500/20 [&>div]:bg-emerald-500 mt-2" />
                </>
              )}
            <p className="text-xs text-emerald-600/80 mt-1">Workspaces active within 90 days</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass-panel border-border/50 shadow-xl lg:col-span-2 flex flex-col min-h-[500px]">
          <CardHeader className="pb-4 border-b border-border/40 bg-muted/10 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Active Review Queue
              {!isLoading && reviewQueue.length > 0 && (
                <Badge variant="outline" className="ml-1 text-xs">{reviewQueue.length}</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search workspaces or owners..."
                  className="pl-9 h-9 bg-background/50 rounded-lg border-border/50 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-reviews"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading workspace review queue...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-500/40" />
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? "No matches found." : "No workspaces require review."}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Workspaces inactive for 90+ days will appear here automatically.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="pl-6">Workspace</TableHead>
                    <TableHead>Review Type</TableHead>
                    <TableHead>Owner / Status</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead className="text-right pr-6">Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 20).map((item) => (
                    <TableRow key={item.id} className="hover:bg-muted/10 transition-colors group" data-testid={`row-review-${item.id}`}>
                      <TableCell className="pl-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center shadow-sm shrink-0">
                            {typeIcon(item.type)}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-sm truncate" title={item.displayName}>{item.displayName}</span>
                            <span className="text-xs text-muted-foreground">{typeLabel(item.type)}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-background font-normal text-xs whitespace-nowrap">
                          {item.reviewType === "Ownership Confirmation" && <UserX className="w-3 h-3 mr-1" />}
                          {item.reviewType === "External Guest Review" && <Share2 className="w-3 h-3 mr-1" />}
                          {item.reviewType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-sm flex items-center gap-1 ${item.orphaned ? "text-red-500 font-medium" : ""}`}>
                            {item.orphaned && <AlertCircle className="w-3 h-3 shrink-0" />}
                            <span className="truncate max-w-[140px]" title={item.ownerName}>{item.ownerName}</span>
                          </span>
                          <span className={`text-[10px] font-medium uppercase tracking-wider ${
                            item.isOverdue ? "text-red-500" : "text-amber-500"
                          }`}>
                            {item.isOverdue ? "Overdue" : "Pending"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className={`h-full ${
                                item.score > 70 ? "bg-emerald-500" :
                                item.score > 30 ? "bg-amber-500" : "bg-red-500"
                              }`}
                              style={{ width: `${item.score}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8">{item.score}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <span className={`text-xs font-medium ${item.isOverdue ? "text-red-500" : "text-amber-500"}`}>
                          {item.dueStr}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
          {!isLoading && reviewQueue.length > 0 && (
            <CardFooter className="bg-muted/10 border-t border-border/40 p-3 flex justify-center text-xs text-muted-foreground rounded-b-xl">
              Showing {Math.min(20, filtered.length)} of {reviewQueue.length} workspaces pending review
            </CardFooter>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="glass-panel border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-primary" />
                Suggested Actions
              </CardTitle>
              <CardDescription className="text-xs">
                Recommended next steps based on your workspace inventory
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-background/60 p-3 border border-border/50 text-sm">
                <p className="font-medium text-foreground mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Archive className="w-4 h-4 text-amber-500" /> Archive Candidates</span>
                  {!isLoading && <Badge className="bg-primary text-primary-foreground text-[10px] h-5 px-1.5">{stats.overdue} Sites</Badge>}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  These workspaces have been inactive for 180+ days. Review before archiving.
                </p>
                <Button size="sm" className="w-full mt-3 h-8 text-xs bg-primary/90" disabled>
                  Review Archive Candidates
                </Button>
              </div>

              <div className="rounded-lg bg-background/60 p-3 border border-border/50 text-sm">
                <p className="font-medium text-foreground mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-blue-500" /> Reassign Ownership</span>
                  {!isLoading && <Badge className="bg-primary text-primary-foreground text-[10px] h-5 px-1.5">{stats.orphaned} Orphaned</Badge>}
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  No active owners found for these workspaces. Assign new owners to maintain governance.
                </p>
                <Button size="sm" variant="outline" className="w-full mt-3 h-8 text-xs border-primary/20 hover:bg-primary/5 text-primary" disabled>
                  Suggest New Owners
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lifecycle Policies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/40">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium">Inactivity Threshold (90 days)</span>
                </div>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/40">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium">Archive Review (180 days)</span>
                </div>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/40">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-sm font-medium">Orphan Escalation</span>
                </div>
                <Badge variant="outline" className="text-[10px]">Draft</Badge>
              </div>
              <Button variant="link" size="sm" className="w-full text-xs text-muted-foreground" asChild>
                <Link href="/app/admin/policies">Manage Policies →</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
