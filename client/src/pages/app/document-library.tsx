import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Workspace } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Library,
  MoreVertical,
  Globe,
  Settings2,
  Columns3,
  RefreshCcw,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  Eye,
  Lock,
  Unlock,
  FileText,
  Hash,
  Calendar,
  User,
  ToggleLeft,
  Type,
  List,
  CheckCircle2,
  AlertCircle,
  Loader2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const libraryData = [
  {
    id: "LIB-001",
    name: "Documents",
    siteName: "DEAL-Project Phoenix",
    siteType: "TEAM_SITE",
    type: "Document Library",
    itemCount: 342,
    size: "285 MB",
    versioning: true,
    maxVersions: 500,
    contentTypes: ["Document", "Corporate Policy", "Project Charter"],
    customColumns: 6,
    lastModified: "2 hours ago",
    sensitivity: "CONFIDENTIAL",
    checkoutRequired: false,
    irm: false,
  },
  {
    id: "LIB-002",
    name: "Shared Documents",
    siteName: "Marketing Q3 Campaign",
    siteType: "TEAM_SITE",
    type: "Document Library",
    itemCount: 1204,
    size: "2.1 GB",
    versioning: true,
    maxVersions: 100,
    contentTypes: ["Document", "Marketing Asset"],
    customColumns: 4,
    lastModified: "Just now",
    sensitivity: "INTERNAL",
    checkoutRequired: false,
    irm: false,
  },
  {
    id: "LIB-003",
    name: "Legal Hold Archive",
    siteName: "Legal Contract Review",
    siteType: "HUB_SITE",
    type: "Document Library",
    itemCount: 89,
    size: "540 MB",
    versioning: true,
    maxVersions: 500,
    contentTypes: ["Document", "Vendor Contract", "NDA"],
    customColumns: 12,
    lastModified: "4 hours ago",
    sensitivity: "HIGHLY_CONFIDENTIAL",
    checkoutRequired: true,
    irm: true,
  },
  {
    id: "LIB-004",
    name: "Site Assets",
    siteName: "All Company Updates",
    siteType: "COMMUNICATION_SITE",
    type: "Asset Library",
    itemCount: 56,
    size: "1.8 GB",
    versioning: false,
    maxVersions: 0,
    contentTypes: ["Image", "Video"],
    customColumns: 2,
    lastModified: "1 day ago",
    sensitivity: "PUBLIC",
    checkoutRequired: false,
    irm: false,
  },
  {
    id: "LIB-005",
    name: "Deal Room Files",
    siteName: "DEAL-Titan Acquisition",
    siteType: "TEAM_SITE",
    type: "Document Library",
    itemCount: 78,
    size: "156 MB",
    versioning: true,
    maxVersions: 500,
    contentTypes: ["Document", "Due Diligence Report"],
    customColumns: 8,
    lastModified: "3 days ago",
    sensitivity: "HIGHLY_CONFIDENTIAL",
    checkoutRequired: true,
    irm: true,
  },
  {
    id: "LIB-006",
    name: "Onboarding Materials",
    siteName: "PORTCO-Acme Corp Integration",
    siteType: "TEAM_SITE",
    type: "Document Library",
    itemCount: 215,
    size: "420 MB",
    versioning: true,
    maxVersions: 100,
    contentTypes: ["Document", "Onboarding Checklist"],
    customColumns: 5,
    lastModified: "3 hours ago",
    sensitivity: "CONFIDENTIAL",
    checkoutRequired: false,
    irm: false,
  },
  {
    id: "LIB-007",
    name: "Form Templates",
    siteName: "HR Leadership",
    siteType: "COMMUNICATION_SITE",
    type: "Form Library",
    itemCount: 34,
    size: "12 MB",
    versioning: true,
    maxVersions: 50,
    contentTypes: ["Form", "HR Form Template"],
    customColumns: 3,
    lastModified: "5 hours ago",
    sensitivity: "HIGHLY_CONFIDENTIAL",
    checkoutRequired: false,
    irm: false,
  },
];

