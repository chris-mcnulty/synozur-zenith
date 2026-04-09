import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/lib/tenant-context";
import type { DocumentLibrary } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
  AlertTriangle,
  Layers,
  Network,
  BrainCircuit,
  Database,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Building2,
  Info,
} from "lucide-react";

// ─── Shared types ────────────────────────────────────────────────────────────

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

type IaContentType = {
  contentTypeId: string;
  name: string;
  group: string | null;
  scope: "HUB" | "SITE" | "LIBRARY";
  description: string | null;
  isBuiltIn: boolean;
  libraryUsageCount: number;
  siteUsageCount: number;
  source: "library" | "tenant";
};

type IaColumn = {
  columnInternalName: string;
  displayName: string;
  columnType: string;
  columnGroup: string | null;
  scope: "SITE" | "LIBRARY";
  isCustom: boolean;
  isSyntexManaged: boolean;
  libraryUsageCount: number;
  siteUsageCount: number;
};

type IaPatterns = {
  localCtDuplicatesHub: { libraryId: string; libraryName: string; contentTypeName: string; contentTypeId: string }[];
  columnPromotionCandidates: { columnInternalName: string; displayName: string; columnType: string; libraryCount: number; siteCount: number }[];
  librariesWithoutCustomCt: { libraryId: string; libraryName: string; workspaceId: string }[];
  columnNameCollisions: { displayName: string; columnTypes: string[] }[];
  thresholds: { promotionMinLibraries: number; promotionMinSites: number };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function scopeBadge(scope: "HUB" | "SITE" | "LIBRARY") {
  if (scope === "HUB") return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">Hub</Badge>;
  if (scope === "SITE") return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px]">Site</Badge>;
  return <Badge variant="outline" className="bg-muted/30 text-muted-foreground text-[10px]">Library</Badge>;
}

// ─── Library detail side panel ────────────────────────────────────────────────

