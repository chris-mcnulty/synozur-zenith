import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useServicePlan } from "@/hooks/use-service-plan";
import { PLAN_FEATURES, SERVICE_PLANS, type ServicePlanTier } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  Users, 
  HardDrive, 
  ShieldCheck, 
  Check, 
  X, 
  Crown,
  ArrowUpRight,
  Lock,
  Loader2,
  Globe,
  Sparkles,
  Zap
} from "lucide-react";

const PLAN_DISPLAY = {
  TRIAL: {
    price: "Free",
    billing: "no charge",
    description: "Explore governance capabilities with read-only access. No M365 write-back.",
    highlight: false,
    recommended: false,
    color: "",
    icon: Lock,
  },
  STANDARD: {
    price: "$5",
    billing: "per user/month",
    description: "Essential governance with M365 write-back for small to medium organizations.",
    highlight: false,
    recommended: false,
    color: "",
    icon: Zap,
  },
  PROFESSIONAL: {
    price: "$12",
    billing: "per user/month",
    description: "Advanced controls, Copilot readiness, and lifecycle automation.",
    highlight: true,
    recommended: false,
    color: "primary",
    icon: Sparkles,
  },
  ENTERPRISE: {
    price: "$25",
    billing: "per user/month",
    description: "No limits. Full access to all platform capabilities and advanced reporting.",
    highlight: false,
    recommended: true,
    color: "blue",
    icon: Crown,
  },
} as const;

const FEATURE_LIST: { key: keyof typeof PLAN_FEATURES.TRIAL; label: string; premium?: boolean }[] = [
  { key: "inventorySync", label: "Inventory & Data Sync" },
  { key: "provisioning", label: "Workspace Provisioning" },
  { key: "m365WriteBack", label: "M365 Write-Back", premium: true },
  { key: "csvExport", label: "CSV Export", premium: true },
  { key: "copilotReadiness", label: "Copilot Readiness", premium: true },
  { key: "selfServicePortal", label: "Self-Service Portal", premium: true },
  { key: "lifecycleAutomation", label: "Lifecycle Automation", premium: true },
  { key: "mspAccess", label: "MSP Consent Access", premium: true },
  { key: "dataMasking", label: "Database Encryption", premium: true },
  { key: "advancedReporting", label: "Advanced Reporting", premium: true },
];

