import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Search,
  Plus,
  Server,
  Activity,
  Globe,
  Ban,
  Trash2,
  Loader2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Settings2,
  TrendingUp,
  MousePointerClick,
  Users,
  Home,
  LogIn,
  Network,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery as useAuthQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

type PlatformSettings = {
  id: string;
  defaultSignupPlan: string;
  plannerPlanId: string | null;
  plannerBucketId: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

type BlockedDomain = {
  id: string;
  domain: string;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
};

type OrgStat = {
  id: string;
  name: string;
  domain: string;
  servicePlan: string;
  supportEmail: string | null;
  createdAt: string;
  tenantCount: number;
};

const PLAN_COLORS: Record<string, string> = {
  ENTERPRISE: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  PROFESSIONAL: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  STANDARD: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  TRIAL: "bg-muted/50 text-muted-foreground border-border/60",
};

const SERVICE_PLANS = ["TRIAL", "STANDARD", "PROFESSIONAL", "ENTERPRISE"] as const;

function planLabel(plan: string) {
  return plan.charAt(0) + plan.slice(1).toLowerCase();
}

interface IAAdminSummary {
  totalRuns: number;
  tenantsWithCompletedRun: number;
  totalTenants: number;
  averageScore: number | null;
}

function IAAssessmentAdminWidget() {
  const { data, isLoading } = useQuery<IAAdminSummary>({
    queryKey: ["/api/ia-assessment/admin-summary"],
    queryFn: async () => {
      const res = await fetch("/api/ia-assessment/admin-summary", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const coveragePct = data && data.totalTenants > 0
    ? Math.round((data.tenantsWithCompletedRun / data.totalTenants) * 100)
    : 0;

  return (
    <Card className="glass-panel" data-testid="card-ia-admin-summary">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Network className="w-4 h-4 text-primary" /> IA Assessment Coverage (last 30 days)
        </CardTitle>
        <CardDescription>
          Platform-wide view of IA assessment completion and average IA health scores.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Could not load IA assessment data.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Runs (30d)</p>
              <p className="text-2xl font-bold" data-testid="text-ia-total-runs">{data.totalRuns}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tenants with Assessment</p>
              <p className="text-2xl font-bold" data-testid="text-ia-tenants-with-run">
                {data.tenantsWithCompletedRun}
                <span className="text-sm text-muted-foreground font-normal ml-1">/ {data.totalTenants}</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Coverage</p>
              <p className="text-2xl font-bold text-primary" data-testid="text-ia-coverage">{coveragePct}%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Avg IA Health Score</p>
              <p className="text-2xl font-bold" data-testid="text-ia-avg-score">
                {data.averageScore != null ? `${data.averageScore}` : "—"}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SystemAdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [newBlockedDomain, setNewBlockedDomain] = useState("");
  const [newBlockedReason, setNewBlockedReason] = useState("");
  const [orgSearch, setOrgSearch] = useState("");
  const [pendingSignupPlan, setPendingSignupPlan] = useState<string | null>(null);
  const [pendingPlannerPlanId, setPendingPlannerPlanId] = useState<string | null>(null);
  const [pendingPlannerBucketId, setPendingPlannerBucketId] = useState<string | null>(null);
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false);
  const [deleteOrgTarget, setDeleteOrgTarget] = useState<{ id: string; name: string } | null>(null);
  const [purgeData, setPurgeData] = useState(true);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [changePlanTarget, setChangePlanTarget] = useState<{ id: string; name: string; currentPlan: string } | null>(null);
  const [changePlanValue, setChangePlanValue] = useState("TRIAL");
  const [createOrgForm, setCreateOrgForm] = useState({
    name: "",
    domain: "",
    servicePlan: "TRIAL",
    supportEmail: "",
  });

  const { data: authData } = useAuthQuery<{ user: { role: string; effectiveRole?: string; organizationId?: string } } | null>({
    queryKey: ["/api/auth/me"],
  });
  const [, navigate] = useLocation();
  const effectiveRole = authData?.user?.effectiveRole || authData?.user?.role || "viewer";
  const isPlatformOwner = effectiveRole === "platform_owner";
  const myOrgId = authData?.user?.organizationId;

  useEffect(() => {
    if (authData !== undefined && !isPlatformOwner) {
      navigate("/app/dashboard");
    }
  }, [authData, isPlatformOwner, navigate]);

  const { data: platformSettingsData } = useQuery<PlatformSettings>({
    queryKey: ["/api/admin/platform/settings"],
    queryFn: async () => {
      const res = await fetch("/api/admin/platform/settings");
      if (!res.ok) throw new Error("Failed to fetch platform settings");
      return res.json();
    },
  });

  const savePlatformSettingsMutation = useMutation({
    mutationFn: async (defaultSignupPlan: string) => {
      const res = await fetch("/api/admin/platform/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultSignupPlan }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save platform settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform/settings"] });
      setPendingSignupPlan(null);
      toast({ title: "Settings saved", description: "Default signup plan has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const savePlannerSettingsMutation = useMutation({
    mutationFn: async (input: { plannerPlanId: string | null; plannerBucketId: string | null }) => {
      const res = await fetch("/api/admin/platform/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save Planner settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform/settings"] });
      setPendingPlannerPlanId(null);
      setPendingPlannerBucketId(null);
      toast({ title: "Planner settings saved", description: "Support tickets will now be routed to the configured Planner bucket." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { data: blockedDomains = [], isLoading: blockedLoading } = useQuery<BlockedDomain[]>({
    queryKey: ["/api/admin/domain-blocklist"],
    queryFn: async () => {
      const res = await fetch("/api/admin/domain-blocklist");
      if (!res.ok) throw new Error("Failed to fetch blocklist");
      return res.json();
    },
  });

  const { data: orgStats = [], isLoading: orgsLoading } = useQuery<OrgStat[]>({
    queryKey: ["/api/admin/platform/org-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/platform/org-stats");
      if (!res.ok) throw new Error("Failed to fetch organization stats");
      return res.json();
    },
  });

  const { data: trafficStats, isLoading: trafficLoading } = useQuery<{
    ytd: { totalViews: number; uniqueSessions: number; homeViews: number; loginViews: number };
    monthly: Array<{ month: string; label: string; views: number; sessions: number; homeViews: number; loginViews: number }>;
    topReferrers: Array<{ referrer: string; count: number }>;
  }>({
    queryKey: ["/api/analytics/traffic"],
    queryFn: async () => {
      const res = await fetch("/api/analytics/traffic");
      if (!res.ok) throw new Error("Failed to fetch traffic stats");
      return res.json();
    },
    enabled: isPlatformOwner,
  });

  const filteredOrgs = orgStats.filter(org =>
    org.name.toLowerCase().includes(orgSearch.toLowerCase()) ||
    org.domain.toLowerCase().includes(orgSearch.toLowerCase())
  );

  const totalTenants = orgStats.reduce((sum, o) => sum + o.tenantCount, 0);

  const addBlockedDomainMutation = useMutation({
    mutationFn: async ({ domain, reason }: { domain: string; reason: string }) => {
      const res = await fetch("/api/admin/domain-blocklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, reason: reason || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add domain");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domain-blocklist"] });
      setNewBlockedDomain("");
      setNewBlockedReason("");
      toast({ title: "Domain blocked", description: `${newBlockedDomain} has been added to the blocklist.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const removeBlockedDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const res = await fetch(`/api/admin/domain-blocklist/${encodeURIComponent(domain)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove domain");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domain-blocklist"] });
      toast({ title: "Domain unblocked", description: "Domain has been removed from the blocklist." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const createOrgMutation = useMutation({
    mutationFn: async (body: typeof createOrgForm) => {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create organization");
      }
      return res.json();
    },
    onSuccess: (org: OrgStat) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform/org-stats"] });
      setShowCreateOrgDialog(false);
      setCreateOrgForm({ name: "", domain: "", servicePlan: "TRIAL", supportEmail: "" });
      toast({ title: "Organization created", description: `${org.name} has been added to the platform.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const { data: adminDeleteCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/admin/organizations", deleteOrgTarget?.id, "data-counts"],
    queryFn: async () => {
      if (!deleteOrgTarget?.id) return {};
      const res = await fetch(`/api/admin/organizations/${deleteOrgTarget.id}/data-counts`);
      if (!res.ok) return {};
      return res.json();
    },
    enabled: !!deleteOrgTarget?.id && purgeData,
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async (id: string) => {
      const url = purgeData
        ? `/api/admin/organizations/${id}`
        : `/api/admin/organizations/${id}?purgeData=false`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete organization");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform/org-stats"] });
      const name = deleteOrgTarget?.name;
      setDeleteOrgTarget(null);
      setDeleteConfirmName("");
      setPurgeData(true);
      toast({ title: "Organization deleted", description: `${name} and all its data have been permanently removed.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ id, plan }: { id: string; plan: string }) => {
      const res = await fetch(`/api/admin/organizations/${id}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update plan");
      }
      return res.json();
    },
    onSuccess: (_data, { plan }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform/org-stats"] });
      const name = changePlanTarget?.name;
      setChangePlanTarget(null);
      toast({ title: "Plan updated", description: `${name} is now on the ${planLabel(plan)} plan.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">System Administration</h1>
          <p className="text-muted-foreground mt-1">Platform-level controls for managing all organizations and infrastructure.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive" data-testid="button-system-health">
            <Activity className="w-4 h-4" />
            System Health
          </Button>
          {isPlatformOwner && (
            <Button
              className="gap-2 shadow-md shadow-primary/20"
              data-testid="button-create-org"
              onClick={() => setShowCreateOrgDialog(true)}
            >
              <Plus className="w-4 h-4" />
              Create Organization
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-panel border-blue-500/20 shadow-lg shadow-blue-500/5 bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Organizations</CardTitle>
            <Building2 className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-orgs">
              {orgsLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : orgStats.length}
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-purple-500/20 shadow-lg shadow-purple-500/5 bg-gradient-to-br from-purple-500/5 to-transparent">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Managed Tenants</CardTitle>
            <Globe className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-tenants">
              {orgsLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : totalTenants}
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-emerald-500/20 shadow-lg shadow-emerald-500/5 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Organizations</CardTitle>
            <Server className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-500" data-testid="text-active-orgs">
              {orgsLoading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : orgStats.length}
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-amber-500/20 shadow-lg shadow-amber-500/5 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Blocked Domains</CardTitle>
            <Ban className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-blocked-count">{blockedDomains.length}</div>
          </CardContent>
        </Card>
      </div>

      <IAAssessmentAdminWidget />

      <Tabs defaultValue="organizations" className="space-y-4">
        <TabsList data-testid="tabs-admin">
          <TabsTrigger value="organizations">Organizations</TabsTrigger>
          <TabsTrigger value="traffic" data-testid="tab-traffic">Traffic</TabsTrigger>
          <TabsTrigger value="blocked-domains">Blocked Domains</TabsTrigger>
          <TabsTrigger value="platform-settings" data-testid="tab-platform-settings">Platform Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="organizations">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-primary" />
                  Organizations Directory
                </CardTitle>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search organizations..."
                    className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                    value={orgSearch}
                    onChange={e => setOrgSearch(e.target.value)}
                    data-testid="input-search-orgs"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {orgsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredOrgs.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">{orgSearch ? "No organizations match your search." : "No organizations found."}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Organization Name</TableHead>
                      <TableHead>Primary Domain</TableHead>
                      <TableHead>Service Plan</TableHead>
                      <TableHead>Connected Tenants</TableHead>
                      <TableHead>Status</TableHead>
                      {isPlatformOwner && <TableHead className="w-[60px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrgs.map((org) => (
                      <TableRow key={org.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-org-${org.id}`}>
                        <TableCell className="pl-6 font-medium">{org.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{org.domain}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={PLAN_COLORS[org.servicePlan] ?? ""}>
                            {planLabel(org.servicePlan)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 text-sm">
                            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                            {org.tenantCount}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Active
                          </Badge>
                        </TableCell>
                        {isPlatformOwner && (
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => { setChangePlanTarget({ id: org.id, name: org.name, currentPlan: org.servicePlan }); setChangePlanValue(org.servicePlan); }}
                                data-testid={`button-change-plan-${org.id}`}
                                title="Change service plan"
                              >
                                <Settings2 className="w-4 h-4" />
                              </Button>
                              {org.id !== myOrgId && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteOrgTarget({ id: org.id, name: org.name })}
                                  data-testid={`button-delete-org-${org.id}`}
                                  title="Delete organization"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="traffic">
          <div className="space-y-4">
            {trafficLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "YTD Page Views", value: trafficStats?.ytd.totalViews ?? 0, icon: MousePointerClick, color: "text-blue-500", border: "border-blue-500/20", bg: "from-blue-500/5" },
                    { label: "YTD Unique Sessions", value: trafficStats?.ytd.uniqueSessions ?? 0, icon: Users, color: "text-purple-500", border: "border-purple-500/20", bg: "from-purple-500/5" },
                    { label: "Home Page Views", value: trafficStats?.ytd.homeViews ?? 0, icon: Home, color: "text-emerald-500", border: "border-emerald-500/20", bg: "from-emerald-500/5" },
                    { label: "Login Page Views", value: trafficStats?.ytd.loginViews ?? 0, icon: LogIn, color: "text-amber-500", border: "border-amber-500/20", bg: "from-amber-500/5" },
                  ].map(({ label, value, icon: Icon, color, border, bg }) => (
                    <Card key={label} className={`glass-panel ${border} shadow-lg bg-gradient-to-br ${bg} to-transparent`}>
                      <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                        <Icon className={`w-4 h-4 ${color}`} />
                      </CardHeader>
                      <CardContent>
                        <div className={`text-2xl font-bold ${color}`} data-testid={`text-traffic-${label.toLowerCase().replace(/ /g, "-")}`}>
                          {value.toLocaleString()}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card className="glass-panel border-border/50 shadow-xl">
                  <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                    <CardTitle className="text-xl flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      {new Date().getFullYear()} Month-by-Month Traffic
                    </CardTitle>
                    <CardDescription>Page views and unique sessions per month (year to date)</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {!trafficStats?.monthly?.length ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                        <TrendingUp className="w-8 h-8 opacity-30" />
                        <p className="text-sm">No traffic data yet. Views will appear here once visitors reach the public pages.</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={trafficStats.monthly} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border/40" />
                          <XAxis dataKey="label" tick={{ fontSize: 12 }} className="text-muted-foreground" />
                          <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                            labelStyle={{ fontWeight: 600 }}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey="views" name="Page Views" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="sessions" name="Unique Sessions" fill="hsl(262 80% 65%)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {(trafficStats?.topReferrers?.length ?? 0) > 0 && (
                  <Card className="glass-panel border-border/50 shadow-xl">
                    <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Globe className="w-4 h-4 text-primary" />
                        Top Referrers (YTD)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Source</TableHead>
                            <TableHead className="text-right">Views</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {trafficStats!.topReferrers.map((r) => (
                            <TableRow key={r.referrer}>
                              <TableCell className="font-mono text-xs">{r.referrer}</TableCell>
                              <TableCell className="text-right font-medium">{r.count.toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </TabsContent>

        <TabsContent value="blocked-domains">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Ban className="w-5 h-5 text-red-500" />
                    Blocked Registration Domains
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Email domains on this list cannot self-register new organizations. Users with these domains must be invited by an existing admin.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-lg bg-muted/20 border border-border/40" data-testid="card-add-blocked-domain">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Domain</label>
                  <Input
                    placeholder="e.g. example.com"
                    value={newBlockedDomain}
                    onChange={(e) => setNewBlockedDomain(e.target.value)}
                    className="font-mono text-sm"
                    data-testid="input-blocked-domain"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
                  <Input
                    placeholder="e.g. Personal email provider"
                    value={newBlockedReason}
                    onChange={(e) => setNewBlockedReason(e.target.value)}
                    className="text-sm"
                    data-testid="input-blocked-reason"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => addBlockedDomainMutation.mutate({ domain: newBlockedDomain, reason: newBlockedReason })}
                    disabled={!newBlockedDomain.trim() || addBlockedDomainMutation.isPending}
                    className="gap-2"
                    data-testid="button-add-blocked-domain"
                  >
                    {addBlockedDomainMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Block Domain
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-amber-500/5 p-3 flex gap-2 text-xs text-muted-foreground">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p>Blocking a domain prevents new users from self-registering with email addresses from that domain. Existing users and organizations with that domain are not affected.</p>
              </div>

              {blockedLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : blockedDomains.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Ban className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No domains are currently blocked.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Domain</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Blocked Since</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedDomains.map((entry) => (
                      <TableRow key={entry.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-blocked-${entry.domain}`}>
                        <TableCell className="pl-6 font-mono text-sm font-medium">{entry.domain}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.reason || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => removeBlockedDomainMutation.mutate(entry.domain)}
                            disabled={removeBlockedDomainMutation.isPending}
                            data-testid={`button-unblock-${entry.domain}`}
                          >
                            <Trash2 className="w-4 h-4" />
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

        <TabsContent value="platform-settings">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
              <CardTitle className="text-xl flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-primary" />
                Platform Settings
              </CardTitle>
              <CardDescription>
                Configure platform-level defaults that apply to all new self-service organization registrations.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="max-w-md space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="default-signup-plan">Default Signup Plan</Label>
                  <p className="text-xs text-muted-foreground">
                    The service plan automatically assigned to new organizations created via self-service signup (local password or SSO). This does not affect existing organizations.
                  </p>
                  <Select
                    value={pendingSignupPlan ?? platformSettingsData?.defaultSignupPlan ?? "TRIAL"}
                    onValueChange={v => setPendingSignupPlan(v)}
                    disabled={!isPlatformOwner}
                  >
                    <SelectTrigger data-testid="select-default-signup-plan" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_PLANS.map(plan => (
                        <SelectItem key={plan} value={plan} data-testid={`option-signup-plan-${plan}`}>
                          {planLabel(plan)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isPlatformOwner && (
                  <Button
                    onClick={() => {
                      const planToSave = pendingSignupPlan ?? platformSettingsData?.defaultSignupPlan ?? "TRIAL";
                      savePlatformSettingsMutation.mutate(planToSave);
                    }}
                    disabled={savePlatformSettingsMutation.isPending || (!pendingSignupPlan && !platformSettingsData)}
                    className="gap-2"
                    data-testid="button-save-platform-settings"
                  >
                    {savePlatformSettingsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    Save Settings
                  </Button>
                )}
                {platformSettingsData?.updatedAt && (
                  <p className="text-xs text-muted-foreground" data-testid="text-platform-settings-updated">
                    Last updated: {new Date(platformSettingsData.updatedAt).toLocaleString()}
                  </p>
                )}
              </div>

              <div className="max-w-md space-y-6 mt-10 pt-6 border-t border-border/40">
                <div>
                  <h3 className="text-sm font-semibold mb-1">Microsoft Planner Integration (Support Tickets)</h3>
                  <p className="text-xs text-muted-foreground">
                    When set, every new Zenith support ticket is mirrored as a task in the configured Planner bucket. Leave both fields blank to disable the integration. The shared Synozur support plan also receives tickets from Constellation and Vega — choose the bucket that should hold Zenith tickets.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planner-plan-id">Planner Plan ID</Label>
                  <Input
                    id="planner-plan-id"
                    placeholder="e.g. xqQg5FS2LkCp935s-FIFm5gAFkHM"
                    value={pendingPlannerPlanId ?? platformSettingsData?.plannerPlanId ?? ""}
                    onChange={e => setPendingPlannerPlanId(e.target.value)}
                    disabled={!isPlatformOwner}
                    data-testid="input-planner-plan-id"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="planner-bucket-id">Planner Bucket ID</Label>
                  <Input
                    id="planner-bucket-id"
                    placeholder="e.g. hsOf-7CTokmwYRk4DLPDxJgABDqL"
                    value={pendingPlannerBucketId ?? platformSettingsData?.plannerBucketId ?? ""}
                    onChange={e => setPendingPlannerBucketId(e.target.value)}
                    disabled={!isPlatformOwner}
                    data-testid="input-planner-bucket-id"
                  />
                </div>
                {isPlatformOwner && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        const planId = (pendingPlannerPlanId ?? platformSettingsData?.plannerPlanId ?? "").trim();
                        const bucketId = (pendingPlannerBucketId ?? platformSettingsData?.plannerBucketId ?? "").trim();
                        savePlannerSettingsMutation.mutate({
                          plannerPlanId: planId === "" ? null : planId,
                          plannerBucketId: bucketId === "" ? null : bucketId,
                        });
                      }}
                      disabled={
                        savePlannerSettingsMutation.isPending ||
                        (pendingPlannerPlanId === null && pendingPlannerBucketId === null)
                      }
                      className="gap-2"
                      data-testid="button-save-planner-settings"
                    >
                      {savePlannerSettingsMutation.isPending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Save Planner Settings
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        savePlannerSettingsMutation.mutate({ plannerPlanId: null, plannerBucketId: null });
                      }}
                      disabled={
                        savePlannerSettingsMutation.isPending ||
                        (!platformSettingsData?.plannerPlanId && !platformSettingsData?.plannerBucketId)
                      }
                      data-testid="button-clear-planner-settings"
                    >
                      Clear
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {isPlatformOwner && (
        <Dialog open={showCreateOrgDialog} onOpenChange={open => {
          setShowCreateOrgDialog(open);
          if (!open) setCreateOrgForm({ name: "", domain: "", servicePlan: "TRIAL", supportEmail: "" });
        }}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Create Organization
              </DialogTitle>
              <DialogDescription>
                Add a new organization to the Zenith platform. You can configure their service plan and connection settings afterwards.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name <span className="text-destructive">*</span></Label>
                <Input
                  id="org-name"
                  placeholder="e.g. Contoso Corporation"
                  value={createOrgForm.name}
                  onChange={e => setCreateOrgForm(f => ({ ...f, name: e.target.value }))}
                  data-testid="input-create-org-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-domain">Primary Domain <span className="text-destructive">*</span></Label>
                <Input
                  id="org-domain"
                  placeholder="e.g. contoso.onmicrosoft.com"
                  value={createOrgForm.domain}
                  onChange={e => setCreateOrgForm(f => ({ ...f, domain: e.target.value }))}
                  className="font-mono text-sm"
                  data-testid="input-create-org-domain"
                />
                <p className="text-[11px] text-muted-foreground">The organization's primary Microsoft 365 or custom domain.</p>
              </div>

              <div className="space-y-2">
                <Label>Service Plan</Label>
                <Select
                  value={createOrgForm.servicePlan}
                  onValueChange={v => setCreateOrgForm(f => ({ ...f, servicePlan: v }))}
                >
                  <SelectTrigger data-testid="select-create-org-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_PLANS.map(plan => (
                      <SelectItem key={plan} value={plan}>{planLabel(plan)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-support-email">Support Email <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="org-support-email"
                  type="email"
                  placeholder="e.g. it-support@contoso.com"
                  value={createOrgForm.supportEmail}
                  onChange={e => setCreateOrgForm(f => ({ ...f, supportEmail: e.target.value }))}
                  data-testid="input-create-org-support-email"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateOrgDialog(false)} data-testid="button-cancel-create-org">
                Cancel
              </Button>
              <Button
                onClick={() => createOrgMutation.mutate(createOrgForm)}
                disabled={!createOrgForm.name.trim() || !createOrgForm.domain.trim() || createOrgMutation.isPending}
                className="gap-2"
                data-testid="button-submit-create-org"
              >
                {createOrgMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                Create Organization
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={!!changePlanTarget} onOpenChange={open => { if (!open) setChangePlanTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              Change Service Plan
            </DialogTitle>
            <DialogDescription>
              Update the service plan for <strong>{changePlanTarget?.name}</strong>. Changes take effect immediately.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Service Plan</Label>
              <Select value={changePlanValue} onValueChange={setChangePlanValue}>
                <SelectTrigger data-testid="select-change-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_PLANS.map(plan => (
                    <SelectItem key={plan} value={plan}>
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${PLAN_COLORS[plan]?.includes("blue") ? "bg-blue-500" : PLAN_COLORS[plan]?.includes("purple") ? "bg-purple-500" : PLAN_COLORS[plan]?.includes("emerald") ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                        {planLabel(plan)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {changePlanValue !== changePlanTarget?.currentPlan && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2 text-xs text-muted-foreground">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p>Changing from <strong>{planLabel(changePlanTarget?.currentPlan ?? "")}</strong> to <strong>{planLabel(changePlanValue)}</strong> will immediately affect feature access for all users in this organization.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setChangePlanTarget(null)} disabled={changePlanMutation.isPending} data-testid="button-cancel-change-plan">
              Cancel
            </Button>
            <Button
              onClick={() => changePlanTarget && changePlanMutation.mutate({ id: changePlanTarget.id, plan: changePlanValue })}
              disabled={changePlanMutation.isPending || changePlanValue === changePlanTarget?.currentPlan}
              className="gap-2"
              data-testid="button-confirm-change-plan"
            >
              {changePlanMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Settings2 className="w-4 h-4" />
              )}
              Update Plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteOrgTarget} onOpenChange={open => { if (!open) { setDeleteOrgTarget(null); setDeleteConfirmName(""); setPurgeData(true); } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Organization
            </DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{deleteOrgTarget?.name}</strong>. Configure data handling below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 p-4 rounded-lg border border-border/50 bg-muted/20">
              <Checkbox
                id="purge-data"
                checked={purgeData}
                onCheckedChange={(checked) => setPurgeData(checked === true)}
                data-testid="checkbox-purge-data"
              />
              <div>
                <label htmlFor="purge-data" className="text-sm font-semibold cursor-pointer">
                  Purge all organization data
                </label>
                <p className="text-xs text-muted-foreground mt-1">
                  When enabled, all associated data (tenants, workspaces, users, policies, tickets, inventory, etc.) will be permanently deleted. When disabled, only the organization record is removed.
                </p>
              </div>
            </div>

            {purgeData && (
              <>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
                  <p className="text-sm font-semibold text-destructive">Data that will be permanently deleted:</p>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Tenant connections ({adminDeleteCounts?.tenantConnections ?? '...'})</li>
                    <li>Workspaces ({adminDeleteCounts?.workspaces ?? '...'})</li>
                    <li>Users & memberships ({adminDeleteCounts?.users ?? '...'} users, {adminDeleteCounts?.memberships ?? '...'} memberships)</li>
                    <li>Governance policies ({adminDeleteCounts?.policies ?? '...'})</li>
                    <li>Support tickets ({adminDeleteCounts?.tickets ?? '...'})</li>
                    <li>Audit log entries ({adminDeleteCounts?.auditEntries ?? '...'})</li>
                    <li>All inventory data, MSP access grants</li>
                  </ul>
                </div>

                <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex gap-2">
                  <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-destructive">
                    This action is immediate and cannot be undone.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Type <strong>{deleteOrgTarget?.name}</strong> to confirm</Label>
                  <Input
                    value={deleteConfirmName}
                    onChange={e => setDeleteConfirmName(e.target.value)}
                    placeholder={deleteOrgTarget?.name || "Organization name"}
                    data-testid="input-delete-confirm-name"
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => { setDeleteOrgTarget(null); setDeleteConfirmName(""); setPurgeData(true); }}
              disabled={deleteOrgMutation.isPending}
              data-testid="button-cancel-delete-org"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteOrgTarget && deleteOrgMutation.mutate(deleteOrgTarget.id)}
              disabled={deleteOrgMutation.isPending || (purgeData && deleteConfirmName !== deleteOrgTarget?.name)}
              className="gap-2"
              data-testid="button-confirm-delete-org"
            >
              {deleteOrgMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              {purgeData ? "Permanently Delete Everything" : "Delete Organization Only"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
