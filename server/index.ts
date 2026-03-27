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

  await registerRoutes(httpServer, app);

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
