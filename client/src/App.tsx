import { Switch, Route, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Pages
import SplashPage from "./pages/splash";
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
import AppShell from "./components/layout/app-shell";

// Fallback empty pages for other routes
const EmptyPage = ({ title }: { title: string }) => (
  <div className="flex h-[50vh] items-center justify-center">
    <div className="text-center space-y-4">
      <h2 className="text-2xl font-bold">{title}</h2>
      <p className="text-muted-foreground">This feature is part of the Zenith MVP mockup.</p>
    </div>
  </div>
);

function AppRoutes() {
  return (
    <Switch>
      <Route path="/" component={SplashPage} />
      <Route path="/auth/entra/callback" component={EntraCallbackPage} />
      
      {/* App Shell Routes */}
      <Route path="/app/:rest*">
        <Switch>
          <Route path="/app/select-tenant" component={SelectTenantPage} />
          <Route path="/app/add-tenant" component={AddTenantPage} />
          
          <Route>
            <AppShell>
              <Switch>
                <Route path="/app/dashboard" component={DashboardPage} />
                <Route path="/app/provision/new" component={ProvisionNewPage} />
                <Route path="/app/provision" component={() => <EmptyPage title="Provisioning Requests" />} />
                <Route path="/app/governance" component={GovernancePage} />
                <Route path="/app/governance/workspaces/:id" component={WorkspaceDetailsPage} />
                <Route path="/app/syntex" component={SyntexPage} />
                <Route path="/app/purview" component={PurviewConfigPage} />
                <Route path="/app/lifecycle" component={() => <EmptyPage title="Lifecycle Management" />} />
                <Route path="/app/reports" component={() => <EmptyPage title="Governance Reports" />} />
                <Route path="/app/admin" component={AdminTemplatesPage} />
                <Route component={NotFound} />
              </Switch>
            </AppShell>
          </Route>
        </Switch>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppRoutes />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;