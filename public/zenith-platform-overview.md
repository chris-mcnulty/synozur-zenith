# Zenith — Microsoft 365 Governance Platform
### Product Overview for Microsoft 365 Administrators

---

## What Zenith Does

Zenith is a governed control plane for Microsoft 365 environments. It gives M365 administrators a single, authoritative view of every SharePoint site, Teams workspace, OneDrive, and SharePoint Embedded container across one or more tenants — with the policy enforcement, sensitivity label governance, and Copilot readiness tooling to manage them confidently at scale. Built for organisations where Microsoft 365 is mission-critical infrastructure, Zenith replaces fragmented PowerShell scripts, manual spreadsheets, and reactive compliance responses with a proactive, automated governance layer.

---

## Core Capabilities

### Workspace Inventory & Discovery
Zenith performs deep, scheduled synchronisation against the Microsoft Graph API to build a continuously updated inventory of every managed workspace. Administrators see SharePoint Team Sites, Communication Sites, and Hub Sites alongside their metadata: sensitivity label, site owners, external sharing status, last activity date, storage consumption, Teams connectivity, hub parent, and custom governance fields. Document libraries are first-class inventory entities, surfacing content types, custom columns, Syntex models, and SharePoint Embedded containers (Loop workspaces, Whiteboards, Copilot notebooks) with usage and label detail.

Optional discovery modules extend inventory to **OneDrive** storage per user, **Teams channels and private channels**, **Teams meeting recordings and transcripts**, and **Microsoft 365 license assignments** — each independently toggleable per tenant with in-flight cancellation and data purge controls.

### Governance Policy Engine
Zenith evaluates every workspace against a configurable set of governance policies. Each policy is built from composable rules (sensitivity tier, external sharing state, owner presence, site type, activity recency, hub membership) and produces one or more **Policy Outcomes** — named conclusions written directly to SharePoint property bags for consumption by Purview Adaptive Scopes, Microsoft Search, and Copilot. Built-in outcomes include `ZenithCopilotReady`, External Sharing Risk, and Retention Compliance. Administrators define custom outcomes without writing PowerShell.

A **What-If Scenario Planner** lets governance teams simulate changes to policy rules against the live workspace population and preview the diff before committing — showing exactly which sites would move in or out of scope and why.

### Copilot Readiness
Zenith provides a weighted 0–100 Copilot Readiness score for every workspace, evaluating sensitivity classification, external sharing posture, owner assignment, sensitivity label coverage, and lifecycle currency. An org-wide dashboard segments workspaces into Ready, Nearly Ready, At Risk, and Blocked tiers, with a ranked remediation queue prioritising the sites closest to eligibility. Workspaces can be explicitly excluded with a documented reason. Scores and outcomes are written back to SharePoint property bags so Purview Adaptive Scopes reflect the real-time governance posture automatically.

### Sensitivity Label Governance & Write-Back
Zenith enforces **Highly Confidential** as the mandatory sensitivity label for Deal Room and Portfolio Company workspaces, blocking any attempt to enable external sharing or Copilot access on sites carrying that classification. Sensitivity label changes are applied to SharePoint groups via Microsoft Graph and audited. Zenith validates label consistency on every sync cycle and flags drift for remediation.

### Content Security Reporting
The **Sharing Link Discovery** engine crawls SharePoint sites and OneDrive drives to enumerate every active sharing link — anonymous, organisation-wide, and specific-user — at the individual file and folder level. Results are grouped by site and drive for executive summary views, with drill-down to the per-item link inventory, link type breakdown, and creation/expiry metadata. Links are tracked across scans so administrators can monitor trends and identify sharing sprawl before it becomes a compliance incident.

The **Email Content Storage Report** analyses Exchange Online mailboxes to classify attachments: classic file attachments consuming mailbox quota, modern reference links (OneDrive/SharePoint), and inline images. The report surfaces the heaviest mailbox consumers and provides a per-user CSV export. Status detail explains partial runs (sampling cap) and failed runs (permission or connectivity issues) with actionable guidance.

### Governed Provisioning
Zenith's provisioning template library enforces governance from the moment a site is created. Built-in templates — Deal Room (10-year retention hold, dual ownership, external sharing blocked), Portfolio Company (7-year hold), and General Purpose (corporate defaults) — apply naming prefixes (DEAL-, PORTCO-, GEN-), sensitivity labels, retention policies, and minimum owner requirements automatically. Custom templates per organisation are supported. All provisioning requests are logged, policy-validated before creation, and immediately registered in the Zenith inventory.

### Information Architecture Analysis
Zenith maps the hub hierarchy across each tenant — identifying hub sites, associated member sites, orphaned sites with no hub parent, and sites with inconsistent naming conventions. The **Structures** view exposes the full IA graph. Document library detail views provide live content type inventories, custom column schemas, and Syntex/AI model associations pulled directly from Graph.

---

## AI-Powered Capabilities

### Azure AI Foundry Integration
Zenith's AI layer is powered by GPT-4o and GPT-5.x hosted on **Azure AI Foundry** — the organisation's own Azure subscription, so data never leaves the tenant boundary. The provider-agnostic architecture supports per-feature model assignments: different AI tasks can use different models (e.g., GPT-5.x for deep assessment, GPT-4o-mini for routine chat). Anthropic Claude and OpenAI models are available as fallbacks. All AI calls are logged with token consumption, estimated cost, model used, and duration, visible in the platform admin AI dashboard. A monthly token budget with configurable alert thresholds prevents runaway spend.

