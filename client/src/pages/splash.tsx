import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield, Lock, Layers, Zap, ArrowRight, CheckCircle2 } from "lucide-react";
import heroBg from "@/assets/images/hero-bg.png";

export default function SplashPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col selection:bg-primary/30 relative overflow-hidden">
      {/* Background Image with Overlay */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-40 dark:opacity-20 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroBg})` }}
      />
      <div className="absolute inset-0 z-0 pointer-events-none bg-gradient-to-b from-background/40 via-background/80 to-background" />

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
            <Link href="/auth/entra/callback">
              <Button data-testid="button-signin" className="gap-2 shadow-lg shadow-primary/20 rounded-full px-6">
                Sign in with Microsoft <ArrowRight className="w-4 h-4" />
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
        
        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight max-w-4xl mx-auto leading-tight mb-6 text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/70">
          Enterprise Governance for <br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-primary">Microsoft 365</span>
        </h1>
        
        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 font-light">
          Secure, provision, and manage your tenant with zero polling. Event-driven architecture built for the Constellation era.
        </p>
        
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
    </div>
  );
}