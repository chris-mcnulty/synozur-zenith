import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PLAN_FEATURES, SERVICE_PLANS, type ServicePlanTier } from "@shared/schema";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Check,
  X,
  Minus,
  Search,
  Building2,
  ShieldCheck,
  Sparkles,
  Crown,
  Lock,
  Zap,
  Loader2,
  AlertTriangle,
  Eye,
  PenLine,
  Users,
  Globe,
  HardDrive,
  TrendingUp,
  Brain,
  FileDown,
  ArrowUpDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

type OrgWithPlan = {
  id: string;
  name: string;
  domain: string;
  servicePlan: string;
  planStartedAt: string | null;
};

const PLAN_ICONS = {
  TRIAL: Lock,
  STANDARD: Zap,
  PROFESSIONAL: Sparkles,
  ENTERPRISE: Crown,
} as const;

const PLAN_COLORS = {
  TRIAL: "text-muted-foreground",
  STANDARD: "text-blue-500",
  PROFESSIONAL: "text-primary",
  ENTERPRISE: "text-amber-500",
} as const;

const PLAN_BADGE_VARIANTS = {
  TRIAL: "secondary",
  STANDARD: "outline",
  PROFESSIONAL: "default",
  ENTERPRISE: "outline",
} as const;

type FeatureValue = boolean | "readonly" | "full" | "manual" | "basic" | number;

type FeatureRow = {
  key: keyof typeof PLAN_FEATURES.TRIAL;
  label: string;
  description?: string;
  renderValue?: (val: FeatureValue) => React.ReactNode;
};

type FeatureGroup = {
  title: string;
  icon: React.ElementType;
  description: string;
  rows: FeatureRow[];
};

function FeatureCell({ value, renderValue }: { value: FeatureValue; renderValue?: (v: FeatureValue) => React.ReactNode }) {
  if (renderValue) return <>{renderValue(value)}</>;

  if (value === false) return (
    <div className="flex justify-center">
      <X className="w-4 h-4 text-muted-foreground/40" />
    </div>
  );
  if (value === true) return (
    <div className="flex justify-center">
      <Check className="w-4 h-4 text-emerald-500" />
    </div>
  );
  if (value === "readonly") return (
    <div className="flex items-center justify-center gap-1">
      <Eye className="w-3.5 h-3.5 text-blue-500" />
      <span className="text-xs text-blue-500 font-medium">Read-Only</span>
    </div>
  );
  if (value === "full") return (
    <div className="flex items-center justify-center gap-1">
      <PenLine className="w-3.5 h-3.5 text-emerald-500" />
      <span className="text-xs text-emerald-500 font-medium">Full</span>
    </div>
  );
  if (value === "manual") return (
    <div className="flex items-center justify-center gap-1">
      <Minus className="w-3.5 h-3.5 text-amber-500" />
      <span className="text-xs text-amber-500 font-medium">Manual</span>
    </div>
  );
  if (value === "basic") return (
    <div className="flex items-center justify-center gap-1">
      <Check className="w-3.5 h-3.5 text-blue-400" />
      <span className="text-xs text-blue-400 font-medium">Basic</span>
    </div>
  );
  return <div className="flex justify-center text-xs text-muted-foreground">{String(value)}</div>;
}

