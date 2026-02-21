import { eq, desc, ilike, or } from "drizzle-orm";
import { db } from "./db";
import {
  workspaces,
  provisioningRequests,
  copilotRules,
  tenantConnections,
  organizations,
  type Workspace,
  type InsertWorkspace,
  type ProvisioningRequest,
  type InsertProvisioningRequest,
  type CopilotRule,
  type InsertCopilotRule,
  type TenantConnection,
  type InsertTenantConnection,
  type Organization,
  type InsertOrganization,
} from "@shared/schema";

export interface IStorage {
  getWorkspaces(search?: string): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: string, updates: Partial<InsertWorkspace>): Promise<Workspace | undefined>;
  deleteWorkspace(id: string): Promise<void>;
  bulkUpdateWorkspaces(ids: string[], updates: Partial<InsertWorkspace>): Promise<void>;

  getProvisioningRequests(): Promise<ProvisioningRequest[]>;
  getProvisioningRequest(id: string): Promise<ProvisioningRequest | undefined>;
  createProvisioningRequest(request: InsertProvisioningRequest): Promise<ProvisioningRequest>;
  updateProvisioningRequestStatus(id: string, status: string): Promise<ProvisioningRequest | undefined>;

  getCopilotRules(workspaceId: string): Promise<CopilotRule[]>;
  setCopilotRules(workspaceId: string, rules: InsertCopilotRule[]): Promise<CopilotRule[]>;

  getTenantConnections(): Promise<TenantConnection[]>;
  getTenantConnection(id: string): Promise<TenantConnection | undefined>;
  createTenantConnection(connection: InsertTenantConnection): Promise<TenantConnection>;
  updateTenantConnection(id: string, updates: Partial<TenantConnection>): Promise<TenantConnection | undefined>;
  deleteTenantConnection(id: string): Promise<void>;

  getOrganization(): Promise<Organization | undefined>;
  upsertOrganization(org: InsertOrganization): Promise<Organization>;
  updateOrganizationPlan(id: string, plan: string): Promise<Organization | undefined>;
}

export class DatabaseStorage implements IStorage {
  async getWorkspaces(search?: string): Promise<Workspace[]> {
    if (search) {
      return db.select().from(workspaces).where(
        or(
          ilike(workspaces.displayName, `%${search}%`),
          ilike(workspaces.department, `%${search}%`),
          ilike(workspaces.primarySteward, `%${search}%`)
        )
      ).orderBy(desc(workspaces.createdAt));
    }
    return db.select().from(workspaces).orderBy(desc(workspaces.createdAt));
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return workspace;
  }

  async createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
    const [created] = await db.insert(workspaces).values(workspace).returning();
    return created;
  }

  async updateWorkspace(id: string, updates: Partial<InsertWorkspace>): Promise<Workspace | undefined> {
    const [updated] = await db.update(workspaces).set(updates).where(eq(workspaces.id, id)).returning();
    return updated;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await db.delete(workspaces).where(eq(workspaces.id, id));
  }

  async bulkUpdateWorkspaces(ids: string[], updates: Partial<InsertWorkspace>): Promise<void> {
    for (const id of ids) {
      await db.update(workspaces).set(updates).where(eq(workspaces.id, id));
    }
  }

  async getProvisioningRequests(): Promise<ProvisioningRequest[]> {
    return db.select().from(provisioningRequests).orderBy(desc(provisioningRequests.createdAt));
  }

  async getProvisioningRequest(id: string): Promise<ProvisioningRequest | undefined> {
    const [request] = await db.select().from(provisioningRequests).where(eq(provisioningRequests.id, id));
    return request;
  }

  async createProvisioningRequest(request: InsertProvisioningRequest): Promise<ProvisioningRequest> {
    const [created] = await db.insert(provisioningRequests).values(request).returning();
    return created;
  }

  async updateProvisioningRequestStatus(id: string, status: string): Promise<ProvisioningRequest | undefined> {
    const [updated] = await db.update(provisioningRequests).set({ status }).where(eq(provisioningRequests.id, id)).returning();
    return updated;
  }

  async getCopilotRules(workspaceId: string): Promise<CopilotRule[]> {
    return db.select().from(copilotRules).where(eq(copilotRules.workspaceId, workspaceId));
  }

  async setCopilotRules(workspaceId: string, rules: InsertCopilotRule[]): Promise<CopilotRule[]> {
    await db.delete(copilotRules).where(eq(copilotRules.workspaceId, workspaceId));
    if (rules.length === 0) return [];
    const created = await db.insert(copilotRules).values(rules).returning();
    return created;
  }

  async getTenantConnections(): Promise<TenantConnection[]> {
    return db.select().from(tenantConnections).orderBy(desc(tenantConnections.createdAt));
  }

  async getTenantConnection(id: string): Promise<TenantConnection | undefined> {
    const [connection] = await db.select().from(tenantConnections).where(eq(tenantConnections.id, id));
    return connection;
  }

  async createTenantConnection(connection: InsertTenantConnection): Promise<TenantConnection> {
    const [created] = await db.insert(tenantConnections).values(connection).returning();
    return created;
  }

  async updateTenantConnection(id: string, updates: Partial<TenantConnection>): Promise<TenantConnection | undefined> {
    const [updated] = await db.update(tenantConnections).set(updates).where(eq(tenantConnections.id, id)).returning();
    return updated;
  }

  async deleteTenantConnection(id: string): Promise<void> {
    await db.delete(tenantConnections).where(eq(tenantConnections.id, id));
  }

  async getOrganization(): Promise<Organization | undefined> {
    const [org] = await db.select().from(organizations).limit(1);
    return org;
  }

  async upsertOrganization(org: InsertOrganization): Promise<Organization> {
    const existing = await this.getOrganization();
    if (existing) {
      const [updated] = await db.update(organizations).set(org).where(eq(organizations.id, existing.id)).returning();
      return updated;
    }
    const [created] = await db.insert(organizations).values(org).returning();
    return created;
  }

  async updateOrganizationPlan(id: string, plan: string): Promise<Organization | undefined> {
    const [updated] = await db.update(organizations).set({ servicePlan: plan, planStartedAt: new Date() }).where(eq(organizations.id, id)).returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
