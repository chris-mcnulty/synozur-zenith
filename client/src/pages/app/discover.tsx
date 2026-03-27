import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
  Search, 
  HardDrive, 
  FileBox, 
  Globe,
  ArrowRight,
  ShieldAlert,
  FolderOpen,
  Database,
  Sparkles,
  Download,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Loader2,
  Clock,
  Users,
} from "lucide-react";

type TenantConnection = {
  id: string;
  tenantId: string;
  tenantName: string;
  domain: string;
  status: string;
  ownershipType: string;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncSiteCount: number | null;
  consentGranted: boolean;
};

type DashboardData = {
  serviceStatus: TenantConnection[];
  activeTenantsCount: number;
};

const formatDate = (date: string | null): string => {
  if (!date) return "Never";
  const d = new Date(date);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
};

export default function DiscoverDashboard() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: dashboard, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
    queryFn: () => fetch("/api/dashboard", { credentials: "include" }).then(r => r.ok ? r.json() : { serviceStatus: [], activeTenantsCount: 0 }),
  });

  const tenants: TenantConnection[] = dashboard?.serviceStatus ?? [];

  const totalSites = tenants.reduce((s, t) => s + (t.lastSyncSiteCount ?? 0), 0);
  const activeTenants = tenants.filter(t => t.status === "ACTIVE").length;
  const pendingConsent = tenants.filter(t => !t.consentGranted).length;
  const healthyTenants = tenants.filter(t => t.lastSyncStatus === "SUCCESS").length;

  const filtered = searchTerm
    ? tenants.filter(t =>
        t.tenantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.domain.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : tenants;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">Discover & Migrate</h1>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20 font-medium">
              Enterprise+
            </Badge>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Catalog managed M365 environments, monitor sync health, and plan governance onboarding for unmanaged tenants.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2" disabled>
            <Download className="w-4 h-4" />
            Export Inventory
          </Button>
          <Button className="gap-2 shadow-md shadow-primary/20" disabled>
            <Database className="w-4 h-4" />
            Add Tenant
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Connected Tenants</CardTitle>
            <Building2 className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
              : <div className="text-3xl font-bold" data-testid="stat-tenants">{activeTenants}</div>}
            <p className="text-xs text-muted-foreground mt-1">{!isLoading && `${tenants.length} total, ${activeTenants} active`}</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Managed Workspaces</CardTitle>
            <FileBox className="w-4 h-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
              : <div className="text-3xl font-bold" data-testid="stat-sites">{totalSites.toLocaleString()}</div>}
            <p className="text-xs text-muted-foreground mt-1">Sites across all tenants</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Consent</CardTitle>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
              : <div className={`text-3xl font-bold ${pendingConsent > 0 ? "text-amber-500" : ""}`} data-testid="stat-pending">{pendingConsent}</div>}
            <p className="text-xs text-muted-foreground mt-1">Tenants awaiting admin consent</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-primary/20 bg-primary/5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-primary">Sync Health</CardTitle>
            <Sparkles className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
              : (
                <>
                  <div className="flex items-end justify-between mb-2">
                    <div className="text-3xl font-bold" data-testid="stat-health">
                      {tenants.length > 0 ? `${Math.round((healthyTenants / tenants.length) * 100)}%` : "—"}
                    </div>
                  </div>
                  <Progress
                    value={tenants.length > 0 ? (healthyTenants / tenants.length) * 100 : 0}
                    className="h-1.5 bg-primary/20"
                  />
                </>
              )}
            <p className="text-xs text-muted-foreground mt-2">Tenants with successful last sync</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="glass-panel border-border/50 shadow-xl lg:col-span-2 flex flex-col">
          <CardHeader className="pb-4 border-b border-border/40 bg-muted/10 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              Connected M365 Tenants
              {!isLoading && tenants.length > 0 && (
                <Badge variant="outline" className="ml-1 text-xs">{tenants.length}</Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tenants..."
                  className="pl-9 h-9 bg-background/50 rounded-lg border-border/50 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-tenants"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading tenant inventory...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Building2 className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? "No tenants match your search." : "No tenants connected yet."}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Connect an M365 tenant from the Admin › Tenants page.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="pl-6">Tenant</TableHead>
                    <TableHead>Ownership</TableHead>
                    <TableHead>Sites</TableHead>
                    <TableHead>Last Sync</TableHead>
                    <TableHead>Health</TableHead>
                    <TableHead className="text-right pr-6">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tenant) => (
                    <TableRow key={tenant.id} className="hover:bg-muted/10 transition-colors cursor-pointer group" data-testid={`row-tenant-${tenant.id}`}>
                      <TableCell className="pl-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center shadow-sm shrink-0">
                            <Globe className="w-4 h-4 text-blue-500" />
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-semibold text-sm truncate">{tenant.tenantName}</span>
                            <span className="text-xs text-muted-foreground truncate">{tenant.domain}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal text-xs bg-background">
                          {tenant.ownershipType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-sm">{tenant.lastSyncSiteCount?.toLocaleString() ?? "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDate(tenant.lastSyncAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {!tenant.consentGranted ? (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Needs Consent
                          </Badge>
                        ) : tenant.lastSyncStatus === "SUCCESS" ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Healthy
                          </Badge>
                        ) : tenant.lastSyncStatus === "FAILED" ? (
                          <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Sync Error
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted/30 text-muted-foreground text-xs">
                            Not synced
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity gap-1 text-primary hover:text-primary hover:bg-primary/10">
                          View <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="glass-panel border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Zenith Intelligence
              </CardTitle>
              <CardDescription className="text-xs">
                Governance onboarding recommendations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isLoading && pendingConsent > 0 && (
                <div className="rounded-lg bg-background/60 p-3 border border-amber-500/20 text-sm">
                  <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Consent Required
                  </p>
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    {pendingConsent} tenant{pendingConsent > 1 ? "s" : ""} require admin consent before Zenith can read governance data.
                  </p>
                  <Button size="sm" variant="outline" className="w-full mt-3 h-8 text-xs" disabled>
                    Initiate Consent Flow
                  </Button>
                </div>
              )}

              <div className="rounded-lg bg-background/60 p-3 border border-border/50 text-sm">
                <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-blue-500" />
                  On-Premise Discovery
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Scan legacy file shares and on-premise SharePoint farms. Requires MGDC (Microsoft Graph Data Connect) and the Enterprise+ plan.
                </p>
                <Button size="sm" className="w-full mt-3 h-8 text-xs bg-primary/90" disabled>
                  Configure MGDC Pipeline
                </Button>
              </div>

              <div className="rounded-lg bg-background/60 p-3 border border-border/50 text-sm">
                <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-purple-500" />
                  Oversharing Analysis
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  MGDC bulk extraction pipeline for anonymized oversharing analytics across all managed content.
                </p>
                <Button size="sm" variant="outline" className="w-full mt-3 h-8 text-xs border-primary/20 hover:bg-primary/5 text-primary" disabled>
                  Learn More
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">MGDC Pipeline Status</CardTitle>
              <CardDescription className="text-xs">
                Microsoft Graph Data Connect — not yet configured
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium">Oversharing Analytics</span>
                    <span className="text-muted-foreground/50">Not connected</span>
                  </div>
                  <Progress value={0} className="h-1.5 bg-muted" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium">Sensitivity Label Extraction</span>
                    <span className="text-muted-foreground/50">Not connected</span>
                  </div>
                  <Progress value={0} className="h-1.5 bg-muted" />
                </div>
                <p className="text-[10px] text-muted-foreground pt-2">
                  MGDC is used exclusively for bulk, read-only extraction as per governance policy.
                  Requires Enterprise+ plan and Azure Data Factory configuration.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
