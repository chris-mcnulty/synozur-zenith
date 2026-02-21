import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  Save, 
  ShieldCheck, 
  Globe, 
  CreditCard,
  Bell
} from "lucide-react";
import { Link } from "wouter";
import { useServicePlan } from "@/hooks/use-service-plan";
import { PLAN_FEATURES } from "@shared/schema";

export default function OrganizationSettingsPage() {
  const { plan, features, org } = useServicePlan();
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-muted-foreground mt-1">Manage profile, security, and preferences for The Synozur Alliance.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Organization Profile
              </CardTitle>
              <CardDescription>Core identity and contact information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>Organization Name</Label>
                  <Input defaultValue="The Synozur Alliance" className="bg-background/50" />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>Primary Domain</Label>
                  <Input defaultValue="synozur.demo" disabled className="bg-muted/50" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Support Email</Label>
                  <Input defaultValue="it-support@synozur.demo" className="bg-background/50" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-border/40 bg-muted/10 pt-4 pb-4 justify-end">
              <Button className="gap-2 shadow-md shadow-primary/20">
                <Save className="w-4 h-4" /> Save Profile
              </Button>
            </CardFooter>
          </Card>

          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                Security & Access
              </CardTitle>
              <CardDescription>Configure authentication and tenant restrictions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50">
                <div>
                  <h4 className="font-semibold text-sm">Enforce MFA</h4>
                  <p className="text-xs text-muted-foreground mt-1">Require multi-factor authentication for all Zenith logins.</p>
                </div>
                <Switch checked={true} />
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50">
                <div>
                  <h4 className="font-semibold text-sm">Cross-Tenant Isolation</h4>
                  <p className="text-xs text-muted-foreground mt-1">Prevent users from authenticating to external M365 tenants.</p>
                </div>
                <Switch checked={true} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`p-4 rounded-xl flex flex-col items-center justify-center text-center ${plan === 'TRIAL' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-primary/10 border border-primary/20'}`}>
                <Badge className={`mb-2 uppercase tracking-widest text-[10px] ${plan === 'TRIAL' ? 'bg-amber-500/20 text-amber-600 border-amber-500/30' : ''}`}>{features.label}</Badge>
                <div className="text-2xl font-bold mt-1">
                  {features.maxUsers === -1 ? 'Unlimited' : <>{features.maxUsers.toLocaleString()}<span className="text-sm text-muted-foreground font-normal"> max users</span></>}
                </div>
                <div className={`text-xs mt-2 ${plan === 'TRIAL' ? 'text-amber-600' : 'text-primary'}`}>
                  {plan === 'TRIAL' ? 'Trial (No M365 Write-Back)' : 'Active Subscription'}
                </div>
              </div>
              <Link href="/app/admin/service-plans">
                <Button variant="outline" className="w-full mt-4">{plan === 'TRIAL' ? 'Upgrade Plan' : 'Manage Plan'}</Button>
              </Link>
            </CardContent>
          </Card>
          
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" />
                Connected Tenants
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border/50">
                <div className="text-sm font-medium">Production</div>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border/50">
                <div className="text-sm font-medium">UAT Sandbox</div>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
              <Button variant="ghost" className="w-full text-xs mt-2" size="sm">Configure Tenants</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}