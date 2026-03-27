import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TenantProvider } from "@/lib/tenant-context";
import NotFound from "@/pages/not-found";

import SplashPage from "./pages/splash";
import LoginPage from "./pages/auth/login";
import EntraCallbackPage from "./pages/auth/callback";
import SelectTenantPage from "./pages/app/select-tenant";
import AddTenantPage from "./pages/app/add-tenant";
import DashboardPage from "./pages/app/dashboard";
import ProvisionNewPage from "./pages/app/provision-new";
import GovernancePage from "./pages/app/governance";
import WorkspaceDetailsPage from "./pages/app/workspace-details";
import PurviewConfigPage from "./pages/app/purview";
import SyntexPage from "./pages/app/syntex";
import AdminTemplatesPage from "./pages/app/admin/templates";
import DocumentLibraryPage from "./pages/app/document-library";
import StructuresPage from "./pages/app/structures";
import ReportsPage from "./pages/app/reports";
import ContentTypesPage from "./pages/app/content-types";
import EmbeddedContainersPage from "./pages/app/embedded-containers";
import ArchiveBackupPage from "./pages/app/archive-backup";
import LifecycleReviewHub from "./pages/app/lifecycle-review";
import ApprovalsQueue from "./pages/app/approvals";
import DiscoverDashboard from "./pages/app/discover";
import AICopilotIntegration from "./pages/app/ai-copilot";
import ServicePlansPage from "./pages/app/admin/service-plans";
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
import SupportPage from "./pages/app/support";
import TeamsChannelsPage from "./pages/app/teams-channels";
import OneDriveInventoryPage from "./pages/app/onedrive-inventory";
import RecordingsPage from "./pages/app/recordings";
import AppShell from "./components/layout/app-shell";

const EmptyPage = ({ title }: { title: string }) => (
  <div className="flex h-[50vh] items-center justify-center">
    <div className="text-center space-y-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-muted-foreground">This feature is part of the Zenith MVP mockup.</p>
    </div>
  </div>
);

const NO_SHELL_ROUTES = ["/", "/login", "/auth/entra/callback", "/app/select-tenant", "/app/add-tenant"];

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
        <Route path="/login" component={LoginPage} />
        <Route path="/auth/entra/callback" component={EntraCallbackPage} />
        <Route path="/app/select-tenant" component={SelectTenantPage} />
        <Route path="/app/add-tenant" component={AddTenantPage} />
        <Route path="/app/dashboard" component={DashboardPage} />
        <Route path="/app/provision/new" component={ProvisionNewPage} />
        <Route path="/app/provision" component={() => <EmptyPage title="Provisioning Requests" />} />
        <Route path="/app/governance/workspaces/:id" component={WorkspaceDetailsPage} />
        <Route path="/app/governance" component={GovernancePage} />
        <Route path="/app/syntex" component={SyntexPage} />
        <Route path="/app/purview" component={PurviewConfigPage} />
        <Route path="/app/reports" component={ReportsPage} />
        <Route path="/app/document-library" component={DocumentLibraryPage} />
        <Route path="/app/structures" component={StructuresPage} />
        <Route path="/app/content-types" component={ContentTypesPage} />
        <Route path="/app/embedded-containers" component={EmbeddedContainersPage} />
        <Route path="/app/archive-backup" component={ArchiveBackupPage} />
        <Route path="/app/lifecycle" component={LifecycleReviewHub} />
        <Route path="/app/approvals" component={ApprovalsQueue} />
        <Route path="/app/ai-copilot" component={AICopilotIntegration} />
        <Route path="/app/discover" component={DiscoverDashboard} />
        <Route path="/app/admin/plans" component={ServicePlansPage} />
        <Route path="/app/admin/users" component={UserManagementPage} />
        <Route path="/app/admin/organization" component={OrganizationSettingsPage} />
        <Route path="/app/admin/system" component={SystemAdminPage} />
        <Route path="/app/admin/tenants" component={TenantConnectionsPage} />
        <Route path="/app/admin/audit-log" component={AuditLogPage} />
        <Route path="/app/admin/data-dictionaries" component={DataDictionariesPage} />
        <Route path="/app/admin/custom-fields" component={CustomFieldsPage} />
        <Route path="/app/admin/policies" component={PolicyBuilderPage} />
        <Route path="/app/admin/policy-whatif" component={PolicyWhatIfPage} />
        <Route path="/app/admin/entra" component={EntraSetupPage} />
        <Route path="/app/admin" component={AdminTemplatesPage} />
        <Route path="/app/teams-channels" component={TeamsChannelsPage} />
        <Route path="/app/onedrive-inventory" component={OneDriveInventoryPage} />
        <Route path="/app/recordings" component={RecordingsPage} />
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
