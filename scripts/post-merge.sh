#!/bin/bash
set -e

npm install

# Apply any schema changes that drizzle-kit can't run non-interactively
psql "$DATABASE_URL" -c "
CREATE TABLE IF NOT EXISTS platform_settings (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  default_signup_plan text NOT NULL DEFAULT 'TRIAL',
  updated_at timestamp DEFAULT now(),
  updated_by varchar
);
" 2>&1 || true
