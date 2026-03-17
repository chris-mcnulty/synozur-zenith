import { eq, desc, ilike, or, and } from "drizzle-orm";
import { db } from "./db";
import {
  workspaces,
  provisioningRequests,
  copilotRules,
  tenantConnections,
  organizations,
  users,
  graphTokens,
  auditLog,
  domainBlocklist,
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
  type User,
  type InsertUser,
  type GraphToken,
  type InsertGraphToken,
  type AuditLog,
  type InsertAuditLog,
  type DomainBlocklist,
  type InsertDomainBlocklist,
} from "@shared/schema";

export interface IStorage {
  getWorkspaces(search?: string, tenantConnectionId?: string): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspaceByM365ObjectId(m365ObjectId: string): Promise<Workspace | undefined>;
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
  getTenantConnectionsByOrganization(orgId: string): Promise<TenantConnection[]>;
  getTenantConnection(id: string): Promise<TenantConnection | undefined>;
  createTenantConnection(connection: InsertTenantConnection): Promise<TenantConnection>;
  updateTenantConnection(id: string, updates: Partial<TenantConnection>): Promise<TenantConnection | undefined>;
  deleteTenantConnection(id: string): Promise<void>;

  getOrganization(id?: string): Promise<Organization | undefined>;
  getOrganizations(): Promise<Organization[]>;
  upsertOrganization(org: InsertOrganization): Promise<Organization>;
  updateOrganizationPlan(id: string, plan: string): Promise<Organization | undefined>;

  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByVerificationToken(token: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  getUsersByOrganization(orgId: string): Promise<User[]>;

  upsertGraphToken(token: InsertGraphToken): Promise<GraphToken>;
  getGraphToken(userId: string, service?: string): Promise<GraphToken | undefined>;
  getDecryptedGraphToken(userId: string, service?: string): Promise<{ token: string; expiresAt: Date | null } | undefined>;

  createAuditEntry(entry: InsertAuditLog): Promise<AuditLog>;
  getAuditLog(orgId?: string, limit?: number): Promise<AuditLog[]>;

  getBlockedDomains(): Promise<DomainBlocklist[]>;
  addBlockedDomain(entry: InsertDomainBlocklist): Promise<DomainBlocklist>;
  removeBlockedDomain(domain: string): Promise<void>;
  isDomainBlocked(domain: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getWorkspaces(search?: string, tenantConnectionId?: string): Promise<Workspace[]> {
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(workspaces.displayName, `%${search}%`),
          ilike(workspaces.department, `%${search}%`),
          ilike(workspaces.primarySteward, `%${search}%`)
        )
      );
    }

    if (tenantConnectionId) {
      conditions.push(eq(workspaces.tenantConnectionId, tenantConnectionId));
    }

    if (conditions.length > 0) {
      return db.select().from(workspaces).where(and(...conditions)).orderBy(desc(workspaces.createdAt));
    }
    return db.select().from(workspaces).orderBy(desc(workspaces.createdAt));
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return workspace;
  }

  async getWorkspaceByM365ObjectId(m365ObjectId: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.m365ObjectId, m365ObjectId));
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

  async getTenantConnectionsByOrganization(orgId: string): Promise<TenantConnection[]> {
    return db.select().from(tenantConnections)
      .where(eq(tenantConnections.organizationId, orgId))
      .orderBy(desc(tenantConnections.createdAt));
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

  async getOrganization(id?: string): Promise<Organization | undefined> {
    if (id) {
      const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
      return org;
    }
    const [org] = await db.select().from(organizations).orderBy(organizations.createdAt).limit(1);
    return org;
  }

  async getOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations).orderBy(organizations.name);
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

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    return user;
  }

  async getUserByVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.verificationToken, token));
    return user;
  }

  async getUserByResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.resetToken, token));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values({ ...user, email: user.email.toLowerCase() }).returning();
    return created;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return updated;
  }

  async getUsersByOrganization(orgId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.organizationId, orgId)).orderBy(users.createdAt);
  }

  async upsertGraphToken(token: InsertGraphToken): Promise<GraphToken> {
    const existing = await this.getGraphToken(token.userId, token.service || 'default');
    if (existing) {
      const [updated] = await db.update(graphTokens)
        .set({ ...token, updatedAt: new Date() })
        .where(eq(graphTokens.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(graphTokens).values(token).returning();
    return created;
  }

  async getGraphToken(userId: string, service: string = 'default'): Promise<GraphToken | undefined> {
    const [token] = await db.select().from(graphTokens)
      .where(and(eq(graphTokens.userId, userId), eq(graphTokens.service, service)));
    return token;
  }

  async getDecryptedGraphToken(userId: string, service: string = 'default'): Promise<{ token: string; expiresAt: Date | null } | undefined> {
    const record = await this.getGraphToken(userId, service);
    if (!record || !record.accessToken) return undefined;

    const { decryptToken } = await import('./utils/encryption');
    return {
      token: decryptToken(record.accessToken),
      expiresAt: record.expiresAt,
    };
  }

  async createAuditEntry(entry: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLog).values(entry).returning();
    return created;
  }

  async getAuditLog(orgId?: string, limit: number = 100): Promise<AuditLog[]> {
    if (orgId) {
      return db.select().from(auditLog)
        .where(eq(auditLog.organizationId, orgId))
        .orderBy(desc(auditLog.createdAt))
        .limit(limit);
    }
    return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
  }

  async getBlockedDomains(): Promise<DomainBlocklist[]> {
    return db.select().from(domainBlocklist).orderBy(desc(domainBlocklist.createdAt));
  }

  async addBlockedDomain(entry: InsertDomainBlocklist): Promise<DomainBlocklist> {
    const [created] = await db.insert(domainBlocklist).values(entry).returning();
    return created;
  }

  async removeBlockedDomain(domain: string): Promise<void> {
    await db.delete(domainBlocklist).where(eq(domainBlocklist.domain, domain.toLowerCase()));
  }

  async isDomainBlocked(domain: string): Promise<boolean> {
    const [result] = await db.select().from(domainBlocklist)
      .where(eq(domainBlocklist.domain, domain.toLowerCase()));
    return !!result;
  }
}

export const storage = new DatabaseStorage();
