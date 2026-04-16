import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TenantProvider } from "@/lib/tenant-context";
import NotFound from "@/pages/not-found";
import { ComingSoonPage } from "@/components/coming-soon-page";
import { FolderPlus, CheckCircle2, Clock, BarChart3, Search, ShieldCheck, LayoutDashboard } from "lucide-react";

import SplashPage from "./pages/splash";
import PlansPage from "./pages/plans";
import LoginPage from "./pages/auth/login";
import EntraCallbackPage from "./pages/auth/callback";
import SelectTenantPage from "./pages/app/select-tenant";
import AddTenantPage from "./pages/app/add-tenant";
import DashboardPage from "./pages/app/dashboard";
import ProvisionNewPage from "./pages/app/provision-new";
import GovernancePage from "./pages/app/governance";
import WorkspaceDetailsPage from "./pages/app/workspace-details";
import PurviewConfigPage from "./pages/app/purview";
import AdminTemplatesPage from "./pages/app/admin/templates";
import StructuresPage from "./pages/app/structures";
import ReportsPage from "./pages/app/reports";
import InformationArchitecturePage from "./pages/app/information-architecture";
import EmbeddedContainersPage from "./pages/app/embedded-containers";
import ArchiveBackupPage from "./pages/app/archive-backup";
import LifecycleReviewHub from "./pages/app/lifecycle-review";
import ApprovalsQueue from "./pages/app/approvals";
import DiscoverDashboard from "./pages/app/discover";
import AICopilotIntegration from "./pages/app/ai-copilot";
import CopilotReadinessPage from "./pages/app/copilot-readiness";
import IAAssessmentPage from "./pages/app/ia-assessment";
import ContentIntensityHeatmapPage from "./pages/app/content-intensity-heatmap";
import CopilotPromptIntelligencePage from "./pages/app/copilot-prompt-intelligence";
import UserManagementPage from "./pages/app/admin/users";
import OrganizationSettingsPage from "./pages/app/admin/organization";
import SystemAdminPage from "./pages/app/admin/system";
import TenantConnectionsPage from "./pages/app/admin/tenant-connections";
import PolicyBuilderPage from "./pages/app/admin/policy-builder";
import PolicyWhatIfPage from "./pages/app/admin/policy-whatif";
import EntraSetupPage from "./pages/app/admin/entra-setup";
import DataDictionariesPage from "./pages/app/admin/data-dictionaries";
import CustomFieldsPage from "./pages/app/admin/custom-fields";
import AuditLogPage from "./pages/app/admin/audit-log";
import AISettingsPage from "./pages/app/admin/ai-settings";
import PlanManagementPage from "./pages/app/admin/plan-management";
import JobMonitorPage from "./pages/app/admin/job-monitor";
import SupportPage from "./pages/app/support";
import TeamsChannelsPage from "./pages/app/teams-channels";
import OneDriveInventoryPage from "./pages/app/onedrive-inventory";
import RecordingsPage from "./pages/app/recordings";
import EmailStorageReportPage from "./pages/app/email-storage-report";
import M365OverviewReportPage from "./pages/app/m365-overview-report";
import LicensingPage from "./pages/app/licensing";
import AppShell from "./components/layout/app-shell";

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

type AuthData = {
  user: { id: string; name: string | null; email: string; role: string; effectiveRole?: string; authProvider: string | null; organizationId: string | null };
  organization: { id: string; name: string } | null;
  activeOrganizationId: string | null;
  membershipCount: number;
} | null;

