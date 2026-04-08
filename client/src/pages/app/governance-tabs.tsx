import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ShieldAlert, Users, HardDrive, Link2, ClipboardList,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Search,
  Trash2, Eye, Clock,
} from "lucide-react";

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function severityBadge(severity: string) {
  switch (severity) {
    case "HIGH": return <Badge variant="destructive" className="text-[10px]">High</Badge>;
    case "MEDIUM": return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]">Medium</Badge>;
    case "LOW": return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-[10px]">Low</Badge>;
    default: return <Badge variant="outline" className="text-[10px]">Info</Badge>;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "OPEN": return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 text-[10px]">Open</Badge>;
    case "ACKNOWLEDGED": return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50 text-[10px]">Acknowledged</Badge>;
    case "RESOLVED": return <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 text-[10px]">Resolved</Badge>;
    case "DISMISSED": return <Badge variant="outline" className="text-muted-foreground text-[10px]">Dismissed</Badge>;
    default: return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
  }
}

// ─── Risk Tab ───────────────────────────────────────────────────────────────

interface RiskSite {
  id: string;
  displayName: string;
  siteUrl: string | null;
  sensitivityLabelId: string | null;
  retentionLabelId: string | null;
  externalSharing: boolean;
  owners: number;
  sensitivity: string;
}

