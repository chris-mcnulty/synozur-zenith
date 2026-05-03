import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { loadCurrentUser } from "./middleware/rbac";
import { storage } from "./storage";
import { BUILT_IN_OUTCOMES } from "@shared/schema";
import { DEFAULT_COPILOT_READINESS_RULES } from "./services/policy-engine";
import { isEncryptionConfigured, encryptToken, isEncrypted } from "./utils/encryption";
import crypto from "crypto";
import { pool } from "./db";

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const PgStore = connectPgSimple(session);
if (!process.env.SESSION_SECRET) {
  console.warn('[session] SESSION_SECRET env var is not set — using a random secret that will change on every restart. Set SESSION_SECRET in production to keep sessions alive across deployments.');
}
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(64).toString('hex');

app.use(
  session({
    store: new PgStore({
      conString: process.env.DATABASE_URL,
      createTableIfMissing: true,
      tableName: 'session',
    }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    },
    name: 'zenith.sid',
  })
);

app.use(loadCurrentUser());

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

async function checkSendGridStartup() {
  try {
    const { getUncachableSendGridClient } = await import('./services/sendgrid-client');
    await getUncachableSendGridClient();
    log('SendGrid integration configured — transactional emails enabled');
  } catch (err: any) {
    console.warn('[SendGrid] WARNING: SendGrid is not configured or the API key is missing. Email verification and password reset emails will not be delivered. Error:', err.message);
  }
}

function checkEncryptionStartupGuard() {
  const secret = process.env.TOKEN_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    console.error(
      '[FATAL] TOKEN_ENCRYPTION_SECRET is missing or too short (must be at least 32 characters). ' +
      'Client secrets cannot be encrypted at rest. Set this environment variable before starting the server.'
    );
    process.exit(1);
  }
  log('Encryption key configured — client secrets will be encrypted at rest');
}

