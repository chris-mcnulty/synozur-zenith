import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2,
  Search,
  Plus,
  Server,
  Activity,
  Globe,
  Key,
  MoreVertical,
  Ban,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

type BlockedDomain = {
  id: string;
  domain: string;
  reason: string | null;
  createdBy: string | null;
  createdAt: string;
};

const organizations = [
  { id: "ORG-001", name: "The Synozur Alliance", domain: "synozur.demo", plan: "Professional", status: "Active", tenants: 2 },
  { id: "ORG-002", name: "Contoso Corp", domain: "contoso.com", plan: "Enterprise", status: "Active", tenants: 4 },
  { id: "ORG-003", name: "Fabrikam Inc", domain: "fabrikam.local", plan: "Standard", status: "Suspended", tenants: 1 },
  { id: "ORG-004", name: "Tailspin Toys", domain: "tailspin.net", plan: "Standard", status: "Active", tenants: 1 },
];

export default function SystemAdminPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newBlockedDomain, setNewBlockedDomain] = useState("");
  const [newBlockedReason, setNewBlockedReason] = useState("");

  const { data: blockedDomains = [], isLoading: blockedLoading } = useQuery<BlockedDomain[]>({
    queryKey: ["/api/admin/domain-blocklist"],
    queryFn: async () => {
      const res = await fetch("/api/admin/domain-blocklist");
      if (!res.ok) throw new Error("Failed to fetch blocklist");
      return res.json();
    },
  });

  const addBlockedDomainMutation = useMutation({
    mutationFn: async ({ domain, reason }: { domain: string; reason: string }) => {
      const res = await fetch("/api/admin/domain-blocklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, reason: reason || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to add domain");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domain-blocklist"] });
      setNewBlockedDomain("");
      setNewBlockedReason("");
      toast({ title: "Domain blocked", description: `${newBlockedDomain} has been added to the blocklist.` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const removeBlockedDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const res = await fetch(`/api/admin/domain-blocklist/${encodeURIComponent(domain)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove domain");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/domain-blocklist"] });
      toast({ title: "Domain unblocked", description: "Domain has been removed from the blocklist." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">System Administration</h1>
          <p className="text-muted-foreground mt-1">Platform-level controls for managing all organizations and infrastructure.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive" data-testid="button-system-health">
            <Activity className="w-4 h-4" />
            System Health
          </Button>
          <Button className="gap-2 shadow-md shadow-primary/20" data-testid="button-create-org">
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
            <div className="text-2xl font-bold" data-testid="text-total-orgs">124</div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-purple-500/20 shadow-lg shadow-purple-500/5 bg-gradient-to-br from-purple-500/5 to-transparent">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Managed Tenants</CardTitle>
            <Globe className="w-4 h-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-tenants">312</div>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Blocked Domains</CardTitle>
            <Ban className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-blocked-count">{blockedDomains.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="organizations" className="space-y-4">
        <TabsList data-testid="tabs-admin">
          <TabsTrigger value="organizations">Organizations</TabsTrigger>
          <TabsTrigger value="blocked-domains">Blocked Domains</TabsTrigger>
        </TabsList>

        <TabsContent value="organizations">
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
                    data-testid="input-search-orgs"
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
                    <TableRow key={org.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-org-${org.id}`}>
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-org-menu-${org.id}`}>
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
        </TabsContent>

        <TabsContent value="blocked-domains">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Ban className="w-5 h-5 text-red-500" />
                    Blocked Registration Domains
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Email domains on this list cannot self-register new organizations. Users with these domains must be invited by an existing admin.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="flex flex-col sm:flex-row gap-3 p-4 rounded-lg bg-muted/20 border border-border/40" data-testid="card-add-blocked-domain">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Domain</label>
                  <Input
                    placeholder="e.g. example.com"
                    value={newBlockedDomain}
                    onChange={(e) => setNewBlockedDomain(e.target.value)}
                    className="font-mono text-sm"
                    data-testid="input-blocked-domain"
                  />
                </div>
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
                  <Input
                    placeholder="e.g. Personal email provider"
                    value={newBlockedReason}
                    onChange={(e) => setNewBlockedReason(e.target.value)}
                    className="text-sm"
                    data-testid="input-blocked-reason"
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={() => addBlockedDomainMutation.mutate({ domain: newBlockedDomain, reason: newBlockedReason })}
                    disabled={!newBlockedDomain.trim() || addBlockedDomainMutation.isPending}
                    className="gap-2"
                    data-testid="button-add-blocked-domain"
                  >
                    {addBlockedDomainMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Block Domain
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border/40 bg-amber-500/5 p-3 flex gap-2 text-xs text-muted-foreground">
                <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p>Blocking a domain prevents new users from self-registering with email addresses from that domain. Existing users and organizations with that domain are not affected.</p>
              </div>

              {blockedLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : blockedDomains.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Ban className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No domains are currently blocked.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Domain</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Blocked Since</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blockedDomains.map((entry) => (
                      <TableRow key={entry.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-blocked-${entry.domain}`}>
                        <TableCell className="pl-6 font-mono text-sm font-medium">{entry.domain}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{entry.reason || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            onClick={() => removeBlockedDomainMutation.mutate(entry.domain)}
                            disabled={removeBlockedDomainMutation.isPending}
                            data-testid={`button-unblock-${entry.domain}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
