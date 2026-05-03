-- Galaxy Partner API tables (task-103)

CREATE TABLE IF NOT EXISTS "galaxy_clients" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "client_id" text NOT NULL UNIQUE,
  "client_secret_encrypted" text NOT NULL,
  "public_key_pem" text NOT NULL,
  "organizations_allowed" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "allowed_scopes" text[] NOT NULL DEFAULT ARRAY['galaxy.read']::text[],
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "rate_limit_per_minute" integer NOT NULL DEFAULT 600,
  "token_ttl_seconds" integer NOT NULL DEFAULT 900,
  "created_by" varchar,
  "rotated_at" timestamp,
  "last_used_at" timestamp,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "galaxy_tokens" (
  "jti" varchar PRIMARY KEY,
  "galaxy_client_id" varchar NOT NULL,
  "scopes" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "issued_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL,
  "revoked_at" timestamp
);

CREATE INDEX IF NOT EXISTS "ix_galaxy_tokens_client" ON "galaxy_tokens" ("galaxy_client_id");
CREATE INDEX IF NOT EXISTS "ix_galaxy_tokens_expires" ON "galaxy_tokens" ("expires_at");

CREATE TABLE IF NOT EXISTS "galaxy_user_acknowledgements" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" varchar NOT NULL,
  "galaxy_client_id" varchar NOT NULL,
  "galaxy_user_sub" text NOT NULL,
  "galaxy_user_email" text,
  "resource_type" text NOT NULL,
  "resource_id" text NOT NULL,
  "action" text NOT NULL,
  "comment" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_galaxy_acks_org_resource" ON "galaxy_user_acknowledgements" ("organization_id", "resource_type", "resource_id");
CREATE INDEX IF NOT EXISTS "ix_galaxy_acks_user" ON "galaxy_user_acknowledgements" ("galaxy_user_sub", "created_at");
