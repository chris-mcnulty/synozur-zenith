import type { Express } from "express";
import { createServer, type Server } from "http";
import authRouter from "./routes-auth";
import entraRouter from "./routes-entra";
import sharepointRouter from "./routes/sharepoint";
import tenantRouter from "./routes/tenants";
import adminRouter from "./routes/admin";
import docsRouter from "./routes/docs";
import policiesRouter from "./routes/policies";
import organizationsRouter from "./routes/organizations";
import speRouter from "./routes/spe";
import recordingsRouter from "./routes/recordings";
import supportRouter from "./routes/support";
import aiChatRouter from "./routes/ai-chat";
import featureTogglesRouter from "./routes/feature-toggles";
import analyticsRouter from "./routes/analytics";
import contentGovernanceRouter from "./routes/content-governance";
import licensingRouter from "./routes/licensing";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Health check for Azure load balancer / container probes
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/auth/entra", entraRouter);

  app.use(sharepointRouter);
  app.use(tenantRouter);
  app.use(adminRouter);
  app.use(docsRouter);
  app.use(policiesRouter);
  app.use(organizationsRouter);
  app.use(speRouter);
  app.use(recordingsRouter);
  app.use(supportRouter);
  app.use(aiChatRouter);
  app.use(featureTogglesRouter);
  app.use(analyticsRouter);
  app.use(contentGovernanceRouter);
  app.use(licensingRouter);

  return httpServer;
}
