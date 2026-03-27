#!/bin/bash
set -e

npm install

# Apply all SQL migrations idempotently (all use IF NOT EXISTS / IF EXISTS)
# New migration files added to migrations/ are picked up automatically
MIGRATION_DIR="migrations"
if [ -d "$MIGRATION_DIR" ]; then
  for f in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
    echo "Applying migration: $f"
    psql "$DATABASE_URL" -f "$f" 2>&1 || true
  done
fi

# Core tables that are not in the numbered migration files
psql "$DATABASE_URL" << 'EOSQL' 2>&1 || true
-- platform_settings
CREATE TABLE IF NOT EXISTS platform_settings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  default_signup_plan text NOT NULL DEFAULT 'TRIAL',
  updated_at timestamp DEFAULT now(),
  updated_by varchar
);

-- support_tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number integer NOT NULL,
  organization_id varchar NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  assigned_to varchar REFERENCES users(id) ON DELETE SET NULL,
  application_source text NOT NULL DEFAULT 'Zenith',
  resolved_at timestamp,
  resolved_by varchar REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

-- support_ticket_replies
CREATE TABLE IF NOT EXISTS support_ticket_replies (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id varchar NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_internal boolean DEFAULT false,
  created_at timestamp DEFAULT now() NOT NULL
);

-- document_libraries flag columns
ALTER TABLE document_libraries ADD COLUMN IF NOT EXISTS flagged_large_items boolean NOT NULL DEFAULT false;
ALTER TABLE document_libraries ADD COLUMN IF NOT EXISTS flagged_version_sprawl boolean NOT NULL DEFAULT false;
EOSQL
