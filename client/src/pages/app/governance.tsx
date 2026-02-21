import { useState } from "react";
import { Link } from "wouter";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  Filter, 
  MoreHorizontal, 
  Users, 
  Globe, 
  FolderGit2,
  ShieldAlert,
  ShieldCheck
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Mock Data
const workspaces = [
  {
    id: "ws-1",
    displayName: "Project Phoenix",
    type: "TEAM",
    sensitivity: "CONFIDENTIAL",
    metadataStatus: "COMPLETE",
    copilotReady: true,
    owners: 3,
    lastActive: "2 days ago"
  },
  {
    id: "ws-2",
    displayName: "HR Leadership",
    type: "SHAREPOINT_SITE",
    sensitivity: "HIGHLY_CONFIDENTIAL",
    metadataStatus: "MISSING_REQUIRED",
    copilotReady: false,
    owners: 1,
    lastActive: "5 hours ago"
  },
  {
    id: "ws-3",
    displayName: "Marketing Q3 Campaign",
    type: "TEAM",
    sensitivity: "INTERNAL",
    metadataStatus: "COMPLETE",
    copilotReady: true,
    owners: 4,
    lastActive: "Just now"
  },
  {
    id: "ws-4",
    displayName: "All Company Updates",
    type: "M365_GROUP",
    sensitivity: "PUBLIC",
    metadataStatus: "COMPLETE",
    copilotReady: true,
    owners: 2,
    lastActive: "1 day ago"
  },
  {
    id: "ws-5",
    displayName: "Mergers & Acquisitions",
    type: "TEAM",
    sensitivity: "HIGHLY_CONFIDENTIAL",
    metadataStatus: "MISSING_REQUIRED",
    copilotReady: false,
    owners: 2,
    lastActive: "1 week ago"
  }
];

export default function GovernancePage() {
  const [searchTerm, setSearchTerm] = useState("");

  const getIconForType = (type: string) => {
    switch(type) {
      case 'TEAM': return <Users className="w-4 h-4 text-blue-500" />;
      case 'SHAREPOINT_SITE': return <Globe className="w-4 h-4 text-teal-500" />;
      case 'M365_GROUP': return <FolderGit2 className="w-4 h-4 text-orange-500" />;
      default: return <FolderGit2 className="w-4 h-4" />;
    }
  };

  const getSensitivityBadge = (sensitivity: string) => {
    switch(sensitivity) {
      case 'HIGHLY_CONFIDENTIAL': return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20">Highly Confidential</Badge>;
      case 'CONFIDENTIAL': return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 hover:bg-orange-500/20">Confidential</Badge>;
      case 'INTERNAL': return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20">Internal</Badge>;
      case 'PUBLIC': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20">Public</Badge>;
      default: return <Badge variant="outline">{sensitivity}</Badge>;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workspace Governance</h1>
          <p className="text-muted-foreground mt-1">Enumerate and inspect Microsoft 365 objects</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 rounded-full">
            <Filter className="w-4 h-4" />
            Filters
          </Button>
          <Button className="gap-2 rounded-full shadow-md shadow-primary/20">
            Export CSV
          </Button>
        </div>
      </div>

      <Card className="glass-panel border-border/50">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle>Directory</CardTitle>
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or owner..."
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
                <TableHead className="w-[300px] pl-6">Workspace</TableHead>
                <TableHead>Sensitivity</TableHead>
                <TableHead>Metadata Status</TableHead>
                <TableHead>Copilot Readiness</TableHead>
                <TableHead className="text-right">Owners</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workspaces.map((ws) => (
                <TableRow key={ws.id} className="group hover:bg-muted/20 transition-colors cursor-pointer relative">
                  <TableCell className="pl-6 font-medium">
                    <Link href={`/app/governance/workspaces/${ws.id}`} className="absolute inset-0 z-0" />
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center shadow-sm">
                        {getIconForType(ws.type)}
                      </div>
                      <span className="text-foreground">{ws.displayName}</span>
                    </div>
                  </TableCell>
                  <TableCell className="relative z-10">
                    {getSensitivityBadge(ws.sensitivity)}
                  </TableCell>
                  <TableCell className="relative z-10">
                    {ws.metadataStatus === 'COMPLETE' ? (
                      <div className="flex items-center text-sm text-emerald-500 gap-1.5">
                        <ShieldCheck className="w-4 h-4" /> Complete
                      </div>
                    ) : (
                      <div className="flex items-center text-sm text-amber-500 gap-1.5">
                        <ShieldAlert className="w-4 h-4" /> Missing
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="relative z-10">
                    {ws.copilotReady ? (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20">Ready</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-muted-foreground">Not Eligible</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground relative z-10">
                    <span className={ws.owners < 2 ? "text-destructive font-medium" : ""}>
                      {ws.owners}
                    </span>
                  </TableCell>
                  <TableCell className="relative z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[160px]">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                           <Link href={`/app/governance/workspaces/${ws.id}`}>Inspect Properties</Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem>Request Attestation</DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive">Archive Workspace</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          <div className="p-4 border-t border-border/50 text-xs text-center text-muted-foreground">
            Showing 5 of 1,284 total workspaces. End of preview data.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}