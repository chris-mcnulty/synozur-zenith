import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { 
  ArrowLeft, 
  Users, 
  Globe, 
  FolderGit2, 
  ShieldAlert, 
  Info,
  Loader2,
  CheckCircle2,
  BarChart2,
  BookOpen,
  Infinity,
  Briefcase,
  Building2
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ProvisionNewPage() {
  const [, setLocation] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const [workspaceType, setWorkspaceType] = useState("TEAM");
  const [projectType, setProjectType] = useState("DEAL");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [secondaryOwner, setSecondaryOwner] = useState("");
  const [sensitivity, setSensitivity] = useState("highly_confidential");
  
  // Mock naming policy preview based on Deal/PortCo standards
  const getPolicyPreview = () => {
    if (!name) return "";
    const prefix = projectType === "DEAL" ? "DEAL-" : projectType === "PORTCO" ? "PORTCO-" : "GEN-";
    return `${prefix}${name.replace(/[^a-zA-Z0-9]/g, "-").toUpperCase()}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate submission delay
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
      
      // Redirect to dashboard or requests list after success
      setTimeout(() => {
        setLocation("/app/dashboard");
      }, 2000);
    }, 1500);
  };

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto pt-12 animate-in fade-in zoom-in duration-500">
        <Card className="glass-panel border-emerald-500/20 shadow-lg shadow-emerald-500/5 text-center py-12">
          <CardContent className="space-y-6 flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">Governance Request Submitted</h2>
              <p className="text-muted-foreground max-w-sm mx-auto">
                Your request for <span className="font-semibold text-foreground">{getPolicyPreview()}</span> has been securely logged and is pending automated provisioning.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex items-center gap-4 mb-2">
        <Link href="/app/dashboard">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Governed Workspace Provisioning</h1>
          <p className="text-muted-foreground mt-1">Create Deal & PortCo safe-by-default collaboration spaces.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6">
          
          <Card className="glass-panel border-primary/20 shadow-sm bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <CardTitle>1. Business Context (Required Metadata)</CardTitle>
              <CardDescription>Select the structured context to enforce naming standards and lifecycle.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup defaultValue="DEAL" value={projectType} onValueChange={setProjectType} className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <RadioGroupItem value="DEAL" id="pt-deal" className="peer sr-only" />
                  <Label htmlFor="pt-deal" className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all h-full">
                    <Briefcase className="mb-3 h-6 w-6 text-primary" />
                    <span className="font-semibold text-center">Deal Workspace</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="PORTCO" id="pt-portco" className="peer sr-only" />
                  <Label htmlFor="pt-portco" className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all h-full">
                    <Building2 className="mb-3 h-6 w-6 text-primary" />
                    <span className="font-semibold text-center">Portfolio Company</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="GENERAL" id="pt-gen" className="peer sr-only" />
                  <Label htmlFor="pt-gen" className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all h-full">
                    <FolderGit2 className="mb-3 h-6 w-6 text-muted-foreground" />
                    <span className="font-semibold text-center">General Collaboration</span>
                  </Label>
                </div>
              </RadioGroup>

              <div className="space-y-3">
                <Label htmlFor="name">Entity Name <span className="text-destructive">*</span></Label>
                <Input 
                  id="name" 
                  placeholder={projectType === 'DEAL' ? "e.g. Project Phoenix" : projectType === 'PORTCO' ? "e.g. Acme Corp" : "Workspace Name"} 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-background/80 text-lg"
                />
                
                {name && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/20 mt-2">
                    <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-primary">Naming Standard Applied</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Governed URL & Name: <span className="font-mono bg-background px-1.5 py-0.5 rounded border border-border text-foreground font-medium">{getPolicyPreview()}</span>
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>2. Workspace Type</CardTitle>
              <CardDescription>Select the underlying Microsoft 365 capability.</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup defaultValue="TEAM" value={workspaceType} onValueChange={setWorkspaceType} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <RadioGroupItem value="TEAM" id="type-team" className="peer sr-only" />
                  <Label
                    htmlFor="type-team"
                    className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all h-full"
                  >
                    <Users className="mb-3 h-8 w-8 text-blue-500" />
                    <span className="font-semibold text-center">Microsoft Team</span>
                    <span className="text-[10px] text-muted-foreground mt-1 text-center font-normal">Chat, files, and meetings</span>
                  </Label>
                </div>
                <div>
                  <RadioGroupItem value="SHAREPOINT_SITE" id="type-site" className="peer sr-only" />
                  <Label
                    htmlFor="type-site"
                    className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all h-full"
                  >
                    <Globe className="mb-3 h-8 w-8 text-teal-500" />
                    <span className="font-semibold text-center">SharePoint Site</span>
                    <span className="text-[10px] text-muted-foreground mt-1 text-center font-normal">Intranet and structured document storage</span>
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>3. Ownership & Stewardship</CardTitle>
              <CardDescription>All workspaces require at least two active owners to prevent orphan data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="owner1">Primary Steward <span className="text-destructive">*</span></Label>
                  <Input 
                    id="owner1" 
                    placeholder="Search directory..." 
                    required
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="owner2">Secondary Owner <span className="text-destructive">*</span></Label>
                  <Input 
                    id="owner2" 
                    placeholder="Search directory..." 
                    required
                    value={secondaryOwner}
                    onChange={(e) => setSecondaryOwner(e.target.value)}
                    className="bg-background/50"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 shadow-sm">
            <CardHeader>
              <CardTitle>4. Security & AI Readiness</CardTitle>
              <CardDescription>Purview sensitivity labels determine external sharing rules and Copilot inclusion.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="space-y-3">
                <Label>Sensitivity Label Enforcement <span className="text-destructive">*</span></Label>
                <Select value={sensitivity} onValueChange={setSensitivity}>
                  <SelectTrigger className="w-full bg-background/50">
                    <SelectValue placeholder="Select classification" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public (Open to organization)</SelectItem>
                    <SelectItem value="internal">Internal (Default)</SelectItem>
                    <SelectItem value="confidential">Confidential (Restricted access)</SelectItem>
                    <SelectItem value="highly_confidential">Highly Confidential (Strictly restricted)</SelectItem>
                  </SelectContent>
                </Select>
                
                {sensitivity === 'highly_confidential' && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1.5">
                    <ShieldAlert className="w-3 h-3 text-amber-500" />
                    Highly Confidential prevents external guest sharing and excludes content from general Copilot indexes by default.
                  </p>
                )}
              </div>

              <div className="flex flex-row items-center justify-between rounded-xl border border-border/50 p-4 bg-background/30">
                <div className="space-y-0.5">
                  <Label className="text-base font-semibold">External Sharing</Label>
                  <p className="text-sm text-muted-foreground">
                    Allow inviting external guests (e.g. external counsel, advisors).
                  </p>
                </div>
                <Switch disabled={sensitivity === 'highly_confidential'} checked={sensitivity !== 'highly_confidential'} />
              </div>
            </CardContent>
            <CardFooter className="pt-6 border-t border-border/50 flex justify-end gap-3 bg-muted/10 rounded-b-xl">
              <Button type="button" variant="ghost" onClick={() => setLocation("/app/dashboard")}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !name || !owner || !secondaryOwner} className="shadow-md shadow-primary/20 px-8 gap-2">
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {isSubmitting ? "Provisioning..." : "Provision Governed Workspace"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </form>
    </div>
  );
}