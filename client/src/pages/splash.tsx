import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield, ArrowRight, CheckCircle2, ShieldCheck, Cloud, BrainCircuit, Users, Database, KeyRound, EyeOff, Trash2, Building2, Sparkles, Bot, Share2, Mail, Tag, Target, Workflow, LayoutGrid, GitBranch, FileText, BarChart3, MessageSquare } from "lucide-react";
import { usePageTracking } from "@/hooks/use-page-tracking";

export default function SplashPage() {
  usePageTracking("/");
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
          <div className="flex items-center gap-3">
            <img src="/images/brand/synozur-logo-color.png" alt="Synozur" className="h-6" />
            <span className="text-muted-foreground/50 font-light">|</span>
            <span className="font-bold text-lg tracking-tight">Zenith</span>
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
        <img src="/images/brand/zenith-logo-white.png" alt="Zenith" className="h-36 md:h-48 mb-8" />

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-8 border border-primary/20 backdrop-blur-sm shadow-sm">
          <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse"></span>
          AI-powered governance for the Copilot era
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl mx-auto leading-tight mb-6 text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/70">
          The Governed Control Plane for <br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-secondary to-primary">Microsoft 365</span>
        </h1>

        <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10 font-light">A single, authoritative view of every SharePoint site, Team, OneDrive, and Embedded container — with policy enforcement, sensitivity label governance, and Copilot readiness tooling to manage them confidently at scale.</p>
        
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
              <LayoutGrid className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Unified Workspace Inventory</h3>
            <p className="text-muted-foreground leading-relaxed">
              Continuously synchronised inventory of SharePoint sites, Teams, OneDrive, Loop, Whiteboards, and Copilot notebooks — with metadata, labels, and ownership in one place.
            </p>
          </div>

          <div className="glass-panel p-8 rounded-2xl transition-all hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 mb-6 border border-purple-500/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3">AI-Powered Assessments</h3>
            <p className="text-muted-foreground leading-relaxed">
              GPT-backed Copilot readiness and Information Architecture assessments grounded in your own governance standards. On-demand reports, not multi-week consulting engagements.
            </p>
          </div>

          <div className="glass-panel p-8 rounded-2xl transition-all hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-6 border border-indigo-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Policy Write-Back</h3>
            <p className="text-muted-foreground leading-relaxed">
              Composable governance policies produce named outcomes written back to SharePoint property bags — driving Purview Adaptive Scopes, Microsoft Search, and Copilot scoping automatically.
            </p>
          </div>
        </div>
      </main>

      {/* Everything You Need Section */}
      <section id="product" className="relative z-10 py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Core Capabilities</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Everything You Need to Govern M365</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Purpose-built for M365 administrators and managed service providers. Zenith replaces fragmented PowerShell, spreadsheets, and reactive compliance responses with a proactive, automated governance layer.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-4 border border-emerald-500/20">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Workspace Inventory & Discovery</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Deep, scheduled Microsoft Graph sync of SharePoint sites, Teams channels, OneDrive, meeting recordings, licenses, and SharePoint Embedded containers — each independently toggleable per tenant.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 mb-4 border border-purple-500/20">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Governance Policy Engine</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Composable rules produce named Policy Outcomes — including <code className="text-xs px-1 py-0.5 rounded bg-muted/50">ZenithCopilotReady</code> — written back to SharePoint property bags for Purview Adaptive Scopes, Search, and Copilot.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4 border border-blue-500/20">
                <BarChart3 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Copilot Readiness Scoring</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Weighted 0–100 readiness score for every workspace with Ready / Nearly Ready / At Risk / Blocked tiers and a ranked remediation queue prioritising the sites closest to eligibility.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 mb-4 border border-rose-500/20">
                <Tag className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Sensitivity Label Write-Back</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Enforce Highly Confidential as mandatory on Deal Room and Portfolio workspaces. Label changes applied via Graph, audited, and validated for drift on every sync cycle.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 mb-4 border border-amber-500/20">
                <Share2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Sharing Link Discovery</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Crawl SharePoint and OneDrive to enumerate every active anonymous, org-wide, and specific-user sharing link — down to the individual file, with trend tracking across scans.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-500 mb-4 border border-cyan-500/20">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Email Content Storage Report</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Analyse Exchange Online mailboxes to classify classic attachments, modern reference links, and inline images. Surface heaviest consumers with per-user CSV export.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-4 border border-indigo-500/20">
                <Workflow className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Governed Provisioning</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Built-in templates — Deal Room, Portfolio Company, General Purpose — enforce naming prefixes, sensitivity labels, retention holds, and dual ownership automatically at site creation.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-500 mb-4 border border-teal-500/20">
                <GitBranch className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Information Architecture</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Map the hub hierarchy per tenant. Identify orphaned sites, inconsistent naming, and document library content types, custom columns, and Syntex models pulled directly from Graph.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-fuchsia-500/10 flex items-center justify-center text-fuchsia-500 mb-4 border border-fuchsia-500/20">
                <Target className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">What-If Scenario Planner</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Simulate changes to policy rules against the live workspace population and preview the diff before committing — seeing exactly which sites would move in or out of scope, and why.</p>
            </div>
          </div>
        </div>
      </section>

      {/* AI-Powered Capabilities Section */}
      <section className="relative z-10 py-24 px-4 border-t border-border/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">AI-Powered</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Grounded Intelligence, Not Generic AI</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">Zenith's AI layer runs on your own Azure AI Foundry subscription, grounded in your organisation's governance standards. Every response is anchored to your live workspace data and your customer-specific policies — not generic AI knowledge.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-6 border border-primary/20">
                <Cloud className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Azure AI Foundry</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">GPT-4o and GPT-5.x hosted on your own Azure subscription — data never leaves your tenant boundary. Per-feature model assignment, token budgets with alert thresholds, and full cost visibility.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 mb-6 border border-violet-500/20">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Grounding Documents</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">System-level Synozur governance standards plus organisation-level customer policies inject into every AI prompt — so outputs are specific, actionable, and anchored to <em>your</em> standards.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-6 border border-blue-500/20">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Copilot Readiness Assessment</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Natural-language executive summary, per-workspace remediation narratives, and a 30/60/90-day remediation roadmap — exportable as Markdown for board decks and governance reviews.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-6 border border-emerald-500/20">
                <GitBranch className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">IA Health Assessment</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Deterministic scoring across Naming, Hub Governance, Metadata, Sensitivity, and Lifecycle feeds GPT for a narrative IA health report — what used to be a multi-week consulting engagement, on demand.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 mb-6 border border-amber-500/20">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Governance Assistant</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Ask lifecycle, orphan, Copilot, sharing, and provisioning questions in plain English. The assistant uses live workspace data as ground truth — no hallucinations, no stale snapshots — with deep-link action buttons.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 mb-6 border border-rose-500/20">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Agent Skills</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Control which Zenith capabilities — Provision, Validate, Explain, Report & Recommend — are exposed to Microsoft 365 Copilot and the Vega Agent. API-layer enforcement with full audit logging.</p>
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
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Security, scalability, and automation designed for organisations where Microsoft 365 is mission-critical infrastructure.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4 border border-primary/20">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">MSP Multi-Tenancy</h3>
              <p className="text-sm text-muted-foreground">Unlimited tenants per organisation with strict org-boundary isolation. MSPs access customer tenants via consent codes with full audit trails.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary mx-auto mb-4 border border-secondary/20">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Six-Role RBAC</h3>
              <p className="text-sm text-muted-foreground">Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, and Read-Only Auditor — enforced on every API route, per organisation.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mx-auto mb-4 border border-emerald-500/20">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Immutable Audit Log</h3>
              <p className="text-sm text-muted-foreground">Every label change, policy edit, provisioning request, AI assessment, and agent skill invocation logged with user, timestamp, resource, and outcome. Exportable.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 mx-auto mb-4 border border-amber-500/20">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Custom Fields</h3>
              <p className="text-sm text-muted-foreground">Tenant-owned custom metadata fields extend the workspace schema — available in inventory views, CSV exports, and as policy rule inputs via data dictionaries.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Service Plans Section */}
      <section id="plans" className="relative z-10 py-24 px-4 border-t border-border/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Service Plans</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Start Small, Scale to Enterprise</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Four tiers, each unlocking the capabilities your team needs. Start with Trial inventory sync and grow into full AI assessments, MSP multi-tenancy, and database masking.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <h3 className="text-xl font-bold mb-1">Trial</h3>
              <p className="text-xs text-muted-foreground mb-6 uppercase tracking-wider">Evaluate the platform</p>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">SharePoint inventory sync</span>
                </li>
              </ul>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <h3 className="text-xl font-bold mb-1">Standard</h3>
              <p className="text-xs text-muted-foreground mb-6 uppercase tracking-wider">Core governance</p>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Everything in Trial</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Governance policies & write-back</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">AI Governance Assistant</span>
                </li>
              </ul>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-primary/50 ring-1 ring-primary/30 transition-all hover:-translate-y-1 duration-300 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wider">Most Popular</div>
              <h3 className="text-xl font-bold mb-1">Professional</h3>
              <p className="text-xs text-muted-foreground mb-6 uppercase tracking-wider">AI-powered governance</p>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Everything in Standard</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Copilot Readiness Dashboard</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">AI Copilot + IA Assessments</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Azure AI Foundry + grounding docs</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Sharing Link Discovery</span>
                </li>
              </ul>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <h3 className="text-xl font-bold mb-1">Enterprise</h3>
              <p className="text-xs text-muted-foreground mb-6 uppercase tracking-wider">MSP & unlimited scale</p>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Everything in Professional</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">What-If Policy Planner</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Email Content Storage Report</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">MSP multi-tenant access</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Database masking</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">Unlimited tenants, sites & users</span>
                </li>
              </ul>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground/70 mt-8">For pricing and plan details, contact your account team or visit <a href="https://synozur.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">synozur.com</a>.</p>
        </div>
      </section>

      {/* Security Highlights Section */}
      <section id="security" className="relative z-10 py-24 px-4 border-t border-border/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Data Protection</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Privacy & Security by Design</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Your M365 inventory data belongs to your organization. Zenith enforces strict isolation, consent-controlled access, and encryption at every layer.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-6 border border-blue-500/20">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Org-Scoped Data Isolation</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">All SharePoint inventory, governance results, and tenant credentials are scoped to your organization at the storage layer. No cross-organization data leakage — even on shared infrastructure.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-6 border border-emerald-500/20">
                <KeyRound className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Consent-Gated MSP Access</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Grant your Managed Service Provider time-limited access via single-use consent codes — no permanent user accounts required. Revoke access instantly at any time with a full audit trail.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 mb-6 border border-violet-500/20">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">AES-256-GCM Encryption</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Tenant client secrets are encrypted at rest using AES-256-GCM. Optional per-tenant database masking applies field-level encryption to site inventory and metadata — unreadable even at the database layer.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 mb-6 border border-amber-500/20">
                <EyeOff className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Field-Level Visibility Controls</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Control which governance columns are visible and filterable per role. Restrict sensitive policy results to Governance Admins while keeping operational views clean for Operators and Viewers.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center text-rose-500 mb-6 border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Your Data, Your Rules</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Purge individual data modules (site inventory, governance results, Purview labels) or trigger a full organization purge at any time. Data removal is permanent, audited, and always under your control.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mb-6 border border-primary/20">
                <Shield className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold mb-3">Operator Transparency</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Synozur only retains operational metadata (billing, usage telemetry, error diagnostics). Your SharePoint inventory data, site metadata, and governance configurations are never accessed without your explicit consent.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/40 bg-card/30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center mb-4">
                <img src="/images/brand/zenith-logo-color.png" alt="Zenith" className="h-9" />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                Enterprise governance for Microsoft 365. Part of the Synozur application portfolio.
              </p>
              <div className="flex items-center gap-2">
                <img src="/images/brand/synozur-mark-color.png" alt="Synozur" className="w-5 h-5" />
                <span className="text-xs text-muted-foreground/70">Powered by</span>
                <img src="/images/brand/synozur-logo-white.png" alt="Synozur Alliance" className="h-5 opacity-70" />
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
                <li><a href="https://www.synozur.com/privacy" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy Policy</a></li>
                <li><a href="https://www.synozur.com/terms" target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms of Service</a></li>
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