function LibraryDetailPanel({ libraryId, onClose }: { libraryId: string; onClose: () => void }) {
  const { data: details, isLoading, error } = useQuery<LibraryDetails>({
    queryKey: ["/api/admin/libraries", libraryId, "details"],
    queryFn: () =>
      fetch(`/api/admin/libraries/${libraryId}/details`, { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Failed to load details");
        return r.json();
      }),
    enabled: !!libraryId,
  });

  const customColumns = useMemo(() => (details?.columns || []).filter((c) => c.isCustom && !c.hidden), [details?.columns]);
  const syntexColumns = useMemo(() => (details?.columns || []).filter((c) => c.isSyntexManaged), [details?.columns]);
  const allVisibleColumns = useMemo(() => (details?.columns || []).filter((c) => !c.hidden), [details?.columns]);
  const visibleContentTypes = useMemo(() => (details?.contentTypes || []).filter((ct) => !ct.hidden), [details?.contentTypes]);

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
        {[
          { label: "Items", value: (details.library.itemCount || 0).toLocaleString() },
          { label: "Content Types", value: visibleContentTypes.length },
          { label: "Custom Columns", value: customColumns.length },
          { label: "Syntex Models", value: syntexColumns.length },
        ].map((s) => (
          <div key={s.label} className="p-3 rounded-lg bg-muted/30 border border-border/30">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className="text-lg font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="content-types" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto">
          <TabsTrigger value="content-types" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            <FileType className="w-4 h-4" /> Content Types ({visibleContentTypes.length})
          </TabsTrigger>
          <TabsTrigger value="custom-columns" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            <Columns3 className="w-4 h-4" /> Custom Columns ({customColumns.length})
          </TabsTrigger>
          <TabsTrigger value="syntex" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
            <Sparkles className="w-4 h-4" /> Syntex / AI ({syntexColumns.length})
          </TabsTrigger>
          <TabsTrigger value="all-columns" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent">
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
              {visibleContentTypes.map((ct) => (
                <div key={ct.id} className="flex items-start gap-3 p-3 rounded-lg border border-border/30 hover:bg-muted/10 transition-colors">
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
                {customColumns.map((col) => (
                  <TableRow key={col.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {COLUMN_TYPE_ICONS[col.type] || <Hash className="w-3.5 h-3.5" />}
                        <div>
                          <p className="font-medium text-sm">{col.displayName}</p>
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
              <p className="text-xs mt-1">Syntex-managed columns appear when SharePoint Syntex (AI Builder) models are applied.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {syntexColumns.map((col) => (
                <div key={col.id} className="flex items-start gap-3 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 transition-colors">
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
                {allVisibleColumns.map((col) => (
                  <TableRow key={col.id} className={col.readOnly || col.sealed ? "opacity-50" : ""}>
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

// ─── Tab: Libraries ───────────────────────────────────────────────────────────

function LibrariesTab({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<string>("name");
  const [showHidden, setShowHidden] = useState(false);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);

  const { data: libraries = [], isLoading } = useQuery<EnrichedLibrary[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "libraries"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/libraries`).then((r) => (r.ok ? r.json() : [])),
    enabled: !!tenantConnectionId,
  });

  const { data: stats } = useQuery<LibraryStats>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "libraries", "stats"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/libraries/stats`).then((r) => (r.ok ? r.json() : null)),
    enabled: !!tenantConnectionId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/sync-libraries`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      const flagNote = data.flagged > 0 ? ` · ${data.flagged} flagged for review` : "";
      toast({ title: "Library sync complete", description: `${data.librariesSynced} libraries synced across ${data.workspacesSynced} sites (${data.librariesSkipped} unchanged${flagNote})` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantConnectionId, "libraries"] });
    },
    onError: (err: any) => toast({ title: "Sync failed", description: err.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    let result = libraries.filter((l) => showHidden || !l.hidden);
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((l) => l.displayName.toLowerCase().includes(term) || l.workspaceName.toLowerCase().includes(term));
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

  const selectedLib = selectedLibraryId ? libraries.find((l) => l.id === selectedLibraryId) : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} data-testid="button-sync-libraries">
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
              <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => setShowHidden(!showHidden)} data-testid="button-toggle-hidden">
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
                <Input placeholder="Search libraries or sites..." className="pl-9 h-8 text-xs bg-background/50 rounded-lg border-border/50" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} data-testid="input-search-libraries" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Library className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No document libraries found</p>
              <p className="text-xs mt-1">{libraries.length === 0 ? "Run a sync to discover document libraries." : "No libraries match your current filters."}</p>
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
                  <TableRow key={lib.id} className={`hover:bg-muted/10 transition-colors cursor-pointer ${lib.hidden ? "opacity-50" : ""} ${selectedLibraryId === lib.id ? "bg-primary/5" : ""}`} onClick={() => setSelectedLibraryId(lib.id)} data-testid={`row-library-${lib.id}`}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                          <Library className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-medium text-sm">{lib.displayName}</span>
                            {lib.isDefaultDocLib && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                            {lib.hidden && <Badge variant="secondary" className="text-[10px]">Hidden</Badge>}
                            {lib.flaggedLargeItems && <Badge className="text-[10px] gap-0.5 bg-amber-500/20 text-amber-700 border-amber-500/30"><AlertTriangle className="w-2.5 h-2.5" /> Large</Badge>}
                            {lib.flaggedVersionSprawl && <Badge className="text-[10px] gap-0.5 bg-red-500/20 text-red-700 border-red-500/30"><AlertTriangle className="w-2.5 h-2.5" /> Sprawl</Badge>}
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
                    <TableCell>{lib.sensitivityLabelId ? <Badge variant="secondary" className="text-[10px]">Labeled</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{lib.lastModifiedAt ? new Date(lib.lastModifiedAt).toLocaleDateString() : "—"}</TableCell>
                    <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filtered.length > 0 && (
            <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground">
              Showing {filtered.length} of {libraries.length} libraries across {new Set(filtered.map((l) => l.workspaceName)).size} sites · Click a library to view content types, columns, and Syntex models
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedLibraryId} onOpenChange={(open) => { if (!open) setSelectedLibraryId(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" side="right">
          <SheetHeader className="pb-4 border-b border-border/30">
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

// ─── Tab: Content Types ───────────────────────────────────────────────────────

function ContentTypesTab({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");

  const { data: iaCts = [], isLoading, isError, error } = useQuery<IaContentType[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "ia", "content-types"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/ia/content-types`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed: ${res.statusText}`);
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/sync-ia`, { method: "POST", credentials: "include" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "IA sync failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      const processed = data?.librariesProcessed ?? 0;
      toast({ title: "IA sync complete", description: `${processed} libraries processed.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantConnectionId, "ia", "content-types"] });
    },
    onError: (err: Error) => toast({ title: "IA sync failed", description: err.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    return iaCts.filter((ct) => {
      const matchSearch = !searchTerm || ct.name.toLowerCase().includes(searchTerm.toLowerCase()) || (ct.group ?? "").toLowerCase().includes(searchTerm.toLowerCase());
      const matchScope = scopeFilter === "all" || ct.scope === scopeFilter;
      return matchSearch && matchScope;
    });
  }, [iaCts, searchTerm, scopeFilter]);

  const hubCount = iaCts.filter((ct) => ct.scope === "HUB").length;
  const siteCount = iaCts.filter((ct) => ct.scope === "SITE").length;
  const libraryCount = iaCts.filter((ct) => ct.scope === "LIBRARY").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: "Hub Content Types", value: hubCount, sub: "Published from Content Type Hub", color: "text-emerald-500", bg: "bg-emerald-500/10" },
          { label: "Site Content Types", value: siteCount, sub: "Inherited at site level", color: "text-blue-500", bg: "bg-blue-500/10" },
          { label: "Library Content Types", value: libraryCount, sub: "Defined locally on libraries", color: "text-orange-500", bg: "bg-orange-500/10" },
        ].map((s) => (
          <Card key={s.label} className="glass-panel border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                <FileText className={`w-5 h-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                {isLoading ? <div className="h-8 w-12 bg-muted/40 animate-pulse rounded mt-1" /> : <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>}
                <p className="text-[10px] text-muted-foreground">{s.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="glass-panel border-border/50 shadow-xl">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Content Types
              {iaCts.length > 0 && <Badge variant="outline" className="ml-1 text-xs">{iaCts.length}</Badge>}
            </CardTitle>
            <div className="flex items-center gap-3">
              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scopes</SelectItem>
                  <SelectItem value="HUB">Hub</SelectItem>
                  <SelectItem value="SITE">Site</SelectItem>
                  <SelectItem value="LIBRARY">Library</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search content types..." className="pl-9 h-8 text-xs bg-background/50 rounded-lg border-border/50" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} data-testid="input-search-content-types" />
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} data-testid="button-sync-content-types">
                {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync IA
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Loading...</div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-sm text-red-400">{(error as Error)?.message}</p>
              <p className="text-xs text-muted-foreground">Run an IA sync to populate content type data.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <FileText className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{searchTerm || scopeFilter !== "all" ? "No content types match your filters." : "No content types synced yet. Run an IA sync."}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-6">Name</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-center">Libraries</TableHead>
                  <TableHead className="text-center">Sites</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((ct) => (
                  <TableRow key={`${ct.scope}-${ct.contentTypeId}`} className="hover:bg-muted/10 transition-colors" data-testid={`row-ct-${ct.contentTypeId}`}>
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <span className="font-medium text-sm">{ct.name}</span>
                          {ct.isBuiltIn && <span className="text-[10px] text-muted-foreground ml-2">(built-in)</span>}
                          {ct.description && <p className="text-[10px] text-muted-foreground">{ct.description}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{scopeBadge(ct.scope)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{ct.group || "—"}</TableCell>
                    <TableCell className="text-center text-sm">{ct.libraryUsageCount > 0 ? ct.libraryUsageCount : "—"}</TableCell>
                    <TableCell className="text-center text-sm">{ct.siteUsageCount > 0 ? ct.siteUsageCount : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: Columns ─────────────────────────────────────────────────────────────

function ColumnsTab({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [customOnly, setCustomOnly] = useState(false);

  const { data: columns = [], isLoading } = useQuery<IaColumn[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "ia", "columns"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/ia/columns`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed: ${res.statusText}`);
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const iaSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/sync-ia`, { method: "POST", credentials: "include" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "IA sync failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "IA sync complete", description: `${data.librariesProcessed ?? 0} libraries processed.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantConnectionId, "ia"] });
    },
    onError: (err: Error) => toast({ title: "IA sync failed", description: err.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    return columns.filter((c) => {
      const matchSearch = !searchTerm || c.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || c.columnInternalName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchScope = scopeFilter === "all" || c.scope === scopeFilter;
      const matchCustom = !customOnly || c.isCustom;
      return matchSearch && matchScope && matchCustom;
    });
  }, [columns, searchTerm, scopeFilter, customOnly]);

  const siteColCount = columns.filter((c) => c.scope === "SITE").length;
  const libColCount = columns.filter((c) => c.scope === "LIBRARY").length;
  const syntexCount = columns.filter((c) => c.isSyntexManaged).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0"><Columns3 className="w-5 h-5 text-blue-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Site Columns</p>
              {isLoading ? <div className="h-8 w-12 bg-muted/40 animate-pulse rounded mt-1" /> : <p className="text-2xl font-bold text-blue-500">{siteColCount}</p>}
              <p className="text-[10px] text-muted-foreground">Promoted to site scope</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0"><Library className="w-5 h-5 text-orange-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Library Columns</p>
              {isLoading ? <div className="h-8 w-12 bg-muted/40 animate-pulse rounded mt-1" /> : <p className="text-2xl font-bold text-orange-500">{libColCount}</p>}
              <p className="text-[10px] text-muted-foreground">Defined locally on libraries</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0"><Sparkles className="w-5 h-5 text-purple-500" /></div>
            <div>
              <p className="text-xs text-muted-foreground">Syntex Managed</p>
              {isLoading ? <div className="h-8 w-12 bg-muted/40 animate-pulse rounded mt-1" /> : <p className="text-2xl font-bold text-purple-500">{syntexCount}</p>}
              <p className="text-[10px] text-muted-foreground">AI-managed columns</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50 shadow-xl">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Columns3 className="w-5 h-5 text-primary" />
              Column Inventory
              {columns.length > 0 && <Badge variant="outline" className="ml-1 text-xs">{columns.length}</Badge>}
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="ghost" size="sm" className={`gap-1 text-xs ${customOnly ? "bg-primary/10" : ""}`} onClick={() => setCustomOnly(!customOnly)}>
                {customOnly ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {customOnly ? "Custom Only" : "All Columns"}
              </Button>
              <Select value={scopeFilter} onValueChange={setScopeFilter}>
                <SelectTrigger className="w-[130px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Scopes</SelectItem>
                  <SelectItem value="SITE">Site</SelectItem>
                  <SelectItem value="LIBRARY">Library</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search columns..." className="pl-9 h-8 text-xs bg-background/50 rounded-lg border-border/50" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => iaSyncMutation.mutate()} disabled={iaSyncMutation.isPending}>
                {iaSyncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync IA
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Loading columns...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Columns3 className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">{searchTerm || scopeFilter !== "all" ? "No columns match your filters." : "No column data yet. Run an IA sync."}</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-6">Column</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-center">Libraries</TableHead>
                  <TableHead className="text-center">Sites</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((col) => (
                  <TableRow key={`${col.columnInternalName}-${col.columnType}`} className="hover:bg-muted/10 transition-colors">
                    <TableCell className="pl-6">
                      <div className="flex items-center gap-2">
                        {COLUMN_TYPE_ICONS[col.columnType] || <Hash className="w-3.5 h-3.5 text-muted-foreground" />}
                        <div>
                          <p className="font-medium text-sm">{col.displayName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{col.columnInternalName}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary" className="text-[10px]">{col.columnType}</Badge></TableCell>
                    <TableCell>
                      {col.scope === "SITE"
                        ? <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px]">Site</Badge>
                        : <Badge variant="outline" className="bg-muted/30 text-muted-foreground text-[10px]">Library</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{col.columnGroup || "—"}</TableCell>
                    <TableCell className="text-center text-sm">{col.libraryUsageCount}</TableCell>
                    <TableCell className="text-center text-sm">{col.siteUsageCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: IA Patterns ─────────────────────────────────────────────────────────

function PatternsTab({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { toast } = useToast();

  const { data: patterns, isLoading } = useQuery<IaPatterns>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "ia", "patterns"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/ia/patterns`, { credentials: "include" });
      if (!res.ok) throw new Error(`Failed: ${res.statusText}`);
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const iaSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/sync-ia`, { method: "POST", credentials: "include" });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || "IA sync failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "IA sync complete", description: `${data.librariesProcessed ?? 0} libraries processed.` });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", tenantConnectionId, "ia"] });
    },
    onError: (err: Error) => toast({ title: "IA sync failed", description: err.message, variant: "destructive" }),
  });

  const totalFindings = patterns
    ? (patterns.localCtDuplicatesHub?.length ?? 0) +
      (patterns.columnPromotionCandidates?.length ?? 0) +
      (patterns.librariesWithoutCustomCt?.length ?? 0) +
      (patterns.columnNameCollisions?.length ?? 0)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          {!isLoading && patterns && (
            <p className="text-sm text-muted-foreground">
              {totalFindings === 0 ? "No anti-patterns detected." : `${totalFindings} finding${totalFindings !== 1 ? "s" : ""} across 4 checks`}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => iaSyncMutation.mutate()} disabled={iaSyncMutation.isPending}>
          {iaSyncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Sync IA
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Analyzing patterns...</div>
      ) : !patterns ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Network className="w-10 h-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No pattern data yet. Run an IA sync first.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 1. Local CT shadows hub CT */}
          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${(patterns.localCtDuplicatesHub?.length ?? 0) > 0 ? "bg-amber-500/10" : "bg-muted/30"}`}>
                  <AlertTriangle className={`w-4 h-4 ${(patterns.localCtDuplicatesHub?.length ?? 0) > 0 ? "text-amber-500" : "text-muted-foreground/40"}`} />
                </div>
                <div>
                  <CardTitle className="text-base">Local CTs Shadowing Hub CTs</CardTitle>
                  <CardDescription className="text-xs">Libraries with locally-defined content types that duplicate a Hub content type by name.</CardDescription>
                </div>
                <Badge variant="outline" className={`ml-auto shrink-0 ${(patterns.localCtDuplicatesHub?.length ?? 0) > 0 ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-muted/30 text-muted-foreground"}`}>
                  {patterns.localCtDuplicatesHub?.length ?? 0}
                </Badge>
              </div>
            </CardHeader>
            {(patterns.localCtDuplicatesHub?.length ?? 0) > 0 && (
              <CardContent className="pt-0">
                <Table>
                  <TableHeader className="bg-muted/30"><TableRow><TableHead className="pl-4">Library</TableHead><TableHead>Content Type</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {patterns.localCtDuplicatesHub.map((r, i) => (
                      <TableRow key={i} className="hover:bg-muted/10">
                        <TableCell className="pl-4 text-sm font-medium">{r.libraryName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm">{r.contentTypeName}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>

          {/* 2. Column promotion candidates */}
          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${(patterns.columnPromotionCandidates?.length ?? 0) > 0 ? "bg-blue-500/10" : "bg-muted/30"}`}>
                  <TrendingUp className={`w-4 h-4 ${(patterns.columnPromotionCandidates?.length ?? 0) > 0 ? "text-blue-500" : "text-muted-foreground/40"}`} />
                </div>
                <div>
                  <CardTitle className="text-base">Column Promotion Candidates</CardTitle>
                  <CardDescription className="text-xs">
                    Library-scoped columns used in ≥{patterns.thresholds?.promotionMinLibraries ?? 3} libraries across ≥{patterns.thresholds?.promotionMinSites ?? 2} sites — good candidates to promote to site columns.
                  </CardDescription>
                </div>
                <Badge variant="outline" className={`ml-auto shrink-0 ${(patterns.columnPromotionCandidates?.length ?? 0) > 0 ? "bg-blue-500/10 text-blue-600 border-blue-500/20" : "bg-muted/30 text-muted-foreground"}`}>
                  {patterns.columnPromotionCandidates?.length ?? 0}
                </Badge>
              </div>
            </CardHeader>
            {(patterns.columnPromotionCandidates?.length ?? 0) > 0 && (
              <CardContent className="pt-0">
                <Table>
                  <TableHeader className="bg-muted/30"><TableRow><TableHead className="pl-4">Column</TableHead><TableHead>Type</TableHead><TableHead className="text-center">Libraries</TableHead><TableHead className="text-center">Sites</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {patterns.columnPromotionCandidates.map((c, i) => (
                      <TableRow key={i} className="hover:bg-muted/10">
                        <TableCell className="pl-4">
                          <p className="font-medium text-sm">{c.displayName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{c.columnInternalName}</p>
                        </TableCell>
                        <TableCell><Badge variant="secondary" className="text-[10px]">{c.columnType}</Badge></TableCell>
                        <TableCell className="text-center text-sm">{c.libraryCount}</TableCell>
                        <TableCell className="text-center text-sm">{c.siteCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>

          {/* 3. Libraries without custom CT */}
          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${(patterns.librariesWithoutCustomCt?.length ?? 0) > 0 ? "bg-orange-500/10" : "bg-muted/30"}`}>
                  <Info className={`w-4 h-4 ${(patterns.librariesWithoutCustomCt?.length ?? 0) > 0 ? "text-orange-500" : "text-muted-foreground/40"}`} />
                </div>
                <div>
                  <CardTitle className="text-base">Libraries Without Custom Content Types</CardTitle>
                  <CardDescription className="text-xs">Libraries that only have built-in content types — no custom IA applied.</CardDescription>
                </div>
                <Badge variant="outline" className={`ml-auto shrink-0 ${(patterns.librariesWithoutCustomCt?.length ?? 0) > 0 ? "bg-orange-500/10 text-orange-600 border-orange-500/20" : "bg-muted/30 text-muted-foreground"}`}>
                  {patterns.librariesWithoutCustomCt?.length ?? 0}
                </Badge>
              </div>
            </CardHeader>
            {(patterns.librariesWithoutCustomCt?.length ?? 0) > 0 && (
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-2">
                  {patterns.librariesWithoutCustomCt.map((l, i) => (
                    <Badge key={i} variant="outline" className="bg-muted/20 text-muted-foreground">{l.libraryName}</Badge>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* 4. Column name collisions */}
          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${(patterns.columnNameCollisions?.length ?? 0) > 0 ? "bg-red-500/10" : "bg-muted/30"}`}>
                  <AlertCircle className={`w-4 h-4 ${(patterns.columnNameCollisions?.length ?? 0) > 0 ? "text-red-500" : "text-muted-foreground/40"}`} />
                </div>
                <div>
                  <CardTitle className="text-base">Column Name Collisions</CardTitle>
                  <CardDescription className="text-xs">Columns sharing the same display name but with different data types — potential data integrity risk.</CardDescription>
                </div>
                <Badge variant="outline" className={`ml-auto shrink-0 ${(patterns.columnNameCollisions?.length ?? 0) > 0 ? "bg-red-500/10 text-red-600 border-red-500/20" : "bg-muted/30 text-muted-foreground"}`}>
                  {patterns.columnNameCollisions?.length ?? 0}
                </Badge>
              </div>
            </CardHeader>
            {(patterns.columnNameCollisions?.length ?? 0) > 0 && (
              <CardContent className="pt-0">
                <Table>
                  <TableHeader className="bg-muted/30"><TableRow><TableHead className="pl-4">Display Name</TableHead><TableHead>Conflicting Types</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {patterns.columnNameCollisions.map((c, i) => (
                      <TableRow key={i} className="hover:bg-muted/10">
                        <TableCell className="pl-4 font-medium text-sm">{c.displayName}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 flex-wrap">
                            {c.columnTypes.map((t, j) => (
                              <span key={j} className="flex items-center gap-1">
                                {j > 0 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
                                <Badge variant="secondary" className="text-[10px]">{t}</Badge>
                              </span>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Syntex ──────────────────────────────────────────────────────────────

function SyntexTab() {
  return (
    <div className="space-y-6">
      <Card className="glass-panel border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 pt-4 pb-4">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            SharePoint Premium (Syntex) model management is handled in the Microsoft 365 Admin Center.
            Model metadata can be imported here once the Syntex Graph API integration is configured.
            Use the Libraries tab to see which libraries are eligible for model deployment.
          </p>
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="glass-panel border-border/50 h-[320px] flex items-center justify-center">
          <div className="text-center space-y-4 px-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto border border-primary/20">
              <BrainCircuit className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold">Model Directory</h3>
            <p className="text-muted-foreground text-sm">Once the SharePoint Premium API is connected, model names, accuracy scores, and deployment status will sync here automatically.</p>
            <Button variant="outline" className="rounded-full" disabled>Connect Syntex API</Button>
          </div>
        </Card>
        <Card className="glass-panel border-border/50 h-[320px] flex items-center justify-center">
          <div className="text-center space-y-4 px-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 mx-auto border border-blue-500/20">
              <Database className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-semibold">Autofill Mappings</h3>
            <p className="text-muted-foreground text-sm">Configure how AI-extracted values map to SharePoint columns. Select a library from the Libraries tab and configure autofill rules.</p>
            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground/60">
              <span>Extracted Field</span>
              <ArrowRight className="w-4 h-4" />
              <span>SharePoint Column</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function InformationArchitecturePage() {
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id || "";

  if (!tenantConnectionId) {
    return (
      <div className="space-y-8 animate-in fade-in duration-500 pb-12">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Information Architecture</h1>
          <p className="text-muted-foreground mt-1">Inventory libraries, content types, and columns across your SharePoint tenant.</p>
        </div>
        <Card className="glass-panel border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-4">
            <Building2 className="w-12 h-12 text-muted-foreground/40" />
            <div>
              <p className="text-lg font-medium text-muted-foreground">No tenant selected</p>
              <p className="text-sm text-muted-foreground/70 mt-1">Select a tenant to view its information architecture.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Information Architecture</h1>
        <p className="text-muted-foreground mt-1">Inventory libraries, content types, and columns — detect anti-patterns and governance gaps.</p>
      </div>

      <Tabs defaultValue="libraries" className="w-full">
        <TabsList className="bg-transparent h-12 gap-6 w-full justify-start border-b border-border/50 p-0 rounded-none mb-6">
          {[
            { value: "libraries", icon: Library, label: "Libraries" },
            { value: "content-types", icon: FileText, label: "Content Types" },
            { value: "columns", icon: Columns3, label: "Columns" },
            { value: "patterns", icon: Network, label: "IA Patterns" },
            { value: "syntex", icon: BrainCircuit, label: "Syntex" },
          ].map(({ value, icon: Icon, label }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
              data-testid={`tab-${value}`}
            >
              <Icon className="w-4 h-4 mr-2" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="libraries" className="m-0"><LibrariesTab tenantConnectionId={tenantConnectionId} /></TabsContent>
        <TabsContent value="content-types" className="m-0"><ContentTypesTab tenantConnectionId={tenantConnectionId} /></TabsContent>
        <TabsContent value="columns" className="m-0"><ColumnsTab tenantConnectionId={tenantConnectionId} /></TabsContent>
        <TabsContent value="patterns" className="m-0"><PatternsTab tenantConnectionId={tenantConnectionId} /></TabsContent>
        <TabsContent value="syntex" className="m-0"><SyntexTab /></TabsContent>
      </Tabs>
    </div>
  );
}