const siteColumnDefinitions = [
  { id: "COL-01", name: "Zenith_DataClass", displayName: "Data Classification", type: "Choice", group: "Zenith Governance", scope: "Site Collection", usedIn: 12, required: true, status: "Active" },
  { id: "COL-02", name: "Zenith_DeptId", displayName: "Department ID", type: "Text", group: "Zenith Governance", scope: "Site Collection", usedIn: 12, required: true, status: "Active" },
  { id: "COL-03", name: "Zenith_CostCenter", displayName: "Cost Center", type: "Text", group: "Zenith Governance", scope: "Site Collection", usedIn: 10, required: true, status: "Active" },
  { id: "COL-04", name: "Zenith_ProjectCode", displayName: "Project Code", type: "Text", group: "Zenith Governance", scope: "Site Collection", usedIn: 8, required: false, status: "Active" },
  { id: "COL-05", name: "Zenith_ReviewDate", displayName: "Next Review Date", type: "DateTime", group: "Zenith Governance", scope: "Site Collection", usedIn: 6, required: false, status: "Active" },
  { id: "COL-06", name: "Zenith_Steward", displayName: "Content Steward", type: "Person", group: "Zenith Governance", scope: "Site Collection", usedIn: 12, required: true, status: "Active" },
  { id: "COL-07", name: "DealStage", displayName: "Deal Stage", type: "Choice", group: "Deal Management", scope: "Content Type", usedIn: 3, required: false, status: "Active" },
  { id: "COL-08", name: "PortCoEntity", displayName: "Portfolio Company", type: "Lookup", group: "Deal Management", scope: "Content Type", usedIn: 2, required: false, status: "Active" },
  { id: "COL-09", name: "LegalHoldFlag", displayName: "Legal Hold", type: "Boolean", group: "Compliance", scope: "Site Collection", usedIn: 4, required: false, status: "Draft" },
];

