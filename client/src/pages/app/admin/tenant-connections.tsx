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
  ShieldOff,
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
  Pause,
  Ban,
  Users,
  TicketCheck,
  Timer,
  RefreshCw,
  EyeOff,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useServicePlan } from "@/hooks/use-service-plan";
import { UpgradeGate } from "@/components/upgrade-gate";

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
  const { isTrial, maxSites, isFeatureEnabled: planFeatureEnabled } = useServicePlan();
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
  const [featureSettingsDialogId, setFeatureSettingsDialogId] = useState<string | null>(null);
  const [accessDialogTenantId, setAccessDialogTenantId] = useState<string | null>(null);
  const [showClaimDialog, setShowClaimDialog] = useState(false);
  const [claimCode, setClaimCode] = useState("");

  const [form, setForm] = useState({
    domain: "",
    ownershipType: "Customer",
    installMode: "CUSTOMER",
    adminEmail: "",
  });

  const [mspAccessDialogId, setMspAccessDialogId] = useState<string | null>(null);
  const [mspCodeInput, setMspCodeInput] = useState("");
  const [mspCodeSubmitting, setMspCodeSubmitting] = useState(false);
  const [maskingDialogTenantId, setMaskingDialogTenantId] = useState<string | null>(null);
  const [maskingToggling, setMaskingToggling] = useState(false);
  const [editModeDialogId, setEditModeDialogId] = useState<string | null>(null);
  const [editInstallMode, setEditInstallMode] = useState<string>("MSP");
  const [editModeSubmitting, setEditModeSubmitting] = useState(false);

  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const [deletionSummary, setDeletionSummary] = useState<{ tenantName: string; domain: string; summary: Record<string, number> } | null>(null);
  const [deletionSummaryLoading, setDeletionSummaryLoading] = useState(false);
  const [deleteAcknowledged, setDeleteAcknowledged] = useState(false);
  const [highlightedSuspendedId, setHighlightedSuspendedId] = useState<string | null>(null);

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
    const suspendedId = params.get("suspended");
    if (suspendedId) {
      setHighlightedSuspendedId(suspendedId);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [toast]);

  const { data: connections = [], isLoading } = useQuery<TenantConnection[]>({
    queryKey: ["/api/admin/tenants"],
  });

  // When arriving from a suspension notification deep-link, auto-launch the
  // Microsoft re-consent flow for the affected tenant once connections load.
  useEffect(() => {
    if (!highlightedSuspendedId || connections.length === 0) return;
    const conn = connections.find((c) => c.id === highlightedSuspendedId);
    if (conn && conn.status === "SUSPENDED" && conn.statusReason?.startsWith("Auto-suspended")) {
      setHighlightedSuspendedId(null);
      handleReconsent(conn.id);
    }
  }, [connections, highlightedSuspendedId]);

  const { data: maskingStatus } = useQuery<{ enabled: boolean; hasKey: boolean }>({
    queryKey: ["/api/admin/tenants", maskingDialogTenantId, "data-masking"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${maskingDialogTenantId}/data-masking`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch masking status");
      return res.json();
    },
    enabled: !!maskingDialogTenantId,
  });

  const handleToggleMasking = async (tenantId: string, enable: boolean) => {
    setMaskingToggling(true);
    try {
      const res = await apiRequest("POST", `/api/admin/tenants/${tenantId}/data-masking`, { enabled: enable });
      const result = await res.json();
      if (result.success) {
        toast({
          title: enable ? "Data Masking Enabled" : "Data Masking Disabled",
          description: `${result.recordsProcessed} records were ${enable ? "encrypted" : "decrypted"}.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantId, "data-masking"] });
      } else {
        toast({ title: "Partial Success", description: `Processed ${result.recordsProcessed} records with ${result.errors?.length || 0} errors.`, variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to toggle data masking", variant: "destructive" });
    } finally {
      setMaskingToggling(false);
      setMaskingDialogTenantId(null);
    }
  };

  const handleSaveInstallMode = async () => {
    if (!editModeDialogId) return;
    setEditModeSubmitting(true);
    try {
      const res = await apiRequest("PATCH", `/api/admin/tenants/${editModeDialogId}`, { installMode: editInstallMode });
      if (!res.ok) throw new Error("Failed to update access mode");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Access Mode Updated", description: `Tenant is now in ${editInstallMode} mode.` });
      setEditModeDialogId(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to update access mode", variant: "destructive" });
    } finally {
      setEditModeSubmitting(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/tenants/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      toast({ title: "Tenant Disconnected", description: "The tenant connection has been removed." });
    },
  });

  const [statusDialog, setStatusDialog] = useState<{ id: string; tenantName: string; from: string; to: "SUSPENDED" | "ACTIVE" | "REVOKED" } | null>(null);
  const [statusReason, setStatusReason] = useState("");

  const statusTransitionMutation = useMutation({
    mutationFn: async (vars: { id: string; status: string; reason?: string }) => {
      const body: any = { status: vars.status };
      if (vars.reason) body.statusReason = vars.reason;
      const res = await apiRequest("PATCH", `/api/admin/tenants/${vars.id}`, body);
      return res.json();
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      setStatusDialog(null);
      setStatusReason("");
      toast({
        title: vars.status === "ACTIVE" ? "Tenant Reactivated" : vars.status === "SUSPENDED" ? "Tenant Suspended" : "Tenant Revoked",
        description: vars.status === "ACTIVE"
          ? "Sync and governance operations are re-enabled."
          : vars.status === "SUSPENDED"
          ? "Sync and governance operations are blocked. Reactivate to resume."
          : "All credentials have been cleared. This action is irreversible.",
      });
    },
    onError: (err: any) => {
      toast({ title: "Status Change Failed", description: err.message, variant: "destructive" });
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

  const handleRedeemCode = async (tenantConnectionId: string) => {
    const code = mspCodeInput.trim();
    if (!code || code.length !== 6) {
      toast({ title: "Invalid Code", description: "Please enter a valid 6-digit code.", variant: "destructive" });
      return;
    }
    setMspCodeSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/admin/tenants/claim-access", { code });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Code Failed", description: data.error || "Invalid or expired code.", variant: "destructive" });
        return;
      }
      toast({ title: "Access Granted", description: "You now have access to this tenant." });
      setMspCodeInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setMspCodeSubmitting(false);
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
          const capNote = result.sitesCapApplied ? ` Trial plan cap applied (${result.sitesFound?.toLocaleString()} of ${result.sitesDiscovered?.toLocaleString()} sites shown).` : "";
          toast({
            title: `Sync Complete — ${errorCount + warnCount} Permission Issue${errorCount + warnCount > 1 ? 's' : ''}`,
            description: `Found ${result.sitesFound} sites.${capNote} ${errorCount > 0 ? `${errorCount} error(s)` : ''}${errorCount > 0 && warnCount > 0 ? ', ' : ''}${warnCount > 0 ? `${warnCount} warning(s)` : ''} — see details below.`,
            variant: "default",
          });
        } else {
          const capNote = result.sitesCapApplied ? ` Trial plan cap: showing ${result.sitesFound?.toLocaleString()} of ${result.sitesDiscovered?.toLocaleString()} discovered sites.` : "";
          toast({ title: "Sync Complete", description: `Found ${result.sitesFound} SharePoint sites.${capNote}${capNote ? "" : " All permissions OK."}` });
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
          <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) setForm({ domain: "", ownershipType: "Customer", installMode: "CUSTOMER", adminEmail: "" }); }}>
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
                      <SelectItem value="MSP">Managed Service Provider (MSP)</SelectItem>
                      <SelectItem value="Customer">Customer (Self-Managed)</SelectItem>
                      <SelectItem value="Hybrid">Hybrid (Customer Owns, MSP Operates)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Install Mode</Label>
                  <Select value={form.installMode} onValueChange={v => setForm(f => ({ ...f, installMode: v }))}>
                    <SelectTrigger data-testid="select-install-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MSP">Direct — Your organization manages this tenant</SelectItem>
                      <SelectItem value="CUSTOMER">Customer — Tenant owner controls external access</SelectItem>
                      <SelectItem value="HYBRID">Hybrid — Jointly managed with partner</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">In Customer mode the tenant owner must issue a consent code before any external organization can see their data in Zenith.</p>
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
          {connections
            .filter(c => c.status === 'SUSPENDED' && c.statusReason?.startsWith('Auto-suspended'))
            .map(c => (
              <div
                key={`auto-suspend-banner-${c.id}`}
                className="mx-4 mt-4 mb-2 flex flex-col sm:flex-row sm:items-center gap-3 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm"
                data-testid={`banner-auto-suspended-${c.id}`}
              >
                <ShieldAlert className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-red-700 dark:text-red-300">
                    Tenant auto-suspended: <span className="font-bold">{c.tenantName}</span>
                  </p>
                  <p className="text-red-600 dark:text-red-400 text-xs mt-0.5 break-words">
                    Admin consent was revoked or expired. Sync and governance are paused.
                    {c.statusReason ? (
                      <span className="block mt-0.5 font-mono opacity-75 truncate" title={c.statusReason}>
                        {c.statusReason}
                      </span>
                    ) : null}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  className="shrink-0"
                  disabled={reconsentingId === c.id}
                  onClick={() => handleReconsent(c.id)}
                  data-testid={`button-reconsent-suspended-${c.id}`}
                >
                  {reconsentingId === c.id ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  ) : (
                    <Lock className="w-4 h-4 mr-1" />
                  )}
                  Re-consent
                </Button>
              </div>
            ))
          }
          {isTrial && maxSites > 0 && connections.some(c => (c.lastSyncSiteCount ?? 0) > maxSites) && (
            <div className="mx-4 mt-4 mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400" data-testid="banner-trial-site-cap">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Trial plan: site inventory capped at {maxSites.toLocaleString()} sites per tenant.{" "}
                <strong>Upgrade your plan</strong> to sync all discovered sites.
              </span>
            </div>
          )}
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
                  <TableHead>Install Mode</TableHead>
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
                  .map((conn) => {
                  const isBlocked = (conn as any).mspAccessDenied;
                  return (
                  <TableRow key={conn.id} className={`hover:bg-muted/10 transition-colors ${isBlocked ? 'opacity-60' : ''} ${highlightedSuspendedId === conn.id ? 'ring-2 ring-inset ring-red-500/50 bg-red-500/5' : ''}`} data-testid={`row-tenant-${conn.id}`}>
                    <TableCell className="pl-6">
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm flex items-center gap-2">
                          {conn.tenantName}
                          {conn.isDemo && (
                            <Badge variant="outline" className="text-[9px] bg-violet-500/10 text-violet-500 border-violet-500/20">DEMO</Badge>
                          )}
                          {isBlocked && (
                            <Badge variant="outline" className="text-[9px] bg-orange-500/10 text-orange-600 border-orange-500/20 flex items-center gap-1">
                              <ShieldOff className="w-2.5 h-2.5" /> Access Restricted
                            </Badge>
                          )}
                        </span>
                        <span className="text-xs font-mono text-muted-foreground mt-0.5">{conn.domain}</span>
                        {isBlocked && (
                          <span className="text-[10px] text-orange-500 mt-0.5">This tenant has not consented to allow MSP access to their data.</span>
                        )}
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
                      <Badge variant="outline" className={
                        (conn as any).installMode === 'CUSTOMER' ? 'bg-orange-500/10 text-orange-600 border-orange-500/20 text-[10px]' :
                        (conn as any).installMode === 'HYBRID' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]' :
                        'bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px]'
                      }>
                        {(conn as any).installMode === 'MSP' || !(conn as any).installMode ? 'Direct' : (conn as any).installMode === 'CUSTOMER' ? 'Customer' : (conn as any).installMode}
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
                      {conn.lastSyncSiteCount != null ? (
                        isTrial && maxSites > 0 && conn.lastSyncSiteCount > maxSites ? (
                          <span className="text-amber-600" title={`Trial cap applied: showing ${maxSites.toLocaleString()} of ${conn.lastSyncSiteCount.toLocaleString()} discovered`}>
                            {maxSites.toLocaleString()} <span className="text-xs font-normal text-amber-500/80">of {conn.lastSyncSiteCount.toLocaleString()}</span>
                          </span>
                        ) : conn.lastSyncSiteCount
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5" data-testid={`status-tenant-${conn.id}`} title={(conn as any).statusReason || ""}>
                        {conn.status === 'SUSPENDED' && (
                          <>
                            <Pause className="w-3.5 h-3.5 text-amber-600" />
                            <span className="text-xs font-medium text-amber-600">Suspended</span>
                          </>
                        )}
                        {conn.status === 'REVOKED' && (
                          <>
                            <Ban className="w-3.5 h-3.5 text-destructive" />
                            <span className="text-xs font-medium text-destructive">Revoked</span>
                          </>
                        )}
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
                        {conn.status === 'ACTIVE' && conn.lastSyncStatus?.startsWith('ERROR') && (
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
                          {!isBlocked && (
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => handleSync(conn.id)}
                              disabled={syncingId === conn.id}
                            >
                              {syncingId === conn.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                              {syncingId === conn.id ? "Syncing..." : "Sync Now"}
                            </DropdownMenuItem>
                          )}
                          {!isBlocked && (
                            <DropdownMenuItem className="gap-2" onClick={() => handleCheckPermissions(conn.id)}>
                              <KeyRound className="w-4 h-4" /> Check Permissions
                            </DropdownMenuItem>
                          )}
                          {!isBlocked && (
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => handleReconsent(conn.id)}
                              disabled={reconsentingId === conn.id}
                            >
                              {reconsentingId === conn.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                              Update Permissions
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="gap-2" onClick={() => { setEditModeDialogId(conn.id); setEditInstallMode((conn as any).installMode || "MSP"); }}>
                            <ShieldCheck className="w-4 h-4" /> Access Mode
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2" onClick={() => { setMspAccessDialogId(conn.id); setMspCodeInput(""); }}>
                            <Users className="w-4 h-4" /> MSP Access
                          </DropdownMenuItem>
                          {!isBlocked && (
                            <DropdownMenuItem className="gap-2" onClick={() => setMetadataDialogTenantId(conn.id)}>
                              <Settings2 className="w-4 h-4" /> Governance Settings
                            </DropdownMenuItem>
                          )}
                          {!isBlocked && (
                            <DropdownMenuItem className="gap-2" onClick={() => setMaskingDialogTenantId(conn.id)} data-testid={`button-data-masking-${conn.id}`}>
                              <EyeOff className="w-4 h-4" /> Data Masking
                            </DropdownMenuItem>
                          )}
                          {!isBlocked && (
                            <DropdownMenuItem className="gap-2" onClick={() => setFeatureSettingsDialogId(conn.id)} data-testid={`button-feature-settings-${conn.id}`}>
                              <Activity className="w-4 h-4" /> Feature Settings
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="gap-2" onClick={() => navigator.clipboard.writeText(conn.tenantId)}>
                            <Copy className="w-4 h-4" /> Copy Tenant ID
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {conn.status === 'ACTIVE' && (
                            <DropdownMenuItem
                              className="gap-2"
                              data-testid={`button-suspend-tenant-${conn.id}`}
                              onClick={() => setStatusDialog({ id: conn.id, tenantName: conn.tenantName, from: conn.status, to: 'SUSPENDED' })}
                            >
                              <Pause className="w-4 h-4 text-amber-600" /> Suspend Tenant
                            </DropdownMenuItem>
                          )}
                          {conn.status === 'SUSPENDED' && (
                            <DropdownMenuItem
                              className="gap-2"
                              data-testid={`button-reactivate-tenant-${conn.id}`}
                              onClick={() => statusTransitionMutation.mutate({ id: conn.id, status: 'ACTIVE' })}
                            >
                              <Play className="w-4 h-4 text-emerald-600" /> Reactivate Tenant
                            </DropdownMenuItem>
                          )}
                          {(conn.status === 'ACTIVE' || conn.status === 'SUSPENDED' || conn.status === 'PENDING') && (
                            <DropdownMenuItem
                              className="gap-2 text-destructive focus:text-destructive"
                              data-testid={`button-revoke-tenant-${conn.id}`}
                              onClick={() => setStatusDialog({ id: conn.id, tenantName: conn.tenantName, from: conn.status, to: 'REVOKED' })}
                            >
                              <Ban className="w-4 h-4" /> Revoke Tenant
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="gap-2 text-destructive focus:text-destructive"
                            data-testid={`button-delete-tenant-${conn.id}`}
                            onClick={async () => {
                              setDeleteDialogId(conn.id);
                              setDeletionSummary(null);
                              setDeletionSummaryLoading(true);
                              setDeleteAcknowledged(false);
                              try {
                                const res = await apiRequest("GET", `/api/admin/tenants/${conn.id}/deletion-summary`);
                                const data = await res.json();
                                setDeletionSummary(data);
                              } catch {
                                setDeletionSummary(null);
                              } finally {
                                setDeletionSummaryLoading(false);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4" /> Disconnect Tenant
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={statusDialog !== null} onOpenChange={(open) => { if (!open) { setStatusDialog(null); setStatusReason(""); } }}>
        <DialogContent className="sm:max-w-[500px]" data-testid="dialog-status-transition">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {statusDialog?.to === 'REVOKED' ? <Ban className="w-5 h-5 text-destructive" /> : <Pause className="w-5 h-5 text-amber-600" />}
              {statusDialog?.to === 'REVOKED' ? 'Revoke Tenant' : 'Suspend Tenant'}
            </DialogTitle>
            <DialogDescription>
              {statusDialog?.to === 'REVOKED' ? (
                <>
                  Permanently revoke <strong>{statusDialog?.tenantName}</strong>. This clears stored credentials, blocks all sync and governance operations, and cannot be undone without Platform Owner override. Workspace data is retained for audit but hidden from operators.
                </>
              ) : (
                <>
                  Suspend <strong>{statusDialog?.tenantName}</strong>. All sync and governance mutations will be blocked until you reactivate the tenant. Workspace data is retained.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="status-reason">Reason <span className="text-destructive">*</span></Label>
            <Input
              id="status-reason"
              data-testid="input-status-reason"
              placeholder={statusDialog?.to === 'REVOKED' ? "e.g. Customer offboarded, contract ended" : "e.g. Payment lapsed, awaiting consent renewal"}
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setStatusDialog(null); setStatusReason(""); }} data-testid="button-cancel-status">Cancel</Button>
            <Button
              variant={statusDialog?.to === 'REVOKED' ? "destructive" : "default"}
              data-testid="button-confirm-status"
              disabled={!statusReason.trim() || statusTransitionMutation.isPending}
              onClick={() => statusDialog && statusTransitionMutation.mutate({ id: statusDialog.id, status: statusDialog.to, reason: statusReason.trim() })}
            >
              {statusTransitionMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {statusDialog?.to === 'REVOKED' ? 'Revoke Tenant' : 'Suspend Tenant'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                          ) : !perm.required ? (
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                              <span className="text-xs text-amber-500">Optional</span>
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

      {/* Data Masking Dialog */}
      <Dialog open={maskingDialogTenantId !== null} onOpenChange={(open) => { if (!open) setMaskingDialogTenantId(null); }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="dialog-title-data-masking">
              <EyeOff className="w-5 h-5 text-primary" />
              Data Masking
            </DialogTitle>
            <DialogDescription>
              When enabled, sensitive text fields (site names, team names, user names, file names, URLs) are encrypted in the database using AES-256 encryption. The application continues to display real values to authorized users.
            </DialogDescription>
          </DialogHeader>
          {maskingDialogTenantId && (
            <div className="space-y-4 py-2">
              {!planFeatureEnabled("dataMasking") ? (
                <>
                  <UpgradeGate feature="dataMasking" />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setMaskingDialogTenantId(null)} data-testid="button-masking-cancel">
                      Close
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/30">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Database Masking</p>
                      <p className="text-xs text-muted-foreground">
                        {maskingStatus?.enabled
                          ? "Sensitive fields are currently encrypted in the database."
                          : "Sensitive fields are stored as plaintext in the database."}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {maskingStatus?.enabled ? (
                        <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-200" data-testid="badge-masking-enabled">Enabled</Badge>
                      ) : (
                        <Badge variant="secondary" data-testid="badge-masking-disabled">Disabled</Badge>
                      )}
                    </div>
                  </div>

                  <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <div className="text-xs text-amber-800 dark:text-amber-200">
                        {maskingStatus?.enabled
                          ? "Disabling masking will decrypt all data back to plaintext in the database. This operation may take a few moments for large datasets."
                          : "Enabling masking will encrypt all existing sensitive data for this tenant. This operation may take a few moments for large datasets. Anyone querying the database directly will see encrypted values."}
                      </div>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setMaskingDialogTenantId(null)} data-testid="button-masking-cancel">
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleToggleMasking(maskingDialogTenantId, !maskingStatus?.enabled)}
                      disabled={maskingToggling}
                      variant={maskingStatus?.enabled ? "destructive" : "default"}
                      data-testid="button-masking-toggle"
                    >
                      {maskingToggling ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-2" />
                          {maskingStatus?.enabled ? "Decrypting..." : "Encrypting..."}
                        </>
                      ) : (
                        maskingStatus?.enabled ? "Disable Masking" : "Enable Masking"
                      )}
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Access Mode Dialog */}
      <Dialog open={editModeDialogId !== null} onOpenChange={(open) => { if (!open) setEditModeDialogId(null); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Access Mode
            </DialogTitle>
            <DialogDescription>
              Controls how other organizations can access this tenant's data in Zenith.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Install Mode</Label>
              <Select value={editInstallMode} onValueChange={setEditInstallMode}>
                <SelectTrigger data-testid="select-install-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MSP">Direct — Your organization manages this tenant</SelectItem>
                  <SelectItem value="CUSTOMER">Customer — Tenant owner controls external access</SelectItem>
                  <SelectItem value="HYBRID">Hybrid — Jointly managed with partner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2 text-xs text-muted-foreground">
              {editInstallMode === "MSP" && (
                <p><strong>Direct:</strong> Your organization registered and directly manages this tenant. Other Zenith organizations cannot see it without platform-level access.</p>
              )}
              {editInstallMode === "CUSTOMER" && (
                <p><strong>Customer:</strong> The tenant owner controls who can see their data in Zenith. MSP organizations must enter a time-limited consent code (generated by the tenant owner) to gain access.</p>
              )}
              {editInstallMode === "HYBRID" && (
                <p><strong>Hybrid:</strong> Both your organization and an MSP partner can access this tenant without a consent gate. Useful for shared responsibility models.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModeDialogId(null)}>Cancel</Button>
            <Button onClick={handleSaveInstallMode} disabled={editModeSubmitting} data-testid="button-save-install-mode">
              {editModeSubmitting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
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

      {/* MSP Access Dialog — two modes: customer (grant/revoke) or MSP (blocked, enter code) */}
      <Dialog open={mspAccessDialogId !== null} onOpenChange={(open) => { if (!open) { setMspAccessDialogId(null); setMspCodeInput(""); } }}>
        <DialogContent className="sm:max-w-[550px]">
          {mspAccessDialogId && (() => {
            const conn = connections.find(c => c.id === mspAccessDialogId);
            const isBlocked = conn && (conn as any).mspAccessDenied;
            if (!conn) return null;
            if (isBlocked) {
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <ShieldOff className="w-5 h-5 text-orange-500" />
                      MSP Access Required
                    </DialogTitle>
                    <DialogDescription>
                      This tenant has not consented to allow MSP access to their data.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <Card className="border-orange-500/20 bg-orange-500/5">
                      <CardContent className="p-4">
                        <div className="flex items-start gap-2">
                          <ShieldOff className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-orange-600">Access Restricted</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              This tenant operates in Customer mode. Ask the customer to generate a 6-digit access code from their MSP Access settings, then enter it below.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <div className="space-y-2">
                      <Label>6-Digit Access Code</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="000000"
                          value={mspCodeInput}
                          onChange={e => setMspCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          className="font-mono text-center text-2xl tracking-widest h-12"
                          maxLength={6}
                          data-testid="input-msp-access-code"
                        />
                        <Button
                          onClick={() => handleRedeemCode(mspAccessDialogId)}
                          disabled={mspCodeInput.length !== 6 || mspCodeSubmitting}
                          className="h-12 px-6"
                          data-testid="button-submit-msp-code"
                        >
                          {mspCodeSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit Code"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">The code expires 10 minutes after it was generated.</p>
                    </div>
                  </div>
                </>
              );
            }
            const installMode = (conn as any).installMode || "MSP";
            if (installMode !== "CUSTOMER") {
              return (
                <>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-primary" />
                      MSP Access — {conn.tenantName}
                    </DialogTitle>
                    <DialogDescription>
                      Consent-based access gates only apply to Customer-mode tenants. This tenant is in <strong>{installMode === 'MSP' ? 'Direct' : installMode}</strong> mode.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-2 space-y-3">
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-sm text-muted-foreground">
                      {installMode === "MSP" ? (
                        <p>This tenant is registered and directly managed by your organization. No consent gates apply — access is governed by Zenith platform membership and RBAC roles.</p>
                      ) : (
                        <p>This tenant is jointly managed between your organization and an MSP partner. Both parties have unrestricted access — no consent gate applies.</p>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      To require tenant owners to issue a consent code before external MSP orgs can see their data, change this tenant to <strong>Customer mode</strong> via <em>Access Mode</em> in the tenant menu.
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setMspAccessDialogId(null)}>Close</Button>
                    <Button variant="default" onClick={() => { setMspAccessDialogId(null); setEditModeDialogId(conn.id); setEditInstallMode(installMode); }}>
                      <ShieldCheck className="w-4 h-4 mr-2" /> Change Access Mode
                    </Button>
                  </DialogFooter>
                </>
              );
            }
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    MSP Access — {conn.tenantName}
                  </DialogTitle>
                  <DialogDescription>
                    Manage which MSP organizations have access to this customer-mode tenant.
                  </DialogDescription>
                </DialogHeader>
                {planFeatureEnabled("mspAccess") ? (
                  <MspAccessPanel tenantConnectionId={mspAccessDialogId} />
                ) : (
                  <UpgradeGate feature="mspAccess" />
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogId !== null} onOpenChange={(open) => { if (!open) { setDeleteDialogId(null); setDeletionSummary(null); setDeleteAcknowledged(false); } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Disconnect Tenant
            </DialogTitle>
            <DialogDescription>
              This action will permanently remove the tenant connection and all associated data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            {deletionSummaryLoading ? (
              <div className="flex items-center justify-center py-8" data-testid="loading-deletion-summary">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mr-2" />
                <span className="text-sm text-muted-foreground">Calculating data to be removed...</span>
              </div>
            ) : deletionSummary ? (
              <div className="space-y-3">
                <div className="text-sm font-medium">
                  Tenant: <span className="text-foreground">{deletionSummary.tenantName}</span>
                  <span className="text-muted-foreground ml-1">({deletionSummary.domain})</span>
                </div>
                {(() => {
                  const labels: Record<string, string> = {
                    sites: "Sites / Workspaces",
                    documentLibraries: "Document Libraries",
                    speContainerTypes: "SPE Container Types",
                    speContainers: "SPE Containers",
                    teamsTeams: "Teams",
                    teamsChannels: "Channels",
                    teamsRecordings: "Teams Recordings",
                    teamsDiscoveryRuns: "Discovery Runs",
                    onedriveInventory: "OneDrive Inventory",
                    contentTypes: "Content Types",
                    workspaceTelemetry: "Telemetry Snapshots",
                    provisioningRequests: "Provisioning Requests",
                    mspAccessGrants: "MSP Access Grants",
                    tenantAccessGrants: "Access Grants",
                    tenantAccessCodes: "Access Codes",
                    departments: "Departments",
                    dataDictionaries: "Data Dictionary Entries",
                    sensitivityLabels: "Sensitivity Labels",
                    retentionLabels: "Retention Labels",
                    customFields: "Custom Field Definitions",
                    governancePolicies: "Governance Policies",
                    graphTokens: "Graph Tokens",
                  };
                  const nonZero = Object.entries(deletionSummary.summary).filter(([, v]) => v > 0);
                  const totalItems = nonZero.reduce((sum, [, v]) => sum + v, 0);
                  return (
                    <>
                      {nonZero.length > 0 ? (
                        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                          <div className="text-sm font-medium text-destructive mb-2">
                            The following data ({totalItems.toLocaleString()} items) will be permanently deleted:
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            {nonZero.map(([key, count]) => (
                              <div key={key} className="flex items-center justify-between text-sm py-0.5" data-testid={`deletion-count-${key}`}>
                                <span className="text-muted-foreground">{labels[key] || key}</span>
                                <span className="font-medium tabular-nums">{count.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-lg border p-3 text-sm text-muted-foreground">
                          No additional data is associated with this tenant connection.
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Unable to load deletion summary. You can still proceed with deletion.
              </div>
            )}
          </div>
          {!deletionSummaryLoading && (
            <label className="flex items-start gap-2 cursor-pointer select-none" data-testid="label-acknowledge-delete">
              <input
                type="checkbox"
                checked={deleteAcknowledged}
                onChange={(e) => setDeleteAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border accent-destructive"
                data-testid="checkbox-acknowledge-delete"
              />
              <span className="text-sm text-muted-foreground">
                I understand that this action is permanent and all associated data will be irreversibly deleted.
              </span>
            </label>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => { setDeleteDialogId(null); setDeletionSummary(null); setDeleteAcknowledged(false); }}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending || deletionSummaryLoading || !deleteAcknowledged}
              onClick={() => {
                if (deleteDialogId) {
                  deleteMutation.mutate(deleteDialogId, {
                    onSuccess: () => {
                      setDeleteDialogId(null);
                      setDeletionSummary(null);
                      setDeleteAcknowledged(false);
                    },
                  });
                }
              }}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Permanently Delete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={featureSettingsDialogId !== null} onOpenChange={(open) => { if (!open) setFeatureSettingsDialogId(null); }}>
        <DialogContent className="sm:max-w-[650px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" data-testid="text-feature-settings-title">
              <Activity className="w-5 h-5 text-primary" />
              Feature Settings
            </DialogTitle>
            <DialogDescription>
              Enable or disable data-gathering modules for this tenant. Disabling a feature will cancel any running scan and optionally purge all gathered data.
            </DialogDescription>
          </DialogHeader>
          {featureSettingsDialogId && (
            <FeatureSettingsPanel tenantConnectionId={featureSettingsDialogId} />
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

interface MspGrant {
  id: string;
  tenantConnectionId: string;
  grantingOrgId: string;
  grantedToOrgId: string | null;
  grantedToOrgName: string | null;
  accessCode: string;
  codeExpiresAt: string;
  status: string;
  grantedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

function MspAccessPanel({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [generatedCode, setGeneratedCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [countdown, setCountdown] = useState<number>(0);
  const [revoking, setRevoking] = useState<string | null>(null);

  const { data: grants = [], isLoading } = useQuery<MspGrant[]>({
    queryKey: [`/api/admin/tenants/${tenantConnectionId}/msp-access/grants`],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/msp-access/grants`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    refetchInterval: generatedCode ? 10000 : false,
  });

  useEffect(() => {
    if (!generatedCode) { setCountdown(0); return; }
    const calcRemaining = () => Math.max(0, Math.round((new Date(generatedCode.expiresAt).getTime() - Date.now()) / 1000));
    setCountdown(calcRemaining());
    const interval = setInterval(() => {
      const remaining = calcRemaining();
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        setGeneratedCode(null);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [generatedCode]);

  const handleGenerateCode = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/msp-access/code`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Error", description: data.error || "Failed to generate code", variant: "destructive" });
        return;
      }
      setGeneratedCode({ code: data.code, expiresAt: data.expiresAt });
      qc.invalidateQueries({ queryKey: [`/api/admin/tenants/${tenantConnectionId}/msp-access/grants`] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (grantId: string) => {
    if (!confirm("Revoke this access? The MSP will immediately lose access to this tenant.")) return;
    setRevoking(grantId);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/msp-access/grants/${grantId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        toast({ title: "Error", description: data.error || "Failed to revoke", variant: "destructive" });
        return;
      }
      toast({ title: "Access Revoked", description: "MSP access has been revoked." });
      qc.invalidateQueries({ queryKey: [`/api/admin/tenants/${tenantConnectionId}/msp-access/grants`] });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setRevoking(null);
    }
  };

  const activeGrants = grants.filter(g => g.status === "ACTIVE");
  const fmt = (d: string | null) => d ? new Date(d).toLocaleString() : "—";
  const fmtCountdown = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Generate Access Code</h4>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateCode}
            disabled={generating}
            className="gap-2"
            data-testid="button-generate-access-code"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {generatedCode ? "Regenerate Code" : "Generate Code"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Share this code with the MSP. It expires in 10 minutes.</p>
        {generatedCode && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-3xl font-mono font-bold tracking-[0.3em] text-primary" data-testid="text-generated-code">
                    {generatedCode.code}
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                    <Timer className="w-3.5 h-3.5" />
                    {countdown > 0 ? `Expires in ${fmtCountdown(countdown)}` : "Expired"}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(generatedCode.code)}
                  className="gap-2"
                  data-testid="button-copy-access-code"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="space-y-2 border-t border-border/50 pt-4">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Users className="w-4 h-4" />
          Organizations with Access
          {activeGrants.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">{activeGrants.length}</Badge>
          )}
        </h4>
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        ) : activeGrants.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3 text-center">No organizations currently have access.</p>
        ) : (
          <div className="space-y-2">
            {activeGrants.map(grant => (
              <div key={grant.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/50" data-testid={`grant-row-${grant.id}`}>
                <div className="min-w-0">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    {grant.grantedToOrgName || grant.grantedToOrgId || "Unknown Org"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">Granted {fmt(grant.grantedAt)}</div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive gap-1.5"
                  onClick={() => handleRevoke(grant.id)}
                  disabled={revoking === grant.id}
                  data-testid={`button-revoke-grant-${grant.id}`}
                >
                  {revoking === grant.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
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

const FEATURE_KEYS = [
  { key: "onedriveInventory", label: "OneDrive Inventory", description: "Discover and inventory all OneDrive for Business drives in the tenant." },
  { key: "recordingsDiscovery", label: "Meeting Recordings Discovery", description: "Scan Teams channels and OneDrive folders for meeting recordings and transcripts." },
  { key: "teamsDiscovery", label: "Teams & Channels Discovery", description: "Discover all Teams and Channels with rich properties and metadata." },
  { key: "telemetry", label: "Workspace Telemetry", description: "Capture storage usage, file counts, and activity telemetry for SharePoint sites." },
  { key: "speDiscovery", label: "SPE Container Discovery", description: "Discover and monitor SharePoint Embedded containers and their usage." },
  { key: "contentGovernance", label: "Content Governance Reporting", description: "Scan sharing links, risk assessments, and governance review findings across SharePoint and OneDrive." },
  { key: "licensing", label: "Licensing Reporting", description: "Track and report on Microsoft 365 license assignments and usage." },
] as const;

function FeatureSettingsPanel({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmDisable, setConfirmDisable] = useState<string | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<string | null>(null);
  const [purging, setPurging] = useState<string | null>(null);

  const { data: toggles, isLoading: togglesLoading } = useQuery<Record<string, { enabled: boolean; label: string }>>({
    queryKey: [`/api/admin/tenants/${tenantConnectionId}/feature-toggles`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/feature-toggles`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });

  const { data: dataCounts, refetch: refetchCounts } = useQuery<Record<string, number>>({
    queryKey: [`/api/admin/tenants/${tenantConnectionId}/data-counts`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/data-counts`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ feature, enabled }: { feature: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/tenants/${tenantConnectionId}/feature-toggles/${feature}`, { enabled });
      return res.json();
    },
    onSuccess: (_, { feature, enabled }) => {
      qc.invalidateQueries({ queryKey: [`/api/admin/tenants/${tenantConnectionId}/feature-toggles`] });
      qc.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      const label = FEATURE_KEYS.find(f => f.key === feature)?.label || feature;
      toast({ title: enabled ? "Feature Enabled" : "Feature Disabled", description: `${label} has been ${enabled ? "enabled" : "disabled"}.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: async (section: string) => {
      setPurging(section);
      const res = await apiRequest("DELETE", `/api/admin/tenants/${tenantConnectionId}/data/${section}`);
      return res.json();
    },
    onSuccess: (data: { recordsDeleted: number; label: string }) => {
      setPurging(null);
      setConfirmPurge(null);
      setConfirmDisable(null);
      refetchCounts();
      qc.invalidateQueries({ queryKey: [`/api/admin/tenants/${tenantConnectionId}/feature-toggles`] });
      toast({ title: "Data Purged", description: `${data.recordsDeleted} ${data.label} records deleted.` });
    },
    onError: (err: any) => {
      setPurging(null);
      toast({ title: "Purge Failed", description: err.message, variant: "destructive" });
    },
  });

  const handleToggle = (feature: string, newEnabled: boolean) => {
    if (!newEnabled) {
      setConfirmDisable(feature);
    } else {
      toggleMutation.mutate({ feature, enabled: true });
    }
  };

  const handleConfirmDisable = (purgeData: boolean) => {
    if (!confirmDisable) return;
    toggleMutation.mutate({ feature: confirmDisable, enabled: false });
    if (purgeData) {
      purgeMutation.mutate(confirmDisable);
    } else {
      setConfirmDisable(null);
    }
  };

  if (togglesLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {confirmDisable && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium" data-testid="text-confirm-disable">
                  Disable {FEATURE_KEYS.find(f => f.key === confirmDisable)?.label}?
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Any running scan will be cancelled. Would you also like to delete all gathered data for this feature?
                </p>
                {dataCounts && dataCounts[confirmDisable] > 0 && (
                  <p className="text-xs text-amber-600 mt-1 font-medium">
                    {dataCounts[confirmDisable].toLocaleString()} records will be permanently deleted if you choose to purge.
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmDisable(null)} data-testid="button-cancel-disable">
                Cancel
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleConfirmDisable(false)} data-testid="button-disable-keep-data">
                Disable, Keep Data
              </Button>
              <Button variant="destructive" size="sm" onClick={() => handleConfirmDisable(true)} disabled={purging === confirmDisable} data-testid="button-disable-purge">
                {purging === confirmDisable && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />}
                Disable & Purge Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Data Modules</h4>
        {FEATURE_KEYS.map(({ key, label, description }) => {
          const isEnabled = toggles?.[key]?.enabled ?? false;
          const count = dataCounts?.[key] ?? 0;
          return (
            <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-card/50" data-testid={`feature-toggle-row-${key}`}>
              <div className="flex-1 min-w-0 mr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium" data-testid={`text-feature-label-${key}`}>{label}</span>
                  {count > 0 && (
                    <Badge variant="secondary" className="text-[10px]" data-testid={`badge-count-${key}`}>
                      {count.toLocaleString()} records
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isEnabled && count > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive text-xs h-7 px-2"
                    onClick={() => setConfirmPurge(key)}
                    disabled={purging === key}
                    data-testid={`button-purge-${key}`}
                  >
                    {purging === key ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
                    Delete All
                  </Button>
                )}
                <Switch
                  checked={isEnabled}
                  onCheckedChange={(checked) => handleToggle(key, checked)}
                  disabled={toggleMutation.isPending && toggleMutation.variables?.feature === key}
                  data-testid={`switch-feature-${key}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {confirmPurge && (
        <Dialog open={confirmPurge !== null} onOpenChange={(open) => { if (!open) setConfirmPurge(null); }}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-5 h-5" />
                Delete All Data
              </DialogTitle>
              <DialogDescription>
                This will permanently delete all {FEATURE_KEYS.find(f => f.key === confirmPurge)?.label} data for this tenant.
                {dataCounts && dataCounts[confirmPurge] > 0 && (
                  <span className="block mt-1 font-medium text-destructive">
                    {dataCounts[confirmPurge].toLocaleString()} records will be deleted.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmPurge(null)} data-testid="button-cancel-purge">
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => purgeMutation.mutate(confirmPurge)}
                disabled={purging === confirmPurge}
                data-testid="button-confirm-purge"
              >
                {purging === confirmPurge && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                Delete All Data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
