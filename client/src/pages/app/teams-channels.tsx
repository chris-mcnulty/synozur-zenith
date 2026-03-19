import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MessagesSquare,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  Users,
  Lock,
  Globe,
  Hash,
  Volume2,
  Archive,
  Settings,
} from "lucide-react";

type ChannelType = "standard" | "private" | "shared";
type TeamPrivacy = "Public" | "Private";

interface Channel {
  id: string;
  name: string;
  type: ChannelType;
  lastActivity: string;
  memberCount?: number;
}

interface Team {
  id: string;
  name: string;
  description: string;
  privacy: TeamPrivacy;
  memberCount: number;
  channelCount: number;
  channels: Channel[];
  status: "Active" | "Archived";
}

const MOCK_TEAMS: Team[] = [
  {
    id: "team-1",
    name: "Engineering — Platform",
    description: "Core platform engineering team for backend infrastructure and APIs.",
    privacy: "Private",
    memberCount: 14,
    channelCount: 5,
    status: "Active",
    channels: [
      { id: "ch-1-1", name: "General", type: "standard", lastActivity: "2 hours ago" },
      { id: "ch-1-2", name: "Announcements", type: "standard", lastActivity: "1 day ago" },
      { id: "ch-1-3", name: "Incident Response", type: "private", lastActivity: "3 hours ago", memberCount: 6 },
      { id: "ch-1-4", name: "Releases", type: "standard", lastActivity: "5 hours ago" },
      { id: "ch-1-5", name: "External Vendors", type: "shared", lastActivity: "2 days ago", memberCount: 9 },
    ],
  },
  {
    id: "team-2",
    name: "Marketing & Brand",
    description: "Content strategy, campaign execution, and brand identity management.",
    privacy: "Public",
    memberCount: 22,
    channelCount: 4,
    status: "Active",
    channels: [
      { id: "ch-2-1", name: "General", type: "standard", lastActivity: "30 minutes ago" },
      { id: "ch-2-2", name: "Campaign Planning", type: "standard", lastActivity: "1 hour ago" },
      { id: "ch-2-3", name: "Design Reviews", type: "private", lastActivity: "4 hours ago", memberCount: 8 },
      { id: "ch-2-4", name: "Agency Collaboration", type: "shared", lastActivity: "1 day ago", memberCount: 12 },
    ],
  },
  {
    id: "team-3",
    name: "Finance & Compliance",
    description: "Financial reporting, audit trails, and regulatory compliance oversight.",
    privacy: "Private",
    memberCount: 9,
    channelCount: 3,
    status: "Active",
    channels: [
      { id: "ch-3-1", name: "General", type: "standard", lastActivity: "6 hours ago" },
      { id: "ch-3-2", name: "Audit Prep", type: "private", lastActivity: "2 days ago", memberCount: 4 },
      { id: "ch-3-3", name: "Budget Review", type: "private", lastActivity: "3 days ago", memberCount: 5 },
    ],
  },
  {
    id: "team-4",
    name: "Customer Success",
    description: "Onboarding, retention, and support escalations for enterprise accounts.",
    privacy: "Public",
    memberCount: 31,
    channelCount: 6,
    status: "Active",
    channels: [
      { id: "ch-4-1", name: "General", type: "standard", lastActivity: "15 minutes ago" },
      { id: "ch-4-2", name: "Escalations", type: "standard", lastActivity: "45 minutes ago" },
      { id: "ch-4-3", name: "Onboarding", type: "standard", lastActivity: "2 hours ago" },
      { id: "ch-4-4", name: "Enterprise Accounts", type: "private", lastActivity: "1 day ago", memberCount: 11 },
      { id: "ch-4-5", name: "NPS & Feedback", type: "standard", lastActivity: "3 days ago" },
      { id: "ch-4-6", name: "Partner Portal", type: "shared", lastActivity: "1 week ago", memberCount: 17 },
    ],
  },
  {
    id: "team-5",
    name: "Product Design — Archived",
    description: "Legacy product design team (migrated into Engineering — Platform).",
    privacy: "Private",
    memberCount: 7,
    channelCount: 2,
    status: "Archived",
    channels: [
      { id: "ch-5-1", name: "General", type: "standard", lastActivity: "3 months ago" },
      { id: "ch-5-2", name: "Design Assets", type: "standard", lastActivity: "3 months ago" },
    ],
  },
];

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

