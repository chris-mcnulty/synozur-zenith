import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
  Search, 
  HardDrive, 
  FileBox, 
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  FolderOpen,
  Database,
  Sparkles,
  Download,
  Filter
} from "lucide-react";

const discoveredSources = [
  {
    id: "SRC-001",
    name: "Finance Legacy Share",
    type: "On-Prem File Share",
    path: "\\\\corp-fs01\\finance",
    size: "4.2 TB",
    fileCount: "1.2M",
    riskLevel: "High",
    sensitiveHits: 4520,
    status: "Scanned",
    lastScan: "2 hours ago"
  },
  {
    id: "SRC-002",
    name: "Marketing Archive 2018",
    type: "SharePoint Server 2016",
    path: "https://sp2016.corp.local/sites/marketing",
    size: "850 GB",
    fileCount: "450K",
    riskLevel: "Medium",
    sensitiveHits: 120,
    status: "Scanning...",
    lastScan: "In progress"
  },
  {
    id: "SRC-003",
    name: "HR Employee Data Backup",
    type: "On-Prem File Share",
    path: "\\\\corp-fs02\\hr-backups",
    size: "1.1 TB",
    fileCount: "85K",
    riskLevel: "Critical",
    sensitiveHits: 12400,
    status: "Scanned",
    lastScan: "1 day ago"
  },
  {
    id: "SRC-004",
    name: "Engineering Specs (Deprecated)",
    type: "SharePoint Server 2019",
    path: "https://sp2019.corp.local/sites/eng-old",
    size: "3.5 TB",
    fileCount: "2.1M",
    riskLevel: "Low",
    sensitiveHits: 15,
    status: "Pending",
    lastScan: "Never"
  }
];

export default function DiscoverDashboard() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">Discover & Migrate</h1>
            <Badge variant="secondary" className="bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20 font-medium">
              Enterprise+
            </Badge>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Catalog unmanaged content across file shares and legacy SharePoint. 
            Analyze oversharing risks via MGDC and plan target M365 migrations.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export MGDC Report
          </Button>
          <Button className="gap-2 shadow-md shadow-primary/20">
            <Database className="w-4 h-4" />
            Add Data Source
          </Button>
        </div>
      </div>

      {/* High-level metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Discovered</CardTitle>
            <HardDrive className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">9.65 <span className="text-lg text-muted-foreground font-normal">TB</span></div>
            <p className="text-xs text-muted-foreground mt-1">Across 4 connected sources</p>
          </CardContent>
        </Card>
        
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unmanaged Files</CardTitle>
            <FileBox className="w-4 h-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">3.8M</div>
            <p className="text-xs text-muted-foreground mt-1">Files pending classification</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">Oversharing Risk</CardTitle>
            <ShieldAlert className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500">17.2k</div>
            <p className="text-xs text-muted-foreground mt-1">Sensitive hits found</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-primary/20 bg-primary/5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-primary">Migration Readiness</CardTitle>
            <Sparkles className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-2">
              <div className="text-3xl font-bold text-foreground">24%</div>
            </div>
            <Progress value={24} className="h-1.5 bg-primary/20" />
            <p className="text-xs text-muted-foreground mt-2">Ready for Purview labeling</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Sources Table */}
        <Card className="glass-panel border-border/50 shadow-xl lg:col-span-2 flex flex-col">
          <CardHeader className="pb-4 border-b border-border/40 bg-muted/10 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderOpen className="w-5 h-5 text-primary" />
              Discovered Sources
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sources..."
                  className="pl-9 h-9 bg-background/50 rounded-lg border-border/50 text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <Filter className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-6">Source Location</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discoveredSources.map((source) => (
                  <TableRow key={source.id} className="hover:bg-muted/10 transition-colors cursor-pointer group">
                    <TableCell className="pl-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-sm">{source.name}</span>
                        <span className="text-xs font-mono text-muted-foreground mt-0.5 truncate max-w-[200px]" title={source.path}>
                          {source.path}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-background font-normal text-xs">
                        {source.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{source.size}</span>
                        <span className="text-xs text-muted-foreground">{source.fileCount} files</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {source.riskLevel === 'Critical' && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                        {source.riskLevel === 'High' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                        {source.riskLevel === 'Medium' && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />}
                        {source.riskLevel === 'Low' && <ShieldAlert className="w-3.5 h-3.5 text-emerald-500" />}
                        <span className={`text-xs font-medium ${
                          source.riskLevel === 'Critical' ? 'text-red-500' : 
                          source.riskLevel === 'High' ? 'text-amber-500' : 
                          source.riskLevel === 'Medium' ? 'text-yellow-500' : 'text-emerald-500'
                        }`}>
                          {source.riskLevel}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100 transition-opacity gap-1 text-primary hover:text-primary hover:bg-primary/10">
                        Classify <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* AI Recommendations Panel */}
        <div className="space-y-6">
          <Card className="glass-panel border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                Zenith Intelligence
              </CardTitle>
              <CardDescription className="text-xs">
                AI-driven analysis of discovered content
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-background/60 p-3 border border-border/50 text-sm">
                <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  High Risk Open Shares
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Found 12,400 files in <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">HR Employee Data Backup</span> matching PII patterns (SSN, DOB) with 'Everyone' read access.
                </p>
                <Button size="sm" variant="outline" className="w-full mt-3 h-8 text-xs">Isolate Content</Button>
              </div>

              <div className="rounded-lg bg-background/60 p-3 border border-border/50 text-sm">
                <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                  <FileBox className="w-4 h-4 text-blue-500" />
                  Migration Candidate
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  <span className="font-mono text-[10px] bg-muted px-1 py-0.5 rounded">Finance Legacy Share</span> has 4.2TB of structured data suitable for automated migration to a new Purview-governed SharePoint site.
                </p>
                <Button size="sm" className="w-full mt-3 h-8 text-xs bg-primary/90">Draft Migration Plan</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">MGDC Batch Sync</CardTitle>
              <CardDescription className="text-xs">
                Microsoft Graph Data Connect status
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium">Oversharing Analytics Pipeline</span>
                    <span className="text-muted-foreground">Last run: Yesterday</span>
                  </div>
                  <Progress value={100} className="h-1.5 bg-muted" />
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-medium">Sensitivity Label Extraction</span>
                    <span className="text-primary animate-pulse">Running (45%)</span>
                  </div>
                  <Progress value={45} className="h-1.5 bg-primary/20" />
                </div>
                <p className="text-[10px] text-muted-foreground pt-2">
                  * MGDC is used exclusively for bulk, read-only extraction and oversharing analysis as per governance policy.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}