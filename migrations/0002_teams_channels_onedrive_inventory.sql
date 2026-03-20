-- Migration: add teams_inventory, channels_inventory, and onedrive_inventory tables
-- Run: psql $DATABASE_URL -f migrations/0002_teams_channels_onedrive_inventory.sql
--
-- Stores full tenant-level inventory for Teams, Channels, and OneDrive for Business,
-- independent of recordings.  Each table has a unique constraint so upserts are safe.

-- ── Teams Inventory ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "teams_inventory" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_connection_id"  varchar NOT NULL,

  "team_id"               text NOT NULL,        -- M365 group id
  "display_name"          text NOT NULL,
  "description"           text,
  "mail_nickname"         text,
  "visibility"            text,                 -- Public | Private | HiddenMembership
  "is_archived"           boolean DEFAULT false,
  "classification"        text,                 -- e.g. "Confidential" from Azure AD group classification
  "created_date_time"     text,
  "renewed_date_time"     text,

  -- Membership counts
  "member_count"          integer,
  "owner_count"           integer,
  "guest_count"           integer,

  -- SharePoint site backing info
  "sharepoint_site_url"   text,
  "sharepoint_site_id"    text,

  -- Sensitivity
  "sensitivity_label"     text,

  -- Discovery metadata
  "last_discovered_at"    timestamp DEFAULT now(),
  "discovery_status"      text NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | DELETED

  "created_at"            timestamp DEFAULT now()
);

ALTER TABLE "teams_inventory"
  ADD CONSTRAINT "uq_tenant_team"
  UNIQUE ("tenant_connection_id", "team_id");

-- ── Channels Inventory ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "channels_inventory" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_connection_id"  varchar NOT NULL,

  "team_id"               text NOT NULL,
  "channel_id"            text NOT NULL,
  "display_name"          text NOT NULL,
  "description"           text,
  "membership_type"       text NOT NULL DEFAULT 'standard',  -- standard | private | shared
  "email"                 text,
  "web_url"               text,
  "created_date_time"     text,

  -- Membership
  "member_count"          integer,

  -- Discovery metadata
  "last_discovered_at"    timestamp DEFAULT now(),
  "discovery_status"      text NOT NULL DEFAULT 'ACTIVE',

  "created_at"            timestamp DEFAULT now()
);

ALTER TABLE "channels_inventory"
  ADD CONSTRAINT "uq_tenant_channel"
  UNIQUE ("tenant_connection_id", "team_id", "channel_id");

-- ── OneDrive Inventory ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "onedrive_inventory" (
  "id"                      varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_connection_id"    varchar NOT NULL,

  "user_id"                 text NOT NULL,          -- M365 user object ID
  "user_display_name"       text,
  "user_principal_name"     text NOT NULL,
  "user_department"         text,
  "user_job_title"          text,
  "user_mail"               text,

  -- Drive info
  "drive_id"                text,
  "drive_type"              text,                   -- business | personal

  -- Quota
  "quota_total_bytes"       bigint,
  "quota_used_bytes"        bigint,
  "quota_remaining_bytes"   bigint,
  "quota_state"             text,                   -- normal | nearing | critical | exceeded

  -- Activity
  "last_activity_date"      text,
  "file_count"              integer,
  "active_file_count"       integer,

  -- Discovery metadata
  "last_discovered_at"      timestamp DEFAULT now(),
  "discovery_status"        text NOT NULL DEFAULT 'ACTIVE',

  "created_at"              timestamp DEFAULT now()
);

ALTER TABLE "onedrive_inventory"
  ADD CONSTRAINT "uq_tenant_user_onedrive"
  UNIQUE ("tenant_connection_id", "user_id");
