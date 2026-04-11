import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Shield, Zap, ArrowRight, CheckCircle2, Cloud, BrainCircuit, Users, Database, KeyRound, EyeOff, Trash2, Building2, Sparkles, Gauge, Tag, Share2, Mail, Network, FileText, Bot, LayoutGrid, BookOpen } from "lucide-react";
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
            <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-semibold uppercase tracking-wider border border-primary/25">Beta</span>
          </div>
          <div className="hidden md:flex items-center space-x-8 text-sm font-medium text-muted-foreground">
            <a href="#product" className="hover:text-foreground transition-colors">Product</a>
            <a href="#ai" className="hover:text-foreground transition-colors">AI</a>
            <Link href="/plans" className="hover:text-foreground transition-colors" data-testid="link-plans">Plans</Link>
            <a href="#security" className="hover:text-foreground transition-colors">Security</a>
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
          Now in Beta for Microsoft 365
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tight max-w-4xl mx-auto leading-tight mb-6 text-transparent bg-clip-text bg-gradient-to-b from-foreground to-foreground/70">
          Enterprise Governance for <br className="hidden md:block"/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-secondary to-primary">Microsoft 365</span>
        </h1>

        <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto mb-10 font-light">One authoritative view of every SharePoint site, Teams workspace, OneDrive, and SharePoint Embedded container — with the policy enforcement, sensitivity label governance, and Copilot readiness tooling to manage them confidently at scale.</p>

        <div className="flex flex-col sm:flex-row gap-4 items-center justify-center">
          <Button asChild size="lg" className="h-14 px-8 text-base rounded-full shadow-xl shadow-primary/25 gap-2">
            <Link href="/auth/entra/callback">
              Start your free trial <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-14 px-8 text-base rounded-full border-border/50 bg-background/50 backdrop-blur-sm hover:bg-muted">
            <a href="#product">Explore capabilities</a>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground/70 mt-6 max-w-xl">Zenith is currently in Beta. Features and service plans are evolving — your feedback shapes the platform.</p>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mt-32 text-left">
          <div className="glass-panel p-8 rounded-2xl transition-all hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-6 border border-blue-500/20">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Unified M365 Inventory</h3>
            <p className="text-muted-foreground leading-relaxed">
              Continuously synchronised inventory of every SharePoint site, Teams workspace, OneDrive, and SharePoint Embedded container — with sensitivity, sharing, and lifecycle detail in one place.
            </p>
          </div>

          <div className="glass-panel p-8 rounded-2xl transition-all hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500 mb-6 border border-purple-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Policy-Driven Governance</h3>
            <p className="text-muted-foreground leading-relaxed">
              Composable rules produce named Policy Outcomes written back to SharePoint property bags — so Purview Adaptive Scopes, Microsoft Search, and Copilot reflect your governance posture automatically.
            </p>
          </div>

          <div className="glass-panel p-8 rounded-2xl transition-all hover:-translate-y-1 duration-300">
            <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-6 border border-indigo-500/20">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-semibold mb-3">AI-Powered Assessments</h3>
            <p className="text-muted-foreground leading-relaxed">
              GPT-backed Copilot Readiness and Information Architecture assessments, grounded in your own standards and powered by Azure AI Foundry inside your tenant boundary.
            </p>
          </div>
        </div>
      </main>

      {/* Core Capabilities Section */}
      <section id="product" className="relative z-10 py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Core Capabilities</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Govern Every Corner of M365</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">Zenith replaces fragmented PowerShell scripts, manual spreadsheets, and reactive compliance responses with a proactive, automated governance layer built for organizations where Microsoft 365 is mission-critical infrastructure.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-4 border border-emerald-500/20">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Workspace Inventory &amp; Discovery</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Deep, scheduled Graph API sync of SharePoint Team, Communication, and Hub sites alongside document libraries, SharePoint Embedded containers, Loop workspaces, Whiteboards, and Copilot notebooks — with optional OneDrive, Teams channels, meeting recordings, and license discovery modules.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 mb-4 border border-purple-500/20">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Governance Policy Engine</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Composable rules produce named Policy Outcomes — <code className="text-xs bg-muted/40 px-1 py-0.5 rounded">ZenithCopilotReady</code>, External Sharing Risk, Retention Compliance — written directly to SharePoint property bags. Define custom outcomes without writing PowerShell.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4 border border-blue-500/20">
                <Gauge className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Copilot Readiness</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Weighted 0–100 readiness score per workspace. Org-wide dashboard segments workspaces into Ready, Nearly Ready, At Risk, and Blocked tiers — with a ranked remediation queue prioritising the sites closest to eligibility.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-500 mb-4 border border-rose-500/20">
                <Tag className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Sensitivity Label Governance</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Enforce Highly Confidential on Deal Room and Portfolio Company workspaces, blocking external sharing and Copilot access where required. Label changes are applied via Graph, audited, and validated every sync cycle for drift.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 mb-4 border border-amber-500/20">
                <Share2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Sharing Link Discovery</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Crawl SharePoint sites and OneDrive drives to enumerate every active anonymous, org-wide, and specific-user sharing link at the file and folder level. Track trends across scans and spot sprawl before it becomes a compliance incident.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-500 mb-4 border border-sky-500/20">
                <Mail className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Email Content Storage Report</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Analyse Exchange Online mailboxes to classify attachments as classic files, modern reference links, or inline images. Surface the heaviest mailbox consumers with per-user CSV export and actionable status guidance.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500 mb-4 border border-indigo-500/20">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Governed Provisioning</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Templates enforce governance from the moment a site is created — Deal Room (10-year hold), Portfolio Company (7-year hold), and General Purpose — applying naming prefixes, sensitivity labels, retention policies, and minimum owner requirements automatically.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-500 mb-4 border border-violet-500/20">
                <Network className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Information Architecture Analysis</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Map the hub hierarchy across each tenant, identify orphaned sites, expose the full IA graph in the Structures view, and drill into document libraries for live content types, custom columns, and Syntex models.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-500 mb-4 border border-teal-500/20">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold mb-2">What-If Scenario Planner</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Simulate policy rule changes against the live workspace population and preview the diff before committing — showing exactly which sites would move in or out of scope, and why, before a single property bag is touched.</p>
            </div>
          </div>
        </div>
      </section>

      {/* AI-Powered Capabilities Section */}
      <section id="ai" className="relative z-10 py-24 px-4 border-t border-border/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">AI-Powered</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">AI Grounded in Your Standards</h2>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto">Zenith's AI layer is powered by GPT-4o and GPT-5.x hosted on Azure AI Foundry — your own Azure subscription, so data never leaves the tenant boundary. Every AI response is grounded in Synozur governance standards plus your organization's own policies.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-6 border border-blue-500/20">
                <Cloud className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Azure AI Foundry Integration</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Provider-agnostic architecture with per-feature model assignments — GPT-5.x for deep assessment, GPT-4o-mini for routine chat. Anthropic Claude and OpenAI models are available as fallbacks. Every call is logged with token usage, cost, and duration, with a monthly budget and configurable alert thresholds.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-6 border border-emerald-500/20">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Grounding Documents</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Two layers of authoritative context anchor every AI response: system-level documents encoding Synozur's M365 governance standards, plus organization-level documents encoding your naming conventions and IA policies. Outputs are specific and actionable, not generic AI knowledge.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-500 mb-6 border border-violet-500/20">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">Copilot Readiness &amp; IA Assessments</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Natural-language executive summaries, per-workspace remediation narratives, and 30/60/90-day roadmaps for Copilot rollout. The IA Assessment scores Naming, Hub Governance, Metadata, Sensitivity, and Lifecycle — turning a multi-week consulting engagement into an on-demand, repeatable report exportable as Markdown.</p>
            </div>

            <div className="glass-panel p-8 rounded-2xl border border-border/50 transition-all hover:-translate-y-1 duration-300">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 mb-6 border border-amber-500/20">
                <Bot className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-semibold mb-3">AI Governance Assistant &amp; Agent Skills</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">The embedded assistant answers natural-language governance questions using live workspace data as ground truth — no hallucinations, no stale snapshots — with deep-link action buttons. Four Agent Skills (Provision, Validate, Explain, Report &amp; Recommend) control exactly what Microsoft 365 Copilot and the Vega Agent can do on your behalf.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Service Plans Section - moved to standalone /plans page */}
      <section className="relative z-10 py-24 px-4 border-t border-border/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Service Plans</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Choose Your Governance Tier</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">From a hands-on trial to an MSP-grade enterprise deployment — Zenith scales with your governance maturity.</p>
          </div>
          <div className="flex justify-center">
            <Button asChild size="lg" className="h-12 px-8 text-base rounded-full shadow-xl shadow-primary/25 gap-2">
              <Link href="/plans" data-testid="button-view-plans">
                Compare Service Plans <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground/70 mt-6">Plans and features are evolving during Beta. Contact your account team for current availability.</p>
        </div>
      </section>

      {/* Built for Enterprise Section */}
      <section className="relative z-10 py-24 px-4 border-t border-border/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-3">Administration</p>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">Built for Mission-Critical M365</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">Multi-tenancy, role-based access, and full audit trails designed for organizations where Microsoft 365 is mission-critical infrastructure.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4 border border-primary/20">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Multi-Tenant by Design</h3>
              <p className="text-sm text-muted-foreground">MSP, Customer, and Hybrid organizations can connect unlimited tenants, with strict data isolation at the organization boundary and consent-coded cross-tenant access.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary mx-auto mb-4 border border-secondary/20">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Six-Role RBAC</h3>
              <p className="text-sm text-muted-foreground">Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, and Read-Only Auditor — per-organization role assignments enforced on every API route.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 mx-auto mb-4 border border-emerald-500/20">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Immutable Audit Log</h3>
              <p className="text-sm text-muted-foreground">Every label change, policy edit, provisioning request, sharing override, AI assessment, and agent skill invocation — logged with user, timestamp, resource, outcome, and CSV export.</p>
            </div>
            <div className="glass-panel p-6 rounded-2xl text-center">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 mx-auto mb-4 border border-amber-500/20">
                <BrainCircuit className="w-6 h-6" />
              </div>
              <h3 className="font-semibold mb-2">Custom Fields &amp; Dictionaries</h3>
              <p className="text-sm text-muted-foreground">Define tenant-owned custom metadata fields that extend the workspace schema, surface in inventory and exports, and plug directly into policy rules as inputs.</p>
            </div>
          </div>
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
              <h3 className="text-lg font-semibold mb-3">Encryption at Rest</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">Enable Tenant Database Masking to apply field-level encryption to your site inventory, tenant credentials, and metadata values. Sensitive fields are stored ciphertext — unreadable even at the database layer.</p>
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
                <li><Link href="/plans" className="text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-footer-plans">Service Plans</Link></li>
                <li><a href="#security" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Security</a></li>
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