import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BrainCircuit, 
  FileText, 
  Search,
  Activity,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  ListTree,
  ArrowRight,
  Database,
  Loader2,
  Building2,
  Library,
  Layers,
  Info,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";

type DocumentLibrary = {
  id: string;
  workspaceId: string;
  m365ListId: string | null;
  displayName: string;
  webUrl: string | null;
  itemCount: number | null;
  storageUsedBytes: number | null;
  hidden: boolean | null;
  contentTypeCount: number | null;
  flaggedLargeItems: boolean | null;
  flaggedVersionSprawl: boolean | null;
  syncedAt: string | null;
};

type LibraryStats = {
  total: number;
  totalItems: number;
  flaggedLarge: number;
  flaggedVersions: number;
  withContentTypes: number;
};

function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export default function SyntexPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id;

  const { data: libraries = [], isLoading } = useQuery<DocumentLibrary[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "libraries", "syntex"],
    queryFn: async () => {
      if (!tenantConnectionId) return [];
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/libraries`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const visible = libraries.filter(l => !l.hidden);
  const eligible = visible.filter(l => (l.contentTypeCount ?? 0) > 0);

  const stats: LibraryStats = {
    total: visible.length,
    totalItems: visible.reduce((s, l) => s + (l.itemCount ?? 0), 0),
    flaggedLarge: visible.filter(l => l.flaggedLargeItems).length,
    flaggedVersions: visible.filter(l => l.flaggedVersionSprawl).length,
    withContentTypes: eligible.length,
  };

  const filtered = visible.filter(l =>
    !searchTerm ||
    l.displayName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!tenantConnectionId) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Syntex & Content AI</h1>
          <p className="text-muted-foreground mt-1">Configure and monitor SharePoint Premium document models across your managed libraries.</p>
        </div>
        <Card className="glass-panel border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Building2 className="w-12 h-12 text-muted-foreground/40" />
            <div>
              <p className="text-lg font-medium text-muted-foreground">No tenant selected</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Select a tenant to view document libraries eligible for Syntex enrichment.</p>
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
          <h1 className="text-3xl font-bold tracking-tight">Syntex & Content AI</h1>
          <p className="text-muted-foreground mt-1">Configure and monitor SharePoint Premium document models across your managed libraries.</p>
        </div>
        <div className="flex gap-3">
          <Button className="gap-2 rounded-full shadow-md shadow-primary/20" disabled>
            <BrainCircuit className="w-4 h-4" />
            New Model
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Document Libraries</CardTitle>
            <Library className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
              : <div className="text-3xl font-bold" data-testid="stat-libraries">{stats.total.toLocaleString()}</div>}
            <p className="text-xs text-muted-foreground mt-1">
              {!isLoading && `${stats.totalItems.toLocaleString()} total items`}
            </p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Content Type Enriched</CardTitle>
            <Layers className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
              : <div className="text-3xl font-bold text-emerald-500" data-testid="stat-enriched">{stats.withContentTypes}</div>}
            <p className="text-xs text-muted-foreground mt-1">Libraries with custom content types applied</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Flagged for Review</CardTitle>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {isLoading
              ? <div className="h-9 w-16 bg-muted/40 animate-pulse rounded" />
              : <div className="text-3xl font-bold text-amber-500" data-testid="stat-flagged">{stats.flaggedLarge + stats.flaggedVersions}</div>}
            <p className="text-xs text-muted-foreground mt-1">
              {!isLoading && `${stats.flaggedLarge} large items · ${stats.flaggedVersions} version sprawl`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="libraries" className="w-full">
        <TabsList className="bg-transparent h-12 gap-6 w-full justify-start border-b border-border/50 p-0 rounded-none mb-6">
          <TabsTrigger
            value="libraries"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
            data-testid="tab-libraries"
          >
            <Library className="w-4 h-4 mr-2" /> Library Inventory
          </TabsTrigger>
          <TabsTrigger
            value="models"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
            data-testid="tab-models"
          >
            <BrainCircuit className="w-4 h-4 mr-2" /> Model Directory
          </TabsTrigger>
          <TabsTrigger
            value="autofill"
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
            data-testid="tab-autofill"
          >
            <ListTree className="w-4 h-4 mr-2" /> Autofill Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="libraries" className="m-0">
          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Document Library Inventory</CardTitle>
                  <CardDescription>Libraries synced from the selected tenant — eligible targets for Syntex model deployment.</CardDescription>
                </div>
                <div className="relative w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search libraries..."
                    className="pl-9 h-9 bg-background/50 rounded-full"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="input-search-libraries"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Loading document libraries...
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <Library className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">
                    {searchTerm ? "No libraries match your search." : "No document libraries synced yet."}
                  </p>
                  {!searchTerm && (
                    <p className="text-xs text-muted-foreground/70">
                      Use the Document Libraries page to sync libraries for this tenant.
                    </p>
                  )}
                </div>
              ) : (
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-6">Library Name</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Storage</TableHead>
                      <TableHead>Content Types</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((lib) => (
                      <TableRow key={lib.id} className="group hover:bg-muted/20 transition-colors" data-testid={`row-library-${lib.id}`}>
                        <TableCell className="pl-6 font-medium">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                              <FileText className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="text-foreground block leading-tight">{lib.displayName}</span>
                              {lib.webUrl && (
                                <span className="text-[10px] text-muted-foreground truncate block max-w-[200px]">
                                  {lib.webUrl.replace(/^https?:\/\/[^/]+/, "")}
                                </span>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {lib.itemCount?.toLocaleString() ?? "—"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatBytes(lib.storageUsedBytes)}
                        </TableCell>
                        <TableCell>
                          {(lib.contentTypeCount ?? 0) > 0 ? (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {lib.contentTypeCount} types
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground/50 text-sm italic">None</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {lib.flaggedLargeItems || lib.flaggedVersionSprawl ? (
                            <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Flagged
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Healthy
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0" data-testid={`button-lib-menu-${lib.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-[180px]">
                              <DropdownMenuLabel>Library Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>View Content Types</DropdownMenuItem>
                              <DropdownMenuItem>Deploy Syntex Model</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem disabled>Configure Autofill</DropdownMenuItem>
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

        <TabsContent value="models" className="m-0 space-y-6">
          <Card className="glass-panel border-primary/20 bg-primary/5">
            <CardContent className="flex items-start gap-3 pt-4 pb-4">
              <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                SharePoint Premium (Syntex) model management is handled in the Microsoft 365 Admin Center.
                Model metadata can be imported here once the Syntex Graph API integration is configured.
                The library inventory above shows which libraries are eligible for model deployment.
              </p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-border/50 h-[400px] flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-2 border border-primary/20">
                <BrainCircuit className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold">Model Directory</h3>
              <p className="text-muted-foreground max-w-md mx-auto text-sm">
                Once the SharePoint Premium API is connected, model names, accuracy scores, and deployment status will sync here automatically.
              </p>
              <Button variant="outline" className="mt-4 rounded-full" disabled>Connect Syntex API</Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="autofill" className="m-0 space-y-6">
          <Card className="glass-panel border-primary/20 bg-primary/5">
            <CardContent className="flex items-start gap-3 pt-4 pb-4">
              <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-muted-foreground">
                Autofill rules map AI-extracted document fields to SharePoint column metadata.
                Rules are configured per library and require an active Syntex model deployment.
              </p>
            </CardContent>
          </Card>
          <Card className="glass-panel border-border/50 h-[300px] flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 mx-auto border border-blue-500/20">
                <Database className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-semibold">Metadata Autofill Mappings</h3>
              <p className="text-muted-foreground max-w-md mx-auto text-sm">
                Select a library from the inventory tab and configure how AI-extracted values map to SharePoint columns.
              </p>
              <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground/60 mt-2">
                <span>Extracted Field</span>
                <ArrowRight className="w-4 h-4" />
                <span>SharePoint Column</span>
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="m-0 space-y-6">
          <Card className="glass-panel border-border/50 h-[400px] flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-2">
                <BarChart3 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold">Processing Analytics</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Detailed visualizations of Syntex API consumption, file processing volume by library, and extraction confidence trends.
              </p>
              <Button variant="outline" className="mt-4 rounded-full" disabled>Connect Syntex API</Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
