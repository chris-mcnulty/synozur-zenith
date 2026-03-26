import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTenant } from "@/lib/tenant-context";
import {
  MessagesSquare,
  Search,
  ChevronDown,
  ChevronRight,
  Lock,
  Globe,
  Hash,
  Video,
  Loader2,
  RefreshCw,
  Info,
  Users,
  Shield,
  Archive,
  Link2,
  Calendar,
} from "lucide-react";

type ChannelType = "standard" | "private" | "shared";

interface ChannelSummary {
  channelId: string;
  channelDisplayName: string;
  channelType: ChannelType;
  recordingCount: number;
  lastActivity: string | null;
}

interface TeamSummary {
  teamId: string;
  teamDisplayName: string;
  channelCount: number;
  recordingCount: number;
  channels: ChannelSummary[];
}

interface TeamsInventoryItem {
  id: string;
  tenantConnectionId: string;
  teamId: string;
  displayName: string;
  description: string | null;
  mailNickname: string | null;
  visibility: string | null;
  isArchived: boolean | null;
  classification: string | null;
  createdDateTime: string | null;
  renewedDateTime: string | null;
  memberCount: number | null;
  ownerCount: number | null;
  guestCount: number | null;
  sharepointSiteUrl: string | null;
  sharepointSiteId: string | null;
  sensitivityLabel: string | null;
  lastDiscoveredAt: string | null;
  discoveryStatus: string;
}