function useAuthData() {
  return useQuery<AuthData>({
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
}

function RoleGuard({ minRole, children }: { minRole: string; children: React.ReactNode }) {
  const { data: authData, isLoading } = useAuthData();

  if (isLoading) return null;

  const effectiveRole = authData?.user?.effectiveRole || authData?.user?.role;
  if (!hasMinRole(effectiveRole, minRole)) {
    return <Redirect to="/app/dashboard" />;
  }

  return <>{children}</>;
}

// BL-035: Tailored "Coming Soon" configurations for mock/planned routes.
const COMING_SOON_CONFIGS = {
  provision: {
    title: "Governed Site Provisioning",
    description: "Governed site provisioning with approval workflows, naming conventions, and sensitivity label assignment — coming in a future release.",
    icon: FolderPlus,
    relatedHref: "/app/governance",
    relatedLabel: "Go to SharePoint Sites",
    relatedIcon: ShieldCheck,
    phase: "Roadmap",
  },
  approvals: {
    title: "Approvals Queue",
    description: "Approval queue for pending provisioning requests, metadata change requests, and sensitivity label escalations.",
    icon: CheckCircle2,
    relatedHref: "/app/dashboard",
    relatedLabel: "Back to Dashboard",
    relatedIcon: LayoutDashboard,
    phase: "Roadmap",
  },
  lifecycle: {
    title: "Lifecycle Review Hub",
    description: "Automated lifecycle review hub for stale, orphaned, and non-compliant sites — with remediation queue and owner notifications.",
    icon: Clock,
    relatedHref: "/app/governance",
    relatedLabel: "Go to SharePoint Sites",
    relatedIcon: ShieldCheck,
    phase: "Roadmap",
  },
  reports: {
    title: "Executive Reports",
    description: "Executive governance reporting with trend analysis, compliance KPIs, and scheduled PDF delivery.",
    icon: BarChart3,
    relatedHref: "/app/dashboard",
    relatedLabel: "Back to Dashboard",
    relatedIcon: LayoutDashboard,
    phase: "Roadmap",
  },
  discover: {
    title: "Discover & Migrate",
    description: "Discover migration candidates across on-premises file shares and cloud storage — with AI-powered classification readiness scoring.",
    icon: Search,
    phase: "Roadmap",
  },
} as const;

const NO_SHELL_ROUTES = ["/", "/plans", "/login", "/auth/entra/callback", "/app/select-tenant", "/app/add-tenant", "/app/admin/plans"];

function AppShellWrapper({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const needsShell = location.startsWith("/app/") && !NO_SHELL_ROUTES.includes(location);

  if (needsShell) {
    return <AppShell>{children}</AppShell>;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <AppShellWrapper>
      <Switch>
        <Route path="/" component={SplashPage} />
        <Route path="/plans" component={PlansPage} />
        <Route path="/login" component={LoginPage} />
        <Route path="/auth/entra/callback" component={EntraCallbackPage} />
        <Route path="/app/select-tenant" component={SelectTenantPage} />
        <Route path="/app/add-tenant" component={AddTenantPage} />
        <Route path="/app/dashboard" component={DashboardPage} />
        <Route path="/app/provision/new" component={ProvisionNewPage} />
        <Route path="/app/provision" component={() => <ComingSoonPage config={COMING_SOON_CONFIGS.provision} />} />
        <Route path="/app/governance/workspaces/:id" component={WorkspaceDetailsPage} />
        <Route path="/app/governance" component={GovernancePage} />
        <Route path="/app/information-architecture" component={InformationArchitecturePage} />
        {/* Legacy redirects for consolidated pages */}
        <Route path="/app/document-library"><Redirect to="/app/information-architecture" /></Route>
        <Route path="/app/content-types"><Redirect to="/app/information-architecture" /></Route>
        <Route path="/app/syntex"><Redirect to="/app/information-architecture" /></Route>
        <Route path="/app/purview" component={PurviewConfigPage} />
        <Route path="/app/reports" component={ReportsPage} />
        <Route path="/app/structures" component={StructuresPage} />
        <Route path="/app/embedded-containers" component={EmbeddedContainersPage} />
        <Route path="/app/archive-backup" component={ArchiveBackupPage} />
        <Route path="/app/lifecycle" component={LifecycleReviewHub} />
        <Route path="/app/approvals" component={ApprovalsQueue} />
        <Route path="/app/ai-copilot" component={AICopilotIntegration} />
        <Route path="/app/copilot-readiness" component={CopilotReadinessPage} />
        <Route path="/app/ia-assessment" component={IAAssessmentPage} />
        <Route path="/app/content-intensity-heatmap" component={ContentIntensityHeatmapPage} />
        <Route path="/app/copilot-prompt-intelligence" component={CopilotPromptIntelligencePage} />
        <Route path="/app/discover" component={DiscoverDashboard} />
        <Route path="/app/admin/plans"><Redirect to="/plans" /></Route>
        <Route path="/app/admin/users">
          <RoleGuard minRole="tenant_admin"><UserManagementPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/organization">
          <RoleGuard minRole="tenant_admin"><OrganizationSettingsPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/system">
          <RoleGuard minRole="platform_owner"><SystemAdminPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/ai-settings">
          <RoleGuard minRole="platform_owner"><AISettingsPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/tenants">
          <RoleGuard minRole="tenant_admin"><TenantConnectionsPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/audit-log">
          <RoleGuard minRole="read_only_auditor"><AuditLogPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/job-monitor">
          <RoleGuard minRole="governance_admin"><JobMonitorPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/data-dictionaries">
          <RoleGuard minRole="tenant_admin"><DataDictionariesPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/custom-fields">
          <RoleGuard minRole="tenant_admin"><CustomFieldsPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/policies">
          <RoleGuard minRole="governance_admin"><PolicyBuilderPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/policy-whatif">
          <RoleGuard minRole="governance_admin"><PolicyWhatIfPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/entra">
          <RoleGuard minRole="tenant_admin"><EntraSetupPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/ai-settings">
          <RoleGuard minRole="platform_owner"><AISettingsPage /></RoleGuard>
        </Route>
        <Route path="/app/admin/plan-management">
          <RoleGuard minRole="platform_owner"><PlanManagementPage /></RoleGuard>
        </Route>
        <Route path="/app/admin">
          <RoleGuard minRole="tenant_admin"><AdminTemplatesPage /></RoleGuard>
        </Route>
        <Route path="/app/teams-channels" component={TeamsChannelsPage} />
        <Route path="/app/onedrive-inventory" component={OneDriveInventoryPage} />
        <Route path="/app/recordings" component={RecordingsPage} />
        <Route path="/app/email-storage-report" component={EmailStorageReportPage} />
        <Route path="/app/m365-overview-report" component={M365OverviewReportPage} />
        <Route path="/app/licensing" component={LicensingPage} />
        <Route path="/app/support/:tab" component={SupportPage} />
        <Route path="/app/support" component={SupportPage} />
        <Route component={NotFound} />
      </Switch>
    </AppShellWrapper>
  );
}

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <QueryClientProvider client={queryClient}>
        <TenantProvider>
          <TooltipProvider>
            <Toaster />
            <AppRoutes />
          </TooltipProvider>
        </TenantProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
