import { useQuery } from "@tanstack/react-query";
import type { Workspace } from "@shared/schema";
import { useTenant } from "@/lib/tenant-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers, Globe, Users, ChevronRight, Search, Info, Building2, Folder, Unlink, Network } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useState, useMemo } from "react";

interface HubNode {
  hub: Workspace;
  childHubs: HubNode[];
  associatedSites: Workspace[];
  totalChildren: number;
}

interface StructuresData {
  hubHierarchy: HubNode[];
  unassociatedSites: Workspace[];
  totalSites: number;
  hubSiteCount: number;
  associatedCount: number;
  unassociatedCount: number;
}

export default function StructuresPage() {
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id;
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"hub" | "unassociated" | "department">("hub");

  const { data, isLoading } = useQuery<StructuresData>({
    queryKey: ["/api/structures", tenantConnectionId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      return fetch(`/api/structures?${params}`).then(r => r.json());
    },
  });

  const { data: workspaces = [] } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces", tenantConnectionId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      return fetch(`/api/workspaces?${params}`).then(r => r.json());
    },
  });

  const departments = useMemo(() => {
    const map = new Map<string, Workspace[]>();
    workspaces.forEach(w => {
      const dept = w.department || "Unassigned";
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept)!.push(w);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [workspaces]);

  const typeGroups = useMemo(() => {
    const map = new Map<string, number>();
    workspaces.forEach(w => {
      const type = w.type || "UNKNOWN";
      map.set(type, (map.get(type) || 0) + 1);
    });
    return map;
  }, [workspaces]);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "TEAM_SITE": return "Team Site";
      case "COMMUNICATION_SITE": return "Comm Site";
      case "HUB_SITE": return "Hub Site";
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "TEAM_SITE": return <Users className="w-4 h-4" />;
      case "COMMUNICATION_SITE": return <Globe className="w-4 h-4" />;
      case "HUB_SITE": return <Layers className="w-4 h-4" />;
      default: return <Folder className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "TEAM_SITE": return "bg-teal-500/10 text-teal-500";
      case "COMMUNICATION_SITE": return "bg-blue-500/10 text-blue-500";
      case "HUB_SITE": return "bg-purple-500/10 text-purple-500";
      default: return "bg-muted/50 text-muted-foreground";
    }
  };

  const matchesSearch = (node: HubNode, term: string): boolean => {
    if (node.hub.displayName?.toLowerCase().includes(term)) return true;
    if (node.associatedSites.some(s => s.displayName?.toLowerCase().includes(term))) return true;
    if (node.childHubs.some(ch => matchesSearch(ch, term))) return true;
    return false;
  };

  const filteredHierarchy = useMemo(() => {
    if (!data) return [];
    if (!searchTerm) return data.hubHierarchy;
    const term = searchTerm.toLowerCase();
    return data.hubHierarchy.filter(node => matchesSearch(node, term));
  }, [data, searchTerm]);

  const filteredUnassociated = useMemo(() => {
    if (!data) return [];
    if (!searchTerm) return data.unassociatedSites;
    const term = searchTerm.toLowerCase();
    return data.unassociatedSites.filter(s =>
      s.displayName?.toLowerCase().includes(term) ||
      s.siteUrl?.toLowerCase().includes(term) ||
      s.department?.toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  const filteredDepartments = useMemo(() => {
    if (!searchTerm) return departments;
    const term = searchTerm.toLowerCase();
    return departments.filter(([dept, sites]) =>
      dept.toLowerCase().includes(term) || sites.some(s => s.displayName?.toLowerCase().includes(term))
    );
  }, [departments, searchTerm]);

  const hasHubData = data && data.hubSiteCount > 0;

  const renderSiteRow = (site: Workspace, indent: number = 0) => (
    <Link key={site.id} href={`/app/workspaces/${site.id}`}>
      <div
        className="pr-4 py-3 hover:bg-muted/10 transition-colors flex items-center justify-between cursor-pointer"
        style={{ paddingLeft: `${indent * 16 + 56}px` }}
        data-testid={`row-site-${site.id}`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-7 h-7 rounded flex items-center justify-center ${getTypeColor(site.type)}`}>
            {getTypeIcon(site.type)}
          </div>
          <div>
            <span className="text-sm font-medium" data-testid={`text-site-name-${site.id}`}>{site.displayName}</span>
            {site.siteUrl && (
              <div className="text-[10px] text-muted-foreground truncate max-w-[280px]">{site.siteUrl}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {site.department && site.department !== "Unassigned" && (
            <Badge variant="outline" className="text-[9px]" data-testid={`badge-dept-${site.id}`}>{site.department}</Badge>
          )}
          {site.teamsConnected && (
            <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/20" data-testid={`badge-teams-${site.id}`}>Teams</Badge>
          )}
          <Badge variant="outline" className="text-[9px]">{getTypeLabel(site.type)}</Badge>
        </div>
      </div>
    </Link>
  );

  const renderHubNode = (node: HubNode, depth: number = 0) => {
    const isChildHub = depth > 0;
    const totalAssociated = node.associatedSites.length;
    const totalChildHubs = node.childHubs.length;

    return (
      <details key={node.hub.id} className="group/hub" open={depth === 0 || filteredHierarchy.length <= 3}>
        <summary
          className="hover:bg-muted/10 transition-colors flex items-center justify-between cursor-pointer list-none"
          style={{ padding: `12px 16px 12px ${depth * 16 + 16}px` }}
          data-testid={`toggle-hub-${node.hub.id}`}
        >
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${
              isChildHub
                ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-500"
                : "border-purple-500/30 bg-purple-500/10 text-purple-500"
            }`}>
              {isChildHub ? <Network className="w-5 h-5" /> : <Layers className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-semibold" data-testid={`text-hub-name-${node.hub.id}`}>{node.hub.displayName}</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                {totalChildHubs > 0 && (
                  <span>{totalChildHubs} child hub{totalChildHubs !== 1 ? "s" : ""}</span>
                )}
                {totalChildHubs > 0 && totalAssociated > 0 && <span>·</span>}
                {totalAssociated > 0 && (
                  <span>{totalAssociated} site{totalAssociated !== 1 ? "s" : ""}</span>
                )}
                {totalChildHubs === 0 && totalAssociated === 0 && (
                  <span className="text-muted-foreground/60">No children</span>
                )}
                {node.hub.siteUrl && (
                  <>
                    <span>·</span>
                    <span className="truncate max-w-[220px]">{node.hub.siteUrl}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`text-[9px] ${
              isChildHub
                ? "bg-indigo-500/10 text-indigo-600 border-indigo-500/20"
                : "bg-purple-500/10 text-purple-600 border-purple-500/20"
            }`}>
              {isChildHub ? "Child Hub" : "Root Hub"}
            </Badge>
            <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-open/hub:rotate-90" />
          </div>
        </summary>
        <div className="border-t border-border/20 bg-muted/5">
          <Link href={`/app/workspaces/${node.hub.id}`}>
            <div
              className="pr-4 py-2.5 hover:bg-muted/10 transition-colors flex items-center gap-3 cursor-pointer border-b border-border/10"
              style={{ paddingLeft: `${depth * 16 + 56}px` }}
              data-testid={`row-hub-self-${node.hub.id}`}
            >
              <div className={`w-6 h-6 rounded flex items-center justify-center ${
                isChildHub ? "bg-indigo-500/10 text-indigo-500" : "bg-purple-500/10 text-purple-500"
              }`}>
                {isChildHub ? <Network className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
              </div>
              <span className={`text-sm font-medium ${isChildHub ? "text-indigo-600" : "text-purple-600"}`}>
                {node.hub.displayName}
              </span>
              <Badge variant="outline" className="text-[9px] ml-1">Hub Root</Badge>
            </div>
          </Link>

          {node.childHubs.map(childNode => renderHubNode(childNode, depth + 1))}

          {node.associatedSites.length > 0 && (
            node.associatedSites.map(site => renderSiteRow(site, depth + 1))
          )}

          {node.childHubs.length === 0 && node.associatedSites.length === 0 && (
            <div
              className="pr-4 py-3 text-xs text-muted-foreground"
              style={{ paddingLeft: `${depth * 16 + 56}px` }}
            >
              No child sites or hubs associated.
            </div>
          )}
        </div>
      </details>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-structures-title">Site Structures</h1>
          <p className="text-muted-foreground mt-1">Hub site hierarchy, site associations, and structural overview of your tenant.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-sites">{isLoading ? "\u2014" : data?.totalSites ?? workspaces.length}</div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Hub Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-500" data-testid="text-hub-sites">{isLoading ? "\u2014" : data?.hubSiteCount ?? 0}</div>
            {!isLoading && (data?.hubSiteCount ?? 0) === 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">Detected during sync</p>
            )}
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Associated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500" data-testid="text-associated-sites">{isLoading ? "\u2014" : data?.associatedCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1">Linked to a hub</p>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Standalone</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500" data-testid="text-unassociated-sites">{isLoading ? "\u2014" : data?.unassociatedCount ?? 0}</div>
            <p className="text-[10px] text-muted-foreground mt-1">No hub association</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-1 text-xs">
        <div className="flex items-center gap-1 flex-wrap">
          {Array.from(typeGroups.entries()).map(([type, count]) => (
            <Badge key={type} variant="outline" className="text-[10px]" data-testid={`badge-type-${type}`}>
              {getTypeLabel(type)}: {count}
            </Badge>
          ))}
        </div>
      </div>

      <Card className="glass-panel border-border/50 shadow-xl">
        <CardHeader className="pb-0 border-b border-border/40 bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab("hub")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "hub"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-hub-hierarchy"
              >
                <Layers className="w-4 h-4 inline mr-1.5" />
                Hub Hierarchy
                {data && <span className="ml-1.5 text-[10px] opacity-70">({data.hubSiteCount})</span>}
              </button>
              <button
                onClick={() => setActiveTab("unassociated")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "unassociated"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-unassociated"
              >
                <Unlink className="w-4 h-4 inline mr-1.5" />
                Standalone
                {data && <span className="ml-1.5 text-[10px] opacity-70">({data.unassociatedCount})</span>}
              </button>
              <button
                onClick={() => setActiveTab("department")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "department"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-departments"
              >
                <Building2 className="w-4 h-4 inline mr-1.5" />
                Departments
                {departments.length > 0 && <span className="ml-1.5 text-[10px] opacity-70">({departments.length})</span>}
              </button>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sites..."
                className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-structures"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm" data-testid="status-loading">Loading site structures...</div>
          ) : activeTab === "hub" ? (
            !hasHubData ? (
              <div className="p-8 text-center" data-testid="status-no-hubs">
                <Layers className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm font-medium text-muted-foreground">No hub sites detected</p>
                <p className="text-xs text-muted-foreground/70 mt-1 max-w-md mx-auto">
                  Hub site hierarchy is fetched from SharePoint during tenant sync. If your tenant uses hub sites, run a sync to populate this view.
                </p>
              </div>
            ) : filteredHierarchy.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm" data-testid="status-no-results">No matching hub sites found.</div>
            ) : (
              <div className="divide-y divide-border/40">
                {filteredHierarchy.map(node => renderHubNode(node, 0))}
              </div>
            )
          ) : activeTab === "unassociated" ? (
            filteredUnassociated.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm" data-testid="status-no-unassociated">
                {data?.unassociatedCount === 0 ? "All sites are associated with a hub." : "No matching standalone sites found."}
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {filteredUnassociated.map(site => (
                  <Link key={site.id} href={`/app/workspaces/${site.id}`}>
                    <div className="px-4 py-3 hover:bg-muted/10 transition-colors flex items-center justify-between cursor-pointer" data-testid={`row-standalone-${site.id}`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded flex items-center justify-center ${getTypeColor(site.type)}`}>
                          {getTypeIcon(site.type)}
                        </div>
                        <div>
                          <span className="text-sm font-medium">{site.displayName}</span>
                          {site.siteUrl && (
                            <div className="text-[10px] text-muted-foreground truncate max-w-[300px]">{site.siteUrl}</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {site.department && site.department !== "Unassigned" && (
                          <Badge variant="outline" className="text-[9px]">{site.department}</Badge>
                        )}
                        <Badge variant="outline" className="text-[9px]">{getTypeLabel(site.type)}</Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )
          ) : (
            filteredDepartments.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm" data-testid="status-no-depts">No matching departments or sites found.</div>
            ) : (
              <div className="divide-y divide-border/40">
                {filteredDepartments.map(([dept, sites]) => (
                  <details key={dept} className="group">
                    <summary className="p-4 hover:bg-muted/10 transition-colors flex items-center justify-between cursor-pointer list-none" data-testid={`toggle-dept-${dept}`}>
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center border border-border/50 ${
                          dept === "Unassigned" ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"
                        }`}>
                          <Building2 className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold" data-testid={`text-dept-name-${dept}`}>{dept}</h3>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span>{sites.length} site{sites.length !== 1 ? "s" : ""}</span>
                            <span>·</span>
                            <span className="flex gap-1">
                              {Array.from(new Set(sites.map(s => s.type))).map(t => (
                                <Badge key={t} variant="outline" className="text-[9px] px-1 py-0">{getTypeLabel(t)}</Badge>
                              ))}
                            </span>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-open:rotate-90" />
                    </summary>
                    <div className="border-t border-border/30 bg-muted/5">
                      {sites.map(site => renderSiteRow(site))}
                    </div>
                  </details>
                ))}
              </div>
            )
          )}
        </CardContent>
      </Card>

      {!isLoading && !hasHubData && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50 flex gap-4">
          <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-muted-foreground">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-semibold text-sm">Hub Site Detection</h4>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              Hub site hierarchy is fetched from the SharePoint REST API during tenant sync. This detects root hubs, child hubs (hubs joined to a parent hub), and which regular sites are associated with each hub. 
              Run a tenant sync to populate the hierarchy.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
