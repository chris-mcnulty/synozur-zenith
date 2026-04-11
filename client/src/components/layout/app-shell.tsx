import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Aurora } from "@/components/aurora";
import { Link, useLocation, Redirect } from "wouter";
import { 
  LayoutDashboard, 
  FolderPlus, 
  ShieldCheck, 
  Fingerprint, 
  Clock, 
  BarChart3, 
  Settings,
  HelpCircle,
  BookOpen,
  Bell,
  Search,
  ChevronDown,
  Building2,
  Menu,
  ChevronRight,
  LogOut,
  User,
  SunMoon,
  Layers,
  Check,
  BrainCircuit,
  LayoutTemplate,
  Box,
  Archive,
  CreditCard,
  Cloud,
  Users as UsersIcon,
  MessagesSquare,
  MonitorPlay,
  Server,
  CheckCircle2,
  KeyRound,
  BookMarked,
  FlaskConical,
  HardDrive,
  ClipboardList,
  Loader2,
  KeySquare,
  Lock,
  Mail,
  Network,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import SynozurAppSwitcher from "@/components/synozur-app-switcher";
import { useTenant } from "@/lib/tenant-context";
import { useServicePlan } from "@/hooks/use-service-plan";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

interface AppShellProps {
  children: React.ReactNode;
}

const ROLE_LEVELS: Record<string, number> = {
  platform_owner: 100,
  tenant_admin: 80,
  governance_admin: 60,
  operator: 40,
  viewer: 20,
  read_only_auditor: 10,
};

function hasMinRole(userRole: string | undefined, minRole: string): boolean {
  if (!userRole) return false;
  return (ROLE_LEVELS[userRole] ?? 0) >= (ROLE_LEVELS[minRole] ?? 999);
}

type NavItem = {
  name: string;
  href: string;
  icon: any;
  badge?: string;
  minRole?: string;
  isMock?: boolean;
  featureToggle?: "onedriveInventory" | "recordingsDiscovery" | "teamsDiscovery" | "telemetry" | "speDiscovery" | "contentGovernance" | "licensing";
};

type NavGroup = {
  label: string;
  minRole?: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
      { name: "Approvals", href: "/app/approvals", icon: CheckCircle2, badge: "3", minRole: "operator", isMock: true },
      { name: "Provision", href: "/app/provision", icon: FolderPlus, minRole: "operator", isMock: true },
    ]
  },
  {
    label: "Management",
    minRole: "operator",
    items: [
      { name: "SharePoint Sites", href: "/app/governance", icon: ShieldCheck },
      { name: "Policy Builder", href: "/app/admin/policies", icon: ShieldCheck, badge: "Ent+", minRole: "governance_admin" },
      { name: "What-If Planner", href: "/app/admin/policy-whatif", icon: FlaskConical, badge: "Ent+", minRole: "governance_admin" },
      { name: "Teams & Channels", href: "/app/teams-channels", icon: MessagesSquare, featureToggle: "teamsDiscovery" },
      { name: "OneDrive Inventory", href: "/app/onedrive-inventory", icon: HardDrive, featureToggle: "onedriveInventory" },
      { name: "Recordings Discovery", href: "/app/recordings", icon: MonitorPlay, featureToggle: "recordingsDiscovery" },
      { name: "Email Content Report", href: "/app/email-storage-report", icon: Mail, badge: "Ent+" },
      { name: "Structures", href: "/app/structures", icon: Layers },
      { name: "Information Architecture", href: "/app/information-architecture", icon: Network },
      { name: "Embedded Containers", href: "/app/embedded-containers", icon: Box, featureToggle: "speDiscovery" },
      { name: "Discover & Migrate", href: "/app/discover", icon: Search, badge: "Ent+", isMock: true },
      { name: "Archive & Backup", href: "/app/archive-backup", icon: Archive },
      { name: "Lifecycle", href: "/app/lifecycle", icon: Clock, isMock: true },
      { name: "Purview", href: "/app/purview", icon: Fingerprint },
    ]
  },
  {
    label: "Cost & Licensing",
    minRole: "operator",
    items: [
      { name: "License Overview", href: "/app/licensing", icon: CreditCard, featureToggle: "licensing" },
    ]
  },
  {
    label: "Insights & Intelligence",
    items: [
      { name: "Copilot Readiness", href: "/app/copilot-readiness", icon: Sparkles, badge: "Pro+" },
      { name: "IA Assessment", href: "/app/ia-assessment", icon: BarChart3, badge: "Ent+" },
      { name: "AI Assistant", href: "/app/ai-copilot", icon: BrainCircuit },
      { name: "Reports", href: "/app/reports", icon: BarChart3, isMock: true },
    ]
  }
];


