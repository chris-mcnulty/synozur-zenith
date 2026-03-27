import { eq, desc, ilike, or, and, sql, gt, max } from "drizzle-orm";
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
  teamsRecordings,
  type TeamsRecording,
  type InsertTeamsRecording,
  teamsDiscoveryRuns,
  type TeamsDiscoveryRun,
  type InsertTeamsDiscoveryRun,
  teamsInventory,
  type TeamsInventoryItem,
  type InsertTeamsInventory,
  channelsInventory,
  type ChannelsInventoryItem,
  type InsertChannelsInventory,
  onedriveInventory,
  type OnedriveInventoryItem,
  type InsertOnedriveInventory,
  supportTickets,
  supportTicketReplies,
  type SupportTicket,
  type SupportTicketReply,
} from "@shared/schema";

export interface TeamsChannelsSummaryChannel {
  channelId: string;
  channelDisplayName: string;
  channelType: string;
  recordingCount: number;
  lastActivity: string | null;
}

export interface TeamsChannelsSummary {
  teamId: string;
  teamDisplayName: string;
  channelCount: number;
  recordingCount: number;
  channels: TeamsChannelsSummaryChannel[];
}

export interface IStorage {
  getWorkspaces(search?: string, tenantConnectionId?: string): Promise<Workspace[]>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspaceByM365ObjectId(m365ObjectId: string): Promise<Workspace | undefined>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: string, updates: Partial<InsertWorkspace>): Promise<Workspace | undefined>;
  deleteWorkspace(id: string): Promise<void>;
  bulkUpdateWorkspaces(ids: string[], updates: Partial<InsertWorkspace>): Promise<void>;

  getProvisioningRequests(orgId?: string): Promise<ProvisioningRequest[]>;
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
  deleteOrganization(id: string): Promise<void>;
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

  // Teams recordings discovery
  upsertTeamsRecording(data: InsertTeamsRecording): Promise<TeamsRecording>;
  getTeamsRecordings(tenantConnectionId?: string, search?: string): Promise<TeamsRecording[]>;
  getTeamsRecordingsPaginated(opts: { tenantConnectionIds?: string[]; search?: string; limit: number; offset: number }): Promise<{ rows: TeamsRecording[]; total: number }>;
  getTeamsRecording(id: string): Promise<TeamsRecording | undefined>;
  createTeamsDiscoveryRun(data: InsertTeamsDiscoveryRun): Promise<TeamsDiscoveryRun>;
  updateTeamsDiscoveryRun(id: string, updates: Partial<InsertTeamsDiscoveryRun>): Promise<TeamsDiscoveryRun | undefined>;
  getTeamsDiscoveryRuns(tenantConnectionId?: string, limit?: number): Promise<TeamsDiscoveryRun[]>;
  getLatestTeamsDiscoveryRun(tenantConnectionId: string): Promise<TeamsDiscoveryRun | undefined>;
  getTeamsChannelsSummary(tenantConnectionIds?: string[]): Promise<TeamsChannelsSummary[]>;

  // Teams & Channels inventory
  upsertTeamsInventory(data: InsertTeamsInventory): Promise<TeamsInventoryItem>;
  getTeamsInventory(tenantConnectionIds?: string[], search?: string): Promise<TeamsInventoryItem[]>;
  getTeamsInventoryItem(id: string): Promise<TeamsInventoryItem | undefined>;
  upsertChannelsInventory(data: InsertChannelsInventory): Promise<ChannelsInventoryItem>;
  getChannelsInventory(tenantConnectionId: string, teamId?: string): Promise<ChannelsInventoryItem[]>;
  getTeamsInventorySummary(tenantConnectionIds?: string[]): Promise<TeamsChannelsSummary[]>;

  // OneDrive inventory
  upsertOnedriveInventory(data: InsertOnedriveInventory): Promise<OnedriveInventoryItem>;
  getOnedriveInventory(tenantConnectionIds?: string[], search?: string): Promise<OnedriveInventoryItem[]>;
  getOnedriveInventoryItem(id: string): Promise<OnedriveInventoryItem | undefined>;

  // Support tickets
  createSupportTicket(data: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'resolvedAt' | 'resolvedBy' | 'assignedTo'>): Promise<SupportTicket>;
  getSupportTickets(orgId: string | null, userId: string, isAdmin: boolean): Promise<SupportTicket[]>;
  getSupportTicket(id: string, orgId: string | null, userId?: string): Promise<SupportTicket | null>;
  getTicketReplies(ticketId: string, includeInternal: boolean): Promise<SupportTicketReply[]>;
  addTicketReply(ticketId: string, userId: string, message: string, isInternal: boolean): Promise<SupportTicketReply>;
  closeTicket(id: string, userId: string): Promise<SupportTicket>;
  updateTicketStatus(id: string, status: string): Promise<SupportTicket>;
  getNextTicketNumber(orgId: string): Promise<number>;
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

  async getProvisioningRequests(orgId?: string): Promise<ProvisioningRequest[]> {
    if (orgId) {
      return db.select().from(provisioningRequests)
        .where(eq(provisioningRequests.organizationId, orgId))
        .orderBy(desc(provisioningRequests.createdAt));
    }
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

  async deleteOrganization(id: string): Promise<void> {
    await db.delete(organizations).where(eq(organizations.id, id));
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

  // ── Teams Recordings Discovery ─────────────────────────────────────────────

  async upsertTeamsRecording(data: InsertTeamsRecording): Promise<TeamsRecording> {
    const [result] = await db.insert(teamsRecordings)
      .values(data)
      .onConflictDoUpdate({
        target: [teamsRecordings.tenantConnectionId, teamsRecordings.driveItemId],
        set: {
          meetingTitle: data.meetingTitle,
          meetingDate: data.meetingDate,
          organizer: data.organizer,
          organizerDisplayName: data.organizerDisplayName,
          fileName: data.fileName,
          fileUrl: data.fileUrl,
          filePath: data.filePath,
          fileSizeBytes: data.fileSizeBytes,
          fileCreatedAt: data.fileCreatedAt,
          fileModifiedAt: data.fileModifiedAt,
          sensitivityLabelId: data.sensitivityLabelId,
          sensitivityLabelName: data.sensitivityLabelName,
          retentionLabelName: data.retentionLabelName,
          isShared: data.isShared,
          copilotAccessible: data.copilotAccessible,
          accessibilityBlockers: data.accessibilityBlockers,
          lastDiscoveredAt: data.lastDiscoveredAt,
          discoveryStatus: data.discoveryStatus,
          // Refresh additional mutable metadata to keep discovery idempotent
          storageType: data.storageType,
          teamDisplayName: data.teamDisplayName,
          channelDisplayName: data.channelDisplayName,
          channelType: data.channelType,
          userDisplayName: data.userDisplayName,
          userPrincipalName: data.userPrincipalName,
          driveId: data.driveId,
          fileType: data.fileType,
        },
      })
      .returning();
    return result;
  }

  async getTeamsRecordings(tenantConnectionId?: string, search?: string): Promise<TeamsRecording[]> {
    const conditions = [];
    if (tenantConnectionId) {
      conditions.push(eq(teamsRecordings.tenantConnectionId, tenantConnectionId));
    }
    if (search) {
      conditions.push(
        or(
          ilike(teamsRecordings.fileName, `%${search}%`),
          ilike(teamsRecordings.teamDisplayName, `%${search}%`),
          ilike(teamsRecordings.userDisplayName, `%${search}%`),
          ilike(teamsRecordings.organizer, `%${search}%`),
        )!,
      );
    }
    if (conditions.length > 0) {
      return db.select().from(teamsRecordings)
        .where(and(...conditions))
        .orderBy(desc(teamsRecordings.lastDiscoveredAt));
    }
    return db.select().from(teamsRecordings).orderBy(desc(teamsRecordings.lastDiscoveredAt));
  }

  async getTeamsRecording(id: string): Promise<TeamsRecording | undefined> {
    const [result] = await db.select().from(teamsRecordings).where(eq(teamsRecordings.id, id));
    return result;
  }

  async createTeamsDiscoveryRun(data: InsertTeamsDiscoveryRun): Promise<TeamsDiscoveryRun> {
    const [result] = await db.insert(teamsDiscoveryRuns).values(data).returning();
    return result;
  }

  async updateTeamsDiscoveryRun(id: string, updates: Partial<InsertTeamsDiscoveryRun>): Promise<TeamsDiscoveryRun | undefined> {
    const [result] = await db.update(teamsDiscoveryRuns)
      .set(updates as any)
      .where(eq(teamsDiscoveryRuns.id, id))
      .returning();
    return result;
  }

  async getTeamsDiscoveryRuns(tenantConnectionId?: string, limit = 20): Promise<TeamsDiscoveryRun[]> {
    if (tenantConnectionId) {
      return db.select().from(teamsDiscoveryRuns)
        .where(eq(teamsDiscoveryRuns.tenantConnectionId, tenantConnectionId))
        .orderBy(desc(teamsDiscoveryRuns.startedAt))
        .limit(limit);
    }
    return db.select().from(teamsDiscoveryRuns)
      .orderBy(desc(teamsDiscoveryRuns.startedAt))
      .limit(limit);
  }

  async getLatestTeamsDiscoveryRun(tenantConnectionId: string): Promise<TeamsDiscoveryRun | undefined> {
    const [result] = await db.select().from(teamsDiscoveryRuns)
      .where(eq(teamsDiscoveryRuns.tenantConnectionId, tenantConnectionId))
      .orderBy(desc(teamsDiscoveryRuns.startedAt))
      .limit(1);
    return result;
  }

  async getTeamsChannelsSummary(tenantConnectionIds?: string[]): Promise<TeamsChannelsSummary[]> {
    // An explicit empty list means the caller has no accessible tenants — return nothing.
    if (tenantConnectionIds !== undefined && tenantConnectionIds.length === 0) {
      return [];
    }

    // Query all channel-stored recordings, optionally filtered by tenant
    const conditions = [
      eq(teamsRecordings.storageType, "SHAREPOINT_CHANNEL"),
      eq(teamsRecordings.discoveryStatus, "ACTIVE"),
      eq(teamsRecordings.fileType, "RECORDING"),
    ];
    if (tenantConnectionIds !== undefined) {
      conditions.push(
        sql`${teamsRecordings.tenantConnectionId} IN (${sql.join(
          tenantConnectionIds.map(id => sql`${id}`),
          sql`, `,
        )})` as any,
      );
    }

    const rows = await db.select({
      teamId: teamsRecordings.teamId,
      teamDisplayName: sql<string | null>`max(${teamsRecordings.teamDisplayName})`,
      channelId: teamsRecordings.channelId,
      channelDisplayName: sql<string | null>`max(${teamsRecordings.channelDisplayName})`,
      // max() picks an arbitrary representative; channel type is effectively immutable
      channelType: sql<string | null>`max(${teamsRecordings.channelType})`,
      recordingCount: sql<number>`count(*)::int`,
      lastActivity: sql<string | null>`max(${teamsRecordings.fileModifiedAt})`,
    })
      .from(teamsRecordings)
      .where(and(...conditions))
      .groupBy(
        teamsRecordings.teamId,
        teamsRecordings.channelId,
      );

    // Aggregate into team → channels hierarchy
    const teamMap = new Map<string, TeamsChannelsSummary>();

    for (const row of rows) {
      if (!row.teamId) continue;
      let team = teamMap.get(row.teamId);
      if (!team) {
        team = {
          teamId: row.teamId,
          teamDisplayName: row.teamDisplayName ?? row.teamId,
          channelCount: 0,
          recordingCount: 0,
          channels: [],
        };
        teamMap.set(row.teamId, team);
      }

      team.recordingCount += row.recordingCount;
      if (row.channelId) {
        team.channelCount++;
        team.channels.push({
          channelId: row.channelId,
          channelDisplayName: row.channelDisplayName ?? row.channelId,
          channelType: row.channelType ?? "standard",
          recordingCount: row.recordingCount,
          lastActivity: row.lastActivity,
        });
      }
    }

    // Sort teams by name, channels by last activity desc
    const result = Array.from(teamMap.values());
    result.sort((a, b) => a.teamDisplayName.localeCompare(b.teamDisplayName));
    for (const team of result) {
      team.channels.sort((a, b) => {
        if (!a.lastActivity) return 1;
        if (!b.lastActivity) return -1;
        return b.lastActivity.localeCompare(a.lastActivity);
      });
    }

    return result;
  }

  // ── Paginated Recordings ──────────────────────────────────────────────────

  async getTeamsRecordingsPaginated(opts: {
    tenantConnectionIds?: string[];
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: TeamsRecording[]; total: number }> {
    const conditions = [];
    if (opts.tenantConnectionIds && opts.tenantConnectionIds.length > 0) {
      conditions.push(
        sql`${teamsRecordings.tenantConnectionId} IN (${sql.join(
          opts.tenantConnectionIds.map(id => sql`${id}`),
          sql`, `,
        )})` as any,
      );
    }
    if (opts.search) {
      conditions.push(
        or(
          ilike(teamsRecordings.fileName, `%${opts.search}%`),
          ilike(teamsRecordings.teamDisplayName, `%${opts.search}%`),
          ilike(teamsRecordings.userDisplayName, `%${opts.search}%`),
          ilike(teamsRecordings.organizer, `%${opts.search}%`),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(teamsRecordings)
      .where(where);

    const rows = await db.select().from(teamsRecordings)
      .where(where)
      .orderBy(desc(teamsRecordings.lastDiscoveredAt))
      .limit(opts.limit)
      .offset(opts.offset);

    return { rows, total: countResult?.count ?? 0 };
  }

  // ── Teams & Channels Inventory ──────────────────────────────────────────────

  async upsertTeamsInventory(data: InsertTeamsInventory): Promise<TeamsInventoryItem> {
    const [result] = await db.insert(teamsInventory)
      .values(data)
      .onConflictDoUpdate({
        target: [teamsInventory.tenantConnectionId, teamsInventory.teamId],
        set: {
          displayName: data.displayName,
          description: data.description,
          mailNickname: data.mailNickname,
          visibility: data.visibility,
          isArchived: data.isArchived,
          classification: data.classification,
          createdDateTime: data.createdDateTime,
          renewedDateTime: data.renewedDateTime,
          memberCount: data.memberCount,
          ownerCount: data.ownerCount,
          guestCount: data.guestCount,
          sharepointSiteUrl: data.sharepointSiteUrl,
          sharepointSiteId: data.sharepointSiteId,
          sensitivityLabel: data.sensitivityLabel,
          lastDiscoveredAt: data.lastDiscoveredAt,
          discoveryStatus: data.discoveryStatus,
        },
      })
      .returning();
    return result;
  }

  async getTeamsInventory(tenantConnectionIds?: string[], search?: string): Promise<TeamsInventoryItem[]> {
    const conditions = [eq(teamsInventory.discoveryStatus, "ACTIVE")];
    if (tenantConnectionIds && tenantConnectionIds.length > 0) {
      conditions.push(
        sql`${teamsInventory.tenantConnectionId} IN (${sql.join(
          tenantConnectionIds.map(id => sql`${id}`),
          sql`, `,
        )})` as any,
      );
    }
    if (search) {
      conditions.push(
        or(
          ilike(teamsInventory.displayName, `%${search}%`),
          ilike(teamsInventory.description, `%${search}%`),
          ilike(teamsInventory.mailNickname, `%${search}%`),
        )!,
      );
    }
    return db.select().from(teamsInventory)
      .where(and(...conditions))
      .orderBy(teamsInventory.displayName);
  }

  async getTeamsInventoryItem(id: string): Promise<TeamsInventoryItem | undefined> {
    const [result] = await db.select().from(teamsInventory).where(eq(teamsInventory.id, id));
    return result;
  }

  async upsertChannelsInventory(data: InsertChannelsInventory): Promise<ChannelsInventoryItem> {
    const [result] = await db.insert(channelsInventory)
      .values(data)
      .onConflictDoUpdate({
        target: [channelsInventory.tenantConnectionId, channelsInventory.teamId, channelsInventory.channelId],
        set: {
          displayName: data.displayName,
          description: data.description,
          membershipType: data.membershipType,
          email: data.email,
          webUrl: data.webUrl,
          createdDateTime: data.createdDateTime,
          memberCount: data.memberCount,
          lastDiscoveredAt: data.lastDiscoveredAt,
          discoveryStatus: data.discoveryStatus,
        },
      })
      .returning();
    return result;
  }

  async getChannelsInventory(tenantConnectionId: string, teamId?: string): Promise<ChannelsInventoryItem[]> {
    const conditions = [
      eq(channelsInventory.tenantConnectionId, tenantConnectionId),
      eq(channelsInventory.discoveryStatus, "ACTIVE"),
    ];
    if (teamId) {
      conditions.push(eq(channelsInventory.teamId, teamId));
    }
    return db.select().from(channelsInventory)
      .where(and(...conditions))
      .orderBy(channelsInventory.displayName);
  }

  /**
   * Build a teams/channels summary from the inventory tables (not recordings).
   * Shows ALL teams and ALL channels. Recording counts are enriched by joining
   * against teamsRecordings where available.
   */
  async getTeamsInventorySummary(tenantConnectionIds?: string[]): Promise<TeamsChannelsSummary[]> {
    if (tenantConnectionIds !== undefined && tenantConnectionIds.length === 0) {
      return [];
    }

    // Fetch all inventory teams
    const teamConditions = [eq(teamsInventory.discoveryStatus, "ACTIVE")];
    if (tenantConnectionIds) {
      teamConditions.push(
        sql`${teamsInventory.tenantConnectionId} IN (${sql.join(
          tenantConnectionIds.map(id => sql`${id}`),
          sql`, `,
        )})` as any,
      );
    }

    const inventoryTeams = await db.select().from(teamsInventory)
      .where(and(...teamConditions))
      .orderBy(teamsInventory.displayName);

    if (inventoryTeams.length === 0) return [];

    // Fetch all inventory channels for these tenant connections
    const channelConditions = [eq(channelsInventory.discoveryStatus, "ACTIVE")];
    if (tenantConnectionIds) {
      channelConditions.push(
        sql`${channelsInventory.tenantConnectionId} IN (${sql.join(
          tenantConnectionIds.map(id => sql`${id}`),
          sql`, `,
        )})` as any,
      );
    }

    const inventoryChannels = await db.select().from(channelsInventory)
      .where(and(...channelConditions))
      .orderBy(channelsInventory.displayName);

    // Fetch recording counts per team+channel for enrichment
    const recConditions = [
      eq(teamsRecordings.storageType, "SHAREPOINT_CHANNEL"),
      eq(teamsRecordings.discoveryStatus, "ACTIVE"),
      eq(teamsRecordings.fileType, "RECORDING"),
    ];
    if (tenantConnectionIds) {
      recConditions.push(
        sql`${teamsRecordings.tenantConnectionId} IN (${sql.join(
          tenantConnectionIds.map(id => sql`${id}`),
          sql`, `,
        )})` as any,
      );
    }

    const recRows = await db.select({
      tenantConnectionId: teamsRecordings.tenantConnectionId,
      teamId: teamsRecordings.teamId,
      channelId: teamsRecordings.channelId,
      recordingCount: sql<number>`count(*)::int`,
      lastActivity: sql<string | null>`max(${teamsRecordings.fileModifiedAt})`,
    })
      .from(teamsRecordings)
      .where(and(...recConditions))
      .groupBy(teamsRecordings.tenantConnectionId, teamsRecordings.teamId, teamsRecordings.channelId);

    // Build lookup maps for recording counts, keyed by tenantConnectionId to avoid cross-tenant collisions
    const recByChannel = new Map<string, { count: number; lastActivity: string | null }>();
    const recByTeam = new Map<string, number>();
    for (const r of recRows) {
      const channelKey = `${r.tenantConnectionId}:${r.teamId}:${r.channelId}`;
      recByChannel.set(channelKey, { count: r.recordingCount, lastActivity: r.lastActivity });
      const teamKey = `${r.tenantConnectionId}:${r.teamId}`;
      recByTeam.set(teamKey, (recByTeam.get(teamKey) ?? 0) + r.recordingCount);
    }

    // Group channels by tenant+team to avoid cross-tenant collisions
    const channelsByTeam = new Map<string, ChannelsInventoryItem[]>();
    for (const ch of inventoryChannels) {
      const key = `${ch.tenantConnectionId}:${ch.teamId}`;
      const list = channelsByTeam.get(key) ?? [];
      list.push(ch);
      channelsByTeam.set(key, list);
    }

    // Assemble summary
    const result: TeamsChannelsSummary[] = [];
    for (const team of inventoryTeams) {
      const teamKey = `${team.tenantConnectionId}:${team.teamId}`;
      const teamChannels = channelsByTeam.get(teamKey) ?? [];
      const channels: TeamsChannelsSummaryChannel[] = teamChannels.map(ch => {
        const recInfo = recByChannel.get(`${team.tenantConnectionId}:${team.teamId}:${ch.channelId}`);
        return {
          channelId: ch.channelId,
          channelDisplayName: ch.displayName,
          channelType: ch.membershipType ?? "standard",
          recordingCount: recInfo?.count ?? 0,
          lastActivity: recInfo?.lastActivity ?? null,
        };
      });

      channels.sort((a, b) => {
        if (!a.lastActivity) return 1;
        if (!b.lastActivity) return -1;
        return b.lastActivity.localeCompare(a.lastActivity);
      });

      result.push({
        teamId: team.teamId,
        teamDisplayName: team.displayName,
        channelCount: teamChannels.length,
        recordingCount: recByTeam.get(teamKey) ?? 0,
        channels,
      });
    }

    return result;
  }

  // ── OneDrive Inventory ──────────────────────────────────────────────────────

  async upsertOnedriveInventory(data: InsertOnedriveInventory): Promise<OnedriveInventoryItem> {
    const [result] = await db.insert(onedriveInventory)
      .values(data)
      .onConflictDoUpdate({
        target: [onedriveInventory.tenantConnectionId, onedriveInventory.userId],
        set: {
          userDisplayName: data.userDisplayName,
          userPrincipalName: data.userPrincipalName,
          userDepartment: data.userDepartment,
          userJobTitle: data.userJobTitle,
          userMail: data.userMail,
          driveId: data.driveId,
          driveType: data.driveType,
          quotaTotalBytes: data.quotaTotalBytes,
          quotaUsedBytes: data.quotaUsedBytes,
          quotaRemainingBytes: data.quotaRemainingBytes,
          quotaState: data.quotaState,
          lastActivityDate: data.lastActivityDate,
          fileCount: data.fileCount,
          activeFileCount: data.activeFileCount,
          lastDiscoveredAt: data.lastDiscoveredAt,
          discoveryStatus: data.discoveryStatus,
        },
      })
      .returning();
    return result;
  }

  async getOnedriveInventory(tenantConnectionIds?: string[], search?: string): Promise<OnedriveInventoryItem[]> {
    const conditions = [eq(onedriveInventory.discoveryStatus, "ACTIVE")];
    if (tenantConnectionIds && tenantConnectionIds.length > 0) {
      conditions.push(
        sql`${onedriveInventory.tenantConnectionId} IN (${sql.join(
          tenantConnectionIds.map(id => sql`${id}`),
          sql`, `,
        )})` as any,
      );
    }
    if (search) {
      conditions.push(
        or(
          ilike(onedriveInventory.userDisplayName, `%${search}%`),
          ilike(onedriveInventory.userPrincipalName, `%${search}%`),
          ilike(onedriveInventory.userDepartment, `%${search}%`),
        )!,
      );
    }
    return db.select().from(onedriveInventory)
      .where(and(...conditions))
      .orderBy(onedriveInventory.userDisplayName);
  }

  async getOnedriveInventoryItem(id: string): Promise<OnedriveInventoryItem | undefined> {
    const [result] = await db.select().from(onedriveInventory).where(eq(onedriveInventory.id, id));
    return result;
  }

  async getNextTicketNumber(orgId: string): Promise<number> {
    const [result] = await db
      .select({ maxNum: max(supportTickets.ticketNumber) })
      .from(supportTickets)
      .where(eq(supportTickets.organizationId, orgId));
    return (result?.maxNum ?? 0) + 1;
  }

  async createSupportTicket(data: Omit<SupportTicket, 'id' | 'createdAt' | 'updatedAt' | 'resolvedAt' | 'resolvedBy' | 'assignedTo'>): Promise<SupportTicket> {
    const [ticket] = await db.insert(supportTickets).values(data).returning();
    return ticket;
  }

  async getSupportTickets(orgId: string | null, userId: string, isAdmin: boolean): Promise<SupportTicket[]> {
    if (isAdmin) {
      return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
    }
    if (!orgId) return [];
    return db
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.organizationId, orgId), eq(supportTickets.userId, userId)))
      .orderBy(desc(supportTickets.createdAt));
  }

  async getSupportTicket(id: string, orgId: string | null, userId?: string): Promise<SupportTicket | null> {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    if (!ticket) return null;
    if (orgId && ticket.organizationId !== orgId) return null;
    if (userId && ticket.userId !== userId) return null;
    return ticket;
  }

  async getTicketReplies(ticketId: string, includeInternal: boolean): Promise<SupportTicketReply[]> {
    const conditions = [eq(supportTicketReplies.ticketId, ticketId)];
    if (!includeInternal) {
      conditions.push(eq(supportTicketReplies.isInternal, false));
    }
    return db
      .select()
      .from(supportTicketReplies)
      .where(and(...conditions))
      .orderBy(supportTicketReplies.createdAt);
  }

  async addTicketReply(ticketId: string, userId: string, message: string, isInternal: boolean): Promise<SupportTicketReply> {
    const [reply] = await db
      .insert(supportTicketReplies)
      .values({ ticketId, userId, message, isInternal })
      .returning();
    await db
      .update(supportTickets)
      .set({ updatedAt: new Date(), status: 'in_progress' })
      .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.status, 'open')));
    return reply;
  }

  async closeTicket(id: string, userId: string): Promise<SupportTicket> {
    const [ticket] = await db
      .update(supportTickets)
      .set({ status: 'closed', resolvedAt: new Date(), resolvedBy: userId, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    return ticket;
  }

  async updateTicketStatus(id: string, status: string): Promise<SupportTicket> {
    const [ticket] = await db
      .update(supportTickets)
      .set({ status, updatedAt: new Date() })
      .where(eq(supportTickets.id, id))
      .returning();
    return ticket;
  }
}

export const storage = new DatabaseStorage();
