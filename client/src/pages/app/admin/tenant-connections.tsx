import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TenantConnection } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Key,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  AlertTriangle,
  ExternalLink,
  Trash2,
  Zap,
  Info
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
  const [testResult, setTestResult] = useState<{ success: boolean; tenantName?: string; permissions?: string[]; error?: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, any>>({});

  const [form, setForm] = useState({
    tenantId: "",
    tenantName: "",
    domain: "",
    clientId: "",
    clientSecret: "",
    ownershipType: "MSP",
  });

  const { data: connections = [], isLoading } = useQuery<TenantConnection[]>({
    queryKey: ["/api/admin/tenants"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/admin/tenants", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      setShowAddDialog(false);
      setForm({ tenantId: "", tenantName: "", domain: "", clientId: "", clientSecret: "", ownershipType: "MSP" });
      setTestResult(null);
      toast({ title: "Tenant Connected", description: "The tenant connection has been saved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
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

  const handleTest = async () => {
    if (!form.tenantId || !form.clientId || !form.clientSecret) {
      toast({ title: "Missing Fields", description: "Tenant ID, Client ID, and Client Secret are required to test.", variant: "destructive" });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/tenants/test", {
        tenantId: form.tenantId,
        clientId: form.clientId,
        clientSecret: form.clientSecret,
      });
      const result = await res.json();
      setTestResult(result);
      if (result.success && result.tenantName && !form.tenantName) {
        setForm(f => ({ ...f, tenantName: result.tenantName }));
      }
    } catch (err: any) {
      setTestResult({ success: false, error: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSync = async (id: string) => {
    setSyncingId(id);
    try {
      const res = await apiRequest("POST", `/api/admin/tenants/${id}/sync`);
      const result = await res.json();
      setSyncResults(prev => ({ ...prev, [id]: result }));
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
          <p className="text-muted-foreground mt-1">Manage Microsoft 365 tenant bindings and Entra ID app registrations for data gathering.</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-md shadow-primary/20" data-testid="button-connect-tenant">
              <Plus className="w-4 h-4" />
              Connect Tenant
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Cloud className="w-5 h-5 text-primary" /> Connect New Tenant</DialogTitle>
              <DialogDescription>
                Register a Microsoft 365 tenant for read-only data gathering via Microsoft Graph API.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              <Card className="bg-muted/30 border-border/50">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground">Before connecting, register an Entra ID app in the target tenant:</p>
                      <ol className="list-decimal list-inside space-y-0.5 ml-1">
                        <li>Go to <span className="font-mono text-primary">portal.azure.com</span> &gt; Entra ID &gt; App registrations</li>
                        <li>New registration &gt; Name: "Zenith Governance" &gt; Multi-tenant</li>
                        <li>Add API permissions (Application, not Delegated):
                          <span className="font-mono text-[10px] block ml-4 mt-0.5">Sites.Read.All, Group.Read.All, Directory.Read.All</span>
                        </li>
                        <li>Grant admin consent for the tenant</li>
                        <li>Create a client secret under Certificates &amp; secrets</li>
                        <li>Copy the Application (client) ID, Directory (tenant) ID, and secret value below</li>
                      </ol>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label>Directory (Tenant) ID <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g. 12345678-abcd-efgh-ijkl-123456789012"
                    value={form.tenantId}
                    onChange={e => setForm(f => ({ ...f, tenantId: e.target.value }))}
                    className="font-mono text-sm"
                    data-testid="input-tenant-id"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Application (Client) ID <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g. abcdef12-3456-7890-abcd-ef1234567890"
                    value={form.clientId}
                    onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))}
                    className="font-mono text-sm"
                    data-testid="input-client-id"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Client Secret <span className="text-destructive">*</span></Label>
                  <Input
                    type="password"
                    placeholder="Paste the client secret value"
                    value={form.clientSecret}
                    onChange={e => setForm(f => ({ ...f, clientSecret: e.target.value }))}
                    className="font-mono text-sm"
                    data-testid="input-client-secret"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tenant Domain</Label>
                    <Input
                      placeholder="e.g. synozur.onmicrosoft.com"
                      value={form.domain}
                      onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                      data-testid="input-domain"
                    />
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
                </div>

                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input
                    placeholder="Auto-detected from Graph, or enter manually"
                    value={form.tenantName}
                    onChange={e => setForm(f => ({ ...f, tenantName: e.target.value }))}
                    data-testid="input-tenant-name"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={handleTest}
                  disabled={isTesting}
                  data-testid="button-test-connection"
                >
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                  Test Connection
                </Button>

                {testResult && (
                  <Card className={`border ${testResult.success ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-destructive/30 bg-destructive/5'}`}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        {testResult.success ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <XCircle className="w-5 h-5 text-destructive" />
                        )}
                        <span className={`font-semibold text-sm ${testResult.success ? 'text-emerald-600' : 'text-destructive'}`}>
                          {testResult.success ? 'Connection Successful' : 'Connection Failed'}
                        </span>
                      </div>
                      {testResult.success && testResult.tenantName && (
                        <p className="text-sm text-muted-foreground">Organization: <span className="font-medium text-foreground">{testResult.tenantName}</span></p>
                      )}
                      {testResult.error && (
                        <p className="text-xs text-destructive font-mono break-all">{testResult.error}</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.tenantId || !form.clientId || !form.clientSecret || !form.domain || createMutation.isPending}
                className="gap-2"
                data-testid="button-save-tenant"
              >
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                Save Connection
              </Button>
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

      <Tabs defaultValue="connections">
        <TabsList className="bg-muted/50 border border-border/50">
          <TabsTrigger value="connections" className="gap-2"><Globe className="w-4 h-4" /> Connections</TabsTrigger>
          <TabsTrigger value="setup" className="gap-2"><Settings2 className="w-4 h-4" /> Setup Guide</TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="mt-4">
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
                    <p className="text-sm text-muted-foreground mt-1">Click "Connect Tenant" to register your first Microsoft 365 environment for data gathering.</p>
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Tenant</TableHead>
                      <TableHead>Ownership</TableHead>
                      <TableHead>App Registration</TableHead>
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
                            <span className="font-semibold text-sm">{conn.tenantName}</span>
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
                          <div className="flex items-center gap-1.5 text-sm">
                            <Key className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="font-mono text-xs">{conn.clientId.substring(0, 8)}...</span>
                          </div>
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
                            {conn.status === 'PENDING' && (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                <span className="text-xs font-medium text-amber-500">Pending Sync</span>
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
                                className="text-destructive gap-2"
                                onClick={() => deleteMutation.mutate(conn.id)}
                              >
                                <Trash2 className="w-4 h-4" /> Disconnect
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {syncResults && Object.keys(syncResults).length > 0 && (
                <div className="p-4 border-t border-border/50">
                  <p className="text-xs font-medium text-muted-foreground mb-2">Recent Sync Results</p>
                  {Object.entries(syncResults).map(([id, result]: [string, any]) => {
                    const conn = connections.find(c => c.id === id);
                    return (
                      <Card key={id} className={`mb-2 ${result.success ? 'border-emerald-500/20' : 'border-destructive/20'}`}>
                        <CardContent className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {result.success ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <XCircle className="w-4 h-4 text-destructive" />}
                              <span className="text-sm font-medium">{conn?.tenantName || id}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">{result.sitesFound} sites found</span>
                          </div>
                          {result.error && <p className="text-xs text-destructive mt-1 font-mono">{result.error}</p>}
                          {result.sites && result.sites.length > 0 && (
                            <div className="mt-2 max-h-40 overflow-y-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead className="text-[10px] py-1">Site Name</TableHead>
                                    <TableHead className="text-[10px] py-1">URL</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {result.sites.slice(0, 10).map((site: any, i: number) => (
                                    <TableRow key={i}>
                                      <TableCell className="text-xs py-1">{site.displayName}</TableCell>
                                      <TableCell className="text-[10px] py-1 font-mono text-muted-foreground truncate max-w-[200px]">{site.webUrl}</TableCell>
                                    </TableRow>
                                  ))}
                                  {result.sites.length > 10 && (
                                    <TableRow>
                                      <TableCell colSpan={2} className="text-xs text-center text-muted-foreground py-1">
                                        ...and {result.sites.length - 10} more
                                      </TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setup" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="glass-panel border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><Key className="w-5 h-5 text-primary" /> Entra App Registration</CardTitle>
                <CardDescription>Required configuration in Microsoft Entra ID (Azure AD)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</div>
                    <div>
                      <p className="text-sm font-medium">Create App Registration</p>
                      <p className="text-xs text-muted-foreground mt-0.5">In Entra ID &gt; App registrations &gt; New registration. Name: "Zenith Governance Platform". Account type: Multi-tenant.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</div>
                    <div>
                      <p className="text-sm font-medium">Add API Permissions (Application type)</p>
                      <div className="mt-1 space-y-1">
                        <Badge variant="outline" className="text-[10px] mr-1">Sites.Read.All</Badge>
                        <Badge variant="outline" className="text-[10px] mr-1">Group.Read.All</Badge>
                        <Badge variant="outline" className="text-[10px] mr-1">Directory.Read.All</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">Use Application permissions, not Delegated. This enables tenant-wide inventory without user context.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</div>
                    <div>
                      <p className="text-sm font-medium">Grant Admin Consent</p>
                      <p className="text-xs text-muted-foreground mt-0.5">A Global Admin must click "Grant admin consent" in the API permissions blade. Without this, Graph calls will fail with 403.</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">4</div>
                    <div>
                      <p className="text-sm font-medium">Create Client Secret</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Under Certificates &amp; secrets, create a new client secret. Copy the Value (not the Secret ID) immediately — it won't be shown again.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-border/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-primary" /> Security Model</CardTitle>
                <CardDescription>How Zenith uses these permissions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-medium text-emerald-600">Read-Only Data Gathering</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Application permissions are used exclusively for inventory reads. No data is written back to the tenant.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div className="flex items-center gap-2 mb-1">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium text-primary">Entra = Authentication Only</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Possessing Graph permissions does NOT grant operational access in Zenith. All authorization decisions happen in the Zenith control plane.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-medium text-amber-600">One Owner Per Tenant</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Each tenant has exactly one owning Zenith organization. Ownership changes require explicit admin approval and are fully audited.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Stale Data Handling</span>
                    </div>
                    <p className="text-xs text-muted-foreground">If a Graph token fails, inventory is flagged as stale — never deleted. Re-sync happens only when connectivity is restored.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
