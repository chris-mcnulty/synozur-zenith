import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Network, 
  Search, 
  Plus, 
  FileText, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCcw, 
  Globe, 
  Settings2,
  MoreVertical,
  Activity
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const contentTypes = [
  { id: "CT-01", name: "Corporate Policy", group: "Governance", columns: 8, status: "Published", subscribedSites: 142 },
  { id: "CT-02", name: "Vendor Contract", group: "Legal", columns: 12, status: "Published", subscribedSites: 86 },
  { id: "CT-03", name: "Employee Review", group: "HR", columns: 15, status: "Draft", subscribedSites: 0 },
  { id: "CT-04", name: "Marketing Asset", group: "Marketing", columns: 5, status: "Published", subscribedSites: 215 },
  { id: "CT-05", name: "Project Charter", group: "PMO", columns: 10, status: "Updating", subscribedSites: 54 },
];

const syndicationStatus = [
  { site: "Global Sales Hub", type: "Corporate Policy", status: "Success", lastSync: "10 mins ago" },
  { site: "EMEA Marketing", type: "Marketing Asset", status: "Success", lastSync: "1 hour ago" },
  { site: "Legal Department", type: "Vendor Contract", status: "Success", lastSync: "2 hours ago" },
  { site: "Project Phoenix", type: "Project Charter", status: "Syncing", lastSync: "In Progress" },
  { site: "HR Confidential", type: "Corporate Policy", status: "Error", lastSync: "1 day ago" },
];

const errorReports = [
  { id: "ERR-1042", site: "HR Confidential", type: "Corporate Policy", error: "Column conflict: 'Review Date' already exists as incompatible type.", date: "2026-02-20 14:32" },
  { id: "ERR-1043", site: "R&D Sandbox", type: "Project Charter", error: "Site is currently locked or in read-only mode.", date: "2026-02-19 09:15" },
];

export default function ContentTypesPage() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Type Syndication</h1>
          <p className="text-muted-foreground mt-1">Manage global content types, metadata columns, and monitor publishing status.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <RefreshCcw className="w-4 h-4" />
            Force Sync All
          </Button>
          <Button className="gap-2 shadow-md shadow-primary/20">
            <Plus className="w-4 h-4" />
            New Content Type
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Published Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">24</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">Across 4 hub sites</p>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Subscriptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">1,842</div>
            <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">98% sync success rate</p>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">2</div>
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">Requires admin attention</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="configuration" className="w-full">
        <TabsList className="bg-muted/50 p-1 w-full justify-start rounded-xl h-auto">
          <TabsTrigger value="configuration" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Settings2 className="w-4 h-4 mr-2" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="status" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Activity className="w-4 h-4 mr-2" />
            Syndication Status
          </TabsTrigger>
          <TabsTrigger value="errors" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <AlertCircle className="w-4 h-4 mr-2" />
            Error Reports
            <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full">2</Badge>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="configuration" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Hub Content Types
                  </CardTitle>
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search content types..."
                      className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Name</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead>Site Columns</TableHead>
                      <TableHead>Subscribed Sites</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contentTypes.map((ct) => (
                      <TableRow key={ct.id} className="hover:bg-muted/10 transition-colors">
                        <TableCell className="pl-6 font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            {ct.name}
                          </div>
                        </TableCell>
                        <TableCell>{ct.group}</TableCell>
                        <TableCell>{ct.columns} mapped</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                            {ct.subscribedSites}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={
                            ct.status === 'Published' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                            ct.status === 'Updating' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                            'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                          }>
                            {ct.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="w-4 h-4 text-muted-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>Edit Columns</DropdownMenuItem>
                              <DropdownMenuItem>Manage Publishing</DropdownMenuItem>
                              <DropdownMenuItem>View Subscribers</DropdownMenuItem>
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

          <TabsContent value="status" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Network className="w-5 h-5 text-primary" />
                  Syndication Feed
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Target Site</TableHead>
                      <TableHead>Content Type</TableHead>
                      <TableHead>Last Sync</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {syndicationStatus.map((sync, i) => (
                      <TableRow key={i} className="hover:bg-muted/10 transition-colors">
                        <TableCell className="pl-6 font-medium">{sync.site}</TableCell>
                        <TableCell className="text-muted-foreground">{sync.type}</TableCell>
                        <TableCell className="text-muted-foreground">{sync.lastSync}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {sync.status === 'Success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                            {sync.status === 'Syncing' && <RefreshCcw className="w-4 h-4 text-blue-500 animate-spin" />}
                            {sync.status === 'Error' && <AlertCircle className="w-4 h-4 text-red-500" />}
                            <span className={
                              sync.status === 'Success' ? 'text-emerald-500' :
                              sync.status === 'Syncing' ? 'text-blue-500' :
                              'text-red-500'
                            }>
                              {sync.status}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="errors" className="m-0">
            <Card className="glass-panel border-red-500/20 shadow-xl shadow-red-500/5">
              <CardHeader className="pb-4 border-b border-red-500/10 bg-red-500/5">
                <CardTitle className="text-xl flex items-center gap-2 text-red-500">
                  <AlertCircle className="w-5 h-5" />
                  Active Publishing Errors
                </CardTitle>
                <CardDescription>Resolve these issues to resume content type syndication to affected sites.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {errorReports.map((err) => (
                    <div key={err.id} className="p-6 hover:bg-muted/5 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 font-mono text-xs">{err.id}</Badge>
                            <span className="font-semibold text-foreground">{err.site}</span>
                            <span className="text-muted-foreground text-sm">failed to receive</span>
                            <span className="font-medium text-foreground">{err.type}</span>
                          </div>
                          <p className="text-sm text-red-400/90 bg-red-500/10 p-3 rounded-lg border border-red-500/20 mt-3 inline-block">
                            {err.error}
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">Occurred at: {err.date}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button size="sm" variant="outline">View Site</Button>
                          <Button size="sm">Retry Sync</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
