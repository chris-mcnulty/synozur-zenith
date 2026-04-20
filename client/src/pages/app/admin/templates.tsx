import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Settings2,
  FolderGit2,
  Users,
  Globe,
  ShieldCheck,
  Tag,
  ArrowRight,
  Layers,
  Loader2,
  Clock,
} from "lucide-react";

type ProvisioningTemplate = {
  id: string;
  name: string;
  description: string;
  workspaceType: "TEAM_SITE" | "COMMUNICATION_SITE";
  projectType: "DEAL" | "PORTCO" | "GENERAL";
  namingPrefix: "DEAL-" | "PORTCO-" | "GEN-";
  sensitivity: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "HIGHLY_CONFIDENTIAL";
  externalSharing: boolean;
  teamsConnected: boolean;
  retentionPolicy: string;
  minOwners: number;
  intent: string;
};

const SENSITIVITY_COLORS: Record<string, string> = {
  PUBLIC: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  INTERNAL: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  CONFIDENTIAL: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  HIGHLY_CONFIDENTIAL: "bg-red-500/10 text-red-500 border-red-500/20",
};

function getTypeIcon(type: string) {
  switch (type) {
    case "TEAM_SITE":
      return <Users className="w-5 h-5 text-blue-500" />;
    case "COMMUNICATION_SITE":
      return <Globe className="w-5 h-5 text-teal-500" />;
    default:
      return <FolderGit2 className="w-5 h-5" />;
  }
}

