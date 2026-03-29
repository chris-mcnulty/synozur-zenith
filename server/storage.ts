import { eq, desc, ilike, or, and, sql, gt, max, gte, lte, inArray } from "drizzle-orm";
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
  type InsertSupportTicket,
  type SupportTicketReply,
  contentTypes,
  type ContentType,
  type InsertContentType,
  tenantAccessGrants,
  type TenantAccessGrant,
  type InsertTenantAccessGrant,
  tenantAccessCodes,
  type TenantAccessCode,
  type InsertTenantAccessCode,
  mspAccessGrants,
  type MspAccessGrant,
  type InsertMspAccessGrant,
  tenantEncryptionKeys,
  type TenantEncryptionKey,
  type InsertTenantEncryptionKey,
} from "@shared/schema";
import { decryptRecord, encryptRecord, getTenantKeyBuffer } from "./services/data-masking";

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
  getWorkspaces(search?: string, tenantConnectionId?: string, organizationId?: string): Promise<Workspace[]>;
  getWorkspacesPaginated(params: { page: number; pageSize: number; search?: string; tenantConnectionId?: string; tenantConnectionIds?: string[]; organizationId?: string }): Promise<{ items: Workspace[]; total: number }>;
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspaceByM365ObjectId(m365ObjectId: string): Promise<Workspace | undefined>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  updateWorkspace(id: string, updates: Partial<InsertWorkspace>): Promise<Workspace | undefined>;
  updateWorkspaceScoped(id: string, updates: Partial<InsertWorkspace>, allowedTenantConnectionIds: string[]): Promise<Workspace | undefined>;
  deleteWorkspace(id: string): Promise<void>;
  deleteWorkspaceScoped(id: string, allowedTenantConnectionIds: string[]): Promise<boolean>;
  bulkUpdateWorkspaces(ids: string[], updates: Partial<InsertWorkspace>): Promise<void>;
  bulkUpdateWorkspacesScoped(ids: string[], updates: Partial<InsertWorkspace>, allowedTenantConnectionIds: string[]): Promise<void>;

  getProvisioningRequests(orgId: string | null): Promise<ProvisioningRequest[]>;
  getProvisioningRequest(id: string): Promise<ProvisioningRequest | undefined>;
  createProvisioningRequest(request: InsertProvisioningRequest): Promise<ProvisioningRequest>;
  updateProvisioningRequestStatus(id: string, status: string, extra?: { provisionedSiteUrl?: string; errorMessage?: string }): Promise<ProvisioningRequest | undefined>;

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
  getTenantConnectionDeletionSummary(id: string): Promise<Record<string, number>>;

  getOrganization(id?: string): Promise<Organization | undefined>;
  getOrganizations(): Promise<Organization[]>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  upsertOrganization(org: InsertOrganization): Promise<Organization>;
  deleteOrganization(id: string): Promise<void>;
  purgeOrganizationData(id: string): Promise<void>;
  getOrganizationDataCounts(id: string): Promise<Record<string, number>>;
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
  getAuditLog(filters?: {
    orgId?: string;
    action?: string;
    userId?: string;
    userEmail?: string;
    result?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ rows: AuditLog[]; total: number }>;

  getBlockedDomains(): Promise<DomainBlocklist[]>;
  addBlockedDomain(entry: InsertDomainBlocklist): Promise<DomainBlocklist>;
  removeBlockedDomain(domain: string): Promise<void>;
  isDomainBlocked(domain: string): Promise<boolean>;

  getDataDictionary(tenantId: string, category: string): Promise<TenantDataDictionary[]>;
  getAllDataDictionaries(tenantId: string): Promise<TenantDataDictionary[]>;
  getDataDictionaryEntry(id: string): Promise<TenantDataDictionary | undefined>;
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

  // Content Types
  upsertContentType(data: InsertContentType): Promise<ContentType>;
  getContentTypes(tenantConnectionId: string): Promise<ContentType[]>;

  // Tenant Access Grants & Codes
  getTenantAccessGrants(tenantConnectionId: string): Promise<TenantAccessGrant[]>;
  getActiveTenantAccessGrant(tenantConnectionId: string, organizationId: string): Promise<TenantAccessGrant | undefined>;
  createTenantAccessGrant(data: InsertTenantAccessGrant): Promise<TenantAccessGrant>;
  revokeTenantAccessGrant(id: string, tenantConnectionId: string): Promise<TenantAccessGrant | undefined>;
  getGrantedTenantConnectionIds(organizationId: string): Promise<string[]>;
  createTenantAccessCode(data: InsertTenantAccessCode): Promise<TenantAccessCode>;
  validateAndRedeemAccessCode(code: string, organizationId: string): Promise<{ grant: TenantAccessGrant; tenantConnection: TenantConnection } | null>;

  // MSP Access Grants
  createMspAccessGrant(data: InsertMspAccessGrant): Promise<MspAccessGrant>;
  getMspAccessGrant(id: string): Promise<MspAccessGrant | undefined>;
  getMspAccessGrantByCode(code: string): Promise<MspAccessGrant | undefined>;
  getMspAccessGrantsForTenant(tenantConnectionId: string): Promise<MspAccessGrant[]>;
  getActiveMspGrantForOrg(tenantConnectionId: string, grantedToOrgId: string): Promise<MspAccessGrant | undefined>;
  getActiveMspGrantsForGrantee(grantedToOrgId: string): Promise<MspAccessGrant[]>;
  updateMspAccessGrant(id: string, updates: Partial<MspAccessGrant>): Promise<MspAccessGrant | undefined>;
  invalidatePendingMspCodes(tenantConnectionId: string): Promise<void>;

  // Tenant Encryption Keys
  getTenantEncryptionKey(tenantConnectionId: string): Promise<TenantEncryptionKey | undefined>;
  upsertTenantEncryptionKey(data: InsertTenantEncryptionKey): Promise<TenantEncryptionKey>;
  deleteTenantEncryptionKey(tenantConnectionId: string): Promise<void>;

  // Data purge methods
  purgeOnedriveInventory(tenantConnectionId: string): Promise<number>;
  purgeTeamsRecordings(tenantConnectionId: string): Promise<number>;
  purgeTeamsInventory(tenantConnectionId: string): Promise<number>;
  purgeWorkspaceTelemetry(tenantConnectionId: string): Promise<number>;
  purgeSpeData(tenantConnectionId: string): Promise<number>;

  // Data counts for purge confirmation
  countOnedriveInventory(tenantConnectionId: string): Promise<number>;
  countTeamsRecordings(tenantConnectionId: string): Promise<number>;
  countTeamsInventory(tenantConnectionId: string): Promise<number>;
  countWorkspaceTelemetry(tenantConnectionId: string): Promise<number>;
  countSpeData(tenantConnectionId: string): Promise<number>;
}

