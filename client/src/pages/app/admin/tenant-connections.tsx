import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TenantConnection } from "@shared/schema";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TenantConnectionsPage() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [isInitiating, setIsInitiating] = useState(false);

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


  const handleInitiateConsent = async () => {
    if (!form.domain.trim()) {
      toast({ title: "Domain Required", description: "Enter the tenant domain to proceed.", variant: "destructive" });
      return;
    }
    setIsInitiating(true);
    try {
      let url = `/api/admin/tenants/consent/initiate?tenantDomain=${encodeURIComponent(form.domain)}&ownershipType=${encodeURIComponent(form.ownershipType)}`;
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

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      const res = await apiRequest("POST", `/api/admin/tenants/${id}/sync`);
      const result = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      if (result.success) {
        toast({ title: "Sync Complete", description: `Found ${result.sitesFound} SharePoint sites.` });
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
                      <p className="mt-2 text-[10px] opacity-70">Zenith requests: Sites.Read.All, Group.Read.All, Directory.Read.All (Application permissions, read-only)</p>
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

    </div>
  );
}
