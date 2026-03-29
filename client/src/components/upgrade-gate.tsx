import { Link } from "wouter";
import { useServicePlan } from "@/hooks/use-service-plan";
import { PLAN_FEATURES, type ServicePlanTier } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, ArrowUpRight } from "lucide-react";

interface UpgradeGateProps {
  feature: keyof typeof PLAN_FEATURES.TRIAL;
  children?: React.ReactNode;
  fallback?: React.ReactNode;
  inline?: boolean;
}

const FEATURE_LABELS: Record<string, { label: string; minPlan: string }> = {
  m365WriteBack: { label: "Microsoft 365 Write-Back", minPlan: "Standard" },
  copilotReadiness: { label: "Copilot Readiness", minPlan: "Professional" },
  lifecycleAutomation: { label: "Lifecycle Automation", minPlan: "Professional" },
  selfServicePortal: { label: "Self-Service Portal", minPlan: "Professional" },
  advancedReporting: { label: "Advanced Reporting", minPlan: "Enterprise" },
  mspAccess: { label: "MSP Access Code Management", minPlan: "Professional" },
  dataMasking: { label: "Tenant Database Masking", minPlan: "Professional" },
  csvExport: { label: "CSV Export", minPlan: "Standard" },
};

export function UpgradeGate({ feature, children, fallback, inline }: UpgradeGateProps) {
  const { isFeatureEnabled, plan } = useServicePlan();

  if (isFeatureEnabled(feature)) {
    return children ? <>{children}</> : null;
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  const info = FEATURE_LABELS[feature] || { label: feature, minPlan: "Standard" };

  if (inline) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Lock className="w-3.5 h-3.5" />
        <span>{info.label} requires {info.minPlan} plan or higher</span>
        <Link href="/app/admin/service-plans">
          <Button variant="link" size="sm" className="h-auto p-0 text-primary gap-1">
            Upgrade <ArrowUpRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <Card className="border-amber-500/20 bg-amber-500/5" data-testid={`gate-${feature}`}>
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Lock className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium">{info.label}</p>
            <p className="text-xs text-muted-foreground">
              Available on <Badge variant="outline" className="text-[10px] ml-1">{info.minPlan}</Badge> plan and above.
              You're on <Badge variant="outline" className="text-[10px] ml-1 bg-muted/50">{plan}</Badge>.
            </p>
          </div>
        </div>
        <Link href="/app/admin/service-plans">
          <Button size="sm" className="gap-1.5 shadow-sm">
            Upgrade Plan <ArrowUpRight className="w-3.5 h-3.5" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export function UpgradeBadge({ feature }: { feature: keyof typeof PLAN_FEATURES.TRIAL }) {
  const { isFeatureEnabled, plan } = useServicePlan();

  if (isFeatureEnabled(feature)) return null;

  const info = FEATURE_LABELS[feature] || { label: feature, minPlan: "Standard" };

  return (
    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20 gap-1">
      <Lock className="w-2.5 h-2.5" />
      {info.minPlan}+
    </Badge>
  );
}

export function WriteBackGate({ children }: { children: React.ReactNode }) {
  return (
    <UpgradeGate feature="m365WriteBack">
      {children}
    </UpgradeGate>
  );
}