async function ensureTenantConnectionsSchema() {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('ensureTenantConnectionsSchema'))");

    const alterStatements = [
      "ALTER TABLE tenant_connections ADD COLUMN IF NOT EXISTS install_mode text NOT NULL DEFAULT 'MSP'",
      "ALTER TABLE tenant_connections ADD COLUMN IF NOT EXISTS data_masking_enabled boolean NOT NULL DEFAULT false",
      "ALTER TABLE tenant_connections ADD COLUMN IF NOT EXISTS onedrive_inventory_enabled boolean NOT NULL DEFAULT false",
      "ALTER TABLE tenant_connections ADD COLUMN IF NOT EXISTS recordings_discovery_enabled boolean NOT NULL DEFAULT false",
      "ALTER TABLE tenant_connections ADD COLUMN IF NOT EXISTS teams_discovery_enabled boolean NOT NULL DEFAULT false",
      "ALTER TABLE tenant_connections ADD COLUMN IF NOT EXISTS telemetry_enabled boolean NOT NULL DEFAULT false",
      "ALTER TABLE tenant_connections ADD COLUMN IF NOT EXISTS spe_discovery_enabled boolean NOT NULL DEFAULT false",
      "ALTER TABLE tenant_connections ADD COLUMN IF NOT EXISTS content_governance_enabled boolean NOT NULL DEFAULT false",
      "ALTER TABLE tenant_connections ADD COLUMN IF NOT EXISTS licensing_enabled boolean NOT NULL DEFAULT false",
      "ALTER TABLE tenant_connections ADD COLUMN IF NOT EXISTS lifecycle_scan_schedule_enabled boolean NOT NULL DEFAULT true",
    "ALTER TABLE tenant_connections ADD COLUMN IF NOT EXISTS copilot_sync_schedule_enabled boolean NOT NULL DEFAULT true",
    ];

    for (const stmt of alterStatements) {
      await client.query(stmt);
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS msp_access_grants (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        granting_org_id text NOT NULL,
        granted_to_org_id text,
        access_code text NOT NULL,
        code_expires_at timestamp NOT NULL,
        status text NOT NULL DEFAULT 'PENDING',
        granted_at timestamp,
        revoked_at timestamp,
        created_at timestamp DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_encryption_keys (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        encrypted_key text NOT NULL,
        created_at timestamp DEFAULT now(),
        CONSTRAINT uq_tenant_encryption_key UNIQUE (tenant_connection_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_access_grants (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL REFERENCES tenant_connections(id) ON DELETE CASCADE,
        granted_organization_id varchar NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        status text NOT NULL DEFAULT 'ACTIVE',
        granted_by varchar,
        created_at timestamp DEFAULT now(),
        revoked_at timestamp,
        CONSTRAINT uq_tenant_org_grant UNIQUE (tenant_connection_id, granted_organization_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenant_access_codes (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL REFERENCES tenant_connections(id) ON DELETE CASCADE,
        code text NOT NULL,
        expires_at timestamp NOT NULL,
        used boolean NOT NULL DEFAULT false,
        used_by_organization_id varchar,
        created_by varchar,
        created_at timestamp DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS page_views (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        path text NOT NULL,
        session_id text NOT NULL,
        ip_hash text,
        user_agent text,
        referrer text,
        utm_source text,
        utm_medium text,
        utm_campaign text,
        country text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON page_views(created_at);
      CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views(path);
    `);

    // ── Content Governance tables ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_governance_snapshots (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        snapshot_date date NOT NULL,
        total_sharepoint_sites integer DEFAULT 0,
        total_onedrive_accounts integer DEFAULT 0,
        inactive_onedrive_count integer DEFAULT 0,
        unlicensed_onedrive_count integer DEFAULT 0,
        orphaned_site_count integer DEFAULT 0,
        sites_missing_labels integer DEFAULT 0,
        external_sharing_site_count integer DEFAULT 0,
        anonymous_link_count integer DEFAULT 0,
        company_link_count integer DEFAULT 0,
        specific_people_link_count integer DEFAULT 0,
        total_storage_used_bytes bigint DEFAULT 0,
        total_onedrive_storage_used_bytes bigint DEFAULT 0,
        sites_over_quota_warning integer DEFAULT 0,
        created_at timestamp DEFAULT now(),
        CONSTRAINT uq_tenant_snapshot_date UNIQUE (tenant_connection_id, snapshot_date)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sharing_links_inventory (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        resource_type text NOT NULL,
        resource_id text NOT NULL,
        resource_name text,
        item_id text,
        item_name text,
        item_path text,
        link_id text NOT NULL,
        link_type text NOT NULL,
        link_scope text,
        created_by text,
        created_at_graph timestamp,
        expires_at timestamp,
        is_active boolean NOT NULL DEFAULT true,
        last_accessed_at timestamp,
        last_discovered_at timestamp DEFAULT now(),
        created_at timestamp DEFAULT now(),
        CONSTRAINT uq_tenant_item_link UNIQUE (tenant_connection_id, resource_id, item_id, link_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS sharing_link_discovery_runs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        started_at timestamp NOT NULL DEFAULT now(),
        completed_at timestamp,
        status text NOT NULL DEFAULT 'RUNNING',
        share_point_links_found integer DEFAULT 0,
        one_drive_links_found integer DEFAULT 0,
        sites_scanned integer DEFAULT 0,
        users_scanned integer DEFAULT 0,
        items_scanned integer DEFAULT 0,
        errors jsonb,
        created_at timestamp DEFAULT now(),
        phase text,
        last_processed_spo_site_id varchar,
        last_processed_onedrive_id varchar,
        resumable boolean NOT NULL DEFAULT false,
        items_total integer,
        items_processed integer,
        progress_label text
      )
    `);
    await client.query(`
      ALTER TABLE sharing_link_discovery_runs
        ADD COLUMN IF NOT EXISTS phase text,
        ADD COLUMN IF NOT EXISTS last_processed_spo_site_id varchar,
        ADD COLUMN IF NOT EXISTS last_processed_onedrive_id varchar,
        ADD COLUMN IF NOT EXISTS resumable boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS items_total integer,
        ADD COLUMN IF NOT EXISTS items_processed integer,
        ADD COLUMN IF NOT EXISTS progress_label text
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS sharing_link_discovery_runs_tenant_resumable_idx
        ON sharing_link_discovery_runs (tenant_connection_id, resumable, started_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS governance_review_tasks (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        organization_id varchar NOT NULL,
        review_type text NOT NULL,
        trigger_type text NOT NULL DEFAULT 'MANUAL',
        trigger_config jsonb,
        status text NOT NULL DEFAULT 'PENDING',
        target_resource_type text NOT NULL DEFAULT 'ALL',
        target_resource_ids text[],
        findings_count integer DEFAULT 0,
        resolved_count integer DEFAULT 0,
        assigned_to varchar,
        due_date timestamp,
        completed_at timestamp,
        created_at timestamp DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS governance_review_findings (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        review_task_id varchar NOT NULL REFERENCES governance_review_tasks(id) ON DELETE CASCADE,
        resource_type text NOT NULL,
        resource_id text NOT NULL,
        resource_name text,
        finding_type text NOT NULL,
        severity text NOT NULL DEFAULT 'MEDIUM',
        description text,
        recommended_action text,
        status text NOT NULL DEFAULT 'OPEN',
        resolved_by varchar,
        resolved_at timestamp,
        created_at timestamp DEFAULT now()
      )
    `);

    // ── Licensing tables ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS license_subscriptions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        sku_id text NOT NULL,
        sku_part_number text,
        display_name text,
        total_units integer DEFAULT 0,
        consumed_units integer DEFAULT 0,
        suspended_units integer DEFAULT 0,
        warning_units integer DEFAULT 0,
        enabled_service_plans jsonb,
        custom_price_per_unit numeric(10,2),
        billing_cycle text,
        last_synced_at timestamp,
        created_at timestamp DEFAULT now(),
        CONSTRAINT uq_tenant_sku UNIQUE (tenant_connection_id, sku_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS license_assignments (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        user_id text NOT NULL,
        user_principal_name text,
        user_display_name text,
        user_department text,
        user_job_title text,
        account_enabled boolean,
        last_sign_in_date text,
        sku_id text NOT NULL,
        sku_part_number text,
        assigned_date text,
        disabled_plans text[],
        last_synced_at timestamp,
        created_at timestamp DEFAULT now(),
        CONSTRAINT uq_tenant_user_sku UNIQUE (tenant_connection_id, user_id, sku_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS license_optimization_rules (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        organization_id varchar NOT NULL,
        rule_type text NOT NULL,
        config jsonb DEFAULT '{}'::jsonb,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamp DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS license_optimization_findings (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        rule_id varchar,
        finding_type text NOT NULL,
        user_id text,
        user_principal_name text,
        sku_id text,
        sku_display_name text,
        estimated_monthly_savings numeric(10,2),
        description text,
        status text NOT NULL DEFAULT 'OPEN',
        resolved_at timestamp,
        created_at timestamp DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_inventory (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        user_id text NOT NULL,
        user_principal_name text NOT NULL,
        mail text,
        display_name text,
        account_enabled boolean NOT NULL DEFAULT true,
        user_type text NOT NULL DEFAULT 'Member',
        mailbox_license_hint text,
        last_known_mail_activity text,
        last_refreshed_at timestamp NOT NULL DEFAULT now(),
        discovery_status text NOT NULL DEFAULT 'ACTIVE',
        created_at timestamp DEFAULT now(),
        CONSTRAINT uq_tenant_user_inventory UNIQUE (tenant_connection_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_inventory_runs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        started_at timestamp NOT NULL DEFAULT now(),
        completed_at timestamp,
        status text NOT NULL DEFAULT 'RUNNING',
        max_users_cap integer,
        users_discovered integer DEFAULT 0,
        users_marked_deleted integer DEFAULT 0,
        pages_fetched integer DEFAULT 0,
        errors jsonb,
        created_at timestamp DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS email_storage_reports (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        mode text NOT NULL,
        window_days integer NOT NULL,
        window_start timestamp NOT NULL,
        window_end timestamp NOT NULL,
        status text NOT NULL DEFAULT 'RUNNING',
        started_at timestamp NOT NULL DEFAULT now(),
        completed_at timestamp,
        limits jsonb NOT NULL,
        users_planned integer DEFAULT 0,
        users_processed integer DEFAULT 0,
        messages_analyzed integer DEFAULT 0,
        messages_with_attachments integer DEFAULT 0,
        estimated_attachment_bytes bigint DEFAULT 0,
        inventory_snapshot_at timestamp,
        inventory_sampled_count integer,
        inventory_total_count integer,
        verified_domains jsonb,
        data_masking_applied boolean NOT NULL DEFAULT false,
        summary jsonb,
        caps_hit jsonb,
        accuracy_caveats jsonb,
        errors jsonb,
        triggered_by_user_id varchar,
        created_at timestamp DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS content_types (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id varchar NOT NULL,
        content_type_id text NOT NULL,
        name text NOT NULL,
        "group" text,
        description text,
        is_hub boolean NOT NULL DEFAULT false,
        scope text NOT NULL DEFAULT 'HUB',
        subscribed_site_count integer NOT NULL DEFAULT 0,
        library_usage_count integer NOT NULL DEFAULT 0,
        site_usage_count integer NOT NULL DEFAULT 0,
        synced_at timestamp DEFAULT now(),
        CONSTRAINT uq_tenant_content_type UNIQUE (tenant_connection_id, content_type_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library_content_types (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id varchar NOT NULL,
        tenant_connection_id varchar NOT NULL,
        document_library_id varchar NOT NULL,
        content_type_id text NOT NULL,
        parent_content_type_id text,
        name text NOT NULL,
        "group" text,
        description text,
        scope text NOT NULL DEFAULT 'LIBRARY',
        is_built_in boolean NOT NULL DEFAULT false,
        is_inherited boolean NOT NULL DEFAULT false,
        hidden boolean NOT NULL DEFAULT false,
        last_sync_at timestamp DEFAULT now(),
        CONSTRAINT uq_library_content_type UNIQUE (document_library_id, content_type_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS library_columns (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id varchar NOT NULL,
        tenant_connection_id varchar NOT NULL,
        document_library_id varchar NOT NULL,
        column_internal_name text NOT NULL,
        display_name text NOT NULL,
        column_type text NOT NULL,
        column_group text,
        description text,
        scope text NOT NULL DEFAULT 'LIBRARY',
        is_custom boolean NOT NULL DEFAULT false,
        is_syntex_managed boolean NOT NULL DEFAULT false,
        is_sealed boolean NOT NULL DEFAULT false,
        is_read_only boolean NOT NULL DEFAULT false,
        is_indexed boolean NOT NULL DEFAULT false,
        is_required boolean NOT NULL DEFAULT false,
        last_sync_at timestamp DEFAULT now(),
        CONSTRAINT uq_library_column UNIQUE (document_library_id, column_internal_name)
      )
    `);

    // ── Backfill columns that may be missing on tables created by earlier migrations ──
    await client.query(`
      ALTER TABLE content_types ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'HUB';
      ALTER TABLE content_types ADD COLUMN IF NOT EXISTS subscribed_site_count integer NOT NULL DEFAULT 0;
      ALTER TABLE content_types ADD COLUMN IF NOT EXISTS library_usage_count integer NOT NULL DEFAULT 0;
      ALTER TABLE content_types ADD COLUMN IF NOT EXISTS site_usage_count integer NOT NULL DEFAULT 0;
      ALTER TABLE content_types ADD COLUMN IF NOT EXISTS is_hub boolean NOT NULL DEFAULT false;
      ALTER TABLE content_types ADD COLUMN IF NOT EXISTS "group" text;
      ALTER TABLE content_types ADD COLUMN IF NOT EXISTS description text;
      ALTER TABLE content_types ADD COLUMN IF NOT EXISTS synced_at timestamp DEFAULT now();
    `);

    await client.query(`
      ALTER TABLE library_content_types ADD COLUMN IF NOT EXISTS workspace_id varchar NOT NULL DEFAULT '';
      ALTER TABLE library_content_types ADD COLUMN IF NOT EXISTS tenant_connection_id varchar NOT NULL DEFAULT '';
      ALTER TABLE library_content_types ADD COLUMN IF NOT EXISTS parent_content_type_id text;
      ALTER TABLE library_content_types ADD COLUMN IF NOT EXISTS "group" text;
      ALTER TABLE library_content_types ADD COLUMN IF NOT EXISTS description text;
      ALTER TABLE library_content_types ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'LIBRARY';
      ALTER TABLE library_content_types ADD COLUMN IF NOT EXISTS is_built_in boolean NOT NULL DEFAULT false;
      ALTER TABLE library_content_types ADD COLUMN IF NOT EXISTS is_inherited boolean NOT NULL DEFAULT false;
      ALTER TABLE library_content_types ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;
      ALTER TABLE library_content_types ADD COLUMN IF NOT EXISTS last_sync_at timestamp DEFAULT now();
    `);

    await client.query(`
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS workspace_id varchar NOT NULL DEFAULT '';
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS tenant_connection_id varchar NOT NULL DEFAULT '';
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS column_group text;
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS description text;
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'LIBRARY';
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS is_custom boolean NOT NULL DEFAULT false;
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS is_syntex_managed boolean NOT NULL DEFAULT false;
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS is_sealed boolean NOT NULL DEFAULT false;
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS is_read_only boolean NOT NULL DEFAULT false;
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS is_indexed boolean NOT NULL DEFAULT false;
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false;
      ALTER TABLE library_columns ADD COLUMN IF NOT EXISTS last_sync_at timestamp DEFAULT now();
    `);

    // Backfill sharing_links_inventory columns added for per-item link tracking
    await client.query(`
      ALTER TABLE sharing_links_inventory ADD COLUMN IF NOT EXISTS item_id text;
      ALTER TABLE sharing_links_inventory ADD COLUMN IF NOT EXISTS item_name text;
      ALTER TABLE sharing_links_inventory ADD COLUMN IF NOT EXISTS item_path text;
    `);
    // Migrate unique constraint from old site-level to new item-level granularity
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tenant_link') THEN
          ALTER TABLE sharing_links_inventory DROP CONSTRAINT uq_tenant_link;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_tenant_item_link') THEN
          ALTER TABLE sharing_links_inventory
            ADD CONSTRAINT uq_tenant_item_link UNIQUE (tenant_connection_id, resource_id, item_id, link_id);
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_license_subs_tenant ON license_subscriptions(tenant_connection_id);
      CREATE INDEX IF NOT EXISTS idx_license_asgn_tenant ON license_assignments(tenant_connection_id);
      CREATE INDEX IF NOT EXISTS idx_cg_snapshots_tenant ON content_governance_snapshots(tenant_connection_id);
      CREATE INDEX IF NOT EXISTS idx_sharing_links_tenant ON sharing_links_inventory(tenant_connection_id);
      CREATE INDEX IF NOT EXISTS idx_sharing_link_runs_tenant ON sharing_link_discovery_runs(tenant_connection_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_user_inventory_tenant ON user_inventory(tenant_connection_id);
      CREATE INDEX IF NOT EXISTS idx_user_inventory_tenant_status ON user_inventory(tenant_connection_id, discovery_status);
      CREATE INDEX IF NOT EXISTS idx_user_inventory_runs_tenant ON user_inventory_runs(tenant_connection_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_email_storage_reports_tenant ON email_storage_reports(tenant_connection_id, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_content_types_tenant ON content_types(tenant_connection_id);
      CREATE INDEX IF NOT EXISTS idx_lib_ct_doclib ON library_content_types(document_library_id);
      CREATE INDEX IF NOT EXISTS idx_lib_ct_tenant ON library_content_types(tenant_connection_id);
      CREATE INDEX IF NOT EXISTS idx_lib_col_doclib ON library_columns(document_library_id);
      CREATE INDEX IF NOT EXISTS idx_lib_col_tenant ON library_columns(tenant_connection_id);
    `);

    // ── AI Provider Foundation tables ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_configuration (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        singleton_key text NOT NULL DEFAULT 'default',
        default_provider text NOT NULL DEFAULT 'azure_foundry',
        monthly_token_budget bigint,
        alert_threshold_percent integer NOT NULL DEFAULT 80,
        alert_email text,
        updated_at timestamp DEFAULT now(),
        CONSTRAINT uq_ai_configuration_singleton UNIQUE (singleton_key)
      )
    `);

    await client.query(`
      ALTER TABLE ai_configuration ADD COLUMN IF NOT EXISTS singleton_key text NOT NULL DEFAULT 'default';
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_ai_configuration_singleton') THEN
          ALTER TABLE ai_configuration ADD CONSTRAINT uq_ai_configuration_singleton UNIQUE (singleton_key);
        END IF;
      END $$;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_feature_model_assignments (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        feature text NOT NULL,
        provider text NOT NULL,
        model text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        updated_at timestamp DEFAULT now(),
        CONSTRAINT uq_ai_feature UNIQUE (feature)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_usage (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id text,
        feature text NOT NULL,
        provider text NOT NULL,
        model text NOT NULL,
        input_tokens integer NOT NULL DEFAULT 0,
        output_tokens integer NOT NULL DEFAULT 0,
        estimated_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
        duration_ms integer NOT NULL DEFAULT 0,
        success boolean NOT NULL DEFAULT true,
        error_message text,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_usage_alerts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id text,
        alert_type text NOT NULL,
        threshold_percent integer,
        tokens_at_alert bigint,
        budget_tokens bigint,
        notified_at timestamp NOT NULL DEFAULT now(),
        acknowledged_at timestamp
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_org ON ai_usage(org_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_feature ON ai_usage(feature, created_at DESC);
    `);

    // ── AI Agent Skills table (Task #54) ──────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_agent_skills (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id varchar NOT NULL,
        skill_key text NOT NULL,
        is_enabled boolean NOT NULL DEFAULT true,
        updated_by varchar,
        updated_at timestamp DEFAULT now(),
        CONSTRAINT uq_org_skill UNIQUE (organization_id, skill_key)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_agent_skills_org ON ai_agent_skills(organization_id);
    `);

    // ── AI Grounding Documents ──────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_grounding_documents (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        scope text NOT NULL,
        org_id varchar,
        name text NOT NULL,
        description text,
        content_text text NOT NULL,
        file_type text NOT NULL,
        file_size_bytes integer NOT NULL DEFAULT 0,
        is_active boolean NOT NULL DEFAULT true,
        uploaded_by varchar,
        created_at timestamp DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_grounding_scope ON ai_grounding_documents(scope, org_id);
    `);

    // ── AI Assessment Runs table (Tasks #52 + #53 — unified superset) ───────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_assessment_runs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id varchar NOT NULL,
        feature text NOT NULL DEFAULT 'copilot_readiness',
        status text NOT NULL DEFAULT 'PENDING',
        triggered_by varchar,
        result_markdown text,
        result_structured jsonb,
        model_used text,
        provider_used text,
        tokens_used integer,
        tenant_connection_id varchar,
        overall_score integer,
        executive_summary text,
        dimensions jsonb,
        roadmap jsonb,
        raw_ai_response text,
        total_sites integer,
        evaluated_sites integer,
        input_tokens integer NOT NULL DEFAULT 0,
        output_tokens integer NOT NULL DEFAULT 0,
        duration_ms integer NOT NULL DEFAULT 0,
        error_message text,
        completed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    const iaAssessmentAlterStatements = [
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS tenant_connection_id varchar",
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS overall_score integer",
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS executive_summary text",
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS dimensions jsonb",
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS roadmap jsonb",
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS raw_ai_response text",
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS total_sites integer",
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS evaluated_sites integer",
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS input_tokens integer NOT NULL DEFAULT 0",
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS output_tokens integer NOT NULL DEFAULT 0",
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS duration_ms integer NOT NULL DEFAULT 0",
      "ALTER TABLE ai_assessment_runs ADD COLUMN IF NOT EXISTS error_message text",
    ];
    for (const stmt of iaAssessmentAlterStatements) {
      await client.query(stmt);
    }
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ai_assessment_runs_org ON ai_assessment_runs(org_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_assessment_runs_feature ON ai_assessment_runs(org_id, feature, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ia_assessment_runs_tenant ON ai_assessment_runs(tenant_connection_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ia_assessment_runs_org ON ai_assessment_runs(org_id, created_at DESC);
    `);

    // ── BL-037: Microsoft Planner integration columns (migration 0011) ────────
    await client.query(`
      ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS planner_plan_id   text;
      ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS planner_bucket_id text;
      ALTER TABLE support_tickets   ADD COLUMN IF NOT EXISTS planner_task_id   text;
    `);

    // ── BL-038: Copilot Prompt Intelligence tables (migration 0012) ───────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS copilot_interactions (
        id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id  VARCHAR NOT NULL,
        organization_id       VARCHAR NOT NULL,
        graph_interaction_id  TEXT NOT NULL,
        user_id               TEXT NOT NULL,
        user_principal_name   TEXT NOT NULL,
        user_display_name     TEXT,
        user_department       TEXT,
        app_class             TEXT NOT NULL,
        prompt_text           TEXT NOT NULL,
        interaction_at        TIMESTAMP NOT NULL,
        quality_tier          TEXT,
        quality_score         INTEGER,
        risk_level            TEXT,
        flags                 JSONB NOT NULL DEFAULT '[]'::jsonb,
        recommendation        TEXT,
        analyzed_at           TIMESTAMP,
        captured_at           TIMESTAMP DEFAULT now(),
        UNIQUE (tenant_connection_id, graph_interaction_id)
      );
      CREATE INDEX IF NOT EXISTS idx_ci_tenant     ON copilot_interactions (tenant_connection_id);
      CREATE INDEX IF NOT EXISTS idx_ci_org        ON copilot_interactions (organization_id);
      CREATE INDEX IF NOT EXISTS idx_ci_user       ON copilot_interactions (tenant_connection_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_ci_date       ON copilot_interactions (tenant_connection_id, interaction_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ci_quality    ON copilot_interactions (tenant_connection_id, quality_tier);
      CREATE INDEX IF NOT EXISTS idx_ci_risk       ON copilot_interactions (tenant_connection_id, risk_level);
    `);

    await client.query(`
      ALTER TABLE copilot_interactions ALTER COLUMN app_class DROP NOT NULL;
      ALTER TABLE copilot_interactions ALTER COLUMN prompt_text DROP NOT NULL;
      ALTER TABLE copilot_interactions ADD COLUMN IF NOT EXISTS request_id TEXT;
      ALTER TABLE copilot_interactions ADD COLUMN IF NOT EXISTS session_id TEXT;
      ALTER TABLE copilot_interactions ADD COLUMN IF NOT EXISTS interaction_type TEXT NOT NULL DEFAULT 'userPrompt';
      ALTER TABLE copilot_interactions ADD COLUMN IF NOT EXISTS body_content TEXT;
      ALTER TABLE copilot_interactions ADD COLUMN IF NOT EXISTS body_content_type TEXT;
      ALTER TABLE copilot_interactions ADD COLUMN IF NOT EXISTS contexts JSONB;
      ALTER TABLE copilot_interactions ADD COLUMN IF NOT EXISTS attachments JSONB;
      ALTER TABLE copilot_interactions ADD COLUMN IF NOT EXISTS links JSONB;
      ALTER TABLE copilot_interactions ADD COLUMN IF NOT EXISTS mentions JSONB;
      ALTER TABLE copilot_interactions ADD COLUMN IF NOT EXISTS raw_data JSONB;
      CREATE INDEX IF NOT EXISTS idx_ci_interaction_type ON copilot_interactions (tenant_connection_id, interaction_type);
      CREATE INDEX IF NOT EXISTS idx_ci_session ON copilot_interactions (tenant_connection_id, session_id);
      CREATE INDEX IF NOT EXISTS idx_ci_request ON copilot_interactions (tenant_connection_id, request_id);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS copilot_prompt_assessments (
        id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id       VARCHAR NOT NULL,
        tenant_connection_id  VARCHAR NOT NULL,
        status                TEXT NOT NULL DEFAULT 'PENDING',
        triggered_by          VARCHAR,
        interaction_count     INTEGER,
        user_count            INTEGER,
        date_range_start      TIMESTAMP,
        date_range_end        TIMESTAMP,
        org_summary           JSONB,
        department_breakdown  JSONB,
        user_breakdown        JSONB,
        executive_summary     TEXT,
        recommendations       JSONB,
        model_used            TEXT,
        tokens_used           INTEGER,
        started_at            TIMESTAMP,
        completed_at          TIMESTAMP,
        error                 TEXT,
        created_at            TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_cpa_org        ON copilot_prompt_assessments (organization_id);
      CREATE INDEX IF NOT EXISTS idx_cpa_tenant     ON copilot_prompt_assessments (tenant_connection_id);
      CREATE INDEX IF NOT EXISTS idx_cpa_status     ON copilot_prompt_assessments (tenant_connection_id, status);
      CREATE INDEX IF NOT EXISTS idx_cpa_created    ON copilot_prompt_assessments (created_at DESC);
    `);

    // ── BL-038 addendum: Copilot Sync Runs (migration 0013) ──────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS copilot_sync_runs (
        id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_connection_id  VARCHAR NOT NULL,
        organization_id       VARCHAR NOT NULL,
        status                TEXT NOT NULL DEFAULT 'RUNNING',
        triggered_by          VARCHAR,
        users_scanned         INTEGER,
        interactions_captured INTEGER,
        interactions_skipped  INTEGER,
        interactions_purged   INTEGER,
        error_count           INTEGER,
        errors                JSONB,
        started_at            TIMESTAMP,
        completed_at          TIMESTAMP,
        error                 TEXT,
        created_at            TIMESTAMP DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_copilot_sync_runs_tenant  ON copilot_sync_runs (tenant_connection_id);
      CREATE INDEX IF NOT EXISTS idx_copilot_sync_runs_org     ON copilot_sync_runs (organization_id);
      CREATE INDEX IF NOT EXISTS idx_copilot_sync_runs_status  ON copilot_sync_runs (tenant_connection_id, status);
      CREATE INDEX IF NOT EXISTS idx_copilot_sync_runs_created ON copilot_sync_runs (created_at DESC);
    `);

    // ── BL-039: Scheduled Job Runs (migration 0014) ──────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_job_runs (
        id                    VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id       VARCHAR,
        tenant_connection_id  VARCHAR,
        job_type              TEXT NOT NULL,
        status                TEXT NOT NULL DEFAULT 'running',
        started_at            TIMESTAMP NOT NULL DEFAULT now(),
        completed_at          TIMESTAMP,
        duration_ms           INTEGER,
        result                JSONB,
        error_message         TEXT,
        triggered_by          TEXT NOT NULL DEFAULT 'manual',
        triggered_by_user_id  VARCHAR,
        target_id             TEXT,
        target_name           TEXT,
        items_total           INTEGER,
        items_processed       INTEGER,
        progress_label        TEXT,
        created_at            TIMESTAMP NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_org                    ON scheduled_job_runs (organization_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_tenant                 ON scheduled_job_runs (tenant_connection_id);
      CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_tenant_type            ON scheduled_job_runs (tenant_connection_id, job_type);
      CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_tenant_type_status     ON scheduled_job_runs (tenant_connection_id, job_type, status);
      CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_status                 ON scheduled_job_runs (status);
      CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_started_desc           ON scheduled_job_runs (started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job_type_started_desc  ON scheduled_job_runs (job_type, started_at DESC);
      ALTER TABLE scheduled_job_runs ADD COLUMN IF NOT EXISTS items_total     INTEGER;
      ALTER TABLE scheduled_job_runs ADD COLUMN IF NOT EXISTS items_processed INTEGER;
      ALTER TABLE scheduled_job_runs ADD COLUMN IF NOT EXISTS progress_label  TEXT;
    `);

    // ── BL-019: Workspace lifecycle state columns (migration 0019) ──────────
    await client.query(`
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS lifecycle_state text DEFAULT 'Active';
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archive_reason  text;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archived_at     timestamp;
      ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS archived_by     text;
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'workspaces_lifecycle_state_check'
        ) THEN
          ALTER TABLE workspaces
            ADD CONSTRAINT workspaces_lifecycle_state_check
            CHECK (lifecycle_state IN ('Active', 'Archived', 'PendingArchive', 'PendingRestore'));
        END IF;
      END $$;
      CREATE INDEX IF NOT EXISTS idx_workspaces_lifecycle_state ON workspaces (lifecycle_state);
    `);

    // Persistent app-only Graph token cache. Encrypted at rest; survives
    // cold starts so we don't refetch from Entra on every restart.
    await client.query(`
      CREATE TABLE IF NOT EXISTS graph_app_token_cache (
        id            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     text NOT NULL,
        client_id     text NOT NULL,
        scope         text NOT NULL,
        access_token  text NOT NULL,
        expires_at    timestamp NOT NULL,
        updated_at    timestamp DEFAULT now(),
        CONSTRAINT uq_app_token_cache_key UNIQUE (tenant_id, client_id, scope)
      );
      CREATE INDEX IF NOT EXISTS idx_graph_app_token_cache_expires_at ON graph_app_token_cache (expires_at);
    `);

    // ── BL-013: Notification system tables ────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL,
        organization_id varchar,
        tenant_connection_id varchar,
        category text NOT NULL,
        severity text NOT NULL DEFAULT 'info',
        title text NOT NULL,
        body text,
        link text,
        payload jsonb,
        read_at timestamp,
        created_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON notifications (user_id, read_at, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_notifications_org_created
        ON notifications (organization_id, created_at DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id varchar NOT NULL UNIQUE,
        digest_cadence text NOT NULL DEFAULT 'weekly',
        email_enabled boolean NOT NULL DEFAULT true,
        in_app_enabled boolean NOT NULL DEFAULT true,
        real_time_alerts boolean NOT NULL DEFAULT false,
        categories text[] NOT NULL DEFAULT ARRAY[]::text[],
        quiet_hours_start integer,
        quiet_hours_end integer,
        unsubscribe_token varchar NOT NULL,
        last_digest_sent_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_prefs_token
        ON notification_preferences (unsubscribe_token);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_rules (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id varchar NOT NULL UNIQUE,
        enabled_categories text[] NOT NULL DEFAULT ARRAY[]::text[],
        severity_floor text NOT NULL DEFAULT 'info',
        org_quiet_hours_start integer,
        org_quiet_hours_end integer,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `);

    // ── BL-047: Saved Views (task-110 / task-111) ──────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS saved_views (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        organization_id varchar NOT NULL,
        owner_user_id varchar NOT NULL,
        page text NOT NULL,
        name text NOT NULL,
        description text,
        scope text NOT NULL DEFAULT 'PRIVATE',
        filter_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        sort_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        columns_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        pinned_by_user_ids text[] NOT NULL DEFAULT '{}'::text[],
        is_default boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS ix_saved_views_org_page ON saved_views (organization_id, page);
      CREATE INDEX IF NOT EXISTS ix_saved_views_owner ON saved_views (owner_user_id, page);
      CREATE INDEX IF NOT EXISTS ix_saved_views_default ON saved_views (organization_id, page, is_default)
        WHERE is_default = true;

      CREATE TABLE IF NOT EXISTS saved_view_subscriptions (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        saved_view_id varchar NOT NULL,
        user_id varchar NOT NULL,
        organization_id varchar NOT NULL,
        frequency text NOT NULL DEFAULT 'weekly',
        last_snapshot_json jsonb,
        last_sent_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT uq_saved_view_subscriptions_view_user UNIQUE (saved_view_id, user_id)
      );
      CREATE INDEX IF NOT EXISTS ix_saved_view_subs_view
        ON saved_view_subscriptions (saved_view_id);
      CREATE INDEX IF NOT EXISTS ix_saved_view_subs_user
        ON saved_view_subscriptions (user_id);
    `);

    log('Schema migration ensureTenantConnectionsSchema completed');
  } catch (err) {
    console.error('[Migration] Failed to ensure tenant_connections schema:', err);
    throw err;
  } finally {
    await client.query("SELECT pg_advisory_unlock(hashtext('ensureTenantConnectionsSchema'))").catch(() => {});
    client.release();
  }
}

async function migrateClientSecretsToEncrypted() {
  if (!isEncryptionConfigured()) return;

  try {
    const connections = await storage.getTenantConnections();
    let migrated = 0;

    for (const conn of connections) {
      if (conn.clientSecret && !isEncrypted(conn.clientSecret)) {
        const encrypted = encryptToken(conn.clientSecret);
        await storage.updateTenantConnection(conn.id, { clientSecret: encrypted });
        migrated++;
      }
    }

    if (migrated > 0) {
      log(`Migrated ${migrated} tenant connection client secret(s) to encrypted form`);
    }
  } catch (err) {
    console.error('[Migration] Failed to migrate client secrets to encrypted form:', err);
  }
}

async function seedBuiltInOutcomes() {
  try {
    const orgs = await storage.getOrganizations();
    for (const org of orgs) {
      const existing = await storage.getPolicyOutcomes(org.id);
      const existingKeys = new Set(existing.map(o => o.key));

      for (const outcome of BUILT_IN_OUTCOMES) {
        if (!existingKeys.has(outcome.key)) {
          await storage.createPolicyOutcome({
            organizationId: org.id,
            name: outcome.name,
            key: outcome.key,
            description: outcome.description,
            builtIn: true,
            workspaceField: outcome.workspaceField,
            propertyBagKey: outcome.propertyBagKey,
            showAsColumn: true,
            showAsFilter: true,
            sortOrder: outcome.sortOrder,
          });
        }
      }

      const policies = await storage.getGovernancePolicies(org.id);
      const outcomes = await storage.getPolicyOutcomes(org.id);
      const copilotOutcome = outcomes.find(o => o.key === "copilot_eligible");

      for (const policy of policies) {
        if (!policy.outcomeId && copilotOutcome) {
          const nameMatch = policy.name.toLowerCase().includes("copilot");
          const typeMatch = policy.policyType === "COPILOT_READINESS";
          if (nameMatch || typeMatch) {
            await storage.updateGovernancePolicy(policy.id, { outcomeId: copilotOutcome.id });
            log(`Linked policy "${policy.name}" to Copilot Eligible outcome`);
          }
        }
      }

      if (copilotOutcome) {
        const hasCopilotPolicy = policies.some(p => p.outcomeId === copilotOutcome.id || 
          (p.name.toLowerCase().includes("copilot") || p.policyType === "COPILOT_READINESS"));
        if (!hasCopilotPolicy) {
          await storage.createGovernancePolicy({
            organizationId: org.id,
            name: "Copilot Readiness",
            description: "Default policy evaluating workspace readiness for Microsoft 365 Copilot deployment. Checks sensitivity labels, department assignment, dual ownership, metadata completeness, and sharing policies.",
            policyType: "CUSTOM",
            status: "ACTIVE",
            rules: DEFAULT_COPILOT_READINESS_RULES,
            outcomeId: copilotOutcome.id,
          });
          log(`Seeded default Copilot Readiness policy for org "${org.name}"`);
        }
      }
    }
  } catch (err) {
    console.error('[Seed] Failed to seed built-in outcomes:', err);
  }
}

async function backfillOrgMemberships() {
  try {
    const orgs = await storage.getOrganizations();
    let backfilledCount = 0;

    for (const org of orgs) {
      const orgUsers = await storage.getUsersByOrganization(org.id);
      for (const user of orgUsers) {
        const existing = await storage.getOrgMembership(user.id, org.id);
        if (!existing) {
          await storage.createOrgMembership({
            userId: user.id,
            organizationId: org.id,
            role: user.role,
            isPrimary: true,
          });
          backfilledCount++;
        }
      }
    }

    if (backfilledCount > 0) {
      log(`Backfilled ${backfilledCount} organization memberships`);
    }
  } catch (err) {
    console.error('[Backfill] Failed to backfill org memberships:', err);
  }
}

(async () => {
  checkEncryptionStartupGuard();
  await checkSendGridStartup();

  await registerRoutes(httpServer, app);

  await ensureTenantConnectionsSchema();
  await backfillOrgMemberships();
  await seedBuiltInOutcomes();
  await migrateClientSecretsToEncrypted();

  // At process startup, any row still marked RUNNING must be
  // orphaned (this process is just starting, so nothing of ours is
  // actually running). Use maxAgeMs=0 to unconditionally flip them to
  // FAILED so the concurrency guard releases and any checkpointed
  // sharing-link run becomes immediately eligible for resume.
  try {
    const orphaned = await storage.reconcileOrphanedJobRuns(0);
    if (orphaned > 0) log(`Reconciled ${orphaned} orphaned scheduled_job_runs rows`);
  } catch (err) {
    console.error('[Startup] Failed to reconcile orphaned job runs:', err);
  }
  try {
    const orphanedSharing = await storage.reconcileOrphanedSharingLinkDiscoveryRuns(0);
    if (orphanedSharing > 0) {
      log(`Reconciled ${orphanedSharing} orphaned sharing_link_discovery_runs rows`);
    }
  } catch (err) {
    console.error('[Startup] Failed to reconcile orphaned sharing link runs:', err);
  }
  try {
    await storage.getPlatformSettings();
    log('Platform settings initialized');
  } catch (err) {
    console.error('[Seed] Failed to initialize platform settings:', err);
  }

  try {
    const { startAuditRetentionScheduler } = await import('./services/audit-logger');
    startAuditRetentionScheduler();
    log('Audit retention scheduler started');
  } catch (err) {
    console.error('[Startup] Failed to start audit retention scheduler:', err);
  }

  try {
    const { startAuditStreamer } = await import('./services/audit-streamer');
    startAuditStreamer();
    log('Audit streaming worker started');
  } catch (err) {
    console.error('[Startup] Failed to start audit streamer:', err);
  }

  try {
    const { startDigestScheduler } = await import('./services/notification-digest');
    startDigestScheduler();
    log('Notification digest scheduler started');
  } catch (err) {
    console.error('[Startup] Failed to start notification digest scheduler:', err);
  }

  try {
    const { startLifecycleScanScheduler } = await import('./services/lifecycle-scan-scheduler');
    startLifecycleScanScheduler();
    log('Lifecycle compliance scan scheduler started');
  } catch (err) {
    console.error('[Startup] Failed to start lifecycle scan scheduler:', err);
  }

  try {
    const { startSavedViewDigestScheduler } = await import('./jobs/saved-view-digest');
    startSavedViewDigestScheduler();
    log('Saved view digest scheduler started');
  } catch (err) {
    console.error('[Startup] Failed to start saved view digest scheduler:', err);
  }

  try {
    const { startCopilotSyncScheduler } = await import('./services/copilot-prompt-intelligence-scheduler');
    startCopilotSyncScheduler();
    log('Copilot Prompt Intelligence daily sync scheduler started');
  } catch (err) {
    console.error('[Startup] Failed to start Copilot Prompt Intelligence scheduler:', err);
  }

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