const getColumnTypeIcon = (type: string) => {
  switch(type) {
    case 'Text': return <Type className="w-3.5 h-3.5 text-blue-500" />;
    case 'Choice': return <List className="w-3.5 h-3.5 text-purple-500" />;
    case 'DateTime': return <Calendar className="w-3.5 h-3.5 text-amber-500" />;
    case 'Person': return <User className="w-3.5 h-3.5 text-teal-500" />;
    case 'Boolean': return <ToggleLeft className="w-3.5 h-3.5 text-emerald-500" />;
    case 'Lookup': return <Hash className="w-3.5 h-3.5 text-orange-500" />;
    default: return <Type className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const getSensitivityBadge = (sensitivity: string) => {
  switch(sensitivity) {
    case 'HIGHLY_CONFIDENTIAL':
      return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Highly Confidential</Badge>;
    case 'CONFIDENTIAL':
      return <Badge variant="secondary" className="text-[10px]">Confidential</Badge>;
    case 'INTERNAL':
      return <Badge variant="outline" className="text-[10px]">Internal</Badge>;
    case 'PUBLIC':
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">Public</Badge>;
    default:
      return <Badge variant="secondary" className="text-[10px]">{sensitivity}</Badge>;
  }
};

export default function DocumentLibraryPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [columnSearch, setColumnSearch] = useState("");

  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces"],
  });

  const totalLibraries = libraryData.length;
  const totalItems = libraryData.reduce((sum, l) => sum + l.itemCount, 0);
  const irmEnabled = libraryData.filter(l => l.irm).length;
  const noVersioning = libraryData.filter(l => !l.versioning).length;

  const filteredLibraries = libraryData.filter(l =>
    l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.siteName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredColumns = siteColumnDefinitions.filter(c =>
    c.name.toLowerCase().includes(columnSearch.toLowerCase()) ||
    c.displayName.toLowerCase().includes(columnSearch.toLowerCase()) ||
    c.group.toLowerCase().includes(columnSearch.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Document Libraries</h1>
          <p className="text-muted-foreground mt-1">Govern document libraries, custom columns, and versioning policies across SharePoint sites.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <RefreshCcw className="w-4 h-4" />
            Sync Inventory
          </Button>
          <Button className="gap-2 shadow-md shadow-primary/20">
            <Columns3 className="w-4 h-4" />
            Manage Columns
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Library className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Libraries Tracked</p>
              <p className="text-2xl font-bold" data-testid="text-total-libraries">{totalLibraries}</p>
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
              <p className="text-2xl font-bold" data-testid="text-total-items">{totalItems.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Lock className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">IRM Protected</p>
              <p className="text-2xl font-bold" data-testid="text-irm-count">{irmEnabled}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`glass-panel ${noVersioning > 0 ? 'border-amber-500/30' : 'border-border/50'}`}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${noVersioning > 0 ? 'bg-amber-500/10' : 'bg-muted/50'}`}>
              <AlertCircle className={`w-5 h-5 ${noVersioning > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">No Versioning</p>
              <p className={`text-2xl font-bold ${noVersioning > 0 ? 'text-amber-500' : ''}`} data-testid="text-no-versioning">{noVersioning}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="libraries" className="w-full">
        <TabsList className="bg-muted/50 border border-border/50">
          <TabsTrigger value="libraries" className="gap-2" data-testid="tab-libraries"><Library className="w-4 h-4"/> Library Inventory</TabsTrigger>
          <TabsTrigger value="columns" className="gap-2" data-testid="tab-columns"><Columns3 className="w-4 h-4"/> Site Columns</TabsTrigger>
        </TabsList>

        <TabsContent value="libraries" className="mt-4">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Library className="w-5 h-5 text-primary" />
                  Libraries Across Sites
                </CardTitle>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by library or site name..."
                    className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    data-testid="input-search-libraries"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="pl-6">Library</TableHead>
                    <TableHead>Parent Site</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Versioning</TableHead>
                    <TableHead>Content Types</TableHead>
                    <TableHead>Columns</TableHead>
                    <TableHead>Sensitivity</TableHead>
                    <TableHead>Controls</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLibraries.map((lib) => (
                    <TableRow key={lib.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-library-${lib.id}`}>
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                            <Library className="w-4 h-4 text-primary" />
                          </div>
                          <div>
                            <span className="font-semibold text-sm block">{lib.name}</span>
                            <span className="text-[10px] text-muted-foreground">{lib.type}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{lib.siteName}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {lib.siteType === 'TEAM_SITE' ? 'Team Site' : lib.siteType === 'COMMUNICATION_SITE' ? 'Comm Site' : 'Hub Site'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{lib.itemCount.toLocaleString()}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{lib.size}</TableCell>
                      <TableCell>
                        {lib.versioning ? (
                          <div className="flex items-center gap-1 text-xs">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-emerald-600">{lib.maxVersions}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-amber-500">Off</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[160px]">
                          {lib.contentTypes.slice(0, 2).map((ct, i) => (
                            <Badge key={i} variant="outline" className="text-[10px] font-normal">{ct}</Badge>
                          ))}
                          {lib.contentTypes.length > 2 && (
                            <Badge variant="secondary" className="text-[10px]">+{lib.contentTypes.length - 2}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-center">{lib.customColumns}</TableCell>
                      <TableCell>{getSensitivityBadge(lib.sensitivity)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {lib.checkoutRequired && (
                            <span title="Checkout required" className="text-blue-500"><Lock className="w-3.5 h-3.5" /></span>
                          )}
                          {lib.irm && (
                            <span title="IRM protected" className="text-emerald-500"><ShieldCheck className="w-3.5 h-3.5" /></span>
                          )}
                          {!lib.checkoutRequired && !lib.irm && (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[180px]">
                            <DropdownMenuLabel>Library Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2"><Eye className="w-4 h-4" /> View Columns</DropdownMenuItem>
                            <DropdownMenuItem className="gap-2"><Settings2 className="w-4 h-4" /> Versioning Settings</DropdownMenuItem>
                            <DropdownMenuItem className="gap-2"><FileText className="w-4 h-4" /> Content Types</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="gap-2"><Globe className="w-4 h-4" /> Open in SharePoint</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground">
                Showing {filteredLibraries.length} of {libraryData.length} libraries across {new Set(libraryData.map(l => l.siteName)).size} sites
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="columns" className="mt-4">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Columns3 className="w-5 h-5 text-primary" />
                    Site Column Definitions
                  </CardTitle>
                  <CardDescription className="mt-1">Custom columns defined across site collections and content types.</CardDescription>
                </div>
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search columns..."
                    className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                    value={columnSearch}
                    onChange={(e) => setColumnSearch(e.target.value)}
                    data-testid="input-search-columns"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="pl-6">Column Name</TableHead>
                    <TableHead>Internal Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead>Used In</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredColumns.map((col) => (
                    <TableRow key={col.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-column-${col.id}`}>
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-2">
                          {getColumnTypeIcon(col.type)}
                          <span className="font-semibold text-sm">{col.displayName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-primary">{col.name}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-normal">{col.type}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{col.group}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{col.scope}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="flex items-center gap-1">
                          <Globe className="w-3 h-3 text-muted-foreground" />
                          {col.usedIn} sites
                        </span>
                      </TableCell>
                      <TableCell>
                        {col.required ? (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        ) : (
                          <span className="text-muted-foreground text-xs">Optional</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          col.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]' :
                          'bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px]'
                        }>{col.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>Edit Column</DropdownMenuItem>
                            <DropdownMenuItem>View Usage</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">Deprecate</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground">
                Showing {filteredColumns.length} of {siteColumnDefinitions.length} column definitions
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
