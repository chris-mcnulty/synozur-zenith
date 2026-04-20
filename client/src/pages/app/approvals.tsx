import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
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
  FileText,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Label } from "@/components/ui/label";

interface ProvisioningRequest {
  id: string;
  workspaceName: string;
  workspaceType: string;
  projectType: string;
  sensitivity: string;
  externalSharing: boolean;
  siteOwners: Array<{ displayName: string; mail?: string; userPrincipalName?: string }>;
  status: string;
  requestedBy: string;
  governedName: string;
  tenantConnectionId?: string;
  provisionedSiteUrl?: string;
  errorMessage?: string;
  createdAt: string;
}

export default function ApprovalsQueue() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<ProvisioningRequest | null>(null);
  const [actionNotes, setActionNotes] = useState("");
  const { toast } = useToast();

  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id ?? "";

  const { data: requests = [], isLoading } = useQuery<ProvisioningRequest[]>({
    queryKey: ["/api/provisioning-requests", tenantConnectionId],
    queryFn: async () => {
      const url = tenantConnectionId
        ? `/api/provisioning-requests?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`
        : "/api/provisioning-requests";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load provisioning requests");
      return res.json();
    },
  });

  const pendingRequests = requests.filter(r => r.status === "PENDING");
  const approvedThisWeek = requests.filter(r => {
    if (r.status !== "APPROVED" && r.status !== "PROVISIONED") return false;
    const created = new Date(r.createdAt);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return created > weekAgo;
  });
  const rejectedCount = requests.filter(r => r.status === "REJECTED").length;

  const filteredRequests = pendingRequests.filter(r =>
    !searchTerm ||
    r.workspaceName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.requestedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.governedName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/provisioning-requests/${id}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/provisioning-requests"] });
      setSelectedRequest(null);
      setActionNotes("");
    },
    onError: (err: Error) => {
      toast({
        title: "Action Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const isProcessing = statusMutation.isPending;

  const handleAction = (action: "approve" | "reject") => {
    if (!selectedRequest) return;
    const status = action === "approve" ? "APPROVED" : "REJECTED";
    statusMutation.mutate({ id: selectedRequest.id, status });
    toast({
      title: action === "approve" ? "Request Approved" : "Request Rejected",
      description: action === "approve"
        ? `${selectedRequest.governedName} approved. Set to PROVISIONED to trigger M365 creation.`
        : `${selectedRequest.workspaceName} has been rejected.`,
    });
  };

  const getIconForType = (type: string) => {
    switch(type) {
      case 'TEAM_SITE': return <Users className="w-4 h-4 text-blue-500" />;
      case 'COMMUNICATION_SITE': return <Globe className="w-4 h-4 text-teal-500" />;
      case 'HUB_SITE': return <FolderGit2 className="w-4 h-4 text-purple-500" />;
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING': return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Pending</Badge>;
      case 'APPROVED': return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">Approved</Badge>;
      case 'PROVISIONED': return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Provisioned</Badge>;
      case 'REJECTED': return <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">Rejected</Badge>;
      case 'FAILED': return <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/20">Failed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffH < 1) return "Just now";
    if (diffH < 24) return `${diffH} hour${diffH > 1 ? "s" : ""} ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return "Yesterday";
    return `${diffD} days ago`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pending Approvals</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Review workspace provisioning requests. Approving a request begins the governance review; setting status to Provisioned triggers M365 site/group creation.
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
            <div className="text-3xl font-bold text-foreground" data-testid="text-pending-count">{pendingRequests.length}</div>
            <p className="text-xs text-amber-600/80 mt-1">Provisioning requests pending</p>
          </CardContent>
        </Card>
        
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Approved This Week</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground" data-testid="text-approved-count">{approvedThisWeek.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Approved or provisioned</p>
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Rejected</CardTitle>
            <XCircle className="w-4 h-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground" data-testid="text-rejected-count">{rejectedCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Due to policy violations</p>
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
                data-testid="input-search-requests"
              />
            </div>
            <Button variant="outline" size="icon" className="h-9 w-9">
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-500/50" />
              <p className="text-sm">No pending requests</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow>
                  <TableHead className="pl-6">Request Details</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Owners</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow
                    key={request.id}
                    className="hover:bg-muted/10 transition-colors group cursor-pointer"
                    onClick={() => setSelectedRequest(request)}
                    data-testid={`row-request-${request.id}`}
                  >
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center shadow-sm shrink-0">
                          {getIconForType(request.workspaceType)}
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="font-semibold text-sm">{request.workspaceName}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground font-mono">{request.governedName}</span>
                            {getSensitivityBadge(request.sensitivity)}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium">{request.requestedBy}</span>
                        <span className="text-xs text-muted-foreground">{request.projectType}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-sm">{(request.siteOwners || []).length} owner{(request.siteOwners || []).length !== 1 ? "s" : ""}</span>
                        {(request.siteOwners || []).length < 2 && (
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 ml-1" title="Fewer than 2 owners" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(request.createdAt)}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button size="sm" className="shadow-sm shadow-primary/20" data-testid={`button-review-${request.id}`}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Review Details Sheet */}
      <Sheet open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <SheetContent className="w-[400px] sm:w-[540px] border-l-border/50 bg-card/95 backdrop-blur-xl overflow-y-auto">
          {selectedRequest && (
            <>
              <SheetHeader className="pb-6 border-b border-border/50">
                <SheetTitle className="text-2xl flex items-center gap-3">
                  {getIconForType(selectedRequest.workspaceType)}
                  Review Request
                </SheetTitle>
                <SheetDescription>
                  Submitted by {selectedRequest.requestedBy}
                </SheetDescription>
              </SheetHeader>
              
              <div className="py-6 space-y-8">
                {/* Owner count warning */}
                {(selectedRequest.siteOwners || []).length < 2 && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="font-semibold text-sm text-amber-600 dark:text-amber-400">Ownership Requirement Not Met</h4>
                      <p className="text-xs text-amber-600/80 dark:text-amber-400/80 leading-relaxed">
                        This request has fewer than 2 owners. Approval will be rejected by the server until at least 2 owners are assigned.
                      </p>
                    </div>
                  </div>
                )}

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
                      <p className="text-sm font-medium">{selectedRequest.workspaceType.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Governed Name</span>
                      <p className="text-sm font-mono font-medium">{selectedRequest.governedName}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Sensitivity</span>
                      <div>{getSensitivityBadge(selectedRequest.sensitivity)}</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">External Sharing</span>
                      <p className="text-sm font-medium">{selectedRequest.externalSharing ? 'Enabled' : 'Disabled'}</p>
                    </div>
                    <div className="space-y-1">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Status</span>
                      <div>{getStatusBadge(selectedRequest.status)}</div>
                    </div>
                  </div>

                  {/* Owners list */}
                  <div className="space-y-2 pt-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Site Owners ({(selectedRequest.siteOwners || []).length})</span>
                    <div className="space-y-1.5">
                      {(selectedRequest.siteOwners || []).map((owner, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg border border-border/50">
                          <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{owner.displayName}</p>
                            {(owner.mail || owner.userPrincipalName) && (
                              <p className="text-xs text-muted-foreground">{owner.mail || owner.userPrincipalName}</p>
                            )}
                          </div>
                        </div>
                      ))}
                      {(selectedRequest.siteOwners || []).length === 0 && (
                        <p className="text-sm text-muted-foreground italic">No owners specified</p>
                      )}
                    </div>
                  </div>

                  {/* Error message if failed */}
                  {selectedRequest.errorMessage && (
                    <div className="space-y-1 pt-2">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Error Detail</span>
                      <div className="p-3 bg-red-500/5 rounded-lg border border-red-500/20 text-sm text-red-500 font-mono text-xs break-all">
                        {selectedRequest.errorMessage}
                      </div>
                    </div>
                  )}

                  {/* Provisioned site URL */}
                  {selectedRequest.provisionedSiteUrl && (
                    <div className="space-y-1 pt-2">
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Provisioned Site</span>
                      <a
                        href={selectedRequest.provisionedSiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline break-all"
                      >
                        {selectedRequest.provisionedSiteUrl}
                      </a>
                    </div>
                  )}
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
                      data-testid="textarea-reviewer-notes"
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
                  data-testid="button-reject-request"
                >
                  {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Reject Request
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelectedRequest(null)} disabled={isProcessing}>
                    Cancel
                  </Button>
                  <Button 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20"
                    onClick={() => handleAction('approve')}
                    disabled={isProcessing || (selectedRequest.siteOwners || []).length < 2}
                    data-testid="button-approve-request"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
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
