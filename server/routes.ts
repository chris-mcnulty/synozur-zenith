import type { Express } from "express";
import { createServer, type Server } from "http";
import authRouter from "./routes-auth";
import entraRouter from "./routes-entra";
import sharepointRouter from "./routes/sharepoint";
import workspacesBulkRouter from "./routes/workspaces-bulk";
import tenantRouter from "./routes/tenants";
import adminRouter from "./routes/admin";
import docsRouter from "./routes/docs";
import policiesRouter from "./routes/policies";
import organizationsRouter from "./routes/organizations";
import speRouter from "./routes/spe";
import recordingsRouter from "./routes/recordings";
import supportRouter from "./routes/support";
import aiChatRouter from "./routes/ai-chat";
import aiAgentSkillsRouter from "./routes/ai-agent-skills";
import featureTogglesRouter from "./routes/feature-toggles";
import analyticsRouter from "./routes/analytics";
import contentGovernanceRouter from "./routes/content-governance";
import licensingRouter from "./routes/licensing";
import emailStorageReportRouter from "./routes/email-storage-report";
import m365OverviewReportRouter from "./routes/m365-overview-report";
import adminAiRouter from "./routes/admin-ai";
import iaAssessmentRouter from "./routes/ia-assessment";
import contentIntensityHeatmapRouter from "./routes/content-intensity-heatmap";
import copilotPromptIntelligenceRouter from "./routes/copilot-prompt-intelligence";
import jobsRouter from "./routes/jobs";
import savedViewsRouter from "./routes/saved-views";
import lifecycleRouter from "./routes/lifecycle";
import notificationsRouter from "./routes/notifications";

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

  // Mount workspacesBulkRouter before sharepointRouter so
  // POST /api/workspaces/bulk/archive matches before
  // POST /api/workspaces/:id/archive (which would otherwise capture
  // "bulk" as the :id and 404).
  app.use(workspacesBulkRouter);
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
  app.use(aiAgentSkillsRouter);
  app.use(featureTogglesRouter);
  app.use(analyticsRouter);
  app.use(contentGovernanceRouter);
  app.use(licensingRouter);
  app.use(emailStorageReportRouter);
  app.use(m365OverviewReportRouter);
  app.use(adminAiRouter);
  app.use(iaAssessmentRouter);
  app.use(contentIntensityHeatmapRouter);
  app.use(copilotPromptIntelligenceRouter);
  app.use(jobsRouter);
  app.use(savedViewsRouter);
  app.use(lifecycleRouter);
  app.use(notificationsRouter);

  return httpServer;
}
