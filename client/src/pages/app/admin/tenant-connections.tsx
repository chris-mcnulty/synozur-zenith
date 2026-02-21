import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  Key
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const tenants = [
  { 
    id: "TEN-001", 
    domain: "synozur.onmicrosoft.com", 
    name: "Synozur Production", 
    type: "Production", 
    status: "Healthy", 
    lastSync: "10 mins ago",
    appId: "c8a4...",
    m365Users: "1,248",
    color: ""
  },
  { 
    id: "TEN-002", 
    domain: "cascadiaoceanic.onmicrosoft.com", 
    name: "Cascadia Oceanic", 
    type: "Production", 
    status: "Healthy", 
    lastSync: "25 mins ago",
    appId: "f9b2...",
    m365Users: "672",
    color: "text-emerald-600"
  },
  { 
    id: "TEN-003", 
    domain: "acmecorp.onmicrosoft.com", 
    name: "Acme Acquisition", 
    type: "Integration", 
    status: "Error", 
    lastSync: "Failed",
    appId: "Pending",
    m365Users: "840",
    color: ""
  }
];

export default function TenantConnectionsPage() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tenant Connections</h1>
          <p className="text-muted-foreground mt-1">Manage Microsoft 365 tenant bindings and Entra ID app registrations.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <RefreshCcw className="w-4 h-4" />
            Sync All
          </Button>
          <Button className="gap-2 shadow-md shadow-primary/20">
            <Plus className="w-4 h-4" />
            Connect Tenant
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Connected Tenants</CardTitle>
            <Cloud className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">3</div>
            <p className="text-xs text-muted-foreground mt-1">Active environments</p>
          </CardContent>
        </Card>
        
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">API Health</CardTitle>
            <Activity className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500">98.2%</div>
            <p className="text-xs text-muted-foreground mt-1">Graph API success rate</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-red-500/20 shadow-red-500/5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-red-500">Auth Errors</CardTitle>
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">1</div>
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">Token expired</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50 shadow-xl">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-xl flex items-center gap-2">
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
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="pl-6">Tenant Details</TableHead>
                <TableHead>Environment</TableHead>
                <TableHead>App Registration</TableHead>
                <TableHead>M365 Users</TableHead>
                <TableHead>Graph Sync</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="pl-6">
                    <div className="flex flex-col">
                      <span className={`font-semibold text-sm ${tenant.color}`}>{tenant.name}</span>
                      <span className={`text-xs font-mono mt-0.5 ${tenant.color || 'text-muted-foreground'}`}>{tenant.domain}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      tenant.type === 'Production' ? 'bg-primary/10 text-primary border-primary/20' :
                      tenant.type === 'Sandbox' ? 'bg-secondary/10 text-secondary-foreground border-secondary/20' :
                      'bg-muted text-muted-foreground'
                    }>
                      {tenant.type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <Key className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-mono text-xs">{tenant.appId}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {tenant.m365Users}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        {tenant.status === 'Healthy' && <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />}
                        {tenant.status === 'Warning' && <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />}
                        {tenant.status === 'Error' && <ShieldAlert className="w-3.5 h-3.5 text-red-500" />}
                        <span className={`text-xs font-medium ${
                          tenant.status === 'Healthy' ? 'text-emerald-500' : 
                          tenant.status === 'Warning' ? 'text-amber-500' : 'text-red-500'
                        }`}>
                          {tenant.status}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">Last: {tenant.lastSync}</div>
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
                        <DropdownMenuItem className="gap-2"><Settings2 className="w-4 h-4" /> App Registration</DropdownMenuItem>
                        <DropdownMenuItem className="gap-2"><RefreshCcw className="w-4 h-4" /> Force Sync</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive gap-2">Disconnect</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}