-- Migration: Microsoft Planner integration for support tickets (BL-37)
--
-- Adds system-level configuration columns to platform_settings so platform
-- owners can target a specific bucket within a shared Synozur Planner plan
-- (the same plan also holds tickets from Constellation and Vega), and adds
-- a plannerTaskId column to support_tickets for traceability.
--
-- Plan id and bucket id are stored in the database (not env vars) so
-- platform owners can re-target the integration at runtime.

-- ── platform_settings: Planner target configuration ─────────────────────────────
ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "planner_plan_id"   text,
  ADD COLUMN IF NOT EXISTS "planner_bucket_id" text;

-- ── support_tickets: created Planner task id (for traceability / dedupe) ────────
ALTER TABLE "support_tickets"
  ADD COLUMN IF NOT EXISTS "planner_task_id" text;
