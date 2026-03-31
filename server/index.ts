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
  try {
    await storage.getPlatformSettings();
    log('Platform settings initialized');
  } catch (err) {
    console.error('[Seed] Failed to initialize platform settings:', err);
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
