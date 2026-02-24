import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield, Lock, Layers, Zap, ArrowRight, CheckCircle2, ShieldCheck, Cloud, BrainCircuit, Users } from "lucide-react";
import heroBg from "@assets/AdobeStock_382432785_1771938099802.jpeg";
import synozurLogoWhite from "@assets/IMG_4884_1771940714696.png";
import synozurMark from "@assets/SynozurMark_color1400_1771940714696.png";

export default function SplashPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroBg})` }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-background/60 via-background/70 to-background" />
      {/* Navigation */}
      <nav className="relative z-10 w-full border-b border-border/40 bg-background/50 backdrop-blur-md sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
              <Shield className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight">Zenith</span>
          </div>
          <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-muted-foreground">
            <a href="#product" className="hover:text-foreground transition-colors">Product</a>
            <a href="#plans" className="hover:text-foreground transition-colors">Plans</a>
            <a href="#security" className="hover:text-foreground transition-colors">Security</a>
            <a href="#docs" className="hover:text-foreground transition-colors">Docs</a>
          </div>
          <div className="flex items-center">
            <Link href="/login">
              <Button data-testid="button-signin" className="gap-2 shadow-lg shadow-primary/20 rounded-full px-6">
                Sign In <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>
      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center relative z-10 w-full px-4 text-center pt-24 pb-32">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 border border-primary/20 backdrop-blur-sm shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
          Now available for Microsoft 365
        </div>
        
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl mx-auto leading-tight mb-6 text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/70">
          Enterprise Governance for <br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-secondary to-primary">Microsoft 365</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-light">Secure, provision, and manage your M365 tenant. Event-driven architecture built for the Copilot era.</p>
        
        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <Link href="/auth/entra/callback">
            <Button size="lg" className="h-14 px-8 text-base rounded-full shadow-xl shadow-primary/25 gap-2">
              Start your free trial <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Button size="lg" variant="outline" className="h-14 px-8 text-base rounded-full border-border/50 bg-background/50 backdrop-blur-sm hover:bg-muted">
            View documentation
          </Button>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mt-32 text-left">
          <div className="glass-panel p-8 rounded-2xl transition-all hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-6 border border-blue-500/20">
              <Zap className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Event-Driven By Default</h3>
            <p className="text-muted-foreground leading-relaxed">
              Zero polling. We listen for Microsoft Graph change notifications, updating your governance state in real-time without throttling.
            </p>
          </div>
          
          <div className="glass-panel p-8 rounded-2xl transition-all hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 mb-6 border border-purple-500/20">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Intent-Based Provisioning</h3>
            <p className="text-muted-foreground leading-relaxed">
              Workspaces are provisioned securely with built-in metadata, naming policies, and external sharing controls applied automatically.
            </p>
          </div>
          
          <div className="glass-panel p-8 rounded-2xl transition-all hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-6 border border-indigo-500/20">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Tenant Isolation</h3>
            <p className="text-muted-foreground leading-relaxed">
              True multi-tenant architecture with strict data boundaries, enabling secure governance across complex enterprise environments.
            </p>
          </div>
        </div>
      </main>

      {/* Everything You Need Section */}
      <section className="relative z-10 py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Everything You Need to Govern M365</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Purpose-built for IT teams and managed service providers, Zenith covers every aspect of Microsoft 365 governance and compliance.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-4 border border-emerald-500/20">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Site Governance</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Enforce sensitivity labels, sharing policies, and ownership requirements across your entire SharePoint estate.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4 border border-blue-500/20">
                <Cloud className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Copilot Readiness</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Evaluate every site against Copilot eligibility criteria. Block risky content from AI indexing with policy-driven rules.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 mb-4 border border-purple-500/20">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Policy Engine</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Composable, multi-rule governance policies with real-time evaluation. Built-in types for labels, metadata, ownership, and more.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-4 border border-indigo-500/20">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Hub Site Management</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Discover and manage hub site hierarchies. Associate and reassociate sites with delegated SharePoint tokens.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 mb-4 border border-amber-500/20">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Multi-Organization</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">True multi-tenancy with organization-scoped RBAC. Consultants can switch between client organizations seamlessly.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 mb-4 border border-rose-500/20">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Purview & Compliance</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Sensitivity labels, retention policies, and records management synced directly from Microsoft Purview.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Built for Enterprise Section */}
      <section className="relative z-10 py-24 px-4 border-t border-border/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Enterprise-Grade</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Built for Enterprise Governance</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Security, scalability, and automation designed for organizations managing complex Microsoft 365 environments.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4 border border-primary/20">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Multi-Tenant Isolation</h3>
              <p className="text-sm text-muted-foreground">Complete data isolation with role-based access control across organizations and tenants.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary mx-auto mb-4 border border-secondary/20">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Entra ID SSO</h3>
              <p className="text-sm text-muted-foreground">Single sign-on with Microsoft Entra ID and PKCE authorization for secure, seamless access.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mx-auto mb-4 border border-emerald-500/20">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Audit Trail</h3>
              <p className="text-sm text-muted-foreground">Every action logged with WHO, WHAT, WHERE, WHEN, and RESULT for full compliance visibility.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 mx-auto mb-4 border border-amber-500/20">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Service Plans</h3>
              <p className="text-sm text-muted-foreground">Tiered feature gating from Trial to Enterprise, enforced server-side and client-side.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 bg-card/30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20">
                  <Shield className="w-5 h-5" />
                </div>
                <span className="font-bold text-xl tracking-tight">Zenith</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                Enterprise governance for Microsoft 365. Part of the Synozur application portfolio.
              </p>
              <div className="flex items-center gap-2">
                <img src={synozurMark} alt="Synozur" className="w-5 h-5" />
                <span className="text-xs text-muted-foreground/70">Powered by</span>
                <img src={synozurLogoWhite} alt="Synozur Alliance" className="h-5 opacity-70" />
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm uppercase tracking-wider text-foreground mb-4">Product</h4>
              <ul className="space-y-3">
                <li><a href="#product" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
                <li><a href="#plans" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</a></li>
                <li><a href="#security" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Security</a></li>
                <li><a href="#docs" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Documentation</a></li>
                <li><Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Sign In</Link></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-sm uppercase tracking-wider text-foreground mb-4">Portfolio</h4>
              <ul className="space-y-3">
                <li><a href="https://scdp.synozur.com" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Constellation</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Orbit</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Vega</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Synozur Alliance</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-sm uppercase tracking-wider text-foreground mb-4">Legal</h4>
              <ul className="space-y-3">
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms of Service</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Cookie Policy</a></li>
                <li><a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Data Processing</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-border/30 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-muted-foreground/60">&copy; {new Date().getFullYear()} The Synozur Alliance. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">Status</a>
              <a href="#" className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">Changelog</a>
              <a href="#" className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}