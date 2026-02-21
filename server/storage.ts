import { eq, desc, ilike, or } from "drizzle-orm";
import { db } from "./db";
import {
  workspaces,
  provisioningRequests,
  copilotRules,
  type Workspace,
  type InsertWorkspace,
  type ProvisioningRequest,
  type InsertProvisioningRequest,
  type CopilotRule,
  type InsertCopilotRule,
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
}

export const storage = new DatabaseStorage();
