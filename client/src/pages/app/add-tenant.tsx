import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Building2, Check, Loader2, Globe, ShieldCheck, AlertCircle, ExternalLink } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";

type Step = "input" | "validating" | "consent" | "success" | "error";

export default function AddTenantPage() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("input");
  const [domain, setDomain] = useState("");
  const [ownershipType, setOwnershipType] = useState("MSP");
  const [adminEmail, setAdminEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const params = new URLSearchParams(window.location.search);
  const consentSuccess = params.get("consent_success");
  const consentError = params.get("consent_error");

  const { data: authData } = useQuery<{ user: any; organization: any }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    staleTime: 5 * 60 * 1000,
  });

  if (consentSuccess && step !== "success") {
    setTimeout(() => {
      setStep("success");
      setTimeout(() => setLocation("/app/admin/tenants"), 2500);
    }, 0);
  }
  if (consentError && step !== "error") {
    setTimeout(() => {
      setStep("error");
      setErrorMessage(decodeURIComponent(consentError));
    }, 0);
  }

  const validateDomain = (d: string): string | null => {
    const trimmed = d.trim().toLowerCase();
    if (!trimmed) return "Domain is required.";
    const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
    if (!domainRegex.test(trimmed)) return "Please enter a valid domain (e.g. contoso.com or contoso.onmicrosoft.com).";
    return null;
  };

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateDomain(domain);
    if (validationError) {
      setErrorMessage(validationError);
      setStep("error");
      return;
    }

    setStep("validating");
    setErrorMessage("");

    try {
      const params = new URLSearchParams({
        tenantDomain: domain.trim().toLowerCase(),
        ownershipType,
        returnTo: '/app/add-tenant',
      });
      if (adminEmail.trim()) {
        params.set("adminEmail", adminEmail.trim());
      }

      const res = await fetch(`/api/admin/tenants/consent/initiate?${params.toString()}`, {
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to initiate consent.");
      }

      const { consentUrl } = await res.json();
      setStep("consent");
      setTimeout(() => {
        window.location.href = consentUrl;
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message);
      setStep("error");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center py-24 px-4 relative overflow-hidden cosmic-gradient">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-secondary/20 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-lg w-full relative z-10">
        <Link href="/app/select-tenant">
          <Button variant="ghost" className="mb-6 gap-2 text-muted-foreground hover:text-foreground" data-testid="button-back-tenants">
            <ArrowLeft className="w-4 h-4" />
            Back to Organizations
          </Button>
        </Link>

        <Card className="glass-panel border-border/50 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          <CardHeader className="space-y-3 pb-6">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-2 border border-primary/20">
              <Building2 className="w-6 h-6" />
            </div>
            <CardTitle className="text-2xl">Connect M365 Tenant</CardTitle>
            <CardDescription className="text-base">
              {authData?.organization?.name
                ? `Connect a Microsoft 365 tenant to ${authData.organization.name}.`
                : "Connect a Microsoft 365 tenant to your organization."}
            </CardDescription>
          </CardHeader>

          <CardContent>
            {step === "success" ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in duration-300">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500 mb-2">
                  <Check className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-semibold" data-testid="text-consent-success">Tenant Connected!</h3>
                <p className="text-muted-foreground">Admin consent granted. Redirecting to Tenant Connections...</p>
              </div>
            ) : step === "consent" ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in duration-300">
                <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500 mb-2">
                  <ExternalLink className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-semibold">Redirecting to Microsoft...</h3>
                <p className="text-muted-foreground">
                  You'll be asked to grant admin consent for Zenith to access your tenant.
                  A Global Administrator must approve this request.
                </p>
                <Loader2 className="w-6 h-6 animate-spin text-primary mt-2" />
              </div>
            ) : step === "validating" ? (
              <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in duration-300">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <h3 className="text-lg font-semibold">Validating domain...</h3>
                <p className="text-muted-foreground">Preparing consent request for {domain}</p>
              </div>
            ) : (
              <>
                {step === "error" && errorMessage && (
                  <Alert variant="destructive" className="mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleConnect} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="domain">Tenant Domain</Label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="domain"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="contoso.com or contoso.onmicrosoft.com"
                        required
                        className="pl-10 bg-background/50 font-mono text-sm focus-visible:ring-primary/50"
                        data-testid="input-domain"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter the primary domain of the Microsoft 365 tenant you want to connect.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ownershipType">Ownership Type</Label>
                    <Select value={ownershipType} onValueChange={setOwnershipType}>
                      <SelectTrigger className="bg-background/50" data-testid="select-ownership">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MSP">MSP Managed</SelectItem>
                        <SelectItem value="Customer">Customer Managed</SelectItem>
                        <SelectItem value="Hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      MSP = your team manages this tenant. Customer = the client manages it. Hybrid = shared responsibility.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="adminEmail">Admin Email (optional)</Label>
                    <Input
                      id="adminEmail"
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@contoso.com"
                      className="bg-background/50 text-sm focus-visible:ring-primary/50"
                      data-testid="input-admin-email"
                    />
                    <p className="text-xs text-muted-foreground">
                      Pre-fill the login hint for the admin who will grant consent.
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <ShieldCheck className="w-4 h-4 text-primary" />
                      What happens next
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
                      <li>You'll be redirected to Microsoft to grant admin consent</li>
                      <li>A Global Administrator of the target tenant must approve</li>
                      <li>Zenith will auto-discover the tenant name and configuration</li>
                      <li>The tenant will be linked to your organization</li>
                    </ul>
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      className="w-full h-11 text-base shadow-lg shadow-primary/20 gap-2"
                      disabled={!domain.trim()}
                      data-testid="button-connect-tenant"
                    >
                      <ShieldCheck className="w-5 h-5" />
                      Request Admin Consent
                    </Button>
                  </div>
                </form>
              </>
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
