import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PLAN_FEATURES, SERVICE_PLANS } from "@shared/schema";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Users,
  HardDrive,
  ShieldCheck,
  Check,
  X,
  Crown,
  Lock,
  Globe,
  Sparkles,
  Zap,
  Mail,
} from "lucide-react";
import { usePageTracking } from "@/hooks/use-page-tracking";

const PLAN_DISPLAY = {
  TRIAL: {
    tagline: "Evaluate",
    description: "Explore governance capabilities with read-only access. No M365 write-back.",
    highlight: false,
    icon: Lock,
  },
  STANDARD: {
    tagline: "Essentials",
    description: "Essential governance with M365 write-back for small to medium organizations.",
    highlight: false,
    icon: Zap,
  },
  PROFESSIONAL: {
    tagline: "Advanced",
    description: "Advanced controls, Copilot readiness, and lifecycle automation.",
    highlight: true,
    icon: Sparkles,
  },
  ENTERPRISE: {
    tagline: "Unlimited",
    description: "No limits. Full access to all platform capabilities and advanced reporting.",
    highlight: false,
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
  { key: "advancedReporting", label: "Advanced Reporting", premium: true },
];

function formatRetention(days: number): string {
  if (days === -1) return "Unlimited";
  if (days >= 365) {
    const y = Math.floor(days / 365);
    return `${y} ${y === 1 ? "year" : "years"}`;
  }
  return `${days} ${days === 1 ? "day" : "days"}`;
}

export default function PlansPage() {
  usePageTracking("/plans");

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div
        className="absolute inset-0 z-0 pointer-events-none bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(/images/brand/hero-bg.jpeg)` }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-background/60 via-background/70 to-background" />

      {/* Navigation */}
      <nav className="relative z-10 w-full border-b border-border/40 bg-background/50 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3" data-testid="link-home">
            <img src="/images/brand/synozur-logo-color.png" alt="Synozur" className="h-6" />
            <span className="text-muted-foreground/50 font-light">|</span>
            <span className="font-bold text-lg tracking-tight">Zenith</span>
            <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wider border border-primary/25">Beta</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="ghost" className="gap-2 text-sm" data-testid="button-back-home">
                <ArrowLeft className="w-4 h-4" /> Back to Home
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 px-4 pt-20 pb-12 text-center">
        <div className="max-w-4xl mx-auto">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Service Plans</p>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/70" data-testid="text-page-title">
            Governance that scales <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-secondary to-primary">with your organization</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-light">
            From a hands-on trial to an MSP-grade enterprise deployment — Zenith scales with your governance maturity. Zenith is currently invite-only during Beta. Contact us to become a client and start a trial.
          </p>
        </div>
      </section>

      {/* Plan Cards */}
      <section className="relative z-10 px-4 pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {SERVICE_PLANS.map((planKey) => {
              const features = PLAN_FEATURES[planKey];
              const display = PLAN_DISPLAY[planKey];
              const IconComp = display.icon;

              return (
                <Card
                  key={planKey}
                  className={`relative flex flex-col transition-all ${
                    display.highlight
                      ? "border-primary/30 shadow-lg"
                      : "glass-panel border-border/50"
                  }`}
                  data-testid={`card-plan-${planKey}`}
                >
                  <CardHeader className="pb-4 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <IconComp className="w-5 h-5 text-primary" />
                      <CardTitle className="text-xl">{features.label}</CardTitle>
                    </div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-2">
                      {display.tagline}
                    </p>
                    <CardDescription className="min-h-10 mt-2 text-xs">
                      {display.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="flex-1 pt-5 pb-6 space-y-6">
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Capacities
                      </h4>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>
                            {features.maxUsers === -1
                              ? "Unlimited"
                              : `Up to ${features.maxUsers.toLocaleString()}`}{" "}
                            users
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>
                            {features.maxTenants === -1
                              ? "Unlimited"
                              : `Up to ${features.maxTenants}`}{" "}
                            tenants
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>
                            {features.maxSites === -1
                              ? "Unlimited"
                              : `Up to ${features.maxSites.toLocaleString()}`}{" "}
                            sites
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <HardDrive className="w-3.5 h-3.5 text-muted-foreground" />
                          <span>
                            {formatRetention(features.auditRetentionDays)}{" "}
                            audit retention
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-border/40">
                      <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                        Features
                      </h4>
                      <div className="space-y-1.5">
                        {FEATURE_LIST.map(({ key, label, premium }) => {
                          const enabled = !!features[key];
                          return (
                            <div
                              key={key}
                              className={`flex items-center gap-2 py-1 ${
                                !enabled ? "opacity-40" : ""
                              }`}
                            >
                              <div
                                className={`flex items-center justify-center w-5 h-5 rounded-full shrink-0 ${
                                  enabled ? "text-emerald-500" : "text-muted-foreground"
                                }`}
                              >
                                {enabled ? (
                                  <Check className="w-3.5 h-3.5" />
                                ) : (
                                  <X className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <span className="text-sm flex items-center gap-1.5">
                                {label}
                                {premium && !enabled && (
                                  <Lock className="w-3 h-3 text-muted-foreground" />
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="glass-panel border-border/50 mt-8">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <ShieldCheck className="w-6 h-6 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm">M365 Write-Back Feature Gate</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Organizations on the <strong>Trial</strong> plan have full access to inventory
                    sync, governance views, and reporting. However, any operations that write back
                    to Microsoft 365 (site provisioning, configuration changes, group creation) are
                    blocked until the organization upgrades to a <strong>Standard</strong> plan or
                    higher. This ensures organizations can fully evaluate Zenith's governance
                    capabilities before enabling production changes in their M365 environment.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Contact CTA */}
      <section className="relative z-10 px-4 pb-24">
        <div className="max-w-4xl mx-auto">
          <div className="glass-panel rounded-2xl border border-border/50 p-10 md:p-14 text-center">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-6 border border-primary/20">
              <Mail className="w-6 h-6" />
            </div>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">
              Ready to evaluate Zenith?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
              Zenith is currently invite-only during Beta. To explore the platform or start a
              trial, please reach out to the Synozur team and we'll help you become a client.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
              <Button asChild size="lg" className="h-12 px-8 text-base rounded-full shadow-xl shadow-primary/25 gap-2">
                <a href="https://www.synozur.com/contact" target="_blank" rel="noopener noreferrer" data-testid="link-contact-sales">
                  Contact Us <ArrowRight className="w-4 h-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base rounded-full border-border/50 bg-background/50 backdrop-blur-sm hover:bg-muted">
                <a href="https://synozur.com" target="_blank" rel="noopener noreferrer" data-testid="link-synozur-site">
                  Learn more at synozur.com
                </a>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground/70 mt-6">
              Plans and features are evolving during Beta. Contact your account team for current availability.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 bg-card/30 backdrop-blur-md mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/images/brand/synozur-mark-color.png" alt="Synozur" className="w-5 h-5" />
              <span className="text-xs text-muted-foreground/70">
                &copy; {new Date().getFullYear()} The Synozur Alliance. All rights reserved.
              </span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/" className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors">
                Home
              </Link>
              <a
                href="https://www.synozur.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              >
                Privacy Policy
              </a>
              <a
                href="https://www.synozur.com/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
              >
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