export default function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  const { tenants, selectedTenant, setSelectedTenantId, isFeatureEnabled } = useTenant();
  const { isFeatureEnabled: planFeatureEnabled } = useServicePlan();
  const canUseMspAccess = planFeatureEnabled("mspAccess");
  const [mspDialogOpen, setMspDialogOpen] = useState(false);
  const [mspCode, setMspCode] = useState("");
  const [mspError, setMspError] = useState<string | null>(null);

  const redeemMspCodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch("/api/admin/msp-access/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to redeem code");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants"] });
      setMspDialogOpen(false);
      setMspCode("");
      setMspError(null);
    },
    onError: (err: Error) => {
      setMspError(err.message);
    },
  });

  const { data: authData, isLoading: authLoading } = useQuery<{
    user: { id: string; name: string | null; email: string; role: string; effectiveRole?: string; authProvider: string | null; organizationId: string | null };
    organization: { id: string; name: string } | null;
    activeOrganizationId: string | null;
    membershipCount: number;
  } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const r = await fetch("/api/auth/me", { credentials: "include" });
      if (r.status === 401) return null;
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });


  if (!authLoading && !authData?.user) {
    return <Redirect to="/login" />;
  }

  const currentUser = authData?.user;
  const activeOrg = authData?.organization;
  const userInitials = currentUser?.name
    ? currentUser.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)
    : currentUser?.email?.[0]?.toUpperCase() || "?";

  const effectiveRole = currentUser?.effectiveRole || currentUser?.role || "viewer";

  const adminItems: Array<{ name: string; href: string; icon: any; matchExact?: boolean; minRole: string }> = [
    { name: "Provisioning Templates", href: "/app/admin", icon: LayoutTemplate, matchExact: true, minRole: "tenant_admin" },
    { name: "User Management", href: "/app/admin/users", icon: UsersIcon, minRole: "tenant_admin" },
    { name: "Organization Settings", href: "/app/admin/organization", icon: Building2, minRole: "tenant_admin" },
    { name: "Tenant Connections", href: "/app/admin/tenants", icon: Cloud, minRole: "tenant_admin" },
    { name: "Data Dictionaries", href: "/app/admin/data-dictionaries", icon: BookMarked, minRole: "tenant_admin" },
    { name: "Custom Fields", href: "/app/admin/custom-fields", icon: Settings, minRole: "tenant_admin" },
  ];

  const platformAdminItems: Array<{ name: string; href: string; icon: any; minRole: string }> = [
    { name: "System Administration", href: "/app/admin/system", icon: Server, minRole: "platform_owner" },
    { name: "AI Settings", href: "/app/admin/ai-settings", icon: BrainCircuit, minRole: "platform_owner" },
    { name: "Entra ID Setup", href: "/app/admin/entra", icon: KeyRound, minRole: "tenant_admin" },
    { name: "Audit Log", href: "/app/admin/audit-log", icon: ClipboardList, minRole: "read_only_auditor" },
  ];

  const NavLinks = () => {
    const filteredGroups = navGroups
      .filter(group => !group.minRole || hasMinRole(effectiveRole, group.minRole))
      .map(group => ({
        ...group,
        items: group.items.filter(item => {
          if (item.minRole && !hasMinRole(effectiveRole, item.minRole)) return false;
          if (item.featureToggle && !isFeatureEnabled(item.featureToggle)) return false;
          return true;
        }),
      }))
      .filter(group => group.items.length > 0);

    const visibleAdminItems = adminItems.filter(item => hasMinRole(effectiveRole, item.minRole));
    const visiblePlatformItems = platformAdminItems.filter(item => hasMinRole(effectiveRole, item.minRole));
    const showAdminSection = visibleAdminItems.length > 0 || visiblePlatformItems.length > 0;

    return (
      <div className="space-y-6 py-4">
        {filteredGroups.map((group, i) => (
          <div key={i} className="space-y-2">
            <h4 className="px-4 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
              {group.label}
            </h4>
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = location.startsWith(item.href);
                return (
                  <Link key={item.name} href={item.href} className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive 
                      ? "bg-primary/10 text-primary shadow-sm shadow-primary/5" 
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}>
                    <div className="flex items-center gap-3">
                      <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground/70"}`} />
                      {item.name}
                    </div>
                    <div className="flex items-center gap-1">
                      {item.isMock && (
                        <span className="flex h-4 items-center justify-center rounded px-1.5 text-[9px] font-semibold bg-amber-100/80 text-amber-600/80 dark:bg-amber-900/30 dark:text-amber-400/70 opacity-75 tracking-wide">
                          MOCK
                        </span>
                      )}
                      {item.badge && (
                        <span className={`flex h-5 items-center justify-center rounded-full px-2 text-[10px] font-bold ${isActive ? 'bg-primary text-primary-foreground' : 'bg-primary/20 text-primary'}`}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}

        {showAdminSection && (
          <div className="space-y-2 pt-4 border-t border-border/50">
            <h4 className="px-4 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
              Administration
            </h4>
            <div className="space-y-1">
              {visibleAdminItems.map((item) => {
                const isActive = item.matchExact ? location === item.href : location.startsWith(item.href);
                return (
                  <Link key={item.name} href={item.href} className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive 
                      ? "bg-primary/10 text-primary shadow-sm shadow-primary/5" 
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}>
                    <div className="flex items-center gap-3">
                      <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground/70"}`} />
                      {item.name}
                    </div>
                  </Link>
                );
              })}

              {visiblePlatformItems.length > 0 && (
                <div className="pt-2 mt-2 border-t border-border/50">
                  <div className="px-3 pb-1 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary/70">
                    <ShieldCheck className="w-3 h-3" /> Platform Admin Only
                  </div>
                  {visiblePlatformItems.map((item) => {
                    const isActive = location.startsWith(item.href);
                    return (
                      <Link key={item.name} href={item.href} className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        isActive 
                          ? "bg-primary/10 text-primary shadow-sm shadow-primary/5" 
                          : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                      }`}>
                        <div className="flex items-center gap-3">
                          <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground/70"}`} />
                          {item.name}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex text-foreground relative">
      <Aurora />
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col border-r border-border/40 bg-card/40 backdrop-blur-xl">
        <div className="h-16 flex items-center px-6 border-b border-border/40">
          <Link href="/app/dashboard" className="flex items-center cursor-pointer group">
            <img src="/images/brand/zenith-logo-white.png" alt="Zenith" className="h-8 transition-transform group-hover:scale-105" />
          </Link>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide">
          <NavLinks />
        </div>

        <div className="p-4 border-t border-border/40 bg-card/50">
          <Link href="/app/support" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
            location.startsWith("/app/support")
              ? "bg-primary/10 text-primary shadow-sm shadow-primary/5"
              : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          }`}>
            <BookOpen className={`w-5 h-5 ${location.startsWith("/app/support") ? "text-primary" : "text-muted-foreground/70"}`} />
            Support & About
            <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-border/40 bg-background/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <SynozurAppSwitcher currentApp="zenith" />
            <div className="w-px h-6 bg-border/40 hidden sm:block" />
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden -ml-2">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 border-r-border/40 bg-card/95 backdrop-blur-xl">
                <div className="h-16 flex items-center px-6 border-b border-border/40">
                  <div className="flex items-center">
                    <img src="/images/brand/zenith-logo-white.png" alt="Zenith" className="h-8" />
                  </div>
                </div>
                <div className="px-4 py-2 overflow-y-auto h-[calc(100vh-4rem)]">
                  <div className="space-y-2 pb-4 mb-4 border-b border-border/40">
                    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary/5">
                      <Building2 className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex flex-col -space-y-0.5">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Organization</span>
                        <span className="font-semibold text-sm leading-none">{activeOrg?.name || 'No organization'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-secondary/5">
                      <Cloud className="w-4 h-4 text-secondary shrink-0" />
                      <div className="flex flex-col -space-y-0.5">
                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">M365 Tenant</span>
                        <span className="font-semibold text-sm leading-none">{selectedTenant?.domain || 'No tenants'}</span>
                      </div>
                    </div>
                    {tenants.length > 1 && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors w-full text-left">
                            <Cloud className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium text-muted-foreground">Switch tenant...</span>
                            <ChevronDown className="w-3 h-3 text-muted-foreground/50 ml-auto" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56 rounded-xl p-2">
                          {tenants.map((tenant) => (
                            <DropdownMenuItem
                              key={tenant.id}
                              className={`rounded-lg p-2.5 cursor-pointer ${selectedTenant?.id === tenant.id ? 'bg-secondary/10 cursor-default' : ''}`}
                              onClick={() => tenant.id !== selectedTenant?.id && setSelectedTenantId(tenant.id)}
                            >
                              <Cloud className="w-3.5 h-3.5 mr-2 text-muted-foreground shrink-0" />
                              <div className="flex flex-col flex-1">
                                <span className={`font-medium text-sm ${selectedTenant?.id === tenant.id ? 'text-secondary' : ''}`}>{tenant.domain}</span>
                                <span className="text-[10px] text-muted-foreground">{tenant.tenantName}</span>
                              </div>
                              {tenant.isGrantedAccess && <Badge variant="outline" className="text-[10px] uppercase tracking-wider h-4 px-1 border-amber-500/40 text-amber-500 ml-1">Managed</Badge>}
                              {selectedTenant?.id === tenant.id && <Check className="w-4 h-4 text-secondary ml-auto shrink-0" />}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator className="my-1" />
                          <DropdownMenuItem
                            className="rounded-lg p-2.5 cursor-pointer text-muted-foreground"
                            onSelect={() => { if (canUseMspAccess) { setMspCode(""); setMspError(null); setMspDialogOpen(true); } }}
                            disabled={!canUseMspAccess}
                          >
                            {canUseMspAccess
                              ? <KeySquare className="w-4 h-4 mr-2" />
                              : <Lock className="w-4 h-4 mr-2 text-muted-foreground/50" />}
                            Enter MSP access code...
                            {!canUseMspAccess && <span className="ml-auto text-[9px] text-amber-600 font-medium">Professional+</span>}
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild className="rounded-lg p-2.5 cursor-pointer">
                            <Link href="/app/admin/tenants" className="flex items-center text-muted-foreground">
                              <Settings className="w-4 h-4 mr-2" /> Manage connections
                            </Link>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                    {tenants.length <= 1 && (
                      <Link href="/app/admin/tenants" className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                        <Settings className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-xs font-medium text-muted-foreground">Manage connections</span>
                      </Link>
                    )}
                  </div>
                  <NavLinks />
                  <div className="mt-8 pt-4 border-t border-border/40">
                    <Link href="/app/support" className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      location.startsWith("/app/support")
                        ? "bg-primary/10 text-primary shadow-sm shadow-primary/5"
                        : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                    }`}>
                      <BookOpen className={`w-5 h-5 ${location.startsWith("/app/support") ? "text-primary" : "text-muted-foreground/70"}`} />
                      Support & About
                    </Link>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* Master Selectors */}
            <div className="hidden md:flex items-center bg-card/40 border border-border/50 rounded-full shadow-sm p-0.5 backdrop-blur-md transition-colors hover:border-border/80">
              
              {/* Company/Org Display */}
              <div className="flex items-center gap-2 px-3 h-9" data-testid="text-active-org-display">
                <Building2 className="w-4 h-4 text-primary shrink-0" />
                <div className="flex flex-col items-start -space-y-0.5">
                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">Organization</span>
                  <span className="font-semibold text-sm leading-none text-foreground" data-testid="text-active-org">{activeOrg?.name || 'No organization'}</span>
                </div>
              </div>

              <div className="w-px h-6 bg-border/80 mx-1"></div>

              {/* Tenant Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 rounded-full px-3 hover:bg-muted/60 data-[state=open]:bg-muted/60 text-left">
                    <Cloud className="w-4 h-4 text-secondary shrink-0" />
                    <div className="flex flex-col items-start -space-y-0.5">
                      <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">M365 Tenant</span>
                      <span className="font-medium text-sm leading-none text-muted-foreground">{selectedTenant?.domain || 'No tenants'}</span>
                    </div>
                    <ChevronDown className="w-3 h-3 text-muted-foreground opacity-50 ml-1 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64 rounded-xl p-2">
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">Connected Tenants</DropdownMenuLabel>
                  <DropdownMenuSeparator className="mb-2 mt-1" />
                  {tenants.map((tenant) => (
                    <DropdownMenuItem
                      key={tenant.id}
                      className={`flex justify-between rounded-lg p-2.5 mt-1 items-start ${selectedTenant?.id === tenant.id ? 'bg-secondary/10 cursor-default' : 'cursor-pointer text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setSelectedTenantId(tenant.id)}
                    >
                      <div className="space-y-0.5">
                        <span className={`font-semibold block ${selectedTenant?.id === tenant.id ? 'text-secondary' : ''}`}>{tenant.domain}</span>
                        <span className="text-xs text-muted-foreground block">{tenant.tenantName}{tenant.isDemo ? ' (Demo)' : ''}</span>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {selectedTenant?.id === tenant.id && (
                          <Badge variant="default" className="text-[10px] bg-secondary text-secondary-foreground hover:bg-secondary uppercase tracking-wider h-5 px-1.5 shadow-sm shadow-secondary/20">Active</Badge>
                        )}
                        {tenant.isGrantedAccess && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider h-5 px-1.5 border-amber-500/40 text-amber-500">Managed</Badge>
                        )}
                      </div>
                    </DropdownMenuItem>
                  ))}
                  {tenants.length === 0 && (
                    <DropdownMenuItem className="rounded-lg p-2.5 text-muted-foreground cursor-default">
                      No tenant connections yet
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator className="my-2" />
                  <DropdownMenuItem
                    className="rounded-lg p-2.5 cursor-pointer text-muted-foreground"
                    onSelect={() => { if (canUseMspAccess) { setMspCode(""); setMspError(null); setMspDialogOpen(true); } }}
                    disabled={!canUseMspAccess}
                    data-testid="button-enter-msp-code"
                  >
                    {canUseMspAccess
                      ? <KeySquare className="w-4 h-4 mr-2" />
                      : <Lock className="w-4 h-4 mr-2 text-muted-foreground/50" />}
                    Enter MSP access code...
                    {!canUseMspAccess && <span className="ml-auto text-[9px] text-amber-600 font-medium">Professional+</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="rounded-lg p-2.5 cursor-pointer group">
                    <Link href="/app/admin/tenants" className="flex items-center text-muted-foreground">
                      <Settings className="w-4 h-4 mr-2" />
                      Manage connections
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative hidden md:block w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search resources..."
                className="h-10 pl-9 pr-12 bg-muted/40 border-border/50 rounded-full focus-visible:ring-primary/30 focus-visible:border-primary/50 transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <kbd className="inline-flex h-5 items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </div>
            </div>

            <Button variant="ghost" size="icon" className="rounded-full relative hover:bg-muted">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-2 right-2.5 w-2 h-2 bg-primary rounded-full border-2 border-background"></span>
            </Button>

            <div className="h-6 w-px bg-border/50 mx-1 hidden sm:block"></div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0" data-testid="button-user-menu">
                  <Avatar className="h-10 w-10 border-2 border-background shadow-sm hover:border-primary/20 transition-colors">
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">{userInitials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 rounded-xl p-2">
                <DropdownMenuLabel className="font-normal p-3">
                  <div className="flex flex-col space-y-1.5">
                    <p className="text-sm font-semibold leading-none" data-testid="text-current-user-name">{currentUser?.name || currentUser?.email || "User"}</p>
                    <p className="text-xs leading-none text-muted-foreground" data-testid="text-current-user-email">
                      {currentUser?.email || ""}
                    </p>
                    {(currentUser?.effectiveRole || currentUser?.role) && (
                      <p className="text-[10px] leading-none text-muted-foreground/70 capitalize mt-0.5">
                        {(currentUser.effectiveRole || currentUser.role).replace(/_/g, " ")}
                        {activeOrg && (
                          <span className="text-muted-foreground/50"> · {activeOrg.name}</span>
                        )}
                      </p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="mb-2" />
                <DropdownMenuGroup className="space-y-1">
                  <DropdownMenuItem className="rounded-lg cursor-pointer p-2.5">
                    <User className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>Profile Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="rounded-lg cursor-pointer p-2.5"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    data-testid="button-toggle-theme"
                  >
                    <SunMoon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem asChild className="rounded-lg cursor-pointer p-2.5 text-destructive focus:text-destructive focus:bg-destructive/10">
                  <Link href="/" className="flex items-center">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-background/50 p-4 sm:p-6 lg:p-8">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </div>

        {/* Global Help Button */}
        <div className="fixed bottom-6 right-6 z-50">
          <Button size="icon" className="h-14 w-14 rounded-full shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground transition-transform hover:scale-105">
            <HelpCircle className="w-6 h-6" />
          </Button>
        </div>
      </main>

      {/* MSP Access Code Dialog */}
      <Dialog open={mspDialogOpen} onOpenChange={(open) => { setMspDialogOpen(open); if (!open) { setMspCode(""); setMspError(null); } }}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeySquare className="w-5 h-5 text-primary" />
              Enter MSP Access Code
            </DialogTitle>
            <DialogDescription>
              Enter the 6-digit access code provided by your customer to gain access to their M365 tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="msp-code">Access code</Label>
              <Input
                id="msp-code"
                placeholder="e.g. 482913"
                value={mspCode}
                onChange={e => { setMspCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setMspError(null); }}
                maxLength={6}
                className="text-center text-lg tracking-widest font-mono"
                data-testid="input-msp-access-code"
                onKeyDown={e => { if (e.key === "Enter" && mspCode.length === 6) redeemMspCodeMutation.mutate(mspCode); }}
              />
            </div>
            {mspError && (
              <p className="text-sm text-destructive">{mspError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMspDialogOpen(false)} disabled={redeemMspCodeMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => redeemMspCodeMutation.mutate(mspCode)}
              disabled={mspCode.length !== 6 || redeemMspCodeMutation.isPending}
              data-testid="button-redeem-msp-code"
            >
              {redeemMspCodeMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirm access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Needed to wrap badge component inside dropdowns properly
function Badge({ className, variant, ...props }: any) {
  return <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variant === 'secondary' ? 'border-transparent bg-secondary/80 text-secondary-foreground' : variant === 'outline' ? 'text-foreground border-border/50' : 'border-transparent bg-primary text-primary-foreground'} ${className}`} {...props} />;
}