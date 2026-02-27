import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/lib/tenant-context";
import type { DocumentLibrary } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search,
  Library,
  Globe,
  RefreshCw,
  FileText,
  HardDrive,
  ExternalLink,
  Loader2,
  ArrowUpDown,
  Eye,
  EyeOff,
} from "lucide-react";

type EnrichedLibrary = DocumentLibrary & {
  workspaceName: string;
  workspaceType: string;
  workspaceSiteUrl: string | null;
};

type LibraryStats = {
  totalLibraries: number;
  totalItems: number;
  totalStorageBytes: number;
  withSensitivityLabel: number;
  hiddenCount: number;
  workspaceCount: number;
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function DocumentLibraryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [showHidden, setShowHidden] = useState(false);
  const { selectedTenant } = useTenant();
  const { toast } = useToast();
  const tenantConnectionId = selectedTenant?.id || "";

  const { data: libraries = [], isLoading } = useQuery<EnrichedLibrary[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "libraries"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/libraries`).then(r => r.ok ? r.json() : []),
    enabled: !!tenantConnectionId,
  });

  const { data: stats } = useQuery<LibraryStats>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "libraries", "stats"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/libraries/stats`).then(r => r.ok ? r.json() : null),
    enabled: !!tenantConnectionId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/sync-libraries`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Library sync complete", description: `${data.librariesSynced} libraries synced across ${data.workspacesSynced} sites (${data.librariesSkipped} unchanged)` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantConnectionId, "libraries"] });
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(() => {
    let result = libraries.filter(l => showHidden || !l.hidden);

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(l =>
        l.displayName.toLowerCase().includes(term) ||
        l.workspaceName.toLowerCase().includes(term)
      );
    }

    result.sort((a, b) => {
      switch (sortBy) {
        case "items": return (b.itemCount || 0) - (a.itemCount || 0);
        case "storage": return (b.storageUsedBytes || 0) - (a.storageUsedBytes || 0);
        case "modified": return (b.lastModifiedAt || "").localeCompare(a.lastModifiedAt || "");
        case "workspace": return a.workspaceName.localeCompare(b.workspaceName);
        default: return a.displayName.localeCompare(b.displayName);
      }
    });

    return result;
  }, [libraries, searchTerm, sortBy, showHidden]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Document Libraries</h1>
          <p className="text-muted-foreground mt-1">Inventory of document libraries across all SharePoint sites.</p>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !tenantConnectionId}
          data-testid="button-sync-libraries"
        >
          {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sync Libraries
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Library className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Libraries</p>
              <p className="text-2xl font-bold" data-testid="text-total-libraries">{stats?.totalLibraries ?? libraries.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Items</p>
              <p className="text-2xl font-bold" data-testid="text-total-items">{(stats?.totalItems ?? 0).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Storage</p>
              <p className="text-2xl font-bold" data-testid="text-total-storage">{formatBytes(stats?.totalStorageBytes)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Across Sites</p>
              <p className="text-2xl font-bold" data-testid="text-workspace-count">{stats?.workspaceCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50 shadow-xl">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Library className="w-5 h-5 text-primary" />
              Libraries Across Sites
            </CardTitle>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setShowHidden(!showHidden)}
                data-testid="button-toggle-hidden"
              >
                {showHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showHidden ? "Hide Hidden" : "Show Hidden"}
              </Button>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[140px] h-8 text-xs" data-testid="select-sort">
                  <ArrowUpDown className="w-3 h-3 mr-1" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="items">Item Count</SelectItem>
                  <SelectItem value="storage">Storage</SelectItem>
                  <SelectItem value="modified">Last Modified</SelectItem>
                  <SelectItem value="workspace">Parent Site</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search libraries or sites..."
                  className="pl-9 h-8 text-xs bg-background/50 rounded-lg border-border/50"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-libraries"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Library className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No document libraries found</p>
              <p className="text-xs mt-1">
                {libraries.length === 0
                  ? "Run a tenant sync or library sync to discover document libraries."
                  : "No libraries match your current filters."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-6">Library</TableHead>
                  <TableHead>Parent Site</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Storage</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Last Modified</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lib) => (
                  <TableRow
                    key={lib.id}
                    className={`hover:bg-muted/10 transition-colors ${lib.hidden ? "opacity-50" : ""}`}
                    data-testid={`row-library-${lib.id}`}
                  >
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <Library className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            {lib.webUrl ? (
                              <a href={lib.webUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-sm hover:text-primary transition-colors flex items-center gap-1">
                                {lib.displayName}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="font-medium text-sm">{lib.displayName}</span>
                            )}
                            {lib.isDefaultDocLib && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                            {lib.hidden && <Badge variant="secondary" className="text-[10px]">Hidden</Badge>}
                          </div>
                          {lib.description && <p className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[250px]">{lib.description}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{lib.workspaceName}</span>
                      <span className="text-[10px] text-muted-foreground block">
                        {lib.workspaceType === "TEAM_SITE" ? "Team Site" : lib.workspaceType === "COMMUNICATION_SITE" ? "Comm Site" : lib.workspaceType === "HUB_SITE" ? "Hub Site" : lib.workspaceType}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-right">{(lib.itemCount || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-right text-muted-foreground">{formatBytes(lib.storageUsedBytes)}</TableCell>
                    <TableCell>
                      {lib.sensitivityLabelId
                        ? <Badge variant="secondary" className="text-[10px]">Labeled</Badge>
                        : <span className="text-xs text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {lib.lastModifiedAt ? new Date(lib.lastModifiedAt).toLocaleDateString() : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filtered.length > 0 && (
            <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground">
              Showing {filtered.length} of {libraries.length} libraries across {new Set(filtered.map(l => l.workspaceName)).size} sites
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