### Grounding Documents
AI responses in Zenith are grounded in two layers of authoritative context. **System-level documents** — uploaded by platform administrators — encode Synozur's M365 governance standards, Copilot eligibility criteria, and SharePoint best practices. **Organisation-level documents** — uploaded by tenant administrators — encode customer-specific naming conventions, internal IA policies, and governance requirements. Both layers are automatically injected into every AI assessment prompt, ensuring outputs are specific, actionable, and anchored to the customer's actual standards rather than generic AI knowledge.

### AI-Powered Copilot Readiness Assessment
Beyond the deterministic scoring engine, Zenith's AI assessment generates a **natural-language executive summary** of the organisation's Copilot readiness posture, a **per-workspace remediation narrative** explaining why each specific blocker matters and the precise steps to resolve it, and a **30/60/90-day remediation roadmap** grouping workspaces into prioritised remediation waves. Reports are exportable as Markdown for inclusion in governance review decks and board communications. Assessment results are stored and persist between sessions; administrators trigger assessments on demand.

### AI-Powered Information Architecture Assessment
Zenith's IA Assessment engine first runs a deterministic pre-pass scoring workspaces across five dimensions — Naming Consistency, Hub Governance, Metadata Completeness, Sensitivity Coverage, and Lifecycle Management — then passes that structured data to GPT for a **narrative IA health report**. The output includes an overall IA Health Score, a dimension-by-dimension radar chart, an executive summary, specific site-level callouts for the worst offenders in each dimension, and a prioritised recommendation list. This turns what was previously a multi-week consulting engagement into an on-demand, repeatable assessment any administrator can run.

### AI Governance Assistant
The embedded **Zenith AI Governance Assistant** answers natural-language governance questions using live workspace data as its only ground truth — no hallucinations, no stale snapshots. It understands questions about lifecycle overdue workspaces, orphaned sites, Copilot eligibility, external sharing risks, sensitivity label coverage, provisioning, and active policies. Open-ended questions that don't match a known intent are routed to GPT with a structured workspace context summary, enabling fluid governance conversations. The assistant surfaces deep-link action buttons (View Lifecycle Review, Manage Policies, Start Provisioning) so questions immediately connect to the relevant platform capability.

**Agent Skills** control which Zenith capabilities are exposed to external agents — Microsoft 365 Copilot and the Vega Agent. The four skills (Provision, Validate, Explain, Report & Recommend) can be independently enabled or disabled per organisation, with enforcement at the API layer and full audit logging of every agent-initiated action.

---

## Administration, Security & Compliance

**Multi-Tenancy:** Zenith is built for organisations managing multiple Microsoft 365 tenants. Each organisation (MSP, Customer, or Hybrid) can connect unlimited tenants, with strict data isolation enforced at the organisation boundary. MSP organisations can access customer tenants via a consent code mechanism, with full audit trails of cross-tenant access.

**RBAC:** Six roles — Platform Owner, Tenant Admin, Governance Admin, Operator, Viewer, and Read-Only Auditor — control access to every feature and action. Role assignments are per-organisation and enforced on every API route.

**Audit Log:** Every significant action — sensitivity label changes, policy modifications, provisioning requests, external sharing overrides, AI assessment runs, agent skill invocations — is written to an immutable audit log with user, timestamp, resource, and outcome. Filterable by action type, resource, user, and date range. Exportable for compliance reporting.

**Data Security:** Microsoft Entra ID handles authentication via PKCE OIDC; Zenith manages authorisation. Tenant client secrets are encrypted at rest using AES-256-GCM. An optional per-tenant database masking layer encrypts sensitive text fields in the Zenith database. AI grounding documents and assessment results are stored within the Zenith database boundary, not transmitted to third-party AI services when Azure Foundry is configured.

**Custom Fields & Data Dictionaries:** Administrators define tenant-owned custom metadata fields that extend the workspace schema — surfaced in inventory views, included in CSV exports, and available as policy rule inputs. Data dictionaries provide controlled-vocabulary dropdowns for consistent metadata entry.

---

## Service Plans

| Capability | Trial | Standard | Professional | Enterprise |
|---|:---:|:---:|:---:|:---:|
| SharePoint inventory sync | ✓ | ✓ | ✓ | ✓ |
| Governance policies & write-back | — | ✓ | ✓ | ✓ |
| Copilot Readiness Dashboard | — | — | ✓ | ✓ |
| AI-Powered Assessments (Copilot + IA) | — | — | ✓ | ✓ |
| Azure AI Foundry provider + grounding docs | — | — | ✓ | ✓ |
| AI Governance Assistant (GPT-backed) | — | ✓ | ✓ | ✓ |
| What-If Policy Planner | — | — | — | ✓ |
| Email Content Storage Report | — | — | — | ✓ |
| Sharing Link Discovery | — | — | ✓ | ✓ |
| MSP multi-tenant access | — | — | — | ✓ |
| Database masking | — | — | — | ✓ |
| Unlimited tenants / sites / users | — | — | — | ✓ |

---

## Outcomes for M365 Administrators

- **Copilot confidence** — Know exactly which workspaces are eligible, which are blocked and why, and have a GPT-generated remediation plan ready to act on.
- **Audit-ready posture** — Every governance action is logged. Sensitivity label state is continuously validated and written to SharePoint. Compliance questions are answerable in seconds, not days.
- **Sprawl control** — Sharing link inventory, orphan detection, and lifecycle overdue tracking surface risk before it becomes an incident.
- **IA clarity** — The first AI-generated IA health report for a tenant typically surfaces naming inconsistencies, hub orphans, and metadata gaps that have accumulated over years — with a prioritised remediation roadmap attached.
- **Time back** — Assessments that previously took consultants two to three weeks run in minutes. Governance questions that required PowerShell sessions are answered in plain English by the AI assistant.

---

*Zenith is built and operated by The Synozur Alliance. For service plan details, visit synozur.com or contact your account team.*
