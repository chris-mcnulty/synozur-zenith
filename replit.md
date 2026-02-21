# Zenith - Microsoft 365 Governance Platform

## Overview
Zenith is a Microsoft 365 governance platform MVP built for The Synozur Alliance (Platinum Equity). It focuses on governed SharePoint site provisioning with Deal and Portfolio Company context, site inventory tracking, sensitivity label enforcement, and Copilot eligibility explainability. All workspaces are SharePoint sites (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with optional Microsoft Teams connectivity.

## Architecture
- **Frontend**: React + Vite + TanStack Query + shadcn/ui + wouter routing
- **Backend**: Express.js + Drizzle ORM + PostgreSQL (Neon)
- **Database**: PostgreSQL with tables: workspaces, provisioning_requests, copilot_rules

## Organization & Tenants
- Organization: "The Synozur Alliance"
- Tenant 1: synozur.onmicrosoft.com (primary, production)
- Tenant 2: cascadiaoceanic.onmicrosoft.com (Cascadia Oceanic, shown in green)

## Key Design Decisions
- All workspaces are SharePoint sites with optional Teams connectivity (teamsConnected boolean)
- Site templates: TEAM_SITE, COMMUNICATION_SITE, HUB_SITE
- Deal/PortCo naming conventions (DEAL-, PORTCO- prefixes applied automatically)
- Highly Confidential sensitivity blocks external sharing and Copilot indexing by default
- Required dual ownership (Primary Steward + Secondary Owner) to prevent orphaned workspaces
- Copilot eligibility displayed with clear pass/fail criteria
- "Discover & Migrate" marked as Enterprise+ feature

## Project Structure
- `shared/schema.ts` - Drizzle schema definitions for workspaces, provisioning_requests, copilot_rules
- `server/db.ts` - Database connection (pg + drizzle)
- `server/storage.ts` - DatabaseStorage class implementing IStorage interface
- `server/routes.ts` - API routes (/api/workspaces, /api/provisioning-requests, /api/stats, etc.)
- `server/seed.ts` - Database seeding script with 12 realistic workspaces
- `client/src/pages/app/` - All app pages (dashboard, governance, provision-new, workspace-details, etc.)
- `client/src/components/layout/app-shell.tsx` - Main layout shell

## API Endpoints
- GET/POST /api/workspaces - List/create workspaces (search via ?search=)
- GET/PATCH/DELETE /api/workspaces/:id - Single workspace CRUD
- PATCH /api/workspaces/bulk/update - Bulk update workspaces
- GET/POST /api/provisioning-requests - List/create provisioning requests
- PATCH /api/provisioning-requests/:id/status - Update request status
- GET/PUT /api/workspaces/:id/copilot-rules - Copilot eligibility rules
- GET /api/stats - Dashboard statistics

## Recent Changes
- 2026-02-21: Built comprehensive workspace details/properties page with edit mode, metadata editing, property bag view, lifecycle timeline
- 2026-02-21: Updated all org references to "The Synozur Alliance", tenants to synozur.onmicrosoft.com + cascadiaoceanic.onmicrosoft.com
- 2026-02-21: Refactored workspace types to SharePoint site templates (TEAM_SITE, COMMUNICATION_SITE, HUB_SITE) with teamsConnected flag
- 2026-02-21: Converted from mockup to full-stack app with PostgreSQL
- 2026-02-21: Implemented complete backend (schema, storage, routes)
- 2026-02-21: Wired all frontend pages to real API endpoints
- 2026-02-21: Seeded 12 demo workspaces + 4 provisioning requests + copilot rules
