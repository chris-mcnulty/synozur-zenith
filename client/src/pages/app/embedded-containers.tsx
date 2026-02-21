import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { 
  Box, 
  Search, 
  Plus, 
  Database,
  ArrowUpRight,
  Settings2,
  HardDrive,
  Users,
  Activity,
  ShieldAlert,
  MoreVertical,
  Link as LinkIcon
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const containerTypes = [
  { id: "CTYPE-01", name: "Client Portal Application", appId: "c8a4...", containers: 142, storageLimit: "100 GB" },
  { id: "CTYPE-02", name: "Internal HR Knowledge Base", appId: "f9b2...", containers: 1, storageLimit: "500 GB" },
  { id: "CTYPE-03", name: "Partner Extranet", appId: "3e7d...", containers: 45, storageLimit: "250 GB" },
  { id: "CTYPE-04", name: "Custom CRM Integration", appId: "a1c9...", containers: 812, storageLimit: "50 GB" },
];

const activeContainers = [
  { id: "CONT-8492", name: "Acme Corp Portal", type: "Client Portal Application", storage: 42.5, limit: 100, status: "Active", permissions: "Custom App Role" },
  { id: "CONT-8493", name: "Stark Ind Portal", type: "Client Portal Application", storage: 98.1, limit: 100, status: "Warning", permissions: "Custom App Role" },
  { id: "CONT-1004", name: "Q1 Benefits Docs", type: "Internal HR Knowledge Base", storage: 12.4, limit: 500, status: "Active", permissions: "Inherited" },
  { id: "CONT-3391", name: "Alpha Partners", type: "Partner Extranet", storage: 210.5, limit: 250, status: "Active", permissions: "Custom App Role" },
  { id: "CONT-9912", name: "CRM-OPP-1482", type: "Custom CRM Integration", storage: 2.1, limit: 50, status: "Active", permissions: "System Account" },
];

export default function EmbeddedContainersPage() {
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">SharePoint Embedded</h1>
          <p className="text-muted-foreground mt-1">Manage headless SharePoint containers, custom applications, and API consumption.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2">
            <LinkIcon className="w-4 h-4" />
            Register App ID
          </Button>
          <Button className="gap-2 shadow-md shadow-primary/20">
            <Plus className="w-4 h-4" />
            New Container Type
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { title: "Total Containers", value: "1,000+", change: "+124 this month", icon: <Box className="w-5 h-5 text-blue-500" /> },
          { title: "Total Storage", value: "8.4 TB", change: "64% of quota", icon: <HardDrive className="w-5 h-5 text-purple-500" /> },
          { title: "API Calls (30d)", value: "2.4M", change: "+12% vs last month", icon: <Activity className="w-5 h-5 text-emerald-500" /> },
          { title: "Registered Apps", value: "4", change: "All healthy", icon: <Database className="w-5 h-5 text-orange-500" /> },
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

      <Tabs defaultValue="containers" className="w-full">
        <TabsList className="bg-muted/50 p-1 w-full justify-start rounded-xl h-auto">
          <TabsTrigger value="containers" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Box className="w-4 h-4 mr-2" />
            Active Containers
          </TabsTrigger>
          <TabsTrigger value="types" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Settings2 className="w-4 h-4 mr-2" />
            Container Types
          </TabsTrigger>
          <TabsTrigger value="billing" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
            <Activity className="w-4 h-4 mr-2" />
            Consumption & Billing
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="containers" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Box className="w-5 h-5 text-primary" />
                    Embedded Containers
                  </CardTitle>
                  <div className="flex gap-2">
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search container ID or name..."
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
                      <TableHead className="pl-6">Container ID / Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-[200px]">Storage Used</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeContainers.map((container) => {
                      const percentUsed = (container.storage / container.limit) * 100;
                      const isNearLimit = percentUsed > 90;
                      
                      return (
                        <TableRow key={container.id} className="hover:bg-muted/10 transition-colors">
                          <TableCell className="pl-6">
                            <div className="font-semibold text-sm">{container.name}</div>
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">{container.id}</div>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{container.type}</TableCell>
                          <TableCell>
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-xs">
                                <span className={isNearLimit ? "text-red-500 font-medium" : "text-muted-foreground"}>
                                  {container.storage} GB
                                </span>
                                <span className="text-muted-foreground">{container.limit} GB</span>
                              </div>
                              <Progress 
                                value={percentUsed} 
                                className="h-1.5" 
                                indicatorColor={isNearLimit ? "bg-red-500" : "bg-primary"}
                              />
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-muted-foreground" />
                              <span className="text-sm">{container.permissions}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              container.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                              'bg-orange-500/10 text-orange-600 border-orange-500/20'
                            }>
                              {container.status === 'Warning' && <ShieldAlert className="w-3 h-3 mr-1" />}
                              {container.status}
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
                                <DropdownMenuItem>Manage Permissions</DropdownMenuItem>
                                <DropdownMenuItem>Increase Quota</DropdownMenuItem>
                                <DropdownMenuItem>View API Logs</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive">Delete Container</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="types" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-primary" />
                  Container Types
                </CardTitle>
                <CardDescription>Logical groupings that define default storage quotas and billing meters.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/30">
                    <TableRow>
                      <TableHead className="pl-6">Type Name</TableHead>
                      <TableHead>Associated App ID</TableHead>
                      <TableHead>Active Containers</TableHead>
                      <TableHead>Default Quota</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {containerTypes.map((type) => (
                      <TableRow key={type.id} className="hover:bg-muted/10 transition-colors">
                        <TableCell className="pl-6 font-medium">{type.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground font-mono text-sm">
                            {type.appId}
                            <ArrowUpRight className="w-3 h-3 hover:text-primary cursor-pointer" />
                          </div>
                        </TableCell>
                        <TableCell>{type.containers}</TableCell>
                        <TableCell>{type.storageLimit}</TableCell>
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

          <TabsContent value="billing" className="m-0">
            <Card className="glass-panel border-border/50 shadow-xl">
              <CardHeader className="pb-4 border-b border-border/40">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  Consumption Overview
                </CardTitle>
                <CardDescription>Track SharePoint Embedded storage and API usage against Azure billing meters.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-center min-h-[300px]">
                <div className="text-center text-muted-foreground space-y-4 max-w-md">
                  <div className="w-20 h-20 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center mx-auto mb-6">
                    <Database className="w-8 h-8 text-primary/60" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground">Billing Data Integration Required</h3>
                  <p className="text-sm">In a full implementation, this dashboard would display an interactive graph linking SharePoint Embedded API consumption directly to your configured Azure Subscription.</p>
                  <Button variant="outline" className="mt-4">Configure Billing Meter</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
