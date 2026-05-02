import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Workspace, CustomFieldDefinition, DocumentLibrary } from "@shared/schema";
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
  Archive,
  ArchiveRestore,
  Library,
  UserPlus,
  X as XIcon,
  Search as SearchIcon
} from "lucide-react";
import { useServicePlan } from "@/hooks/use-service-plan";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type DataDictEntry = { id: string; tenantId: string; category: string; value: string; createdAt: string };
type SensitivityLabelEntry = { id: string; tenantId: string; labelId: string; name: string; description: string | null; color: string | null; tooltip: string | null; sensitivity: number | null; isActive: boolean; contentFormats: string[] | null; hasProtection: boolean; parentLabelId: string | null; appliesToGroupsSites: boolean; syncedAt: string | null };
type RetentionLabelEntry = { id: string; tenantId: string; labelId: string; name: string; description: string | null; isInUse: boolean; retentionDuration: string | null; actionAfterRetention: string | null; syncedAt: string | null };

export default function WorkspaceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { canWriteBack } = useServicePlan();

  const { data: workspace, isLoading, error } = useQuery<Workspace>({
    queryKey: [`/api/workspaces/${id}`],
    enabled: !!id,
  });

  const { data: policyResults } = useQuery<{
    policyId: string | null;
    policyName: string;
    policyType?: string;
    policies?: { policyId: string; policyName: string; policyType: string; outcomeId?: string; outcomeName?: string; overallPass: boolean; passCount: number; failCount: number }[];
    results: { ruleType?: string; ruleName: string; ruleResult: string; ruleDescription: string; policyName?: string }[];
    overallPass: boolean;
    passCount?: number;
    failCount?: number;
  }>({
    queryKey: [`/api/workspaces/${id}/policy-results`],
    enabled: !!id,
  });

  const { data: scoringResult } = useQuery<{
    eligible: boolean;
    score: number;
    tier: string;
    passingCount: number;
    totalCount: number;
    criteria: { key: string; label: string; pass: boolean; description: string; remediation: string }[];
    blockers: { key: string; label: string; pass: boolean; description: string; remediation: string }[];
  }>({
    queryKey: [`/api/workspaces/${id}/copilot-readiness`],
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

  const { data: customFieldDefs = [] } = useQuery<CustomFieldDefinition[]>({
    queryKey: ["/api/admin/tenants", tenantConnectionId, "custom-fields"],
    queryFn: () => fetch(`/api/admin/tenants/${tenantConnectionId}/custom-fields`).then(r => r.json()),
    enabled: !!tenantConnectionId,
  });

  const { data: docLibraries = [] } = useQuery<DocumentLibrary[]>({
    queryKey: ["/api/workspaces", id, "libraries"],
    queryFn: () => fetch(`/api/workspaces/${id}/libraries`).then(r => r.ok ? r.json() : []),
    enabled: !!id,
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
    teamsConnected: false,
    projectType: "",
  });
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});

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
        teamsConnected: workspace.teamsConnected,
        projectType: workspace.projectType || "",
      });
      const existingCustom = workspace.customFields || {};
      const merged: Record<string, any> = { ...existingCustom };
      if (customFieldDefs.length > 0) {
        for (const def of customFieldDefs) {
          if ((merged[def.fieldName] === undefined || merged[def.fieldName] === null || merged[def.fieldName] === "") && def.defaultValue) {
            merged[def.fieldName] = def.fieldType === "NUMBER" ? Number(def.defaultValue) : def.fieldType === "BOOLEAN" ? def.defaultValue === "true" : def.defaultValue;
          }
        }
      }
      setCustomFieldValues(merged);
    }
  }, [workspace, customFieldDefs]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<typeof form> & { customFields?: Record<string, any> }) => {
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

  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [restoreReason, setRestoreReason] = useState("");

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const body = restoreReason.trim() ? { reason: restoreReason.trim() } : {};
      const res = await apiRequest("POST", `/api/workspaces/${id}/unarchive`, body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setShowRestoreDialog(false);
      setRestoreReason("");
      toast({ title: "Restore requested", description: "The site will become writable again once Graph completes the restore." });
    },
    onError: (err: any) => {
      toast({ title: "Restore failed", description: err?.message || "Could not restore the workspace.", variant: "destructive" });
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

  // ── Site Owner Management ──
  const { data: meData } = useQuery<{ user: { effectiveRole?: string; role?: string } } >({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then(r => r.json()),
    staleTime: 60_000,
  });
  const effectiveRole = (meData?.user?.effectiveRole || meData?.user?.role || "").toLowerCase();
  const canManageOwners =
    effectiveRole === "platform_owner" ||
    effectiveRole === "tenant_admin" ||
    effectiveRole === "governance_admin";
  const { isFeatureEnabled } = useServicePlan();
  const ownershipFeatureOn = isFeatureEnabled("ownershipManagement" as any);

  const [ownerSearchOpen, setOwnerSearchOpen] = useState(false);
  const [ownerSearch, setOwnerSearch] = useState("");
  const [debouncedOwnerSearch, setDebouncedOwnerSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedOwnerSearch(ownerSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [ownerSearch]);

  const { data: ownerSearchResults, isFetching: ownerSearchLoading } = useQuery<{ users: Array<{ id: string; displayName: string; mail?: string; userPrincipalName?: string }> }>({
    queryKey: ["/api/tenants", workspace?.tenantConnectionId, "users/search", debouncedOwnerSearch],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${workspace?.tenantConnectionId}/users/search?q=${encodeURIComponent(debouncedOwnerSearch)}`, { credentials: "include" });
      if (!r.ok) return { users: [] };
      return r.json();
    },
    enabled: !!workspace?.tenantConnectionId && ownerSearchOpen && debouncedOwnerSearch.length >= 2,
  });

  const parseErrorMessage = (err: any, fallback: string): string => {
    if (!err?.message) return fallback;
    const match = err.message.match(/^\d+:\s*([\s\S]+)$/);
    if (match) {
      try {
        const body = JSON.parse(match[1]);
        return body?.message || fallback;
      } catch {
        return match[1];
      }
    }
    return err.message || fallback;
  };

  const addOwnerMutation = useMutation({
    mutationFn: async (user: { id: string; userPrincipalName?: string; displayName: string }) => {
      const res = await apiRequest("POST", `/api/workspaces/${id}/owners`, { userId: user.id });
      return res.json();
    },
    onSuccess: (_data, user) => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}/policy-results`] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setOwnerSearch("");
      setOwnerSearchOpen(false);
      toast({ title: "Owner added", description: `${user.displayName} is now an owner of this site.` });
    },
    onError: (err: any) => {
      toast({ title: "Could not add owner", description: parseErrorMessage(err, "Failed to add owner."), variant: "destructive" });
    },
  });

  const [confirmRemoveOwner, setConfirmRemoveOwner] = useState<{ id: string; displayName: string } | null>(null);
  const removeOwnerMutation = useMutation({
    mutationFn: async (owner: { id: string; displayName: string }) => {
      const res = await apiRequest("DELETE", `/api/workspaces/${id}/owners/${owner.id}`);
      return res.json();
    },
    onSuccess: (_data, owner) => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}/policy-results`] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setConfirmRemoveOwner(null);
      toast({ title: "Owner removed", description: `${owner.displayName} is no longer an owner of this site.` });
    },
    onError: (err: any) => {
      toast({ title: "Could not remove owner", description: parseErrorMessage(err, "Failed to remove owner."), variant: "destructive" });
      setConfirmRemoveOwner(null);
    },
  });

  // ── Site Member Management ──
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedMemberSearch(memberSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [memberSearch]);

  const { data: memberSearchResults, isFetching: memberSearchLoading } = useQuery<{ users: Array<{ id: string; displayName: string; mail?: string; userPrincipalName?: string }> }>({
    queryKey: ["/api/tenants", workspace?.tenantConnectionId, "users/search", debouncedMemberSearch, "members"],
    queryFn: async () => {
      const r = await fetch(`/api/tenants/${workspace?.tenantConnectionId}/users/search?q=${encodeURIComponent(debouncedMemberSearch)}`, { credentials: "include" });
      if (!r.ok) return { users: [] };
      return r.json();
    },
    enabled: !!workspace?.tenantConnectionId && memberSearchOpen && debouncedMemberSearch.length >= 2,
  });

  const addMemberMutation = useMutation({
    mutationFn: async (user: { id: string; userPrincipalName?: string; displayName: string }) => {
      const res = await apiRequest("POST", `/api/workspaces/${id}/members`, { userId: user.id });
      return res.json();
    },
    onSuccess: (_data, user) => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setMemberSearch("");
      setMemberSearchOpen(false);
      toast({ title: "Member added", description: `${user.displayName} is now a member of this site.` });
    },
    onError: (err: any) => {
      toast({ title: "Could not add member", description: parseErrorMessage(err, "Failed to add member."), variant: "destructive" });
    },
  });

  const [confirmRemoveMember, setConfirmRemoveMember] = useState<{ id: string; displayName: string } | null>(null);
  const removeMemberMutation = useMutation({
    mutationFn: async (member: { id: string; displayName: string }) => {
      const res = await apiRequest("DELETE", `/api/workspaces/${id}/members/${member.id}`);
      return res.json();
    },
    onSuccess: (_data, member) => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setConfirmRemoveMember(null);
      toast({ title: "Member removed", description: `${member.displayName} is no longer a member of this site.` });
    },
    onError: (err: any) => {
      toast({ title: "Could not remove member", description: parseErrorMessage(err, "Failed to remove member."), variant: "destructive" });
      setConfirmRemoveMember(null);
    },
  });

  const handleSave = () => {
    const missingCustomRequired = customFieldDefs
      .filter(f => f.required && (customFieldValues[f.fieldName] === undefined || customFieldValues[f.fieldName] === "" || customFieldValues[f.fieldName] === null))
      .map(f => f.fieldLabel);
    if (missingCustomRequired.length > 0) {
      toast({ title: "Missing Required Custom Fields", description: `Please fill in: ${missingCustomRequired.join(", ")}`, variant: "destructive" });
      return;
    }
    saveMutation.mutate({ ...form, customFields: customFieldValues });
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
        teamsConnected: workspace.teamsConnected,
        projectType: workspace.projectType || "",
      });
      const existingCustom2 = workspace.customFields || {};
      const merged2: Record<string, any> = { ...existingCustom2 };
      if (customFieldDefs.length > 0) {
        for (const def of customFieldDefs) {
          if ((merged2[def.fieldName] === undefined || merged2[def.fieldName] === null || merged2[def.fieldName] === "") && def.defaultValue) {
            merged2[def.fieldName] = def.fieldType === "NUMBER" ? Number(def.defaultValue) : def.fieldType === "BOOLEAN" ? def.defaultValue === "true" : def.defaultValue;
          }
        }
      }
      setCustomFieldValues(merged2);
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
            <ArrowLeft className="w-4 h-4" /> Back to SharePoint Sites
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

  // Prefer the actual SharePoint web template ID when we have it (e.g. "GROUP#0",
  // "SITEPAGEPUBLISHING#0"); fall back to the inferred type so newly-synced sites
  // without a usage-report row still get a meaningful label.
  const getResolvedTemplateLabel = (ws: { type: string; rootWebTemplate?: string | null }) => {
    const t = (ws.rootWebTemplate || "").toUpperCase();
    if (t.includes("SITEPAGEPUBLISHING")) return "Communication Site";
    if (t.includes("GROUP")) return "Team Site (Group-connected)";
    if (t.includes("STS#3")) return "Team Site (Modern)";
    if (t.includes("STS#0")) return "Team Site (Classic)";
    if (t.includes("STS")) return "Team Site";
    if (t) return ws.rootWebTemplate || getSiteTypeLabel(ws.type);
    return getSiteTypeLabel(ws.type);
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

  const hasPolicyResults = policyResults?.results && policyResults.results.length > 0;
  const computedRules: { ruleName: string; ruleResult: string; ruleDescription: string; policyName?: string }[] = hasPolicyResults
    ? policyResults.results.map(r => ({ ruleName: r.ruleName, ruleResult: r.ruleResult, ruleDescription: r.ruleDescription, policyName: r.policyName }))
    : [];

  const policyName = policyResults?.policies && policyResults.policies.length > 1
    ? "Policy Evaluation"
    : (policyResults?.policies?.[0]?.outcomeName || policyResults?.policies?.[0]?.policyName || policyResults?.policyName || "Policy Evaluation");

  const rawJson = JSON.stringify(workspace, null, 2);
  const passCount = computedRules.filter(r => r.ruleResult === "PASS").length;
  const failCount = computedRules.filter(r => r.ruleResult === "FAIL").length;
  const allRulesPass = computedRules.length > 0 && failCount === 0;
  // Scoring engine is the authoritative Copilot eligibility signal — same engine
  // as the Copilot Readiness page. Fall back to the policy/DB flag only when the
  // scoring result has not yet loaded.
  const copilotEligible = scoringResult !== undefined ? scoringResult.eligible : (allRulesPass || workspace.copilotReady);

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
              <span className="text-muted-foreground text-xs">{getResolvedTemplateLabel(workspace)}</span>
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
        <div className="flex items-start gap-3 p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400" data-testid="banner-archived">
          <Archive className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sm">
              {workspace.lifecycleState === "PendingArchive"
                ? "Archive in progress (M365 Archive)"
                : workspace.lifecycleState === "PendingRestore"
                ? "Restore in progress"
                : "This site is archived (M365 Archive)"}
            </p>
            <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 mt-0.5">
              Archived sites are read-only and stored at reduced cost. Use Restore to make this site writable again.
            </p>
            {workspace.archiveReason && (
              <p className="text-xs mt-2" data-testid="text-archive-reason">
                <span className="font-semibold">Reason:</span> {workspace.archiveReason}
                {workspace.archivedBy && <> &middot; <span className="font-semibold">By:</span> {workspace.archivedBy}</>}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-indigo-500/30 text-indigo-600 hover:bg-indigo-500/10"
            disabled={restoreMutation.isPending || workspace.lifecycleState === "PendingRestore"}
            onClick={() => setShowRestoreDialog(true)}
            data-testid="button-restore-workspace"
          >
            <ArchiveRestore className="w-4 h-4" />
            {workspace.lifecycleState === "PendingRestore" ? "Restoring…" : "Restore"}
          </Button>
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
              <TabsTrigger value="libraries" className="gap-2" data-testid="tab-libraries"><Library className="w-4 h-4"/> Document Libraries{docLibraries.length > 0 ? ` (${docLibraries.length})` : ""}</TabsTrigger>
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
                      {/*
                        Site template is set when the SharePoint site is provisioned and
                        cannot be changed afterwards via the Microsoft 365 APIs. We always
                        render this as read-only so users don't believe a Zenith edit will
                        reconfigure the site.
                      */}
                      <div className="h-10 flex items-center gap-2 px-3 rounded-md bg-muted/50 text-sm" data-testid="text-site-template">
                        <Globe className={`w-4 h-4 ${getSiteTypeColor(workspace.type)}`} />
                        {getResolvedTemplateLabel(workspace)}
                        <Badge variant="outline" className="ml-auto text-[10px] font-medium text-muted-foreground border-border/50">Read-only</Badge>
                      </div>
                      {editMode && (
                        <p className="text-[11px] text-muted-foreground">
                          Set at site provisioning in Microsoft 365 and cannot be changed from Zenith.
                        </p>
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
                    {(() => {
                      const siteOwners = ((workspace as any).siteOwners || []) as Array<{ id?: string; displayName: string; mail?: string; userPrincipalName?: string }>;
                      const isCommSite = workspace.type === "COMMUNICATION_SITE";
                      const showAdminControls = canManageOwners && ownershipFeatureOn && !isCommSite;
                      const onlyOneOwner = siteOwners.length <= 1;
                      return (
                        <>
                          <div className="flex items-center justify-between mb-4 gap-2">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                              <Users className="w-4 h-4 text-primary" />
                              Ownership ({workspace.owners} {workspace.owners === 1 ? 'owner' : 'owners'})
                            </h3>
                            {showAdminControls && (
                              <Popover open={ownerSearchOpen} onOpenChange={(o) => { setOwnerSearchOpen(o); if (!o) setOwnerSearch(""); }}>
                                <PopoverTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" data-testid="button-add-owner">
                                    <UserPlus className="w-3.5 h-3.5" />
                                    Add Owner
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 p-0" align="end">
                                  <div className="p-3 border-b border-border/50">
                                    <div className="relative">
                                      <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                      <Input
                                        autoFocus
                                        placeholder="Search by name or email..."
                                        value={ownerSearch}
                                        onChange={(e) => setOwnerSearch(e.target.value)}
                                        className="h-8 pl-8 text-sm"
                                        data-testid="input-owner-search"
                                      />
                                    </div>
                                  </div>
                                  <div className="max-h-64 overflow-y-auto">
                                    {debouncedOwnerSearch.length < 2 ? (
                                      <div className="p-4 text-xs text-muted-foreground text-center">Type at least 2 characters to search the directory.</div>
                                    ) : ownerSearchLoading ? (
                                      <div className="p-4 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
                                      </div>
                                    ) : !ownerSearchResults?.users?.length ? (
                                      <div className="p-4 text-xs text-muted-foreground text-center">No matching users found.</div>
                                    ) : (
                                      <div className="py-1">
                                        {ownerSearchResults.users.map((u) => {
                                          const alreadyOwner = siteOwners.some(o => o.id === u.id);
                                          return (
                                            <button
                                              key={u.id}
                                              type="button"
                                              disabled={alreadyOwner || addOwnerMutation.isPending}
                                              onClick={() => addOwnerMutation.mutate({ id: u.id, userPrincipalName: u.userPrincipalName, displayName: u.displayName })}
                                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                                              data-testid={`button-add-owner-result-${u.id}`}
                                            >
                                              <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium truncate">{u.displayName}</p>
                                                <p className="text-[10px] text-muted-foreground truncate">{u.mail || u.userPrincipalName}</p>
                                              </div>
                                              {alreadyOwner && <span className="text-[10px] text-muted-foreground shrink-0">Already owner</span>}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>

                          {isCommSite && canManageOwners && (
                            <div className="mb-3 p-3 rounded-lg bg-muted/30 border border-border/40 text-xs text-muted-foreground" data-testid="text-comm-site-owner-note">
                              Communication Sites are not backed by a Microsoft 365 group, so their owners can't be edited from Zenith.
                            </div>
                          )}

                          {siteOwners.length > 0 ? (
                            <div className="space-y-2">
                              <TooltipProvider>
                                {siteOwners.map((owner, idx) => {
                                  const initials = owner.displayName ? owner.displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) : "?";
                                  const removeDisabled = onlyOneOwner || removeOwnerMutation.isPending || !owner.id;
                                  return (
                                    <div key={owner.id || idx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30" data-testid={`text-owner-${idx}`}>
                                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                                        {initials}
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate">{owner.displayName}</p>
                                        {owner.mail && <p className="text-[10px] text-muted-foreground truncate">{owner.mail}</p>}
                                      </div>
                                      {showAdminControls && owner.id && (
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <span>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
                                                disabled={removeDisabled}
                                                onClick={() => setConfirmRemoveOwner({ id: owner.id!, displayName: owner.displayName })}
                                                data-testid={`button-remove-owner-${owner.id}`}
                                                aria-label={`Remove ${owner.displayName}`}
                                              >
                                                <XIcon className="w-3.5 h-3.5" />
                                              </Button>
                                            </span>
                                          </TooltipTrigger>
                                          {onlyOneOwner && (
                                            <TooltipContent side="left">
                                              <p className="text-xs max-w-[220px]">A site must always have at least one owner. Add another owner before removing this one.</p>
                                            </TooltipContent>
                                          )}
                                        </Tooltip>
                                      )}
                                    </div>
                                  );
                                })}
                              </TooltipProvider>
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground italic">
                              {workspace.ownerDisplayName || "No owner data available. Run a sync to populate."}
                            </div>
                          )}
                          {workspace.owners < 2 && (
                            <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3" data-testid="alert-policy-violation">
                              <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                              <div className="text-xs text-destructive">
                                <span className="font-semibold block mb-0.5">Dual Ownership Policy Violation</span>
                                This site has fewer than 2 owners. {showAdminControls ? "Use Add Owner above to add another owner and meet governance requirements." : "Add additional owners to meet governance requirements."}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <Separator />

                  <div>
                    {(() => {
                      const siteMembers = ((workspace as any).siteMembers || []) as Array<{ id?: string; displayName: string; mail?: string; userPrincipalName?: string }>;
                      const siteOwners = ((workspace as any).siteOwners || []) as Array<{ id?: string; displayName: string; mail?: string; userPrincipalName?: string }>;
                      const isCommSite = workspace.type === "COMMUNICATION_SITE";
                      const showAdminControls = canManageOwners && ownershipFeatureOn && !isCommSite;
                      return (
                        <>
                          <div className="flex items-center justify-between mb-4 gap-2">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                              <Users className="w-4 h-4 text-primary" />
                              Members ({siteMembers.length} {siteMembers.length === 1 ? 'member' : 'members'})
                            </h3>
                            {showAdminControls && (
                              <Popover open={memberSearchOpen} onOpenChange={(o) => { setMemberSearchOpen(o); if (!o) setMemberSearch(""); }}>
                                <PopoverTrigger asChild>
                                  <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" data-testid="button-add-member">
                                    <UserPlus className="w-3.5 h-3.5" />
                                    Add Member
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80 p-0" align="end">
                                  <div className="p-3 border-b border-border/50">
                                    <div className="relative">
                                      <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                      <Input
                                        autoFocus
                                        placeholder="Search by name or email..."
                                        value={memberSearch}
                                        onChange={(e) => setMemberSearch(e.target.value)}
                                        className="h-8 pl-8 text-sm"
                                        data-testid="input-member-search"
                                      />
                                    </div>
                                  </div>
                                  <div className="max-h-64 overflow-y-auto">
                                    {debouncedMemberSearch.length < 2 ? (
                                      <div className="p-4 text-xs text-muted-foreground text-center">Type at least 2 characters to search the directory.</div>
                                    ) : memberSearchLoading ? (
                                      <div className="p-4 text-xs text-muted-foreground text-center flex items-center justify-center gap-2">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
                                      </div>
                                    ) : !memberSearchResults?.users?.length ? (
                                      <div className="p-4 text-xs text-muted-foreground text-center">No matching users found.</div>
                                    ) : (
                                      <div className="py-1">
                                        {memberSearchResults.users.map((u) => {
                                          const alreadyMember = siteMembers.some(m => m.id === u.id);
                                          const isOwner = siteOwners.some(o => o.id === u.id);
                                          const disabled = alreadyMember || addMemberMutation.isPending;
                                          return (
                                            <button
                                              key={u.id}
                                              type="button"
                                              disabled={disabled}
                                              onClick={() => addMemberMutation.mutate({ id: u.id, userPrincipalName: u.userPrincipalName, displayName: u.displayName })}
                                              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed text-left"
                                              data-testid={`button-add-member-result-${u.id}`}
                                            >
                                              <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium truncate">{u.displayName}</p>
                                                <p className="text-[10px] text-muted-foreground truncate">{u.mail || u.userPrincipalName}</p>
                                              </div>
                                              {alreadyMember && <span className="text-[10px] text-muted-foreground shrink-0">Already member</span>}
                                              {!alreadyMember && isOwner && <span className="text-[10px] text-muted-foreground shrink-0">Owner</span>}
                                            </button>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>

                          {isCommSite && canManageOwners && (
                            <div className="mb-3 p-3 rounded-lg bg-muted/30 border border-border/40 text-xs text-muted-foreground" data-testid="text-comm-site-member-note">
                              Communication Sites are not backed by a Microsoft 365 group, so their members can't be edited from Zenith.
                            </div>
                          )}

                          {siteMembers.length > 0 ? (
                            <div className="space-y-2">
                              {siteMembers.map((member, idx) => {
                                const initials = member.displayName ? member.displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2) : "?";
                                return (
                                  <div key={member.id || idx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30" data-testid={`text-member-${idx}`}>
                                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-[10px] font-bold shrink-0">
                                      {initials}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium truncate">{member.displayName}</p>
                                      {member.mail && <p className="text-[10px] text-muted-foreground truncate">{member.mail}</p>}
                                    </div>
                                    {showAdminControls && member.id && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive disabled:opacity-40"
                                        disabled={removeMemberMutation.isPending}
                                        onClick={() => setConfirmRemoveMember({ id: member.id!, displayName: member.displayName })}
                                        data-testid={`button-remove-member-${member.id}`}
                                        aria-label={`Remove ${member.displayName}`}
                                      >
                                        <XIcon className="w-3.5 h-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-sm text-muted-foreground italic" data-testid="text-no-members">
                              {isCommSite ? "Communication Sites do not have group members." : "No members yet. Use Add Member above to grant access."}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <AlertDialog open={!!confirmRemoveMember} onOpenChange={(o) => { if (!o) setConfirmRemoveMember(null); }}>
                    <AlertDialogContent data-testid="dialog-confirm-remove-member">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove site member?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {confirmRemoveMember ? (
                            <>This will remove <strong>{confirmRemoveMember.displayName}</strong> as a member of this Microsoft 365 group and SharePoint site. They will lose member-level access immediately.</>
                          ) : null}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-cancel-remove-member">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={removeMemberMutation.isPending}
                          onClick={() => confirmRemoveMember && removeMemberMutation.mutate(confirmRemoveMember)}
                          data-testid="button-confirm-remove-member"
                        >
                          {removeMemberMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                          Remove member
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <AlertDialog open={!!confirmRemoveOwner} onOpenChange={(o) => { if (!o) setConfirmRemoveOwner(null); }}>
                    <AlertDialogContent data-testid="dialog-confirm-remove-owner">
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove site owner?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {confirmRemoveOwner ? (
                            <>This will remove <strong>{confirmRemoveOwner.displayName}</strong> as an owner of this Microsoft 365 group and SharePoint site. They will lose owner-level access immediately.</>
                          ) : null}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-cancel-remove-owner">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={removeOwnerMutation.isPending}
                          onClick={() => confirmRemoveOwner && removeOwnerMutation.mutate(confirmRemoveOwner)}
                          data-testid="button-confirm-remove-owner"
                        >
                          {removeOwnerMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                          Remove owner
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </CardContent>
              </Card>
            </TabsContent>

            <AlertDialog open={showRestoreDialog} onOpenChange={(o) => { if (!o) { setShowRestoreDialog(false); setRestoreReason(""); } }}>
              <AlertDialogContent data-testid="dialog-restore-workspace">
                <AlertDialogHeader>
                  <AlertDialogTitle>Restore site in Microsoft 365?</AlertDialogTitle>
                  <AlertDialogDescription>
                    <strong>{workspace.displayName}</strong> will be unarchived in Microsoft 365 and become writable again.
                    The action runs through the Microsoft Graph archive API.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="restore-reason" className="text-sm">Reason for restore (optional)</Label>
                  <Textarea
                    id="restore-reason"
                    value={restoreReason}
                    onChange={(e) => setRestoreReason(e.target.value)}
                    placeholder="e.g. Project reopened; site needed for active collaboration."
                    maxLength={500}
                    rows={3}
                    data-testid="textarea-restore-reason"
                  />
                  <p className="text-xs text-muted-foreground">Recorded in the audit log. {restoreReason.length}/500</p>
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-restore">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={restoreMutation.isPending}
                    onClick={(e) => { e.preventDefault(); restoreMutation.mutate(); }}
                    data-testid="button-confirm-restore"
                  >
                    {restoreMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <ArchiveRestore className="w-3.5 h-3.5 mr-1.5" />}
                    Restore site
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

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
                      {!editMode && (workspace.department || workspace.costCenter || workspace.projectCode) && canWriteBack && (
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

                  {customFieldDefs.length > 0 && (
                    <>
                      <Separator />
                      <div>
                        <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                          <Tags className="w-4 h-4 text-primary" />
                          Custom Fields
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                          {[...customFieldDefs].sort((a, b) => a.sortOrder - b.sortOrder).map((field) => {
                            const value = customFieldValues[field.fieldName];
                            const isEmpty = value === undefined || value === null || value === "";
                            return (
                              <div key={field.id} className="space-y-2" data-testid={`custom-field-${field.fieldName}`}>
                                <Label className="flex justify-between">
                                  {field.fieldLabel} {field.required ? <span className="text-destructive text-xs">Required *</span> : <span className="text-muted-foreground text-xs">(Optional)</span>}
                                </Label>
                                {editMode ? (
                                  field.fieldType === "TEXT" ? (
                                    <Input
                                      value={value || ""}
                                      onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.fieldName]: e.target.value })}
                                      className={`bg-background/50 ${isEmpty && field.required ? 'border-amber-500/50 focus-visible:ring-amber-500' : ''}`}
                                      placeholder={`Enter ${field.fieldLabel.toLowerCase()}...`}
                                      data-testid={`input-custom-${field.fieldName}`}
                                    />
                                  ) : field.fieldType === "SELECT" ? (
                                    <Select
                                      value={value || "__none__"}
                                      onValueChange={(v) => setCustomFieldValues({ ...customFieldValues, [field.fieldName]: v === "__none__" ? "" : v })}
                                    >
                                      <SelectTrigger className={`bg-background/50 ${isEmpty && field.required ? 'border-amber-500/50 focus-visible:ring-amber-500' : ''}`} data-testid={`select-custom-${field.fieldName}`}>
                                        <SelectValue placeholder={`Select ${field.fieldLabel.toLowerCase()}...`} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="__none__" className="text-muted-foreground">— None —</SelectItem>
                                        {(field.options || []).map((opt) => (
                                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : field.fieldType === "NUMBER" ? (
                                    <Input
                                      type="number"
                                      value={value ?? ""}
                                      onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.fieldName]: e.target.value === "" ? "" : Number(e.target.value) })}
                                      className={`bg-background/50 ${isEmpty && field.required ? 'border-amber-500/50 focus-visible:ring-amber-500' : ''}`}
                                      placeholder={`Enter ${field.fieldLabel.toLowerCase()}...`}
                                      data-testid={`input-custom-${field.fieldName}`}
                                    />
                                  ) : field.fieldType === "BOOLEAN" ? (
                                    <div className="h-10 flex items-center gap-3 px-3 rounded-md border border-input bg-background/50">
                                      <Switch
                                        checked={!!value}
                                        onCheckedChange={(v) => setCustomFieldValues({ ...customFieldValues, [field.fieldName]: v })}
                                        data-testid={`switch-custom-${field.fieldName}`}
                                      />
                                      <span className="text-sm">{value ? "Yes" : "No"}</span>
                                    </div>
                                  ) : field.fieldType === "DATE" ? (
                                    <Input
                                      type="date"
                                      value={value || ""}
                                      onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.fieldName]: e.target.value })}
                                      className={`bg-background/50 ${isEmpty && field.required ? 'border-amber-500/50 focus-visible:ring-amber-500' : ''}`}
                                      data-testid={`input-custom-${field.fieldName}`}
                                    />
                                  ) : (
                                    <Input
                                      value={value || ""}
                                      onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.fieldName]: e.target.value })}
                                      className="bg-background/50"
                                      data-testid={`input-custom-${field.fieldName}`}
                                    />
                                  )
                                ) : (
                                  <div className={`h-10 flex items-center px-3 rounded-md bg-muted/50 text-sm ${isEmpty && field.required ? 'border border-amber-500/30 text-amber-500' : ''}`}>
                                    {field.fieldType === "BOOLEAN" ? (
                                      <span>{value ? "Yes" : "No"}</span>
                                    ) : isEmpty ? (
                                      field.required ? (
                                        <span className="italic flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Missing — required</span>
                                      ) : (
                                        <span className="text-muted-foreground">—</span>
                                      )
                                    ) : (
                                      <span>{String(value)}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="libraries" className="mt-4">
              <Card className="glass-panel border-border/50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Library className="w-5 h-5 text-primary" />
                    Document Libraries
                  </CardTitle>
                  <CardDescription>
                    {docLibraries.length > 0
                      ? `${docLibraries.length} document ${docLibraries.length === 1 ? "library" : "libraries"} — ${docLibraries.reduce((s, l) => s + (l.itemCount || 0), 0).toLocaleString()} total items`
                      : "No libraries synced yet. Sync this workspace to discover document libraries."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {docLibraries.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <Library className="w-10 h-10 mx-auto mb-3 opacity-30" />
                      <p>No document libraries found.</p>
                      <p className="text-xs mt-1">Use the Sync button to discover libraries for this site.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {docLibraries.filter(l => !l.hidden).map((lib) => {
                        const storageStr = lib.storageUsedBytes != null
                          ? lib.storageUsedBytes > 1073741824 ? `${(lib.storageUsedBytes / 1073741824).toFixed(1)} GB`
                            : lib.storageUsedBytes > 1048576 ? `${(lib.storageUsedBytes / 1048576).toFixed(0)} MB`
                            : `${(lib.storageUsedBytes / 1024).toFixed(0)} KB`
                          : null;
                        return (
                          <div key={lib.id} className="flex items-center justify-between p-3 rounded-lg border border-border/40 hover:bg-muted/10 transition-colors" data-testid={`lib-row-${lib.id}`}>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                <Library className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  {lib.webUrl ? (
                                    <a href={lib.webUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-sm hover:text-primary transition-colors flex items-center gap-1">
                                      {lib.displayName}
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  ) : (
                                    <span className="font-medium text-sm">{lib.displayName}</span>
                                  )}
                                  {lib.isDefaultDocLib && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                                </div>
                                {lib.description && <p className="text-xs text-muted-foreground mt-0.5">{lib.description}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span title="Items">{(lib.itemCount || 0).toLocaleString()} items</span>
                              {storageStr && <span title="Storage">{storageStr}</span>}
                              {lib.sensitivityLabelId && <Badge variant="secondary" className="text-[10px]">Labeled</Badge>}
                              {lib.lastModifiedAt && <span title="Last modified">{new Date(lib.lastModifiedAt).toLocaleDateString()}</span>}
                            </div>
                          </div>
                        );
                      })}
                      {docLibraries.some(l => l.hidden) && (
                        <details className="mt-3">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            {docLibraries.filter(l => l.hidden).length} hidden {docLibraries.filter(l => l.hidden).length === 1 ? "library" : "libraries"}
                          </summary>
                          <div className="space-y-2 mt-2 opacity-60">
                            {docLibraries.filter(l => l.hidden).map((lib) => (
                              <div key={lib.id} className="flex items-center justify-between p-2 rounded-lg border border-border/20" data-testid={`lib-row-hidden-${lib.id}`}>
                                <div className="flex items-center gap-2">
                                  <Library className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span className="text-xs">{lib.displayName}</span>
                                </div>
                                <span className="text-[10px] text-muted-foreground">{(lib.itemCount || 0)} items</span>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
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
                      { date: "Feb 21, 2026", action: "Workspace provisioned", by: workspace.ownerDisplayName || "System", type: "created" },
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
          <Card className={`border-border/50 ${copilotEligible ? 'bg-gradient-to-br from-emerald-500/5 to-card' : 'bg-gradient-to-br from-card to-card/50'}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Copilot Readiness
                {scoringResult ? (
                  <Badge variant={copilotEligible ? "default" : "destructive"} className={copilotEligible ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
                    {scoringResult.passingCount}/{scoringResult.totalCount} criteria
                  </Badge>
                ) : hasPolicyResults && (
                  <Badge variant={copilotEligible ? "default" : "destructive"} className={copilotEligible ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}>
                    {passCount}/{computedRules.length} Passed
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!hasPolicyResults && !scoringResult ? (
                <div className="flex items-center gap-3 py-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-muted">
                    <ShieldAlert className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground" data-testid="text-copilot-status">No policies evaluated</h4>
                    <p className="text-xs text-muted-foreground">No governance policies have been configured or applied to this workspace yet.</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${copilotEligible ? 'bg-emerald-500/10' : 'bg-muted'}`}>
                      {copilotEligible 
                        ? <ShieldCheck className="w-6 h-6 text-emerald-500" />
                        : <ShieldAlert className="w-6 h-6 text-muted-foreground" />
                      }
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm" data-testid="text-copilot-status">
                        {copilotEligible ? "Copilot Ready" : "Action Required"}
                      </h4>
                      <p className="text-xs text-muted-foreground">
                        {scoringResult
                          ? copilotEligible
                            ? `All ${scoringResult.totalCount} readiness criteria met`
                            : `${scoringResult.blockers.length} criteria failing — resolve to enable`
                          : copilotEligible
                            ? "All governance rules passed"
                            : `${failCount} rule${failCount > 1 ? 's' : ''} failed — resolve to enable`
                        }
                      </p>
                    </div>
                  </div>
                  {scoringResult && scoringResult.blockers.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {scoringResult.blockers.map(b => (
                        <div key={b.key} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-destructive/5" data-testid={`scoring-blocker-${b.key}`}>
                          <ShieldAlert className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                          <div>
                            <span className="font-medium block text-destructive">{b.label}</span>
                            <span className="text-muted-foreground">{b.remediation}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {hasPolicyResults && (
                    <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 mt-1">
                      Governance Policy Rules
                    </p>
                  )}
                  {policyResults?.policies && policyResults.policies.length > 0 ? (
                    <div className="space-y-4">
                      {policyResults.policies.map((pol) => {
                        const polRules = computedRules.filter(r => r.policyName === pol.policyName);
                        const displayName = pol.outcomeName || pol.policyName;
                        return (
                          <div key={pol.policyId} data-testid={`policy-group-${pol.policyId}`}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{displayName}</span>
                              <Badge variant={pol.overallPass ? "default" : "secondary"} className={`text-[10px] px-1.5 py-0 ${pol.overallPass ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                                {pol.overallPass ? "PASS" : "FAIL"}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground ml-auto">{pol.passCount}/{pol.passCount + pol.failCount} rules</span>
                            </div>
                            {polRules.length > 0 && (
                              <div className="space-y-2">
                                {polRules.map((rule, idx) => {
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
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
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
                  )}
                </>
              )}
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
                <span className="font-medium">{getResolvedTemplateLabel(workspace)}</span>
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
                <span className="font-medium">{workspace.siteCreatedDate ? new Date(workspace.siteCreatedDate).toLocaleDateString() : "—"}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
