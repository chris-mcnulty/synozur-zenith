import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  Circle,
  Copy,
  KeyRound,
  Globe,
  Users,
  AlertTriangle,
  Server,
  Loader2,
  XCircle,
  AlertCircle,
  ArrowRight,
  Save,
  TestTube,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DELEGATED_PERMISSIONS = [
  { name: "openid", description: "Sign users in via SSO" },
  { name: "profile", description: "Read user's basic profile" },
  { name: "email", description: "Read user's email address" },
  { name: "User.Read", description: "Sign in and read user profile" },
  { name: "offline_access", description: "Maintain access via refresh tokens" },
  { name: "RecordsManagement.Read.All", description: "Purview retention label sync" },
  { name: "Group.ReadWrite.All", description: "Sensitivity label write-back to groups" },
];

const SPO_DELEGATED_PERMISSIONS = [
  { name: "AllSites.FullControl", description: "SPE container management and SharePoint operations (delegated)" },
];

const GRAPH_PERMISSIONS = [
  { name: "Sites.Read.All", description: "Site inventory — read all site collections" },
  { name: "Sites.ReadWrite.All", description: "SPE container management — read/write site collections" },
  { name: "Group.Read.All", description: "Site inventory — read all Microsoft 365 groups" },
  { name: "Group.ReadWrite.All", description: "Sensitivity label write-back — update group properties" },
  { name: "Directory.Read.All", description: "Site inventory — read directory and tenant data" },
  { name: "Reports.Read.All", description: "Usage analytics — read Microsoft 365 usage reports" },
  { name: "User.Read.All", description: "License inventory — read all users' license assignments" },
  { name: "Mail.Read", description: "Email storage report — read mail in all mailboxes" },
  { name: "InformationProtectionPolicy.Read.All", description: "Purview sensitivity label sync" },
  { name: "RecordsManagement.Read.All", description: "Purview retention label sync (requires M365 E5 Compliance)" },
  { name: "AuditLog.Read.All", description: "License inventory — user sign-in activity (optional)" },
];

type CheckResult = { step: string; status: "pass" | "fail" | "warn"; message: string };

