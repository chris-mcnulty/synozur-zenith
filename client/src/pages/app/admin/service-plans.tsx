import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
  Building2, 
  Users, 
  HardDrive, 
  ShieldCheck, 
  Check, 
  X, 
  Gem,
  Plus,
  Settings2,
  Crown
} from "lucide-react";

const plans = [
  {
    id: "plan-basic",
    name: "Standard",
    description: "Essential governance for small to medium organizations.",
    price: "$5",
    billing: "per user/month",
    limits: {
      users: "Up to 500",
      admins: "2 Admins",
      storage: "1 TB per object",
      workspaces: "Unlimited"
    },
    features: {
      provisioning: true,
      directory: true,
      retention: true,
      selfService: false,
      automation: false,
      aiCopilot: false,
    },
    isPopular: false,
  },
  {
    id: "plan-pro",
    name: "Professional",
    description: "Advanced controls and self-service capabilities.",
    price: "$12",
    billing: "per user/month",
    limits: {
      users: "Up to 5,000",
      admins: "10 Admins",
      storage: "5 TB per object",
      workspaces: "Unlimited"
    },
    features: {
      provisioning: true,
      directory: true,
      retention: true,
      selfService: true,
      automation: true,
      aiCopilot: false,
    },
    isPopular: true,
  },
  {
    id: "plan-ent",
    name: "Unlimited Enterprise",
    description: "No limits. Full access to all platform capabilities.",
    price: "$25",
    billing: "per user/month",
    limits: {
      users: "Unlimited",
      admins: "Unlimited",
      storage: "Unlimited",
      workspaces: "Unlimited"
    },
    features: {
      provisioning: true,
      directory: true,
      retention: true,
      selfService: true,
      automation: true,
      aiCopilot: true,
    },
    isPopular: false,
  }
];

export default function ServicePlansPage() {
  const [isAdminMode, setIsAdminMode] = useState(true);

  const FeatureRow = ({ enabled, premium, label }: { enabled: boolean, premium?: boolean, label: string }) => (
    <div className={`flex items-center gap-3 py-2 ${!enabled ? 'opacity-50' : ''}`}>
      <div className={`flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${enabled ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
        {enabled ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
      </div>
      <span className="text-sm font-medium flex items-center gap-1.5 flex-1">
        {label}
        {premium && <Gem className="w-3.5 h-3.5 text-blue-500" />}
      </span>
      {isAdminMode && premium && (
        <Switch 
          checked={enabled} 
          disabled={label.includes("Unlimited") || label.includes("All features")}
          className="scale-75 origin-right"
        />
      )}
    </div>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Service Plans</h1>
          <p className="text-muted-foreground mt-1">Configure tenant capacities and premium feature access.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 p-2 rounded-xl border border-border/50 bg-card">
            <span className="text-sm font-medium text-muted-foreground">Platform Admin Mode</span>
            <Switch checked={isAdminMode} onCheckedChange={setIsAdminMode} />
          </div>
          <Button className="gap-2 shadow-md shadow-primary/20">
            <Plus className="w-4 h-4" />
            Create Custom Plan
          </Button>
        </div>
      </div>

      {isAdminMode && (
        <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 text-sm text-primary flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings2 className="w-5 h-5 shrink-0" />
            <p><strong>Admin Mode Active:</strong> You can toggle premium features on or off for specific plans. The Unlimited Enterprise plan cannot be restricted.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
        {plans.map((plan) => (
          <Card 
            key={plan.id} 
            className={`relative flex flex-col ${
              plan.id === 'plan-ent' ? 'border-blue-500/50 shadow-xl shadow-blue-500/5 bg-gradient-to-b from-blue-500/5 to-transparent' : 
              plan.isPopular ? 'border-primary shadow-xl shadow-primary/10 ring-1 ring-primary/20 bg-primary/5' : 
              'glass-panel border-border/50'
            }`}
          >
            {plan.isPopular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-widest rounded-full shadow-sm">
                Most Popular
              </div>
            )}
            {plan.id === 'plan-ent' && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500 text-white text-[10px] font-bold uppercase tracking-widest rounded-full shadow-sm flex items-center gap-1">
                <Crown className="w-3 h-3" /> Recommended
              </div>
            )}

            <CardHeader className="pb-4 border-b border-border/40">
              <CardTitle className="text-2xl">{plan.name}</CardTitle>
              <CardDescription className="h-10 mt-2">{plan.description}</CardDescription>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">{plan.price}</span>
                <span className="text-sm font-medium text-muted-foreground">{plan.billing}</span>
              </div>
            </CardHeader>
            
            <CardContent className="flex-1 pt-6 pb-2 space-y-8">
              {/* Capacities */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Plan Capacities</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{plan.limits.users}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{plan.limits.admins}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <HardDrive className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{plan.limits.storage}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{plan.limits.workspaces}</span>
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-3 pt-4 border-t border-border/40">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Included Features</h4>
                <div className="space-y-1">
                  <FeatureRow enabled={plan.features.provisioning} label="Workspace Provisioning" />
                  <FeatureRow enabled={plan.features.directory} label="Governance Directory" />
                  <FeatureRow enabled={plan.features.retention} label="Retention Policies" />
                  <FeatureRow enabled={plan.features.selfService} premium label="Self-Service Portal" />
                  <FeatureRow enabled={plan.features.automation} premium label="Lifecycle Automation" />
                  <FeatureRow enabled={plan.features.aiCopilot} premium label="AI Copilot Readiness" />
                </div>
              </div>
            </CardContent>

            <CardFooter className="pt-6 pb-6">
              <Button 
                variant={plan.id === 'plan-ent' ? 'default' : plan.isPopular ? 'default' : 'outline'} 
                className={`w-full ${plan.id === 'plan-ent' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
              >
                {isAdminMode ? "Edit Plan Details" : "Assign Plan to Tenant"}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
