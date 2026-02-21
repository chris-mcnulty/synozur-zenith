import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Workspace } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  Globe, 
  ShieldAlert,
  ShieldCheck,
  CheckSquare,
  X,
  Settings2,
  Save,
  Loader2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function GovernancePage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);

  const [bulkSensitivity, setBulkSensitivity] = useState("");
  const [bulkRetention, setBulkRetention] = useState("");
  const [bulkDepartment, setBulkDepartment] = useState("");
  const [bulkCostCenter, setBulkCostCenter] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data: workspaces = [], isLoading, isError } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces", debouncedSearch],
    queryFn: () => fetch(`/api/workspaces?search=${debouncedSearch}`).then(r => r.json()),
  });

  const bulkMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", "/api/workspaces/bulk/update", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
      setIsBulkEditOpen(false);
      setSelectedIds(new Set());
      setBulkSensitivity("");
      setBulkRetention("");
      setBulkDepartment("");
      setBulkCostCenter("");
    },
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === workspaces.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(workspaces.map(w => w.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleBulkSave = () => {
    const updates: Record<string, string> = {};
    if (bulkSensitivity) updates.sensitivity = bulkSensitivity;
    if (bulkRetention) updates.retentionPolicy = bulkRetention;
    if (bulkDepartment) updates.department = bulkDepartment;
    if (bulkCostCenter) updates.costCenter = bulkCostCenter;

    bulkMutation.mutate({
      ids: Array.from(selectedIds),
      updates,
    });
  };

  const getIconForType = (type: string) => {
    switch(type) {
      case 'TEAM_SITE': return <Globe className="w-4 h-4 text-teal-500" />;
      case 'COMMUNICATION_SITE': return <Globe className="w-4 h-4 text-blue-500" />;
      case 'HUB_SITE': return <Globe className="w-4 h-4 text-purple-500" />;
      default: return <Globe className="w-4 h-4 text-teal-500" />;
    }
  };

  const getSiteTypeLabel = (type: string) => {
    switch(type) {
      case 'TEAM_SITE': return 'Team Site';
      case 'COMMUNICATION_SITE': return 'Communication Site';
      case 'HUB_SITE': return 'Hub Site';
      default: return 'SharePoint Site';
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

  if (isError) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 pb-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Site Governance</h1>
            <p className="text-muted-foreground mt-1">Enumerate and inspect SharePoint sites across your tenant</p>
          </div>
        </div>
        <Card className="glass-panel border-border/50">
          <CardContent className="p-8 text-center">
            <p className="text-destructive font-medium">Failed to load workspaces. Please try again later.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Site Governance</h1>
          <p className="text-muted-foreground mt-1">Enumerate and inspect SharePoint sites across your tenant</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2 rounded-full" onClick={() => setShowFilterDrawer(true)}>
            <Filter className="w-4 h-4" />
            Filters
          </Button>
          <Button className="gap-2 rounded-full shadow-md shadow-primary/20">
            Export CSV
          </Button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center justify-between animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <Badge className="bg-primary text-primary-foreground">{selectedIds.size}</Badge>
            <span className="text-sm font-medium text-primary">workspaces selected</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())} className="h-8 border-primary/20 text-primary hover:bg-primary/10">
              <X className="w-4 h-4 mr-1" /> Clear
            </Button>
            <Button size="sm" onClick={() => setIsBulkEditOpen(true)} className="h-8 gap-2 shadow-sm shadow-primary/20">
              <CheckSquare className="w-4 h-4" /> Bulk Edit Properties
            </Button>
          </div>
        </div>
      )}

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
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Table>
                <TableHeader className="bg-muted/30">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[40px] pl-4">
                      <Checkbox 
                        checked={selectedIds.size === workspaces.length && workspaces.length > 0} 
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead className="w-[280px]">Workspace</TableHead>
                    <TableHead>Size & Usage</TableHead>
                    <TableHead>Sensitivity</TableHead>
                    <TableHead>Metadata Status</TableHead>
                    <TableHead>Copilot Readiness</TableHead>
                    <TableHead className="text-right">Owners</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspaces.map((ws) => (
                    <TableRow 
                      key={ws.id} 
                      className={`group transition-colors relative ${selectedIds.has(ws.id) ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/20'}`}
                    >
                      <TableCell className="pl-4 relative z-20" onClick={(e) => e.stopPropagation()}>
                        <Checkbox 
                          checked={selectedIds.has(ws.id)}
                          onCheckedChange={() => toggleSelect(ws.id)}
                          aria-label={`Select ${ws.displayName}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium cursor-pointer relative">
                        <Link href={`/app/governance/workspaces/${ws.id}`} className="absolute inset-0 z-10" />
                        <div className="flex items-center gap-3 relative z-0 pointer-events-none">
                          <div className="w-8 h-8 rounded-lg bg-background border border-border/50 flex items-center justify-center shadow-sm">
                            {getIconForType(ws.type)}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-foreground text-sm">{ws.displayName}</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground font-normal">{getSiteTypeLabel(ws.type)}</span>
                              {ws.teamsConnected && (
                                <span className="text-[10px] font-semibold text-blue-500 bg-blue-500/10 px-1.5 py-0.5 rounded">Teams</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="relative z-10">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{ws.size}</span>
                          <span className="text-xs text-muted-foreground">{ws.usage} Activity</span>
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
                Showing {workspaces.length} workspaces
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Bulk Edit Sheet */}
      <Sheet open={isBulkEditOpen} onOpenChange={setIsBulkEditOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] border-l-border/50 bg-card/95 backdrop-blur-xl">
          <SheetHeader>
            <SheetTitle>Bulk Edit Properties</SheetTitle>
            <SheetDescription>
              Applying changes to {selectedIds.size} selected workspace{selectedIds.size !== 1 ? 's' : ''}.
            </SheetDescription>
          </SheetHeader>
          <div className="py-6 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Sensitivity Label</Label>
                <Select value={bulkSensitivity} onValueChange={setBulkSensitivity}>
                  <SelectTrigger className="w-full bg-background/50">
                    <SelectValue placeholder="Select new label..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PUBLIC">Public</SelectItem>
                    <SelectItem value="INTERNAL">Internal</SelectItem>
                    <SelectItem value="CONFIDENTIAL">Confidential</SelectItem>
                    <SelectItem value="HIGHLY_CONFIDENTIAL">Highly Confidential</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Retention Policy</Label>
                <Select value={bulkRetention} onValueChange={setBulkRetention}>
                  <SelectTrigger className="w-full bg-background/50">
                    <SelectValue placeholder="Select retention policy..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Default 7 Year">Default 7 Year</SelectItem>
                    <SelectItem value="Executive 10 Year">Executive 10 Year</SelectItem>
                    <SelectItem value="No Retention (Delete)">No Retention (Delete)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Department Metadata</Label>
                <Input placeholder="Update department value..." className="bg-background/50" value={bulkDepartment} onChange={(e) => setBulkDepartment(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Cost Center</Label>
                <Input placeholder="Update cost center..." className="bg-background/50" value={bulkCostCenter} onChange={(e) => setBulkCostCenter(e.target.value)} />
              </div>
            </div>

            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm text-amber-600 dark:text-amber-500">
              <span className="font-semibold block mb-1">Warning</span>
              Bulk applying a higher sensitivity label may immediately restrict access for existing external guests across these workspaces.
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setIsBulkEditOpen(false)}>Cancel</Button>
            <Button onClick={handleBulkSave} disabled={bulkMutation.isPending} className="gap-2 shadow-md shadow-primary/20">
              {bulkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {bulkMutation.isPending ? "Applying..." : "Apply Changes"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Filter Drawer */}
      <Sheet open={showFilterDrawer} onOpenChange={setShowFilterDrawer}>
        <SheetContent side="left" className="w-[300px] sm:w-[400px] border-r-border/50 bg-card/95 backdrop-blur-xl">
          <SheetHeader>
            <SheetTitle>Filter Directory</SheetTitle>
            <SheetDescription>
              Narrow down workspaces by attributes and policies.
            </SheetDescription>
          </SheetHeader>
          <div className="py-6 space-y-6">
            <div className="space-y-2">
              <Label>Workspace Type</Label>
              <Select defaultValue="all">
                <SelectTrigger className="w-full bg-background/50">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="team_site">Team Site</SelectItem>
                  <SelectItem value="communication_site">Communication Site</SelectItem>
                  <SelectItem value="hub_site">Hub Site</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Sensitivity</Label>
              <Select defaultValue="all">
                <SelectTrigger className="w-full bg-background/50">
                  <SelectValue placeholder="All classifications" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classifications</SelectItem>
                  <SelectItem value="highly_confidential">Highly Confidential</SelectItem>
                  <SelectItem value="confidential">Confidential</SelectItem>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="public">Public</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Metadata Status</Label>
              <Select defaultValue="missing">
                <SelectTrigger className="w-full bg-background/50 border-amber-500/50 focus:ring-amber-500/50">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Status</SelectItem>
                  <SelectItem value="complete">Complete</SelectItem>
                  <SelectItem value="missing">Missing Required Fields</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={() => setShowFilterDrawer(false)} className="w-full">
              Close Filters
            </Button>
            <Button onClick={() => setShowFilterDrawer(false)} className="w-full">
              Apply Filters
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}