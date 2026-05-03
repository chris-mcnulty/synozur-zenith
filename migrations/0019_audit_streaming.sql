-- BL-098: Audit log streaming to customer SIEM (Sentinel/Splunk/S3/Webhook/Datadog)

CREATE TABLE IF NOT EXISTS "audit_stream_configs" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" varchar NOT NULL,
  "destination_type" text NOT NULL,
  "endpoint" text NOT NULL,
  "secret_encrypted" text,
  "options" jsonb,
  "enabled" boolean NOT NULL DEFAULT true,
  "batch_size" integer NOT NULL DEFAULT 100,
  "cursor_timestamp" timestamp,
  "cursor_id" varchar,
  "last_delivery_at" timestamp,
  "last_delivery_status" text,
  "last_error" text,
  "last_error_at" timestamp,
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "total_delivered" integer NOT NULL DEFAULT 0,
  "total_failed" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now(),
  CONSTRAINT "uq_audit_stream_config_org" UNIQUE ("organization_id")
);

CREATE TABLE IF NOT EXISTS "audit_stream_deliveries" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "config_id" varchar NOT NULL,
  "organization_id" varchar NOT NULL,
  "status" text NOT NULL,
  "attempts" integer NOT NULL DEFAULT 1,
  "batch_size" integer NOT NULL DEFAULT 0,
  "first_audit_id" varchar,
  "last_audit_id" varchar,
  "last_audit_created_at" timestamp,
  "http_status" integer,
  "error_message" text,
  "event_ids" jsonb,
  "created_at" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_audit_stream_deliveries_config" ON "audit_stream_deliveries" ("config_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_audit_stream_deliveries_status" ON "audit_stream_deliveries" ("status");
CREATE INDEX IF NOT EXISTS "idx_audit_log_org_created" ON "audit_log" ("organization_id", "created_at");
