import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Building2, 
  Save, 
  ShieldCheck, 
  Globe, 
  CreditCard,
  X,
  Plus,
  Loader2,
  UserPlus,
  Lock
} from "lucide-react";
import { Link } from "wouter";
import { useServicePlan } from "@/hooks/use-service-plan";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

export default function OrganizationSettingsPage() {
  const { plan, features, org } = useServicePlan();
  const { toast } = useToast();

  const { data: authData } = useQuery<{
    user: any;
    organization: { id: string; name: string; domain: string; allowedDomains: string[] | null; inviteOnly: boolean | null } | null;
  }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    staleTime: 5 * 60 * 1000,
  });

  const activeOrg = authData?.organization;

  const [inviteOnly, setInviteOnly] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");

  useEffect(() => {
    if (activeOrg) {
      setInviteOnly(activeOrg.inviteOnly ?? false);
      setAllowedDomains(activeOrg.allowedDomains ?? []);
    }
  }, [activeOrg]);

  const settingsMutation = useMutation({
    mutationFn: async (updates: { allowedDomains?: string[]; inviteOnly?: boolean }) => {
      if (!activeOrg) throw new Error("No active organization");
      const res = await fetch(`/api/orgs/${activeOrg.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Settings updated", description: "Organization access settings have been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleAddDomain = () => {
    const domain = newDomain.toLowerCase().trim();
    if (!domain) return;
    if (allowedDomains.includes(domain)) {
      toast({ title: "Domain already exists", variant: "destructive" });
      return;
    }
    const updated = [...allowedDomains, domain];
    setAllowedDomains(updated);
    setNewDomain("");
    settingsMutation.mutate({ allowedDomains: updated });
  };

  const handleRemoveDomain = (domain: string) => {
    const updated = allowedDomains.filter(d => d !== domain);
    setAllowedDomains(updated);
    settingsMutation.mutate({ allowedDomains: updated });
  };

  const handleInviteOnlyToggle = (checked: boolean) => {
    setInviteOnly(checked);
    settingsMutation.mutate({ inviteOnly: checked });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-muted-foreground mt-1">Manage profile, security, and preferences for {activeOrg?.name || 'your organization'}.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Organization Profile
              </CardTitle>
              <CardDescription>Core identity and contact information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>Organization Name</Label>
                  <Input defaultValue={activeOrg?.name || ""} className="bg-background/50" data-testid="input-org-name" />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>Primary Domain</Label>
                  <Input value={activeOrg?.domain || ""} disabled className="bg-muted/50" data-testid="text-org-domain" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Support Email</Label>
                  <Input defaultValue={`it-support@${activeOrg?.domain || "example.com"}`} className="bg-background/50" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-border/40 bg-muted/10 pt-4 pb-4 justify-end">
              <Button className="gap-2 shadow-md shadow-primary/20">
                <Save className="w-4 h-4" /> Save Profile
              </Button>
            </CardFooter>
          </Card>

          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-500" />
                Membership & Access Controls
              </CardTitle>
              <CardDescription>Control how users join this organization.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50">
                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-500" />
                    Invite Only
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    When enabled, new users cannot self-join this organization. They must be invited by an admin.
                  </p>
                </div>
                <Switch
                  checked={inviteOnly}
                  onCheckedChange={handleInviteOnlyToggle}
                  disabled={settingsMutation.isPending}
                  data-testid="switch-invite-only"
                />
              </div>

              <div className="p-4 rounded-xl border border-border/50 bg-background/50 space-y-4">
                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    Allowed Email Domains
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Only users with email addresses matching these domains can join. Leave empty to allow any domain.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. contoso.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
                    className="bg-background"
                    data-testid="input-allowed-domain"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddDomain}
                    disabled={!newDomain.trim() || settingsMutation.isPending}
                    className="shrink-0"
                    data-testid="button-add-domain"
                  >
                    {settingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </Button>
                </div>

                {allowedDomains.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allowedDomains.map((domain) => (
                      <Badge
                        key={domain}
                        variant="secondary"
                        className="gap-1 pr-1 text-xs"
                        data-testid={`badge-domain-${domain}`}
                      >
                        {domain}
                        <button
                          onClick={() => handleRemoveDomain(domain)}
                          className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                          disabled={settingsMutation.isPending}
                          data-testid={`button-remove-domain-${domain}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No domain restrictions — any email domain is allowed.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                Security & Access
              </CardTitle>
              <CardDescription>Configure authentication and tenant restrictions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50">
                <div>
                  <h4 className="font-semibold text-sm">Enforce MFA</h4>
                  <p className="text-xs text-muted-foreground mt-1">Require multi-factor authentication for all Zenith logins.</p>
                </div>
                <Switch checked={true} />
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50">
                <div>
                  <h4 className="font-semibold text-sm">Cross-Tenant Isolation</h4>
                  <p className="text-xs text-muted-foreground mt-1">Prevent users from authenticating to external M365 tenants.</p>
                </div>
                <Switch checked={true} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`p-4 rounded-xl flex flex-col items-center justify-center text-center ${plan === 'TRIAL' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-primary/10 border border-primary/20'}`}>
                <Badge className={`mb-2 uppercase tracking-widest text-[10px] ${plan === 'TRIAL' ? 'bg-amber-500/20 text-amber-600 border-amber-500/30' : ''}`}>{features.label}</Badge>
                <div className="text-2xl font-bold mt-1">
                  {features.maxUsers === -1 ? 'Unlimited' : <>{features.maxUsers.toLocaleString()}<span className="text-sm text-muted-foreground font-normal"> max users</span></>}
                </div>
                <div className={`text-xs mt-2 ${plan === 'TRIAL' ? 'text-amber-600' : 'text-primary'}`}>
                  {plan === 'TRIAL' ? 'Trial (No M365 Write-Back)' : 'Active Subscription'}
                </div>
              </div>
              <Link href="/app/admin/service-plans">
                <Button variant="outline" className="w-full mt-4">{plan === 'TRIAL' ? 'Upgrade Plan' : 'Manage Plan'}</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" />
                Connected Tenants
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border/50">
                <div className="text-sm font-medium">Production</div>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border/50">
                <div className="text-sm font-medium">UAT Sandbox</div>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
              <Button variant="ghost" className="w-full text-xs mt-2" size="sm">Configure Tenants</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}