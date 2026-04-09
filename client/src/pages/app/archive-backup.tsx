import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Archive, 
  Search, 
  ShieldCheck, 
  HardDrive,
  Clock,
  History,
  AlertTriangle,
  DownloadCloud,
  FileBox,
  Box,
  CheckCircle2,
  Building2,
  Globe,
  Loader2,
  Users,
  Info,
} from "lucide-react";
import { useTenant } from "@/lib/tenant-context";

type Workspace = {
  id: string;
  displayName: string;
  siteUrl: string | null;
  type: string;
  lastActivityDate: string | null;
  storageUsedBytes: number | null;
  siteOwners: Array<{ displayName: string }> | null;
  department: string | null;
  sensitivity: string;
};

const daysSince = (date: string | null): number => {
  if (!date) return 9999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
};

const formatBytes = (bytes: number | null): string => {
  if (!bytes) return "—";
  if (bytes >= 1_099_511_627_776) return `${(bytes / 1_099_511_627_776).toFixed(1)} TB`;
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
};

const typeIcon = (type: string) => {
  switch (type) {
    case "TEAM_SITE": return <Users className="w-4 h-4 text-blue-500" />;
    case "COMMUNICATION_SITE": return <Globe className="w-4 h-4 text-teal-500" />;
    case "HUB_SITE": return <Building2 className="w-4 h-4 text-indigo-500" />;
    default: return <Box className="w-4 h-4 text-muted-foreground" />;
  }
};

const typeLabel = (type: string): string => {
  switch (type) {
    case "TEAM_SITE": return "Team Site";
    case "COMMUNICATION_SITE": return "Comms Site";
    case "HUB_SITE": return "Hub Site";
    default: return type.replace(/_/g, " ");
  }
};

