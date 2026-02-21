import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { 
  Fingerprint, 
  ShieldCheck, 
  Database, 
  Archive, 
  FileBox,
  UploadCloud,
  CheckCircle2,
  Clock,
  History
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Mock Data for Purview Configs
const initialConfigs = {
  sensitivityLabels: {
    status: "PUBLISHED",
    lastUpdated: "2 days ago",
    json: JSON.stringify([
      { id: "sl-1", name: "Public", priority: 0 },
      { id: "sl-2", name: "Internal", priority: 1 },
      { id: "sl-3", name: "Confidential", priority: 2 },
      { id: "sl-4", name: "Highly Confidential", priority: 3 }
    ], null, 2)
  },
  adaptiveScopes: {
    status: "DRAFT",
    lastUpdated: "Just now",
    json: JSON.stringify({
      scopes: [
        {
          name: "Project Phoenix Team",
          type: "Group",
          query: "Department -eq 'Engineering' AND ProjectCode -eq 'PHX'"
        }
      ]
    }, null, 2)
  },
  retention: {
    status: "PUBLISHED",
    lastUpdated: "1 month ago",
    json: JSON.stringify({
      policies: [
        { name: "Default 7 Year", days: 2555, action: "Delete" },
        { name: "Executive 10 Year", days: 3650, action: "Delete" }
      ]
    }, null, 2)
  },
  records: {
    status: "DRAFT",
    lastUpdated: "5 hours ago",
    json: JSON.stringify({
      filePlan: [
        { code: "HR-01", description: "Employee Records", disposition: "Review" }
      ]
    }, null, 2)
  }
};

export default function PurviewConfigPage() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState(initialConfigs);
  const [activeTab, setActiveTab] = useState("sensitivityLabels");
  const [isPublishing, setIsPublishing] = useState(false);

  const handleJsonChange = (tab: keyof typeof configs, value: string) => {
    setConfigs({
      ...configs,
      [tab]: {
        ...configs[tab],
        json: value,
        status: "DRAFT",
        lastUpdated: "Just now"
      }
    });
  };

  const handlePublish = (tab: keyof typeof configs) => {
    setIsPublishing(true);
    
    // Simulate API call to publish to Purview (mock)
    setTimeout(() => {
      setConfigs({
        ...configs,
        [tab]: {
          ...configs[tab],
          status: "PUBLISHED",
          lastUpdated: "Just now"
        }
      });
      setIsPublishing(false);
      
      toast({
        title: "Configuration Published",
        description: `The ${tab} configuration has been published to Microsoft Purview.`,
        duration: 3000,
      });
    }, 1500);
  };

  const renderConfigTab = (
    tabKey: keyof typeof configs, 
    title: string, 
    description: string, 
    icon: React.ReactNode
  ) => {
    const config = configs[tabKey];
    const isDraft = config.status === "DRAFT";

    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left: Editor */}
          <Card className="glass-panel border-border/50 shadow-lg flex-1">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {icon}
                  <CardTitle>{title}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={isDraft ? "secondary" : "default"} className={isDraft ? "bg-amber-500/10 text-amber-500 hover:bg-amber-500/20" : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 shadow-none border-emerald-500/20"}>
                    {isDraft ? <Clock className="w-3 h-3 mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                    {config.status}
                  </Badge>
                </div>
              </div>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea 
                className="font-mono text-sm h-[400px] bg-background/80 resize-y p-4 border-border/50 focus-visible:ring-primary/50 shadow-inner"
                value={config.json}
                onChange={(e) => handleJsonChange(tabKey, e.target.value)}
                spellCheck={false}
              />
            </CardContent>
            <CardFooter className="pt-4 border-t border-border/50 bg-muted/10 flex justify-between rounded-b-xl">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <History className="w-3 h-3" /> Last updated: {config.lastUpdated}
              </div>
              <Button 
                onClick={() => handlePublish(tabKey)} 
                disabled={!isDraft || isPublishing}
                className="shadow-md shadow-primary/20 gap-2"
              >
                {isPublishing ? (
                  <>Publishing...</>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    Publish to Purview
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>

          {/* Right: Info Panel */}
          <div className="w-full md:w-80 space-y-6">
            <Card className="bg-gradient-to-br from-card to-card/50 border-border/50">
              <CardHeader>
                <CardTitle className="text-base">Sync Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Tenant Connectivity</span>
                    <span className="text-emerald-500 font-medium flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> Healthy</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Graph API Tokens</span>
                    <span className="text-emerald-500 font-medium">Valid</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Sync</span>
                    <span className="font-mono text-xs">Today, 08:30 AM</span>
                  </div>
                </div>
                
                {isDraft && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-600/90 dark:text-amber-500 mt-4">
                    <span className="font-semibold block mb-1">Unpublished Changes</span>
                    You have modified the JSON payload. Click Publish to push these changes to Microsoft Purview.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="glass-panel border-border/50">
              <CardHeader>
                <CardTitle className="text-base">JSON Schema</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                  Zenith maintains a declarative representation of your Purview configurations. 
                  When you publish, we translate this JSON payload into the corresponding Microsoft Graph API calls.
                </p>
                <Button variant="outline" size="sm" className="w-full text-xs">
                  View Schema Documentation
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Purview Configuration</h1>
          <p className="text-muted-foreground mt-1">Manage Microsoft 365 compliance and security labels as code.</p>
        </div>
      </div>

      <Tabs defaultValue="sensitivityLabels" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-transparent h-12 gap-6 w-full justify-start border-b border-border/50 p-0 rounded-none mb-6">
          <TabsTrigger 
            value="sensitivityLabels" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
          >
            <ShieldCheck className="w-4 h-4 mr-2" /> Sensitivity Labels
          </TabsTrigger>
          <TabsTrigger 
            value="adaptiveScopes" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
          >
            <Fingerprint className="w-4 h-4 mr-2" /> Adaptive DLP Scopes
          </TabsTrigger>
          <TabsTrigger 
            value="retention" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
          >
            <Database className="w-4 h-4 mr-2" /> Retention
          </TabsTrigger>
          <TabsTrigger 
            value="records" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
          >
            <Archive className="w-4 h-4 mr-2" /> Records Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sensitivityLabels" className="m-0">
          {renderConfigTab(
            "sensitivityLabels", 
            "Sensitivity Labels", 
            "Define the hierarchy and protection settings for your M365 information protection labels.",
            <ShieldCheck className="w-5 h-5 text-primary" />
          )}
        </TabsContent>
        
        <TabsContent value="adaptiveScopes" className="m-0">
          {renderConfigTab(
            "adaptiveScopes", 
            "Adaptive DLP Scopes", 
            "Dynamically target policies to users, groups, or sites based on attributes.",
            <Fingerprint className="w-5 h-5 text-purple-500" />
          )}
        </TabsContent>

        <TabsContent value="retention" className="m-0">
          {renderConfigTab(
            "retention", 
            "Retention Policies", 
            "Configure how long data is kept across Exchange, SharePoint, and Teams.",
            <Database className="w-5 h-5 text-blue-500" />
          )}
        </TabsContent>

        <TabsContent value="records" className="m-0">
          {renderConfigTab(
            "records", 
            "Records Management", 
            "Define your enterprise file plan and disposition review rules.",
            <Archive className="w-5 h-5 text-amber-500" />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}