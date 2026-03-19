import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Building2, ArrowRight, CheckCircle2, Plus, Globe, Loader2, LogOut, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

type OrgMembership = {
  id: string;
  name: string;
  domain: string;
  servicePlan: string;
  role: string;
  isPrimary: boolean;
  platformAccess?: boolean;
};

type TenantConnection = {
  id: string;
  tenantName: string;
  domain: string;
  status: string;
  ownershipType: string;
  lastSyncAt: string | null;
  lastSyncSiteCount: number | null;
};

export default function SelectTenantPage() {
  const [, setLocation] = useLocation();

  const { data: authData, isLoading: authLoading } = useQuery<{
    user: { id: string; email: string; name: string | null; role: string };
    organization: { id: string; name: string; servicePlan: string } | null;
    activeOrganizationId: string | null;
  }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    staleTime: 5 * 60 * 1000,
  });

  const { data: orgs = [], isLoading: orgsLoading } = useQuery<OrgMembership[]>({
    queryKey: ["/api/orgs/mine"],
    queryFn: () => fetch("/api/orgs/mine", { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: !!authData?.user,
  });

  const { data: tenants = [] } = useQuery<TenantConnection[]>({
    queryKey: ["/api/admin/tenants"],
    queryFn: () => fetch("/api/admin/tenants", { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: !!authData?.user,
  });

  const switchOrgMutation = useMutation({
    mutationFn: async (organizationId: string) => {
      const res = await fetch("/api/orgs/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ organizationId }),
      });
      if (!res.ok) throw new Error("Failed to switch organization");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      setLocation("/app/dashboard");
    },
  });

  const handleSelectOrg = (orgId: string) => {
    if (authData?.activeOrganizationId === orgId) {
      setLocation("/app/dashboard");
    } else {
      switchOrgMutation.mutate(orgId);
    }
  };

  const handleLogout = async () => {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.logoutUrl) {
        window.location.href = data.logoutUrl;
      } else {
        setLocation("/login");
      }
    } catch {
      setLocation("/login");
    }
  };

  if (authLoading || orgsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!authData?.user) {
    setLocation("/login");
    return null;
  }

  const activeOrgId = authData.activeOrganizationId || authData.organization?.id;
  const myOrgs = orgs.filter(o => !o.platformAccess);
  const platformOrgs = orgs.filter(o => o.platformAccess);

  const OrgCard = ({ org }: { org: OrgMembership }) => {
    const isActive = org.id === activeOrgId;
    return (
      <Card
        key={org.id}
        className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-md hover:shadow-primary/5 ${isActive ? 'border-primary/30 bg-primary/5' : ''} ${org.platformAccess ? 'border-dashed' : ''}`}
        onClick={() => handleSelectOrg(org.id)}
        data-testid={`card-org-${org.id}`}
      >
        <CardContent className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${org.platformAccess ? 'bg-violet-500/10' : 'bg-muted'}`}>
              {org.platformAccess
                ? <ShieldCheck className="w-6 h-6 text-violet-500" />
                : <Building2 className="w-6 h-6 text-muted-foreground" />
              }
            </div>
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2" data-testid={`text-org-name-${org.id}`}>
                {org.name}
                {isActive && <CheckCircle2 className="w-4 h-4 text-primary" />}
              </h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <Badge
                  variant={org.servicePlan === 'ENTERPRISE' ? 'default' : 'secondary'}
                  className="text-[10px] uppercase font-bold tracking-wider"
                >
                  {org.servicePlan || 'TRIAL'}
                </Badge>
                {org.domain && (
                  <span className="flex items-center gap-1">
                    <Globe className="w-3 h-3" />
                    {org.domain}
                  </span>
                )}
                {!org.platformAccess && (
                  <span className="capitalize text-xs">{org.role.replace(/_/g, ' ')}</span>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            disabled={switchOrgMutation.isPending}
          >
            {switchOrgMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ArrowRight className="w-5 h-5" />
            )}
          </Button>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-24 px-4">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-3xl font-bold tracking-tight mb-3" data-testid="text-select-title">
            {orgs.length > 1 ? "Select your organization" : "Your organization"}
          </h1>
          <p className="text-muted-foreground">
            {authData.user.name ? `Welcome back, ${authData.user.name.split(' ')[0]}.` : `Welcome back.`}
            {orgs.length > 1 ? " Choose the organization you want to work in." : ""}
          </p>
        </div>

        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 fill-mode-both">
          {myOrgs.length > 0 && (
            <div className="space-y-3">
              {platformOrgs.length > 0 && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1">My Organizations</p>
              )}
              <div className="grid gap-4">
                {myOrgs.map(org => <OrgCard key={org.id} org={org} />)}
              </div>
            </div>
          )}

          {platformOrgs.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest px-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-violet-500" />
                Platform Admin Access
              </p>
              <div className="grid gap-4">
                {platformOrgs.map(org => <OrgCard key={org.id} org={org} />)}
              </div>
            </div>
          )}

          {orgs.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center text-muted-foreground">
                <Building2 className="w-10 h-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No organizations found</p>
                <p className="text-sm mt-1">Connect a Microsoft 365 tenant to get started.</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 text-sm text-muted-foreground">
          <Link href="/app/add-tenant">
            <Button variant="outline" className="gap-2 rounded-full border-dashed border-2 hover:border-primary hover:text-primary" data-testid="button-connect-tenant">
              <Plus className="w-4 h-4" />
              Connect a new M365 tenant
            </Button>
          </Link>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
