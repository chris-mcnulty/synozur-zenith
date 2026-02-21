import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
  Archive, 
  Search, 
  RefreshCcw, 
  ShieldCheck, 
  HardDrive,
  Clock,
  History,
  AlertTriangle,
  UploadCloud,
  DownloadCloud,
  FileBox,
  Box,
  CheckCircle2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Mock Data
const archiveItems = [
  { id: "ARC-1029", name: "Project Phoenix Team", type: "TEAM", size: "45.2 GB", archivedDate: "2025-11-15", retention: "10 Years", status: "Archived" },
  { id: "ARC-0941", name: "Q1 Financials", type: "SHAREPOINT_SITE", size: "12.8 GB", archivedDate: "2025-04-01", retention: "7 Years", status: "Archived" },
  { id: "ARC-1102", name: "Alpha Partners Extranet", type: "SHAREPOINT_SITE", size: "88.1 GB", archivedDate: "2026-01-20", retention: "7 Years", status: "Restoring" },
  { id: "ARC-0822", name: "Legacy Marketing Assets", type: "M365_GROUP", size: "215.4 GB", archivedDate: "2024-12-10", retention: "Delete", status: "Archived" },
];

const backupPolicies = [
  { id: "POL-01", name: "Executive OneDrive Backup", frequency: "Daily", retention: "1 Year", scope: "Specific Users (45)", lastRun: "2 hours ago", status: "Success" },
  { id: "POL-02", name: "Critical SharePoint Sites", frequency: "Every 12 Hours", retention: "3 Years", scope: "Sensitivity: Highly Confidential", lastRun: "1 hour ago", status: "Success" },
  { id: "POL-03", name: "Standard Teams Backup", frequency: "Weekly", retention: "90 Days", scope: "All Teams", lastRun: "3 days ago", status: "Warning" },
];

export default function ArchiveBackupPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const getTypeIcon = (type: string) => {
    switch(type) {
      case 'TEAM': return <Box className="w-4 h-4 text-blue-500" />;
      case 'SHAREPOINT_SITE': return <FileBox className="w-4 h-4 text-teal-500" />;
      case 'M365_GROUP': return <Archive className="w-4 h-4 text-orange-500" />;
      default: return <Archive className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Archive & Backup</h1>
          <p className="text-muted-foreground mt-1">Manage M365 cold storage, backups, and restoration operations.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <RefreshCcw className="w-4 h-4" />
            Sync Status
          </Button>
          <Button className="gap-2 shadow-md shadow-primary/20">
            <Archive className="w-4 h-4" />
            New Archive Policy
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { title: "Total Archived", value: "4.2 TB", change: "+120 GB this month", icon: <Archive className="w-5 h-5 text-blue-500" /> },
          { title: "Active Backups", value: "14", change: "Across 850 sites", icon: <ShieldCheck className="w-5 h-5 text-emerald-500" /> },
          { title: "Recent Restorations", value: "3", change: "In last 7 days", icon: <History className="w-5 h-5 text-purple-500" /> },
          { title: "Storage Cost Saver", value: "$4,250", change: "Est. monthly savings", icon: <HardDrive className="w-5 h-5 text-green-500" /> },
        ].map((stat, i) => (
          <Card key={i} className="glass-panel border-border/50">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
              <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center">
                {stat.icon}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="flex items-center gap-1 mt-1 text-xs font-medium text-muted-foreground">
                {stat.change}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="archive" className="w-full">
        <TabsList className="bg-muted/50 p-1 w-full justify-start rounded-xl h-auto">
          <TabsTrigger value="archive" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Archive className="w-4 h-4 mr-2" />
            M365 Archive
          </TabsTrigger>
          <TabsTrigger value="backup" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <ShieldCheck className="w-4 h-4 mr-2" />
            Backup Policies
          </TabsTrigger>
          <TabsTrigger value="restore" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <History className="w-4 h-4 mr-2" />
            Restoration Center
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="archive" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-2">
                      <Archive className="w-5 h-5 text-primary" />
                      Cold Storage Vault
                    </CardTitle>
                    <CardDescription className="mt-1">Workspaces moved to low-cost M365 Archive tier.</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Select defaultValue="all">
                      <SelectTrigger className="w-[140px] bg-background/50 border-border/50">
                        <SelectValue placeholder="Filter..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="sites">SharePoint</SelectItem>
                        <SelectItem value="teams">Teams</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="relative w-full sm:w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search archives..."
                        className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Workspace Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Archived Date</TableHead>
                      <TableHead>Retention</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {archiveItems.map((item) => (
                      <TableRow key={item.id} className="hover:bg-muted/10 transition-colors">
                        <TableCell className="pl-6">
                          <div className="font-semibold text-sm">{item.name}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">{item.id}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground text-sm">
                            {getTypeIcon(item.type)}
                            {item.type.replace('_', ' ')}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{item.size}</TableCell>
                        <TableCell className="text-muted-foreground">{item.archivedDate}</TableCell>
                        <TableCell className="text-muted-foreground">{item.retention}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            item.status === 'Archived' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                            'bg-amber-500/10 text-amber-600 border-amber-500/20'
                          }>
                            {item.status === 'Restoring' && <RefreshCcw className="w-3 h-3 mr-1 animate-spin" />}
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Search className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="gap-2">
                                <DownloadCloud className="w-4 h-4" /> Initiate Reactivation
                              </DropdownMenuItem>
                              <DropdownMenuItem className="gap-2">
                                <ShieldCheck className="w-4 h-4" /> View Compliance Properties
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive gap-2">
                                <AlertTriangle className="w-4 h-4" /> Force Delete
                              </DropdownMenuItem>
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

          <TabsContent value="backup" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <CardTitle className="text-xl flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  Protection Policies
                </CardTitle>
                <CardDescription>Scheduled backup jobs for M365 workloads.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Policy Name</TableHead>
                      <TableHead>Target Scope</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead>Retention</TableHead>
                      <TableHead>Last Run</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {backupPolicies.map((policy) => (
                      <TableRow key={policy.id} className="hover:bg-muted/10 transition-colors">
                        <TableCell className="pl-6 font-medium">{policy.name}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{policy.scope}</TableCell>
                        <TableCell>{policy.frequency}</TableCell>
                        <TableCell className="text-muted-foreground">{policy.retention}</TableCell>
                        <TableCell className="text-muted-foreground">{policy.lastRun}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {policy.status === 'Success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                            {policy.status === 'Warning' && <AlertTriangle className="w-4 h-4 text-amber-500" />}
                            <span className={policy.status === 'Success' ? 'text-emerald-500' : 'text-amber-500'}>
                              {policy.status}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm">Edit</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="restore" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl min-h-[400px]">
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle className="text-xl flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  Restoration Operations
                </CardTitle>
                <CardDescription>Monitor ongoing data recovery tasks.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                 <div className="w-20 h-20 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center mx-auto mb-6">
                    <DownloadCloud className="w-8 h-8 text-primary/60" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">No Active Restorations</h3>
                  <p className="max-w-sm">There are currently no items being restored from Archive or Backup. When you initiate a recovery, progress will be tracked here.</p>
                  <Button variant="outline" className="mt-6 gap-2">
                    <Search className="w-4 h-4" /> Find Item to Restore
                  </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}