export function GovernanceRiskTab({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { data: sites = [], isLoading } = useQuery<RiskSite[]>({
    queryKey: ["/api/content-governance/risk", tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/content-governance/risk?tenantConnectionId=${tenantConnectionId}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.workspaces ?? []);
    },
    enabled: !!tenantConnectionId,
  });

  const missingLabels = sites.filter(s => !s.sensitivityLabelId);
  const missingRetention = sites.filter(s => !s.retentionLabelId);
  const externalNoApproval = sites.filter(s => s.externalSharing);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Missing Sensitivity Labels</p>
            </div>
            <p className="text-2xl font-bold text-red-600">{missingLabels.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-amber-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">No Retention Policy</p>
            </div>
            <p className="text-2xl font-bold text-amber-600">{missingRetention.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <div className="flex items-center gap-2 mb-1">
              <Link2 className="w-4 h-4 text-orange-500" />
              <p className="text-xs text-muted-foreground uppercase tracking-wider">External Sharing Enabled</p>
            </div>
            <p className="text-2xl font-bold text-orange-600">{externalNoApproval.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sites with Governance Gaps</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : sites.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-500" /> No governance gaps found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site Name</TableHead>
                  <TableHead>Issues</TableHead>
                  <TableHead>Sensitivity</TableHead>
                  <TableHead>Owners</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map(site => (
                  <TableRow key={site.id}>
                    <TableCell>
                      <span className="font-medium text-sm">{site.displayName}</span>
                      {site.siteUrl && <span className="block text-xs text-muted-foreground truncate max-w-xs">{site.siteUrl}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {!site.sensitivityLabelId && <Badge variant="destructive" className="text-[10px]">No Label</Badge>}
                        {!site.retentionLabelId && <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">No Retention</Badge>}
                        {site.externalSharing && <Badge variant="outline" className="text-orange-600 border-orange-300 text-[10px]">External</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{site.sensitivity}</TableCell>
                    <TableCell className="text-sm">{site.owners}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Ownership Tab ──────────────────────────────────────────────────────────

export function GovernanceOwnershipTab({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { data: sites = [], isLoading } = useQuery<RiskSite[]>({
    queryKey: ["/api/content-governance/ownership", tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/content-governance/ownership?tenantConnectionId=${tenantConnectionId}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.workspaces ?? []);
    },
    enabled: !!tenantConnectionId,
  });

  const noOwner = sites.filter(s => s.owners === 0);
  const singleOwner = sites.filter(s => s.owners === 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Orphaned Sites (0 Owners)</p>
            <p className="text-2xl font-bold text-red-600">{noOwner.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Single Owner Sites</p>
            <p className="text-2xl font-bold text-amber-600">{singleOwner.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Sites Below Dual Ownership</p>
            <p className="text-2xl font-bold">{sites.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sites Needing Ownership Review</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : sites.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <CheckCircle2 className="w-5 h-5 mr-2 text-emerald-500" /> All sites have dual ownership
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site Name</TableHead>
                  <TableHead>Owners</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Sensitivity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map(site => (
                  <TableRow key={site.id}>
                    <TableCell>
                      <span className="font-medium text-sm">{site.displayName}</span>
                      {site.siteUrl && <span className="block text-xs text-muted-foreground truncate max-w-xs">{site.siteUrl}</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={site.owners === 0 ? "destructive" : "outline"} className="text-[10px]">
                        {site.owners} {site.owners === 1 ? "owner" : "owners"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{site.sensitivity}</TableCell>
                    <TableCell className="text-sm">{site.sensitivity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Storage Tab ────────────────────────────────────────────────────────────

interface StorageSite {
  id: string;
  displayName: string;
  siteUrl: string | null;
  storageUsedBytes: number | null;
  storageAllocatedBytes: number | null;
  department: string | null;
  type: string;
}

export function GovernanceStorageTab({ tenantConnectionId }: { tenantConnectionId: string }) {
  const { data: sites = [], isLoading } = useQuery<StorageSite[]>({
    queryKey: ["/api/content-governance/storage", tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/content-governance/storage?tenantConnectionId=${tenantConnectionId}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.workspaces ?? []);
    },
    enabled: !!tenantConnectionId,
  });

  const totalUsed = sites.reduce((sum, s) => sum + (s.storageUsedBytes ?? 0), 0);
  const totalAllocated = sites.reduce((sum, s) => sum + (s.storageAllocatedBytes ?? 0), 0);
  const overQuota = sites.filter(s => {
    if (!s.storageUsedBytes || !s.storageAllocatedBytes || s.storageAllocatedBytes === 0) return false;
    return (s.storageUsedBytes / s.storageAllocatedBytes) > 0.8;
  });
  const avgPerSite = sites.length > 0 ? totalUsed / sites.length : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Storage Used</p>
            <p className="text-2xl font-bold">{formatBytes(totalUsed)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Allocated</p>
            <p className="text-2xl font-bold">{formatBytes(totalAllocated)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Avg per Site</p>
            <p className="text-2xl font-bold">{formatBytes(avgPerSite)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Over 80% Quota</p>
            <p className="text-2xl font-bold text-red-600">{overQuota.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sites by Storage Usage</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : sites.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">No site data available</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Used</TableHead>
                  <TableHead>Allocated</TableHead>
                  <TableHead>Usage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.slice(0, 100).map(site => {
                  const pct = site.storageUsedBytes && site.storageAllocatedBytes && site.storageAllocatedBytes > 0
                    ? Math.round((site.storageUsedBytes / site.storageAllocatedBytes) * 100)
                    : null;
                  return (
                    <TableRow key={site.id} className={pct && pct > 80 ? "bg-red-50/50 dark:bg-red-950/10" : ""}>
                      <TableCell>
                        <span className="font-medium text-sm">{site.displayName}</span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{site.department ?? "—"}</TableCell>
                      <TableCell className="text-sm">{formatBytes(site.storageUsedBytes)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatBytes(site.storageAllocatedBytes)}</TableCell>
                      <TableCell>
                        {pct != null ? (
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${pct > 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">{pct}%</span>
                          </div>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sharing Tab ────────────────────────────────────────────────────────────

interface SharingLinkItem {
  id: string;
  resourceType: string;
  resourceName: string | null;
  linkType: string;
  linkScope: string | null;
  createdBy: string | null;
  isActive: boolean;
  expiresAt: string | null;
  createdAtGraph: string | null;
}

export function GovernanceSharingTab({ tenantConnectionId }: { tenantConnectionId: string }) {
  const [linkTypeFilter, setLinkTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const { data: links = [], isLoading } = useQuery<SharingLinkItem[]>({
    queryKey: ["/api/content-governance/sharing/links", tenantConnectionId, linkTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ tenantConnectionId });
      if (linkTypeFilter !== "all") params.set("linkType", linkTypeFilter);
      const res = await fetch(`/api/content-governance/sharing/links?${params}`, { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : (data.links ?? []);
    },
    enabled: !!tenantConnectionId,
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/content-governance/sharing/links/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to revoke link");
    },
    onSuccess: () => {
      toast({ title: "Sharing link revoked" });
      queryClient.invalidateQueries({ queryKey: ["/api/content-governance/sharing/links"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to revoke", description: err.message, variant: "destructive" });
    },
  });

  const anonymousCount = links.filter(l => l.linkType === "anonymous").length;
  const orgCount = links.filter(l => l.linkType === "organization").length;
  const specificCount = links.filter(l => l.linkType === "specific").length;

  const filtered = links.filter(l => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (l.resourceName?.toLowerCase().includes(s) || l.createdBy?.toLowerCase().includes(s));
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Anonymous Links</p>
            <p className="text-2xl font-bold text-red-600">{anonymousCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Organization Links</p>
            <p className="text-2xl font-bold text-amber-600">{orgCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Specific People Links</p>
            <p className="text-2xl font-bold">{specificCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by resource or creator..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={linkTypeFilter} onValueChange={setLinkTypeFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Link type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="anonymous">Anonymous</SelectItem>
            <SelectItem value="organization">Organization</SelectItem>
            <SelectItem value="specific">Specific People</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">No sharing links found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Created By</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 200).map(link => (
                  <TableRow key={link.id} className={link.linkType === "anonymous" ? "bg-red-50/30 dark:bg-red-950/10" : ""}>
                    <TableCell>
                      <span className="font-medium text-sm">{link.resourceName ?? "—"}</span>
                      <span className="block text-xs text-muted-foreground">{link.resourceType}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={link.linkType === "anonymous" ? "destructive" : "outline"} className="text-[10px]">
                        {link.linkType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{link.linkScope ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{link.createdBy ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {link.expiresAt ? new Date(link.expiresAt).toLocaleDateString() : "Never"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-red-600 hover:text-red-700"
                        onClick={() => revokeMutation.mutate(link.id)}
                        disabled={revokeMutation.isPending}
                      >
                        <Trash2 className="w-3 h-3 mr-1" /> Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Reviews Tab ────────────────────────────────────────────────────────────

interface ReviewTask {
  id: string;
  reviewType: string;
  triggerType: string;
  status: string;
  findingsCount: number;
  resolvedCount: number;
  createdAt: string;
  completedAt: string | null;
}

interface ReviewFinding {
  id: string;
  resourceType: string;
  resourceId: string;
  resourceName: string | null;
  findingType: string;
  severity: string;
  description: string | null;
  recommendedAction: string | null;
  status: string;
}

export function GovernanceReviewsTab({ tenantConnectionId, organizationId }: { tenantConnectionId: string; organizationId: string }) {
  const [selectedReview, setSelectedReview] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: reviews = [], isLoading } = useQuery<ReviewTask[]>({
    queryKey: ["/api/content-governance/reviews", tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(`/api/content-governance/reviews?tenantConnectionId=${tenantConnectionId}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!tenantConnectionId,
  });

  const { data: reviewDetail } = useQuery<{ task: ReviewTask; findings: ReviewFinding[] }>({
    queryKey: ["/api/content-governance/reviews", selectedReview],
    queryFn: async () => {
      const res = await fetch(`/api/content-governance/reviews/${selectedReview}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load review");
      return res.json();
    },
    enabled: !!selectedReview,
  });

  const createReviewMutation = useMutation({
    mutationFn: async (reviewType: string) => {
      const res = await fetch("/api/content-governance/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantConnectionId, organizationId, reviewType, triggerType: "MANUAL", targetResourceType: "ALL" }),
      });
      if (!res.ok) throw new Error("Failed to create review");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Review created" });
      queryClient.invalidateQueries({ queryKey: ["/api/content-governance/reviews"] });
    },
  });

  const updateFindingMutation = useMutation({
    mutationFn: async ({ reviewId, findingId, status }: { reviewId: string; findingId: string; status: string }) => {
      const res = await fetch(`/api/content-governance/reviews/${reviewId}/findings/${findingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update finding");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/content-governance/reviews", selectedReview] });
      queryClient.invalidateQueries({ queryKey: ["/api/content-governance/reviews", tenantConnectionId] });
    },
  });

  const reviewTypeLabel = (t: string) => {
    switch (t) {
      case "SHARING_REVIEW": return "Sharing Review";
      case "OWNERSHIP_REVIEW": return "Ownership Review";
      case "STORAGE_REVIEW": return "Storage Review";
      case "INACTIVE_REVIEW": return "Inactive Review";
      default: return t;
    }
  };

  if (selectedReview && reviewDetail) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setSelectedReview(null)} className="gap-1.5">
          Back to Reviews
        </Button>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {reviewTypeLabel(reviewDetail.task.reviewType)}
              <Badge variant="outline" className="text-[10px]">{reviewDetail.task.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {reviewDetail.findings.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">No findings</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead>Finding</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reviewDetail.findings.map(f => (
                    <TableRow key={f.id}>
                      <TableCell>
                        <span className="font-medium text-sm">{f.resourceName ?? f.resourceId}</span>
                        <span className="block text-xs text-muted-foreground">{f.resourceType}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{f.description ?? f.findingType}</span>
                        {f.recommendedAction && <span className="block text-xs text-muted-foreground mt-0.5">{f.recommendedAction}</span>}
                      </TableCell>
                      <TableCell>{severityBadge(f.severity)}</TableCell>
                      <TableCell>{statusBadge(f.status)}</TableCell>
                      <TableCell>
                        {f.status === "OPEN" && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => updateFindingMutation.mutate({ reviewId: selectedReview!, findingId: f.id, status: "RESOLVED" })}>Resolve</Button>
                            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => updateFindingMutation.mutate({ reviewId: selectedReview!, findingId: f.id, status: "DISMISSED" })}>Dismiss</Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Governance Reviews</h3>
        <div className="flex gap-2">
          {["SHARING_REVIEW", "OWNERSHIP_REVIEW", "STORAGE_REVIEW", "INACTIVE_REVIEW"].map(type => (
            <Button
              key={type}
              variant="outline"
              size="sm"
              onClick={() => createReviewMutation.mutate(type)}
              disabled={createReviewMutation.isPending}
              className="text-xs"
            >
              {reviewTypeLabel(type)}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : reviews.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              <ClipboardList className="w-5 h-5 mr-2 opacity-30" /> No reviews yet. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Findings</TableHead>
                  <TableHead>Resolved</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-sm">{reviewTypeLabel(r.reviewType)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.triggerType}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="text-sm">{r.findingsCount}</TableCell>
                    <TableCell className="text-sm">{r.resolvedCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedReview(r.id)}>
                        <Eye className="w-3 h-3 mr-1" /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
