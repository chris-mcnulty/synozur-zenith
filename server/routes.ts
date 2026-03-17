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

/**
 * Returns the set of tenant connection IDs that the current user may access.
 * Returns null for PLATFORM_OWNER (unrestricted) or users without an org.
 */
async function getOrgTenantConnectionIds(user: AuthenticatedRequest["user"]): Promise<string[] | null> {
  if (!user?.organizationId) return null;
  if (user.role === ZENITH_ROLES.PLATFORM_OWNER) return null;
  const connections = await storage.getTenantConnectionsByOrganization(user.organizationId);
  return connections.map(c => c.id);
}

/**
 * Checks whether a tenant connection belongs to the requesting user's org.
 * Returns false (denied) when the connection is owned by a different org.
 */
async function canAccessTenantConnection(user: AuthenticatedRequest["user"], connectionId: string): Promise<boolean> {
  if (!user) return false;
  if (user.role === ZENITH_ROLES.PLATFORM_OWNER) return true;
  if (!user.organizationId) return false;
  const connection = await storage.getTenantConnection(connectionId);
  if (!connection) return false;
  return connection.organizationId === user.organizationId;
}

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
  app.use(policiesRouter);
  app.use(organizationsRouter);

  return httpServer;
}
