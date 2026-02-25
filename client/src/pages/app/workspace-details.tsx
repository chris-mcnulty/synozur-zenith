import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Workspace } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  ArrowLeft, 
  Users, 
  ShieldAlert, 
  ShieldCheck, 
  Settings2,
  FileJson,
  Save,
  Wand2,
  CheckCircle2,
  Activity,
  Loader2,
  Tags,
  Database,
  Globe,
  HardDrive,
  BarChart3,
  Clock,
  ExternalLink,
  Lock,
  Unlock,
  Pencil,
  Copy,
  AlertTriangle,
  Upload,
  Network,
  Unlink,
  Trash2,
  RefreshCw,
  Archive
} from "lucide-react";

type DataDictEntry = { id: string; tenantId: string; category: string; value: string; createdAt: string };
type SensitivityLabelEntry = { id: string; tenantId: string; labelId: string; name: string; description: string | null; color: string | null; tooltip: string | null; sensitivity: number | null; isActive: boolean; contentFormats: string[] | null; hasProtection: boolean; parentLabelId: string | null; appliesToGroupsSites: boolean; syncedAt: string | null };
type RetentionLabelEntry = { id: string; tenantId: string; labelId: string; name: string; description: string | null; isInUse: boolean; retentionDuration: string | null; actionAfterRetention: string | null; syncedAt: string | null };