export default function ServicePlansPage() {
  const { toast } = useToast();
  const { plan: currentPlan, org, isLoading } = useServicePlan();

  const changePlanMutation = useMutation({
    mutationFn: async (plan: string) => {
      const res = await apiRequest("PATCH", "/api/organization/plan", { plan });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/organization"] });
      toast({ title: "Plan Updated", description: `Your organization is now on the ${data.features.label} plan.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Service Plans</h1>
          <p className="text-muted-foreground mt-1">Feature access and tenant capacities by plan tier.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1 gap-1.5" data-testid="badge-current-plan">
            <Globe className="w-3.5 h-3.5" />
            Current: <span className="font-bold">{PLAN_FEATURES[currentPlan]?.label || currentPlan}</span>
          </Badge>
        </div>
      </div>

      {currentPlan === "TRIAL" && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between" data-testid="banner-trial-plan">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Trial Plan - Read-Only Mode</p>
              <p className="text-xs text-amber-600/80 dark:text-amber-400/70">Your organization cannot write back to Microsoft 365 on the Trial plan. Upgrade to Standard or higher to enable provisioning, site creation, and configuration changes in your M365 tenant.</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 pt-2">
        {SERVICE_PLANS.map((planKey) => {
          const features = PLAN_FEATURES[planKey];
          const display = PLAN_DISPLAY[planKey];
          const isCurrent = planKey === currentPlan;
          const IconComp = display.icon;

          return (
            <Card 
              key={planKey} 
              className={`relative flex flex-col transition-all ${
                isCurrent ? 'ring-2 ring-primary shadow-xl shadow-primary/10' :
                display.recommended ? 'border-blue-500/50 shadow-lg shadow-blue-500/5 bg-gradient-to-b from-blue-500/5 to-transparent' : 
                display.highlight ? 'border-primary/30 shadow-lg' : 
                'glass-panel border-border/50'
              }`}
              data-testid={`card-plan-${planKey}`}
            >
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded-full shadow-sm">
                  Current Plan
                </div>
              )}
              {!isCurrent && display.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-full shadow-sm flex items-center gap-1">
                  <Crown className="w-3 h-3" /> Recommended
                </div>
              )}
              {!isCurrent && display.highlight && !display.recommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded-full shadow-sm">
                  Most Popular
                </div>
              )}

              <CardHeader className="pb-4 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <IconComp className={`w-5 h-5 ${display.recommended ? 'text-blue-500' : 'text-primary'}`} />
                  <CardTitle className="text-xl">{features.label}</CardTitle>
                </div>
                <CardDescription className="h-10 mt-2 text-xs">{display.description}</CardDescription>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold tracking-tight">{display.price}</span>
                  <span className="text-sm font-medium text-muted-foreground">{display.billing}</span>
                </div>
              </CardHeader>
              
              <CardContent className="flex-1 pt-5 pb-2 space-y-6">
                <div className="space-y-2">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Capacities</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{features.maxUsers === -1 ? "Unlimited" : `Up to ${features.maxUsers.toLocaleString()}`} users</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{features.maxTenants === -1 ? "Unlimited" : `Up to ${features.maxTenants}`} tenants</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{features.maxSites === -1 ? "Unlimited" : `Up to ${features.maxSites.toLocaleString()}`} sites</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{features.auditRetentionDays === -1 ? "Unlimited" : features.auditRetentionDays >= 365 ? `${Math.round(features.auditRetentionDays / 365)} year` : `${features.auditRetentionDays} day`} audit retention</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-border/40">
                  <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Features</h4>
                  <div className="space-y-1.5">
                    {FEATURE_LIST.map(({ key, label, premium }) => {
                      const enabled = !!features[key];
                      return (
                        <div key={key} className={`flex items-center gap-2 py-1 ${!enabled ? 'opacity-40' : ''}`}>
                          <div className={`flex items-center justify-center w-4.5 h-4.5 rounded-full shrink-0 ${enabled ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                            {enabled ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                          </div>
                          <span className="text-sm flex items-center gap-1.5">
                            {label}
                            {premium && !enabled && <Lock className="w-3 h-3 text-muted-foreground" />}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="pt-4 pb-5">
                {isCurrent ? (
                  <Button variant="outline" className="w-full" disabled>
                    <Check className="w-4 h-4 mr-2" /> Active Plan
                  </Button>
                ) : (
                  <Button 
                    className={`w-full gap-1.5 ${display.recommended ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                    variant={display.highlight ? 'default' : 'outline'}
                    onClick={() => changePlanMutation.mutate(planKey)}
                    disabled={changePlanMutation.isPending}
                    data-testid={`button-select-${planKey}`}
                  >
                    {changePlanMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        {SERVICE_PLANS.indexOf(planKey) > SERVICE_PLANS.indexOf(currentPlan) ? "Upgrade" : "Switch"} to {features.label}
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <Card className="glass-panel border-border/50 mt-4">
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <ShieldCheck className="w-6 h-6 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h3 className="font-semibold text-sm">M365 Write-Back Feature Gate</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Organizations on the <strong>Trial</strong> plan have full access to inventory sync, governance views, and reporting.
                However, any operations that write back to Microsoft 365 (site provisioning, configuration changes, group creation) 
                are blocked until the organization upgrades to a <strong>Standard</strong> plan or higher. This ensures 
                organizations can fully evaluate Zenith's governance capabilities before enabling production changes in their M365 environment.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
