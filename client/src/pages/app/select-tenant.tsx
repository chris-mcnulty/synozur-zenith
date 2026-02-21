import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Building2, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SelectTenantPage() {
  const [, setLocation] = useLocation();

  const tenants = [
    {
      id: "t1",
      name: "Synozur Demo",
      plan: "BASE",
      environments: 2,
      active: true
    },
    {
      id: "t2",
      name: "Enterprise Demo",
      plan: "ENTERPRISE",
      environments: 4,
      active: false
    }
  ];

  const handleSelect = (tenantId: string) => {
    // In a real app, this would set the active tenant in context/state
    setLocation("/app/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-24 px-4">
      <div className="max-w-3xl w-full">
        <div className="text-center mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h1 className="text-3xl font-bold tracking-tight mb-3">Select your tenant</h1>
          <p className="text-muted-foreground">Choose the Zenith environment you want to access.</p>
        </div>

        <div className="grid gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 fill-mode-both">
          {tenants.map((tenant) => (
            <Card 
              key={tenant.id} 
              className={`cursor-pointer transition-all hover:border-primary/50 hover:shadow-md hover:shadow-primary/5 ${tenant.active ? 'border-primary/30 bg-primary/5' : ''}`}
              onClick={() => handleSelect(tenant.id)}
            >
              <CardContent className="p-6 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg flex items-center gap-2">
                      {tenant.name}
                      {tenant.active && <CheckCircle2 className="w-4 h-4 text-primary" />}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <Badge variant={tenant.plan === 'ENTERPRISE' ? 'default' : 'secondary'} className="text-[10px] uppercase font-bold tracking-wider">
                        {tenant.plan}
                      </Badge>
                      <span>{tenant.environments} environments</span>
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-12 text-center text-sm text-muted-foreground">
          Need access to a different tenant? <a href="#" className="text-primary hover:underline">Contact your administrator</a>.
        </div>
      </div>
    </div>
  );
}