function TeamRow({ team }: { team: Team }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-xl overflow-hidden" data-testid={`card-team-${team.id}`}>
      <div
        className="flex items-center gap-4 px-5 py-4 bg-card hover:bg-muted/30 transition-colors cursor-pointer select-none"
        onClick={() => setExpanded(e => !e)}
        data-testid={`button-expand-team-${team.id}`}
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
              <span className="font-semibold text-sm text-foreground truncate" data-testid={`text-team-name-${team.id}`}>
                {team.name}
              </span>
              {team.status === "Archived" && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Archived</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">{team.description}</p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-6 shrink-0 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground" data-testid={`text-team-privacy-${team.id}`}>
            {team.privacy === "Private"
              ? <Lock className="w-3.5 h-3.5" />
              : <Globe className="w-3.5 h-3.5" />}
            <span className="text-xs">{team.privacy}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground" data-testid={`text-team-members-${team.id}`}>
            <Users className="w-3.5 h-3.5" />
            <span className="text-xs">{team.memberCount} members</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground" data-testid={`text-team-channels-${team.id}`}>
            <Hash className="w-3.5 h-3.5" />
            <span className="text-xs">{team.channelCount} channels</span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" data-testid={`button-team-settings-${team.id}`}>
            <Settings className="w-3.5 h-3.5 mr-1" />
            Manage
          </Button>
          {team.status !== "Archived" && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" data-testid={`button-team-archive-${team.id}`}>
              <Archive className="w-3.5 h-3.5 mr-1" />
              Archive
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/40 bg-muted/10">
          <div className="px-5 py-3 flex items-center justify-between">
            <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Channels</h4>
            <Button variant="outline" size="sm" className="h-7 text-xs" data-testid={`button-add-channel-${team.id}`}>
              <Plus className="w-3 h-3 mr-1" />
              Add Channel
            </Button>
          </div>
          <div className="divide-y divide-border/30">
            {team.channels.map(channel => (
              <div
                key={channel.id}
                className="flex items-center gap-3 px-6 py-2.5 hover:bg-muted/20 transition-colors"
                data-testid={`row-channel-${channel.id}`}
              >
                <div className="shrink-0">{channelTypeIcon(channel.type)}</div>
                <span className="text-sm font-medium flex-1" data-testid={`text-channel-name-${channel.id}`}>
                  {channel.name}
                </span>
                <div className="hidden sm:flex items-center gap-3">
                  {channelTypeBadge(channel.type)}
                  {channel.memberCount !== undefined && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {channel.memberCount}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground w-28 text-right" data-testid={`text-channel-activity-${channel.id}`}>
                    {channel.lastActivity}
                  </span>
                </div>
                <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground ml-2" data-testid={`button-archive-channel-${channel.id}`}>
                  <Archive className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeamsChannelsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Archived">("all");

  const filteredTeams = MOCK_TEAMS.filter(t => {
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeCount = MOCK_TEAMS.filter(t => t.status === "Active").length;
  const archivedCount = MOCK_TEAMS.filter(t => t.status === "Archived").length;
  const totalMembers = MOCK_TEAMS.filter(t => t.status === "Active").reduce((s, t) => s + t.memberCount, 0);
  const totalChannels = MOCK_TEAMS.reduce((s, t) => s + t.channelCount, 0);

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
            View and manage Microsoft Teams teams and their channels across your tenant.
          </p>
        </div>
        <Button className="shrink-0" data-testid="button-new-team">
          <Plus className="w-4 h-4 mr-2" />
          New Team
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Active Teams</p>
            <p className="text-2xl font-bold" data-testid="stat-active-teams">{activeCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Archived Teams</p>
            <p className="text-2xl font-bold text-muted-foreground" data-testid="stat-archived-teams">{archivedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Members</p>
            <p className="text-2xl font-bold" data-testid="stat-total-members">{totalMembers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Channels</p>
            <p className="text-2xl font-bold" data-testid="stat-total-channels">{totalChannels}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search teams..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-teams"
          />
        </div>
        <div className="flex gap-2 shrink-0">
          {(["all", "Active", "Archived"] as const).map(f => (
            <Button
              key={f}
              variant={statusFilter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(f)}
              data-testid={`button-filter-${f.toLowerCase()}`}
            >
              {f === "all" ? "All" : f}
            </Button>
          ))}
        </div>
      </div>

      {/* Teams List */}
      <div className="space-y-3">
        {filteredTeams.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <MessagesSquare className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No teams match your search.</p>
            </CardContent>
          </Card>
        ) : (
          filteredTeams.map(team => <TeamRow key={team.id} team={team} />)
        )}
      </div>
    </div>
  );
}
