import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Fingerprint, 
  ShieldCheck, 
  Database, 
  Archive, 
  RefreshCcw,
  Lock,
  Tag,
  Globe,
  Info
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/lib/tenant-context";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SensitivityLabel = {
  id: string;
  tenantId: string;
  labelId: string;
  name: string;
  description: string | null;
  color: string | null;
  tooltip: string | null;
  sensitivity: number | null;
  isActive: boolean;
  contentFormats: string[] | null;
  hasProtection: boolean;
  parentLabelId: string | null;
  appliesToGroupsSites: boolean;
  syncedAt: string | null;
};

export default function PurviewConfigPage() {
  const { toast } = useToast();
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id;

  const { data: labels = [], isLoading, refetch, isRefetching } = useQuery<SensitivityLabel[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "sensitivity-labels"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/sensitivity-labels`).then(r => r.json()),
    enabled: !!tenantConnectionId,
  });

  const siteLabels = labels.filter(l => l.appliesToGroupsSites);
  const fileLabels = labels.filter(l => !l.appliesToGroupsSites);
  const lastSynced = labels.length > 0 ? labels.reduce((latest, l) => {
    if (!l.syncedAt) return latest;
    return !latest || new Date(l.syncedAt) > new Date(latest) ? l.syncedAt : latest;
  }, null as string | null) : null;

  const handleRefresh = async () => {
    await refetch();
    toast({ title: "Labels refreshed", description: "Showing latest synced label inventory." });
  };

  const renderLabelRow = (label: SensitivityLabel) => (
    <TableRow key={label.labelId} data-testid={`row-label-${label.labelId}`}>
      <TableCell>
        <div className="flex items-center gap-2">
          {label.color && (
            <span className="w-3 h-3 rounded-full border border-border/50 shrink-0" style={{ backgroundColor: label.color }} />
          )}
          <div>
            <div className="font-medium text-sm">{label.name}</div>
            {label.description && (
              <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">{label.description}</div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1.5">
          {label.appliesToGroupsSites && (
            <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
              <Globe className="w-2.5 h-2.5 mr-1" />Sites
            </Badge>
          )}
          {label.contentFormats && label.contentFormats.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[10px] bg-muted/50">
                  <Tag className="w-2.5 h-2.5 mr-1" />Files
                </Badge>
              </TooltipTrigger>
              <TooltipContent>Formats: {label.contentFormats.join(", ")}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell>
        {label.hasProtection ? (
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
            <Lock className="w-2.5 h-2.5 mr-1" />Protected
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">None</span>
        )}
      </TableCell>
      <TableCell>
        {label.sensitivity != null ? (
          <span className="text-xs font-mono">{label.sensitivity}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        {label.isActive ? (
          <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Active</Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-purview-title">Purview Integration</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            View and manage Microsoft Purview sensitivity labels synced from your tenant. Labels are imported during tenant sync.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          {lastSynced && (
            <span className="text-xs text-muted-foreground">
              Last synced: {new Date(lastSynced).toLocaleString()}
            </span>
          )}
          <Button onClick={handleRefresh} disabled={isRefetching} variant="outline" className="gap-2" data-testid="button-refresh-labels">
            <RefreshCcw className={`w-4 h-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {!tenantConnectionId && (
        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="p-6 text-center">
            <Info className="w-8 h-8 text-amber-500 mx-auto mb-3" />
            <p className="text-sm text-amber-600">Select a tenant connection to view its Purview label inventory.</p>
          </CardContent>
        </Card>
      )}

      {tenantConnectionId && (
        <Tabs defaultValue="siteLabels" className="w-full space-y-6">
          <TabsList className="bg-transparent h-12 gap-6 w-full justify-start border-b border-border/50 p-0 rounded-none mb-2">
            <TabsTrigger 
              value="siteLabels" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
            >
              <Globe className="w-4 h-4 mr-2" /> Site Labels
              <Badge variant="secondary" className="ml-2 text-[10px]">{siteLabels.length}</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="fileLabels" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
            >
              <Tag className="w-4 h-4 mr-2" /> File Labels
              <Badge variant="secondary" className="ml-2 text-[10px]">{fileLabels.length}</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="allLabels" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
            >
              <ShieldCheck className="w-4 h-4 mr-2" /> All Labels
              <Badge variant="secondary" className="ml-2 text-[10px]">{labels.length}</Badge>
            </TabsTrigger>
            <TabsTrigger 
              value="orchestration" 
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
            >
              <Fingerprint className="w-4 h-4 mr-2" /> Orchestration
            </TabsTrigger>
          </TabsList>

          <TabsContent value="siteLabels" className="space-y-6 m-0 animate-in fade-in slide-in-from-bottom-4">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle>Site & Group Sensitivity Labels</CardTitle>
                <CardDescription>
                  Labels with "Groups & sites" scope that can be applied to SharePoint sites, Microsoft Teams, and M365 Groups.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading labels...</div>
                ) : siteLabels.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">No site-scoped labels found. Run a tenant sync to import labels from Purview.</p>
                    <p className="text-xs text-muted-foreground">Ensure "Groups & sites" scope is enabled on your labels in the Purview portal.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Protection</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {siteLabels.map(renderLabelRow)}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fileLabels" className="space-y-6 m-0 animate-in fade-in slide-in-from-bottom-4">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle>File & Content Sensitivity Labels</CardTitle>
                <CardDescription>
                  Labels scoped to files, emails, and other content items. These are applied at the document level, not the container level.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading labels...</div>
                ) : fileLabels.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <Tag className="w-10 h-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">No file-scoped labels found. Run a tenant sync to import labels from Purview.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Protection</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fileLabels.map(renderLabelRow)}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="allLabels" className="space-y-6 m-0 animate-in fade-in slide-in-from-bottom-4">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle>Complete Label Inventory</CardTitle>
                <CardDescription>
                  All sensitivity labels synced from Microsoft Purview for this tenant.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="p-8 text-center text-muted-foreground text-sm">Loading labels...</div>
                ) : labels.length === 0 ? (
                  <div className="p-8 text-center space-y-3">
                    <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">No labels synced yet. Run a tenant sync to import your Purview label inventory.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Protection</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {labels.map(renderLabelRow)}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orchestration" className="space-y-6 m-0 animate-in fade-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="glass-panel border-border/50 min-h-[200px] flex items-center justify-center">
                <div className="text-center space-y-3 p-6">
                  <Fingerprint className="w-10 h-10 text-muted-foreground mx-auto" />
                  <h3 className="font-semibold text-base">Adaptive DLP Scopes</h3>
                  <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
                    Map Zenith metadata conditions to Purview Adaptive Scopes.
                  </p>
                  <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                </div>
              </Card>

              <Card className="glass-panel border-border/50 min-h-[200px] flex items-center justify-center">
                <div className="text-center space-y-3 p-6">
                  <Database className="w-10 h-10 text-muted-foreground mx-auto" />
                  <h3 className="font-semibold text-base">Retention Mapping</h3>
                  <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
                    Map workspace lifecycle rules to Purview retention policies.
                  </p>
                  <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                </div>
              </Card>

              <Card className="glass-panel border-border/50 min-h-[200px] flex items-center justify-center">
                <div className="text-center space-y-3 p-6">
                  <Archive className="w-10 h-10 text-muted-foreground mx-auto" />
                  <h3 className="font-semibold text-base">Records Management</h3>
                  <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
                    Define file plans and disposition rules based on content types.
                  </p>
                  <Badge variant="secondary" className="text-[10px]">Coming Soon</Badge>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      )}

      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">
          <Info className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">How Label Sync Works</h4>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            Sensitivity labels are imported from Microsoft Purview during each tenant sync. Labels must be published in a label policy to be discoverable.
            Site-scoped labels (with "Groups & sites" scope) can be assigned to SharePoint sites. Writing labels back to M365 requires a Standard plan or higher.
          </p>
        </div>
      </div>
    </div>
  );
}
