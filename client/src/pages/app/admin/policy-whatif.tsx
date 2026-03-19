import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTenant } from "@/lib/tenant-context";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Play,
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronRight,
  FlaskConical,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Globe,
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
  name: string;
  policyType: string;
  status: string;
  rules: PolicyRule[];
}

interface SimulationResult {
  summary: {
    total: number;
    currentPass: number;
    currentFail: number;
    proposedPass: number;
    proposedFail: number;
    newlyPassing: number;
    newlyFailing: number;
    unchanged: number;
  };
  workspaces: {
    id: string;
    displayName: string;
    siteUrl: string | null;
    type: string;
    currentPass: boolean;
    proposedPass: boolean;
    changeType: "no_change" | "now_passing" | "now_failing";
    currentRules: { ruleName: string; ruleResult: string; ruleDescription: string }[];
    proposedRules: { ruleName: string; ruleResult: string; ruleDescription: string }[];
  }[];
}

type CustomFieldDef = {
  id: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  options: string[] | null;
};

const AVAILABLE_RULE_TYPES = [
  { value: "SENSITIVITY_LABEL_REQUIRED", label: "Sensitivity Label Required", description: "Workspace must have a Purview sensitivity label applied." },
  { value: "DEPARTMENT_REQUIRED", label: "Department Assigned", description: "Workspace must have a department assigned." },
  { value: "DUAL_OWNERSHIP", label: "Dual Ownership", description: "Workspace must have at least two active owners." },
  { value: "METADATA_COMPLETE", label: "Metadata Complete", description: "All required governance metadata fields must be populated." },
  { value: "SHARING_POLICY", label: "Sharing Policy", description: "External sharing policy must align with sensitivity classification." },
  { value: "PROPERTY_BAG_CHECK", label: "Property Bag Check", description: "SharePoint property bag must contain required key-value pairs.", allowMultiple: true },
  { value: "CUSTOM_FIELD_CHECK", label: "Custom Field Check", description: "Evaluate a custom field value against a condition.", allowMultiple: true },
] as const;

const OPERATORS = [
  { value: "EXISTS", label: "Has a value" },
  { value: "NOT_EXISTS", label: "Is empty" },
  { value: "EQUALS", label: "Equals" },
  { value: "NOT_EQUALS", label: "Does not equal" },
  { value: "CONTAINS", label: "Contains" },
  { value: "GREATER_THAN", label: "Greater than" },
  { value: "LESS_THAN", label: "Less than" },
];

function getSiteTypeLabel(t: string) {
  if (t === "TEAM_SITE" || t === "GROUP#0") return "Team";
  if (t === "COMMUNICATION_SITE" || t === "SITEPAGEPUBLISHING#0") return "Comm";
  if (t === "HUB_SITE") return "Hub";
  return t;
}

