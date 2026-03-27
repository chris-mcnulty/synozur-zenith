import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Network, 
  Search, 
  FileText, 
  AlertCircle, 
  RefreshCcw, 
  Globe, 
  Settings2,
  MoreVertical,
  Activity,
  Loader2,
  Building2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenant } from "@/lib/tenant-context";

type ContentType = {
  id: string;
  tenantConnectionId: string;
  contentTypeId: string;
  name: string;
  group: string | null;
  description: string | null;
  isHub: boolean;
  subscribedSiteCount: number;
  syncedAt: string | null;
};

export default function ContentTypesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id;

  const { data: contentTypes = [], isLoading, isError, error } = useQuery<ContentType[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "content-types"],
    queryFn: async () => {
      if (!tenantConnectionId) return [];
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/content-types`);
      if (!res.ok) throw new Error(`Failed to load content types: ${res.statusText}`);
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const filteredContentTypes = contentTypes.filter(ct =>
    !searchTerm ||
    ct.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (ct.group ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const publishedCount = contentTypes.filter(ct => ct.isHub).length;
  const totalSubscriptions = contentTypes.reduce((sum, ct) => sum + (ct.subscribedSiteCount || 0), 0);

  if (!tenantConnectionId) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Type Syndication</h1>
          <p className="text-muted-foreground mt-1">Manage global content types, metadata columns, and monitor publishing status.</p>
        </div>
        <Card className="glass-panel border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Building2 className="w-12 h-12 text-muted-foreground/40" />
            <div>
              <p className="text-lg font-medium text-muted-foreground">No tenant selected</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Select a tenant to view its content types.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Type Syndication</h1>
          <p className="text-muted-foreground mt-1">Manage global content types, metadata columns, and monitor publishing status.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2" disabled data-testid="button-force-sync-all">
            <RefreshCcw className="w-4 h-4" />
            Force Sync All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Hub Content Types</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
            ) : (
              <div className="text-3xl font-bold" data-testid="stat-published-count">{publishedCount}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">From hub sites</p>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
            ) : (
              <div className="text-3xl font-bold" data-testid="stat-subscriptions">{totalSubscriptions.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Across managed sites</p>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Synced Groups</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
            ) : (
              <div className="text-3xl font-bold" data-testid="stat-groups">
                {new Set(contentTypes.map(ct => ct.group).filter(Boolean)).size}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Distinct content groups</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="configuration" className="w-full">
        <TabsList className="bg-muted/50 p-1 w-full justify-start rounded-xl h-auto">
          <TabsTrigger value="configuration" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-configuration">
            <Settings2 className="w-4 h-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="status" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-status">
            <Activity className="w-4 h-4 mr-2" />
            Syndication Status
          </TabsTrigger>
          <TabsTrigger value="errors" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm" data-testid="tab-errors">
            <AlertCircle className="w-4 h-4 mr-2" />
            Error Reports
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="configuration" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Hub Content Types
                  </CardTitle>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search content types..."
                      className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      data-testid="input-search-content-types"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Loading content types...
                  </div>
                ) : isError ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <AlertCircle className="w-10 h-10 text-red-400" />
                    <p className="text-sm text-red-400">{(error as Error)?.message || "Failed to load content types"}</p>
                    <p className="text-xs text-muted-foreground">Run a tenant sync to populate content type data.</p>
                  </div>
                ) : filteredContentTypes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                    <FileText className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">
                      {searchTerm ? "No content types match your search." : "No content types synced yet."}
                    </p>
                    {!searchTerm && (
                      <p className="text-xs text-muted-foreground/70">Run a tenant sync to populate Content Type Hub data.</p>
                    )}
                  </div>
                ) : (
                  <Table>
                    <TableHeader className="bg-muted/30">
                      <TableRow>
                        <TableHead className="pl-6">Name</TableHead>
                        <TableHead>Group</TableHead>
                        <TableHead>Subscribed Sites</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredContentTypes.map((ct) => (
                        <TableRow key={ct.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-content-type-${ct.id}`}>
                          <TableCell className="pl-6 font-medium">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-muted-foreground" />
                              <span data-testid={`text-ct-name-${ct.id}`}>{ct.name}</span>
                            </div>
                          </TableCell>
                          <TableCell data-testid={`text-ct-group-${ct.id}`}>{ct.group || <span className="text-muted-foreground/50 italic">—</span>}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                              <span data-testid={`text-ct-sites-${ct.id}`}>{ct.subscribedSiteCount}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {ct.isHub ? (
                              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Hub</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-muted/30 text-muted-foreground">Local</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-ct-menu-${ct.id}`}>
                                  <MoreVertical className="w-4 h-4 text-muted-foreground" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>View Details</DropdownMenuItem>
                                <DropdownMenuItem>View Subscribers</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="status" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Network className="w-5 h-5 text-primary" />
                  Syndication Feed
                </CardTitle>
                <CardDescription>
                  Syndication status is updated during tenant sync. Run a sync to refresh propagation data.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Activity className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Live syndication tracking coming soon.</p>
                <p className="text-xs text-muted-foreground/70">
                  Per-site propagation status will appear here after it is wired to the Graph API.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="errors" className="m-0">
            <Card className="glass-panel border-red-500/20 shadow-xl shadow-red-500/5">
              <CardHeader className="pb-4 border-b border-red-500/10 bg-red-500/5">
                <CardTitle className="text-xl flex items-center gap-2 text-red-500">
                  <AlertCircle className="w-5 h-5" />
                  Active Publishing Errors
                </CardTitle>
                <CardDescription>Resolve these issues to resume content type syndication to affected sites.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <AlertCircle className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">No active publishing errors detected.</p>
                <p className="text-xs text-muted-foreground/70">
                  Syndication conflict detection will surface errors here once wired to the Graph API.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
