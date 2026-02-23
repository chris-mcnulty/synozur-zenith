import { useQuery } from "@tanstack/react-query";
import type { Workspace } from "@shared/schema";
import { useTenant } from "@/lib/tenant-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, Globe, Users, Hash, ChevronRight, Search, Filter, Info, Building2, Folder } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useState, useMemo } from "react";

export default function StructuresPage() {
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id;
  const [searchTerm, setSearchTerm] = useState("");

  const { data: workspaces = [], isLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/workspaces", tenantConnectionId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      return fetch(`/api/workspaces?${params}`).then(r => r.json());
    },
  });

  const stats = useMemo(() => {
    const hubSites = workspaces.filter(w => w.isHubSite);
    const associatedSites = workspaces.filter(w => w.hubSiteId && !w.isHubSite);
    const orphanedSites = workspaces.filter(w => !w.hubSiteId && !w.isHubSite);
    const teamSites = workspaces.filter(w => w.type === "TEAM_SITE");
    const commSites = workspaces.filter(w => w.type === "COMMUNICATION_SITE");

    const departments = new Map<string, Workspace[]>();
    workspaces.forEach(w => {
      const dept = w.department || "Unassigned";
      if (!departments.has(dept)) departments.set(dept, []);
      departments.get(dept)!.push(w);
    });

    const typeGroups = new Map<string, Workspace[]>();
    workspaces.forEach(w => {
      const type = w.type || "UNKNOWN";
      if (!typeGroups.has(type)) typeGroups.set(type, []);
      typeGroups.get(type)!.push(w);
    });

    return { hubSites, associatedSites, orphanedSites, teamSites, commSites, departments, typeGroups };
  }, [workspaces]);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "TEAM_SITE": return "Team Site";
      case "COMMUNICATION_SITE": return "Communication Site";
      case "HUB_SITE": return "Hub Site";
      default: return type;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "TEAM_SITE": return <Users className="w-5 h-5" />;
      case "COMMUNICATION_SITE": return <Globe className="w-5 h-5" />;
      case "HUB_SITE": return <Layers className="w-5 h-5" />;
      default: return <Folder className="w-5 h-5" />;
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

  const filteredDepartments = useMemo(() => {
    const entries = Array.from(stats.departments.entries()).sort((a, b) => b[1].length - a[1].length);
    if (!searchTerm) return entries;
    const term = searchTerm.toLowerCase();
    return entries.filter(([dept, sites]) =>
      dept.toLowerCase().includes(term) || sites.some(s => s.displayName?.toLowerCase().includes(term))
    );
  }, [stats.departments, searchTerm]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-structures-title">Site Structures</h1>
          <p className="text-muted-foreground mt-1">Site architecture breakdown by type and department from your inventory.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-sites">{isLoading ? "—" : workspaces.length}</div>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Hub Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-hub-sites">{isLoading ? "—" : stats.hubSites.length}</div>
            {!isLoading && stats.hubSites.length === 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">Not detected in sync</p>
            )}
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Departments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-dept-count">
              {isLoading ? "—" : stats.departments.size - (stats.departments.has("Unassigned") ? 1 : 0)}
            </div>
            {!isLoading && stats.departments.has("Unassigned") && (
              <p className="text-[10px] text-amber-500 mt-1">{stats.departments.get("Unassigned")!.length} unassigned</p>
            )}
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Site Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {Array.from(stats.typeGroups.entries()).map(([type, sites]) => (
                <Badge key={type} variant="outline" className="text-[10px]" data-testid={`badge-type-${type}`}>
                  {getTypeLabel(type)}: {sites.length}
                </Badge>
              ))}
              {isLoading && <span className="text-sm text-muted-foreground">—</span>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50 shadow-xl">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Building2 className="w-5 h-5 text-primary" />
              Department Structure
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search departments or sites..."
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
          ) : filteredDepartments.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm" data-testid="status-empty">No matching departments or sites found.</div>
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
                    {sites.map(site => (
                      <Link key={site.id} href={`/app/workspaces/${site.id}`}>
                        <div className="pl-14 pr-4 py-3 hover:bg-muted/10 transition-colors flex items-center justify-between cursor-pointer" data-testid={`row-site-${site.id}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-7 h-7 rounded flex items-center justify-center ${getTypeColor(site.type)}`}>
                              {getTypeIcon(site.type)}
                            </div>
                            <div>
                              <span className="text-sm font-medium" data-testid={`text-site-name-${site.id}`}>{site.displayName}</span>
                              {site.siteUrl && (
                                <div className="text-[10px] text-muted-foreground truncate max-w-[300px]">{site.siteUrl}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {site.teamsConnected && (
                              <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/20" data-testid={`badge-teams-${site.id}`}>Teams</Badge>
                            )}
                            {site.sensitivity && (
                              <Badge variant={site.sensitivity === "HIGHLY_CONFIDENTIAL" ? "destructive" : "secondary"} className={`text-[9px] ${site.sensitivity === "HIGHLY_CONFIDENTIAL" ? "bg-destructive/10 border-destructive/20" : ""}`} data-testid={`badge-sensitivity-${site.id}`}>
                                {site.sensitivity.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, c => c.toLowerCase())}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!isLoading && stats.hubSites.length === 0 && (
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50 flex gap-4">
          <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-muted-foreground">
            <Info className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-semibold text-sm">Hub Site Detection</h4>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              No hub sites were detected in your current inventory. Hub site associations are populated during tenant sync from SharePoint usage reports. 
              If your tenant uses hub sites, they will appear here after a full sync.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
