import { useQuery } from "@tanstack/react-query";
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
  ArrowRight,
  AlertTriangle,
  Server,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const REQUIRED_PERMISSIONS = [
  { name: "openid", type: "Delegated", description: "Sign users in" },
  { name: "profile", type: "Delegated", description: "View users' basic profile" },
  { name: "email", type: "Delegated", description: "View users' email address" },
  { name: "User.Read", type: "Delegated", description: "Sign in and read user profile" },
];

const GRAPH_PERMISSIONS = [
  { name: "Sites.Read.All", type: "Application", description: "Read all site collections" },
  { name: "Group.Read.All", type: "Application", description: "Read all groups" },
  { name: "Directory.Read.All", type: "Application", description: "Read directory data" },
];

export default function EntraSetupPage() {
  const { toast } = useToast();

  const ssoStatus = useQuery({
    queryKey: ["/auth/entra/status"],
    queryFn: async () => {
      const res = await fetch("/auth/entra/status");
      return res.json();
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Entra ID (Azure AD) Setup</h1>
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
                Follow the steps below to set up Microsoft Entra ID authentication.
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
                  <span>Go to <strong>Azure Portal</strong> &rarr; <strong>Microsoft Entra ID</strong> &rarr; <strong>App registrations</strong> &rarr; <strong>New registration</strong></span>
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
                      <Input value={callbackUrl} readOnly className="font-mono text-xs bg-muted/50" />
                      <Button variant="outline" size="icon" onClick={() => copyToClipboard(callbackUrl)}>
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
                <Button variant="outline" size="sm" className="gap-2" asChild>
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
                <h4 className="text-sm font-medium mb-2">Delegated Permissions (User Sign-In)</h4>
                <div className="space-y-1">
                  {REQUIRED_PERMISSIONS.map((perm) => (
                    <div key={perm.name} className="flex items-center gap-2 text-sm py-1.5 px-3 rounded bg-muted/30">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className="font-mono text-xs">{perm.name}</span>
                      <span className="text-muted-foreground ml-auto">{perm.description}</span>
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="text-sm font-medium mb-2">Application Permissions (Inventory Sync)</h4>
                <p className="text-xs text-muted-foreground mb-2">
                  These are required for server-side SharePoint inventory sync. Admin consent is required.
                </p>
                <div className="space-y-1">
                  {GRAPH_PERMISSIONS.map((perm) => (
                    <div key={perm.name} className="flex items-center gap-2 text-sm py-1.5 px-3 rounded bg-muted/30">
                      <Circle className="w-4 h-4 text-amber-500" />
                      <span className="font-mono text-xs">{perm.name}</span>
                      <Badge variant="outline" className="text-[10px] ml-1">{perm.type}</Badge>
                      <span className="text-muted-foreground ml-auto">{perm.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 shadow-xl" data-testid="card-step-4">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">4</div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Server className="w-5 h-5 text-primary" />
                    Set Environment Variables
                  </CardTitle>
                  <CardDescription>Add credentials to Zenith's environment.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <p className="text-sm">
                Add these environment variables to your Zenith deployment (via Replit Secrets or .env):
              </p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-mono">AZURE_CLIENT_ID</Label>
                  <p className="text-xs text-muted-foreground">The Application (client) ID from the app registration Overview page</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono">AZURE_CLIENT_SECRET</Label>
                  <p className="text-xs text-muted-foreground">The client secret value you copied in Step 2</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono">AZURE_TENANT_ID</Label>
                  <p className="text-xs text-muted-foreground">Set to "common" for multi-tenant, or a specific tenant ID for single-tenant</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono">TOKEN_ENCRYPTION_SECRET</Label>
                  <p className="text-xs text-muted-foreground">A random string (min 32 chars) for encrypting Graph tokens at rest</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-mono">SESSION_SECRET</Label>
                  <p className="text-xs text-muted-foreground">A random string for signing session cookies (auto-generated if not set)</p>
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
                  { label: "Application permissions added", done: false },
                  { label: "Environment variables set", done: isConfigured },
                  { label: "Admin consent granted", done: false },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
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
