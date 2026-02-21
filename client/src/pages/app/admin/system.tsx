import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Building2, 
  Search, 
  Plus, 
  Server,
  Activity,
  Globe,
  Settings,
  MoreVertical,
  Key
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const organizations = [
  { id: "ORG-001", name: "Synozur Group", domain: "synozur.demo", plan: "Professional", status: "Active", tenants: 2 },
  { id: "ORG-002", name: "Contoso Corp", domain: "contoso.com", plan: "Enterprise", status: "Active", tenants: 4 },
  { id: "ORG-003", name: "Fabrikam Inc", domain: "fabrikam.local", plan: "Standard", status: "Suspended", tenants: 1 },
  { id: "ORG-004", name: "Tailspin Toys", domain: "tailspin.net", plan: "Standard", status: "Active", tenants: 1 },
];

export default function SystemAdminPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Administration</h1>
          <p className="text-muted-foreground mt-1">Platform-level controls for managing all organizations and infrastructure.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive">
            <Activity className="w-4 h-4" />
            System Health
          </Button>
          <Button className="gap-2 shadow-md shadow-primary/20">
            <Plus className="w-4 h-4" />
            Create Organization
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-panel border-blue-500/20 shadow-lg shadow-blue-500/5 bg-gradient-to-br from-blue-500/5 to-transparent">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Organizations</CardTitle>
            <Building2 className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">124</div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-purple-500/20 shadow-lg shadow-purple-500/5 bg-gradient-to-br from-purple-500/5 to-transparent">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Managed Tenants</CardTitle>
            <Globe className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">312</div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-emerald-500/20 shadow-lg shadow-emerald-500/5 bg-gradient-to-br from-emerald-500/5 to-transparent">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Platform API Load</CardTitle>
            <Server className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">45.2k/min</div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-amber-500/20 shadow-lg shadow-amber-500/5 bg-gradient-to-br from-amber-500/5 to-transparent">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Global Licenses</CardTitle>
            <Key className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">14,205</div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50 shadow-xl">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Organizations Directory
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search organizations..."
                className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="pl-6">Organization Name</TableHead>
                <TableHead>Primary Domain</TableHead>
                <TableHead>Service Plan</TableHead>
                <TableHead>Connected Tenants</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.map((org) => (
                <TableRow key={org.id} className="hover:bg-muted/10 transition-colors">
                  <TableCell className="pl-6 font-medium">{org.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{org.domain}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      org.plan === 'Enterprise' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 
                      org.plan === 'Professional' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' : ''
                    }>
                      {org.plan}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5 text-sm">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                      {org.tenants}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      org.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                      'bg-red-500/10 text-red-500 border-red-500/20'
                    }>
                      {org.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>View Details</DropdownMenuItem>
                        <DropdownMenuItem>Manage Plan</DropdownMenuItem>
                        <DropdownMenuItem>Impersonate Org Admin</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">Suspend Organization</DropdownMenuItem>
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