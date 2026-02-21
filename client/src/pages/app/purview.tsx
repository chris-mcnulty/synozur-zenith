import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Fingerprint, 
  ShieldCheck, 
  Database, 
  Archive, 
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus,
  RefreshCcw,
  AlertTriangle
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Mocks for visual mappings
const adaptiveScopesMap = [
  { id: 1, zenithCondition: "Department = 'Engineering'", purviewScope: "Engineering Projects DLP Scope", status: "Synced" },
  { id: 2, zenithCondition: "Sensitivity = 'Highly Confidential'", purviewScope: "Executive Info Barriers Scope", status: "Synced" },
  { id: 3, zenithCondition: "ProjectCode starts with 'PHX'", purviewScope: "Project Phoenix Retention Scope", status: "Pending" }
];

const labelMappings = [
  { id: 1, zenithState: "Internal (Default)", purviewLabel: "General - Internal", priority: 1 },
  { id: 2, zenithState: "Confidential", purviewLabel: "Confidential - FTE Only", priority: 2 },
  { id: 3, zenithState: "Highly Confidential", purviewLabel: "Highly Confidential - Executive", priority: 3 }
];

export default function PurviewConfigPage() {
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleForceSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      toast({
        title: "Purview Sync Complete",
        description: "All metadata mappings have been successfully synchronized with Microsoft Purview.",
      });
    }, 1500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purview Orchestration</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Map Zenith's semantic metadata to native Microsoft Purview enforcement engines. Zenith orchestrates the scopes; Purview executes the protection.
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleForceSync} disabled={isSyncing} className="gap-2 shadow-sm shadow-primary/20">
            <RefreshCcw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Force Sync to Purview"}
          </Button>
        </div>
      </div>

      {/* Architecture Info Banner */}
      <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 flex gap-4">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <h4 className="font-semibold text-sm">Orchestration Architecture</h4>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            This module ensures that Purview Adaptive Scopes and Auto-labeling policies are dynamically updated based on the metadata Zenith captures during provisioning and lifecycle events. You do not need to rely on static Active Directory groups.
          </p>
        </div>
      </div>

      <Tabs defaultValue="adaptiveScopes" className="w-full space-y-6">
        <TabsList className="bg-transparent h-12 gap-6 w-full justify-start border-b border-border/50 p-0 rounded-none mb-2">
          <TabsTrigger 
            value="adaptiveScopes" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
          >
            <Fingerprint className="w-4 h-4 mr-2" /> Adaptive DLP Scopes
          </TabsTrigger>
          <TabsTrigger 
            value="sensitivityLabels" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
          >
            <ShieldCheck className="w-4 h-4 mr-2" /> Sensitivity Labels
          </TabsTrigger>
          <TabsTrigger 
            value="retention" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
          >
            <Database className="w-4 h-4 mr-2" /> Retention Mapping
          </TabsTrigger>
          <TabsTrigger 
            value="records" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
          >
            <Archive className="w-4 h-4 mr-2" /> Records Intent
          </TabsTrigger>
        </TabsList>

        {/* Adaptive Scopes Tab */}
        <TabsContent value="adaptiveScopes" className="space-y-6 m-0 animate-in fade-in slide-in-from-bottom-4">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle>Adaptive Scope Mappings</CardTitle>
              <CardDescription>Dynamically build Purview Adaptive Scopes based on Zenith's governed metadata.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {adaptiveScopesMap.map((mapping) => (
                  <div key={mapping.id} className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/10 transition-colors">
                    
                    {/* Zenith Side */}
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Zenith Condition</span>
                      <div className="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 font-mono text-xs text-blue-600 dark:text-blue-400">
                        {mapping.zenithCondition}
                      </div>
                    </div>
                    
                    {/* Orchestration Arrow */}
                    <div className="flex flex-col items-center justify-center shrink-0 px-2 text-muted-foreground">
                      <ArrowRight className="w-5 h-5" />
                      <span className="text-[10px] mt-1 font-medium tracking-wide">Orchestrates</span>
                    </div>

                    {/* Purview Side */}
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Purview Adaptive Scope</span>
                      <div className="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-sm font-medium text-purple-600 dark:text-purple-400 flex items-center justify-between">
                        {mapping.purviewScope}
                        {mapping.status === 'Synced' ? (
                           <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                           <Clock className="w-4 h-4 text-amber-500 animate-pulse" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="bg-muted/10 border-t border-border/40 pt-4 rounded-b-xl">
              <Button variant="outline" className="gap-2 border-dashed w-full">
                <Plus className="w-4 h-4" /> Add Scope Mapping
              </Button>
            </CardFooter>
          </Card>
          
          <div className="grid grid-cols-2 gap-6">
            <Card className="glass-panel border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Targeted Locations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">SharePoint Sites</span>
                    <span className="font-semibold">2,140 scoped</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Exchange Mailboxes</span>
                    <span className="font-semibold">3,050 scoped</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Teams Chat</span>
                    <span className="font-semibold">1,200 scoped</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Orchestration Limits
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-amber-600 dark:text-amber-400 leading-relaxed">
                  Purview takes approximately 24-48 hours to fully populate an Adaptive Scope after Zenith pushes the updated query mapping via Graph API. Policy enforcement may trail metadata changes by this sync window.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sensitivity Labels Tab */}
        <TabsContent value="sensitivityLabels" className="space-y-6 m-0 animate-in fade-in slide-in-from-bottom-4">
           <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle>Label Auto-Assignment Logic</CardTitle>
              <CardDescription>Map Zenith semantic states to specific Microsoft Information Protection labels.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                {labelMappings.map((mapping) => (
                  <div key={mapping.id} className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-muted/10 transition-colors">
                    
                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Zenith Security Tier</span>
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 font-medium text-emerald-600 dark:text-emerald-400 text-sm">
                        {mapping.zenithState}
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center justify-center shrink-0 px-2 text-muted-foreground">
                      <ArrowRight className="w-5 h-5" />
                      <span className="text-[10px] mt-1 font-medium tracking-wide">Applies</span>
                    </div>

                    <div className="flex-1 space-y-1">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Purview Sensitivity Label</span>
                      <div className="p-2.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-sm font-medium text-orange-600 dark:text-orange-400 flex items-center justify-between">
                        {mapping.purviewLabel}
                        <Badge variant="outline" className="bg-background text-orange-500 text-[10px]">Priority: {mapping.priority}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Placeholders for Retention & Records */}
        <TabsContent value="retention" className="m-0">
          <Card className="glass-panel border-border/50 min-h-[300px] flex items-center justify-center">
             <div className="text-center space-y-3">
               <Database className="w-10 h-10 text-muted-foreground mx-auto" />
               <h3 className="font-semibold text-lg">Retention Policy Mapping</h3>
               <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                 Map Zenith workspace expiration rules directly to Purview backend retention policies.
               </p>
             </div>
          </Card>
        </TabsContent>

        <TabsContent value="records" className="m-0">
          <Card className="glass-panel border-border/50 min-h-[300px] flex items-center justify-center">
             <div className="text-center space-y-3">
               <Archive className="w-10 h-10 text-muted-foreground mx-auto" />
               <h3 className="font-semibold text-lg">Records Management Intent</h3>
               <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                 Define enterprise file plans and disposition review rules based on structured content types.
               </p>
             </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}