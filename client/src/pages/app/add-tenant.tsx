import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Building2, Check, Loader2 } from "lucide-react";

export default function AddTenantPage() {
  const [, setLocation] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate API call for adding a new tenant
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
      
      // Redirect back to tenant selection after showing success
      setTimeout(() => {
        setLocation("/app/select-tenant");
      }, 1500);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-24 px-4 relative overflow-hidden cosmic-gradient">
      
      {/* Decorative background elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        <Link href="/app/select-tenant">
          <Button variant="ghost" className="mb-6 gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Back to Tenants
          </Button>
        </Link>

        <Card className="glass-panel border-border/50 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader className="space-y-3 pb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2 border border-primary/20">
              <Building2 className="w-6 h-6" />
            </div>
            <CardTitle className="text-2xl">Connect New Tenant</CardTitle>
            <CardDescription className="text-base">
              Enter your Microsoft 365 tenant details to begin governance provisioning.
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {isSuccess ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in duration-300">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 mb-2">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-semibold">Tenant Connected!</h3>
                <p className="text-muted-foreground">Redirecting you to your workspaces...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="tenantName">Tenant Display Name</Label>
                  <Input 
                    id="tenantName" 
                    placeholder="e.g. Contoso Corp" 
                    required
                    className="bg-background/50 focus-visible:ring-primary/50"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="tenantId">Microsoft Entra Tenant ID</Label>
                  <Input 
                    id="tenantId" 
                    placeholder="00000000-0000-0000-0000-000000000000" 
                    required
                    className="bg-background/50 font-mono text-sm focus-visible:ring-primary/50"
                  />
                  <p className="text-xs text-muted-foreground">
                    You can find this in your Azure Portal under Azure Active Directory.
                  </p>
                </div>

                <div className="pt-4">
                  <Button 
                    type="submit" 
                    className="w-full h-11 text-base shadow-lg shadow-primary/20"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      "Connect Tenant"
                    )}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
        
        <p className="text-center text-sm text-muted-foreground mt-8">
          By connecting a tenant, you agree to our <a href="#" className="underline hover:text-foreground">Terms of Service</a> and <a href="#" className="underline hover:text-foreground">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}