export default function ArchiveBackupPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id;

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces", tenantConnectionId, "archive"],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      const res = await fetch(`/api/workspaces?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });

  const archiveCandidates = useMemo(
    () => workspaces
      .filter(w => daysSince(w.lastActivityDate) >= 180)
      .sort((a, b) => daysSince(b.lastActivityDate) - daysSince(a.lastActivityDate)),
    [workspaces]
  );

  const filtered = searchTerm
    ? archiveCandidates.filter(w => w.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
    : archiveCandidates;

  const totalStorage = archiveCandidates.reduce((s, w) => s + (w.storageUsedBytes ?? 0), 0);
  const atRisk = workspaces.filter(w => {
    const d = daysSince(w.lastActivityDate);
    return d >= 90 && d < 180;
  }).length;

  const backupPolicies = [
    {
      id: "POL-01",
      name: "Highly Confidential Sites",
      frequency: "Daily",
      retention: "7 Years",
      scope: `Sensitivity: Highly Confidential`,
      status: "Active",
    },
    {
      id: "POL-02",
      name: "Standard Site Baseline",
      frequency: "Weekly",
      retention: "1 Year",
      scope: "All managed workspaces",
      status: "Active",
    },
    {
      id: "POL-03",
      name: "Orphaned Workspace Hold",
      frequency: "On-demand",
      retention: "90 Days",
      scope: "Workspaces with no owner",
      status: "Draft",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Archive & Backup</h1>
          <p className="text-muted-foreground mt-1">Identify archive candidates based on inactivity and manage data protection policies.</p>
        </div>
        <div className="flex gap-3">
          <Button className="gap-2 shadow-md shadow-primary/20" disabled>
            <Archive className="w-4 h-4" />
            New Archive Policy
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Archive Candidates</CardTitle>
            <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
              <Archive className="w-4 h-4 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-8 w-16 bg-muted/40 animate-pulse rounded" />
              : <div className="text-2xl font-bold" data-testid="stat-archive-candidates">{archiveCandidates.length}</div>}
            <div className="text-xs text-muted-foreground mt-1">Inactive 180+ days</div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recoverable Storage</CardTitle>
            <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
              <HardDrive className="w-4 h-4 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-8 w-24 bg-muted/40 animate-pulse rounded" />
              : <div className="text-2xl font-bold" data-testid="stat-storage">{formatBytes(totalStorage)}</div>}
            <div className="text-xs text-muted-foreground mt-1">Across all archive candidates</div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approaching Threshold</CardTitle>
            <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-8 w-16 bg-muted/40 animate-pulse rounded" />
              : <div className="text-2xl font-bold" data-testid="stat-at-risk">{atRisk}</div>}
            <div className="text-xs text-muted-foreground mt-1">Inactive 90–180 days</div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Protection Policies</CardTitle>
            <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-green-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{backupPolicies.filter(p => p.status === "Active").length}</div>
            <div className="text-xs text-muted-foreground mt-1">Active backup policies configured</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="archive" className="w-full">
        <TabsList className="bg-muted/50 p-1 w-full justify-start rounded-xl h-auto">
          <TabsTrigger value="archive" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-archive">
            <Archive className="w-4 h-4 mr-2" />
            Archive Candidates
          </TabsTrigger>
          <TabsTrigger value="backup" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-backup">
            <ShieldCheck className="w-4 h-4 mr-2" />
            Backup Policies
          </TabsTrigger>
          <TabsTrigger value="restore" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-restore">
            <History className="w-4 h-4 mr-2" />
            Restoration Center
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="archive" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Archive className="w-5 h-5 text-primary" />
                      Inactive Workspace Candidates
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Workspaces with no activity in the last 180 days — eligible for M365 Archive tier or decommissioning.
                    </CardDescription>
                  </div>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search workspaces..."
                      className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      data-testid="input-search-archive"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analysing workspace activity...
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500/40" />
                    <p className="text-sm text-muted-foreground">
                      {searchTerm ? "No matches found." : "No archive candidates detected."}
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      Workspaces inactive for 180+ days will appear here automatically after a tenant sync.
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="pl-6">Workspace</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Storage</TableHead>
                        <TableHead>Last Activity</TableHead>
                        <TableHead>Sensitivity</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.slice(0, 25).map((ws) => {
                        const d = daysSince(ws.lastActivityDate);
                        const isExtreme = d >= 365;
                        return (
                          <TableRow key={ws.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-archive-${ws.id}`}>
                            <TableCell className="pl-6">
                              <div className="font-semibold text-sm truncate max-w-[200px]" title={ws.displayName}>
                                {ws.displayName}
                              </div>
                              {ws.siteUrl && (
                                <div className="text-xs text-muted-foreground font-mono truncate max-w-[200px] mt-0.5">
                                  {ws.siteUrl.replace(/^https?:\/\/[^/]+/, "")}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                {typeIcon(ws.type)}
                                {typeLabel(ws.type)}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium text-sm">
                              {formatBytes(ws.storageUsedBytes)}
                            </TableCell>
                            <TableCell>
                              <span className={`text-sm font-medium ${isExtreme ? "text-red-500" : "text-amber-500"}`}>
                                {d >= 9999 ? "Never" : `${d}d ago`}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={
                                ws.sensitivity === "HIGHLY_CONFIDENTIAL" ? "bg-red-500/10 text-red-500 border-red-500/20 text-xs" :
                                ws.sensitivity === "CONFIDENTIAL" ? "bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs" :
                                "bg-muted/30 text-muted-foreground text-xs"
                              }>
                                {ws.sensitivity.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                Candidate
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
              {!isLoading && filtered.length > 25 && (
                <CardFooter className="bg-muted/10 border-t border-border/40 p-3 flex justify-center text-xs text-muted-foreground">
                  Showing 25 of {filtered.length} candidates
                </CardFooter>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="backup" className="m-0">
            <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 mb-4" data-testid="banner-backup-demo">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Demo Data — Coming Soon</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The backup policies below are illustrative examples. Live policy management via the Microsoft 365 Backup API is on the roadmap.
                </p>
              </div>
            </div>

            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-primary" />
                      Protection Policies
                    </CardTitle>
                    <CardDescription>Backup jobs configured for this M365 tenant.</CardDescription>
                  </div>
                  <Button size="sm" variant="outline" className="gap-2 shrink-0" disabled>
                    <ShieldCheck className="w-4 h-4" />
                    New Policy
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Policy Name</TableHead>
                      <TableHead>Target Scope</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Retention</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backupPolicies.map((policy) => (
                      <TableRow key={policy.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-policy-${policy.id}`}>
                        <TableCell className="pl-6 font-medium">{policy.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{policy.scope}</TableCell>
                        <TableCell>{policy.frequency}</TableCell>
                        <TableCell className="text-muted-foreground">{policy.retention}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {policy.status === "Active"
                              ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              : <AlertTriangle className="w-4 h-4 text-amber-500" />}
                            <span className={policy.status === "Active" ? "text-emerald-500 text-sm" : "text-amber-500 text-sm"}>
                              {policy.status}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" disabled>Edit</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="glass-panel border-primary/20 bg-primary/5 mt-4">
              <CardContent className="flex items-start gap-3 pt-4 pb-4">
                <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Automated backup execution requires a Microsoft 365 Backup license (Microsoft Backup Storage).
                  Policies above define the governance intent — connect the M365 Backup API to activate scheduling.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="restore" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl min-h-[400px]">
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle className="text-xl flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  Restoration Operations
                </CardTitle>
                <CardDescription>Monitor ongoing data recovery tasks.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                <div className="w-20 h-20 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center mx-auto mb-6">
                  <DownloadCloud className="w-8 h-8 text-primary/60" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No Active Restorations</h3>
                <p className="max-w-sm text-sm">
                  There are no items currently being restored. Initiate a recovery from the Archive Candidates tab to track progress here.
                </p>
                <Button variant="outline" className="mt-6 gap-2" disabled>
                  <FileBox className="w-4 h-4" /> Find Item to Restore
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