const FEATURE_GROUPS: FeatureGroup[] = [
  {
    title: "Core Governance",
    icon: ShieldCheck,
    description: "Fundamental governance, inventory, and workspace management capabilities",
    rows: [
      { key: "inventorySync", label: "Inventory & Data Sync" },
      { key: "provisioning", label: "Workspace Provisioning" },
      { key: "selfServicePortal", label: "Self-Service Portal" },
      { key: "lifecycleAutomation", label: "Lifecycle Automation" },
      {
        key: "governanceReviews",
        label: "Governance Reviews",
        renderValue: (v) => <FeatureCell value={v} />,
      },
    ],
  },
  {
    title: "Write-Back & Data Export",
    icon: FileDown,
    description: "M365 write-back and data export capabilities — blocked on Trial",
    rows: [
      { key: "m365WriteBack", label: "M365 Write-Back" },
      { key: "csvExport", label: "CSV Data Export" },
      {
        key: "contentGovernanceReporting",
        label: "Content Governance Reporting",
        renderValue: (v) => <FeatureCell value={v} />,
      },
      {
        key: "sharingLinkManagement",
        label: "Sharing Link Management",
        renderValue: (v) => <FeatureCell value={v} />,
      },
    ],
  },
  {
    title: "AI Analytics & Reporting",
    icon: Brain,
    description: "AI-powered assessments and analytics — not available on Trial or Standard",
    rows: [
      { key: "copilotReadiness", label: "Copilot Readiness Dashboard" },
      { key: "emailContentStorageReport", label: "Email Content Storage Report" },
      { key: "advancedReporting", label: "Advanced Reporting" },
      { key: "iaAssessment", label: "IA Assessment (AI-Powered)" },
    ],
  },
  {
    title: "Access & Security",
    icon: Lock,
    description: "Security controls, data masking, and multi-tenant access",
    rows: [
      { key: "dataMasking", label: "Database Field Masking" },
      { key: "mspAccess", label: "MSP Consent Access" },
      {
        key: "licensingDashboard",
        label: "Licensing Dashboard",
        renderValue: (v) => <FeatureCell value={v} />,
      },
      {
        key: "licensingOptimization",
        label: "License Optimization",
        renderValue: (v) => <FeatureCell value={v} />,
      },
    ],
  },
];

const CAPACITY_ROWS: {
  key: "maxUsers" | "maxTenants" | "maxSites" | "auditRetentionDays" | "trendRetentionDays";
  label: string;
  icon: React.ElementType;
  format: (v: number) => string;
}[] = [
  {
    key: "maxUsers",
    label: "Max Users",
    icon: Users,
    format: (v) => v === -1 ? "Unlimited" : v.toLocaleString(),
  },
  {
    key: "maxTenants",
    label: "Max Tenants",
    icon: Globe,
    format: (v) => v === -1 ? "Unlimited" : String(v),
  },
  {
    key: "maxSites",
    label: "Max Sites",
    icon: HardDrive,
    format: (v) => v === -1 ? "Unlimited" : v.toLocaleString(),
  },
  {
    key: "auditRetentionDays",
    label: "Audit Log Retention",
    icon: ShieldCheck,
    format: (v) => {
      if (v === -1) return "Unlimited";
      if (v === 0) return "None";
      if (v >= 365) return `${Math.round(v / 365)} year${v >= 730 ? "s" : ""}`;
      return `${v} days`;
    },
  },
  {
    key: "trendRetentionDays",
    label: "Trend Data Retention",
    icon: TrendingUp,
    format: (v) => {
      if (v === -1) return "Unlimited";
      if (v === 0) return "None";
      return `${v} days`;
    },
  },
];

