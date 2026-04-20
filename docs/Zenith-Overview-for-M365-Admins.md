# Zenith: Your Microsoft 365 Governance Command Center
### The Synozur Alliance Platform for M365 Admins

---

## The Problem You Already Know

Your Microsoft 365 tenant has grown organically. Hundreds (or thousands) of SharePoint sites, Teams, OneDrive accounts, and mailboxes — many with unclear ownership, inconsistent naming, excessive sharing, and no sensitivity labels. Now leadership wants to turn on **Microsoft 365 Copilot**, and suddenly every governance gap becomes an AI risk.

**Copilot can only be as trustworthy as the data it reads.** If your tenant has overshared content, unlabeled sensitive data, or abandoned workspaces, Copilot will surface that content to anyone with a license — no questions asked.

Zenith gives you the visibility, control, and confidence to govern your tenant properly — and prove you're ready for Copilot.

---

## What Zenith Does

### Inventory Everything — Automatically
Zenith connects to your tenant via a standard Entra app registration and pulls a comprehensive inventory across your entire M365 estate:

- **SharePoint Sites** — ownership, storage, activity, sensitivity labels, hub associations, naming compliance
- **Teams & Channels** — team membership, channel structure, and governance state
- **OneDrive Accounts** — per-user storage consumption and file counts
- **Meeting Recordings** — where recordings live in SharePoint and who owns them
- **Email Content** — mailbox sizes, growth trends, and large-attachment analysis
- **SharePoint Embedded Containers** — Loop workspaces, Whiteboards, Copilot notebooks, and other SPE surfaces
- **License Assignments** — every SKU assigned to every user, including Copilot licenses
- **Sharing Links** — external, anonymous, and organization-wide links across your sites

All data refreshes on a schedule you control, with a **Data Freshness dashboard** showing exactly when each dataset was last synced and whether it's current.

### Govern with Policies — Not Spreadsheets
Zenith's **Policy Engine** lets you define rules that evaluate every workspace in your tenant:

- **Built-in policy outcomes**: Copilot Eligible, External Sharing Approved, PII Approved, Sensitive Data Approved
- **Custom fields and data dictionaries**: tag workspaces with Department, Cost Center, Region, or any metadata you need
- **What-If Planner**: simulate a policy change and see which workspaces would be affected *before* you apply it
- **Information Architecture scoring**: assess the health of your content types, site columns, and metadata across hub hierarchies

### Know Your Copilot Readiness — Before You Deploy
Zenith's **Copilot Readiness** module evaluates every workspace against the criteria that matter for a safe Copilot rollout:

- Does the site have a sensitivity label?
- Is external sharing locked down appropriately?
- Is there a clear owner?
- Are there governance policy violations?

Each workspace gets a readiness score so you can prioritize remediation and confidently answer: *"Which sites are safe for Copilot users to access?"*

---

## Copilot Prompt Intelligence — See What Your Users Are Actually Doing

Once Copilot is live, Zenith goes further. The **Copilot Prompt Intelligence** module syncs every Copilot interaction in your tenant — both user prompts and AI responses — directly from the Microsoft Graph API.

**What you get:**

- **Full conversation capture**: every prompt a user sends to Copilot and every response it generates, linked by session and request ID so you can follow entire conversation threads
- **Per-user, per-app visibility**: see which Copilot surfaces are being used (Word, Teams, PowerPoint, etc.) and by whom
- **Automated prompt quality scoring**: each user prompt is analyzed for specificity, risk signals, and effectiveness — scored into quality tiers (Excellent, Good, Fair, Poor)
- **Risk detection**: flags for sensitive content mentions, PII patterns, and prompts that may indicate data exposure concerns
- **AI-generated Executive Summary**: a GPT-powered narrative report that synthesizes usage patterns, quality trends, department breakdowns, and actionable recommendations — ready to share with leadership
- **30-day rolling window**: keeps a manageable, always-current dataset with automatic cleanup of older data

This isn't just usage reporting — it's **prompt governance**. You can see whether your users are getting value from Copilot, identify training opportunities, and catch risk patterns before they become incidents.

---

## How It Works (The Short Version)

| Step | What Happens |
|------|-------------|
| **1. Connect** | Register a standard Entra app with read-only Graph permissions. Zenith connects via client credentials — no user sign-in required for data collection. |
| **2. Discover** | Zenith inventories your tenant: sites, teams, users, licenses, sharing links, recordings, email, and SPE containers. |
| **3. Assess** | Policies evaluate every workspace. Copilot Readiness scores are calculated. Information Architecture health is graded. |
| **4. Enable Copilot** | Deploy Copilot licenses to users whose workspaces pass governance checks. |
| **5. Monitor** | Copilot Prompt Intelligence captures and scores every interaction. Executive summaries keep leadership informed. |

---

## Built for MSPs and Enterprises

- **Multi-tenant**: manage multiple M365 tenants from a single Zenith instance
- **Multi-organization**: MSPs can group tenants by client organization with role-based access
- **Data masking**: optional per-tenant encryption of sensitive fields (user names, prompt text) for privacy-conscious environments
- **Tiered service plans**: Standard, Professional, and Enterprise tiers to match your needs
- **Self-hosted or SaaS**: deploy on your infrastructure or use the hosted platform

---

## The Bottom Line

Every M365 admin knows the governance gaps in their tenant. Zenith makes those gaps visible, measurable, and fixable — and gives you the proof that your environment is ready for Copilot and AI.

**Before Copilot**: Inventory, govern, label, and score.
**After Copilot**: Monitor, assess, and optimize.

*Zenith is the platform that gets you from "we think we're ready" to "we know we're ready."*

---

**The Synozur Alliance** | zenith.synozur.com
