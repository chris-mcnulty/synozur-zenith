import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  Download, 
  TrendingUp, 
  Users, 
  Activity,
  Zap,
  Globe,
  Database,
  ArrowUpRight,
  ShieldCheck,
  LineChart,
  PieChart
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

export default function ReportsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Platform Telemetry</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Internal usage analytics, API health, and governance adoption metrics across your managed environments.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <Select defaultValue="30">
            <SelectTrigger className="w-[140px] bg-background shadow-sm">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2 shadow-sm">
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="bg-muted/50 border border-border/50 p-1">
          <TabsTrigger value="overview" className="rounded-md data-[state=active]:shadow-sm">Platform Overview</TabsTrigger>
          <TabsTrigger value="api" className="rounded-md data-[state=active]:shadow-sm">Graph API Health</TabsTrigger>
          <TabsTrigger value="adoption" className="rounded-md data-[state=active]:shadow-sm">Governance Adoption</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Top Level KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="glass-panel border-border/50 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Workspaces</CardTitle>
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Globe className="w-4 h-4 text-blue-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">14,248</div>
                <div className="flex items-center gap-1 mt-1 text-xs font-medium text-emerald-500">
                  <TrendingUp className="w-3 h-3" />
                  +12% vs last month
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-border/50 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Policies Enforced</CardTitle>
                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4 text-purple-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">842.1k</div>
                <div className="flex items-center gap-1 mt-1 text-xs font-medium text-emerald-500">
                  <TrendingUp className="w-3 h-3" />
                  +5% vs last month
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-border/50 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Unique Users Managed</CardTitle>
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Users className="w-4 h-4 text-emerald-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">42,892</div>
                <div className="flex items-center gap-1 mt-1 text-xs font-medium text-emerald-500">
                  <TrendingUp className="w-3 h-3" />
                  +2% vs last month
                </div>
              </CardContent>
            </Card>

            <Card className="glass-panel border-border/50 shadow-sm">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">Zenith Agent Calls</CardTitle>
                <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-amber-500" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">18,430</div>
                <div className="flex items-center gap-1 mt-1 text-xs font-medium text-emerald-500">
                  <TrendingUp className="w-3 h-3" />
                  +45% vs last month
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Traffic Chart */}
            <Card className="glass-panel border-border/50 shadow-xl lg:col-span-2 min-h-[400px]">
              <CardHeader className="pb-4 border-b border-border/40">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <BarChart3 className="w-5 h-5 text-primary" />
                      Platform Activity Volume
                    </CardTitle>
                    <CardDescription>Provisioning events, lifecycle checks, and policy evaluations</CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-primary/5 border-primary/20 text-primary">Daily Active Workloads</Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6 h-[320px] flex flex-col justify-end relative">
                {/* Mock Chart Area */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                   <LineChart className="w-48 h-48 text-muted-foreground" />
                </div>
                
                <div className="h-full flex items-end gap-2 sm:gap-4 relative z-10 w-full pt-10">
                  {/* Generate 30 random bars for a mock chart */}
                  {Array.from({ length: 30 }).map((_, i) => {
                    const height = 30 + Math.random() * 60;
                    const isWeekend = i % 7 === 5 || i % 7 === 6;
                    return (
                      <div key={i} className="relative flex-1 group flex flex-col justify-end h-full">
                        <div 
                          className={`w-full rounded-t-sm transition-all duration-300 ${
                            isWeekend ? 'bg-muted/40' : 'bg-primary/60 group-hover:bg-primary/80'
                          }`}
                          style={{ height: `${isWeekend ? height * 0.4 : height}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-4 text-xs text-muted-foreground pt-2 border-t border-border/50 font-medium">
                  <span>Nov 1</span>
                  <span>Nov 15</span>
                  <span>Nov 30</span>
                </div>
              </CardContent>
            </Card>

            {/* Right Column KPIs */}
            <div className="space-y-6">
              <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="w-4 h-4 text-primary" />
                    Data Processed
                  </CardTitle>
                  <CardDescription className="text-xs">MGDC and Purview syncs</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Purview Label Sync</span>
                      <span className="text-muted-foreground">4.2M events</span>
                    </div>
                    <Progress value={85} className="h-2 bg-blue-500/10 [&>div]:bg-blue-500" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">MGDC Extraction</span>
                      <span className="text-muted-foreground">1.8 TB</span>
                    </div>
                    <Progress value={60} className="h-2 bg-purple-500/10 [&>div]:bg-purple-500" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Audit Logs Ingested</span>
                      <span className="text-muted-foreground">12.4M rows</span>
                    </div>
                    <Progress value={40} className="h-2 bg-emerald-500/10 [&>div]:bg-emerald-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className="glass-panel border-border/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-primary" />
                    Workspace Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span>Microsoft Teams</span>
                      </div>
                      <span className="font-bold">54%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-teal-500" />
                        <span>SharePoint Sites</span>
                      </div>
                      <span className="font-bold">28%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <span>M365 Groups</span>
                      </div>
                      <span className="font-bold">12%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-500" />
                        <span>Loop / Power BI / Other</span>
                      </div>
                      <span className="font-bold">6%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Org Level Usage Table */}
          <Card className="glass-panel border-border/50 shadow-xl">
             <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Departmental Usage Telemetry
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow>
                    <TableHead className="pl-6">Department</TableHead>
                    <TableHead>Active Workspaces</TableHead>
                    <TableHead>Provisioning Velocity</TableHead>
                    <TableHead>Avg. Lifecycle Compliance</TableHead>
                    <TableHead>AI Agent Usage</TableHead>
                    <TableHead className="text-right pr-6">Trend</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { name: "Engineering", ws: "4,240", vel: "High (120/mo)", comp: 94, ai: "8.2k calls", trend: "up" },
                    { name: "Sales & Marketing", ws: "3,105", vel: "Medium (45/mo)", comp: 82, ai: "3.1k calls", trend: "up" },
                    { name: "Finance & Legal", ws: "1,840", vel: "Low (12/mo)", comp: 98, ai: "1.4k calls", trend: "flat" },
                    { name: "Human Resources", ws: "945", vel: "Medium (30/mo)", comp: 76, ai: "2.8k calls", trend: "down" },
                    { name: "Executive Office", ws: "120", vel: "Low (2/mo)", comp: 100, ai: "500 calls", trend: "flat" },
                  ].map((dept, i) => (
                    <TableRow key={i} className="hover:bg-muted/10 transition-colors">
                      <TableCell className="pl-6 font-medium">{dept.name}</TableCell>
                      <TableCell>{dept.ws}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-normal ${
                          dept.vel.includes('High') ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' : 
                          dept.vel.includes('Medium') ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' : 
                          'bg-muted text-muted-foreground'
                        }`}>
                          {dept.vel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div 
                              className={`h-full ${dept.comp > 90 ? 'bg-emerald-500' : dept.comp > 80 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${dept.comp}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{dept.comp}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{dept.ai}</TableCell>
                      <TableCell className="text-right pr-6">
                        {dept.trend === 'up' && <TrendingUp className="w-4 h-4 text-emerald-500 ml-auto" />}
                        {dept.trend === 'down' && <TrendingUp className="w-4 h-4 text-red-500 ml-auto transform rotate-180" />}
                        {dept.trend === 'flat' && <ArrowUpRight className="w-4 h-4 text-muted-foreground ml-auto transform rotate-45" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card className="glass-panel border-border/50 min-h-[400px] flex items-center justify-center p-12">
            <div className="text-center space-y-4 max-w-md">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary border border-primary/20">
                <Activity className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold">API Health Monitoring</h3>
              <p className="text-muted-foreground text-sm">
                This dashboard visualizes Microsoft Graph API request volumes, throttling limits, and event notification latencies across connected tenants.
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}