export default function EntraSetupPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [tenantId, setTenantId] = useState("common");
  const [tokenEncryptionSecret, setTokenEncryptionSecret] = useState("");
  const [testResults, setTestResults] = useState<CheckResult[] | null>(null);

  const ssoStatus = useQuery({
    queryKey: ["/auth/entra/status/detail"],
    queryFn: async () => {
      const res = await fetch("/auth/entra/status/detail");
      return res.json();
    },
  });

  const configureMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/auth/entra/configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret, tenantId, tokenEncryptionSecret: tokenEncryptionSecret || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save configuration");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Configuration Saved", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/auth/entra/status/detail"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/auth/entra/test", { method: "POST" });
      if (!res.ok) throw new Error("Failed to test configuration");
      return res.json();
    },
    onSuccess: (data) => {
      setTestResults(data.checks);
      if (data.success) {
        toast({ title: "Verification Passed", description: data.message });
      } else {
        toast({ title: "Verification Issues", description: data.message, variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/auth/entra/status/detail"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const callbackUrl = typeof window !== "undefined"
    ? `${window.location.origin}/auth/entra/callback`
    : "";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const isConfigured = ssoStatus.data?.configured === true;

  const statusIcon = (status: "pass" | "fail" | "warn") => {
    if (status === "pass") return <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />;
    if (status === "fail") return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
    return <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Entra ID (Azure AD) Setup</h1>
          <p className="text-muted-foreground mt-1">
            Configure Microsoft Entra ID for single sign-on authentication.
          </p>
        </div>
        <Badge
          data-testid="badge-sso-status"
          variant={isConfigured ? "default" : "secondary"}
          className={isConfigured ? "bg-green-500/10 text-green-500 border-green-500/20" : ""}
        >
          {isConfigured ? "SSO Configured" : "Not Configured"}
        </Badge>
      </div>

      {isConfigured && (
        <Card className="glass-panel border-green-500/30 shadow-xl bg-green-500/5">
          <CardContent className="flex items-center gap-3 py-4">
            <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
            <div>
              <p className="font-medium text-green-700 dark:text-green-400">
                Azure AD SSO is active
              </p>
              <p className="text-sm text-muted-foreground">
                Tenant ID: {ssoStatus.data?.tenantId || "common (multi-tenant)"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isConfigured && (
        <Card className="glass-panel border-amber-500/30 shadow-xl bg-amber-500/5">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="font-medium text-amber-700 dark:text-amber-400">
                SSO is not yet configured
              </p>
              <p className="text-sm text-muted-foreground">
                Follow the steps below to register an app in Entra ID, then enter your credentials to activate SSO.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="glass-panel border-border/50 shadow-xl" data-testid="card-step-1">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">1</div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    Register an App in Entra ID
                  </CardTitle>
                  <CardDescription>Create a new app registration in the Azure portal.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded h-fit mt-0.5">a</span>
                  <span>Go to <strong>Azure Portal</strong> <ArrowRight className="inline w-3 h-3" /> <strong>Microsoft Entra ID</strong> <ArrowRight className="inline w-3 h-3" /> <strong>App registrations</strong> <ArrowRight className="inline w-3 h-3" /> <strong>New registration</strong></span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded h-fit mt-0.5">b</span>
                  <span>Set the name to <strong>"Zenith Governance Platform"</strong></span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded h-fit mt-0.5">c</span>
                  <span>Under <strong>Supported account types</strong>, select <strong>"Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant)"</strong></span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded h-fit mt-0.5">d</span>
                  <div>
                    <span>Set the <strong>Redirect URI</strong> to <strong>Web</strong> with this value:</span>
                    <div className="mt-2 flex items-center gap-2">
                      <Input value={callbackUrl} readOnly className="font-mono text-xs bg-muted/50" data-testid="input-callback-url" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(callbackUrl)} data-testid="button-copy-callback">
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded h-fit mt-0.5">e</span>
                  <span>Click <strong>Register</strong></span>
                </li>
              </ol>
              <div className="pt-2">
                <Button variant="outline" size="sm" className="gap-2" asChild data-testid="button-open-azure-portal">
                  <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener">
                    Open Azure Portal <ExternalLink className="w-3 h-3" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 shadow-xl" data-testid="card-step-2">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">2</div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <KeyRound className="w-5 h-5 text-primary" />
                    Create a Client Secret
                  </CardTitle>
                  <CardDescription>Generate credentials for server-side authentication.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded h-fit mt-0.5">a</span>
                  <span>In the app registration, go to <strong>Certificates & secrets</strong></span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded h-fit mt-0.5">b</span>
                  <span>Click <strong>New client secret</strong>, add a description (e.g., "Zenith Production"), set expiry</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded h-fit mt-0.5">c</span>
                  <span>Copy the <strong>Value</strong> immediately (it won't be shown again)</span>
                </li>
              </ol>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 shadow-xl" data-testid="card-step-3">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">3</div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-primary" />
                    Configure API Permissions
                  </CardTitle>
                  <CardDescription>Grant the required permissions for authentication and inventory sync.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div>
                <h4 className="text-sm font-medium mb-1">Delegated Permissions (Microsoft Graph)</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Added under <strong>API permissions</strong> → <strong>Microsoft Graph</strong> → <strong>Delegated permissions</strong>.
                </p>
                <div className="space-y-1">
                  {DELEGATED_PERMISSIONS.map((perm) => (
                    <div key={perm.name} className="flex items-center gap-2 text-sm py-1.5 px-3 rounded bg-muted/30">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="font-mono text-xs shrink-0">{perm.name}</span>
                      <span className="text-muted-foreground ml-auto text-right text-xs">{perm.description}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-1">Application Permissions (Microsoft Graph)</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Added under <strong>API permissions</strong> → <strong>Microsoft Graph</strong> → <strong>Application permissions</strong>. Admin consent is required.
                </p>
                <div className="space-y-1">
                  {GRAPH_PERMISSIONS.map((perm) => (
                    <div key={perm.name} className="flex items-center gap-2 text-sm py-1.5 px-3 rounded bg-muted/30">
                      <Circle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span className="font-mono text-xs shrink-0">{perm.name}</span>
                      <span className="text-muted-foreground ml-auto text-right text-xs">{perm.description}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-1 flex items-center gap-2">
                  SharePoint REST API Permissions
                  <Badge variant="outline" className="text-[10px]">SharePoint</Badge>
                </h4>
                <p className="text-xs text-muted-foreground mb-2">
                  Added separately under <strong>API permissions</strong> → <strong>APIs my organization uses</strong> → <strong>SharePoint</strong>. Use both delegated and application types.
                </p>
                <div className="space-y-1 mb-3">
                  {SPO_DELEGATED_PERMISSIONS.map((perm) => (
                    <div key={perm.name} className="flex items-center gap-2 text-sm py-1.5 px-3 rounded bg-muted/30">
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                      <span className="font-mono text-xs shrink-0">{perm.name}</span>
                      <Badge variant="outline" className="text-[10px] ml-1 shrink-0">Delegated</Badge>
                      <span className="text-muted-foreground ml-auto text-right text-xs">{perm.description}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-sm py-1.5 px-3 rounded bg-muted/30">
                    <Circle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span className="font-mono text-xs shrink-0">Sites.FullControl.All</span>
                    <Badge variant="outline" className="text-[10px] ml-1 shrink-0">Application</Badge>
                    <span className="text-muted-foreground ml-auto text-right text-xs">SPE container management (application)</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs">
                  <p className="font-medium text-blue-700 dark:text-blue-400 mb-1">SharePoint Scope URL</p>
                  <p className="text-muted-foreground mb-2">
                    SharePoint REST API permissions require a tenant-specific scope URL, not the standard Graph endpoint. Construct the URL using your SharePoint tenant domain:
                  </p>
                  <code className="block p-2 bg-background rounded font-mono break-all">
                    https://&#123;tenant&#125;.sharepoint.com/.default
                  </code>
                  <p className="text-muted-foreground mt-2">
                    For example: <code className="font-mono">https://contoso.sharepoint.com/.default</code>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-primary/30 shadow-xl" data-testid="card-step-4">
            <CardHeader className="border-b border-border/40 bg-primary/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">4</div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Server className="w-5 h-5 text-primary" />
                    Enter Credentials & Verify
                  </CardTitle>
                  <CardDescription>Paste the values from your app registration and confirm the connection works.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clientId" className="text-sm font-medium">Application (Client) ID</Label>
                  <p className="text-xs text-muted-foreground">Found on the app registration Overview page</p>
                  <Input
                    id="clientId"
                    data-testid="input-client-id"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientSecret" className="text-sm font-medium">Client Secret Value</Label>
                  <p className="text-xs text-muted-foreground">The secret value you copied in Step 2</p>
                  <Input
                    id="clientSecret"
                    data-testid="input-client-secret"
                    type="password"
                    placeholder="Enter client secret value"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenantId" className="text-sm font-medium">Tenant ID</Label>
                  <p className="text-xs text-muted-foreground">Use "common" for multi-tenant, or a specific tenant GUID for single-tenant</p>
                  <Input
                    id="tenantId"
                    data-testid="input-tenant-id"
                    placeholder="common"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tokenEncSecret" className="text-sm font-medium">
                    Token Encryption Secret
                    <Badge variant="outline" className="ml-2 text-[10px]">Optional</Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">Min 32 characters. Used to encrypt Graph tokens stored in the database.</p>
                  <Input
                    id="tokenEncSecret"
                    data-testid="input-token-encryption-secret"
                    type="password"
                    placeholder="Min 32 characters for AES-256-GCM encryption"
                    value={tokenEncryptionSecret}
                    onChange={(e) => setTokenEncryptionSecret(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
              </div>

              <Separator />

              <div className="flex gap-3">
                <Button
                  data-testid="button-save-config"
                  onClick={() => configureMutation.mutate()}
                  disabled={!clientId || !clientSecret || configureMutation.isPending}
                  className="gap-2"
                >
                  {configureMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save Configuration
                </Button>
                <Button
                  data-testid="button-test-connection"
                  variant="outline"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending}
                  className="gap-2"
                >
                  {testMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <TestTube className="w-4 h-4" />
                  )}
                  Test Connection
                </Button>
              </div>

              {testResults && (
                <div className="space-y-2 p-4 rounded-lg bg-muted/30 border border-border/40" data-testid="card-test-results">
                  <h4 className="text-sm font-medium mb-3">Verification Results</h4>
                  {testResults.map((check, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm py-1.5">
                      {statusIcon(check.status)}
                      <div>
                        <span className="font-medium">{check.step}</span>
                        <span className="text-muted-foreground ml-2">{check.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-muted-foreground">
                <div className="flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-700 dark:text-amber-400 mb-1">Persistence Note</p>
                    <p>Credentials saved here are stored in runtime memory. For them to persist across restarts, also save them as <strong>Replit Secrets</strong> using the same variable names: AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID, TOKEN_ENCRYPTION_SECRET.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 shadow-xl" data-testid="card-step-5">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">5</div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Grant Admin Consent
                  </CardTitle>
                  <CardDescription>Approve permissions for each managed tenant.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <p className="text-sm">
                Each tenant you manage must grant admin consent for the application permissions.
                A Global Administrator from each tenant must visit the admin consent URL.
              </p>
              <div className="p-4 rounded-lg bg-muted/30 border border-border/40 text-sm space-y-2">
                <p className="font-medium">Admin Consent URL Pattern:</p>
                <code className="text-xs block p-2 bg-background rounded font-mono break-all">
                  https://login.microsoftonline.com/&#123;TENANT_ID&#125;/adminconsent?client_id=&#123;AZURE_CLIENT_ID&#125;&redirect_uri={callbackUrl}
                </code>
                {isConfigured && ssoStatus.data?.tenantId && ssoStatus.data.tenantId !== "common" && (
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-1">Your admin consent URL:</p>
                    <div className="flex items-center gap-2">
                      <Input
                        readOnly
                        value={`https://login.microsoftonline.com/${ssoStatus.data.tenantId}/adminconsent?client_id=${clientId || '{CLIENT_ID}'}&redirect_uri=${callbackUrl}`}
                        className="font-mono text-xs bg-muted/50"
                        data-testid="input-consent-url"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => copyToClipboard(`https://login.microsoftonline.com/${ssoStatus.data.tenantId}/adminconsent?client_id=${clientId}&redirect_uri=${callbackUrl}`)}
                        data-testid="button-copy-consent-url"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                After consent is granted, users from that tenant can sign in via SSO and Zenith can sync SharePoint site inventory.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="glass-panel border-border/50 shadow-xl sticky top-20">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <CardTitle className="text-sm font-medium">Setup Checklist</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="space-y-3">
                {[
                  { label: "App registered in Entra ID", done: isConfigured },
                  { label: "Client secret created", done: isConfigured },
                  { label: "Delegated permissions added", done: isConfigured },
                  { label: "Application permissions added", done: testResults?.some(c => c.step === 'Graph API Access' && c.status === 'pass') || false },
                  { label: "Credentials saved", done: isConfigured },
                  { label: "Connection verified", done: testResults?.some(c => c.step === 'App Authentication' && c.status === 'pass') || false },
                  { label: "Admin consent granted", done: testResults?.some(c => c.step === 'Graph API Access' && c.status === 'pass') || false },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm" data-testid={`checklist-item-${i}`}>
                    {item.done ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    ) : (
                      <Circle className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                    )}
                    <span className={item.done ? "text-foreground" : "text-muted-foreground"}>{item.label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-primary/20 shadow-xl bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                Security Design
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-muted-foreground">
              <p><strong>Entra = Authentication</strong> (WHO you are)</p>
              <p><strong>Zenith = Authorization</strong> (WHETHER you're allowed)</p>
              <Separator className="my-2" />
              <p>A valid Entra token does NOT automatically grant Zenith access. Users must be explicitly assigned roles within their organization.</p>
              <p className="mt-2">Graph tokens are encrypted with AES-256-GCM at rest. Sessions are stored in PostgreSQL with secure cookies.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