function PlanMatrixTab() {
  return (
    <div className="space-y-8">
      {FEATURE_GROUPS.map((group) => {
        const Icon = group.icon;
        const isAiGroup = group.title === "AI Analytics & Reporting";
        const isWriteBackGroup = group.title === "Write-Back & Data Export";

        return (
          <Card
            key={group.title}
            className={cn(
              "overflow-hidden",
              isAiGroup && "border-primary/20 bg-primary/[0.02]",
              isWriteBackGroup && "border-amber-500/20"
            )}
          >
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  "flex items-center justify-center w-8 h-8 rounded-lg",
                  isAiGroup ? "bg-primary/10" : "bg-muted/60"
                )}>
                  <Icon className={cn("w-4 h-4", isAiGroup ? "text-primary" : "text-muted-foreground")} />
                </div>
                <div>
                  <CardTitle className="text-base">{group.title}</CardTitle>
                  <CardDescription className="text-xs mt-0.5">{group.description}</CardDescription>
                </div>
                {isAiGroup && (
                  <Badge variant="outline" className="ml-auto text-xs border-primary/30 text-primary">
                    Pro+ / Enterprise only
                  </Badge>
                )}
                {isWriteBackGroup && (
                  <Badge variant="outline" className="ml-auto text-xs border-amber-500/30 text-amber-600">
                    Blocked on Trial
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-b border-border/40">
                    <TableHead className="w-[260px] pl-6 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Feature
                    </TableHead>
                    {SERVICE_PLANS.map((plan) => {
                      const PlanIcon = PLAN_ICONS[plan];
                      return (
                        <TableHead
                          key={plan}
                          className="text-center py-3 min-w-[140px]"
                        >
                          <div className="flex flex-col items-center gap-1">
                            <PlanIcon className={cn("w-3.5 h-3.5", PLAN_COLORS[plan])} />
                            <span className={cn("text-xs font-bold uppercase tracking-wider", PLAN_COLORS[plan])}>
                              {PLAN_FEATURES[plan].label}
                            </span>
                          </div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((row, idx) => (
                    <TableRow
                      key={row.key}
                      className={cn(
                        "border-b border-border/20 last:border-0",
                        idx % 2 === 0 ? "bg-transparent" : "bg-muted/20"
                      )}
                      data-testid={`row-feature-${row.key}`}
                    >
                      <TableCell className="pl-6 py-3 font-medium text-sm">
                        {row.label}
                        {row.description && (
                          <p className="text-xs text-muted-foreground font-normal mt-0.5">{row.description}</p>
                        )}
                      </TableCell>
                      {SERVICE_PLANS.map((plan) => {
                        const val = PLAN_FEATURES[plan][row.key] as FeatureValue;
                        return (
                          <TableCell key={plan} className="text-center py-3">
                            <FeatureCell value={val} renderValue={row.renderValue} />
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60">
              <Users className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Capacity Limits</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Hard limits enforced per organization at the API level
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border/40">
                <TableHead className="w-[260px] pl-6 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Limit
                </TableHead>
                {SERVICE_PLANS.map((plan) => {
                  const PlanIcon = PLAN_ICONS[plan];
                  return (
                    <TableHead key={plan} className="text-center py-3 min-w-[140px]">
                      <div className="flex flex-col items-center gap-1">
                        <PlanIcon className={cn("w-3.5 h-3.5", PLAN_COLORS[plan])} />
                        <span className={cn("text-xs font-bold uppercase tracking-wider", PLAN_COLORS[plan])}>
                          {PLAN_FEATURES[plan].label}
                        </span>
                      </div>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {CAPACITY_ROWS.map((row, idx) => {
                const Icon = row.icon;
                return (
                  <TableRow
                    key={row.key}
                    className={cn(
                      "border-b border-border/20 last:border-0",
                      idx % 2 === 0 ? "bg-transparent" : "bg-muted/20"
                    )}
                    data-testid={`row-capacity-${row.key}`}
                  >
                    <TableCell className="pl-6 py-3">
                      <div className="flex items-center gap-2 font-medium text-sm">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        {row.label}
                      </div>
                    </TableCell>
                    {SERVICE_PLANS.map((plan) => {
                      const val = PLAN_FEATURES[plan][row.key] as number;
                      const isUnlimited = val === -1;
                      return (
                        <TableCell key={plan} className="text-center py-3 text-sm">
                          <span className={cn(
                            isUnlimited ? "text-emerald-500 font-semibold" : "text-muted-foreground"
                          )}>
                            {row.format(val)}
                          </span>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-amber-500/20 bg-amber-500/[0.02]">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <h3 className="font-semibold text-sm">Trial Plan Enforcement</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Organizations on the <strong>Trial</strong> plan are blocked from: M365 write-back operations (site provisioning, configuration
                changes, group creation), CSV data export, all AI-powered analytics and assessments (Copilot Readiness, IA Assessment),
                advanced reporting, and the email content storage report. These restrictions are enforced at the API layer —
                no client-side workaround can bypass them. Upgrading to <strong>Standard</strong> or higher unlocks write-back and CSV export.
                AI analytics require <strong>Professional</strong> or <strong>Enterprise</strong>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OrgPlansTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "plan">("name");
  const [confirmChange, setConfirmChange] = useState<{
    org: OrgWithPlan;
    newPlan: ServicePlanTier;
  } | null>(null);

  const { data: orgs = [], isLoading } = useQuery<OrgWithPlan[]>({
    queryKey: ["/api/organizations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/organizations");
      const data = await res.json();
      return data.organizations ?? data;
    },
  });

  const changePlanMutation = useMutation({
    mutationFn: async ({ id, plan }: { id: string; plan: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/organizations/${id}/plan`, { plan });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update plan");
      }
      return res.json();
    },
    onSuccess: (_data, { plan }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organizations"] });
      const orgName = confirmChange?.org.name;
      setConfirmChange(null);
      toast({
        title: "Plan updated",
        description: `${orgName} is now on the ${PLAN_FEATURES[plan as ServicePlanTier]?.label} plan.`,
      });
    },
    onError: (err: Error) => {
      setConfirmChange(null);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = orgs
    .filter((o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.domain.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "plan") {
        return SERVICE_PLANS.indexOf(a.servicePlan as ServicePlanTier) -
          SERVICE_PLANS.indexOf(b.servicePlan as ServicePlanTier);
      }
      return a.name.localeCompare(b.name);
    });

  const planCounts = SERVICE_PLANS.reduce((acc, plan) => {
    acc[plan] = orgs.filter((o) => o.servicePlan === plan).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {SERVICE_PLANS.map((plan) => {
          const PlanIcon = PLAN_ICONS[plan];
          const count = planCounts[plan] ?? 0;
          return (
            <Card key={plan} className="glass-panel border-border/50" data-testid={`card-plan-count-${plan}`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={cn(
                  "flex items-center justify-center w-9 h-9 rounded-lg bg-muted/60"
                )}>
                  <PlanIcon className={cn("w-4.5 h-4.5", PLAN_COLORS[plan])} />
                </div>
                <div>
                  <p className="text-2xl font-bold tabular-nums">{count}</p>
                  <p className="text-xs text-muted-foreground">{PLAN_FEATURES[plan].label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-org-search"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 self-start"
          onClick={() => setSortBy(sortBy === "name" ? "plan" : "name")}
          data-testid="button-sort-orgs"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          Sort by {sortBy === "name" ? "Plan" : "Name"}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b border-border/40">
              <TableHead className="pl-6 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Organization
              </TableHead>
              <TableHead className="py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Domain
              </TableHead>
              <TableHead className="py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Current Plan
              </TableHead>
              <TableHead className="py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Write-Back
              </TableHead>
              <TableHead className="py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                AI Analytics
              </TableHead>
              <TableHead className="py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Change Plan
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-12 text-muted-foreground text-sm">
                  No organizations found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((org) => {
                const plan = org.servicePlan as ServicePlanTier;
                const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.TRIAL;
                const PlanIcon = PLAN_ICONS[plan] ?? Lock;
                const hasWriteBack = !!features.m365WriteBack;
                const hasAiAnalytics = !!features.copilotReadiness || !!features.iaAssessment;

                return (
                  <TableRow key={org.id} className="border-b border-border/20 last:border-0" data-testid={`row-org-${org.id}`}>
                    <TableCell className="pl-6 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-muted/60 shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="font-medium text-sm">{org.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-sm text-muted-foreground">{org.domain}</TableCell>
                    <TableCell className="py-4">
                      <div className="flex items-center gap-1.5">
                        <PlanIcon className={cn("w-3.5 h-3.5", PLAN_COLORS[plan])} />
                        <Badge
                          variant={PLAN_BADGE_VARIANTS[plan] as any}
                          className={cn(
                            "text-xs",
                            plan === "ENTERPRISE" && "border-amber-500/40 text-amber-600",
                            plan === "PROFESSIONAL" && "bg-primary/10 text-primary border-primary/20",
                            plan === "STANDARD" && "border-blue-500/40 text-blue-600",
                          )}
                          data-testid={`badge-org-plan-${org.id}`}
                        >
                          {features.label}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      {hasWriteBack ? (
                        <div className="flex items-center gap-1 text-emerald-500">
                          <Check className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Enabled</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted-foreground/50">
                          <X className="w-3.5 h-3.5" />
                          <span className="text-xs">Blocked</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-4">
                      {hasAiAnalytics ? (
                        <div className="flex items-center gap-1 text-emerald-500">
                          <Check className="w-3.5 h-3.5" />
                          <span className="text-xs font-medium">Available</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-muted-foreground/50">
                          <X className="w-3.5 h-3.5" />
                          <span className="text-xs">Blocked</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-4">
                      <Select
                        value={plan}
                        onValueChange={(newPlan) => {
                          if (newPlan !== plan) {
                            setConfirmChange({ org, newPlan: newPlan as ServicePlanTier });
                          }
                        }}
                      >
                        <SelectTrigger
                          className="w-40 h-8 text-xs"
                          data-testid={`select-plan-${org.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SERVICE_PLANS.map((p) => {
                            const Icon = PLAN_ICONS[p];
                            return (
                              <SelectItem key={p} value={p} className="text-xs">
                                <div className="flex items-center gap-2">
                                  <Icon className={cn("w-3 h-3", PLAN_COLORS[p])} />
                                  {PLAN_FEATURES[p].label}
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={!!confirmChange} onOpenChange={(open) => { if (!open) setConfirmChange(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Plan Change</DialogTitle>
            <DialogDescription>
              You are about to change <strong>{confirmChange?.org.name}</strong> from{" "}
              <strong>{PLAN_FEATURES[confirmChange?.org.servicePlan as ServicePlanTier]?.label}</strong> to{" "}
              <strong>{PLAN_FEATURES[confirmChange?.newPlan as ServicePlanTier]?.label}</strong>.
            </DialogDescription>
          </DialogHeader>

          {confirmChange && (() => {
            const fromPlan = confirmChange.org.servicePlan as ServicePlanTier;
            const toPlan = confirmChange.newPlan;
            const isDowngrade = SERVICE_PLANS.indexOf(toPlan) < SERVICE_PLANS.indexOf(fromPlan);
            const losingWriteBack = !!PLAN_FEATURES[fromPlan].m365WriteBack && !PLAN_FEATURES[toPlan].m365WriteBack;
            const losingAI = (!!PLAN_FEATURES[fromPlan].copilotReadiness || !!PLAN_FEATURES[fromPlan].iaAssessment) &&
              !PLAN_FEATURES[toPlan].copilotReadiness && !PLAN_FEATURES[toPlan].iaAssessment;
            const losingExport = !!PLAN_FEATURES[fromPlan].csvExport && !PLAN_FEATURES[toPlan].csvExport;

            return isDowngrade && (losingWriteBack || losingAI || losingExport) ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-600 font-semibold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  Downgrade Warning
                </div>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
                  {losingWriteBack && <li>M365 write-back will be <strong>blocked</strong> — no provisioning or config changes</li>}
                  {losingExport && <li>CSV data export will be <strong>disabled</strong></li>}
                  {losingAI && <li>AI-powered analytics (Copilot Readiness, IA Assessment) will be <strong>unavailable</strong></li>}
                </ul>
              </div>
            ) : null;
          })()}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmChange(null)} data-testid="button-cancel-plan-change">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmChange) {
                  changePlanMutation.mutate({ id: confirmChange.org.id, plan: confirmChange.newPlan });
                }
              }}
              disabled={changePlanMutation.isPending}
              data-testid="button-confirm-plan-change"
            >
              {changePlanMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Confirm Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function PlanManagementPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Plan Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage service plan assignments across all organizations and review the full feature matrix.
          </p>
        </div>
        <Badge variant="outline" className="self-start gap-1.5 text-xs px-3 py-1.5 border-primary/30 text-primary">
          <ShieldCheck className="w-3.5 h-3.5" />
          Platform Owner only
        </Badge>
      </div>

      <Tabs defaultValue="matrix">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="matrix" data-testid="tab-feature-matrix">Feature Matrix</TabsTrigger>
          <TabsTrigger value="organizations" data-testid="tab-organizations">Organizations</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-6">
          <PlanMatrixTab />
        </TabsContent>

        <TabsContent value="organizations" className="mt-6">
          <OrgPlansTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