export default function PolicyWhatIfPage() {
  const { toast } = useToast();
  const { selectedTenant } = useTenant();
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [basePolicyId, setBasePolicyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [filter, setFilter] = useState<"all" | "changes" | "now_passing" | "now_failing">("changes");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const { data: authData } = useQuery<{ user: { organizationId: string }; organization: { id: string } | null; activeOrganizationId: string | null }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });
  const organizationId = authData?.activeOrganizationId ?? authData?.organization?.id;

  const { data: policies = [] } = useQuery<GovernancePolicy[]>({
    queryKey: [`/api/policies?organizationId=${organizationId}`],
    enabled: !!organizationId,
  });

  const { data: customFieldDefs = [] } = useQuery<CustomFieldDef[]>({
    queryKey: [`/api/admin/tenants/${selectedTenant?.id}/custom-fields`],
    enabled: !!selectedTenant?.id,
  });

  const activePolicies = policies.filter(p => p.status === "ACTIVE");

  const loadPolicy = (policy: GovernancePolicy) => {
    setRules(JSON.parse(JSON.stringify(policy.rules)));
    setBasePolicyId(policy.id);
    setLoaded(true);
    setResult(null);
  };

  const simulateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenant?.id) throw new Error("No tenant selected");
      const res = await apiRequest("POST", "/api/policies/simulate", {
        tenantConnectionId: selectedTenant.id,
        rules,
        policyId: basePolicyId,
      });
      return res.json();
    },
    onSuccess: (data: SimulationResult) => {
      setResult(data);
      toast({ title: "Simulation Complete", description: `Evaluated ${data.summary.total} workspaces` });
    },
    onError: (err: Error) => {
      toast({ title: "Simulation Failed", description: err.message, variant: "destructive" });
    },
  });

  const addRule = (ruleType: string) => {
    const ruleDef = AVAILABLE_RULE_TYPES.find(r => r.value === ruleType);
    if (!ruleDef) return;
    const newRule: PolicyRule = {
      ruleType,
      label: ruleDef.label,
      description: ruleDef.description,
      enabled: true,
      config: ruleType === "CUSTOM_FIELD_CHECK" ? { fieldName: "", operator: "EXISTS", value: "", label: ruleDef.label } :
              ruleType === "PROPERTY_BAG_CHECK" ? { key: "", operator: "EQUALS", value: "", label: ruleDef.label } : {},
    };
    setRules(prev => [...prev, newRule]);
    setResult(null);
  };

  const removeRule = (index: number) => {
    setRules(prev => prev.filter((_, i) => i !== index));
    setResult(null);
  };

  const toggleRule = (index: number) => {
    setRules(prev => prev.map((r, i) => i === index ? { ...r, enabled: !r.enabled } : r));
    setResult(null);
  };

  const updateRuleConfig = (index: number, key: string, value: string) => {
    setRules(prev => prev.map((r, i) => {
      if (i !== index) return r;
      const config = { ...(r.config || {}), [key]: value };
      let label = r.label;
      if (r.ruleType === "CUSTOM_FIELD_CHECK" && key === "fieldName") {
        label = `Custom: ${value}`;
        config.label = label;
      }
      if (r.ruleType === "PROPERTY_BAG_CHECK" && key === "key") {
        label = `Property: ${value}`;
        config.label = label;
      }
      return { ...r, config, label };
    }));
    setResult(null);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredWorkspaces = result?.workspaces.filter(ws => {
    if (filter === "all") return true;
    if (filter === "changes") return ws.changeType !== "no_change";
    return ws.changeType === filter;
  }) || [];

  const availableToAdd = AVAILABLE_RULE_TYPES.filter(rt => {
    if ((rt as any).allowMultiple) return true;
    return !rules.some(r => r.ruleType === rt.value);
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <FlaskConical className="w-6 h-6 text-primary" />
            What-If Scenario Planner
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Simulate policy changes and preview their impact on workspaces before applying them.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedTenant && (
            <Badge variant="outline" className="gap-1.5 py-1">
              <Globe className="w-3 h-3" />
              {selectedTenant.domain || selectedTenant.tenantName}
            </Badge>
          )}
        </div>
      </div>

      {!loaded ? (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Select a Policy to Simulate</CardTitle>
          </CardHeader>
          <CardContent>
            {activePolicies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active policies found. Create a policy in the Policy Builder first.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Choose an active policy as your starting point. You can then modify rules and run a simulation to see the impact.</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {activePolicies.map(p => (
                    <button
                      key={p.id}
                      onClick={() => loadPolicy(p)}
                      className="p-4 rounded-xl border border-border/50 bg-card/50 hover:bg-muted/60 hover:border-primary/30 transition-all text-left group"
                      data-testid={`button-load-policy-${p.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-primary" />
                        <span className="font-semibold text-sm">{p.name}</span>
                        <Badge variant="secondary" className="text-[10px] ml-auto">{p.policyType}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{p.rules.filter(r => r.enabled).length} active rules</p>
                      <div className="flex items-center gap-1 mt-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        Load as base <ArrowRight className="w-3 h-3" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="space-y-4">
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    Proposed Rules
                    <Badge variant="outline" className="text-[10px]">{rules.filter(r => r.enabled).length} active</Badge>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => { setLoaded(false); setResult(null); setRules([]); }}
                  >
                    Change Policy
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {rules.map((rule, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border transition-all ${rule.enabled ? "bg-card border-border/50" : "bg-muted/30 border-border/30 opacity-60"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Switch checked={rule.enabled} onCheckedChange={() => toggleRule(idx)} data-testid={`switch-rule-${idx}`} />
                        <span className="text-sm font-medium truncate">{rule.label}</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => removeRule(idx)} data-testid={`button-remove-rule-${idx}`}>
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 pl-9">{rule.description}</p>

                    {rule.ruleType === "CUSTOM_FIELD_CHECK" && rule.enabled && (
                      <div className="mt-2 pl-9 grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[10px] text-muted-foreground block mb-0.5">Field</span>
                          <Select value={rule.config?.fieldName as string || ""} onValueChange={(v) => updateRuleConfig(idx, "fieldName", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Field" /></SelectTrigger>
                            <SelectContent>
                              {customFieldDefs.map(f => (
                                <SelectItem key={f.id} value={f.fieldName}>{f.fieldLabel}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block mb-0.5">Condition</span>
                          <Select value={rule.config?.operator as string || "EXISTS"} onValueChange={(v) => updateRuleConfig(idx, "operator", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {OPERATORS.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block mb-0.5">Value</span>
                          <Input
                            className="h-8 text-xs"
                            value={rule.config?.value as string || ""}
                            onChange={e => updateRuleConfig(idx, "value", e.target.value)}
                            placeholder="Value"
                          />
                        </div>
                      </div>
                    )}

                    {rule.ruleType === "PROPERTY_BAG_CHECK" && rule.enabled && (
                      <div className="mt-2 pl-9 grid grid-cols-3 gap-2">
                        <div>
                          <span className="text-[10px] text-muted-foreground block mb-0.5">Key</span>
                          <Input className="h-8 text-xs" value={rule.config?.key as string || ""} onChange={e => updateRuleConfig(idx, "key", e.target.value)} placeholder="Property key" />
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block mb-0.5">Condition</span>
                          <Select value={rule.config?.operator as string || "EQUALS"} onValueChange={(v) => updateRuleConfig(idx, "operator", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {OPERATORS.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block mb-0.5">Value</span>
                          <Input className="h-8 text-xs" value={rule.config?.value as string || ""} onChange={e => updateRuleConfig(idx, "value", e.target.value)} placeholder="Value" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {availableToAdd.length > 0 && (
                  <Select onValueChange={addRule}>
                    <SelectTrigger className="h-9 text-sm border-dashed" data-testid="button-add-rule">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Plus className="w-4 h-4" /> Add Rule
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {availableToAdd.map(rt => (
                        <SelectItem key={rt.value} value={rt.value}>{rt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Button
                  onClick={() => simulateMutation.mutate()}
                  disabled={simulateMutation.isPending || rules.filter(r => r.enabled).length === 0 || !selectedTenant}
                  className="w-full gap-2"
                  data-testid="button-run-simulation"
                >
                  {simulateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {simulateMutation.isPending ? "Simulating..." : "Run Simulation"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {!result && !simulateMutation.isPending && (
              <Card className="border-border/50 border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <FlaskConical className="w-12 h-12 text-muted-foreground/30 mb-4" />
                  <h3 className="font-semibold text-lg text-muted-foreground">Ready to Simulate</h3>
                  <p className="text-sm text-muted-foreground/70 mt-1 max-w-sm">
                    Modify the rules on the left, then click "Run Simulation" to see how your changes would affect workspace compliance.
                  </p>
                </CardContent>
              </Card>
            )}

            {simulateMutation.isPending && (
              <Card className="border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
                  <p className="text-sm text-muted-foreground">Evaluating all workspaces...</p>
                </CardContent>
              </Card>
            )}

            {result && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="border-border/50 bg-card/50">
                    <CardContent className="p-4 text-center">
                      <p className="text-2xl font-bold" data-testid="text-total-workspaces">{result.summary.total}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Total Workspaces</p>
                    </CardContent>
                  </Card>
                  <Card className="border-border/50 bg-card/50">
                    <CardContent className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <span className="text-lg font-semibold text-muted-foreground">{result.summary.currentPass}</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground/50" />
                        <span className="text-2xl font-bold text-emerald-500" data-testid="text-proposed-pass">{result.summary.proposedPass}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Passing</p>
                    </CardContent>
                  </Card>
                  <Card className={`border-border/50 ${result.summary.newlyPassing > 0 ? "bg-emerald-500/5 border-emerald-500/20" : "bg-card/50"}`}>
                    <CardContent className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                        <span className="text-2xl font-bold text-emerald-500" data-testid="text-newly-passing">{result.summary.newlyPassing}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Newly Passing</p>
                    </CardContent>
                  </Card>
                  <Card className={`border-border/50 ${result.summary.newlyFailing > 0 ? "bg-destructive/5 border-destructive/20" : "bg-card/50"}`}>
                    <CardContent className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <TrendingDown className="w-4 h-4 text-destructive" />
                        <span className="text-2xl font-bold text-destructive" data-testid="text-newly-failing">{result.summary.newlyFailing}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Newly Failing</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="border-border/50">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Impact Details</CardTitle>
                      <div className="flex items-center gap-1">
                        {(["changes", "all", "now_passing", "now_failing"] as const).map(f => (
                          <Button
                            key={f}
                            variant={filter === f ? "default" : "ghost"}
                            size="sm"
                            className={`text-xs h-7 px-2.5 ${filter === f ? "" : "text-muted-foreground"}`}
                            onClick={() => setFilter(f)}
                            data-testid={`button-filter-${f}`}
                          >
                            {f === "changes" ? "Changes Only" : f === "all" ? "All" : f === "now_passing" ? "Newly Passing" : "Newly Failing"}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {filteredWorkspaces.length === 0 ? (
                      <div className="flex flex-col items-center py-8 text-center">
                        <Minus className="w-8 h-8 text-muted-foreground/30 mb-2" />
                        <p className="text-sm text-muted-foreground">
                          {filter === "changes" ? "No workspaces would change status with these rules." : "No workspaces match this filter."}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {filteredWorkspaces.map(ws => {
                          const isExpanded = expandedIds.has(ws.id);
                          return (
                            <div key={ws.id} className="border border-border/30 rounded-lg overflow-hidden">
                              <button
                                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors ${
                                  ws.changeType === "now_passing" ? "bg-emerald-500/5" :
                                  ws.changeType === "now_failing" ? "bg-destructive/5" : ""
                                }`}
                                onClick={() => toggleExpanded(ws.id)}
                                data-testid={`button-expand-${ws.id}`}
                              >
                                {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium text-sm truncate">{ws.displayName}</span>
                                    <Badge variant="outline" className="text-[10px] shrink-0">{getSiteTypeLabel(ws.type)}</Badge>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <Badge
                                    variant={ws.currentPass ? "default" : "destructive"}
                                    className={`text-[10px] ${ws.currentPass ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}
                                  >
                                    {ws.currentPass ? "Pass" : "Fail"}
                                  </Badge>
                                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50" />
                                  <Badge
                                    variant={ws.proposedPass ? "default" : "destructive"}
                                    className={`text-[10px] ${ws.proposedPass ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}
                                  >
                                    {ws.proposedPass ? "Pass" : "Fail"}
                                  </Badge>
                                  {ws.changeType === "now_passing" && <TrendingUp className="w-4 h-4 text-emerald-500" />}
                                  {ws.changeType === "now_failing" && <TrendingDown className="w-4 h-4 text-destructive" />}
                                </div>
                              </button>

                              {isExpanded && (
                                <div className="px-4 pb-4 pt-2 border-t border-border/30 bg-muted/10">
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Current Policy</p>
                                      <div className="space-y-1.5">
                                        {ws.currentRules.length === 0 ? (
                                          <p className="text-xs text-muted-foreground italic">No policy evaluated</p>
                                        ) : ws.currentRules.map((r, i) => (
                                          <div key={i} className="flex items-start gap-1.5 text-xs">
                                            {r.ruleResult === "PASS"
                                              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                              : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                                            }
                                            <span className={r.ruleResult === "FAIL" ? "text-destructive" : ""}>{r.ruleName}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Proposed Policy</p>
                                      <div className="space-y-1.5">
                                        {ws.proposedRules.map((r, i) => (
                                          <div key={i} className="flex items-start gap-1.5 text-xs">
                                            {r.ruleResult === "PASS"
                                              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                              : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
                                            }
                                            <span className={r.ruleResult === "FAIL" ? "text-destructive" : ""}>{r.ruleName}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {filteredWorkspaces.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-3 text-center">
                        Showing {filteredWorkspaces.length} of {result.summary.total} workspaces
                      </p>
                    )}
                  </CardContent>
                </Card>

                {result.summary.newlyFailing > 0 && (
                  <Card className="border-destructive/20 bg-destructive/5">
                    <CardContent className="p-4 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-sm text-destructive">Impact Warning</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {result.summary.newlyFailing} workspace{result.summary.newlyFailing > 1 ? "s" : ""} would lose compliance under this proposed policy.
                          Review the "Newly Failing" list above before applying these changes.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
