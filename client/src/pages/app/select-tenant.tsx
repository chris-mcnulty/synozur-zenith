import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Globe, Loader2, LogOut, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

type TenantConnection = {
  id: string;
  tenantName: string;
  domain: string;
  status: string;
  lastSyncAt: string | null;
  lastSyncSiteCount: number | null;
};

export default function SelectTenantPage() {
  const [, setLocation] = useLocation();

  const { data: authData, isLoading: authLoading } = useQuery<{
    user: { id: string; email: string; name: string | null; role: string };
    organization: { id: string; name: string; servicePlan: string; domain: string | null } | null;
    activeOrganizationId: string | null;
  }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    staleTime: 5 * 60 * 1000,
  });

  const { data: tenants = [], isLoading: tenantsLoading } = useQuery<TenantConnection[]>({
    queryKey: ["/api/admin/tenants"],
    queryFn: () => fetch("/api/admin/tenants", { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: !!authData?.user,
  });

  useEffect(() => {
    if (!authLoading && !tenantsLoading && tenants.length > 0) {
      setLocation("/app/dashboard");
    }
  }, [authLoading, tenantsLoading, tenants.length, setLocation]);

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

  if (authLoading || tenantsLoading) {
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

  const org = authData.organization;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-24 px-4">
      <div className="max-w-xl w-full">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-3xl font-bold tracking-tight mb-3" data-testid="text-select-title">
            Connect your Microsoft 365 tenant
          </h1>
          <p className="text-muted-foreground">
            {authData.user.name ? `Welcome, ${authData.user.name.split(' ')[0]}.` : `Welcome.`}
            {" "}You're set up in <strong>{org?.name || "your organization"}</strong>. Connect an M365 tenant to get started.
          </p>
        </div>

        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 fill-mode-both">
          {org && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-primary/10 shrink-0">
                  <Building2 className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" data-testid="text-org-name">{org.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">
                      {org.servicePlan || 'TRIAL'}
                    </Badge>
                    {org.domain && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {org.domain}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Link href="/app/add-tenant">
            <Card className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md hover:shadow-primary/5 border-dashed border-2" data-testid="button-connect-tenant">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-muted shrink-0">
                  <Plus className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">Connect a Microsoft 365 tenant</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Enter your tenant domain to begin the consent flow</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="mt-10 flex justify-center">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground" onClick={handleLogout} data-testid="button-logout">
            <LogOut className="w-4 h-4" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
