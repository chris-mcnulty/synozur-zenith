import type { Express } from "express";
import { createServer, type Server } from "http";
import authRouter from "./routes-auth";
import entraRouter from "./routes-entra";
import sharepointRouter from "./routes/sharepoint";
import tenantRouter from "./routes/tenants";
import adminRouter from "./routes/admin";
import docsRouter from "./routes/docs";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/api/auth", authRouter);
  app.use("/auth/entra", entraRouter);

  app.use(sharepointRouter);
  app.use(tenantRouter);
  app.use(adminRouter);
  app.use(docsRouter);

  return httpServer;
}
