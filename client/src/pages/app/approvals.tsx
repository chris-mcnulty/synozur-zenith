import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search, 
  Filter, 
  Users, 
  Globe, 
  FolderGit2,
  ShieldAlert,
  AlertTriangle,
  Info,
  History,
  FileText
} from "lucide-react";
import { Label } from "@/components/ui/label";

const pendingApprovals = [
  {
    id: "REQ-2084",
    workspaceName: "Project Titan Offsite",
    type: "TEAM",
    requester: "Alex Chen",
    department: "Engineering",
    requestedDate: "2 hours ago",
    sensitivity: "HIGHLY_CONFIDENTIAL",
    externalSharing: true,
    policyTrigger: "Highly Confidential Workspaces requiring External Sharing need VP approval.",
    status: "Pending Review"
  },
  {
    id: "REQ-2085",
    workspaceName: "Vendor Collaboration Portal",
    type: "SHAREPOINT_SITE",
    requester: "Sarah Jenkins",
    department: "Procurement",
    requestedDate: "5 hours ago",
    sensitivity: "CONFIDENTIAL",
    externalSharing: true,
    policyTrigger: "Any site with 'Vendor' in name requires Procurement Lead sign-off.",
    status: "Pending Review"
  },
  {
    id: "REQ-2081",
    workspaceName: "All Hands 2025 Planning",
    type: "M365_GROUP",
    requester: "Mike Ross",
    department: "Executive Office",
    requestedDate: "1 day ago",
    sensitivity: "INTERNAL",
    externalSharing: false,
    policyTrigger: "Workspace ownership does not meet minimum requirement (1 owner vs required 2).",
    status: "Pending Review"
  }
];

export default function ApprovalsQueue() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<typeof pendingApprovals[0] | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

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
      case 'HIGHLY_CONFIDENTIAL': return <Badge variant="destructive" className="bg-destructive/10 text-destructive border-destructive/20 text-[10px]">Highly Confidential</Badge>;
      case 'CONFIDENTIAL': return <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-[10px]">Confidential</Badge>;
      case 'INTERNAL': return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px]">Internal</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">{sensitivity}</Badge>;
    }
  };

  const handleAction = (action: 'approve' | 'reject') => {
    setIsProcessing(true);
    // Simulate API delay
    setTimeout(() => {
      setIsProcessing(false);
      setSelectedRequest(null);
      setActionNotes("");
      // In a real app, we would remove the item from the list here
    }, 1000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pending Approvals</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Review workspace provisioning and configuration requests that triggered governance policy exceptions.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 shadow-sm">
            <History className="w-4 h-4 text-muted-foreground" />
            Approval History
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-amber-500/20 shadow-amber-500/5 bg-amber-500/5">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-500 uppercase tracking-wider">Awaiting Your Review</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">3</div>
            <p className="text-xs text-amber-600/80 mt-1 flex items-center gap-1">Average wait time: 4 hours</p>
          </CardContent>
        </Card>
        
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Approved This Week</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">18</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">Via automated policies</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Rejected</CardTitle>
            <XCircle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">2</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">Due to policy violations</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50 shadow-xl flex flex-col min-h-[500px]">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/10 flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Approval Queue
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search requests..."
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
                <TableHead className="pl-6">Request Details</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Policy Exception</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right pr-6">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingApprovals.map((request) => (
                <TableRow key={request.id} className="hover:bg-muted/10 transition-colors group cursor-pointer" onClick={() => setSelectedRequest(request)}>
                  <TableCell className="pl-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center shadow-sm shrink-0">
                        {getIconForType(request.type)}
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold text-sm">{request.workspaceName}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">{request.type.replace('_', ' ')}</span>
                          {getSensitivityBadge(request.sensitivity)}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{request.requester}</span>
                      <span className="text-xs text-muted-foreground">{request.department}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start gap-2 max-w-[300px]">
                      <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-xs text-muted-foreground line-clamp-2" title={request.policyTrigger}>
                        {request.policyTrigger}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {request.requestedDate}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <Button size="sm" className="shadow-sm shadow-primary/20">
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Review Details Sheet */}
      <Sheet open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] border-l-border/50 bg-card/95 backdrop-blur-xl overflow-y-auto">
          {selectedRequest && (
            <>
              <SheetHeader className="pb-6 border-b border-border/50">
                <SheetTitle className="text-2xl flex items-center gap-3">
                  {getIconForType(selectedRequest.type)}
                  Review Request
                </SheetTitle>
                <SheetDescription>
                  Request {selectedRequest.id} submitted by {selectedRequest.requester}
                </SheetDescription>
              </SheetHeader>
              
              <div className="py-6 space-y-8">
                {/* Policy Trigger Alert */}
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-semibold text-sm text-amber-600 dark:text-amber-400">Policy Exception Triggered</h4>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/80 leading-relaxed">
                      {selectedRequest.policyTrigger}
                    </p>
                  </div>
                </div>

                {/* Workspace Details */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2 border-b border-border/50 pb-2">
                    <Info className="w-4 h-4 text-primary" /> Workspace Configuration
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Name</span>
                      <p className="text-sm font-medium">{selectedRequest.workspaceName}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Type</span>
                      <p className="text-sm font-medium">{selectedRequest.type.replace('_', ' ')}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Sensitivity</span>
                      <div>{getSensitivityBadge(selectedRequest.sensitivity)}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">External Sharing</span>
                      <p className="text-sm font-medium">{selectedRequest.externalSharing ? 'Enabled' : 'Disabled'}</p>
                    </div>
                  </div>

                  <div className="space-y-1 pt-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Business Justification</span>
                    <div className="p-3 bg-muted/30 rounded-lg border border-border/50 text-sm italic text-muted-foreground">
                      "We need to collaborate securely with our external auditing firm (KPMG) on the Q3 financials before the board meeting."
                    </div>
                  </div>
                </div>

                {/* Approver Action */}
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="notes">Reviewer Notes (Optional)</Label>
                    <Textarea 
                      id="notes"
                      placeholder="Add notes for the requester or audit log..."
                      className="resize-none bg-background/50 h-24"
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <SheetFooter className="flex-row sm:justify-between pt-6 border-t border-border/50">
                <Button 
                  variant="destructive" 
                  className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20"
                  onClick={() => handleAction('reject')}
                  disabled={isProcessing}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Reject Request
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelectedRequest(null)} disabled={isProcessing}>
                    Cancel
                  </Button>
                  <Button 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20"
                    onClick={() => handleAction('approve')}
                    disabled={isProcessing}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                    Approve Request
                  </Button>
                </div>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}