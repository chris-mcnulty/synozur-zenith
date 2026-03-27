-- Migration: add content_types table
-- Stores Content Type Hub content types synced from Microsoft 365 Graph API.
-- Scoped to tenant connection for multi-tenant isolation.

CREATE TABLE IF NOT EXISTS "content_types" (
  "id"                      varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_connection_id"    varchar NOT NULL,
  "content_type_id"         text NOT NULL,
  "name"                    text NOT NULL,
  "group"                   text,
  "description"             text,
  "is_hub"                  boolean NOT NULL DEFAULT false,
  "subscribed_site_count"   integer NOT NULL DEFAULT 0,
  "synced_at"               timestamp DEFAULT now(),

  CONSTRAINT "uq_tenant_content_type" UNIQUE ("tenant_connection_id", "content_type_id")
);
