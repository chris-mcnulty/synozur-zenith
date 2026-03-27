import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TenantConnection } from "@shared/schema";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Cloud,
  Search,
  Plus,
  Globe,
  Settings2,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  MoreVertical,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  AlertTriangle,
  ExternalLink,
  Trash2,
  Info,
  LogIn,
  Building2,
  X,
  KeyRound,
  Lock,
  Play,
  Users,
  TicketCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type PermissionDetail = {
  roleId: string;
  name: string;
  description: string;
  feature: string;
  required: boolean;
  licenseNote?: string;
  status: "granted" | "missing";
};

type PermissionCheckResult = {
  granted: string[];
  missing: string[];
  details: PermissionDetail[];
  allGranted: boolean;
  permissionsVersion: number;
};

export default function TenantConnectionsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isInitiating, setIsInitiating] = useState(false);
  const [permDialogTenantId, setPermDialogTenantId] = useState<string | null>(null);
  const [permResult, setPermResult] = useState<PermissionCheckResult | null>(null);
  const [permLoading, setPermLoading] = useState(false);
  const [permError, setPermError] = useState<string | null>(null);
  const [reconsentingId, setReconsentingId] = useState<string | null>(null);
  const [metadataDialogTenantId, setMetadataDialogTenantId] = useState<string | null>(null);
  const [accessDialogTenantId, setAccessDialogTenantId] = useState<string | null>(null);
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [claimCode, setClaimCode] = useState("");

  const [form, setForm] = useState({
    domain: "",
    ownershipType: "MSP",
    adminEmail: "",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("consent_success") === "true") {
      toast({ title: "Tenant Connected", description: "Admin consent was granted. The tenant is now connected to Zenith." });
      window.history.replaceState({}, "", window.location.pathname);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
    }
    const consentError = params.get("consent_error");
    if (consentError) {
      toast({ title: "Consent Failed", description: decodeURIComponent(consentError), variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const { data: connections = [], isLoading } = useQuery<TenantConnection[]>({
    queryKey: ["/api/admin/tenants"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/tenants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant Disconnected", description: "The tenant connection has been removed." });
    },
  });

  const claimAccessMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/admin/tenants/claim-access", { code });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      setShowClaimDialog(false);
      setClaimCode("");
      toast({ title: "Access Granted", description: `You now have access to ${data.tenantName} (${data.tenantDomain}).` });
    },
    onError: (err: any) => {
      toast({ title: "Access Denied", description: err.message, variant: "destructive" });
    },
  });

  const handleInitiateConsent = async () => {
    if (!form.domain.trim()) {
      toast({ title: "Domain Required", description: "Enter the tenant domain to proceed.", variant: "destructive" });
      return;
    }
    setIsInitiating(true);
    try {
      let url = `/api/admin/tenants/consent/initiate?tenantDomain=${encodeURIComponent(form.domain)}&ownershipType=${encodeURIComponent(form.ownershipType)}&returnTo=${encodeURIComponent('/app/admin/tenants')}`;
      if (form.adminEmail.trim()) {
        url += `&adminEmail=${encodeURIComponent(form.adminEmail)}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error || "Failed to initiate consent", variant: "destructive" });
        return;
      }
      window.location.href = data.consentUrl;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setIsInitiating(false);
    }
  };

  const handleCheckPermissions = async (connId: string) => {
    setPermDialogTenantId(connId);
    setPermResult(null);
    setPermError(null);
    setPermLoading(true);
    try {
      const res = await fetch(`/api/admin/tenants/${connId}/permissions`);
      const data = await res.json();
      if (!res.ok) {
        setPermError(data.error || "Failed to check permissions");
      } else {
        setPermResult(data);
        if (!data.allGranted) {
          toast({
            title: "Missing Permissions",
            description: `${data.missing.length} permission(s) need admin consent for this tenant.`,
            variant: "destructive",
          });
        }
      }
    } catch (err: any) {
      setPermError(err.message);
    } finally {
      setPermLoading(false);
    }
  };

  const handleReconsent = async (connId: string) => {
    setReconsentingId(connId);
    try {
      const res = await fetch(`/api/admin/tenants/${connId}/reconsent`);
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error || "Failed to generate re-consent URL", variant: "destructive" });
        return;
      }
      window.location.href = data.consentUrl;
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setReconsentingId(null);
    }
  };

  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);

  const handleEvaluatePolicies = async (id: string) => {
    setEvaluatingId(id);
    try {
      const res = await apiRequest("POST", `/api/admin/tenants/${id}/evaluate-policies`);
      const result = await res.json();
      if (result.error) {
        toast({ title: "Evaluation Error", description: result.error, variant: "destructive" });
      } else if (result.message && result.evaluated === 0) {
        toast({ title: "No Policies", description: result.message });
      } else {
        const policyList = result.policies?.join(", ") || result.policyName || "policies";
        toast({
          title: "Policies Evaluated",
          description: `Evaluated ${result.evaluated} workspaces against ${policyList}. ${result.changed} changed.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      }
    } catch (err: any) {
      toast({ title: "Evaluation Failed", description: err.message, variant: "destructive" });
    } finally {
      setEvaluatingId(null);
    }
  };

  const [syncWarnings, setSyncWarnings] = useState<{ area: string; permission: string; message: string; severity: "error" | "warning" }[]>([]);

  const handleSync = async (id: string) => {
    setSyncingId(id);
    setSyncWarnings([]);
    try {
      const res = await apiRequest("POST", `/api/admin/tenants/${id}/sync`);
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      if (result.success) {
        const warnings = result.permissionWarnings || [];
        if (warnings.length > 0) {
          setSyncWarnings(warnings);
          const errorCount = warnings.filter((w: any) => w.severity === "error").length;
          const warnCount = warnings.filter((w: any) => w.severity === "warning").length;
          toast({
            title: `Sync Complete — ${errorCount + warnCount} Permission Issue${errorCount + warnCount > 1 ? 's' : ''}`,
            description: `Found ${result.sitesFound} sites. ${errorCount > 0 ? `${errorCount} error(s)` : ''}${errorCount > 0 && warnCount > 0 ? ', ' : ''}${warnCount > 0 ? `${warnCount} warning(s)` : ''} — see details below.`,
            variant: "default",
          });
        } else {
          toast({ title: "Sync Complete", description: `Found ${result.sitesFound} SharePoint sites. All permissions OK.` });
        }
      } else {
        toast({ title: "Sync Error", description: result.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
    } finally {
      setSyncingId(null);
    }
  };

  const activeConnections = connections.filter(c => c.status === "ACTIVE").length;
  const errorConnections = connections.filter(c => c.lastSyncStatus?.startsWith("ERROR")).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Tenant Connections</h1>
          <p className="text-muted-foreground mt-1">Connect Microsoft 365 tenants via admin consent using Zenith's multi-tenant app registration.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setShowClaimDialog(true)} data-testid="button-enter-access-code">
            <TicketCheck className="w-4 h-4" />
            Enter Access Code
          </Button>
          <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) setForm({ domain: "", ownershipType: "MSP", adminEmail: "" }); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 shadow-md shadow-primary/20" data-testid="button-connect-tenant">
                <Plus className="w-4 h-4" />
                Connect Tenant
              </Button>
            </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Cloud className="w-5 h-5 text-primary" /> Connect New Tenant</DialogTitle>
              <DialogDescription>
                Connect a Microsoft 365 tenant by granting Zenith admin consent. A Global Administrator of the target tenant will need to approve.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <Card className="bg-muted/30 border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">How this works:</p>
                      <ol className="list-decimal list-inside space-y-0.5 ml-1">
                        <li>Enter the tenant domain below</li>
                        <li>Click <strong>Authenticate & Grant Consent</strong></li>
                        <li>Sign in as a Global Admin of the target tenant</li>
                        <li>Approve the permissions Zenith needs (read-only)</li>
                        <li>You'll be redirected back here once approved</li>
                      </ol>
                      <p className="mt-2 text-[10px] opacity-70">Zenith requests: Sites.Read.All, Group.Read.All, Directory.Read.All, Reports.Read.All, InformationProtectionPolicy.Read.All, RecordsManagement.Read.All (Application permissions, read-only)</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Tenant Domain <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g. contoso.onmicrosoft.com"
                    value={form.domain}
                    onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                    className="font-mono text-sm"
                    data-testid="input-tenant-domain"
                  />
                  <p className="text-[11px] text-muted-foreground">The primary .onmicrosoft.com domain or verified custom domain of the target tenant.</p>
                </div>

                <div className="space-y-2">
                  <Label>Ownership Type</Label>
                  <Select value={form.ownershipType} onValueChange={v => setForm(f => ({ ...f, ownershipType: v }))}>
                    <SelectTrigger data-testid="select-ownership-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MSP">MSP (Synozur Operates)</SelectItem>
                      <SelectItem value="Customer">Customer (Self-Managed)</SelectItem>
                      <SelectItem value="Hybrid">Hybrid (Customer Owns, MSP Operates)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Tenant Admin Email <span className="text-xs text-muted-foreground font-normal">(recommended)</span></Label>
                  <Input
                    placeholder="e.g. admin@cascadiaoceanic.onmicrosoft.com"
                    value={form.adminEmail}
                    onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))}
                    className="font-mono text-sm"
                    data-testid="input-admin-email"
                  />
                  <p className="text-[11px] text-muted-foreground">The email of the Global Admin for the target tenant. This ensures Microsoft prompts you to sign in with the correct account.</p>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button
                onClick={handleInitiateConsent}
                disabled={!form.domain.trim() || isInitiating}
                className="w-full gap-2 h-11"
                data-testid="button-initiate-consent"
              >
                {isInitiating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                Authenticate & Grant Consent
              </Button>
              <p className="text-[10px] text-center text-muted-foreground">
                You will be redirected to Microsoft's consent page for the target tenant.
              </p>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Connected Tenants</CardTitle>
            <Cloud className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-connected-count">{connections.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Registered environments</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Syncs</CardTitle>
            <Activity className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500" data-testid="text-active-count">{activeConnections}</div>
            <p className="text-xs text-muted-foreground mt-1">Successfully syncing</p>
          </CardContent>
        </Card>

        <Card className={`glass-panel ${errorConnections > 0 ? 'border-red-500/20' : 'border-border/50'}`}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className={`text-sm font-medium uppercase tracking-wider ${errorConnections > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>Sync Errors</CardTitle>
            <ShieldAlert className={`w-4 h-4 ${errorConnections > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${errorConnections > 0 ? 'text-red-500' : ''}`} data-testid="text-error-count">{errorConnections}</div>
            <p className={`text-xs mt-1 ${errorConnections > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
              {errorConnections > 0 ? 'Needs attention' : 'No errors'}
            </p>
          </CardContent>
        </Card>
      </div>

      {syncWarnings.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5" data-testid="card-sync-warnings">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              Permission Issues Detected During Sync
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSyncWarnings([])} className="h-6 w-6 p-0" data-testid="button-dismiss-warnings">
              <X className="w-4 h-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <p className="text-xs text-muted-foreground mb-3">
              The following permissions may need to be configured in your Entra app registration for full functionality:
            </p>
            {syncWarnings.map((w, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                  w.severity === "error"
                    ? "border-red-500/30 bg-red-500/5"
                    : "border-amber-500/20 bg-amber-500/5"
                }`}
                data-testid={`warning-item-${i}`}
              >
                {w.severity === "error" ? (
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{w.area}</span>
                    <Badge variant="outline" className="text-[10px] h-5 font-mono">{w.permission}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{w.message}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="glass-panel border-border/50 shadow-xl">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              M365 Environments
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by domain or name..."
                className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-tenants"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : connections.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-center p-6">
              <Cloud className="w-12 h-12 text-muted-foreground/30" />
              <div>
                <p className="font-medium text-foreground">No tenants connected yet</p>
                <p className="text-sm text-muted-foreground mt-1">Click "Connect Tenant" to register your first Microsoft 365 environment via admin consent.</p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-6">Tenant</TableHead>
                  <TableHead>Ownership</TableHead>
                  <TableHead>Consent</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Sites Found</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections
                  .filter(c => !searchTerm || c.tenantName.toLowerCase().includes(searchTerm.toLowerCase()) || c.domain.toLowerCase().includes(searchTerm.toLowerCase()))
                  .map((conn) => (
                  <TableRow key={conn.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-tenant-${conn.id}`}>
                    <TableCell className="pl-6">
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm flex items-center gap-2">
                          {conn.tenantName}
                          {conn.isDemo && (
                            <Badge variant="outline" className="text-[9px] bg-violet-500/10 text-violet-500 border-violet-500/20">DEMO</Badge>
                          )}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground mt-0.5">{conn.domain}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        conn.ownershipType === 'MSP' ? 'bg-primary/10 text-primary border-primary/20 text-[10px]' :
                        conn.ownershipType === 'Customer' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]' :
                        'bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]'
                      }>
                        {conn.ownershipType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {conn.consentGranted ? (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-xs text-emerald-500">Granted</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs text-amber-500">Pending</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground">
                        {conn.lastSyncAt ? new Date(conn.lastSyncAt).toLocaleString() : "Never"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {conn.lastSyncSiteCount != null ? conn.lastSyncSiteCount : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {conn.status === 'ACTIVE' && conn.lastSyncStatus === 'SUCCESS' && (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-xs font-medium text-emerald-500">Healthy</span>
                          </>
                        )}
                        {conn.status === 'ACTIVE' && conn.lastSyncStatus === 'SUCCESS_WITH_WARNINGS' && (
                          <>
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-xs font-medium text-amber-500">Warnings</span>
                          </>
                        )}
                        {conn.status === 'ACTIVE' && conn.lastSyncStatus === 'SUCCESS_WITH_ERRORS' && (
                          <>
                            <ShieldAlert className="w-3.5 h-3.5 text-orange-500" />
                            <span className="text-xs font-medium text-orange-500">Permission Issues</span>
                          </>
                        )}
                        {conn.status === 'ACTIVE' && !conn.lastSyncStatus && (
                          <>
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-xs font-medium text-emerald-500">Connected</span>
                          </>
                        )}
                        {conn.status === 'PENDING' && (
                          <>
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-xs font-medium text-amber-500">Pending</span>
                          </>
                        )}
                        {conn.lastSyncStatus?.startsWith('ERROR') && (
                          <>
                            <XCircle className="w-3.5 h-3.5 text-destructive" />
                            <span className="text-xs font-medium text-destructive">Error</span>
                          </>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => handleSync(conn.id)}
                            disabled={syncingId === conn.id}
                          >
                            {syncingId === conn.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                            {syncingId === conn.id ? "Syncing..." : "Sync Now"}
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => handleCheckPermissions(conn.id)}>
                            <KeyRound className="w-4 h-4" /> Check Permissions
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="gap-2"
                            onClick={() => handleReconsent(conn.id)}
                            disabled={reconsentingId === conn.id}
                          >
                            {reconsentingId === conn.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                            Update Permissions
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => setMetadataDialogTenantId(conn.id)}>
                            <Settings2 className="w-4 h-4" /> Governance Settings
                          </DropdownMenuItem>
                          {conn.ownershipType === "Customer" && (
                            <DropdownMenuItem className="gap-2" onClick={() => setAccessDialogTenantId(conn.id)}>
                              <Users className="w-4 h-4" /> Manage Access
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="gap-2" onClick={() => navigator.clipboard.writeText(conn.tenantId)}>
                            <Copy className="w-4 h-4" /> Copy Tenant ID
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="gap-2 text-destructive focus:text-destructive"
                            onClick={() => {
                              if (confirm("Are you sure you want to disconnect this tenant?")) {
                                deleteMutation.mutate(conn.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" /> Disconnect Tenant
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={permDialogTenantId !== null} onOpenChange={(open) => { if (!open) { setPermDialogTenantId(null); setPermResult(null); setPermError(null); } }}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-primary" />
              Permission Health Check
            </DialogTitle>
            <DialogDescription>
              Shows which Microsoft Graph permissions are consented for this tenant vs. what Zenith requires.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {permLoading && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Checking permissions...</span>
              </div>
            )}
            {permError && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="p-4">
                  <div className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-destructive">Permission check failed</p>
                      <p className="text-xs text-muted-foreground mt-1">{permError}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {permResult && (
              <>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  {permResult.allGranted ? (
                    <>
                      <ShieldCheck className="w-6 h-6 text-emerald-500" />
                      <div>
                        <p className="text-sm font-semibold text-emerald-600" data-testid="text-perm-status">All permissions granted</p>
                        <p className="text-xs text-muted-foreground">{permResult.granted.length} of {permResult.details.length} permissions consented</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="w-6 h-6 text-amber-500" />
                      <div>
                        <p className="text-sm font-semibold text-amber-600" data-testid="text-perm-status">{permResult.missing.length} permission(s) missing</p>
                        <p className="text-xs text-muted-foreground">A tenant admin needs to re-consent to grant the new permissions.</p>
                      </div>
                    </>
                  )}
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Permission</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead className="w-[90px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {permResult.details.map((perm) => (
                      <TableRow key={perm.roleId} data-testid={`row-perm-${perm.name}`}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-xs font-mono font-semibold">{perm.name}</span>
                            <span className="text-[10px] text-muted-foreground">{perm.description}</span>
                            {perm.licenseNote && (
                              <span className="text-[10px] text-amber-600 mt-0.5">{perm.licenseNote}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">{perm.feature}</span>
                        </TableCell>
                        <TableCell>
                          {perm.status === "granted" ? (
                            <div className="flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              <span className="text-xs text-emerald-500">Granted</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <XCircle className="w-3.5 h-3.5 text-red-500" />
                              <span className="text-xs text-red-500">Missing</span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {!permResult.allGranted && permDialogTenantId && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                    <p className="text-xs text-muted-foreground">
                      Click below to redirect to Microsoft's consent page. A Global Administrator of this tenant must approve the updated permissions.
                    </p>
                    <Button
                      onClick={() => handleReconsent(permDialogTenantId)}
                      disabled={reconsentingId === permDialogTenantId}
                      className="gap-2"
                      data-testid="button-reconsent"
                    >
                      {reconsentingId === permDialogTenantId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <LogIn className="w-4 h-4" />
                      )}
                      Update Permissions via Admin Consent
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Governance Settings Dialog */}
      <Dialog open={metadataDialogTenantId !== null} onOpenChange={(open) => { if (!open) setMetadataDialogTenantId(null); }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-primary" />
              Governance Settings
            </DialogTitle>
            <DialogDescription>
              Configure which metadata fields are required for workspaces in this tenant. Required fields feed into the Metadata Complete policy rule.
            </DialogDescription>
          </DialogHeader>
          {metadataDialogTenantId && (
            <RequiredMetadataConfig tenantConnectionId={metadataDialogTenantId} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showClaimDialog} onOpenChange={(open) => { setShowClaimDialog(open); if (!open) setClaimCode(""); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TicketCheck className="w-5 h-5 text-primary" />
              Enter Access Code
            </DialogTitle>
            <DialogDescription>
              Enter the 6-digit access code provided by the tenant owner to gain access to their environment.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="access-code">Access Code</Label>
              <Input
                id="access-code"
                placeholder="000000"
                className="text-center font-mono text-2xl tracking-[0.5em] h-14"
                maxLength={6}
                value={claimCode}
                onChange={(e) => setClaimCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                data-testid="input-access-code"
              />
              <p className="text-xs text-muted-foreground text-center">Codes expire 10 minutes after generation.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowClaimDialog(false); setClaimCode(""); }}>Cancel</Button>
            <Button
              onClick={() => claimAccessMutation.mutate(claimCode)}
              disabled={claimCode.length !== 6 || claimAccessMutation.isPending}
              data-testid="button-submit-access-code"
            >
              {claimAccessMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Claim Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={accessDialogTenantId !== null} onOpenChange={(open) => { if (!open) setAccessDialogTenantId(null); }}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Manage Tenant Access
            </DialogTitle>
            <DialogDescription>
              Control which organizations can access this tenant's data. Generate a 6-digit code to share with an MSP organization.
            </DialogDescription>
          </DialogHeader>
          {accessDialogTenantId && (
            <TenantAccessManager tenantConnectionId={accessDialogTenantId} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface MetadataField {
  field: string;
  label: string;
  description: string;
}

interface RequiredMetadataResponse {
  availableFields: MetadataField[];
  requiredFields: string[];
  entries: Array<{ id: string; value: string }>;
}

function RequiredMetadataConfig({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [localRequired, setLocalRequired] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery<RequiredMetadataResponse>({
    queryKey: [`/api/admin/tenants/${tenantConnectionId}/required-metadata`],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/required-metadata`, { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });

  useEffect(() => {
    if (data) {
      setLocalRequired(data.requiredFields);
      setHasChanges(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (requiredFields: string[]) => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/required-metadata`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requiredFields }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/admin/tenants/${tenantConnectionId}/required-metadata`] });
      setHasChanges(false);
      toast({ title: "Saved", description: "Required metadata fields updated. Workspace evaluations will use the new configuration." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  function toggleField(field: string) {
    setLocalRequired(prev => {
      const next = prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field];
      setHasChanges(true);
      return next;
    });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground py-4">Unable to load metadata configuration.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Toggle fields on to make them required. The <span className="font-medium text-foreground">Metadata Complete</span> policy rule will check that these fields are populated for every workspace.
      </div>
      <div className="space-y-2">
        {data.availableFields.map((f) => (
          <div
            key={f.field}
            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
              localRequired.includes(f.field) ? "bg-primary/5 border-primary/20" : "bg-card/50 border-border/50"
            }`}
            data-testid={`metadata-field-${f.field}`}
          >
            <div className="min-w-0">
              <div className="font-medium text-sm">{f.label}</div>
              <div className="text-xs text-muted-foreground">{f.description}</div>
            </div>
            <Switch
              checked={localRequired.includes(f.field)}
              onCheckedChange={() => toggleField(f.field)}
              data-testid={`switch-require-${f.field}`}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <span className="text-xs text-muted-foreground">
          {localRequired.length} of {data.availableFields.length} fields required
        </span>
        <Button
          onClick={() => saveMutation.mutate(localRequired)}
          disabled={!hasChanges || saveMutation.isPending}
          className="gap-2"
          data-testid="button-save-required-metadata"
        >
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Save Configuration
        </Button>
      </div>
    </div>
  );
}

type AccessGrant = {
  id: string;
  tenantConnectionId: string;
  grantedOrganizationId: string;
  grantedOrganizationName: string;
  status: string;
  createdAt: string;
};

function TenantAccessManager({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [codeExpiry, setCodeExpiry] = useState<Date | null>(null);

  const { data: grants = [], isLoading } = useQuery<AccessGrant[]>({
    queryKey: [`/api/admin/tenants/${tenantConnectionId}/access-grants`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/access-grants`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const generateCodeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/tenants/${tenantConnectionId}/access-codes`);
      return res.json();
    },
    onSuccess: (data: { code: string; expiresAt: string }) => {
      setGeneratedCode(data.code);
      setCodeExpiry(new Date(data.expiresAt));
      toast({ title: "Access Code Generated", description: "Share this code with the MSP organization. It expires in 10 minutes." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (grantId: string) => {
      await apiRequest("DELETE", `/api/admin/tenants/${tenantConnectionId}/access-grants/${grantId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/admin/tenants/${tenantConnectionId}/access-grants`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Access Revoked", description: "The organization no longer has access to this tenant." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/50 bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TicketCheck className="w-4 h-4" />
            Generate Access Code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Generate a one-time 6-digit code that an MSP organization can use to register access to this tenant. Codes expire after 10 minutes.
          </p>
          {generatedCode ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 p-4 bg-background rounded-lg border border-primary/30">
                <span className="font-mono text-3xl tracking-[0.5em] font-bold text-primary" data-testid="text-generated-code">{generatedCode}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => { navigator.clipboard.writeText(generatedCode); toast({ title: "Copied" }); }}
                  data-testid="button-copy-code"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                Expires at {codeExpiry?.toLocaleTimeString()}
              </p>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => { setGeneratedCode(null); generateCodeMutation.mutate(); }}
                disabled={generateCodeMutation.isPending}
                data-testid="button-regenerate-code"
              >
                Generate New Code
              </Button>
            </div>
          ) : (
            <Button
              className="w-full gap-2"
              onClick={() => generateCodeMutation.mutate()}
              disabled={generateCodeMutation.isPending}
              data-testid="button-generate-code"
            >
              {generateCodeMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Generate Access Code
            </Button>
          )}
        </CardContent>
      </Card>

      <div>
        <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4" />
          Organizations with Access ({grants.length})
        </h4>
        {grants.length === 0 ? (
          <div className="text-center py-6 bg-muted/20 rounded-lg border border-border/50">
            <Lock className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground font-medium">No external organizations have access</p>
            <p className="text-xs text-muted-foreground mt-1">This tenant is in customer-only mode. Generate an access code above to grant access to an MSP.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {grants.map((grant) => (
              <div
                key={grant.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/50"
                data-testid={`grant-row-${grant.id}`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm">{grant.grantedOrganizationName}</div>
                  <div className="text-xs text-muted-foreground">
                    Granted {new Date(grant.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => {
                    if (confirm(`Revoke access for ${grant.grantedOrganizationName}? They will no longer be able to view this tenant's data.`)) {
                      revokeMutation.mutate(grant.id);
                    }
                  }}
                  disabled={revokeMutation.isPending}
                  data-testid={`button-revoke-${grant.id}`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
