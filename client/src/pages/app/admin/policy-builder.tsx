import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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
import { 
  ShieldAlert, 
  Plus, 
  Trash2, 
  GripVertical,
  ArrowRight,
  Save,
  Play,
  FileCheck2,
  Users,
  Building2,
  Settings2,
  AlertTriangle
} from "lucide-react";

export default function PolicyBuilderPage() {
  const [activeTab, setActiveTab] = useState("rules");

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">Governance Policy Builder</h1>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20 font-medium">
              Enterprise+
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1">Design and test declarative rules for M365 provisioning, lifecycle, and Copilot eligibility.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 text-muted-foreground">
            <Play className="w-4 h-4" />
            Test Policy Simulator
          </Button>
          <Button className="gap-2 shadow-md shadow-primary/20">
            <Save className="w-4 h-4" />
            Save & Publish Draft
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Left Sidebar - Policy Settings */}
        <div className="space-y-6">
          <Card className="glass-panel border-border/50 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-primary" />
                Policy Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Policy Name</Label>
                <Input defaultValue="Highly Confidential Data Safeguard" className="h-9 bg-background/50" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Description</Label>
                <Textarea 
                  defaultValue="Mandates strict external sharing controls and blocks Copilot access for any workspace tagged as highly confidential." 
                  className="min-h-[80px] bg-background/50 text-sm resize-none" 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Status</Label>
                <Select defaultValue="draft">
                  <SelectTrigger className="h-9 bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft (Testing)</SelectItem>
                    <SelectItem value="active">Active (Enforcing)</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="w-4 h-4 text-primary" />
                Scope & Target
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Environment</Label>
                <Select defaultValue="prod">
                  <SelectTrigger className="h-9 bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Environments</SelectItem>
                    <SelectItem value="prod">Production Only</SelectItem>
                    <SelectItem value="sandbox">Sandbox / UAT</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">Workspace Types</Label>
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="t-team" className="text-sm font-normal">Microsoft Teams</Label>
                    <Switch id="t-team" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="t-site" className="text-sm font-normal">SharePoint Sites</Label>
                    <Switch id="t-site" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="t-loop" className="text-sm font-normal text-muted-foreground">Loop Workspaces</Label>
                    <Switch id="t-loop" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="t-copilot" className="text-sm font-normal text-muted-foreground">Copilot Notebooks</Label>
                    <Switch id="t-copilot" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Area - Rules Engine */}
        <div className="md:col-span-3 space-y-6">
          <Card className="glass-panel border-border/50 shadow-xl min-h-[600px] flex flex-col">
            <div className="border-b border-border/40 bg-muted/10 p-2 flex gap-2">
              <Button 
                variant={activeTab === 'rules' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setActiveTab('rules')}
                className={activeTab === 'rules' ? 'bg-background shadow-sm' : ''}
              >
                Rules Engine
              </Button>
              <Button 
                variant={activeTab === 'json' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setActiveTab('json')}
                className={activeTab === 'json' ? 'bg-background shadow-sm' : ''}
              >
                JSON Payload
              </Button>
            </div>
            
            <CardContent className="p-6 flex-1 bg-gradient-to-br from-background to-muted/5">
              
              {activeTab === 'rules' ? (
                <div className="space-y-8">
                  {/* IF Condition Block */}
                  <div className="space-y-4 relative">
                    <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-border/50 -z-10" />
                    
                    <div className="flex items-center gap-3">
                      <div className="bg-primary/20 text-primary font-bold px-3 py-1 rounded-md text-sm border border-primary/20 shadow-sm">IF</div>
                      <span className="text-sm text-muted-foreground font-medium uppercase tracking-wide">All of these conditions match</span>
                    </div>

                    <div className="space-y-3 pl-8">
                      {/* Condition 1 */}
                      <div className="flex items-center gap-3 group">
                        <GripVertical className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground cursor-grab" />
                        <div className="flex-1 grid grid-cols-12 gap-2 bg-background/80 border border-border/50 p-2 rounded-lg shadow-sm">
                          <Select defaultValue="sensitivity">
                            <SelectTrigger className="col-span-4 h-9 border-none bg-muted/30">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="sensitivity">Sensitivity Label</SelectItem>
                              <SelectItem value="department">Department</SelectItem>
                              <SelectItem value="type">Workspace Type</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select defaultValue="equals">
                            <SelectTrigger className="col-span-3 h-9 border-none bg-muted/30">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="equals">Equals</SelectItem>
                              <SelectItem value="not_equals">Does Not Equal</SelectItem>
                              <SelectItem value="contains">Contains</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select defaultValue="highly_confidential">
                            <SelectTrigger className="col-span-5 h-9 border-none bg-muted/30">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="highly_confidential">Highly Confidential</SelectItem>
                              <SelectItem value="confidential">Confidential</SelectItem>
                              <SelectItem value="internal">Internal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Condition 2 */}
                      <div className="flex items-center gap-3 group">
                        <GripVertical className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground cursor-grab" />
                        <div className="flex-1 grid grid-cols-12 gap-2 bg-background/80 border border-border/50 p-2 rounded-lg shadow-sm">
                          <Select defaultValue="external_sharing">
                            <SelectTrigger className="col-span-4 h-9 border-none bg-muted/30">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="external_sharing">External Sharing</SelectItem>
                              <SelectItem value="guest_access">Guest Access</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select defaultValue="is">
                            <SelectTrigger className="col-span-3 h-9 border-none bg-muted/30">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="is">Is set to</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select defaultValue="enabled">
                            <SelectTrigger className="col-span-5 h-9 border-none bg-muted/30">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="enabled">Enabled (True)</SelectItem>
                              <SelectItem value="disabled">Disabled (False)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground mt-2 border border-dashed border-border/60 w-fit">
                        <Plus className="w-3.5 h-3.5" /> Add Condition
                      </Button>
                    </div>
                  </div>

                  {/* THEN Action Block */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold px-3 py-1 rounded-md text-sm border border-emerald-500/20 shadow-sm">THEN</div>
                      <span className="text-sm text-muted-foreground font-medium uppercase tracking-wide">Enforce these actions</span>
                    </div>

                    <div className="space-y-3 pl-8">
                      {/* Action 1 */}
                      <div className="flex items-center gap-3 group">
                        <ArrowRight className="w-4 h-4 text-emerald-500/50 shrink-0" />
                        <div className="flex-1 grid grid-cols-12 gap-2 bg-emerald-500/5 border border-emerald-500/20 p-2 rounded-lg shadow-sm">
                          <Select defaultValue="block_provisioning">
                            <SelectTrigger className="col-span-5 h-9 border-none bg-background/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="block_provisioning">Block Provisioning</SelectItem>
                              <SelectItem value="require_approval">Require Manager Approval</SelectItem>
                              <SelectItem value="disable_external">Force Disable External Sharing</SelectItem>
                              <SelectItem value="disable_copilot">Exclude from Copilot Scopes</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="col-span-7 flex items-center px-3 text-sm text-muted-foreground bg-background/30 rounded-md">
                            Workspace creation will be halted with a policy violation warning.
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {/* Action 2 */}
                      <div className="flex items-center gap-3 group">
                        <ArrowRight className="w-4 h-4 text-emerald-500/50 shrink-0" />
                        <div className="flex-1 grid grid-cols-12 gap-2 bg-emerald-500/5 border border-emerald-500/20 p-2 rounded-lg shadow-sm">
                          <Select defaultValue="notify_admin">
                            <SelectTrigger className="col-span-5 h-9 border-none bg-background/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="notify_admin">Alert Security Admins</SelectItem>
                              <SelectItem value="log_audit">Log to Purview Audit</SelectItem>
                            </SelectContent>
                          </Select>
                          <div className="col-span-7 flex items-center px-3 text-sm text-muted-foreground bg-background/30 rounded-md">
                            Via Teams Adaptive Card
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <Button variant="ghost" size="sm" className="gap-2 text-emerald-600 dark:text-emerald-500 mt-2 border border-dashed border-emerald-500/30 w-fit hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400">
                        <Plus className="w-3.5 h-3.5" /> Add Enforcement Action
                      </Button>
                    </div>
                  </div>
                  
                  <div className="mt-8 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-600 dark:text-amber-400 leading-relaxed">
                      <span className="font-semibold block mb-1">Purview Integration Note</span>
                      Zenith translates this declarative policy into native Microsoft Purview Adaptive Scopes and Information Barriers. Zenith itself does not sit in the data path.
                    </div>
                  </div>

                </div>
              ) : (
                <div className="h-full">
                  <pre className="h-full bg-slate-950 text-slate-300 p-4 rounded-xl text-xs font-mono overflow-auto border border-border/50">
{`{
  "policyId": "pol_7b9x2m4q",
  "name": "Highly Confidential Data Safeguard",
  "status": "DRAFT",
  "scope": {
    "environments": ["PROD"],
    "resourceTypes": ["TEAM", "SHAREPOINT_SITE"]
  },
  "conditions": {
    "operator": "AND",
    "rules": [
      {
        "field": "metadata.sensitivity",
        "operator": "EQUALS",
        "value": "HIGHLY_CONFIDENTIAL"
      },
      {
        "field": "settings.externalSharing",
        "operator": "EQUALS",
        "value": true
      }
    ]
  },
  "enforcement": {
    "actions": [
      {
        "type": "BLOCK_PROVISIONING",
        "message": "Highly confidential workspaces cannot allow external guests."
      },
      {
        "type": "NOTIFY_SECURITY_ADMINS",
        "channel": "TEAMS_WEBHOOK"
      }
    ]
  }
}`}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}