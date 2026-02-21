import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Workspace, CopilotRule } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Database
} from "lucide-react";

export default function WorkspaceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();

  const { data: workspace, isLoading, error } = useQuery<Workspace>({
    queryKey: [`/api/workspaces/${id}`],
    enabled: !!id,
  });

  const { data: copilotRules = [] } = useQuery<CopilotRule[]>({
    queryKey: [`/api/workspaces/${id}/copilot-rules`],
    enabled: !!id,
  });

  const [metadata, setMetadata] = useState({
    department: "",
    costCenter: "",
    projectCode: "",
  });

  useEffect(() => {
    if (workspace) {
      setMetadata({
        department: workspace.department || "",
        costCenter: workspace.costCenter || "",
        projectCode: workspace.projectCode || "",
      });
    }
  }, [workspace]);

  const saveMutation = useMutation({
    mutationFn: async (data: { department: string; costCenter: string; projectCode: string }) => {
      const res = await apiRequest("PATCH", `/api/workspaces/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/workspaces/${id}`] });
      toast({ title: "Changes saved", description: "Workspace metadata updated successfully." });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(metadata);
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
            <ArrowLeft className="w-4 h-4" /> Back to Governance
          </Button>
        </Link>
      </div>
    );
  }

  const sensitivityLabel = workspace.sensitivity.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, c => c.toLowerCase());
  const sensitivityVariant = workspace.sensitivity === "HIGHLY_CONFIDENTIAL" ? "destructive" : "secondary";

  const typeLabel = workspace.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, c => c.toLowerCase());

  const computedRules: { ruleName: string; ruleResult: string }[] = copilotRules.length > 0
    ? copilotRules.map(r => ({ ruleName: r.ruleName, ruleResult: r.ruleResult }))
    : [
        { ruleName: "Sensitivity Labeled", ruleResult: workspace.sensitivity ? "PASS" : "FAIL" },
        { ruleName: "Metadata Complete", ruleResult: workspace.metadataStatus === "COMPLETE" ? "PASS" : "FAIL" },
        { ruleName: "Sharing Policy", ruleResult: (!workspace.externalSharing || workspace.sensitivity !== "HIGHLY_CONFIDENTIAL") ? "PASS" : "FAIL" },
      ];

  const rawJson = JSON.stringify(workspace, null, 2);

  const primaryInitials = workspace.primarySteward
    ? workspace.primarySteward.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
    : "??";

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/app/governance">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3" data-testid="text-workspace-name">
            {workspace.displayName} 
            <Badge variant={sensitivityVariant} className={`${sensitivityVariant === "destructive" ? "bg-destructive/10 text-destructive border-destructive/20" : ""} ml-2`} data-testid="badge-sensitivity">{sensitivityLabel}</Badge>
          </h1>
          <p className="text-muted-foreground mt-1 font-mono text-xs" data-testid="text-workspace-id">ID: {workspace.m365ObjectId} • {typeLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Properties & Metadata */}
        <div className="md:col-span-2 space-y-6">
          <Tabs defaultValue="structured" className="w-full">
            <div className="flex items-center justify-between mb-4">
              <TabsList className="bg-muted/50 border border-border/50">
                <TabsTrigger value="structured" className="gap-2"><Settings2 className="w-4 h-4"/> Structured View</TabsTrigger>
                <TabsTrigger value="native" className="gap-2"><Tags className="w-4 h-4"/> Property Bag</TabsTrigger>
                <TabsTrigger value="raw" className="gap-2"><FileJson className="w-4 h-4"/> Raw JSON</TabsTrigger>
                <TabsTrigger value="lifecycle" className="gap-2"><Activity className="w-4 h-4"/> Lifecycle</TabsTrigger>
              </TabsList>
              
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2 text-primary border-primary/30 hover:bg-primary/10">
                  <Wand2 className="w-4 h-4" /> Apply Required Defaults
                </Button>
                <Button onClick={handleSave} disabled={saveMutation.isPending} className="gap-2 shadow-md shadow-primary/20 transition-all" data-testid="button-save">
                  {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : saveMutation.isSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {saveMutation.isSuccess ? "Saved" : "Save Changes"}
                </Button>
              </div>
            </div>

            <TabsContent value="structured">
              <Card className="glass-panel border-border/50">
                <CardHeader>
                  <CardTitle>Governance Metadata</CardTitle>
                  <CardDescription>Structured properties applied across this workspace.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="dept">Department <span className="text-destructive">*</span></Label>
                      <Input 
                        id="dept" 
                        value={metadata.department} 
                        onChange={(e) => setMetadata({...metadata, department: e.target.value})}
                        className="bg-background/50"
                        data-testid="input-department"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cc" className="flex justify-between">
                        Cost Center <span className="text-amber-500 text-xs flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> Required by Policy</span>
                      </Label>
                      <Input 
                        id="cc" 
                        placeholder="Missing value..."
                        value={metadata.costCenter} 
                        onChange={(e) => setMetadata({...metadata, costCenter: e.target.value})}
                        className={`bg-background/50 ${!metadata.costCenter ? 'border-amber-500/50 focus-visible:ring-amber-500' : ''}`}
                        data-testid="input-cost-center"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Data Classification</Label>
                      <Input value={sensitivityLabel} disabled className="bg-muted/50 text-muted-foreground opacity-70" />
                      <p className="text-[10px] text-muted-foreground">Derived from sensitivity label.</p>
                    </div>
                    <div className="space-y-2">
                      <Label>External Sharing</Label>
                      <Input value={workspace.externalSharing ? "Allowed" : "Blocked"} disabled className="bg-muted/50 text-muted-foreground opacity-70" />
                    </div>
                    <div className="space-y-2">
                      <Label>Retention Policy</Label>
                      <Input value={workspace.retentionPolicy} disabled className="bg-muted/50 text-muted-foreground opacity-70" />
                    </div>
                    <div className="space-y-2">
                      <Label>Project Code (Optional)</Label>
                      <Input 
                        value={metadata.projectCode} 
                        onChange={(e) => setMetadata({...metadata, projectCode: e.target.value})}
                        className="bg-background/50"
                        data-testid="input-project-code"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="native">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="glass-panel border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-teal-500" />
                      SharePoint Property Bag
                    </CardTitle>
                    <CardDescription>Raw key-value pairs stored directly on the underlying SharePoint Site.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 py-2 border-b border-border/50">
                        <span className="font-semibold text-sm text-muted-foreground col-span-1">Key</span>
                        <span className="font-semibold text-sm text-muted-foreground col-span-2">Value</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-1.5">
                        <span className="font-mono text-xs col-span-1 break-all text-primary">vti_extenderversion</span>
                        <span className="font-mono text-xs col-span-2 break-all text-muted-foreground">16.0.0.2612</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-1.5">
                        <span className="font-mono text-xs col-span-1 break-all text-primary">vti_defaultlanguage</span>
                        <span className="font-mono text-xs col-span-2 break-all text-muted-foreground">en-us</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-1.5 bg-primary/5 rounded px-2 -mx-2">
                        <span className="font-mono text-xs col-span-1 break-all text-primary">Zenith_DataClass</span>
                        <span className="font-mono text-xs col-span-2 break-all font-medium text-foreground">{sensitivityLabel}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-1.5 bg-primary/5 rounded px-2 -mx-2">
                        <span className="font-mono text-xs col-span-1 break-all text-primary">Zenith_DeptId</span>
                        <span className="font-mono text-xs col-span-2 break-all font-medium text-foreground">{workspace.department || "—"}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-1.5">
                        <span className="font-mono text-xs col-span-1 break-all text-primary">vti_siteusagedata</span>
                        <span className="font-mono text-xs col-span-2 break-all text-muted-foreground">391024;1024</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-panel border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Tags className="w-5 h-5 text-blue-500" />
                      Microsoft Teams Tags
                    </CardTitle>
                    <CardDescription>Tags applied to the associated M365 Group and Team.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold">System Tags</h4>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="font-mono text-xs text-muted-foreground">Teamified</Badge>
                          <Badge variant="secondary" className="font-mono text-xs text-muted-foreground">ExchangeProvisioned</Badge>
                        </div>
                      </div>
                      <div className="space-y-2 pt-2 border-t border-border/40">
                        <h4 className="text-sm font-semibold flex items-center justify-between">
                          Custom Tags
                          <Button variant="ghost" size="sm" className="h-6 text-xs">Edit Tags</Button>
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/5">Project:PHX</Badge>
                          <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/5">Status:Active</Badge>
                          <Badge variant="outline" className="font-mono text-xs border-primary/30 text-primary bg-primary/5">Tier:Tier1</Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            
            <TabsContent value="raw">
              <Card className="glass-panel border-border/50">
                <CardHeader>
                  <CardTitle>JSON Object</CardTitle>
                  <CardDescription>Raw representation of the workspace state and properly bagged metadata.</CardDescription>
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
            
            <TabsContent value="lifecycle">
              <Card className="glass-panel border-border/50">
                <CardHeader>
                  <CardTitle>Lifecycle History</CardTitle>
                  <CardDescription>State transitions and attestation records.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="py-12 text-center text-muted-foreground">
                    Lifecycle log will render here.
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column: Status & Readiness */}
        <div className="space-y-6">
          <Card className="bg-gradient-to-br from-card to-card/50 border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                Ownership
              </CardTitle>
            </CardHeader>
            <CardContent>
              {workspace.primarySteward && (
                <div className="flex items-center gap-4 mb-4" data-testid="text-primary-steward">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    {primaryInitials}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{workspace.primarySteward}</p>
                    <p className="text-xs text-muted-foreground">Primary Steward</p>
                  </div>
                </div>
              )}
              {workspace.secondarySteward && (
                <div className="flex items-center gap-4 mb-4" data-testid="text-secondary-steward">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    {workspace.secondarySteward.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{workspace.secondarySteward}</p>
                    <p className="text-xs text-muted-foreground">Secondary Steward</p>
                  </div>
                </div>
              )}
              {workspace.owners < 2 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-3" data-testid="alert-policy-violation">
                  <ShieldAlert className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-xs text-destructive">
                    <span className="font-semibold block mb-0.5">Policy Violation</span>
                    This workspace requires a minimum of 2 active owners.
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="glass-panel relative overflow-hidden border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Copilot Eligibility</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${workspace.copilotReady ? 'bg-emerald-500/10' : 'bg-muted'}`}>
                  {workspace.copilotReady 
                    ? <ShieldCheck className="w-6 h-6 text-emerald-500" />
                    : <ShieldAlert className="w-6 h-6 text-muted-foreground" />
                  }
                </div>
                <div>
                  <h4 className="font-semibold text-sm" data-testid="text-copilot-status">{workspace.copilotReady ? "Eligible" : "Not Eligible"}</h4>
                  <p className="text-xs text-muted-foreground">{workspace.copilotReady ? "All policy rules passed" : "Blocked by policy rules"}</p>
                </div>
              </div>
              <div className="space-y-2 mt-4">
                {computedRules.map((rule, idx) => {
                  const pass = rule.ruleResult === "PASS";
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs" data-testid={`copilot-rule-${idx}`}>
                      <span className="text-muted-foreground flex items-center gap-1">
                        {pass 
                          ? <CheckCircle2 className="w-3 h-3 text-emerald-500"/>
                          : <ShieldAlert className="w-3 h-3 text-destructive"/>
                        }
                        {rule.ruleName}
                      </span>
                      <span className={pass ? "" : "text-destructive font-medium"}>{pass ? "Pass" : "Fail"}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}