export default function WorkspaceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: workspace, isLoading, error } = useQuery<Workspace>({
    queryKey: [`/api/workspaces/${id}`],
    enabled: !!id,
  });

  const { data: policyResults } = useQuery<{
    policyId: string | null;
    policyName: string;
    policyType?: string;
    results: { ruleType?: string; ruleName: string; ruleResult: string; ruleDescription: string }[];
    overallPass: boolean;
    passCount?: number;
    failCount?: number;
  }>({
    queryKey: [`/api/workspaces/${id}/policy-results`],
    enabled: !!id,
  });

  const tenantConnectionId = workspace?.tenantConnectionId || "";

  const { data: dictEntries = [] } = useQuery<DataDictEntry[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "data-dictionaries"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/data-dictionaries`).then(r => r.json()),
    enabled: !!tenantConnectionId,
  });

  const { data: sensitivityLabelsData = [] } = useQuery<SensitivityLabelEntry[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "sensitivity-labels"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/sensitivity-labels`).then(r => r.json()),
    enabled: !!tenantConnectionId,
  });

  const { data: retentionLabelsData = [] } = useQuery<RetentionLabelEntry[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "retention-labels"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/retention-labels`).then(r => r.json()),
    enabled: !!tenantConnectionId,
  });

  const { data: allWorkspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces", tenantConnectionId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      return fetch(`/api/workspaces?${params.toString()}`).then(r => r.json());
    },
    enabled: !!tenantConnectionId,
  });

  const hubSiteWorkspace = workspace?.hubSiteId && !workspace?.isHubSite
    ? allWorkspaces.find(w => w.isHubSite && w.hubSiteId === workspace.hubSiteId)
    : null;

  const deptOptions = dictEntries.filter(e => e.category === "department");
  const costCenterOptions = dictEntries.filter(e => e.category === "cost_center");
  const projectCodeOptions = dictEntries.filter(e => e.category === "project_code");
  const requiredMetadataKeys = dictEntries
    .filter(e => e.category === "required_metadata_field")
    .map(e => e.value);

  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    department: "",
    costCenter: "",
    projectCode: "",
    sensitivity: "",
    sensitivityLabelId: "",
    externalSharing: false,
    primarySteward: "",
    secondarySteward: "",
    teamsConnected: false,
    type: "",
    projectType: "",
  });

  useEffect(() => {
    if (workspace) {
      setForm({
        displayName: workspace.displayName || "",
        department: workspace.department || "",
        costCenter: workspace.costCenter || "",
        projectCode: workspace.projectCode || "",
        sensitivity: workspace.sensitivity || "",
        sensitivityLabelId: workspace.sensitivityLabelId || "",

        externalSharing: workspace.externalSharing,
        primarySteward: workspace.primarySteward || "",
        secondarySteward: workspace.secondarySteward || "",
        teamsConnected: workspace.teamsConnected,
        type: workspace.type || "",
        projectType: workspace.projectType || "",
      });
    }
  }, [workspace]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<typeof form>) => {
      const res = await apiRequest("PATCH", `/api/workspaces/${id}`, data);
      return res.json();
    },
    onSuccess: (responseData: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}/policy-results`] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setEditMode(false);
      if (responseData?.labelSyncResult) {
        if (responseData.labelSyncResult.pushed) {
          toast({ title: "Changes saved & label applied", description: "Workspace updated and sensitivity label pushed to M365." });
        } else {
          toast({ title: "Changes saved", description: `Workspace updated but label sync note: ${responseData.labelSyncResult.error || "Label could not be applied to SharePoint."}` });
        }
      } else {
        toast({ title: "Changes saved", description: "Workspace properties updated successfully." });
      }
    },
    onError: (err: any) => {
      let errMsg = "Could not update workspace properties.";
      if (err?.message) {
        const match = err.message.match(/^\d+:\s*([\s\S]+)$/);
        if (match) {
          try {
            const body = JSON.parse(match[1]);
            errMsg = body?.message || errMsg;
          } catch {
            errMsg = match[1];
          }
        } else {
          errMsg = err.message;
        }
      }
      toast({ title: "Save failed", description: errMsg, variant: "destructive" });
    },
  });

  const writebackMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/workspaces/writeback/metadata", { workspaceIds: [id] }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}`] });
      if (data.succeeded > 0) {
        const fields = data.results?.[0]?.fieldsSynced?.join(", ") || "metadata";
        toast({ title: "Synced to SharePoint", description: `Successfully wrote ${fields} to the site property bag.` });
      } else {
        const errMsg = data.results?.[0]?.error || "Unknown error";
        toast({ title: "Sync Failed", description: errMsg, variant: "destructive" });
      }
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to sync";
      if (msg.includes("FEATURE_GATED")) {
        toast({ title: "Plan Required", description: "Writing metadata to SharePoint requires a Standard plan or higher.", variant: "destructive" });
      } else {
        toast({ title: "Sync Failed", description: msg, variant: "destructive" });
      }
    },
  });

  const siteSyncMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/workspaces/${id}/sync`).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}`] });
      if (data.siteDeleted) {
        toast({ title: "Site Deleted", description: data.message || "This site is no longer in Microsoft 365.", variant: "destructive" });
      } else if (data.success) {
        toast({ title: "Site Refreshed", description: "Latest data pulled from Microsoft 365." });
      } else {
        toast({ title: "Refresh Issue", description: data.error || "Completed with issues.", variant: "destructive" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Refresh Failed", description: err?.message || "Could not refresh site data.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  const handleCancel = () => {
    if (workspace) {
      setForm({
        displayName: workspace.displayName || "",
        department: workspace.department || "",
        costCenter: workspace.costCenter || "",
        projectCode: workspace.projectCode || "",
        sensitivity: workspace.sensitivity || "",
        sensitivityLabelId: workspace.sensitivityLabelId || "",

        externalSharing: workspace.externalSharing,
        primarySteward: workspace.primarySteward || "",
        secondarySteward: workspace.secondarySteward || "",
        teamsConnected: workspace.teamsConnected,
        type: workspace.type || "",
        projectType: workspace.projectType || "",
      });
    }
    setEditMode(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <ShieldAlert className="w-10 h-10 text-destructive" />
        <p className="text-destructive font-medium">{error?.message || "Workspace not found"}</p>
        <Link href="/app/governance">
          <Button variant="outline" className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Back to Site Governance
          </Button>
        </Link>
      </div>
    );
  }

  const getSiteTypeLabel = (type: string) => {
    switch(type) {
      case 'TEAM_SITE': return 'Team Site';
      case 'COMMUNICATION_SITE': return 'Communication Site';
      case 'HUB_SITE': return 'Hub Site';
      default: return 'SharePoint Site';
    }
  };

  const getSiteTypeColor = (type: string) => {
    switch(type) {
      case 'TEAM_SITE': return 'text-teal-500';
      case 'COMMUNICATION_SITE': return 'text-blue-500';
      case 'HUB_SITE': return 'text-purple-500';
      default: return 'text-teal-500';
    }
  };

  const sensitivityLabel = workspace.sensitivity.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, c => c.toLowerCase());
  const sensitivityVariant = workspace.sensitivity === "HIGHLY_CONFIDENTIAL" ? "destructive" : "secondary";

  const resolvedPurviewLabel = workspace.sensitivityLabelId
    ? sensitivityLabelsData.find(l => l.labelId === workspace.sensitivityLabelId)
    : null;

  const resolvedRetentionLabel = workspace.retentionLabelId
    ? retentionLabelsData.find(l => l.labelId === workspace.retentionLabelId)
    : null;

  const computedRules: { ruleName: string; ruleResult: string; ruleDescription: string }[] = policyResults?.results && policyResults.results.length > 0
    ? policyResults.results.map(r => ({ ruleName: r.ruleName, ruleResult: r.ruleResult, ruleDescription: r.ruleDescription }))
    : [
        { ruleName: "Sensitivity Label", ruleResult: workspace.sensitivityLabelId ? "PASS" : "FAIL", ruleDescription: "Workspace must have a Purview sensitivity label applied." },
        { ruleName: "Department Assigned", ruleResult: workspace.department ? "PASS" : "FAIL", ruleDescription: "Workspace must have a department assigned." },
        { ruleName: "Dual Ownership", ruleResult: workspace.owners >= 2 ? "PASS" : "FAIL", ruleDescription: "Workspace must have at least two active owners." },
        { ruleName: "Metadata Complete", ruleResult: workspace.metadataStatus === "COMPLETE" ? "PASS" : "FAIL", ruleDescription: "All required governance metadata fields must be populated." },
        { ruleName: "Sharing Policy", ruleResult: (!workspace.externalSharing || workspace.sensitivity !== "HIGHLY_CONFIDENTIAL") ? "PASS" : "FAIL", ruleDescription: "External sharing policy must align with sensitivity classification." },
      ];

  const policyName = policyResults?.policyName || "Copilot Readiness";

  const rawJson = JSON.stringify(workspace, null, 2);
  const passCount = computedRules.filter(r => r.ruleResult === "PASS").length;
  const failCount = computedRules.filter(r => r.ruleResult === "FAIL").length;

  const primaryInitials = workspace.primarySteward
    ? workspace.primarySteward.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  const metadataFields = [
    { key: "department", label: "Department", required: requiredMetadataKeys.includes("department") },
    { key: "costCenter", label: "Cost Center", required: requiredMetadataKeys.includes("costCenter") },
    { key: "projectCode", label: "Project Code", required: requiredMetadataKeys.includes("projectCode") },
  ];

  const missingRequired = metadataFields.filter(f => f.required && !form[f.key as keyof typeof form]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/app/governance">
            <Button variant="ghost" size="icon" className="rounded-full" data-testid="button-back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-workspace-name">
                {workspace.displayName}
              </h1>
              <Badge variant={sensitivityVariant} className={`${sensitivityVariant === "destructive" ? "bg-destructive/10 text-destructive border-destructive/20" : ""}`} data-testid="badge-sensitivity">{sensitivityLabel}</Badge>
              {workspace.teamsConnected && (
                <Badge variant="outline" className="text-[10px] font-semibold text-blue-500 bg-blue-500/10 border-blue-500/20">Teams Connected</Badge>
              )}
              {workspace.isDeleted && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <Trash2 className="w-3 h-3" /> Deleted
                </Badge>
              )}
              {workspace.isArchived && (
                <Badge variant="outline" className="text-xs text-indigo-600 bg-indigo-500/10 border-indigo-500/20 gap-1" data-testid="badge-archived">
                  <Archive className="w-3 h-3" /> Archived
                </Badge>
              )}
              {!workspace.isDeleted && !workspace.isArchived && workspace.lockState && workspace.lockState !== "Unlock" && (
                <Badge variant="outline" className="text-xs text-amber-600 bg-amber-500/10 border-amber-500/20 gap-1">
                  <Lock className="w-3 h-3" /> {workspace.lockState === "NoAccess" ? "Locked" : workspace.lockState === "ReadOnly" ? "Read-Only" : workspace.lockState}
                </Badge>
              )}
              {workspace.isHubSite && (
                <Badge variant="outline" className="text-[10px] font-semibold text-purple-500 bg-purple-500/10 border-purple-500/20 gap-1">
                  <Network className="w-3 h-3" /> Hub Site
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              <Globe className={`w-3.5 h-3.5 ${getSiteTypeColor(workspace.type)}`} />
              <span className="text-muted-foreground text-xs">{getSiteTypeLabel(workspace.type)}</span>
              <span className="text-muted-foreground text-xs">|</span>
              {workspace.siteUrl ? (
                <a href={workspace.siteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono text-xs flex items-center gap-1" data-testid="link-sharepoint-site">
                  {workspace.siteUrl} <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <span className="text-muted-foreground font-mono text-xs" data-testid="text-workspace-id">{workspace.m365ObjectId}</span>
              )}
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => { navigator.clipboard.writeText(workspace.siteUrl || workspace.m365ObjectId || ""); toast({ title: "Copied", description: workspace.siteUrl ? "Site URL copied to clipboard." : "Object ID copied to clipboard." }); }}>
                <Copy className="w-3 h-3 text-muted-foreground" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {editMode ? (
            <>
              <Button variant="outline" onClick={handleCancel} data-testid="button-cancel">Cancel</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2 shadow-md shadow-primary/20" data-testid="button-save">
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Changes
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => siteSyncMutation.mutate()}
                disabled={siteSyncMutation.isPending}
                data-testid="button-refresh-site"
              >
                <RefreshCw className={`w-4 h-4 ${siteSyncMutation.isPending ? 'animate-spin' : ''}`} />
                {siteSyncMutation.isPending ? "Refreshing..." : "Refresh from M365"}
              </Button>
              <Button variant="outline" className="gap-2 text-primary border-primary/30 hover:bg-primary/10" data-testid="button-apply-defaults">
                <Wand2 className="w-4 h-4" /> Apply Defaults
              </Button>
              <Button onClick={() => setEditMode(true)} className="gap-2" data-testid="button-edit">
                <Pencil className="w-4 h-4" /> Edit Properties
              </Button>
            </>
          )}
        </div>
      </div>

      {workspace.isDeleted && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive" data-testid="banner-deleted">
          <Trash2 className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">This site has been deleted in Microsoft 365</p>
            <p className="text-xs text-destructive/80 mt-0.5">The site was flagged as deleted during the last tenant sync. It may be in the SharePoint recycle bin and recoverable by a SharePoint administrator.</p>
          </div>
        </div>
      )}

      {workspace.isArchived && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400" data-testid="banner-archived">
          <Archive className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">This site is archived (M365 Archive)</p>
            <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 mt-0.5">
              Archived sites are read-only and stored at reduced cost. A SharePoint administrator can reactivate this site from the SharePoint admin center.
            </p>
          </div>
        </div>
      )}

      {!workspace.isDeleted && !workspace.isArchived && workspace.lockState && workspace.lockState !== "Unlock" && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-500" data-testid="banner-locked">
          <Lock className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold text-sm">
              This site is {workspace.lockState === "NoAccess" ? "locked (no access)" : workspace.lockState === "ReadOnly" ? "read-only" : workspace.lockState}
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
              {workspace.lockState === "NoAccess"
                ? "Users cannot access this site. A SharePoint administrator must unlock it."
                : workspace.lockState === "ReadOnly"
                ? "Users can view content but cannot add, edit, or delete anything."
                : "This site has restricted access. Contact a SharePoint administrator for details."}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
              <HardDrive className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Storage Used</p>
              <p className="text-lg font-bold" data-testid="text-size">{workspace.size}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
              <BarChart3 className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Activity Level</p>
              <p className="text-lg font-bold" data-testid="text-usage">{workspace.usage}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last Active</p>
              <p className="text-lg font-bold" data-testid="text-last-active">{workspace.lastActive}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${workspace.externalSharing ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
              {workspace.externalSharing ? <Unlock className="w-5 h-5 text-amber-500" /> : <Lock className="w-5 h-5 text-emerald-500" />}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">External Sharing</p>
              <p className="text-lg font-bold" data-testid="text-sharing">{workspace.externalSharing ? "Allowed" : "Blocked"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="properties" className="w-full">
            <TabsList className="bg-muted/50 border border-border/50">
              <TabsTrigger value="properties" className="gap-2" data-testid="tab-properties"><Settings2 className="w-4 h-4"/> Properties</TabsTrigger>
              <TabsTrigger value="metadata" className="gap-2" data-testid="tab-metadata"><Tags className="w-4 h-4"/> Metadata & Labels</TabsTrigger>
              <TabsTrigger value="propertybag" className="gap-2" data-testid="tab-propertybag"><Database className="w-4 h-4"/> Property Bag</TabsTrigger>
              <TabsTrigger value="raw" className="gap-2" data-testid="tab-raw"><FileJson className="w-4 h-4"/> Raw JSON</TabsTrigger>
              <TabsTrigger value="lifecycle" className="gap-2" data-testid="tab-lifecycle"><Activity className="w-4 h-4"/> Lifecycle</TabsTrigger>
            </TabsList>

            <TabsContent value="properties" className="mt-4">
              <Card className="glass-panel border-border/50">
                <CardHeader>
                  <CardTitle>Site Properties</CardTitle>
                  <CardDescription>Core SharePoint site configuration and governance settings.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Display Name</Label>
                      {editMode ? (
                        <Input id="displayName" value={form.displayName} onChange={(e) => setForm({...form, displayName: e.target.value})} className="bg-background/50" data-testid="input-display-name" />
                      ) : (
                        <div className="h-10 flex items-center px-3 rounded-md bg-muted/50 text-sm">{workspace.displayName}</div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Site Template</Label>
                      {editMode ? (
                        <Select value={form.type} onValueChange={(v) => setForm({...form, type: v})}>
                          <SelectTrigger className="bg-background/50" data-testid="select-type"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="TEAM_SITE">Team Site</SelectItem>
                            <SelectItem value="COMMUNICATION_SITE">Communication Site</SelectItem>
                            <SelectItem value="HUB_SITE">Hub Site</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="h-10 flex items-center gap-2 px-3 rounded-md bg-muted/50 text-sm">
                          <Globe className={`w-4 h-4 ${getSiteTypeColor(workspace.type)}`} />
                          {getSiteTypeLabel(workspace.type)}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Business Context</Label>
                      {editMode ? (
                        <Select value={form.projectType} onValueChange={(v) => setForm({...form, projectType: v})}>
                          <SelectTrigger className="bg-background/50" data-testid="select-project-type"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DEAL">Deal</SelectItem>
                            <SelectItem value="PORTCO">Portfolio Company</SelectItem>
                            <SelectItem value="GENERAL">General</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <div className="h-10 flex items-center px-3 rounded-md bg-muted/50 text-sm">
                          <Badge variant="secondary" className="text-xs">{workspace.projectType}</Badge>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Teams Connected</Label>
                      {editMode ? (
                        <div className="h-10 flex items-center gap-3 px-3 rounded-md border border-input bg-background/50">
                          <Switch checked={form.teamsConnected} onCheckedChange={(v) => setForm({...form, teamsConnected: v})} data-testid="switch-teams" />
                          <span className="text-sm">{form.teamsConnected ? "Connected" : "Not connected"}</span>
                        </div>
                      ) : (
                        <div className="h-10 flex items-center gap-2 px-3 rounded-md bg-muted/50 text-sm">
                          {workspace.teamsConnected ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-blue-500" />
                              <span>Connected</span>
                              <Badge variant="outline" className="text-[10px] font-semibold text-blue-500 bg-blue-500/10 border-blue-500/20 ml-1">Teams</Badge>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Not connected</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Site Status</Label>
                      <div className="h-10 flex items-center gap-2 px-3 rounded-md bg-muted/50 text-sm" data-testid="text-site-status">
                        {workspace.isDeleted ? (
                          <Badge variant="destructive" className="text-xs">Deleted</Badge>
                        ) : workspace.isArchived ? (
                          <Badge variant="outline" className="bg-indigo-500/10 text-indigo-600 border-indigo-500/20 text-xs">Archived</Badge>
                        ) : !workspace.lockState || workspace.lockState === "Unlock" ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-xs">Active</Badge>
                        ) : workspace.lockState === "NoAccess" ? (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">Locked (No Access)</Badge>
                        ) : workspace.lockState === "ReadOnly" ? (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">Read-Only</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">{workspace.lockState}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Hub Association</Label>
                      <div className="h-10 flex items-center gap-2 px-3 rounded-md bg-muted/50 text-sm" data-testid="text-hub-association">
                        {workspace.isHubSite ? (
                          <>
                            <Network className="w-4 h-4 text-purple-500" />
                            <span className="font-medium text-purple-600 dark:text-purple-400">This is a Hub Site</span>
                          </>
                        ) : hubSiteWorkspace ? (
                          <>
                            <Network className="w-4 h-4 text-purple-500" />
                            <span>{hubSiteWorkspace.displayName}</span>
                            {hubSiteWorkspace.siteUrl && (
                              <a href={hubSiteWorkspace.siteUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-xs inline-flex items-center gap-0.5 ml-1">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </>
                        ) : (
                          <>
                            <Unlink className="w-4 h-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Standalone (no hub)</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      Security & Compliance
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                      <div className="space-y-2">
                        <Label>Sensitivity Label (Purview)</Label>
                        {editMode ? (
                          <Select value={form.sensitivityLabelId || "__none__"} onValueChange={(v) => setForm({...form, sensitivityLabelId: v === "__none__" ? "" : v})}>
                            <SelectTrigger className="bg-background/50" data-testid="select-sensitivity"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__" className="text-muted-foreground">No label</SelectItem>
                              {sensitivityLabelsData.filter(l => l.appliesToGroupsSites).map((l) => (
                                <SelectItem key={l.labelId} value={l.labelId} data-testid={`select-label-${l.labelId}`}>
                                  <span className="flex items-center gap-2">
                                    {l.color && <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: l.color }} />}
                                    {l.name}
                                    {l.hasProtection && <Lock className="w-3 h-3 text-emerald-500" />}
                                  </span>
                                </SelectItem>
                              ))}
                              {sensitivityLabelsData.filter(l => l.appliesToGroupsSites).length === 0 && (
                                <SelectItem value="__no_labels__" disabled className="text-muted-foreground text-xs">
                                  No Purview labels synced
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="h-10 flex items-center px-3 rounded-md bg-muted/50 text-sm">
                            {resolvedPurviewLabel ? (
                              <Badge variant="outline" className="gap-1.5">
                                {resolvedPurviewLabel.color && <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: resolvedPurviewLabel.color }} />}
                                {resolvedPurviewLabel.name}
                                {resolvedPurviewLabel.hasProtection && <Lock className="w-3 h-3 text-emerald-500" />}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground italic text-sm">No sensitivity label assigned</span>
                            )}
                          </div>
                        )}
                        {resolvedPurviewLabel?.hasProtection && editMode && (
                          <p className="text-[10px] text-amber-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> This label has encryption/protection enabled.</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Retention Label (Purview)</Label>
                        <div className="h-10 flex items-center px-3 rounded-md bg-muted/30 text-sm text-muted-foreground gap-2" data-testid="text-retention-label">
                          {resolvedRetentionLabel ? (
                            <>
                              <span className="text-foreground">{resolvedRetentionLabel.name}</span>
                              {resolvedRetentionLabel.retentionDuration && (
                                <span className="text-[10px] text-muted-foreground">({resolvedRetentionLabel.retentionDuration})</span>
                              )}
                            </>
                          ) : workspace.retentionLabelId ? (
                            <span className="italic text-xs">ID: {workspace.retentionLabelId.substring(0, 8)}… (sync to resolve)</span>
                          ) : (
                            <span className="italic">No retention label assigned</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>External Sharing</Label>
                        {editMode ? (
                          <div className="h-10 flex items-center gap-3 px-3 rounded-md border border-input bg-background/50">
                            <Switch
                              checked={form.externalSharing}
                              onCheckedChange={(v) => setForm({...form, externalSharing: v})}
                              disabled={form.sensitivity === "HIGHLY_CONFIDENTIAL"}
                              data-testid="switch-sharing"
                            />
                            <span className="text-sm">{form.externalSharing ? "Allowed" : "Blocked"}</span>
                            {form.sensitivity === "HIGHLY_CONFIDENTIAL" && (
                              <span className="text-[10px] text-muted-foreground">(Locked by sensitivity)</span>
                            )}
                          </div>
                        ) : (
                          <div className="h-10 flex items-center gap-2 px-3 rounded-md bg-muted/50 text-sm">
                            {workspace.externalSharing ? (
                              <><Unlock className="w-4 h-4 text-amber-500" /><span>Allowed</span></>
                            ) : (
                              <><Lock className="w-4 h-4 text-emerald-500" /><span>Blocked</span></>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" />
                      Ownership
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                      <div className="space-y-2">
                        <Label>Primary Owner <span className="text-destructive">*</span></Label>
                        {editMode ? (
                          <Input value={form.primarySteward} onChange={(e) => setForm({...form, primarySteward: e.target.value})} className="bg-background/50" data-testid="input-primary-steward" />
                        ) : (
                          <div className="h-10 flex items-center gap-3 px-3 rounded-md bg-muted/50 text-sm">
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                              {primaryInitials}
                            </div>
                            {workspace.primarySteward || <span className="text-muted-foreground italic">Not assigned</span>}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Secondary Owner <span className="text-destructive">*</span></Label>
                        {editMode ? (
                          <Input value={form.secondarySteward} onChange={(e) => setForm({...form, secondarySteward: e.target.value})} className="bg-background/50" data-testid="input-secondary-steward" />
                        ) : (
                          <div className="h-10 flex items-center gap-3 px-3 rounded-md bg-muted/50 text-sm">
                            {workspace.secondarySteward ? (
                              <>
                                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                                  {workspace.secondarySteward.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                                </div>
                                {workspace.secondarySteward}
                              </>
                            ) : (
                              <span className="text-destructive italic flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Not assigned — policy violation</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    {!workspace.secondarySteward && !editMode && (
                      <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3" data-testid="alert-policy-violation">
                        <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                        <div className="text-xs text-destructive">
                          <span className="font-semibold block mb-0.5">Dual Ownership Policy Violation</span>
                          This site requires both a Primary Owner and Secondary Owner to prevent orphaned workspaces.
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="metadata" className="mt-4">
              <Card className="glass-panel border-border/50">
                <CardHeader>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <CardTitle>Governance Metadata</CardTitle>
                      <CardDescription>Required and optional metadata fields for governance compliance.</CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={missingRequired.length === 0 ? "default" : "destructive"} className={missingRequired.length === 0 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
                        {missingRequired.length === 0 ? "Complete" : "Missing Required"}
                      </Badge>
                      {!editMode && (workspace.department || workspace.costCenter || workspace.projectCode) && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 text-xs border-primary/20 text-primary hover:bg-primary/10"
                          onClick={() => writebackMutation.mutate()}
                          disabled={writebackMutation.isPending}
                          data-testid="button-sync-metadata"
                        >
                          {writebackMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                          Sync to SharePoint
                        </Button>
                      )}
                      {editMode ? (
                        <div className="flex items-center gap-1.5">
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCancel} data-testid="button-metadata-cancel">Cancel</Button>
                          <Button size="sm" className="h-7 gap-1.5 text-xs shadow-md shadow-primary/20" onClick={handleSave} disabled={saveMutation.isPending} data-testid="button-metadata-save">
                            {saveMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Save
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1.5 text-xs"
                          onClick={() => setEditMode(true)}
                          data-testid="button-metadata-edit"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="dept" className="flex justify-between">
                        Department {requiredMetadataKeys.includes("department") ? <span className="text-destructive text-xs">Required</span> : <span className="text-muted-foreground text-xs">(Optional)</span>}
                      </Label>
                      {editMode ? (
                        deptOptions.length > 0 ? (
                          <Select value={form.department || "__none__"} onValueChange={(v) => setForm({...form, department: v === "__none__" ? "" : v})}>
                            <SelectTrigger className={`bg-background/50 ${!form.department && requiredMetadataKeys.includes("department") ? 'border-amber-500/50 focus-visible:ring-amber-500' : ''}`} data-testid="select-department">
                              <SelectValue placeholder="Select department..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__" className="text-muted-foreground">— None —</SelectItem>
                              {deptOptions.map(d => (
                                <SelectItem key={d.id} value={d.value}>{d.value}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input 
                            id="dept" 
                            value={form.department} 
                            onChange={(e) => setForm({...form, department: e.target.value})}
                            className={`bg-background/50 ${!form.department && requiredMetadataKeys.includes("department") ? 'border-amber-500/50 focus-visible:ring-amber-500' : ''}`}
                            placeholder="Enter department (define options in Data Dictionaries)..."
                            data-testid="input-department"
                          />
                        )
                      ) : (
                        <div className={`h-10 flex items-center px-3 rounded-md bg-muted/50 text-sm ${!workspace.department && requiredMetadataKeys.includes("department") ? 'border border-amber-500/30 text-amber-500' : ''}`}>
                          {workspace.department || (requiredMetadataKeys.includes("department") ? <span className="italic flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Missing — required by policy</span> : <span className="text-muted-foreground">—</span>)}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cc" className="flex justify-between">
                        Cost Center {requiredMetadataKeys.includes("costCenter") ? <span className="text-destructive text-xs">Required</span> : <span className="text-muted-foreground text-xs">(Optional)</span>}
                      </Label>
                      {editMode ? (
                        costCenterOptions.length > 0 ? (
                          <Select value={form.costCenter || "__none__"} onValueChange={(v) => setForm({...form, costCenter: v === "__none__" ? "" : v})}>
                            <SelectTrigger className={`bg-background/50 ${!form.costCenter && requiredMetadataKeys.includes("costCenter") ? 'border-amber-500/50 focus-visible:ring-amber-500' : ''}`} data-testid="select-cost-center">
                              <SelectValue placeholder="Select cost center..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__" className="text-muted-foreground">— None —</SelectItem>
                              {costCenterOptions.map(d => (
                                <SelectItem key={d.id} value={d.value}>{d.value}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input 
                            id="cc" 
                            placeholder="e.g., CC-4100 (define options in Data Dictionaries)"
                            value={form.costCenter} 
                            onChange={(e) => setForm({...form, costCenter: e.target.value})}
                            className={`bg-background/50 ${!form.costCenter && requiredMetadataKeys.includes("costCenter") ? 'border-amber-500/50 focus-visible:ring-amber-500' : ''}`}
                            data-testid="input-cost-center"
                          />
                        )
                      ) : (
                        <div className={`h-10 flex items-center px-3 rounded-md bg-muted/50 text-sm ${!workspace.costCenter && requiredMetadataKeys.includes("costCenter") ? 'border border-amber-500/30 text-amber-500' : ''}`}>
                          {workspace.costCenter || (requiredMetadataKeys.includes("costCenter") ? <span className="italic flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Missing — required by policy</span> : <span className="text-muted-foreground">—</span>)}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label className="flex justify-between">Project Code {requiredMetadataKeys.includes("projectCode") ? <span className="text-destructive text-xs">Required</span> : <span className="text-muted-foreground text-xs">(Optional)</span>}</Label>
                      {editMode ? (
                        projectCodeOptions.length > 0 ? (
                          <Select value={form.projectCode || "__none__"} onValueChange={(v) => setForm({...form, projectCode: v === "__none__" ? "" : v})}>
                            <SelectTrigger className="bg-background/50" data-testid="select-project-code">
                              <SelectValue placeholder="Select project code..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__" className="text-muted-foreground">— None —</SelectItem>
                              {projectCodeOptions.map(d => (
                                <SelectItem key={d.id} value={d.value}>{d.value}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input 
                            value={form.projectCode} 
                            onChange={(e) => setForm({...form, projectCode: e.target.value})}
                            className="bg-background/50"
                            placeholder="e.g., PHX-001"
                            data-testid="input-project-code"
                          />
                        )
                      ) : (
                        <div className="h-10 flex items-center px-3 rounded-md bg-muted/50 text-sm text-muted-foreground">
                          {workspace.projectCode || "—"}
                        </div>
                      )}
                    </div>
                  </div>

                  {missingRequired.length > 0 && editMode && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <div className="text-xs text-amber-600">
                        <span className="font-semibold block mb-0.5">Missing Required Fields</span>
                        Complete the following to achieve metadata compliance: {missingRequired.map(f => f.label).join(", ")}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="propertybag" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="glass-panel border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-teal-500" />
                      SharePoint Property Bag
                    </CardTitle>
                    <CardDescription>Raw key-value pairs stored directly on the underlying SharePoint site.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {workspace.propertyBag && Object.keys(workspace.propertyBag).length > 0 ? (
                      <div className="space-y-1">
                        <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                          <span className="font-semibold text-xs text-muted-foreground col-span-1">Key</span>
                          <span className="font-semibold text-xs text-muted-foreground col-span-2">Value</span>
                        </div>
                        {Object.entries(workspace.propertyBag as Record<string, string>)
                          .sort(([a], [b]) => {
                            const aZenith = a.startsWith('Zenith_');
                            const bZenith = b.startsWith('Zenith_');
                            if (aZenith && !bZenith) return -1;
                            if (!aZenith && bZenith) return 1;
                            return a.localeCompare(b);
                          })
                          .map(([key, value]) => {
                            const isZenith = key.startsWith('Zenith_');
                            return (
                              <div key={key} className={`grid grid-cols-3 gap-2 py-1.5 ${isZenith ? 'bg-primary/5 rounded px-2 -mx-2' : ''}`}>
                                <span className="font-mono text-xs col-span-1 break-all text-primary">{key}</span>
                                <span className={`font-mono text-xs col-span-2 break-all ${isZenith ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{value}</span>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground py-4 text-center">
                        No property bag data available. Sync this site to retrieve property bag entries from SharePoint.
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="glass-panel border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Tags className="w-5 h-5 text-blue-500" />
                      {workspace.teamsConnected ? "Microsoft Teams Tags" : "Site Columns & Tags"}
                    </CardTitle>
                    <CardDescription>
                      {workspace.teamsConnected ? "Tags applied to the associated M365 Group and Team." : "Custom tags applied to this SharePoint site."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {workspace.teamsConnected && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold">System Tags</h4>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary" className="font-mono text-xs text-muted-foreground">Teamified</Badge>
                            <Badge variant="secondary" className="font-mono text-xs text-muted-foreground">ExchangeProvisioned</Badge>
                          </div>
                        </div>
                      )}
                      <div className={`space-y-2 ${workspace.teamsConnected ? 'pt-2 border-t border-border/40' : ''}`}>
                        <h4 className="text-sm font-semibold flex items-center justify-between">
                          Custom Tags
                          <Button variant="ghost" size="sm" className="h-6 text-xs">Edit Tags</Button>
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {workspace.projectCode && (
                            <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/5">Project:{workspace.projectCode}</Badge>
                          )}
                          <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/5">Status:Active</Badge>
                          <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/5">Type:{workspace.projectType}</Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="raw" className="mt-4">
              <Card className="glass-panel border-border/50">
                <CardHeader>
                  <CardTitle>JSON Object</CardTitle>
                  <CardDescription>Raw representation of the workspace state and property bag metadata.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea 
                    className="font-mono text-sm h-[400px] bg-background/80 resize-none p-4"
                    value={rawJson}
                    readOnly
                    data-testid="textarea-raw-json"
                  />
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="lifecycle" className="mt-4">
              <Card className="glass-panel border-border/50">
                <CardHeader>
                  <CardTitle>Lifecycle History</CardTitle>
                  <CardDescription>State transitions and attestation records for this site.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { date: "Feb 21, 2026", action: "Workspace provisioned", by: workspace.primarySteward || "System", type: "created" },
                      { date: "Feb 21, 2026", action: "Sensitivity label applied: " + sensitivityLabel, by: "Governance Policy Engine", type: "security" },
                      { date: "Feb 21, 2026", action: "Copilot eligibility evaluated", by: "Zenith Compliance", type: workspace.copilotReady ? "pass" : "blocked" },
                      { date: "Feb 21, 2026", action: workspace.teamsConnected ? "Microsoft Teams connected" : "Teams connectivity skipped", by: "Provisioning Engine", type: "info" },
                    ].map((event, idx) => (
                      <div key={idx} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={`w-3 h-3 rounded-full shrink-0 mt-1.5 ${
                            event.type === "created" ? "bg-primary" :
                            event.type === "security" ? "bg-amber-500" :
                            event.type === "pass" ? "bg-emerald-500" :
                            event.type === "blocked" ? "bg-destructive" :
                            "bg-muted-foreground"
                          }`} />
                          {idx < 3 && <div className="w-px h-full bg-border/50 min-h-[24px]" />}
                        </div>
                        <div className="pb-4">
                          <p className="text-sm font-medium">{event.action}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{event.date} by {event.by}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card className={`border-border/50 ${workspace.copilotReady ? 'bg-gradient-to-br from-emerald-500/5 to-card' : 'bg-gradient-to-br from-card to-card/50'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Copilot Eligibility
                <Badge variant={workspace.copilotReady ? "default" : "destructive"} className={workspace.copilotReady ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
                  {passCount}/{computedRules.length} Passed
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${workspace.copilotReady ? 'bg-emerald-500/10' : 'bg-muted'}`}>
                  {workspace.copilotReady 
                    ? <ShieldCheck className="w-6 h-6 text-emerald-500" />
                    : <ShieldAlert className="w-6 h-6 text-muted-foreground" />
                  }
                </div>
                <div>
                  <h4 className="font-semibold text-sm" data-testid="text-copilot-status">{workspace.copilotReady ? "Eligible for Copilot" : "Not Eligible"}</h4>
                  <p className="text-xs text-muted-foreground">{workspace.copilotReady ? "All governance rules passed" : `${failCount} rule${failCount > 1 ? 's' : ''} failed — resolve to enable`}</p>
                </div>
              </div>
              <div className="space-y-2">
                {computedRules.map((rule, idx) => {
                  const pass = rule.ruleResult === "PASS";
                  return (
                    <div key={idx} className={`flex items-start gap-2 text-xs p-2 rounded-lg ${pass ? 'bg-emerald-500/5' : 'bg-destructive/5'}`} data-testid={`copilot-rule-${idx}`}>
                      {pass 
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5"/>
                        : <ShieldAlert className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5"/>
                      }
                      <div>
                        <span className={`font-medium block ${pass ? '' : 'text-destructive'}`}>{rule.ruleName}</span>
                        <span className="text-muted-foreground">{rule.ruleDescription}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Ownership
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspace.primarySteward && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30" data-testid="text-primary-steward">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {primaryInitials}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{workspace.primarySteward}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Primary Owner</p>
                  </div>
                </div>
              )}
              {workspace.secondarySteward ? (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30" data-testid="text-secondary-steward">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                    {workspace.secondarySteward.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{workspace.secondarySteward}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Secondary Owner</p>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3" data-testid="alert-ownership-violation">
                  <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-xs text-destructive">
                    <span className="font-semibold block mb-0.5">No Secondary Owner</span>
                    Assign a secondary owner to meet dual ownership requirements.
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/30">
                <span>Total Owners</span>
                <span className="font-semibold text-foreground">{workspace.owners}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className={`w-4 h-4 ${getSiteTypeColor(workspace.type)}`} />
                Site Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Template</span>
                <span className="font-medium">{getSiteTypeLabel(workspace.type)}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Storage</span>
                <span className="font-medium">{workspace.size}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Activity</span>
                <span className="font-medium">{workspace.usage}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Active</span>
                <span className="font-medium">{workspace.lastActive}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Teams</span>
                <span className="font-medium">{workspace.teamsConnected ? "Connected" : "No"}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{workspace.createdAt ? new Date(workspace.createdAt).toLocaleDateString() : "—"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