function humanType(type: string): string {
  return type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export default function AdminTemplatesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery<ProvisioningTemplate[]>({
    queryKey: ["provisioning-templates"],
    queryFn: async () => {
      const res = await fetch("/api/provisioning-templates", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch templates");
      return res.json();
    },
  });

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return templates;
    const q = searchTerm.toLowerCase();
    return templates.filter(
      t => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
    );
  }, [templates, searchTerm]);

  const selected = useMemo(() => {
    if (selectedId) return templates.find(t => t.id === selectedId);
    return templates[0];
  }, [templates, selectedId]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Provisioning Templates</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Built-in templates used for governed workspace provisioning. Templates enforce naming
            prefixes, sensitivity posture, retention policy, and dual-ownership rules. Custom
            per-organization templates are on the backlog (BL-011).
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading templates…
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Template list */}
          <div className="lg:col-span-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                className="pl-9 h-10 bg-card/50 rounded-xl border-border/50"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                data-testid="input-search-templates"
              />
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {filtered.map(tpl => {
                const isSelected = (selected?.id ?? filtered[0]?.id) === tpl.id;
                return (
                  <Card
                    key={tpl.id}
                    className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-md ${
                      isSelected
                        ? "border-primary ring-1 ring-primary/20 shadow-primary/5 bg-primary/5"
                        : "bg-card/40 border-border/50"
                    }`}
                    onClick={() => setSelectedId(tpl.id)}
                    data-testid={`card-template-${tpl.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3 mb-2">
                        <div className="w-10 h-10 rounded-lg bg-background border border-border/50 flex items-center justify-center shadow-sm shrink-0">
                          {getTypeIcon(tpl.workspaceType)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-sm leading-tight truncate">{tpl.name}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {humanType(tpl.workspaceType)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${SENSITIVITY_COLORS[tpl.sensitivity] ?? ""}`}
                        >
                          {tpl.sensitivity}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {tpl.namingPrefix}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No templates match your search.</p>
              )}
            </div>
          </div>

          {/* Right: Selected template blueprint */}
          <div className="lg:col-span-8">
            {selected ? (
              <Card className="glass-panel border-border/50 shadow-xl h-full flex flex-col">
                <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                          Built-in Template
                        </Badge>
                      </div>
                      <CardTitle className="text-2xl" data-testid={`text-template-name-${selected.id}`}>{selected.name}</CardTitle>
                      <CardDescription className="text-base mt-1 max-w-2xl">
                        {selected.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-0 flex-1">
                  <Tabs defaultValue="blueprint" className="w-full h-full flex flex-col">
                    <div className="px-6 pt-4 border-b border-border/40">
                      <TabsList className="bg-transparent h-10 gap-6 w-full justify-start border-none p-0">
                        <TabsTrigger
                          value="blueprint"
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-0 h-10 text-muted-foreground"
                        >
                          <Layers className="w-4 h-4 mr-2" /> Blueprint
                        </TabsTrigger>
                        <TabsTrigger
                          value="policies"
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-0 h-10 text-muted-foreground"
                        >
                          <ShieldCheck className="w-4 h-4 mr-2" /> Governance
                        </TabsTrigger>
                        <TabsTrigger
                          value="intent"
                          className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-0 h-10 text-muted-foreground"
                        >
                          <Tag className="w-4 h-4 mr-2" /> Intent
                        </TabsTrigger>
                      </TabsList>
                    </div>

                    <div className="p-6 overflow-y-auto flex-1">
                      <TabsContent value="blueprint" className="m-0 space-y-8">
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Settings2 className="w-5 h-5 text-primary" />
                            Target Object Mapping
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 rounded-xl border border-border/50 bg-background/50">
                            <div className="space-y-2">
                              <Label className="text-muted-foreground">M365 Artifact Type</Label>
                              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card font-medium">
                                {getTypeIcon(selected.workspaceType)}
                                {humanType(selected.workspaceType)}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-muted-foreground">Teams Connectivity</Label>
                              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card font-medium">
                                {selected.teamsConnected ? "Teams-connected" : "SharePoint-only"}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-muted-foreground">Project Type</Label>
                              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card font-medium">
                                {selected.projectType}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-muted-foreground">Min. Owners</Label>
                              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card font-medium">
                                <Users className="w-4 h-4 text-blue-500" /> {selected.minOwners}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold">Naming Convention</h3>
                          <div className="space-y-3 p-5 rounded-xl border border-border/50 bg-background/50">
                            <div className="flex items-center gap-3">
                              <Input
                                value={selected.namingPrefix}
                                className="w-28 bg-card font-mono text-center"
                                disabled
                                data-testid={`text-prefix-${selected.id}`}
                              />
                              <span className="text-muted-foreground text-sm">+</span>
                              <Input value="[UserInput]" className="flex-1 bg-card font-mono text-primary" disabled />
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <ArrowRight className="w-3 h-3" /> Example:{" "}
                              <strong className="text-foreground font-mono bg-muted px-1 rounded">
                                {selected.namingPrefix}ACME-2026
                              </strong>
                            </p>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="policies" className="m-0">
                        <div className="space-y-6">
                          <p className="text-sm text-muted-foreground">
                            Hardcoded governance rules applied automatically at provisioning time.
                          </p>

                          <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                              <div>
                                <h4 className="font-semibold text-sm">Sensitivity Label</h4>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Automatically applied and enforced server-side.
                                </p>
                              </div>
                              <Badge
                                variant="outline"
                                className={SENSITIVITY_COLORS[selected.sensitivity] ?? ""}
                                data-testid={`badge-sensitivity-${selected.id}`}
                              >
                                {selected.sensitivity}
                              </Badge>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                              <div>
                                <h4 className="font-semibold text-sm">Minimum Active Owners</h4>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Dual-ownership enforcement prevents orphaned workspaces.
                                </p>
                              </div>
                              <span className="font-mono font-bold">{selected.minOwners}</span>
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                              <div>
                                <h4 className="font-semibold text-sm">External Sharing</h4>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Default posture — server-side policy still blocks external sharing on
                                  Highly Confidential workspaces regardless of template.
                                </p>
                              </div>
                              {selected.externalSharing ? (
                                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                                  Allowed
                                </Badge>
                              ) : (
                                <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">
                                  Blocked
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                              <div>
                                <h4 className="font-semibold text-sm flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-muted-foreground" /> Retention Policy
                                </h4>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Derived from project type and sensitivity tier.
                                </p>
                              </div>
                              <span className="text-sm font-medium" data-testid={`text-retention-${selected.id}`}>
                                {selected.retentionPolicy}
                              </span>
                            </div>
                          </div>
                        </div>
                      </TabsContent>

                      <TabsContent value="intent" className="m-0">
                        <div className="space-y-4">
                          <h3 className="text-lg font-semibold">When to use this template</h3>
                          <p className="text-base" data-testid={`text-intent-${selected.id}`}>{selected.intent}</p>
                          <div className="p-4 rounded-xl border border-border/50 bg-muted/20 text-xs text-muted-foreground">
                            Templates are code-resident and version-controlled alongside the
                            enforcement rules. A template change requires a Zenith release. Custom
                            per-organization templates are tracked under backlog item BL-011.
                          </div>
                        </div>
                      </TabsContent>
                    </div>
                  </Tabs>
                </CardContent>
                <CardFooter className="p-4 border-t border-border/40 bg-muted/10 flex justify-end gap-2">
                  <Badge variant="outline" className="text-xs">Template ID: {selected.id}</Badge>
                </CardFooter>
              </Card>
            ) : (
              <div className="text-center text-muted-foreground py-24">No template selected.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
