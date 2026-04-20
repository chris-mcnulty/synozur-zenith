/**
 * Copilot Prompt Intelligence dashboard (BL-038)
 *
 * Shows quality and risk analytics for M365 Copilot user-initiated prompts
 * captured from the Microsoft Graph beta API across a 30-day rolling window.
 *
 * Features:
 *  - Trigger sync (Graph → DB) and assessment (analyze + AI narrative)
 *  - Org-level quality/risk metric cards
 *  - Quality & risk distribution bars
 *  - Department breakdown table
 *  - Top-user risk table
 *  - AI executive summary + recommendations
 *  - Assessment history list
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MessageSquareText,
  RefreshCw,
  Play,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ShieldAlert,
  Star,
  TrendingDown,
  TrendingUp,
  Users,
  Building2,
  Sparkles,
  Clock,
  BarChart3,
  ChevronDown,
  Database,
  Info,
} from "lucide-react";
import { UpgradeGate } from "@/components/upgrade-gate";
import { useTenant } from "@/lib/tenant-context";
import { format, formatDistanceToNow } from "date-fns";
import ReactMarkdown from "react-markdown";
import { DatasetFreshnessBanner } from "@/components/datasets";

// ---------------------------------------------------------------------------
// Types (mirroring server-side interfaces)
// ---------------------------------------------------------------------------

type AssessmentStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";

interface QualityDistribution {
  GREAT: number;
  GOOD: number;
  WEAK: number;
  PROBLEMATIC: number;
}

interface RiskDistribution {
  NONE: number;
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  CRITICAL: number;
}

interface OrgSummary {
  totalInteractions: number;
  uniqueUsers: number;
  dateRange: { start: string; end: string };
  qualityDistribution: QualityDistribution;
  averageQualityScore: number;
  riskDistribution: RiskDistribution;
  appClassBreakdown: Record<string, number>;
  topFlags: Array<{ category: string; signal: string; count: number }>;
}

interface DepartmentBreakdown {
  department: string;
  userCount: number;
  interactionCount: number;
  averageQualityScore: number;
  qualityDistribution: QualityDistribution;
  riskDistribution: RiskDistribution;
  topFlags: Array<{ category: string; signal: string; count: number }>;
}

interface UserBreakdown {
  userId: string;
  userPrincipalName: string;
  displayName: string | null;
  department: string | null;
  interactionCount: number;
  averageQualityScore: number;
  qualityDistribution: QualityDistribution;
  criticalFlags: number;
  topRecommendation?: string | null;
}

interface Recommendation {
  rank: number;
  title: string;
  rationale: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  targetScope?: string;
  targetName?: string;
}

interface Assessment {
  id: string;
  organizationId: string;
  tenantConnectionId: string;
  status: AssessmentStatus;
  triggeredBy: string | null;
  interactionCount: number | null;
  userCount: number | null;
  dateRangeStart: string | null;
  dateRangeEnd: string | null;
  orgSummary: OrgSummary | null;
  departmentBreakdown: DepartmentBreakdown[] | null;
  userBreakdown: UserBreakdown[] | null;
  executiveSummary: string | null;
  recommendations: Recommendation[] | null;
  modelUsed: string | null;
  tokensUsed: number | null;
  completedAt: string | null;
  createdAt: string;
}

interface AssessmentListResponse {
  rows: Assessment[];
  total: number;
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

function qualityColor(tier: string): string {
  switch (tier) {
    case "GREAT": return "text-emerald-500";
    case "GOOD": return "text-blue-500";
    case "WEAK": return "text-amber-500";
    case "PROBLEMATIC": return "text-red-500";
    default: return "text-muted-foreground";
  }
}

function qualityBg(tier: string): string {
  switch (tier) {
    case "GREAT": return "bg-emerald-500";
    case "GOOD": return "bg-blue-500";
    case "WEAK": return "bg-amber-500";
    case "PROBLEMATIC": return "bg-red-500";
    default: return "bg-muted";
  }
}

function riskColor(level: string): string {
  switch (level) {
    case "NONE": return "text-emerald-500";
    case "LOW": return "text-blue-400";
    case "MEDIUM": return "text-amber-500";
    case "HIGH": return "text-orange-500";
    case "CRITICAL": return "text-red-600";
    default: return "text-muted-foreground";
  }
}

function riskBg(level: string): string {
  switch (level) {
    case "NONE": return "bg-emerald-500";
    case "LOW": return "bg-blue-400";
    case "MEDIUM": return "bg-amber-500";
    case "HIGH": return "bg-orange-500";
    case "CRITICAL": return "bg-red-600";
    default: return "bg-muted";
  }
}

function riskBadgeVariant(level: string): "default" | "secondary" | "destructive" | "outline" {
  switch (level) {
    case "CRITICAL":
    case "HIGH": return "destructive";
    case "MEDIUM": return "default";
    default: return "secondary";
  }
}

function impactBadgeVariant(impact: string): "default" | "secondary" | "destructive" | "outline" {
  switch (impact) {
    case "HIGH": return "destructive";
    case "MEDIUM": return "default";
    default: return "secondary";
  }
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-blue-500";
  if (score >= 40) return "text-amber-500";
  return "text-red-500";
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: AssessmentStatus }) {
  switch (status) {
    case "COMPLETED":
      return <Badge variant="secondary" className="gap-1 text-emerald-500 border-emerald-500/30"><CheckCircle2 className="w-3 h-3" /> Completed</Badge>;
    case "RUNNING":
      return <Badge variant="secondary" className="gap-1 text-blue-500 border-blue-500/30"><Loader2 className="w-3 h-3 animate-spin" /> Running</Badge>;
    case "FAILED":
      return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Failed</Badge>;
    default:
      return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Pending</Badge>;
  }
}

// ---------------------------------------------------------------------------
// Distribution bar
// ---------------------------------------------------------------------------

function DistributionBar({
  items,
  total,
}: {
  items: Array<{ label: string; value: number; bgClass: string; textClass: string }>;
  total: number;
}) {
  if (total === 0) {
    return <div className="h-4 w-full bg-muted/30 rounded-full" />;
  }
  return (
    <div className="flex h-4 w-full rounded-full overflow-hidden gap-px">
      {items.map(item =>
        item.value === 0 ? null : (
          <div
            key={item.label}
            className={`${item.bgClass} opacity-80 transition-all`}
            style={{ width: `${(item.value / total) * 100}%` }}
            title={`${item.label}: ${item.value}`}
          />
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score gauge
// ---------------------------------------------------------------------------

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  const strokeClass = score >= 80 ? "stroke-emerald-500" : score >= 60 ? "stroke-blue-500" : score >= 40 ? "stroke-amber-500" : "stroke-red-500";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={6} className="fill-none stroke-muted/30" />
        <circle
          cx={size / 2} cy={size / 2} r={radius} strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          className={`fill-none transition-all ${strokeClass}`}
        />
      </svg>
      <span className={`absolute text-lg font-bold ${scoreColor(score)}`}>{score}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Org metrics cards
// ---------------------------------------------------------------------------

function OrgMetricsCards({ summary }: { summary: OrgSummary }) {
  const qd = summary.qualityDistribution;
  const rd = summary.riskDistribution;
  const totalQ = Object.values(qd).reduce((s, v) => s + v, 0);
  const totalR = Object.values(rd).reduce((s, v) => s + v, 0);
  const riskInteractions = (rd.HIGH ?? 0) + (rd.CRITICAL ?? 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total Prompts</p>
              <p className="text-2xl font-bold mt-1">{summary.totalInteractions.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">{summary.uniqueUsers} user{summary.uniqueUsers !== 1 ? "s" : ""}</p>
            </div>
            <MessageSquareText className="w-5 h-5 text-muted-foreground mt-0.5" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Avg Quality Score</p>
              <div className="mt-1">
                <ScoreRing score={summary.averageQualityScore} size={64} />
              </div>
            </div>
            <Star className="w-5 h-5 text-muted-foreground mt-0.5" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">High/Critical Risk</p>
              <p className={`text-2xl font-bold mt-1 ${riskInteractions > 0 ? "text-red-500" : "text-emerald-500"}`}>
                {riskInteractions.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {totalR > 0 ? `${Math.round((riskInteractions / totalR) * 100)}% of prompts` : "0%"}
              </p>
            </div>
            <ShieldAlert className="w-5 h-5 text-muted-foreground mt-0.5" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Problematic Prompts</p>
              <p className={`text-2xl font-bold mt-1 ${qd.PROBLEMATIC > 0 ? "text-red-500" : "text-emerald-500"}`}>
                {qd.PROBLEMATIC.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {totalQ > 0 ? `${Math.round((qd.PROBLEMATIC / totalQ) * 100)}% of prompts` : "0%"}
              </p>
            </div>
            <TrendingDown className="w-5 h-5 text-muted-foreground mt-0.5" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribution section
// ---------------------------------------------------------------------------

function DistributionSection({ summary }: { summary: OrgSummary }) {
  const qd = summary.qualityDistribution;
  const rd = summary.riskDistribution;
  const totalQ = Object.values(qd).reduce((s, v) => s + v, 0);
  const totalR = Object.values(rd).reduce((s, v) => s + v, 0);

  const qualityItems = [
    { label: "GREAT", value: qd.GREAT, bgClass: qualityBg("GREAT"), textClass: qualityColor("GREAT") },
    { label: "GOOD", value: qd.GOOD, bgClass: qualityBg("GOOD"), textClass: qualityColor("GOOD") },
    { label: "WEAK", value: qd.WEAK, bgClass: qualityBg("WEAK"), textClass: qualityColor("WEAK") },
    { label: "PROBLEMATIC", value: qd.PROBLEMATIC, bgClass: qualityBg("PROBLEMATIC"), textClass: qualityColor("PROBLEMATIC") },
  ];

  const riskItems = [
    { label: "NONE", value: rd.NONE, bgClass: riskBg("NONE"), textClass: riskColor("NONE") },
    { label: "LOW", value: rd.LOW, bgClass: riskBg("LOW"), textClass: riskColor("LOW") },
    { label: "MEDIUM", value: rd.MEDIUM, bgClass: riskBg("MEDIUM"), textClass: riskColor("MEDIUM") },
    { label: "HIGH", value: rd.HIGH, bgClass: riskBg("HIGH"), textClass: riskColor("HIGH") },
    { label: "CRITICAL", value: rd.CRITICAL, bgClass: riskBg("CRITICAL"), textClass: riskColor("CRITICAL") },
  ];

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Quality Distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <DistributionBar items={qualityItems} total={totalQ} />
          <div className="grid grid-cols-2 gap-1.5">
            {qualityItems.map(item => (
              <div key={item.label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className={`inline-block w-2 h-2 rounded-full ${item.bgClass}`} />
                  <span className="text-muted-foreground">{item.label}</span>
                </span>
                <span className={`font-medium ${item.textClass}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Risk Distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <DistributionBar items={riskItems} total={totalR} />
          <div className="grid grid-cols-2 gap-1.5">
            {riskItems.map(item => (
              <div key={item.label} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5">
                  <span className={`inline-block w-2 h-2 rounded-full ${item.bgClass}`} />
                  <span className="text-muted-foreground">{item.label}</span>
                </span>
                <span className={`font-medium ${item.textClass}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Department breakdown table
// ---------------------------------------------------------------------------

function DepartmentTable({ departments }: { departments: DepartmentBreakdown[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayed = showAll ? departments : departments.slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="w-4 h-4" />
          Department Breakdown
        </CardTitle>
        <CardDescription>{departments.length} department{departments.length !== 1 ? "s" : ""} with Copilot activity</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Users</TableHead>
              <TableHead className="text-right">Prompts</TableHead>
              <TableHead className="text-right">Avg Score</TableHead>
              <TableHead className="text-right">High/Critical Risk</TableHead>
              <TableHead>Quality</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.map(dept => {
              const riskCount = (dept.riskDistribution.HIGH ?? 0) + (dept.riskDistribution.CRITICAL ?? 0);
              const totalQ = Object.values(dept.qualityDistribution).reduce((s, v) => s + v, 0);
              return (
                <TableRow key={dept.department}>
                  <TableCell className="font-medium">{dept.department}</TableCell>
                  <TableCell className="text-right">{dept.userCount}</TableCell>
                  <TableCell className="text-right">{dept.interactionCount}</TableCell>
                  <TableCell className={`text-right font-semibold ${scoreColor(dept.averageQualityScore)}`}>
                    {dept.averageQualityScore}
                  </TableCell>
                  <TableCell className={`text-right ${riskCount > 0 ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                    {riskCount > 0 ? riskCount : "—"}
                  </TableCell>
                  <TableCell className="min-w-[100px]">
                    <DistributionBar
                      items={[
                        { label: "GREAT", value: dept.qualityDistribution.GREAT, bgClass: qualityBg("GREAT"), textClass: "" },
                        { label: "GOOD", value: dept.qualityDistribution.GOOD, bgClass: qualityBg("GOOD"), textClass: "" },
                        { label: "WEAK", value: dept.qualityDistribution.WEAK, bgClass: qualityBg("WEAK"), textClass: "" },
                        { label: "PROBLEMATIC", value: dept.qualityDistribution.PROBLEMATIC, bgClass: qualityBg("PROBLEMATIC"), textClass: "" },
                      ]}
                      total={totalQ}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {departments.length > 8 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-3 w-full text-muted-foreground gap-1"
            onClick={() => setShowAll(v => !v)}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${showAll ? "rotate-180" : ""}`} />
            {showAll ? "Show less" : `Show ${departments.length - 8} more`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Top risk users table
// ---------------------------------------------------------------------------

function TopUsersTable({ users }: { users: UserBreakdown[] }) {
  const risky = users.filter(u => u.criticalFlags > 0).slice(0, 10);
  if (risky.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="w-4 h-4" />
          Top Risk Users
        </CardTitle>
        <CardDescription>Users with the most high/critical risk flags</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="text-right">Prompts</TableHead>
              <TableHead className="text-right">Avg Score</TableHead>
              <TableHead className="text-right">Risk Flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {risky.map(user => (
              <TableRow key={user.userId}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{user.displayName || user.userPrincipalName}</p>
                    {user.displayName && (
                      <p className="text-xs text-muted-foreground">{user.userPrincipalName}</p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{user.department ?? "—"}</TableCell>
                <TableCell className="text-right">{user.interactionCount}</TableCell>
                <TableCell className={`text-right font-semibold ${scoreColor(user.averageQualityScore)}`}>
                  {user.averageQualityScore}
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="destructive">{user.criticalFlags}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

function RecommendationsPanel({ recommendations }: { recommendations: Recommendation[] }) {
  if (recommendations.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-4 h-4" />
          AI Recommendations
        </CardTitle>
        <CardDescription>Prioritized governance actions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {recommendations.map(rec => (
            <div key={rec.rank} className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {rec.rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium text-sm">{rec.title}</p>
                  <Badge variant={impactBadgeVariant(rec.impact)} className="text-xs">{rec.impact}</Badge>
                  {rec.targetScope && rec.targetName && (
                    <Badge variant="outline" className="text-xs">{rec.targetScope}: {rec.targetName}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{rec.rationale}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Top flags panel
// ---------------------------------------------------------------------------

function TopFlagsPanel({ flags }: { flags: OrgSummary["topFlags"] }) {
  if (flags.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="w-4 h-4" />
          Top Signal Flags
        </CardTitle>
        <CardDescription>Most frequently triggered risk and quality signals</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {flags.slice(0, 10).map((flag, i) => {
            const maxCount = flags[0]?.count ?? 1;
            return (
              <div key={`${flag.category}:${flag.signal}`} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between text-xs mb-0.5">
                    <span className="font-medium truncate">{flag.signal.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground ml-2 flex-shrink-0">{flag.count}</span>
                  </div>
                  <Progress
                    value={(flag.count / maxCount) * 100}
                    className="h-1.5"
                  />
                </div>
                <Badge variant="outline" className="text-[10px] flex-shrink-0">{flag.category}</Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Assessment history
// ---------------------------------------------------------------------------

function AssessmentHistory({
  assessments,
  onSelect,
  selectedId,
}: {
  assessments: Assessment[];
  onSelect: (a: Assessment) => void;
  selectedId: string | null;
}) {
  if (assessments.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Assessment History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {assessments.slice(0, 10).map(a => (
            <button
              key={a.id}
              className={`w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors ${selectedId === a.id ? "bg-muted/50" : ""}`}
              onClick={() => onSelect(a)}
            >
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={a.status} />
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                </span>
              </div>
              {a.interactionCount != null && (
                <p className="text-xs text-muted-foreground mt-1">
                  {a.interactionCount} interactions · {a.userCount} users
                </p>
              )}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CopilotPromptIntelligencePage() {
  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id ?? "";

  const [pollingAssessmentId, setPollingAssessmentId] = useState<string | null>(null);
  const [pollingSyncId, setPollingSyncId] = useState<string | null>(null);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ text: string; variant: "info" | "success" | "error" } | null>(null);

  // Latest completed assessment
  const { data: latestAssessment, isLoading: latestLoading, refetch: refetchLatest } = useQuery<Assessment | null>({
    queryKey: ["/api/copilot-prompt-intelligence/assessments/latest", tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(
        `/api/copilot-prompt-intelligence/assessments/latest?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`,
        { credentials: "include" },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantConnectionId,
    staleTime: 30_000,
  });

  // Assessment history
  const { data: historyData, refetch: refetchHistory } = useQuery<AssessmentListResponse>({
    queryKey: ["/api/copilot-prompt-intelligence/assessments", tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(
        `/api/copilot-prompt-intelligence/assessments?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}&limit=20`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantConnectionId,
    staleTime: 30_000,
  });

  type SyncRun = {
    id: string;
    status: string;
    usersScanned: number | null;
    interactionsCaptured: number | null;
    interactionsSkipped: number | null;
    errorCount: number | null;
    completedAt: string | null;
  };

  // Latest sync run status
  const { data: latestSyncRun, refetch: refetchLatestSync } = useQuery<SyncRun | null>({
    queryKey: ["/api/copilot-prompt-intelligence/sync/latest", tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(
        `/api/copilot-prompt-intelligence/sync/latest?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`,
        { credentials: "include" },
      );
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!tenantConnectionId,
    staleTime: 30_000,
  });

  // Poll a running sync until it completes
  const { data: pollingSyncData } = useQuery<SyncRun>({
    queryKey: ["/api/copilot-prompt-intelligence/sync/poll", pollingSyncId],
    queryFn: async () => {
      const res = await fetch(
        `/api/copilot-prompt-intelligence/sync/latest?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!pollingSyncId,
    refetchInterval: pollingSyncId ? 3000 : false,
  });

  // Total interaction count (lightweight — just need the total)
  const { data: interactionData } = useQuery<{ total: number } | null>({
    queryKey: ["/api/copilot-prompt-intelligence/interactions/count", tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(
        `/api/copilot-prompt-intelligence/interactions?tenantConnectionId=${encodeURIComponent(tenantConnectionId)}&limit=0`,
        { credentials: "include" },
      );
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!tenantConnectionId,
    staleTime: 30_000,
  });

  // Poll running assessment
  const { data: pollingData } = useQuery<Assessment>({
    queryKey: ["/api/copilot-prompt-intelligence/assessments", pollingAssessmentId],
    queryFn: async () => {
      const res = await fetch(
        `/api/copilot-prompt-intelligence/assessments/${pollingAssessmentId}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!pollingAssessmentId,
    refetchInterval: pollingAssessmentId ? 3000 : false,
  });

  useEffect(() => {
    if (pollingData && (pollingData.status === "COMPLETED" || pollingData.status === "FAILED")) {
      setPollingAssessmentId(null);
      refetchLatest();
      refetchHistory();
    }
  }, [pollingData, refetchLatest, refetchHistory]);

  useEffect(() => {
    if (!pollingSyncData) return;
    if (pollingSyncData.status === "COMPLETED") {
      setPollingSyncId(null);
      refetchLatestSync();
      queryClient.invalidateQueries({ queryKey: ["/api/copilot-prompt-intelligence/interactions/count"] });
      const captured = pollingSyncData.interactionsCaptured ?? 0;
      const errors = pollingSyncData.errorCount ?? 0;
      setSyncMessage({
        variant: errors > 0 ? "error" : "success",
        text: `Sync complete — ${captured} new interaction${captured !== 1 ? "s" : ""} captured across ${pollingSyncData.usersScanned ?? 0} users.${errors > 0 ? ` ${errors} user${errors !== 1 ? "s" : ""} had access errors.` : ""}`,
      });
      setTimeout(() => setSyncMessage(null), 20000);
    } else if (pollingSyncData.status === "FAILED") {
      setPollingSyncId(null);
      refetchLatestSync();
      setSyncMessage({ variant: "error", text: "Sync failed — see sync status bar for details." });
      setTimeout(() => setSyncMessage(null), 15000);
    }
  }, [pollingSyncData, refetchLatestSync]);

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/copilot-prompt-intelligence/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantConnectionId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: { syncRunId: string }) => {
      setSyncMessage({ variant: "info", text: "Sync started — fetching interactions from Microsoft Graph…" });
      setPollingSyncId(data.syncRunId);
    },
  });

  // Assess mutation
  const assessMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/copilot-prompt-intelligence/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tenantConnectionId }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: { assessmentId: string }) => {
      setPollingAssessmentId(data.assessmentId);
    },
  });

  const isAssessing = !!pollingAssessmentId || pollingData?.status === "RUNNING";

  const activeAssessment: Assessment | null =
    (selectedAssessmentId
      ? historyData?.rows.find(a => a.id === selectedAssessmentId) ?? latestAssessment
      : latestAssessment) ?? null;

  return (
    <UpgradeGate feature="copilotPromptIntelligence">
      <div className="space-y-6 p-6 max-w-screen-xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <MessageSquareText className="w-6 h-6" />
              Copilot Prompt Intelligence
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Quality and risk analytics for M365 Copilot user-initiated prompts over the last 30 days.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending || !!pollingSyncId || !tenantConnectionId}
              className="gap-1.5"
            >
              {(syncMutation.isPending || !!pollingSyncId) ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {pollingSyncId ? "Syncing…" : "Sync Interactions"}
            </Button>
            <Button
              size="sm"
              onClick={() => assessMutation.mutate()}
              disabled={isAssessing || !tenantConnectionId}
              className="gap-1.5"
            >
              {isAssessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              {isAssessing ? "Assessing…" : "Run Assessment"}
            </Button>
          </div>
        </div>

        {tenantConnectionId && (
          <DatasetFreshnessBanner
            tenantConnectionId={tenantConnectionId}
            datasets={["copilotInteractions"]}
          />
        )}

        {syncMessage && (
          <div className={`rounded-md border px-4 py-2.5 text-sm flex items-center gap-2 ${
            syncMessage.variant === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : syncMessage.variant === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-400"
              : "border-blue-500/30 bg-blue-500/10 text-blue-400"
          }`}>
            {syncMessage.variant === "info" && <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />}
            {syncMessage.variant === "success" && <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />}
            {syncMessage.variant === "error" && <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />}
            {syncMessage.text}
          </div>
        )}

        {/* Persistent sync status — always visible when sync data exists */}
        {tenantConnectionId && latestSyncRun && (
          <div className="rounded-md border border-border bg-muted/30 px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm" data-testid="sync-status-bar">
            <div className="flex items-center gap-1.5 font-medium text-foreground/80">
              {latestSyncRun.status === "COMPLETED" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              ) : latestSyncRun.status === "RUNNING" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-500" />
              )}
              Last sync
              {latestSyncRun.completedAt
                ? <> {formatDistanceToNow(new Date(latestSyncRun.completedAt), { addSuffix: true })}</>
                : " in progress"}
            </div>
            {latestSyncRun.usersScanned != null && (
              <div className="flex items-center gap-1.5 text-muted-foreground" data-testid="sync-users-scanned">
                <Users className="w-3.5 h-3.5" />
                <span>{latestSyncRun.usersScanned} user{latestSyncRun.usersScanned !== 1 ? "s" : ""} scanned</span>
              </div>
            )}
            {latestSyncRun.interactionsCaptured != null && (
              <div className="flex items-center gap-1.5 text-muted-foreground" data-testid="sync-interactions-captured">
                <Database className="w-3.5 h-3.5" />
                <span>{latestSyncRun.interactionsCaptured.toLocaleString()} new interaction{latestSyncRun.interactionsCaptured !== 1 ? "s" : ""} captured</span>
              </div>
            )}
            {(interactionData?.total ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-muted-foreground" data-testid="sync-total-stored">
                <span className="text-xs">{interactionData!.total.toLocaleString()} total stored</span>
              </div>
            )}
            {(latestSyncRun.errorCount ?? 0) > 0 && (
              <div className="flex items-center gap-1.5 text-red-400" data-testid="sync-error-count">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>{latestSyncRun.errorCount} user{latestSyncRun.errorCount !== 1 ? "s" : ""} had access errors</span>
              </div>
            )}
          </div>
        )}

        {isAssessing && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-400 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Assessment in progress — analyzing interactions and generating AI narrative…
          </div>
        )}

        {!tenantConnectionId && (
          <div className="rounded-md border border-muted px-4 py-8 text-center text-muted-foreground text-sm">
            Select a tenant connection above to view Copilot Prompt Intelligence data.
          </div>
        )}

        {tenantConnectionId && latestLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {tenantConnectionId && !latestLoading && !activeAssessment && !isAssessing && (
          <Card>
            <CardContent className="py-8">
              <div className="text-center mb-6">
                <MessageSquareText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium">No assessment data yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  {(interactionData?.total ?? 0) > 0
                    ? <>You have <strong>{interactionData!.total} interactions</strong> captured and ready. Click <strong>Run Assessment</strong> to analyze them.</>
                    : <>Click <strong>Sync Interactions</strong> to capture Copilot prompts from Microsoft Graph, then <strong>Run Assessment</strong> to analyze them.</>
                  }
                </p>
              </div>

            </CardContent>
          </Card>
        )}

        {activeAssessment?.orgSummary && (
          <>
            {/* Date range + metadata */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {activeAssessment.dateRangeStart && activeAssessment.dateRangeEnd && (
                <span>
                  {format(new Date(activeAssessment.dateRangeStart), "MMM d")}–{format(new Date(activeAssessment.dateRangeEnd), "MMM d, yyyy")}
                </span>
              )}
              {activeAssessment.completedAt && (
                <span>
                  Analyzed {formatDistanceToNow(new Date(activeAssessment.completedAt), { addSuffix: true })}
                </span>
              )}
              {activeAssessment.modelUsed && (
                <Badge variant="outline" className="text-[10px]">{activeAssessment.modelUsed}</Badge>
              )}
            </div>

            <OrgMetricsCards summary={activeAssessment.orgSummary} />
            <DistributionSection summary={activeAssessment.orgSummary} />

            <div className="grid md:grid-cols-2 gap-4">
              <TopFlagsPanel flags={activeAssessment.orgSummary.topFlags} />
              {activeAssessment.recommendations && activeAssessment.recommendations.length > 0 && (
                <RecommendationsPanel recommendations={activeAssessment.recommendations} />
              )}
            </div>

            {activeAssessment.departmentBreakdown && activeAssessment.departmentBreakdown.length > 0 && (
              <DepartmentTable departments={activeAssessment.departmentBreakdown} />
            )}

            {activeAssessment.userBreakdown && activeAssessment.userBreakdown.length > 0 && (
              <TopUsersTable users={activeAssessment.userBreakdown} />
            )}

            {activeAssessment.executiveSummary && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="w-4 h-4" />
                    Executive Summary
                  </CardTitle>
                  <CardDescription>AI-generated governance narrative</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{activeAssessment.executiveSummary}</ReactMarkdown>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Assessment history sidebar */}
        {historyData && historyData.rows.length > 1 && (
          <AssessmentHistory
            assessments={historyData.rows}
            onSelect={a => setSelectedAssessmentId(a.id === selectedAssessmentId ? null : a.id)}
            selectedId={selectedAssessmentId}
          />
        )}
      </div>
    </UpgradeGate>
  );
}
