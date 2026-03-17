import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/lib/tenant-context";
import type { DocumentLibrary } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
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
  Columns3,
  FileType,
  Sparkles,
  ChevronRight,
  X,
  Tag,
  Hash,
  Calendar,
  ToggleLeft,
  List,
  Type,
  Link2,
  User,
  Calculator,
  Image,
  MapPin,
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

type LibraryContentType = {
  id: string;
  name: string;
  description: string | null;
  hidden: boolean;
  group: string | null;
};

type LibraryColumn = {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  type: string;
  hidden: boolean;
  readOnly: boolean;
  sealed: boolean;
  indexed: boolean;
  required: boolean;
  columnGroup: string | null;
  isSyntexManaged: boolean;
  isCustom: boolean;
};

type LibraryDetails = {
  library: DocumentLibrary;
  workspaceName: string;
  workspaceType: string;
  siteUrl: string | null;
  contentTypes: LibraryContentType[];
  columns: LibraryColumn[];
  error?: string;
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes > 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes > 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

const COLUMN_TYPE_ICONS: Record<string, React.ReactNode> = {
  text: <Type className="w-3.5 h-3.5" />,
  number: <Hash className="w-3.5 h-3.5" />,
  dateTime: <Calendar className="w-3.5 h-3.5" />,
  choice: <List className="w-3.5 h-3.5" />,
  boolean: <ToggleLeft className="w-3.5 h-3.5" />,
  lookup: <Link2 className="w-3.5 h-3.5" />,
  personOrGroup: <User className="w-3.5 h-3.5" />,
  calculated: <Calculator className="w-3.5 h-3.5" />,
  hyperlinkOrPicture: <Link2 className="w-3.5 h-3.5" />,
  thumbnail: <Image className="w-3.5 h-3.5" />,
  term: <Tag className="w-3.5 h-3.5" />,
  geolocation: <MapPin className="w-3.5 h-3.5" />,
  currency: <Hash className="w-3.5 h-3.5" />,
};

function LibraryDetailPanel({ libraryId, onClose }: { libraryId: string; onClose: () => void }) {
  const { data: details, isLoading, error } = useQuery<LibraryDetails>({
    queryKey: ["/api/admin/libraries", libraryId, "details"],
    queryFn: () => fetch(`/api/admin/libraries/${libraryId}/details`, { credentials: "include" }).then(r => {
      if (!r.ok) throw new Error("Failed to load details");
      return r.json();
    }),
    enabled: !!libraryId,
  });

  const customColumns = useMemo(() =>
    (details?.columns || []).filter(c => c.isCustom && !c.hidden),
    [details?.columns]
  );

  const syntexColumns = useMemo(() =>
    (details?.columns || []).filter(c => c.isSyntexManaged),
    [details?.columns]
  );

  const allVisibleColumns = useMemo(() =>
    (details?.columns || []).filter(c => !c.hidden),
    [details?.columns]
  );

  const visibleContentTypes = useMemo(() =>
    (details?.contentTypes || []).filter(ct => !ct.hidden),
    [details?.contentTypes]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading library details from Graph...</span>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Library className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Failed to load library details</p>
        <p className="text-xs mt-1">{(error as Error)?.message || "Unknown error"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Items</p>
          <p className="text-lg font-bold" data-testid="text-detail-items">{(details.library.itemCount || 0).toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Content Types</p>
          <p className="text-lg font-bold" data-testid="text-detail-content-types">{visibleContentTypes.length}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Custom Columns</p>
          <p className="text-lg font-bold" data-testid="text-detail-custom-columns">{customColumns.length}</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Syntex Models</p>
          <p className="text-lg font-bold" data-testid="text-detail-syntex">{syntexColumns.length}</p>
        </div>
      </div>

      <Tabs defaultValue="content-types" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
          <TabsTrigger value="content-types" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-content-types">
            <FileType className="w-4 h-4" /> Content Types ({visibleContentTypes.length})
          </TabsTrigger>
          <TabsTrigger value="custom-columns" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-custom-columns">
            <Columns3 className="w-4 h-4" /> Custom Columns ({customColumns.length})
          </TabsTrigger>
          <TabsTrigger value="syntex" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-syntex">
            <Sparkles className="w-4 h-4" /> Syntex / AI ({syntexColumns.length})
          </TabsTrigger>
          <TabsTrigger value="all-columns" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent" data-testid="tab-all-columns">
            <List className="w-4 h-4" /> All Columns ({allVisibleColumns.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content-types" className="mt-4">
          {visibleContentTypes.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileType className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No content types found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleContentTypes.map(ct => (
                <div key={ct.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/10 transition-colors" data-testid={`row-ct-${ct.id}`}>
                  <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <FileType className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{ct.name}</p>
                    {ct.description && <p className="text-xs text-muted-foreground mt-0.5">{ct.description}</p>}
                    {ct.group && <Badge variant="outline" className="text-[10px] mt-1">{ct.group}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="custom-columns" className="mt-4">
          {customColumns.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Columns3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No custom columns found</p>
              <p className="text-xs mt-1">Custom columns are user-created columns, excluding system and built-in columns.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Column</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-center">Indexed</TableHead>
                  <TableHead className="text-center">Required</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customColumns.map(col => (
                  <TableRow key={col.id} data-testid={`row-col-${col.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {COLUMN_TYPE_ICONS[col.type] || <Hash className="w-3.5 h-3.5" />}
                        <div>
                          <p className="font-medium text-sm">{col.displayName}</p>
                          {col.description && <p className="text-[10px] text-muted-foreground">{col.description}</p>}
                          <p className="text-[10px] text-muted-foreground font-mono">{col.name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{col.type}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{col.columnGroup || "—"}</TableCell>
                    <TableCell className="text-center">{col.indexed ? <Badge variant="outline" className="text-[10px]">Yes</Badge> : "—"}</TableCell>
                    <TableCell className="text-center">{col.required ? <Badge className="text-[10px] bg-amber-500/20 text-amber-600 border-amber-500/30">Required</Badge> : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="syntex" className="mt-4">
          {syntexColumns.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No Syntex / AI models detected</p>
              <p className="text-xs mt-1">Syntex-managed columns appear when SharePoint Syntex (AI Builder) models are applied to this library.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {syntexColumns.map(col => (
                <div key={col.id} className="flex items-start gap-3 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-colors" data-testid={`row-syntex-${col.id}`}>
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{col.displayName}</p>
                    {col.description && <p className="text-xs text-muted-foreground mt-0.5">{col.description}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px]">{col.type}</Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">{col.name}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all-columns" className="mt-4">
          {allVisibleColumns.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <List className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No columns found</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead>Column</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-center">Custom</TableHead>
                  <TableHead className="text-center">Syntex</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allVisibleColumns.map(col => (
                  <TableRow key={col.id} className={col.readOnly || col.sealed ? "opacity-50" : ""} data-testid={`row-allcol-${col.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {COLUMN_TYPE_ICONS[col.type] || <Hash className="w-3.5 h-3.5 text-muted-foreground" />}
                        <div>
                          <p className="text-sm">{col.displayName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{col.name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{col.type}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{col.columnGroup || "—"}</TableCell>
                    <TableCell className="text-center">{col.isCustom ? <Badge variant="outline" className="text-[10px] border-green-500/30 text-green-600">Custom</Badge> : "—"}</TableCell>
                    <TableCell className="text-center">{col.isSyntexManaged ? <Badge className="text-[10px] bg-purple-500/20 text-purple-600 border-purple-500/30">Syntex</Badge> : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function DocumentLibraryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [showHidden, setShowHidden] = useState(false);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
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

  const selectedLib = selectedLibraryId ? libraries.find(l => l.id === selectedLibraryId) : null;

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
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((lib) => (
                  <TableRow
                    key={lib.id}
                    className={`hover:bg-muted/10 transition-colors cursor-pointer ${lib.hidden ? "opacity-50" : ""} ${selectedLibraryId === lib.id ? "bg-primary/5" : ""}`}
                    onClick={() => setSelectedLibraryId(lib.id)}
                    data-testid={`row-library-${lib.id}`}
                  >
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <Library className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm">{lib.displayName}</span>
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
                    <TableCell>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filtered.length > 0 && (
            <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground">
              Showing {filtered.length} of {libraries.length} libraries across {new Set(filtered.map(l => l.workspaceName)).size} sites
              {" · "}Click a library to view content types, columns, and Syntex models
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedLibraryId} onOpenChange={(open) => { if (!open) setSelectedLibraryId(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="right">
          <SheetHeader className="pb-4 border-b border-border/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Library className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-lg" data-testid="text-detail-title">{selectedLib?.displayName || "Library Details"}</SheetTitle>
                  <SheetDescription className="text-xs">
                    {selectedLib?.workspaceName || ""}
                    {selectedLib?.webUrl && (
                      <a href={selectedLib.webUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                        Open in SharePoint <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </SheetDescription>
                </div>
              </div>
            </div>
          </SheetHeader>
          {selectedLibraryId && (
            <div className="mt-6">
              <LibraryDetailPanel libraryId={selectedLibraryId} onClose={() => setSelectedLibraryId(null)} />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
