import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { 
  Plus, 
  Search, 
  Settings2, 
  FolderGit2, 
  Users, 
  Globe, 
  Hash, 
  ShieldCheck,
  Tag,
  ArrowRight,
  MoreVertical,
  Layers
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Mock Data for Templates
const templates = [
  {
    id: "tpl-1",
    name: "Sales Deal Room",
    description: "Standardized private channel within the main Sales team for tracking enterprise deals.",
    type: "CHANNEL",
    targetTeam: "Global Sales",
    sensitivity: "CONFIDENTIAL",
    active: true,
  },
  {
    id: "tpl-2",
    name: "Department Core Team",
    description: "Full Microsoft Team with standardized General, Leadership, and Social channels.",
    type: "TEAM",
    targetTeam: null,
    sensitivity: "INTERNAL",
    active: true,
  },
  {
    id: "tpl-3",
    name: "Executive Committee",
    description: "Highly restricted SharePoint site with forced sensitivity labels and blocked external sharing.",
    type: "SHAREPOINT_SITE",
    targetTeam: null,
    sensitivity: "HIGHLY_CONFIDENTIAL",
    active: true,
  },
  {
    id: "tpl-4",
    name: "External Client Project",
    description: "Microsoft Team configured to allow external guest access with 90-day retention.",
    type: "TEAM",
    targetTeam: null,
    sensitivity: "CONFIDENTIAL",
    active: false,
  }
];

export default function AdminTemplatesPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'TEAM': return <Users className="w-5 h-5 text-blue-500" />;
      case 'SHAREPOINT_SITE': return <Globe className="w-5 h-5 text-teal-500" />;
      case 'CHANNEL': return <Hash className="w-5 h-5 text-purple-500" />;
      default: return <FolderGit2 className="w-5 h-5" />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Provisioning Templates</h1>
          <p className="text-muted-foreground mt-1">Manage the library of requestable workspace types and their underlying configuration blueprints.</p>
        </div>
        <div className="flex gap-3">
          <Button className="gap-2 rounded-full shadow-md shadow-primary/20">
            <Plus className="w-4 h-4" />
            Create Template
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Template Library */}
        <div className="lg:col-span-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search templates..."
              className="pl-9 h-10 bg-card/50 rounded-xl border-border/50"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
            {templates.map((tpl, i) => (
              <Card key={tpl.id} className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-md ${i === 0 ? 'border-primary ring-1 ring-primary/20 shadow-primary/5 bg-primary/5' : 'bg-card/40 border-border/50'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-background border border-border/50 flex items-center justify-center shadow-sm shrink-0">
                        {getTypeIcon(tpl.type)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm leading-tight">{tpl.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{tpl.type === 'CHANNEL' ? `Channel in ${tpl.targetTeam}` : tpl.type.replace('_', ' ')}</p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Duplicate</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Deactivate</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant={tpl.active ? "default" : "secondary"} className={tpl.active ? "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 shadow-none border-emerald-500/20" : ""}>
                      {tpl.active ? "Active" : "Draft"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      {tpl.sensitivity}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Right Column: Template Designer (Showing Selected) */}
        <div className="lg:col-span-8">
          <Card className="glass-panel border-border/50 shadow-xl h-full flex flex-col">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Selected Template</Badge>
                  </div>
                  <CardTitle className="text-2xl">Sales Deal Room</CardTitle>
                  <CardDescription className="text-base mt-1 max-w-xl">
                    Standardized private channel within the main Sales team for tracking enterprise deals.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Status</span>
                  <Switch checked={true} />
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="p-0 flex-1">
              <Tabs defaultValue="blueprint" className="w-full h-full flex flex-col">
                <div className="px-6 pt-4 border-b border-border/40">
                  <TabsList className="bg-transparent h-10 gap-6 w-full justify-start border-none p-0">
                    <TabsTrigger value="blueprint" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-0 h-10 text-muted-foreground">
                      <Layers className="w-4 h-4 mr-2" /> Blueprint Configuration
                    </TabsTrigger>
                    <TabsTrigger value="properties" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-0 h-10 text-muted-foreground">
                      <Tag className="w-4 h-4 mr-2" /> Required Metadata
                    </TabsTrigger>
                    <TabsTrigger value="policies" className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-0 h-10 text-muted-foreground">
                      <ShieldCheck className="w-4 h-4 mr-2" /> Governance Policies
                    </TabsTrigger>
                  </TabsList>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                  <TabsContent value="blueprint" className="m-0 space-y-8">
                    
                    {/* Core Mapping */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Settings2 className="w-5 h-5 text-primary" />
                        Target Object Mapping
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 rounded-xl border border-border/50 bg-background/50">
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">M365 Artifact Type</Label>
                          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card font-medium">
                            <Hash className="w-4 h-4 text-purple-500" />
                            Private Channel
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-muted-foreground">Target Parent Team</Label>
                          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card font-medium">
                            <Users className="w-4 h-4 text-blue-500" />
                            Global Sales Team (ID: 8a7b...)
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Naming Convention */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Naming Convention</h3>
                      <div className="space-y-3 p-5 rounded-xl border border-border/50 bg-background/50">
                        <div className="flex items-center gap-3">
                          <Input value="DEAL-" className="w-24 bg-card font-mono text-center" disabled />
                          <span className="text-muted-foreground text-sm">+</span>
                          <Input value="[UserInput]" className="flex-1 bg-card font-mono text-primary" disabled />
                          <span className="text-muted-foreground text-sm">+</span>
                          <Input value="-[Year]" className="w-28 bg-card font-mono text-center" disabled />
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <ArrowRight className="w-3 h-3" /> Resulting name will look like: <strong className="text-foreground font-mono bg-muted px-1 rounded">DEAL-ACME_CORP-2026</strong>
                        </p>
                      </div>
                    </div>

                    {/* Structure/Channels (if applicable) */}
                    <div className="space-y-4 opacity-50 pointer-events-none">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Pre-provisioned Channels</h3>
                        <Badge variant="outline">Not applicable for Channel templates</Badge>
                      </div>
                      <div className="p-5 rounded-xl border border-border/50 bg-muted/30 border-dashed">
                        <p className="text-sm text-center text-muted-foreground">Channel structure applies only to Microsoft Team templates.</p>
                      </div>
                    </div>

                  </TabsContent>

                  <TabsContent value="properties" className="m-0">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">Define the specific metadata properties required when a user requests this template.</p>
                        <Button variant="outline" size="sm" className="gap-2">
                          <Plus className="w-3 h-3" /> Add Property
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {[
                          { name: "Client Name", type: "Text", required: true, mapped: "CustomAttribute1" },
                          { name: "Deal Value (Est)", type: "Currency", required: true, mapped: "CustomAttribute2" },
                          { name: "Sales Region", type: "Dropdown (NA, EMEA, APAC)", required: true, mapped: "Department" },
                        ].map((prop, i) => (
                          <div key={i} className="flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm">
                            <div className="flex items-center gap-4">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                                {i + 1}
                              </div>
                              <div>
                                <h4 className="font-semibold text-sm flex items-center gap-2">
                                  {prop.name}
                                  {prop.required && <span className="text-destructive text-xs">*</span>}
                                </h4>
                                <p className="text-xs text-muted-foreground mt-0.5">Type: {prop.type} • Mapped to: <code className="text-[10px] bg-muted px-1 rounded">{prop.mapped}</code></p>
                              </div>
                            </div>
                            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                              <Settings2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="policies" className="m-0">
                    <div className="space-y-6">
                      <p className="text-sm text-muted-foreground">Hardcoded governance policies that cannot be bypassed by the requestor.</p>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                          <div>
                            <h4 className="font-semibold text-sm">Forced Sensitivity Label</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">Automatically apply and lock this label.</p>
                          </div>
                          <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20">Confidential</Badge>
                        </div>
                        
                        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                          <div>
                            <h4 className="font-semibold text-sm">Minimum Active Owners</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">Number of required owners at provisioning.</p>
                          </div>
                          <span className="font-mono font-bold">2</span>
                        </div>

                        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
                          <div>
                            <h4 className="font-semibold text-sm">External Guest Access</h4>
                            <p className="text-xs text-muted-foreground mt-0.5">Can external users be invited?</p>
                          </div>
                          <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20">Blocked</Badge>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
            <CardFooter className="p-4 border-t border-border/40 bg-muted/10 flex justify-end gap-2">
              <Button variant="outline">Discard Changes</Button>
              <Button className="shadow-md shadow-primary/20">Save Template</Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}