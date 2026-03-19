import { eq, desc, ilike, or, and, sql, gt } from "drizzle-orm";
import { db } from "./db";
import {
  workspaces,
  provisioningRequests,
  copilotRules,
  governancePolicies,
  policyOutcomes,
  tenantConnections,
  organizations,
  users,
  organizationUsers,
  graphTokens,
  auditLog,
  domainBlocklist,
  tenantDataDictionaries,
  sensitivityLabels,
  retentionLabels,
  type Workspace,
  type InsertWorkspace,
  type ProvisioningRequest,
  type InsertProvisioningRequest,
  type CopilotRule,
  type InsertCopilotRule,
  type GovernancePolicy,
  type InsertGovernancePolicy,
  type PolicyOutcome,
  type InsertPolicyOutcome,
  type TenantConnection,
  type InsertTenantConnection,
  type Organization,
  type InsertOrganization,
  type User,
  type InsertUser,
  type OrganizationUser,
  type InsertOrganizationUser,
  type GraphToken,
  type InsertGraphToken,
  type AuditLog,
  type InsertAuditLog,
  type DomainBlocklist,
  type InsertDomainBlocklist,
  type TenantDataDictionary,
  type InsertTenantDataDictionary,
  type SensitivityLabel,
  type InsertSensitivityLabel,
  type RetentionLabel,
  type InsertRetentionLabel,
  customFieldDefinitions,
  type CustomFieldDefinition,
  type InsertCustomFieldDefinition,
  documentLibraries,
  type DocumentLibrary,
  type InsertDocumentLibrary,
  tenantDepartments,
  workspaceTelemetry,
  type WorkspaceTelemetry,
  type InsertWorkspaceTelemetry,
  speContainerTypes,
  type SpeContainerType,
  type InsertSpeContainerType,
  speContainers,
  type SpeContainer,
  type InsertSpeContainer,
  speContainerUsage,
  type SpeContainerUsage,
  type InsertSpeContainerUsage,
  platformSettings,
  type PlatformSettings,
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

  getPolicyOutcomes(organizationId: string): Promise<PolicyOutcome[]>;
  getPolicyOutcome(id: string): Promise<PolicyOutcome | undefined>;
  getPolicyOutcomeByKey(organizationId: string, key: string): Promise<PolicyOutcome | undefined>;
  createPolicyOutcome(outcome: InsertPolicyOutcome): Promise<PolicyOutcome>;
  updatePolicyOutcome(id: string, updates: Partial<InsertPolicyOutcome>): Promise<PolicyOutcome | undefined>;
  deletePolicyOutcome(id: string): Promise<void>;

  getGovernancePolicies(organizationId: string): Promise<GovernancePolicy[]>;
  getGovernancePolicy(id: string): Promise<GovernancePolicy | undefined>;
  getGovernancePolicyByType(organizationId: string, policyType: string): Promise<GovernancePolicy | undefined>;
  getGovernancePolicyByOutcome(organizationId: string, outcomeId: string): Promise<GovernancePolicy | undefined>;
  getActivePoliciesWithOutcomes(organizationId: string): Promise<(GovernancePolicy & { outcome?: PolicyOutcome })[]>;
  createGovernancePolicy(policy: InsertGovernancePolicy): Promise<GovernancePolicy>;
  updateGovernancePolicy(id: string, updates: Partial<InsertGovernancePolicy>): Promise<GovernancePolicy | undefined>;
  deleteGovernancePolicy(id: string): Promise<void>;

  getTenantConnections(organizationId?: string): Promise<TenantConnection[]>;
  getTenantConnection(id: string): Promise<TenantConnection | undefined>;
  createTenantConnection(connection: InsertTenantConnection): Promise<TenantConnection>;
  updateTenantConnection(id: string, updates: Partial<TenantConnection>): Promise<TenantConnection | undefined>;
  deleteTenantConnection(id: string): Promise<void>;

  getOrganization(id?: string): Promise<Organization | undefined>;
  getOrganizations(): Promise<Organization[]>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
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
  getAnyValidDelegatedToken(service?: string, organizationId?: string): Promise<{ token: string; expiresAt: Date | null; userId: string } | undefined>;

  createAuditEntry(entry: InsertAuditLog): Promise<AuditLog>;
  getAuditLog(orgId?: string, limit?: number): Promise<AuditLog[]>;

  getBlockedDomains(): Promise<DomainBlocklist[]>;
  addBlockedDomain(entry: InsertDomainBlocklist): Promise<DomainBlocklist>;
  removeBlockedDomain(domain: string): Promise<void>;
  isDomainBlocked(domain: string): Promise<boolean>;

  getDataDictionary(tenantId: string, category: string): Promise<TenantDataDictionary[]>;
  getAllDataDictionaries(tenantId: string): Promise<TenantDataDictionary[]>;
  createDataDictionaryEntry(entry: InsertTenantDataDictionary): Promise<TenantDataDictionary>;
  deleteDataDictionaryEntry(id: string): Promise<void>;

  getSensitivityLabelsByTenantId(tenantId: string): Promise<SensitivityLabel[]>;
  upsertSensitivityLabel(label: InsertSensitivityLabel): Promise<SensitivityLabel>;
  deleteSensitivityLabelsByTenantId(tenantId: string): Promise<void>;

  getRetentionLabelsByTenantId(tenantId: string): Promise<RetentionLabel[]>;
  upsertRetentionLabel(label: InsertRetentionLabel): Promise<RetentionLabel>;
  deleteRetentionLabelsByTenantId(tenantId: string): Promise<void>;

  getWorkspaceLabelCoverage(tenantId: string): Promise<{ workspaceId: string; displayName: string; siteUrl: string | null; sensitivityLabelId: string | null; retentionLabelId: string | null; type: string }[]>;

  getCustomFieldDefinitions(tenantId: string): Promise<CustomFieldDefinition[]>;
  getCustomFieldDefinition(id: string): Promise<CustomFieldDefinition | undefined>;
  createCustomFieldDefinition(def: InsertCustomFieldDefinition): Promise<CustomFieldDefinition>;
  updateCustomFieldDefinition(id: string, updates: Partial<InsertCustomFieldDefinition>): Promise<CustomFieldDefinition | undefined>;
  deleteCustomFieldDefinition(id: string): Promise<void>;

  getDocumentLibraries(workspaceId: string): Promise<DocumentLibrary[]>;
  getDocumentLibrariesByTenant(tenantConnectionId: string): Promise<DocumentLibrary[]>;
  getDocumentLibrary(id: string): Promise<DocumentLibrary | undefined>;
  upsertDocumentLibrary(data: InsertDocumentLibrary): Promise<DocumentLibrary>;
  deleteDocumentLibrariesForWorkspace(workspaceId: string): Promise<void>;

  createWorkspaceTelemetry(data: InsertWorkspaceTelemetry): Promise<WorkspaceTelemetry>;
  getWorkspaceTelemetry(workspaceId: string, limit?: number): Promise<WorkspaceTelemetry[]>;

  getSpeContainerTypes(tenantConnectionId?: string): Promise<SpeContainerType[]>;
  getSpeContainerType(id: string): Promise<SpeContainerType | undefined>;
  createSpeContainerType(data: InsertSpeContainerType): Promise<SpeContainerType>;
  updateSpeContainerType(id: string, updates: Partial<InsertSpeContainerType>): Promise<SpeContainerType | undefined>;
  deleteSpeContainerType(id: string): Promise<void>;

  getSpeContainers(search?: string, tenantConnectionId?: string): Promise<SpeContainer[]>;
  getSpeContainer(id: string): Promise<SpeContainer | undefined>;
  createSpeContainer(data: InsertSpeContainer): Promise<SpeContainer>;
  updateSpeContainer(id: string, updates: Partial<InsertSpeContainer>): Promise<SpeContainer | undefined>;
  deleteSpeContainer(id: string): Promise<void>;

  getSpeContainerUsage(containerId: string, limit?: number): Promise<SpeContainerUsage[]>;
  createSpeContainerUsage(data: InsertSpeContainerUsage): Promise<SpeContainerUsage>;

  getOrgMembership(userId: string, organizationId: string): Promise<OrganizationUser | undefined>;
  getOrgMemberships(userId: string): Promise<OrganizationUser[]>;
  getOrgMembers(organizationId: string): Promise<OrganizationUser[]>;
  createOrgMembership(membership: InsertOrganizationUser): Promise<OrganizationUser>;
  updateOrgMembership(id: string, updates: Partial<InsertOrganizationUser>): Promise<OrganizationUser | undefined>;
  deleteOrgMembership(userId: string, organizationId: string): Promise<void>;
  updateOrganizationSettings(id: string, updates: Partial<InsertOrganization>): Promise<Organization | undefined>;

  getPlatformSettings(): Promise<PlatformSettings>;
  updatePlatformSettings(patch: { defaultSignupPlan: string; updatedBy?: string | null }): Promise<PlatformSettings>;
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

  async getPolicyOutcomes(organizationId: string): Promise<PolicyOutcome[]> {
    return db.select().from(policyOutcomes)
      .where(eq(policyOutcomes.organizationId, organizationId))
      .orderBy(policyOutcomes.sortOrder);
  }

  async getPolicyOutcome(id: string): Promise<PolicyOutcome | undefined> {
    const [outcome] = await db.select().from(policyOutcomes).where(eq(policyOutcomes.id, id));
    return outcome;
  }

  async getPolicyOutcomeByKey(organizationId: string, key: string): Promise<PolicyOutcome | undefined> {
    const [outcome] = await db.select().from(policyOutcomes).where(
      and(eq(policyOutcomes.organizationId, organizationId), eq(policyOutcomes.key, key))
    );
    return outcome;
  }

  async createPolicyOutcome(outcome: InsertPolicyOutcome): Promise<PolicyOutcome> {
    const [created] = await db.insert(policyOutcomes).values(outcome).returning();
    return created;
  }

  async updatePolicyOutcome(id: string, updates: Partial<InsertPolicyOutcome>): Promise<PolicyOutcome | undefined> {
    const [updated] = await db.update(policyOutcomes).set(updates).where(eq(policyOutcomes.id, id)).returning();
    return updated;
  }

  async deletePolicyOutcome(id: string): Promise<void> {
    await db.delete(policyOutcomes).where(eq(policyOutcomes.id, id));
  }

  async getGovernancePolicies(organizationId: string): Promise<GovernancePolicy[]> {
    return db.select().from(governancePolicies).where(eq(governancePolicies.organizationId, organizationId)).orderBy(desc(governancePolicies.createdAt));
  }

  async getGovernancePolicy(id: string): Promise<GovernancePolicy | undefined> {
    const [policy] = await db.select().from(governancePolicies).where(eq(governancePolicies.id, id));
    return policy;
  }

  async getGovernancePolicyByType(organizationId: string, policyType: string): Promise<GovernancePolicy | undefined> {
    const [policy] = await db.select().from(governancePolicies).where(
      and(eq(governancePolicies.organizationId, organizationId), eq(governancePolicies.policyType, policyType), eq(governancePolicies.status, "ACTIVE"))
    );
    return policy;
  }

  async getGovernancePolicyByOutcome(organizationId: string, outcomeId: string): Promise<GovernancePolicy | undefined> {
    const [policy] = await db.select().from(governancePolicies).where(
      and(eq(governancePolicies.organizationId, organizationId), eq(governancePolicies.outcomeId, outcomeId), eq(governancePolicies.status, "ACTIVE"))
    );
    return policy;
  }

  async getActivePoliciesWithOutcomes(organizationId: string): Promise<(GovernancePolicy & { outcome?: PolicyOutcome })[]> {
    const policies = await db.select().from(governancePolicies).where(
      and(eq(governancePolicies.organizationId, organizationId), eq(governancePolicies.status, "ACTIVE"))
    );
    const outcomes = await this.getPolicyOutcomes(organizationId);
    const outcomeMap = new Map(outcomes.map(o => [o.id, o]));
    return policies.map(p => ({
      ...p,
      outcome: p.outcomeId ? outcomeMap.get(p.outcomeId) : undefined,
    }));
  }

  async createGovernancePolicy(policy: InsertGovernancePolicy): Promise<GovernancePolicy> {
    const [created] = await db.insert(governancePolicies).values(policy).returning();
    return created;
  }

  async updateGovernancePolicy(id: string, updates: Partial<InsertGovernancePolicy>): Promise<GovernancePolicy | undefined> {
    const [updated] = await db.update(governancePolicies).set({ ...updates, updatedAt: new Date() }).where(eq(governancePolicies.id, id)).returning();
    return updated;
  }

  async deleteGovernancePolicy(id: string): Promise<void> {
    await db.delete(governancePolicies).where(eq(governancePolicies.id, id));
  }

  async getTenantConnections(organizationId?: string): Promise<TenantConnection[]> {
    if (organizationId) {
      return db.select().from(tenantConnections)
        .where(eq(tenantConnections.organizationId, organizationId))
        .orderBy(desc(tenantConnections.createdAt));
    }
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
    const tenantWorkspaces = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.tenantConnectionId, id));
    const workspaceIds = tenantWorkspaces.map(w => w.id);

    if (workspaceIds.length > 0) {
      for (const wId of workspaceIds) {
        await db.delete(copilotRules).where(eq(copilotRules.workspaceId, wId));
      }
      await db.delete(workspaces).where(eq(workspaces.tenantConnectionId, id));
    }

    const [conn] = await db.select().from(tenantConnections).where(eq(tenantConnections.id, id));
    if (conn) {
      const otherConns = await db.select({ id: tenantConnections.id }).from(tenantConnections)
        .where(and(eq(tenantConnections.tenantId, conn.tenantId), sql`${tenantConnections.id} != ${id}`));
      if (otherConns.length === 0) {
        await db.delete(tenantDepartments).where(eq(tenantDepartments.tenantId, conn.tenantId));
      }
    }
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

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [created] = await db.insert(organizations).values(org).returning();
    return created;
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

  async getAnyValidDelegatedToken(service: string = 'graph', organizationId?: string): Promise<{ token: string; expiresAt: Date | null; userId: string } | undefined> {
    const conditions = [
      eq(graphTokens.service, service),
      gt(graphTokens.expiresAt, new Date())
    ];
    if (organizationId) {
      conditions.push(eq(graphTokens.organizationId, organizationId));
    }
    const records = await db.select().from(graphTokens)
      .where(and(...conditions))
      .limit(1);
    
    if (records.length === 0 || !records[0].accessToken) return undefined;
    
    const { decryptToken } = await import('./utils/encryption');
    return {
      token: decryptToken(records[0].accessToken),
      expiresAt: records[0].expiresAt,
      userId: records[0].userId,
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

  async getDataDictionary(tenantId: string, category: string): Promise<TenantDataDictionary[]> {
    return db.select().from(tenantDataDictionaries)
      .where(and(
        eq(tenantDataDictionaries.tenantId, tenantId),
        eq(tenantDataDictionaries.category, category)
      ))
      .orderBy(tenantDataDictionaries.value);
  }

  async getAllDataDictionaries(tenantId: string): Promise<TenantDataDictionary[]> {
    return db.select().from(tenantDataDictionaries)
      .where(eq(tenantDataDictionaries.tenantId, tenantId))
      .orderBy(tenantDataDictionaries.category, tenantDataDictionaries.value);
  }

  async createDataDictionaryEntry(entry: InsertTenantDataDictionary): Promise<TenantDataDictionary> {
    const [created] = await db.insert(tenantDataDictionaries).values(entry).returning();
    return created;
  }

  async deleteDataDictionaryEntry(id: string): Promise<void> {
    await db.delete(tenantDataDictionaries).where(eq(tenantDataDictionaries.id, id));
  }

  async getSensitivityLabelsByTenantId(tenantId: string): Promise<SensitivityLabel[]> {
    return db.select().from(sensitivityLabels)
      .where(eq(sensitivityLabels.tenantId, tenantId))
      .orderBy(sensitivityLabels.sensitivity);
  }

  async upsertSensitivityLabel(label: InsertSensitivityLabel): Promise<SensitivityLabel> {
    const [result] = await db.insert(sensitivityLabels)
      .values(label)
      .onConflictDoUpdate({
        target: [sensitivityLabels.tenantId, sensitivityLabels.labelId],
        set: {
          name: label.name,
          description: label.description,
          color: label.color,
          tooltip: label.tooltip,
          sensitivity: label.sensitivity,
          isActive: label.isActive,
          contentFormats: label.contentFormats,
          hasProtection: label.hasProtection,
          parentLabelId: label.parentLabelId,
          appliesToGroupsSites: label.appliesToGroupsSites,
          syncedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async deleteSensitivityLabelsByTenantId(tenantId: string): Promise<void> {
    await db.delete(sensitivityLabels).where(eq(sensitivityLabels.tenantId, tenantId));
  }

  async getRetentionLabelsByTenantId(tenantId: string): Promise<RetentionLabel[]> {
    return db.select().from(retentionLabels)
      .where(eq(retentionLabels.tenantId, tenantId))
      .orderBy(retentionLabels.name);
  }

  async upsertRetentionLabel(label: InsertRetentionLabel): Promise<RetentionLabel> {
    const [result] = await db.insert(retentionLabels)
      .values(label)
      .onConflictDoUpdate({
        target: [retentionLabels.tenantId, retentionLabels.labelId],
        set: {
          name: label.name,
          description: label.description,
          retentionDuration: label.retentionDuration,
          retentionAction: label.retentionAction,
          behaviorDuringRetentionPeriod: label.behaviorDuringRetentionPeriod,
          actionAfterRetentionPeriod: label.actionAfterRetentionPeriod,
          isActive: label.isActive,
          isRecordLabel: label.isRecordLabel,
          syncedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async deleteRetentionLabelsByTenantId(tenantId: string): Promise<void> {
    await db.delete(retentionLabels).where(eq(retentionLabels.tenantId, tenantId));
  }

  async getWorkspaceLabelCoverage(tenantId: string): Promise<{ workspaceId: string; displayName: string; siteUrl: string | null; sensitivityLabelId: string | null; retentionLabelId: string | null; type: string }[]> {
    const conns = await db.select().from(tenantConnections).where(eq(tenantConnections.tenantId, tenantId));
    const connIds = conns.map(c => c.id);
    if (connIds.length === 0) return [];

    const results = await db.select({
      workspaceId: workspaces.id,
      displayName: workspaces.displayName,
      siteUrl: workspaces.siteUrl,
      sensitivityLabelId: workspaces.sensitivityLabelId,
      retentionLabelId: workspaces.retentionLabelId,
      type: workspaces.type,
    }).from(workspaces)
      .where(
        connIds.length === 1
          ? eq(workspaces.tenantConnectionId, connIds[0])
          : sql`${workspaces.tenantConnectionId} IN (${sql.join(connIds.map(id => sql`${id}`), sql`, `)})`
      )
      .orderBy(workspaces.displayName);

    return results;
  }

  async getOrgMembership(userId: string, organizationId: string): Promise<OrganizationUser | undefined> {
    const [membership] = await db.select().from(organizationUsers)
      .where(and(eq(organizationUsers.userId, userId), eq(organizationUsers.organizationId, organizationId)));
    return membership;
  }

  async getOrgMemberships(userId: string): Promise<OrganizationUser[]> {
    return db.select().from(organizationUsers)
      .where(eq(organizationUsers.userId, userId))
      .orderBy(desc(organizationUsers.isPrimary), organizationUsers.joinedAt);
  }

  async getOrgMembers(organizationId: string): Promise<OrganizationUser[]> {
    return db.select().from(organizationUsers)
      .where(eq(organizationUsers.organizationId, organizationId))
      .orderBy(organizationUsers.joinedAt);
  }

  async createOrgMembership(membership: InsertOrganizationUser): Promise<OrganizationUser> {
    const [created] = await db.insert(organizationUsers).values(membership)
      .onConflictDoUpdate({
        target: [organizationUsers.userId, organizationUsers.organizationId],
        set: { role: membership.role, isPrimary: membership.isPrimary },
      })
      .returning();
    return created;
  }

  async updateOrgMembership(id: string, updates: Partial<InsertOrganizationUser>): Promise<OrganizationUser | undefined> {
    const [updated] = await db.update(organizationUsers).set(updates)
      .where(eq(organizationUsers.id, id)).returning();
    return updated;
  }

  async deleteOrgMembership(userId: string, organizationId: string): Promise<void> {
    await db.delete(organizationUsers)
      .where(and(eq(organizationUsers.userId, userId), eq(organizationUsers.organizationId, organizationId)));
  }

  async updateOrganizationSettings(id: string, updates: Partial<InsertOrganization>): Promise<Organization | undefined> {
    const [updated] = await db.update(organizations).set(updates)
      .where(eq(organizations.id, id)).returning();
    return updated;
  }

  async getCustomFieldDefinitions(tenantId: string): Promise<CustomFieldDefinition[]> {
    return db.select().from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.tenantId, tenantId))
      .orderBy(customFieldDefinitions.sortOrder);
  }

  async getCustomFieldDefinition(id: string): Promise<CustomFieldDefinition | undefined> {
    const [def] = await db.select().from(customFieldDefinitions)
      .where(eq(customFieldDefinitions.id, id));
    return def;
  }

  async createCustomFieldDefinition(def: InsertCustomFieldDefinition): Promise<CustomFieldDefinition> {
    const [created] = await db.insert(customFieldDefinitions).values(def).returning();
    return created;
  }

  async updateCustomFieldDefinition(id: string, updates: Partial<InsertCustomFieldDefinition>): Promise<CustomFieldDefinition | undefined> {
    const [updated] = await db.update(customFieldDefinitions).set(updates)
      .where(eq(customFieldDefinitions.id, id)).returning();
    return updated;
  }

  async deleteCustomFieldDefinition(id: string): Promise<void> {
    await db.delete(customFieldDefinitions).where(eq(customFieldDefinitions.id, id));
  }

  async getDocumentLibraries(workspaceId: string): Promise<DocumentLibrary[]> {
    return db.select().from(documentLibraries)
      .where(eq(documentLibraries.workspaceId, workspaceId))
      .orderBy(documentLibraries.displayName);
  }

  async getDocumentLibrariesByTenant(tenantConnectionId: string): Promise<DocumentLibrary[]> {
    return db.select().from(documentLibraries)
      .where(eq(documentLibraries.tenantConnectionId, tenantConnectionId))
      .orderBy(documentLibraries.displayName);
  }

  async getDocumentLibrary(id: string): Promise<DocumentLibrary | undefined> {
    const [lib] = await db.select().from(documentLibraries)
      .where(eq(documentLibraries.id, id));
    return lib;
  }

  async upsertDocumentLibrary(data: InsertDocumentLibrary): Promise<DocumentLibrary> {
    const [result] = await db.insert(documentLibraries).values(data)
      .onConflictDoUpdate({
        target: [documentLibraries.workspaceId, documentLibraries.m365ListId],
        set: {
          displayName: data.displayName,
          description: data.description,
          webUrl: data.webUrl,
          template: data.template,
          itemCount: data.itemCount,
          storageUsedBytes: data.storageUsedBytes,
          sensitivityLabelId: data.sensitivityLabelId,
          isDefaultDocLib: data.isDefaultDocLib,
          hidden: data.hidden,
          lastModifiedAt: data.lastModifiedAt,
          lastSyncAt: data.lastSyncAt,
        },
      })
      .returning();
    return result;
  }

  async deleteDocumentLibrariesForWorkspace(workspaceId: string): Promise<void> {
    await db.delete(documentLibraries).where(eq(documentLibraries.workspaceId, workspaceId));
  }

  async createWorkspaceTelemetry(data: InsertWorkspaceTelemetry): Promise<WorkspaceTelemetry> {
    const [result] = await db.insert(workspaceTelemetry).values(data).returning();
    return result;
  }

  async getWorkspaceTelemetry(workspaceId: string, limit = 30): Promise<WorkspaceTelemetry[]> {
    return db.select().from(workspaceTelemetry)
      .where(eq(workspaceTelemetry.workspaceId, workspaceId))
      .orderBy(desc(workspaceTelemetry.snapshotAt))
      .limit(limit);
  }

  async getSpeContainerTypes(tenantConnectionId?: string): Promise<SpeContainerType[]> {
    if (tenantConnectionId) {
      return db.select().from(speContainerTypes)
        .where(eq(speContainerTypes.tenantConnectionId, tenantConnectionId))
        .orderBy(speContainerTypes.displayName);
    }
    return db.select().from(speContainerTypes).orderBy(speContainerTypes.displayName);
  }

  async getSpeContainerType(id: string): Promise<SpeContainerType | undefined> {
    const [result] = await db.select().from(speContainerTypes).where(eq(speContainerTypes.id, id));
    return result;
  }

  async createSpeContainerType(data: InsertSpeContainerType): Promise<SpeContainerType> {
    const [result] = await db.insert(speContainerTypes).values(data).returning();
    return result;
  }

  async updateSpeContainerType(id: string, updates: Partial<InsertSpeContainerType>): Promise<SpeContainerType | undefined> {
    const [result] = await db.update(speContainerTypes).set(updates).where(eq(speContainerTypes.id, id)).returning();
    return result;
  }

  async deleteSpeContainerType(id: string): Promise<void> {
    await db.delete(speContainerTypes).where(eq(speContainerTypes.id, id));
  }

  async getSpeContainers(search?: string, tenantConnectionId?: string): Promise<SpeContainer[]> {
    const conditions = [];
    if (tenantConnectionId) {
      conditions.push(eq(speContainers.tenantConnectionId, tenantConnectionId));
    }
    if (search) {
      conditions.push(
        or(
          ilike(speContainers.displayName, `%${search}%`),
          ilike(speContainers.ownerDisplayName, `%${search}%`),
        )!
      );
    }
    if (conditions.length > 0) {
      return db.select().from(speContainers).where(and(...conditions)).orderBy(speContainers.displayName);
    }
    return db.select().from(speContainers).orderBy(speContainers.displayName);
  }

  async getSpeContainer(id: string): Promise<SpeContainer | undefined> {
    const [result] = await db.select().from(speContainers).where(eq(speContainers.id, id));
    return result;
  }

  async createSpeContainer(data: InsertSpeContainer): Promise<SpeContainer> {
    const [result] = await db.insert(speContainers).values(data).returning();
    return result;
  }

  async updateSpeContainer(id: string, updates: Partial<InsertSpeContainer>): Promise<SpeContainer | undefined> {
    const [result] = await db.update(speContainers).set(updates).where(eq(speContainers.id, id)).returning();
    return result;
  }

  async deleteSpeContainer(id: string): Promise<void> {
    await db.delete(speContainers).where(eq(speContainers.id, id));
  }

  async getSpeContainerUsage(containerId: string, limit = 30): Promise<SpeContainerUsage[]> {
    return db.select().from(speContainerUsage)
      .where(eq(speContainerUsage.containerId, containerId))
      .orderBy(desc(speContainerUsage.snapshotAt))
      .limit(limit);
  }

  async createSpeContainerUsage(data: InsertSpeContainerUsage): Promise<SpeContainerUsage> {
    const [result] = await db.insert(speContainerUsage).values(data).returning();
    return result;
  }

  async getPlatformSettings(): Promise<PlatformSettings> {
    const [row] = await db.select().from(platformSettings).limit(1);
    if (row) return row;
    const [created] = await db.insert(platformSettings).values({ defaultSignupPlan: 'TRIAL' }).returning();
    return created;
  }

  async updatePlatformSettings(patch: { defaultSignupPlan: string; updatedBy?: string | null }): Promise<PlatformSettings> {
    const existing = await this.getPlatformSettings();
    const [updated] = await db.update(platformSettings)
      .set({ defaultSignupPlan: patch.defaultSignupPlan, updatedAt: new Date(), updatedBy: patch.updatedBy ?? null })
      .where(eq(platformSettings.id, existing.id))
      .returning();
    return updated;
  }
}

export const storage = new DatabaseStorage();