export class DatabaseStorage implements IStorage {
  private keyCache = new Map<string, { buffer: Buffer; expiry: number }>();

  private async getKeyBufferForTenant(tenantConnectionId: string): Promise<Buffer | null> {
    const cached = this.keyCache.get(tenantConnectionId);
    if (cached && cached.expiry > Date.now()) return cached.buffer;

    const conn = await this.getTenantConnection(tenantConnectionId);
    if (!conn?.dataMaskingEnabled) return null;

    const keyRecord = await this.getTenantEncryptionKey(tenantConnectionId);
    if (!keyRecord) return null;

    const buffer = getTenantKeyBuffer(keyRecord.encryptedKey);
    this.keyCache.set(tenantConnectionId, { buffer, expiry: Date.now() + 60000 });
    return buffer;
  }

  invalidateKeyCache(tenantConnectionId: string): void {
    this.keyCache.delete(tenantConnectionId);
  }

  private async encryptForTenant<T extends Record<string, any>>(data: T, tableName: string, tenantConnectionId: string): Promise<T> {
    const buf = await this.getKeyBufferForTenant(tenantConnectionId);
    if (!buf) return data;
    return encryptRecord(data, tableName, buf);
  }

  private async decryptRows<T extends Record<string, any>>(rows: T[], tableName: string, tenantConnectionIdField: string = "tenantConnectionId"): Promise<T[]> {
    if (rows.length === 0) return rows;

    const tenantIds = [...new Set(rows.map(r => r[tenantConnectionIdField]).filter(Boolean))];
    const keyMap = new Map<string, Buffer>();

    for (const tid of tenantIds) {
      const buf = await this.getKeyBufferForTenant(tid);
      if (buf) keyMap.set(tid, buf);
    }

    if (keyMap.size === 0) return rows;

    return rows.map(row => {
      const tid = row[tenantConnectionIdField];
      const buf = keyMap.get(tid);
      if (!buf) return row;
      return decryptRecord(row, tableName, buf);
    });
  }

