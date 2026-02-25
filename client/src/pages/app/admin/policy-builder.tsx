import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  ShieldCheck, 
  Plus, 
  Trash2, 
  Save,
  Play,
  Settings2,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileCheck2,
  Pencil
} from "lucide-react";

interface PolicyRule {
  ruleType: string;
  label: string;
  description: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

interface GovernancePolicy {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  policyType: string;
  status: string;
  rules: PolicyRule[];
  propertyBagKey: string | null;
  propertyBagValueFormat: string | null;
  createdAt: string;
  updatedAt: string;
}

const AVAILABLE_RULE_TYPES = [
  { value: "SENSITIVITY_LABEL_REQUIRED", label: "Sensitivity Label Required", description: "Workspace must have a Purview sensitivity label applied." },
  { value: "DEPARTMENT_REQUIRED", label: "Department Assigned", description: "Workspace must have a department assigned." },
  { value: "DUAL_OWNERSHIP", label: "Dual Ownership", description: "Workspace must have at least two active owners." },
  { value: "METADATA_COMPLETE", label: "Metadata Complete", description: "All required governance metadata fields must be populated." },
  { value: "SHARING_POLICY", label: "Sharing Policy", description: "External sharing policy must align with sensitivity classification." },
  { value: "PROPERTY_BAG_CHECK", label: "Property Bag Check", description: "SharePoint property bag must contain required key-value pairs." },
  { value: "ATTESTATION", label: "Attestation (Future)", description: "Workspace owner must attest to governance compliance periodically." },
];

export default function PolicyBuilderPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editStatus, setEditStatus] = useState("ACTIVE");
  const [editRules, setEditRules] = useState<PolicyRule[]>([]);
  const [editPropertyBagKey, setEditPropertyBagKey] = useState("");
  const [editPropertyBagValueFormat, setEditPropertyBagValueFormat] = useState("PASS_FAIL");
  const [hasChanges, setHasChanges] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);

  const { data: authData } = useQuery<{ user: { organizationId: string }; organization: { id: string; name: string; servicePlan: string } | null }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });

  const organizationId = authData?.user?.organizationId;

  const { data: policies, isLoading } = useQuery<GovernancePolicy[]>({
    queryKey: ["/api/policies", organizationId],
    queryFn: () => fetch(`/api/policies?organizationId=${organizationId}`, { credentials: "include" }).then(r => r.ok ? r.json() : []),
    enabled: !!organizationId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; description: string; status: string; rules: PolicyRule[]; propertyBagKey: string; propertyBagValueFormat: string }) => {
      const res = await fetch(`/api/policies/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          status: data.status,
          rules: data.rules,
          propertyBagKey: data.propertyBagKey || null,
          propertyBagValueFormat: data.propertyBagValueFormat,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      setHasChanges(false);
      toast({ title: "Policy saved", description: "Your governance policy has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { organizationId: string; name: string; policyType: string; rules: PolicyRule[] }) => {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (newPolicy: GovernancePolicy) => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      selectPolicy(newPolicy);
      toast({ title: "Policy created", description: "New governance policy has been created." });
    },
    onError: (err: Error) => {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/policies/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
      setSelectedPolicyId(null);
      setHasChanges(false);
      toast({ title: "Policy deleted" });
    },
  });

  function selectPolicy(policy: GovernancePolicy) {
    setSelectedPolicyId(policy.id);
    setEditName(policy.name);
    setEditDescription(policy.description || "");
    setEditStatus(policy.status);
    setEditRules(JSON.parse(JSON.stringify(policy.rules || [])));
    setEditPropertyBagKey(policy.propertyBagKey || "");
    setEditPropertyBagValueFormat(policy.propertyBagValueFormat || "PASS_FAIL");
    setHasChanges(false);
    setShowAddRule(false);
  }

  function markChanged() {
    setHasChanges(true);
  }

  function toggleRule(index: number) {
    const updated = [...editRules];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    setEditRules(updated);
    markChanged();
  }

  function removeRule(index: number) {
    setEditRules(editRules.filter((_, i) => i !== index));
    markChanged();
  }

  function addRule(ruleType: string) {
    const template = AVAILABLE_RULE_TYPES.find(r => r.value === ruleType);
    if (!template) return;
    const alreadyExists = editRules.some(r => r.ruleType === ruleType);
    if (alreadyExists) {
      toast({ title: "Rule already exists", description: `${template.label} is already in this policy.`, variant: "destructive" });
      return;
    }
    setEditRules([...editRules, {
      ruleType: template.value,
      label: template.label,
      description: template.description,
      enabled: true,
    }]);
    setShowAddRule(false);
    markChanged();
  }

  function handleSave() {
    if (!selectedPolicyId) return;
    saveMutation.mutate({ id: selectedPolicyId, name: editName, description: editDescription, status: editStatus, rules: editRules, propertyBagKey: editPropertyBagKey, propertyBagValueFormat: editPropertyBagValueFormat });
  }

  function handleCreateNew() {
    if (!organizationId) return;
    createMutation.mutate({
      organizationId,
      name: "New Governance Policy",
      policyType: "CUSTOM",
      rules: [],
    });
  }

  const selectedPolicy = policies?.find(p => p.id === selectedPolicyId);

  if (!selectedPolicyId && policies && policies.length > 0 && !isLoading) {
    selectPolicy(policies[0]);
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Governance Policy Builder</h1>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20 font-medium">
              Enterprise+
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">Manage composable governance policies with rule-based evaluation for Copilot readiness and compliance.</p>
        </div>
        <div className="flex gap-3">
          {hasChanges && selectedPolicyId && (
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="gap-2 shadow-md shadow-primary/20"
              data-testid="button-save-policy"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Changes
            </Button>
          )}
          <Button variant="outline" onClick={handleCreateNew} disabled={createMutation.isPending} className="gap-2" data-testid="button-create-policy">
            <Plus className="w-4 h-4" />
            New Policy
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : !policies || policies.length === 0 ? (
        <Card className="glass-panel border-border/50">
          <CardContent className="py-16 text-center">
            <ShieldCheck className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Governance Policies</h3>
            <p className="text-muted-foreground mb-6">Create your first governance policy to define rules for Copilot readiness, compliance, and provisioning.</p>
            <Button onClick={handleCreateNew} disabled={createMutation.isPending} className="gap-2" data-testid="button-create-first-policy">
              <Plus className="w-4 h-4" /> Create Policy
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Left Sidebar - Policy List */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2 px-1">Policies ({policies.length})</div>
            {policies.map((policy) => (
              <button
                key={policy.id}
                onClick={() => selectPolicy(policy)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedPolicyId === policy.id
                    ? "bg-primary/10 border-primary/30 shadow-sm"
                    : "bg-card/50 border-border/50 hover:bg-muted/30"
                }`}
                data-testid={`button-select-policy-${policy.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate">{policy.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{policy.policyType.replace(/_/g, " ")}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 text-[10px] ${
                      policy.status === "ACTIVE"
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        : policy.status === "DRAFT"
                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {policy.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                  <FileCheck2 className="w-3 h-3" />
                  {(policy.rules || []).length} rules
                  <span className="mx-1">·</span>
                  {(policy.rules || []).filter(r => r.enabled).length} active
                </div>
              </button>
            ))}
          </div>

          {/* Main Area - Policy Editor */}
          <div className="md:col-span-3 space-y-6">
            {selectedPolicy ? (
              <>
                {/* Policy Settings Header */}
                <Card className="glass-panel border-border/50 shadow-sm">
                  <CardContent className="p-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-muted-foreground">Policy Name</Label>
                        <Input
                          value={editName}
                          onChange={(e) => { setEditName(e.target.value); markChanged(); }}
                          className="h-9 bg-background/50"
                          data-testid="input-policy-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-muted-foreground">Type</Label>
                        <div className="h-9 flex items-center px-3 rounded-md bg-muted/30 border border-border/50 text-sm text-muted-foreground">
                          {selectedPolicy.policyType.replace(/_/g, " ")}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-muted-foreground">Status</Label>
                        <Select value={editStatus} onValueChange={(v) => { setEditStatus(v); markChanged(); }}>
                          <SelectTrigger className="h-9 bg-background/50" data-testid="select-policy-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ACTIVE">Active (Enforcing)</SelectItem>
                            <SelectItem value="DRAFT">Draft (Testing)</SelectItem>
                            <SelectItem value="DISABLED">Disabled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <Label className="text-xs font-semibold uppercase text-muted-foreground">Description</Label>
                      <Textarea
                        value={editDescription}
                        onChange={(e) => { setEditDescription(e.target.value); markChanged(); }}
                        placeholder="Describe what this policy enforces..."
                        className="min-h-[60px] bg-background/50 text-sm resize-none"
                        data-testid="input-policy-description"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Property Bag Writeback */}
                <Card className="glass-panel border-border/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-primary" />
                      Property Bag Writeback
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      When configured, the policy evaluation result will be written to the SharePoint property bag during writeback operations.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-muted-foreground">Property Bag Key</Label>
                        <Input
                          value={editPropertyBagKey}
                          onChange={(e) => { setEditPropertyBagKey(e.target.value); markChanged(); }}
                          placeholder="e.g. ZenithCopilotReady"
                          className="h-9 bg-background/50 font-mono text-sm"
                          data-testid="input-property-bag-key"
                        />
                        <p className="text-[11px] text-muted-foreground">Leave empty to skip writing policy results to the property bag.</p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase text-muted-foreground">Value Format</Label>
                        <Select value={editPropertyBagValueFormat} onValueChange={(v) => { setEditPropertyBagValueFormat(v); markChanged(); }}>
                          <SelectTrigger className="h-9 bg-background/50" data-testid="select-property-bag-format">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PASS_FAIL">PASS / FAIL</SelectItem>
                            <SelectItem value="READY_NOTREADY">Ready / Not Ready</SelectItem>
                            <SelectItem value="SCORE_DATE">PASS|5/5|2026-02-25 (with score and date)</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          {editPropertyBagKey ? (
                            <>Preview: <code className="bg-muted px-1 py-0.5 rounded text-[10px]">{editPropertyBagKey}</code> = <code className="bg-muted px-1 py-0.5 rounded text-[10px]">{editPropertyBagValueFormat === "READY_NOTREADY" ? "Ready" : editPropertyBagValueFormat === "SCORE_DATE" ? `PASS|${editRules.filter(r => r.enabled).length}/${editRules.filter(r => r.enabled).length}|${new Date().toISOString().split("T")[0]}` : "PASS"}</code></>
                          ) : "No property bag key configured — results will only be stored in Zenith."}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Rules List */}
                <Card className="glass-panel border-border/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-primary" />
                        Policy Rules
                        <Badge variant="outline" className="ml-2 text-xs">
                          {editRules.filter(r => r.enabled).length} / {editRules.length} active
                        </Badge>
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {editRules.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground">
                        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-amber-500/50" />
                        <p className="text-sm">No rules defined. Add rules to evaluate workspaces against this policy.</p>
                      </div>
                    ) : (
                      editRules.map((rule, index) => (
                        <div
                          key={`${rule.ruleType}-${index}`}
                          className={`flex items-start gap-4 p-4 rounded-lg border transition-all ${
                            rule.enabled
                              ? "bg-background/80 border-border/50"
                              : "bg-muted/20 border-border/30 opacity-60"
                          }`}
                          data-testid={`rule-row-${rule.ruleType}`}
                        >
                          <div className="pt-0.5">
                            {rule.enabled ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <XCircle className="w-5 h-5 text-muted-foreground/50" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{rule.label}</span>
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {rule.ruleType}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch
                              checked={rule.enabled}
                              onCheckedChange={() => toggleRule(index)}
                              data-testid={`switch-rule-${rule.ruleType}`}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => removeRule(index)}
                              data-testid={`button-remove-rule-${rule.ruleType}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}

                    {/* Add Rule */}
                    {showAddRule ? (
                      <div className="p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5 space-y-3">
                        <div className="text-sm font-medium">Add a Rule</div>
                        <div className="grid gap-2">
                          {AVAILABLE_RULE_TYPES
                            .filter(rt => !editRules.some(r => r.ruleType === rt.value))
                            .map((rt) => (
                              <button
                                key={rt.value}
                                onClick={() => addRule(rt.value)}
                                className="flex items-center gap-3 p-3 rounded-md border border-border/50 bg-background/80 hover:bg-muted/30 transition-colors text-left"
                                data-testid={`button-add-rule-${rt.value}`}
                              >
                                <Plus className="w-4 h-4 text-primary shrink-0" />
                                <div>
                                  <div className="text-sm font-medium">{rt.label}</div>
                                  <div className="text-xs text-muted-foreground">{rt.description}</div>
                                </div>
                              </button>
                            ))}
                        </div>
                        {AVAILABLE_RULE_TYPES.filter(rt => !editRules.some(r => r.ruleType === rt.value)).length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">All available rule types have been added.</p>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setShowAddRule(false)} className="text-muted-foreground">
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-muted-foreground mt-2 border border-dashed border-border/60 w-fit"
                        onClick={() => setShowAddRule(true)}
                        data-testid="button-add-rule"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Rule
                      </Button>
                    )}
                  </CardContent>
                </Card>

                {/* JSON Preview */}
                <Card className="glass-panel border-border/50 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
                      <ChevronRight className="w-4 h-4" />
                      Policy JSON Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="bg-slate-950 text-slate-300 p-4 rounded-xl text-xs font-mono overflow-auto border border-border/50 max-h-[300px]">
                      {JSON.stringify({
                        id: selectedPolicy.id,
                        name: editName,
                        policyType: selectedPolicy.policyType,
                        status: editStatus,
                        propertyBagKey: editPropertyBagKey || null,
                        propertyBagValueFormat: editPropertyBagValueFormat,
                        rules: editRules,
                      }, null, 2)}
                    </pre>
                  </CardContent>
                </Card>

                {/* Delete Policy */}
                {selectedPolicy.policyType !== "COPILOT_READINESS" && (
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this policy?")) {
                          deleteMutation.mutate(selectedPolicy.id);
                        }
                      }}
                      data-testid="button-delete-policy"
                    >
                      <Trash2 className="w-4 h-4" /> Delete Policy
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <Card className="glass-panel border-border/50">
                <CardContent className="py-16 text-center">
                  <Pencil className="w-10 h-10 mx-auto text-muted-foreground/30 mb-4" />
                  <p className="text-muted-foreground">Select a policy from the list to edit its rules.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
