-- Migration: Copilot Prompt Intelligence (BL-038)
--
-- Adds two tables to support rolling 30-day capture and analysis of
-- Microsoft 365 Copilot user-initiated interactions:
--
--   copilot_interactions         — raw captured prompts with analysis results
--   copilot_prompt_assessments   — aggregated on-demand assessment reports
--
-- Rolling 30-day retention is enforced by the capture service after each sync.

-- ── copilot_interactions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "copilot_interactions" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_connection_id"  varchar NOT NULL REFERENCES tenant_connections(id) ON DELETE CASCADE,
  "organization_id"       varchar NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "graph_interaction_id"  text NOT NULL,
  "user_id"               text NOT NULL,
  "user_principal_name"   text NOT NULL,
  "user_display_name"     text,
  "user_department"       text,
  "app_class"             text NOT NULL,
  "prompt_text"           text NOT NULL,
  "interaction_at"        timestamp NOT NULL,
  "quality_tier"          text,
  "quality_score"         integer,
  "risk_level"            text,
  "flags"                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  "recommendation"        text,
  "analyzed_at"           timestamp,
  "captured_at"           timestamp DEFAULT now(),
  CONSTRAINT uq_copilot_interactions_tenant_graph UNIQUE ("tenant_connection_id", "graph_interaction_id")
);

CREATE INDEX IF NOT EXISTS idx_copilot_interactions_org
  ON copilot_interactions(organization_id);
CREATE INDEX IF NOT EXISTS idx_copilot_interactions_tenant
  ON copilot_interactions(tenant_connection_id);
CREATE INDEX IF NOT EXISTS idx_copilot_interactions_user
  ON copilot_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_copilot_interactions_date
  ON copilot_interactions(interaction_at);
CREATE INDEX IF NOT EXISTS idx_copilot_interactions_quality
  ON copilot_interactions(quality_tier);
CREATE INDEX IF NOT EXISTS idx_copilot_interactions_risk
  ON copilot_interactions(risk_level);

-- ── copilot_prompt_assessments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "copilot_prompt_assessments" (
  "id"                    varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id"       varchar NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  "tenant_connection_id"  varchar NOT NULL REFERENCES tenant_connections(id) ON DELETE CASCADE,
  "status"                text NOT NULL DEFAULT 'PENDING',
  "triggered_by"          varchar REFERENCES users(id),
  "interaction_count"     integer,
  "user_count"            integer,
  "date_range_start"      timestamp,
  "date_range_end"        timestamp,
  "org_summary"           jsonb,
  "department_breakdown"  jsonb,
  "user_breakdown"        jsonb,
  "executive_summary"     text,
  "recommendations"       jsonb,
  "model_used"            text,
  "tokens_used"           integer,
  "started_at"            timestamp,
  "completed_at"          timestamp,
  "error"                 text,
  "created_at"            timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_prompt_assessments_org
  ON copilot_prompt_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_copilot_prompt_assessments_tenant
  ON copilot_prompt_assessments(tenant_connection_id);
CREATE INDEX IF NOT EXISTS idx_copilot_prompt_assessments_status
  ON copilot_prompt_assessments(status);
CREATE INDEX IF NOT EXISTS idx_copilot_prompt_assessments_created
  ON copilot_prompt_assessments(created_at DESC);