  async getWorkspaces(search?: string, tenantConnectionId?: string, organizationId?: string): Promise<Workspace[]> {
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(workspaces.displayName, `%${search}%`),
          ilike(workspaces.department, `%${search}%`),
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${workspaces.siteOwners}) AS owner
            WHERE owner->>'displayName' ILIKE ${`%${search}%`}
               OR owner->>'mail' ILIKE ${`%${search}%`}
               OR owner->>'userPrincipalName' ILIKE ${`%${search}%`}
          )`
        )
      );
    }

    if (tenantConnectionId) {
      conditions.push(eq(workspaces.tenantConnectionId, tenantConnectionId));
    }

    if (organizationId) {
      const orgConnections = await db
        .select({ id: tenantConnections.id })
        .from(tenantConnections)
        .where(eq(tenantConnections.organizationId, organizationId));
      const orgConnectionIds = orgConnections.map(c => c.id);
      if (orgConnectionIds.length === 0) return [];
      conditions.push(sql`${workspaces.tenantConnectionId} = ANY(ARRAY[${sql.join(orgConnectionIds.map(id => sql`${id}`), sql`, `)}]::text[])`);
    }

    let rows: Workspace[];
    if (conditions.length > 0) {
      rows = await db.select().from(workspaces).where(and(...conditions)).orderBy(desc(workspaces.createdAt));
    } else {
      rows = await db.select().from(workspaces).orderBy(desc(workspaces.createdAt));
    }
    return this.decryptRows(rows, "workspaces") as Promise<Workspace[]>;
  }

  async getWorkspacesPaginated(params: { page: number; pageSize: number; search?: string; tenantConnectionId?: string; tenantConnectionIds?: string[]; organizationId?: string }): Promise<{ items: Workspace[]; total: number }> {
    const { page, pageSize, search, tenantConnectionId, tenantConnectionIds, organizationId } = params;
    const conditions = [];

    if (search) {
      conditions.push(
        or(
          ilike(workspaces.displayName, `%${search}%`),
          ilike(workspaces.department, `%${search}%`),
          sql`EXISTS (
            SELECT 1 FROM jsonb_array_elements(${workspaces.siteOwners}) AS owner
            WHERE owner->>'displayName' ILIKE ${`%${search}%`}
               OR owner->>'mail' ILIKE ${`%${search}%`}
               OR owner->>'userPrincipalName' ILIKE ${`%${search}%`}
          )`
        )
      );
    }

    if (tenantConnectionId) {
      conditions.push(eq(workspaces.tenantConnectionId, tenantConnectionId));
    } else if (tenantConnectionIds && tenantConnectionIds.length > 0) {
      conditions.push(inArray(workspaces.tenantConnectionId, tenantConnectionIds));
    }

    if (organizationId) {
      const orgConnections = await db
        .select({ id: tenantConnections.id })
        .from(tenantConnections)
        .where(eq(tenantConnections.organizationId, organizationId));
      const orgConnectionIds = orgConnections.map(c => c.id);
      if (orgConnectionIds.length === 0) return { items: [], total: 0 };
      conditions.push(inArray(workspaces.tenantConnectionId, orgConnectionIds));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult, items] = await Promise.all([
      db.select({ count: sql<number>`COUNT(*)` }).from(workspaces).where(where),
      db.select().from(workspaces).where(where).orderBy(desc(workspaces.createdAt)).limit(pageSize).offset((page - 1) * pageSize),
    ]);

    const total = Number(countResult[0]?.count ?? 0);
    const decryptedItems = await this.decryptRows(items, "workspaces") as Workspace[];
    return { items: decryptedItems, total };
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    if (!workspace) return undefined;
    const [decrypted] = await this.decryptRows([workspace], "workspaces");
    return decrypted as Workspace;
  }

  async getWorkspaceByM365ObjectId(m365ObjectId: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.m365ObjectId, m365ObjectId));
    if (!workspace) return undefined;
    const [decrypted] = await this.decryptRows([workspace], "workspaces");
    return decrypted as Workspace;
  }

  async createWorkspace(workspace: InsertWorkspace): Promise<Workspace> {
    const data = workspace.tenantConnectionId
      ? await this.encryptForTenant(workspace as Record<string, any>, "workspaces", workspace.tenantConnectionId) as InsertWorkspace
      : workspace;
    const [created] = await db.insert(workspaces).values(data).returning();
    return created;
  }

  async updateWorkspace(id: string, updates: Partial<InsertWorkspace>): Promise<Workspace | undefined> {
    const [existing] = await db.select({ tenantConnectionId: workspaces.tenantConnectionId }).from(workspaces).where(eq(workspaces.id, id));
    const encrypted = existing?.tenantConnectionId
      ? await this.encryptForTenant(updates as Record<string, any>, "workspaces", existing.tenantConnectionId) as Partial<InsertWorkspace>
      : updates;
    const [updated] = await db.update(workspaces).set(encrypted).where(eq(workspaces.id, id)).returning();
    return updated;
  }

  async updateWorkspaceScoped(id: string, updates: Partial<InsertWorkspace>, allowedTenantConnectionIds: string[]): Promise<Workspace | undefined> {
    if (allowedTenantConnectionIds.length === 0) return undefined;
    const [existing] = await db.select({ tenantConnectionId: workspaces.tenantConnectionId }).from(workspaces).where(eq(workspaces.id, id));
    const encrypted = existing?.tenantConnectionId
      ? await this.encryptForTenant(updates as Record<string, any>, "workspaces", existing.tenantConnectionId) as Partial<InsertWorkspace>
      : updates;
    const [updated] = await db.update(workspaces).set(encrypted).where(
      and(
        eq(workspaces.id, id),
        sql`${workspaces.tenantConnectionId} = ANY(ARRAY[${sql.join(allowedTenantConnectionIds.map(tid => sql`${tid}`), sql`, `)}]::text[])`
      )
    ).returning();
    return updated;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await db.delete(workspaces).where(eq(workspaces.id, id));
  }

  async deleteWorkspaceScoped(id: string, allowedTenantConnectionIds: string[]): Promise<boolean> {
    if (allowedTenantConnectionIds.length === 0) return false;
    const result = await db.delete(workspaces).where(
      and(
        eq(workspaces.id, id),
        sql`${workspaces.tenantConnectionId} = ANY(ARRAY[${sql.join(allowedTenantConnectionIds.map(tid => sql`${tid}`), sql`, `)}]::text[])`
      )
    ).returning({ id: workspaces.id });
    return result.length > 0;
  }

  async bulkUpdateWorkspaces(ids: string[], updates: Partial<InsertWorkspace>): Promise<void> {
    for (const id of ids) {
      await db.update(workspaces).set(updates).where(eq(workspaces.id, id));
    }
  }

  async bulkUpdateWorkspacesScoped(ids: string[], updates: Partial<InsertWorkspace>, allowedTenantConnectionIds: string[]): Promise<void> {
    if (allowedTenantConnectionIds.length === 0) return;
    for (const id of ids) {
      await db.update(workspaces).set(updates).where(
        and(
          eq(workspaces.id, id),
          sql`${workspaces.tenantConnectionId} = ANY(ARRAY[${sql.join(allowedTenantConnectionIds.map(tid => sql`${tid}`), sql`, `)}]::text[])`
        )
      );
    }
  }

  async getProvisioningRequests(orgId: string | null): Promise<ProvisioningRequest[]> {
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

  async updateProvisioningRequestStatus(id: string, status: string, extra?: { provisionedSiteUrl?: string; errorMessage?: string }): Promise<ProvisioningRequest | undefined> {
    const [updated] = await db.update(provisioningRequests).set({ status, ...extra }).where(eq(provisioningRequests.id, id)).returning();
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

  async getTenantConnectionDeletionSummary(id: string): Promise<Record<string, number>> {
    const [conn] = await db.select().from(tenantConnections).where(eq(tenantConnections.id, id));
    if (!conn) return {};

    const ct = sql<number>`count(*)::int`;

    const [
      [{ count: sitesCount }], [{ count: docLibsCount }], [{ count: speContainerTypesCount }],
      [{ count: speContainersCount }], [{ count: teamsTeamsCount }], [{ count: teamsChannelsCount }],
      [{ count: teamsRecordingsCount }], [{ count: teamsDiscoveryRunsCount }], [{ count: onedriveCount }],
      [{ count: contentTypesCount }], [{ count: workspaceTelemetryCount }],
      [{ count: provisioningRequestsCount }], [{ count: mspAccessGrantsCount }],
      [{ count: tenantAccessGrantsCount }], [{ count: tenantAccessCodesCount }],
    ] = await Promise.all([
      db.select({ count: ct }).from(workspaces).where(eq(workspaces.tenantConnectionId, id)),
      db.select({ count: ct }).from(documentLibraries).where(eq(documentLibraries.tenantConnectionId, id)),
      db.select({ count: ct }).from(speContainerTypes).where(eq(speContainerTypes.tenantConnectionId, id)),
      db.select({ count: ct }).from(speContainers).where(eq(speContainers.tenantConnectionId, id)),
      db.select({ count: ct }).from(teamsInventory).where(eq(teamsInventory.tenantConnectionId, id)),
      db.select({ count: ct }).from(channelsInventory).where(eq(channelsInventory.tenantConnectionId, id)),
      db.select({ count: ct }).from(teamsRecordings).where(eq(teamsRecordings.tenantConnectionId, id)),
      db.select({ count: ct }).from(teamsDiscoveryRuns).where(eq(teamsDiscoveryRuns.tenantConnectionId, id)),
      db.select({ count: ct }).from(onedriveInventory).where(eq(onedriveInventory.tenantConnectionId, id)),
      db.select({ count: ct }).from(contentTypes).where(eq(contentTypes.tenantConnectionId, id)),
      db.select({ count: ct }).from(workspaceTelemetry).where(eq(workspaceTelemetry.tenantConnectionId, id)),
      db.select({ count: ct }).from(provisioningRequests).where(eq(provisioningRequests.tenantConnectionId, id)),
      db.select({ count: ct }).from(mspAccessGrants).where(eq(mspAccessGrants.tenantConnectionId, id)),
      db.select({ count: ct }).from(tenantAccessGrants).where(eq(tenantAccessGrants.tenantConnectionId, id)),
      db.select({ count: ct }).from(tenantAccessCodes).where(eq(tenantAccessCodes.tenantConnectionId, id)),
    ]);

    const otherConns = await db.select({ id: tenantConnections.id }).from(tenantConnections)
      .where(and(eq(tenantConnections.tenantId, conn.tenantId), sql`${tenantConnections.id} != ${id}`));
    const isLastConnection = otherConns.length === 0;

    let departmentsCount = 0, dataDictionariesCount = 0, sensitivityLabelsCount = 0,
      retentionLabelsCount = 0, customFieldsCount = 0;

    if (isLastConnection) {
      const [
        [{ count: dc }], [{ count: ddc }], [{ count: slc }], [{ count: rlc }], [{ count: cfc }],
      ] = await Promise.all([
        db.select({ count: ct }).from(tenantDepartments).where(eq(tenantDepartments.tenantId, conn.tenantId)),
        db.select({ count: ct }).from(tenantDataDictionaries).where(eq(tenantDataDictionaries.tenantId, conn.tenantId)),
        db.select({ count: ct }).from(sensitivityLabels).where(eq(sensitivityLabels.tenantId, conn.tenantId)),
        db.select({ count: ct }).from(retentionLabels).where(eq(retentionLabels.tenantId, conn.tenantId)),
        db.select({ count: ct }).from(customFieldDefinitions).where(eq(customFieldDefinitions.tenantId, conn.tenantId)),
      ]);
      departmentsCount = dc;
      dataDictionariesCount = ddc;
      sensitivityLabelsCount = slc;
      retentionLabelsCount = rlc;
      customFieldsCount = cfc;
    }

    let governancePoliciesCount = 0, graphTokensCount = 0;
    if (conn.organizationId) {
      const otherOrgConns = await db.select({ id: tenantConnections.id }).from(tenantConnections)
        .where(and(eq(tenantConnections.organizationId, conn.organizationId), sql`${tenantConnections.id} != ${id}`));
      if (otherOrgConns.length === 0) {
        const [
          [{ count: gpc }], [{ count: gtc }],
        ] = await Promise.all([
          db.select({ count: ct }).from(governancePolicies).where(eq(governancePolicies.organizationId, conn.organizationId)),
          db.select({ count: ct }).from(graphTokens).where(eq(graphTokens.organizationId, conn.organizationId)),
        ]);
        governancePoliciesCount = gpc;
        graphTokensCount = gtc;
      }
    }

    return {
      sites: sitesCount,
      documentLibraries: docLibsCount,
      speContainerTypes: speContainerTypesCount,
      speContainers: speContainersCount,
      teamsTeams: teamsTeamsCount,
      teamsChannels: teamsChannelsCount,
      teamsRecordings: teamsRecordingsCount,
      teamsDiscoveryRuns: teamsDiscoveryRunsCount,
      onedriveInventory: onedriveCount,
      contentTypes: contentTypesCount,
      workspaceTelemetry: workspaceTelemetryCount,
      provisioningRequests: provisioningRequestsCount,
      mspAccessGrants: mspAccessGrantsCount,
      tenantAccessGrants: tenantAccessGrantsCount,
      tenantAccessCodes: tenantAccessCodesCount,
      departments: departmentsCount,
      dataDictionaries: dataDictionariesCount,
      sensitivityLabels: sensitivityLabelsCount,
      retentionLabels: retentionLabelsCount,
      customFields: customFieldsCount,
      governancePolicies: governancePoliciesCount,
      graphTokens: graphTokensCount,
    };
  }

  async deleteTenantConnection(id: string): Promise<void> {
    const [conn] = await db.select().from(tenantConnections).where(eq(tenantConnections.id, id));
    if (!conn) return;

    await db.transaction(async (tx) => {
      const tenantWorkspaces = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.tenantConnectionId, id));
      const workspaceIds = tenantWorkspaces.map(w => w.id);

      if (workspaceIds.length > 0) {
        for (const wId of workspaceIds) {
          await tx.delete(copilotRules).where(eq(copilotRules.workspaceId, wId));
        }
        await tx.delete(workspaces).where(eq(workspaces.tenantConnectionId, id));
      }
      await tx.delete(workspaceTelemetry).where(eq(workspaceTelemetry.tenantConnectionId, id));

      await tx.delete(documentLibraries).where(eq(documentLibraries.tenantConnectionId, id));

      const speContainerIds = await tx.select({ id: speContainers.id }).from(speContainers).where(eq(speContainers.tenantConnectionId, id));
      if (speContainerIds.length > 0) {
        await tx.delete(speContainerUsage).where(inArray(speContainerUsage.containerId, speContainerIds.map(c => c.id)));
      }
      await tx.delete(speContainers).where(eq(speContainers.tenantConnectionId, id));
      await tx.delete(speContainerTypes).where(eq(speContainerTypes.tenantConnectionId, id));

      await tx.delete(teamsRecordings).where(eq(teamsRecordings.tenantConnectionId, id));
      await tx.delete(teamsDiscoveryRuns).where(eq(teamsDiscoveryRuns.tenantConnectionId, id));
      await tx.delete(teamsInventory).where(eq(teamsInventory.tenantConnectionId, id));
      await tx.delete(channelsInventory).where(eq(channelsInventory.tenantConnectionId, id));
      await tx.delete(onedriveInventory).where(eq(onedriveInventory.tenantConnectionId, id));
      await tx.delete(contentTypes).where(eq(contentTypes.tenantConnectionId, id));

      await tx.delete(provisioningRequests).where(eq(provisioningRequests.tenantConnectionId, id));
      await tx.delete(mspAccessGrants).where(eq(mspAccessGrants.tenantConnectionId, id));
      await tx.delete(tenantAccessGrants).where(eq(tenantAccessGrants.tenantConnectionId, id));
      await tx.delete(tenantAccessCodes).where(eq(tenantAccessCodes.tenantConnectionId, id));

      const otherConns = await tx.select({ id: tenantConnections.id }).from(tenantConnections)
        .where(and(eq(tenantConnections.tenantId, conn.tenantId), sql`${tenantConnections.id} != ${id}`));
      if (otherConns.length === 0) {
        await tx.delete(tenantDepartments).where(eq(tenantDepartments.tenantId, conn.tenantId));
        await tx.delete(tenantDataDictionaries).where(eq(tenantDataDictionaries.tenantId, conn.tenantId));
        await tx.delete(sensitivityLabels).where(eq(sensitivityLabels.tenantId, conn.tenantId));
        await tx.delete(retentionLabels).where(eq(retentionLabels.tenantId, conn.tenantId));
        await tx.delete(customFieldDefinitions).where(eq(customFieldDefinitions.tenantId, conn.tenantId));
      }

      if (conn.organizationId) {
        const otherOrgConns = await tx.select({ id: tenantConnections.id }).from(tenantConnections)
          .where(and(eq(tenantConnections.organizationId, conn.organizationId), sql`${tenantConnections.id} != ${id}`));
        if (otherOrgConns.length === 0) {
          await tx.delete(governancePolicies).where(eq(governancePolicies.organizationId, conn.organizationId));
          await tx.delete(graphTokens).where(eq(graphTokens.organizationId, conn.organizationId));
        }
      }

      await tx.update(auditLog).set({ tenantConnectionId: null }).where(eq(auditLog.tenantConnectionId, id));

      await tx.delete(tenantConnections).where(eq(tenantConnections.id, id));
    });
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

  async getOrganizationDataCounts(id: string): Promise<Record<string, number>> {
    const tenantConns = await db.select({ id: tenantConnections.id }).from(tenantConnections).where(eq(tenantConnections.organizationId, id));
    const tenantIds = tenantConns.map(t => t.id);

    const counts: Record<string, number> = {};

    counts.tenantConnections = tenantIds.length;

    if (tenantIds.length > 0) {
      const [wsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(workspaces).where(inArray(workspaces.tenantConnectionId, tenantIds));
      counts.workspaces = wsCount?.count ?? 0;
    } else {
      counts.workspaces = 0;
    }

    const [userCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.organizationId, id));
    counts.users = userCount?.count ?? 0;

    const [memberCount] = await db.select({ count: sql<number>`count(*)::int` }).from(organizationUsers).where(eq(organizationUsers.organizationId, id));
    counts.memberships = memberCount?.count ?? 0;

    const [policyCount] = await db.select({ count: sql<number>`count(*)::int` }).from(governancePolicies).where(eq(governancePolicies.organizationId, id));
    counts.policies = policyCount?.count ?? 0;

    const [ticketCount] = await db.select({ count: sql<number>`count(*)::int` }).from(supportTickets).where(eq(supportTickets.organizationId, id));
    counts.tickets = ticketCount?.count ?? 0;

    const [auditCount] = await db.select({ count: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.organizationId, id));
    counts.auditEntries = auditCount?.count ?? 0;

    return counts;
  }

  async purgeOrganizationData(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      const tenantConns = await tx.select({ id: tenantConnections.id, tenantId: tenantConnections.tenantId }).from(tenantConnections).where(eq(tenantConnections.organizationId, id));
      const connIds = tenantConns.map(t => t.id);
      const azureTenantIds = Array.from(new Set(tenantConns.map(t => t.tenantId)));

      if (connIds.length > 0) {
        const ws = await tx.select({ id: workspaces.id }).from(workspaces).where(inArray(workspaces.tenantConnectionId, connIds));
        const wsIds = ws.map(w => w.id);

        if (wsIds.length > 0) {
          await tx.delete(documentLibraries).where(inArray(documentLibraries.workspaceId, wsIds));
          await tx.delete(copilotRules).where(inArray(copilotRules.workspaceId, wsIds));
          await tx.delete(workspaceTelemetry).where(inArray(workspaceTelemetry.workspaceId, wsIds));
          await tx.delete(workspaces).where(inArray(workspaces.id, wsIds));
        }

        await tx.delete(teamsRecordings).where(inArray(teamsRecordings.tenantConnectionId, connIds));
        await tx.delete(teamsDiscoveryRuns).where(inArray(teamsDiscoveryRuns.tenantConnectionId, connIds));
        await tx.delete(channelsInventory).where(inArray(channelsInventory.tenantConnectionId, connIds));
        await tx.delete(teamsInventory).where(inArray(teamsInventory.tenantConnectionId, connIds));
        await tx.delete(onedriveInventory).where(inArray(onedriveInventory.tenantConnectionId, connIds));
        await tx.delete(contentTypes).where(inArray(contentTypes.tenantConnectionId, connIds));

        if (azureTenantIds.length > 0) {
          await tx.delete(sensitivityLabels).where(inArray(sensitivityLabels.tenantId, azureTenantIds));
          await tx.delete(retentionLabels).where(inArray(retentionLabels.tenantId, azureTenantIds));
          await tx.delete(tenantDataDictionaries).where(inArray(tenantDataDictionaries.tenantId, azureTenantIds));
          await tx.delete(tenantDepartments).where(inArray(tenantDepartments.tenantId, azureTenantIds));
          await tx.delete(customFieldDefinitions).where(inArray(customFieldDefinitions.tenantId, azureTenantIds));
        }

        const speContainerRows = await tx.select({ id: speContainers.id }).from(speContainers).where(inArray(speContainers.tenantConnectionId, connIds));
        if (speContainerRows.length > 0) {
          await tx.delete(speContainerUsage).where(inArray(speContainerUsage.containerId, speContainerRows.map(c => c.id)));
        }
        await tx.delete(speContainers).where(inArray(speContainers.tenantConnectionId, connIds));
        await tx.delete(speContainerTypes).where(inArray(speContainerTypes.tenantConnectionId, connIds));

        await tx.delete(tenantAccessCodes).where(inArray(tenantAccessCodes.tenantConnectionId, connIds));
        await tx.delete(tenantAccessGrants).where(inArray(tenantAccessGrants.tenantConnectionId, connIds));
        await tx.delete(mspAccessGrants).where(inArray(mspAccessGrants.tenantConnectionId, connIds));

        await tx.delete(tenantConnections).where(inArray(tenantConnections.id, connIds));
      }

      await tx.delete(mspAccessGrants).where(
        or(eq(mspAccessGrants.grantingOrgId, id), eq(mspAccessGrants.grantedToOrgId, id))
      );
      await tx.delete(tenantAccessGrants).where(eq(tenantAccessGrants.grantedOrganizationId, id));

      await tx.delete(provisioningRequests).where(eq(provisioningRequests.organizationId, id));

      await tx.delete(policyOutcomes).where(eq(policyOutcomes.organizationId, id));
      await tx.delete(governancePolicies).where(eq(governancePolicies.organizationId, id));

      const ticketRows = await tx.select({ id: supportTickets.id }).from(supportTickets).where(eq(supportTickets.organizationId, id));
      if (ticketRows.length > 0) {
        await tx.delete(supportTicketReplies).where(inArray(supportTicketReplies.ticketId, ticketRows.map(t => t.id)));
        await tx.delete(supportTickets).where(eq(supportTickets.organizationId, id));
      }

      await tx.delete(graphTokens).where(eq(graphTokens.organizationId, id));
      await tx.delete(organizationUsers).where(eq(organizationUsers.organizationId, id));
      await tx.delete(auditLog).where(eq(auditLog.organizationId, id));

      await tx.delete(users).where(eq(users.organizationId, id));

      await tx.delete(organizations).where(eq(organizations.id, id));
    });
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

  async getAuditLog(filters: {
    orgId?: string;
    action?: string;
    userId?: string;
    userEmail?: string;
    result?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ rows: AuditLog[]; total: number }> {
    const { orgId, action, userId, userEmail, result, startDate, endDate, limit = 100, offset = 0 } = filters;
    const conditions: any[] = [];

    if (orgId) conditions.push(eq(auditLog.organizationId, orgId));
    if (action) conditions.push(eq(auditLog.action, action));
    if (userId) conditions.push(eq(auditLog.userId, userId));
    if (userEmail) conditions.push(ilike(auditLog.userEmail, `%${userEmail}%`));
    if (result) conditions.push(eq(auditLog.result, result));
    if (startDate) conditions.push(gte(auditLog.createdAt, startDate));
    if (endDate) conditions.push(lte(auditLog.createdAt, endDate));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult, rows] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(auditLog).where(whereClause),
      db.select().from(auditLog)
        .where(whereClause)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit)
        .offset(offset),
    ]);

    return { rows, total: countResult[0]?.count ?? 0 };
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

  async getDataDictionaryEntry(id: string): Promise<TenantDataDictionary | undefined> {
    const [entry] = await db.select().from(tenantDataDictionaries)
      .where(eq(tenantDataDictionaries.id, id));
    return entry;
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
    const rows = await db.select().from(documentLibraries)
      .where(eq(documentLibraries.workspaceId, workspaceId))
      .orderBy(documentLibraries.displayName);
    return this.decryptRows(rows, "document_libraries") as Promise<DocumentLibrary[]>;
  }

  async getDocumentLibrariesByTenant(tenantConnectionId: string): Promise<DocumentLibrary[]> {
    const rows = await db.select().from(documentLibraries)
      .where(eq(documentLibraries.tenantConnectionId, tenantConnectionId))
      .orderBy(documentLibraries.displayName);
    return this.decryptRows(rows, "document_libraries") as Promise<DocumentLibrary[]>;
  }

  async getDocumentLibrary(id: string): Promise<DocumentLibrary | undefined> {
    const [lib] = await db.select().from(documentLibraries)
      .where(eq(documentLibraries.id, id));
    if (!lib) return undefined;
    const [decrypted] = await this.decryptRows([lib], "document_libraries");
    return decrypted as DocumentLibrary;
  }

  async upsertDocumentLibrary(data: InsertDocumentLibrary): Promise<DocumentLibrary> {
    const encrypted = await this.encryptForTenant(data as Record<string, any>, "document_libraries", data.tenantConnectionId) as InsertDocumentLibrary;
    const [result] = await db.insert(documentLibraries).values(encrypted)
      .onConflictDoUpdate({
        target: [documentLibraries.workspaceId, documentLibraries.m365ListId],
        set: {
          displayName: encrypted.displayName,
          description: encrypted.description,
          webUrl: encrypted.webUrl,
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
    const encrypted = await this.encryptForTenant(data as Record<string, any>, "teams_recordings", data.tenantConnectionId) as InsertTeamsRecording;
    const [result] = await db.insert(teamsRecordings)
      .values(encrypted)
      .onConflictDoUpdate({
        target: [teamsRecordings.tenantConnectionId, teamsRecordings.driveItemId],
        set: {
          meetingTitle: encrypted.meetingTitle,
          meetingDate: encrypted.meetingDate,
          organizer: encrypted.organizer,
          organizerDisplayName: encrypted.organizerDisplayName,
          fileName: encrypted.fileName,
          fileUrl: encrypted.fileUrl,
          filePath: encrypted.filePath,
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
          storageType: encrypted.storageType,
          teamDisplayName: encrypted.teamDisplayName,
          channelDisplayName: encrypted.channelDisplayName,
          channelType: encrypted.channelType,
          userDisplayName: encrypted.userDisplayName,
          userPrincipalName: encrypted.userPrincipalName,
          driveId: encrypted.driveId,
          fileType: encrypted.fileType,
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
    let rows: TeamsRecording[];
    if (conditions.length > 0) {
      rows = await db.select().from(teamsRecordings)
        .where(and(...conditions))
        .orderBy(desc(teamsRecordings.lastDiscoveredAt));
    } else {
      rows = await db.select().from(teamsRecordings).orderBy(desc(teamsRecordings.lastDiscoveredAt));
    }
    return this.decryptRows(rows, "teams_recordings") as Promise<TeamsRecording[]>;
  }

  async getTeamsRecording(id: string): Promise<TeamsRecording | undefined> {
    const [result] = await db.select().from(teamsRecordings).where(eq(teamsRecordings.id, id));
    if (!result) return undefined;
    const [decrypted] = await this.decryptRows([result], "teams_recordings");
    return decrypted as TeamsRecording;
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

    const decryptedRows = await this.decryptRows(rows, "teams_recordings") as TeamsRecording[];
    return { rows: decryptedRows, total: countResult?.count ?? 0 };
  }

  // ── Teams & Channels Inventory ──────────────────────────────────────────────

  async upsertTeamsInventory(data: InsertTeamsInventory): Promise<TeamsInventoryItem> {
    const encrypted = await this.encryptForTenant(data as Record<string, any>, "teams_inventory", data.tenantConnectionId) as InsertTeamsInventory;
    const [result] = await db.insert(teamsInventory)
      .values(encrypted)
      .onConflictDoUpdate({
        target: [teamsInventory.tenantConnectionId, teamsInventory.teamId],
        set: {
          displayName: encrypted.displayName,
          description: encrypted.description,
          mailNickname: encrypted.mailNickname,
          visibility: data.visibility,
          isArchived: data.isArchived,
          classification: data.classification,
          createdDateTime: data.createdDateTime,
          renewedDateTime: data.renewedDateTime,
          memberCount: data.memberCount,
          ownerCount: data.ownerCount,
          guestCount: data.guestCount,
          sharepointSiteUrl: encrypted.sharepointSiteUrl,
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
    const rows = await db.select().from(teamsInventory)
      .where(and(...conditions))
      .orderBy(teamsInventory.displayName);
    return this.decryptRows(rows, "teams_inventory") as Promise<TeamsInventoryItem[]>;
  }

  async getTeamsInventoryItem(id: string): Promise<TeamsInventoryItem | undefined> {
    const [result] = await db.select().from(teamsInventory).where(eq(teamsInventory.id, id));
    if (!result) return undefined;
    const [decrypted] = await this.decryptRows([result], "teams_inventory");
    return decrypted as TeamsInventoryItem;
  }

  async upsertChannelsInventory(data: InsertChannelsInventory): Promise<ChannelsInventoryItem> {
    const encrypted = await this.encryptForTenant(data as Record<string, any>, "channels_inventory", data.tenantConnectionId) as InsertChannelsInventory;
    const [result] = await db.insert(channelsInventory)
      .values(encrypted)
      .onConflictDoUpdate({
        target: [channelsInventory.tenantConnectionId, channelsInventory.teamId, channelsInventory.channelId],
        set: {
          displayName: encrypted.displayName,
          description: encrypted.description,
          membershipType: data.membershipType,
          email: encrypted.email,
          webUrl: encrypted.webUrl,
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
    const rows = await db.select().from(channelsInventory)
      .where(and(...conditions))
      .orderBy(channelsInventory.displayName);
    return this.decryptRows(rows, "channels_inventory") as Promise<ChannelsInventoryItem[]>;
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
    const encrypted = await this.encryptForTenant(data as Record<string, any>, "onedrive_inventory", data.tenantConnectionId) as InsertOnedriveInventory;
    const [result] = await db.insert(onedriveInventory)
      .values(encrypted)
      .onConflictDoUpdate({
        target: [onedriveInventory.tenantConnectionId, onedriveInventory.userId],
        set: {
          userDisplayName: encrypted.userDisplayName,
          userPrincipalName: encrypted.userPrincipalName,
          userDepartment: encrypted.userDepartment,
          userJobTitle: encrypted.userJobTitle,
          userMail: encrypted.userMail,
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
    const rows = await db.select().from(onedriveInventory)
      .where(and(...conditions))
      .orderBy(onedriveInventory.userDisplayName);
    return this.decryptRows(rows, "onedrive_inventory") as Promise<OnedriveInventoryItem[]>;
  }

  async getOnedriveInventoryItem(id: string): Promise<OnedriveInventoryItem | undefined> {
    const [result] = await db.select().from(onedriveInventory).where(eq(onedriveInventory.id, id));
    if (!result) return undefined;
    const [decrypted] = await this.decryptRows([result], "onedrive_inventory");
    return decrypted as OnedriveInventoryItem;
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

  // ── Content Types ──────────────────────────────────────────────────────────

  async upsertContentType(data: InsertContentType): Promise<ContentType> {
    const [result] = await db.insert(contentTypes)
      .values(data)
      .onConflictDoUpdate({
        target: [contentTypes.tenantConnectionId, contentTypes.contentTypeId],
        set: {
          name: data.name,
          group: data.group,
          description: data.description,
          isHub: data.isHub,
          subscribedSiteCount: data.subscribedSiteCount,
          syncedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async getContentTypes(tenantConnectionId: string): Promise<ContentType[]> {
    return db.select().from(contentTypes)
      .where(eq(contentTypes.tenantConnectionId, tenantConnectionId))
      .orderBy(contentTypes.name);
  }

  async getTenantAccessGrants(tenantConnectionId: string): Promise<TenantAccessGrant[]> {
    return db.select().from(tenantAccessGrants)
      .where(and(
        eq(tenantAccessGrants.tenantConnectionId, tenantConnectionId),
        eq(tenantAccessGrants.status, "ACTIVE"),
      ))
      .orderBy(desc(tenantAccessGrants.createdAt));
  }

  async getActiveTenantAccessGrant(tenantConnectionId: string, organizationId: string): Promise<TenantAccessGrant | undefined> {
    const [result] = await db.select().from(tenantAccessGrants)
      .where(and(
        eq(tenantAccessGrants.tenantConnectionId, tenantConnectionId),
        eq(tenantAccessGrants.grantedOrganizationId, organizationId),
        eq(tenantAccessGrants.status, "ACTIVE"),
      ))
      .limit(1);
    return result;
  }

  async createTenantAccessGrant(data: InsertTenantAccessGrant): Promise<TenantAccessGrant> {
    const [result] = await db.insert(tenantAccessGrants)
      .values(data)
      .onConflictDoUpdate({
        target: [tenantAccessGrants.tenantConnectionId, tenantAccessGrants.grantedOrganizationId],
        set: {
          status: "ACTIVE",
          grantedBy: data.grantedBy,
          revokedAt: null,
        },
      })
      .returning();
    return result;
  }

  async revokeTenantAccessGrant(id: string, tenantConnectionId: string): Promise<TenantAccessGrant | undefined> {
    const [result] = await db.update(tenantAccessGrants)
      .set({ status: "REVOKED", revokedAt: new Date() })
      .where(and(
        eq(tenantAccessGrants.id, id),
        eq(tenantAccessGrants.tenantConnectionId, tenantConnectionId),
      ))
      .returning();
    return result;
  }

  async getGrantedTenantConnectionIds(organizationId: string): Promise<string[]> {
    const grants = await db.select({ tenantConnectionId: tenantAccessGrants.tenantConnectionId })
      .from(tenantAccessGrants)
      .where(and(
        eq(tenantAccessGrants.grantedOrganizationId, organizationId),
        eq(tenantAccessGrants.status, "ACTIVE"),
      ));
    return grants.map(g => g.tenantConnectionId);
  }

  async createTenantAccessCode(data: InsertTenantAccessCode): Promise<TenantAccessCode> {
    const [result] = await db.insert(tenantAccessCodes)
      .values(data)
      .returning();
    return result;
  }

  async validateAndRedeemAccessCode(code: string, organizationId: string): Promise<{ grant: TenantAccessGrant; tenantConnection: TenantConnection } | null> {
    return await db.transaction(async (tx) => {
      const [redeemed] = await tx.update(tenantAccessCodes)
        .set({ used: true, usedByOrganizationId: organizationId })
        .where(and(
          eq(tenantAccessCodes.code, code),
          eq(tenantAccessCodes.used, false),
          gt(tenantAccessCodes.expiresAt, new Date()),
        ))
        .returning();

      if (!redeemed) return null;

      const [grant] = await tx.insert(tenantAccessGrants)
        .values({
          tenantConnectionId: redeemed.tenantConnectionId,
          grantedOrganizationId: organizationId,
          status: "ACTIVE",
          grantedBy: redeemed.createdBy,
        })
        .returning();

      const conn = await this.getTenantConnection(redeemed.tenantConnectionId);
      if (!conn) return null;

      return { grant, tenantConnection: conn };
    });
  }

  // ── MSP Access Grants ───────────────────────────────────────────────────────

  async createMspAccessGrant(data: InsertMspAccessGrant): Promise<MspAccessGrant> {
    const [created] = await db.insert(mspAccessGrants).values(data).returning();
    return created;
  }

  async getMspAccessGrant(id: string): Promise<MspAccessGrant | undefined> {
    const [grant] = await db.select().from(mspAccessGrants).where(eq(mspAccessGrants.id, id));
    return grant;
  }

  async getMspAccessGrantByCode(code: string): Promise<MspAccessGrant | undefined> {
    const [grant] = await db.select().from(mspAccessGrants)
      .where(and(eq(mspAccessGrants.accessCode, code), eq(mspAccessGrants.status, "PENDING")));
    return grant;
  }

  async getMspAccessGrantsForTenant(tenantConnectionId: string): Promise<MspAccessGrant[]> {
    return db.select().from(mspAccessGrants)
      .where(eq(mspAccessGrants.tenantConnectionId, tenantConnectionId))
      .orderBy(desc(mspAccessGrants.createdAt));
  }

  async getActiveMspGrantForOrg(tenantConnectionId: string, grantedToOrgId: string): Promise<MspAccessGrant | undefined> {
    const [grant] = await db.select().from(mspAccessGrants)
      .where(and(
        eq(mspAccessGrants.tenantConnectionId, tenantConnectionId),
        eq(mspAccessGrants.grantedToOrgId, grantedToOrgId),
        eq(mspAccessGrants.status, "ACTIVE")
      ));
    return grant;
  }

  async getActiveMspGrantsForGrantee(grantedToOrgId: string): Promise<MspAccessGrant[]> {
    return db.select().from(mspAccessGrants)
      .where(and(
        eq(mspAccessGrants.grantedToOrgId, grantedToOrgId),
        eq(mspAccessGrants.status, "ACTIVE")
      ));
  }

  async updateMspAccessGrant(id: string, updates: Partial<MspAccessGrant>): Promise<MspAccessGrant | undefined> {
    const [updated] = await db.update(mspAccessGrants).set(updates).where(eq(mspAccessGrants.id, id)).returning();
    return updated;
  }

  async invalidatePendingMspCodes(tenantConnectionId: string): Promise<void> {
    await db.update(mspAccessGrants)
      .set({ status: "REVOKED", revokedAt: new Date() })
      .where(and(
        eq(mspAccessGrants.tenantConnectionId, tenantConnectionId),
        eq(mspAccessGrants.status, "PENDING")
      ));
  }

  async getTenantEncryptionKey(tenantConnectionId: string): Promise<TenantEncryptionKey | undefined> {
    const [key] = await db.select().from(tenantEncryptionKeys)
      .where(eq(tenantEncryptionKeys.tenantConnectionId, tenantConnectionId));
    return key;
  }

  async upsertTenantEncryptionKey(data: InsertTenantEncryptionKey): Promise<TenantEncryptionKey> {
    const [result] = await db.insert(tenantEncryptionKeys)
      .values(data)
      .onConflictDoUpdate({
        target: [tenantEncryptionKeys.tenantConnectionId],
        set: { encryptedKey: data.encryptedKey },
      })
      .returning();
    return result;
  }

  async deleteTenantEncryptionKey(tenantConnectionId: string): Promise<void> {
    await db.delete(tenantEncryptionKeys)
      .where(eq(tenantEncryptionKeys.tenantConnectionId, tenantConnectionId));
  }

  async purgeOnedriveInventory(tenantConnectionId: string): Promise<number> {
    const result = await db.delete(onedriveInventory)
      .where(eq(onedriveInventory.tenantConnectionId, tenantConnectionId))
      .returning({ id: onedriveInventory.id });
    return result.length;
  }

  async purgeTeamsRecordings(tenantConnectionId: string): Promise<number> {
    const recordings = await db.delete(teamsRecordings)
      .where(eq(teamsRecordings.tenantConnectionId, tenantConnectionId))
      .returning({ id: teamsRecordings.id });
    await db.delete(teamsDiscoveryRuns)
      .where(eq(teamsDiscoveryRuns.tenantConnectionId, tenantConnectionId));
    return recordings.length;
  }

  async purgeTeamsInventory(tenantConnectionId: string): Promise<number> {
    const channels = await db.delete(channelsInventory)
      .where(eq(channelsInventory.tenantConnectionId, tenantConnectionId))
      .returning({ id: channelsInventory.id });
    const teams = await db.delete(teamsInventory)
      .where(eq(teamsInventory.tenantConnectionId, tenantConnectionId))
      .returning({ id: teamsInventory.id });
    return teams.length + channels.length;
  }

  async purgeWorkspaceTelemetry(tenantConnectionId: string): Promise<number> {
    const result = await db.delete(workspaceTelemetry)
      .where(eq(workspaceTelemetry.tenantConnectionId, tenantConnectionId))
      .returning({ id: workspaceTelemetry.id });
    return result.length;
  }

  async purgeSpeData(tenantConnectionId: string): Promise<number> {
    const containers = await db.select({ id: speContainers.id })
      .from(speContainers)
      .where(eq(speContainers.tenantConnectionId, tenantConnectionId));
    if (containers.length > 0) {
      const containerIds = containers.map(c => c.id);
      await db.delete(speContainerUsage)
        .where(inArray(speContainerUsage.containerId, containerIds));
    }
    const deletedContainers = await db.delete(speContainers)
      .where(eq(speContainers.tenantConnectionId, tenantConnectionId))
      .returning({ id: speContainers.id });
    const deletedTypes = await db.delete(speContainerTypes)
      .where(eq(speContainerTypes.tenantConnectionId, tenantConnectionId))
      .returning({ id: speContainerTypes.id });
    return deletedContainers.length + deletedTypes.length;
  }

  async countOnedriveInventory(tenantConnectionId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(onedriveInventory)
      .where(eq(onedriveInventory.tenantConnectionId, tenantConnectionId));
    return result?.count ?? 0;
  }

  async countTeamsRecordings(tenantConnectionId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(teamsRecordings)
      .where(eq(teamsRecordings.tenantConnectionId, tenantConnectionId));
    return result?.count ?? 0;
  }

  async countTeamsInventory(tenantConnectionId: string): Promise<number> {
    const [teams] = await db.select({ count: sql<number>`count(*)::int` })
      .from(teamsInventory)
      .where(eq(teamsInventory.tenantConnectionId, tenantConnectionId));
    const [channels] = await db.select({ count: sql<number>`count(*)::int` })
      .from(channelsInventory)
      .where(eq(channelsInventory.tenantConnectionId, tenantConnectionId));
    return (teams?.count ?? 0) + (channels?.count ?? 0);
  }

  async countWorkspaceTelemetry(tenantConnectionId: string): Promise<number> {
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(workspaceTelemetry)
      .where(eq(workspaceTelemetry.tenantConnectionId, tenantConnectionId));
    return result?.count ?? 0;
  }

  async countSpeData(tenantConnectionId: string): Promise<number> {
    const [containers] = await db.select({ count: sql<number>`count(*)::int` })
      .from(speContainers)
      .where(eq(speContainers.tenantConnectionId, tenantConnectionId));
    const [types] = await db.select({ count: sql<number>`count(*)::int` })
      .from(speContainerTypes)
      .where(eq(speContainerTypes.tenantConnectionId, tenantConnectionId));
    return (containers?.count ?? 0) + (types?.count ?? 0);
  }
}

export const storage = new DatabaseStorage();
