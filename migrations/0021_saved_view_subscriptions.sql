-- Saved view subscriptions (task-110)
-- Allows users to opt in to daily/weekly email digests when new items appear
-- in a saved inventory view.

CREATE TABLE IF NOT EXISTS "saved_view_subscriptions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "saved_view_id" varchar NOT NULL,
  "user_id" varchar NOT NULL,
  "organization_id" varchar NOT NULL,
  "frequency" text NOT NULL DEFAULT 'weekly',
  "last_snapshot_json" jsonb,
  "last_sent_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uq_saved_view_subscriptions_view_user" UNIQUE ("saved_view_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "ix_saved_view_subs_view" ON "saved_view_subscriptions" ("saved_view_id");
CREATE INDEX IF NOT EXISTS "ix_saved_view_subs_user" ON "saved_view_subscriptions" ("user_id");