function channelTypeIcon(type: ChannelType) {
  switch (type) {
    case "private":
      return <Lock className="w-3.5 h-3.5 text-amber-500" />;
    case "shared":
      return <Globe className="w-3.5 h-3.5 text-blue-500" />;
    default:
      return <Hash className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function channelTypeBadge(type: ChannelType) {
  switch (type) {
    case "private":
      return <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/5 text-[10px] px-1.5 py-0">Private</Badge>;
    case "shared":
      return <Badge variant="outline" className="text-blue-500 border-blue-500/30 bg-blue-500/5 text-[10px] px-1.5 py-0">Shared</Badge>;
    default:
      return <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">Standard</Badge>;
  }
}

function visibilityBadge(visibility: string | null) {
  switch (visibility) {
    case "Private":
      return <Badge variant="outline" className="text-amber-500 border-amber-500/30 bg-amber-500/5 text-[10px] px-1.5 py-0"><Lock className="w-2.5 h-2.5 mr-0.5" />Private</Badge>;
    case "Public":
      return <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/5 text-[10px] px-1.5 py-0"><Globe className="w-2.5 h-2.5 mr-0.5" />Public</Badge>;
    case "HiddenMembership":
      return <Badge variant="outline" className="text-purple-500 border-purple-500/30 bg-purple-500/5 text-[10px] px-1.5 py-0"><Shield className="w-2.5 h-2.5 mr-0.5" />Hidden</Badge>;
    default:
      return null;
  }
}

function formatLastActivity(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return date.toLocaleDateString();
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString();
}

function TeamRow({ team, inventory }: { team: TeamSummary; inventory?: TeamsInventoryItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-xl overflow-hidden" data-testid={`card-team-${team.teamId}`}>
      <div
        className="flex items-center gap-4 px-5 py-4 bg-card hover:bg-muted/30 transition-colors cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
        data-testid={`button-expand-team-${team.teamId}`}
      >
        <div className="text-muted-foreground">
          {expanded
            ? <ChevronDown className="w-4 h-4" />
            : <ChevronRight className="w-4 h-4" />}
        </div>

        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <MessagesSquare className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-foreground truncate" data-testid={`text-team-name-${team.teamId}`}>
                {team.teamDisplayName}
              </span>
              {inventory?.isArchived && (
                <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">
                  <Archive className="w-2.5 h-2.5 mr-0.5" />Archived
                </Badge>
              )}
              {visibilityBadge(inventory?.visibility ?? null)}
              {inventory?.sensitivityLabel && (
                <Badge variant="outline" className="text-purple-600 border-purple-600/30 bg-purple-600/5 text-[10px] px-1.5 py-0">
                  <Shield className="w-2.5 h-2.5 mr-0.5" />{inventory.sensitivityLabel}
                </Badge>
              )}
            </div>
            {inventory?.description && (
              <span className="text-xs text-muted-foreground truncate block max-w-md">{inventory.description}</span>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-6 shrink-0 text-sm">
          {inventory?.memberCount != null && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="w-3.5 h-3.5" />
              <span className="text-xs">{inventory.memberCount} members</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-muted-foreground" data-testid={`text-team-channels-${team.teamId}`}>
            <Hash className="w-3.5 h-3.5" />
            <span className="text-xs">{team.channelCount} channels</span>
          </div>
          {team.recordingCount > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground" data-testid={`text-team-recordings-${team.teamId}`}>
              <Video className="w-3.5 h-3.5" />
              <span className="text-xs">{team.recordingCount} recordings</span>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/40 bg-muted/10">
          {/* Team properties row */}
          {inventory && (
            <div className="px-5 py-3 border-b border-border/30 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
              {inventory.ownerCount != null && (
                <span className="flex items-center gap-1"><Users className="w-3 h-3" />{inventory.ownerCount} owners</span>
              )}
              {inventory.guestCount != null && inventory.guestCount > 0 && (
                <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{inventory.guestCount} guests</span>
              )}
              {inventory.classification && (
                <span className="flex items-center gap-1"><Shield className="w-3 h-3" />{inventory.classification}</span>
              )}
              {inventory.createdDateTime && (
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Created {formatDate(inventory.createdDateTime)}</span>
              )}
              {inventory.sharepointSiteUrl && (
                <a
                  href={inventory.sharepointSiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                  onClick={e => e.stopPropagation()}
                >
                  <Link2 className="w-3 h-3" />SharePoint site
                </a>
              )}
            </div>
          )}

          <div className="px-5 py-3">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Channels</h4>
          </div>
          {team.channels.length === 0 ? (
            <div className="px-6 py-4 text-xs text-muted-foreground">No channels discovered yet.</div>
          ) : (
            <div className="divide-y divide-border/30">
              {team.channels.map(channel => (
                <div
                  key={channel.channelId}
                  className="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/20 transition-colors"
                  data-testid={`row-channel-${channel.channelId}`}
                >
                  <div className="shrink-0">{channelTypeIcon(channel.channelType)}</div>
                  <span className="text-sm font-medium flex-1" data-testid={`text-channel-name-${channel.channelId}`}>
                    {channel.channelDisplayName}
                  </span>
                  <div className="hidden sm:flex items-center gap-3">
                    {channelTypeBadge(channel.channelType)}
                    {channel.recordingCount > 0 && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Video className="w-3 h-3" />
                        {channel.recordingCount}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground w-28 text-right" data-testid={`text-channel-activity-${channel.channelId}`}>
                      {formatLastActivity(channel.lastActivity)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeamsChannelsPage() {
  const [search, setSearch] = useState("");
  const { selectedTenant } = useTenant();
  const { toast } = useToast();
  const tenantConnectionId = selectedTenant?.id;

  const { data: teams = [], isLoading } = useQuery<TeamSummary[]>({
    queryKey: ["/api/teams-channels", tenantConnectionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      const res = await fetch(`/api/teams-channels?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load Teams inventory");
      return res.json();
    },
  });

  // Also fetch full inventory for enrichment
  const { data: inventory = [] } = useQuery<TeamsInventoryItem[]>({
    queryKey: ["/api/teams-inventory", tenantConnectionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (tenantConnectionId) params.set("tenantConnectionId", tenantConnectionId);
      const res = await fetch(`/api/teams-inventory?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load Teams inventory");
      return res.json();
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!tenantConnectionId) throw new Error("No tenant selected");
      const res = await fetch(`/api/admin/tenants/${tenantConnectionId}/teams-inventory/sync`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to start sync");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Teams sync started", description: "Discovering all teams and channels…" });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/teams-channels", tenantConnectionId] });
        queryClient.invalidateQueries({ queryKey: ["/api/teams-inventory", tenantConnectionId] });
      }, 5000);
    },
    onError: (err: any) => {
      toast({ title: "Sync failed", description: err.message, variant: "destructive" });
    },
  });

  // Build inventory lookup by teamId
  const inventoryByTeamId = new Map<string, TeamsInventoryItem>();
  for (const item of inventory) {
    inventoryByTeamId.set(item.teamId, item);
  }

  const filteredTeams = teams.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    const inv = inventoryByTeamId.get(t.teamId);
    return (
      t.teamDisplayName.toLowerCase().includes(q) ||
      t.channels.some(ch => ch.channelDisplayName.toLowerCase().includes(q)) ||
      inv?.description?.toLowerCase().includes(q) ||
      inv?.mailNickname?.toLowerCase().includes(q)
    );
  });

  const totalChannels = teams.reduce((s, t) => s + t.channelCount, 0);
  const totalRecordings = teams.reduce((s, t) => s + t.recordingCount, 0);
  const archivedCount = inventory.filter(t => t.isArchived).length;
  const privateCount = inventory.filter(t => t.visibility === "Private").length;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <MessagesSquare className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Teams &amp; Channels</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Full inventory of all Teams and Channels across connected tenants.
          </p>
        </div>
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending || !tenantConnectionId}
          title={!tenantConnectionId ? "Select a tenant to sync" : undefined}
        >
          {syncMutation.isPending
            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Syncing…</>
            : <><RefreshCw className="mr-2 h-4 w-4" />Sync Teams</>}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Teams</p>
            <p className="text-2xl font-bold" data-testid="stat-teams">{teams.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Channels</p>
            <p className="text-2xl font-bold" data-testid="stat-channels">{totalChannels}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Recordings</p>
            <p className="text-2xl font-bold" data-testid="stat-recordings">{totalRecordings}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Private</p>
            <p className="text-2xl font-bold text-amber-500">{privateCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Archived</p>
            <p className="text-2xl font-bold text-muted-foreground">{archivedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search teams or channels..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-teams"
          />
        </div>
      </div>

      {/* Info banner */}
      {!isLoading && teams.length > 0 && inventory.length === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200/50 bg-blue-50/50 dark:border-blue-900/50 dark:bg-blue-950/20 px-4 py-3">
          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-400">
            Showing teams discovered from recordings only. Select a tenant and click "Sync Teams" to discover all teams with full properties.
          </p>
        </div>
      )}

      {/* Teams List */}
      <div className="space-y-3">
        {isLoading ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin opacity-40" />
              <p className="text-sm">Loading teams...</p>
            </CardContent>
          </Card>
        ) : filteredTeams.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <MessagesSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
              {teams.length === 0 ? (
                <>
                  <p className="text-sm font-medium mb-1">No teams discovered yet</p>
                  <p className="text-xs">Select a tenant and click "Sync Teams" above, or run a Recordings Discovery to find meeting recordings.</p>
                </>
              ) : (
                <p className="text-sm">No teams match your search.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredTeams.map(team => (
            <TeamRow
              key={team.teamId}
              team={team}
              inventory={inventoryByTeamId.get(team.teamId)}
            />
          ))
        )}
      </div>
    </div>
  );
}
