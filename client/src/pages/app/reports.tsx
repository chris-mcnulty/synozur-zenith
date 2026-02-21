import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart3, Download, TrendingUp, Users, HardDrive, ShieldAlert, FileText } from "lucide-react";

export default function ReportsPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Governance Reports</h1>
          <p className="text-muted-foreground mt-1">Analytics and insights across your tenant architecture.</p>
        </div>
        <div className="flex gap-3 items-center">
          <Select defaultValue="30">
            <SelectTrigger className="w-[140px] bg-background">
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Workspaces", value: "1,248", change: "+12%", icon: <Users className="w-5 h-5 text-blue-500" /> },
          { title: "Storage Used", value: "4.2 TB", change: "+5%", icon: <HardDrive className="w-5 h-5 text-purple-500" /> },
          { title: "External Guests", value: "892", change: "+2%", icon: <ShieldAlert className="w-5 h-5 text-orange-500" /> },
          { title: "Policy Violations", value: "34", change: "-15%", icon: <FileText className="w-5 h-5 text-red-500" /> },
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
              <div className="flex items-center gap-1 mt-1 text-xs font-medium text-emerald-500">
                <TrendingUp className="w-3 h-3" />
                {stat.change} from last period
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="glass-panel border-border/50 shadow-xl min-h-[400px]">
          <CardHeader className="pb-4 border-b border-border/40">
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="w-5 h-5 text-primary" />
              Workspace Growth
            </CardTitle>
            <CardDescription>New workspaces provisioned over time</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-[300px]">
            <div className="text-center text-muted-foreground space-y-4">
              <div className="w-24 h-24 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center mx-auto">
                <TrendingUp className="w-10 h-10 text-primary/40" />
              </div>
              <p>Growth Chart Visualization</p>
              <p className="text-xs max-w-[250px] mx-auto">In a full implementation, this would show an interactive chart of workspace creation trends.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50 shadow-xl min-h-[400px]">
          <CardHeader className="pb-4 border-b border-border/40">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldAlert className="w-5 h-5 text-primary" />
              Compliance Score
            </CardTitle>
            <CardDescription>Tenant-wide governance adherence</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-center h-[300px] flex-col gap-6">
            <div className="relative w-48 h-48 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" className="text-muted/30" />
                <circle cx="50" cy="50" r="40" fill="transparent" stroke="currentColor" strokeWidth="8" strokeDasharray="251.2" strokeDashoffset="45" className="text-emerald-500 transition-all duration-1000" />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-4xl font-bold text-foreground">82%</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest mt-1">Score</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8 w-full max-w-xs text-center">
              <div>
                <div className="text-lg font-bold text-foreground">1,024</div>
                <div className="text-xs text-muted-foreground mt-1">Compliant</div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground text-red-500">224</div>
                <div className="text-xs text-muted-foreground mt-1">Needs Review</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
