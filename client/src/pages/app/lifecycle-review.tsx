import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Clock, 
  Search, 
  Filter, 
  Users, 
  Globe, 
  FolderGit2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Archive,
  Trash2,
  CalendarDays,
  ShieldAlert,
  BarChart2,
  Infinity,
  BookOpen,
  ArrowRight
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const reviews = [
  {
    id: "REV-001",
    workspaceName: "Project Phoenix",
    type: "TEAM",
    reviewType: "Time-based Renewal",
    dueDate: "2 days ago",
    status: "Overdue",
    owner: "Sarah Jenkins",
    activityScore: 12
  },
  {
    id: "REV-002",
    workspaceName: "Q3 Marketing Assets",
    type: "SHAREPOINT_SITE",
    reviewType: "Ownership Confirmation",
    dueDate: "Today",
    status: "Pending",
    owner: "Mike Ross (Inactive)",
    activityScore: 84
  },
  {
    id: "REV-003",
    workspaceName: "Engineering Specs Sync",
    type: "LOOP_WORKSPACE",
    reviewType: "External Guest Review",
    dueDate: "In 3 days",
    status: "Pending",
    owner: "Alex Chen",
    activityScore: 95
  },
  {
    id: "REV-004",
    workspaceName: "Mergers & Acquisitions",
    type: "TEAM",
    reviewType: "Time-based Renewal",
    dueDate: "In 5 days",
    status: "Pending",
    owner: "David Smith",
    activityScore: 5
  },
  {
    id: "REV-005",
    workspaceName: "FY24 Sales Targets",
    type: "POWER_BI",
    reviewType: "Ownership Confirmation",
    dueDate: "In 1 week",
    status: "Pending",
    owner: "Jessica Wong",
    activityScore: 42
  }
];

export default function LifecycleReviewHub() {
  const [searchTerm, setSearchTerm] = useState("");

  const getIconForType = (type: string) => {
    switch(type) {
      case 'TEAM': return <Users className="w-4 h-4 text-blue-500" />;
      case 'SHAREPOINT_SITE': return <Globe className="w-4 h-4 text-teal-500" />;
      case 'M365_GROUP': return <FolderGit2 className="w-4 h-4 text-orange-500" />;
      case 'POWER_BI': return <BarChart2 className="w-4 h-4 text-yellow-500" />;
      case 'LOOP_WORKSPACE': return <Infinity className="w-4 h-4 text-indigo-500" />;
      case 'COPILOT_NOTEBOOK': return <BookOpen className="w-4 h-4 text-purple-500" />;
      default: return <FolderGit2 className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workspace Review Hub</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Manage lifecycle events, ownership confirmations, and automated retention policies. No destructive actions occur without human confirmation.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 shadow-sm">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            Schedule Mass Review
          </Button>
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="glass-panel border-red-500/20 shadow-red-500/5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider text-red-500">Overdue Reviews</CardTitle>
            <AlertCircle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-500">24</div>
            <p className="text-xs text-red-500/80 mt-1 flex items-center gap-1">Requires immediate action</p>
          </CardContent>
        </Card>
        
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pending This Week</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">156</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">Notices sent to owners</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Orphaned Workspaces</CardTitle>
            <Users className="w-4 h-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">42</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">No active owner in Entra ID</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-emerald-500/20 bg-emerald-500/5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-500 uppercase tracking-wider">Completion Rate</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-2">
              <div className="text-3xl font-bold text-foreground">89%</div>
            </div>
            <Progress value={89} className="h-1.5 bg-emerald-500/20 [&>div]:bg-emerald-500" />
            <p className="text-xs text-emerald-600/80 mt-2">For current quarter</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Review Queue Table */}
        <Card className="glass-panel border-border/50 shadow-xl lg:col-span-2 flex flex-col min-h-[500px]">
          <CardHeader className="pb-4 border-b border-border/40 bg-muted/10 flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Active Review Queue
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search workspaces or owners..."
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
                  <TableHead className="pl-6">Workspace</TableHead>
                  <TableHead>Review Type</TableHead>
                  <TableHead>Owner / Status</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead className="text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review) => (
                  <TableRow key={review.id} className="hover:bg-muted/10 transition-colors group">
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center shadow-sm">
                          {getIconForType(review.type)}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-semibold text-sm">{review.workspaceName}</span>
                          <span className="text-xs text-muted-foreground">{review.type.replace('_', ' ')}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-background font-normal text-xs whitespace-nowrap">
                        {review.reviewType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className={`text-sm ${review.owner.includes('(Inactive)') ? 'text-red-500 font-medium flex items-center gap-1' : ''}`}>
                          {review.owner.includes('(Inactive)') && <AlertCircle className="w-3 h-3" />}
                          {review.owner}
                        </span>
                        <span className={`text-[10px] font-medium uppercase tracking-wider ${
                          review.status === 'Overdue' ? 'text-red-500' : 'text-amber-500'
                        }`}>
                          {review.status} • {review.dueDate}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div 
                            className={`h-full ${
                              review.activityScore > 70 ? 'bg-emerald-500' : 
                              review.activityScore > 30 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                            style={{ width: `${review.activityScore}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground">{review.activityScore}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button size="sm" variant="ghost" className="opacity-0 group-hover:opacity-100 transition-opacity gap-1 text-primary hover:text-primary hover:bg-primary/10">
                        Review <ArrowRight className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          <CardFooter className="bg-muted/10 border-t border-border/40 p-3 flex justify-center text-xs text-muted-foreground rounded-b-xl">
            Showing 5 of 180 pending reviews.
          </CardFooter>
        </Card>

        {/* Right Sidebar - Quick Actions & Insights */}
        <div className="space-y-6">
          <Card className="glass-panel border-primary/20 bg-gradient-to-br from-primary/5 to-background">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-primary" />
                Suggested Actions
              </CardTitle>
              <CardDescription className="text-xs">
                AI-driven recommendations based on activity
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg bg-background/60 p-3 border border-border/50 text-sm">
                <p className="font-medium text-foreground mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Archive className="w-4 h-4 text-amber-500" /> Auto-Archive</span>
                  <Badge className="bg-primary text-primary-foreground text-[10px] h-5 px-1.5">14 Sites</Badge>
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  These workspaces have 0% activity in the last 180 days and owners have not responded to 3 renewal notices.
                </p>
                <Button size="sm" className="w-full mt-3 h-8 text-xs bg-primary/90">Review Archive Candidates</Button>
              </div>

              <div className="rounded-lg bg-background/60 p-3 border border-border/50 text-sm">
                <p className="font-medium text-foreground mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Users className="w-4 h-4 text-blue-500" /> Reassign Ownership</span>
                  <Badge className="bg-primary text-primary-foreground text-[10px] h-5 px-1.5">42 Orphaned</Badge>
                </p>
                <p className="text-muted-foreground text-xs leading-relaxed">
                  Primary owners have left the organization. Zenith can automatically suggest new owners based on top contributors.
                </p>
                <Button size="sm" variant="outline" className="w-full mt-3 h-8 text-xs border-primary/20 hover:bg-primary/5 text-primary">Suggest New Owners</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Lifecycle Policies</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/40">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium">Standard 1-Year Renewal</span>
                </div>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/40">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium">Guest Access 90-Day Review</span>
                </div>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/40">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-sm font-medium">Orphaned Workspace Escalation</span>
                </div>
                <Badge variant="outline" className="text-[10px]">Draft</Badge>
              </div>
              <Button variant="link" size="sm" className="w-full text-xs text-muted-foreground" asChild>
                <Link href="/app/admin/policies">Manage Policies →</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}