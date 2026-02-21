import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BrainCircuit, 
  FileText, 
  UploadCloud, 
  Search,
  Activity,
  CheckCircle2,
  AlertCircle,
  MoreHorizontal,
  BarChart3,
  ListTree,
  ArrowRight,
  Database
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";

// Mock Data for Syntex Models
const autofillRules = [
  {
    id: "ar-1",
    modelName: "Master Service Agreement Analyzer",
    targetLibrary: "Legal Contracts Hub",
    mappings: [
      { extracted: "EffectiveDate", targetColumn: "Contract Start Date" },
      { extracted: "VendorName", targetColumn: "Party A" },
      { extracted: "ContractValue", targetColumn: "Total Value" }
    ],
    status: "Active"
  },
  {
    id: "ar-2",
    modelName: "Vendor Invoice Processor",
    targetLibrary: "AP Processing Drop",
    mappings: [
      { extracted: "InvoiceTotal", targetColumn: "Amount Due" },
      { extracted: "VendorId", targetColumn: "Vendor ID" }
    ],
    status: "Active"
  }
];

const models = [
  {
    id: "mod-1",
    name: "Master Service Agreement Analyzer",
    type: "Document Understanding",
    status: "Active",
    accuracy: 94,
    processedCount: 12450,
    libraries: 12,
    lastTrained: "2 weeks ago"
  },
  {
    id: "mod-2",
    name: "Vendor Invoice Processor",
    type: "Prebuilt (Invoice)",
    status: "Active",
    accuracy: 98,
    processedCount: 45210,
    libraries: 34,
    lastTrained: "System Managed"
  },
  {
    id: "mod-3",
    name: "HR Resumes & Offer Letters",
    type: "Document Understanding",
    status: "Needs Training",
    accuracy: 68,
    processedCount: 890,
    libraries: 3,
    lastTrained: "3 months ago"
  },
  {
    id: "mod-4",
    name: "Compliance Attestation Forms",
    type: "Forms Processing",
    status: "Draft",
    accuracy: 0,
    processedCount: 0,
    libraries: 0,
    lastTrained: "Never"
  }
];

export default function SyntexPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'Active': return <Badge variant="default" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20 shadow-none"><CheckCircle2 className="w-3 h-3 mr-1"/> Active</Badge>;
      case 'Needs Training': return <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20 shadow-none"><AlertCircle className="w-3 h-3 mr-1"/> Needs Training</Badge>;
      case 'Draft': return <Badge variant="outline" className="text-muted-foreground border-border/50">Draft</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getAccuracyColor = (score: number) => {
    if (score >= 90) return "bg-emerald-500";
    if (score >= 75) return "bg-amber-500";
    return "bg-destructive";
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Syntex & Content AI</h1>
          <p className="text-muted-foreground mt-1">Configure, deploy, and monitor SharePoint Premium document models.</p>
        </div>
        <div className="flex gap-3">
          <Button className="gap-2 rounded-full shadow-md shadow-primary/20">
            <BrainCircuit className="w-4 h-4" />
            New Model
          </Button>
        </div>
      </div>

      {/* Top Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Files Processed (30d)</CardTitle>
            <FileText className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">58,550</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center">
              <span className="text-emerald-500 font-medium flex items-center mr-1">
                 +24%
              </span> 
              vs last month
            </p>
          </CardContent>
        </Card>
        
        <Card className="glass-panel border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Confidence</CardTitle>
            <Activity className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-500">92%</div>
            <Progress value={92} className="h-2 mt-3 bg-muted overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all duration-1000 ease-in-out" style={{ width: "92%" }} />
            </Progress>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Deployments</CardTitle>
            <UploadCloud className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">49</div>
            <p className="text-xs text-muted-foreground mt-1">
              Libraries actively using models
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="models" className="w-full">
        <TabsList className="bg-transparent h-12 gap-6 w-full justify-start border-b border-border/50 p-0 rounded-none mb-6">
          <TabsTrigger 
            value="models" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
          >
            <BrainCircuit className="w-4 h-4 mr-2" /> Model Directory
          </TabsTrigger>
          <TabsTrigger 
            value="autofill" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
          >
            <ListTree className="w-4 h-4 mr-2" /> Autofill Rules
          </TabsTrigger>
          <TabsTrigger 
            value="reports" 
            className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:text-foreground rounded-none px-1 h-12 text-muted-foreground data-[state=active]:font-semibold"
          >
            <BarChart3 className="w-4 h-4 mr-2" /> Usage Reporting
          </TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="space-y-6 m-0">
          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle>Content Understanding Models</CardTitle>
                <div className="relative w-72">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search models..."
                    className="pl-9 h-9 bg-background/50 rounded-full"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[300px] pl-6">Model Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence / Accuracy</TableHead>
                    <TableHead className="text-right">Deployments</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {models.map((model) => (
                    <TableRow key={model.id} className="group hover:bg-muted/20 transition-colors">
                      <TableCell className="pl-6 font-medium">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-sm">
                            <BrainCircuit className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="text-foreground block leading-tight">{model.name}</span>
                            <span className="text-[10px] text-muted-foreground">Trained: {model.lastTrained}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {model.type}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(model.status)}
                      </TableCell>
                      <TableCell>
                        {model.accuracy > 0 ? (
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold w-8">{model.accuracy}%</span>
                            <Progress value={model.accuracy} className="h-1.5 w-24 bg-muted">
                              <div className={`h-full transition-all duration-1000 ${getAccuracyColor(model.accuracy)}`} style={{ width: `${model.accuracy}%` }} />
                            </Progress>
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        <Badge variant="secondary" className="font-mono">{model.libraries}</Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[180px]">
                            <DropdownMenuLabel>Manage Model</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>Deploy to Library</DropdownMenuItem>
                            <DropdownMenuItem>View Extracted Data</DropdownMenuItem>
                            <DropdownMenuItem>Train & Evaluate</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">Remove Deployments</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="autofill" className="m-0 space-y-6">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle>Metadata Autofill Mappings</CardTitle>
              <CardDescription>Configure how extracted AI values map to SharePoint column properties.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-6">
                {autofillRules.map((rule) => (
                  <div key={rule.id} className="p-4 rounded-xl border border-border/50 bg-background/50">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                          <Database className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm">{rule.targetLibrary}</h4>
                          <p className="text-xs text-muted-foreground">Using Model: {rule.modelName}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">{rule.status}</Badge>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                      {rule.mappings.map((mapping, i) => (
                        <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-border/40 text-sm">
                          <span className="font-mono text-xs text-muted-foreground w-1/2 truncate" title={mapping.extracted}>{mapping.extracted}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 mx-2 shrink-0" />
                          <span className="font-medium text-primary w-1/2 text-right truncate" title={mapping.targetColumn}>{mapping.targetColumn}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="m-0 space-y-6">
          <Card className="glass-panel border-border/50 h-[400px] flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-2">
                <BarChart3 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-semibold">Processing Analytics</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Detailed visualizations of Syntex API consumption, file processing volume by library, and extraction confidence trends will render here.
              </p>
              <Button variant="outline" className="mt-4 rounded-full">Generate CSV Report</Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}