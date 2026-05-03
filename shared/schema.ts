import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, unique, bigint, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const workspaces = pgTable("workspaces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  displayName: text("display_name").notNull(),
  type: text("type").notNull(), // TEAM_SITE, COMMUNICATION_SITE, HUB_SITE
  teamsConnected: boolean("teams_connected").notNull().default(false),
  projectType: text("project_type").notNull().default("GENERAL"), // DEAL, PORTCO, GENERAL
  sensitivity: text("sensitivity").notNull().default("INTERNAL"), // PUBLIC, INTERNAL, CONFIDENTIAL, HIGHLY_CONFIDENTIAL
  retentionPolicy: text("retention_policy").notNull().default("Default 7 Year"),
  metadataStatus: text("metadata_status").notNull().default("MISSING_REQUIRED"), // COMPLETE, MISSING_REQUIRED
  copilotReady: boolean("copilot_ready").notNull().default(false),
  owners: integer("owners").notNull().default(1),
  size: text("size").notNull().default("0 MB"),
  usage: text("usage").notNull().default("Low"), // Low, Medium, High, Very High
  lastActive: text("last_active").notNull().default("Never"),
  externalSharing: boolean("external_sharing").notNull().default(false),
  department: text("department"),
  costCenter: text("cost_center"),
  projectCode: text("project_code"),
  m365ObjectId: text("m365_object_id").default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id"),
  siteUrl: text("site_url"),
  description: text("description"),
  ownerDisplayName: text("owner_display_name"),
  ownerPrincipalName: text("owner_principal_name"),
  template: text("template"),
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }),
  storageAllocatedBytes: bigint("storage_allocated_bytes", { mode: "number" }),
  lastActivityDate: text("last_activity_date"),
  lastContentModifiedDate: text("last_content_modified_date"),
  fileCount: integer("file_count"),
  activeFileCount: integer("active_file_count"),
  pageViewCount: integer("page_view_count"),
  visitedPageCount: integer("visited_page_count"),
  sharingCapability: text("sharing_capability"),
  lockState: text("lock_state"),
  isHubSite: boolean("is_hub_site"),
  hubSiteId: text("hub_site_id"),
  parentHubSiteId: text("parent_hub_site_id"),
  sensitivityLabelId: text("sensitivity_label_id"),
  retentionLabelId: text("retention_label_id"),
  rootWebTemplate: text("root_web_template"),
  isArchived: boolean("is_archived").default(false),
  isDeleted: boolean("is_deleted").default(false),
  lifecycleState: text("lifecycle_state").default("Active"),
  archiveReason: text("archive_reason"),
  archivedAt: timestamp("archived_at"),
  archivedBy: text("archived_by"),
  siteCreatedDate: text("site_created_date"),
  reportRefreshDate: text("report_refresh_date"),
  propertyBag: jsonb("property_bag").$type<Record<string, string>>(),
  siteOwners: jsonb("site_owners").$type<Array<{ id?: string; displayName: string; mail?: string; userPrincipalName?: string }>>(),
  siteMembers: jsonb("site_members").$type<Array<{ id?: string; displayName: string; mail?: string; userPrincipalName?: string }>>(),
  customFields: jsonb("custom_fields").$type<Record<string, any>>(),
  spoSyncHash: text("spo_sync_hash"),
  localHash: text("local_hash"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
});

export const LIFECYCLE_STATES = ["Active", "Archived", "PendingArchive", "PendingRestore"] as const;
export type LifecycleState = typeof LIFECYCLE_STATES[number];

export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspaces.$inferSelect;

export const provisioningRequests = pgTable("provisioning_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"),
  workspaceName: text("workspace_name").notNull(),
  workspaceType: text("workspace_type").notNull(),
  projectType: text("project_type").notNull().default("DEAL"),
  sensitivity: text("sensitivity").notNull().default("HIGHLY_CONFIDENTIAL"),
  externalSharing: boolean("external_sharing").notNull().default(false),
  siteOwners: jsonb("site_owners").$type<Array<{ displayName: string; mail?: string; userPrincipalName?: string }>>().notNull().default(sql`'[]'::jsonb`),
  status: text("status").notNull().default("PENDING"), // PENDING, APPROVED, PROVISIONED, REJECTED, FAILED
  requestedBy: text("requested_by").notNull().default("admin@synozur.demo"),
  governedName: text("governed_name").notNull(),
  tenantConnectionId: varchar("tenant_connection_id"),
  provisionedSiteUrl: text("provisioned_site_url"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProvisioningRequestSchema = createInsertSchema(provisioningRequests).omit({
  id: true,
  createdAt: true,
  status: true,
  requestedBy: true,
  provisionedSiteUrl: true,
  errorMessage: true,
}).extend({
  siteOwners: z.array(z.object({
    displayName: z.string().min(1),
    mail: z.string().optional(),
    userPrincipalName: z.string().optional(),
  })).min(2, "At least two owners are required"),
  governedName: z.string().refine(
    (val) => val.startsWith("DEAL-") || val.startsWith("PORTCO-") || val.startsWith("GEN-"),
    { message: "Governed name must start with DEAL-, PORTCO-, or GEN-" }
  ),
});

export type InsertProvisioningRequest = z.infer<typeof insertProvisioningRequestSchema>;
export type ProvisioningRequest = typeof provisioningRequests.$inferSelect;

export const policyOutcomes = pgTable("policy_outcomes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: text("name").notNull(),
  key: text("key").notNull(),
  description: text("description"),
  builtIn: boolean("built_in").notNull().default(false),
  workspaceField: text("workspace_field"),
  propertyBagKey: text("property_bag_key"),
  showAsColumn: boolean("show_as_column").notNull().default(true),
  showAsFilter: boolean("show_as_filter").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPolicyOutcomeSchema = createInsertSchema(policyOutcomes).omit({
  id: true,
  createdAt: true,
});

export type InsertPolicyOutcome = z.infer<typeof insertPolicyOutcomeSchema>;
export type PolicyOutcome = typeof policyOutcomes.$inferSelect;

export const BUILT_IN_OUTCOMES = [
  { key: "copilot_eligible", name: "Copilot Eligible", description: "Determines whether a workspace meets all governance criteria for Microsoft 365 Copilot eligibility.", workspaceField: "copilotReady", propertyBagKey: "CopilotReady", sortOrder: 0 },
  { key: "external_sharing", name: "External Sharing Approved", description: "Controls whether a workspace is approved for external sharing based on governance policy.", workspaceField: null, propertyBagKey: "ExternalSharingApproved", sortOrder: 1 },
  { key: "pii_approved", name: "PII Approved", description: "Validates that a workspace meets requirements for storing personally identifiable information.", workspaceField: null, propertyBagKey: "PIIApproved", sortOrder: 2 },
  { key: "sensitive_data", name: "Sensitive Data Approved", description: "Validates that a workspace meets requirements for handling classified or sensitive data.", workspaceField: null, propertyBagKey: "SensitiveDataApproved", sortOrder: 3 },
  { key: "general_compliance", name: "General Compliance", description: "General governance compliance check — informational only, does not update workspace fields.", workspaceField: null, propertyBagKey: null, sortOrder: 4 },
] as const;

export const governancePolicies = pgTable("governance_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  policyType: text("policy_type").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  rules: jsonb("rules").notNull().default(sql`'[]'::jsonb`),
  outcomeId: varchar("outcome_id"),
  propertyBagKey: text("property_bag_key"),
  propertyBagValueFormat: text("property_bag_value_format").default("PASS_FAIL"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGovernancePolicySchema = createInsertSchema(governancePolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGovernancePolicy = z.infer<typeof insertGovernancePolicySchema>;
export type GovernancePolicy = typeof governancePolicies.$inferSelect;

export const copilotRules = pgTable("copilot_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  policyId: varchar("policy_id"),
  ruleType: text("rule_type"), // SENSITIVITY_LABEL_REQUIRED, DEPARTMENT_REQUIRED, etc.
  ruleName: text("rule_name").notNull(),
  ruleResult: text("rule_result").notNull(), // PASS, FAIL
  ruleDescription: text("rule_description").notNull(),
});

export const insertCopilotRuleSchema = createInsertSchema(copilotRules).omit({
  id: true,
});

export type InsertCopilotRule = z.infer<typeof insertCopilotRuleSchema>;
export type CopilotRule = typeof copilotRules.$inferSelect;

export type PolicyRuleDefinition = {
  ruleType: string;
  label: string;
  description: string;
  enabled: boolean;
  config?: Record<string, unknown>;
};

export const tenantConnections = pgTable("tenant_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull(),
  tenantName: text("tenant_name").notNull(),
  domain: text("domain").notNull(),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  organizationId: text("organization_id"),
  ownershipType: text("ownership_type").notNull().default("MSP"),
  installMode: text("install_mode").notNull().default("MSP"),
  status: text("status").notNull().default("PENDING"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: text("last_sync_status"),
  lastSyncSiteCount: integer("last_sync_site_count"),
  consentGranted: boolean("consent_granted").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
  dataMaskingEnabled: boolean("data_masking_enabled").notNull().default(false),
  onedriveInventoryEnabled: boolean("onedrive_inventory_enabled").notNull().default(false),
  recordingsDiscoveryEnabled: boolean("recordings_discovery_enabled").notNull().default(false),
  teamsDiscoveryEnabled: boolean("teams_discovery_enabled").notNull().default(false),
  telemetryEnabled: boolean("telemetry_enabled").notNull().default(false),
  speDiscoveryEnabled: boolean("spe_discovery_enabled").notNull().default(false),
  contentGovernanceEnabled: boolean("content_governance_enabled").notNull().default(false),
  licensingEnabled: boolean("licensing_enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantConnectionSchema = createInsertSchema(tenantConnections).omit({
  id: true,
  createdAt: true,
  lastSyncAt: true,
  lastSyncStatus: true,
  lastSyncSiteCount: true,
});

export type InsertTenantConnection = z.infer<typeof insertTenantConnectionSchema>;
export type TenantConnection = typeof tenantConnections.$inferSelect;

export const mspAccessGrants = pgTable("msp_access_grants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  grantingOrgId: text("granting_org_id").notNull(),
  grantedToOrgId: text("granted_to_org_id"),
  accessCode: text("access_code").notNull(),
  codeExpiresAt: timestamp("code_expires_at").notNull(),
  status: text("status").notNull().default("PENDING"),
  grantedAt: timestamp("granted_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMspAccessGrantSchema = createInsertSchema(mspAccessGrants).omit({
  id: true,
  createdAt: true,
  grantedAt: true,
  revokedAt: true,
});

export type InsertMspAccessGrant = z.infer<typeof insertMspAccessGrantSchema>;
export type MspAccessGrant = typeof mspAccessGrants.$inferSelect;

export const tenantDepartments = pgTable("tenant_departments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantDepartmentSchema = createInsertSchema(tenantDepartments).omit({
  id: true,
  createdAt: true,
});

export type InsertTenantDepartment = z.infer<typeof insertTenantDepartmentSchema>;
export type TenantDepartment = typeof tenantDepartments.$inferSelect;

export const METADATA_CATEGORIES = [
  "department",
  "cost_center",
  "business_unit",
  "region",
  "project_code",
] as const;
export type MetadataCategory = typeof METADATA_CATEGORIES[number];

export const tenantDataDictionaries = pgTable("tenant_data_dictionaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull(),
  category: text("category").notNull(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantDataDictionarySchema = createInsertSchema(tenantDataDictionaries).omit({
  id: true,
  createdAt: true,
});

export type InsertTenantDataDictionary = z.infer<typeof insertTenantDataDictionarySchema>;
export type TenantDataDictionary = typeof tenantDataDictionaries.$inferSelect;

export const sensitivityLabels = pgTable("sensitivity_labels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull(),
  labelId: text("label_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  tooltip: text("tooltip"),
  sensitivity: integer("sensitivity"),
  isActive: boolean("is_active").notNull().default(true),
  contentFormats: text("content_formats").array(),
  hasProtection: boolean("has_protection").notNull().default(false),
  parentLabelId: text("parent_label_id"),
  appliesToGroupsSites: boolean("applies_to_groups_sites").notNull().default(false),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_label").on(table.tenantId, table.labelId),
]);

export const insertSensitivityLabelSchema = createInsertSchema(sensitivityLabels).omit({
  id: true,
  syncedAt: true,
});

export type InsertSensitivityLabel = z.infer<typeof insertSensitivityLabelSchema>;
export type SensitivityLabel = typeof sensitivityLabels.$inferSelect;

export const retentionLabels = pgTable("retention_labels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull(),
  labelId: text("label_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  retentionDuration: text("retention_duration"),
  retentionAction: text("retention_action"),
  behaviorDuringRetentionPeriod: text("behavior_during_retention_period"),
  actionAfterRetentionPeriod: text("action_after_retention_period"),
  isActive: boolean("is_active").notNull().default(true),
  isRecordLabel: boolean("is_record_label").notNull().default(false),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_retention_label").on(table.tenantId, table.labelId),
]);

export const insertRetentionLabelSchema = createInsertSchema(retentionLabels).omit({
  id: true,
  syncedAt: true,
});

export type InsertRetentionLabel = z.infer<typeof insertRetentionLabelSchema>;
export type RetentionLabel = typeof retentionLabels.$inferSelect;

export const FEATURE_TOGGLES = {
  onedriveInventory: "onedriveInventoryEnabled",
  recordingsDiscovery: "recordingsDiscoveryEnabled",
  teamsDiscovery: "teamsDiscoveryEnabled",
  telemetry: "telemetryEnabled",
  speDiscovery: "speDiscoveryEnabled",
  contentGovernance: "contentGovernanceEnabled",
  licensing: "licensingEnabled",
} as const;

export type FeatureToggleKey = keyof typeof FEATURE_TOGGLES;
export type FeatureToggleColumn = typeof FEATURE_TOGGLES[FeatureToggleKey];

export const FEATURE_TOGGLE_LABELS: Record<FeatureToggleKey, string> = {
  onedriveInventory: "OneDrive Inventory",
  recordingsDiscovery: "Meeting Recordings Discovery",
  teamsDiscovery: "Teams & Channels Discovery",
  telemetry: "Workspace Telemetry",
  speDiscovery: "SPE Container Discovery",
  contentGovernance: "Content Governance Reporting",
  licensing: "Licensing Reporting",
};

export const SERVICE_PLANS = ["TRIAL", "STANDARD", "PROFESSIONAL", "ENTERPRISE"] as const;
export type ServicePlanTier = typeof SERVICE_PLANS[number];

export const PLAN_FEATURES = {
  TRIAL: {
    label: "Trial",
    m365WriteBack: false,
    ownershipManagement: false,
    provisioning: true,
    inventorySync: true,
    copilotReadiness: false,
    lifecycleAutomation: false,
    selfServicePortal: false,
    advancedReporting: false,
    dataMasking: false,
    csvExport: false,
    mspAccess: false,
    lifecycleReview: false,
    contentGovernanceReporting: false as false | "readonly" | "full",
    sharingLinkManagement: false as false | "readonly" | "full",
    governanceReviews: false as false | "manual" | "full",
    licensingDashboard: false as false | "readonly" | "full",
    licensingOptimization: false as false | "basic" | "full",
    emailContentStorageReport: false,
    iaAssessment: false,
    contentIntensityHeatmap: false,
    copilotPromptIntelligence: false,
    m365OverviewReport: false,
    trendRetentionDays: 0,
    maxUsers: 25,
    maxTenants: 1,
    maxSites: 1000,
    auditRetentionDays: 30,
  },
  STANDARD: {
    label: "Standard",
    m365WriteBack: true,
    ownershipManagement: true,
    provisioning: true,
    inventorySync: true,
    copilotReadiness: false,
    lifecycleAutomation: false,
    selfServicePortal: false,
    advancedReporting: false,
    dataMasking: false,
    csvExport: true,
    mspAccess: false,
    lifecycleReview: true,
    contentGovernanceReporting: "readonly" as false | "readonly" | "full",
    sharingLinkManagement: false as false | "readonly" | "full",
    governanceReviews: false as false | "manual" | "full",
    licensingDashboard: "readonly" as false | "readonly" | "full",
    licensingOptimization: false as false | "basic" | "full",
    emailContentStorageReport: false,
    iaAssessment: false,
    contentIntensityHeatmap: false,
    copilotPromptIntelligence: false,
    m365OverviewReport: false,
    trendRetentionDays: 0,
    maxUsers: 500,
    maxTenants: 2,
    maxSites: -1,
    auditRetentionDays: 365,
  },
  PROFESSIONAL: {
    label: "Professional",
    m365WriteBack: true,
    ownershipManagement: true,
    provisioning: true,
    inventorySync: true,
    copilotReadiness: true,
    lifecycleAutomation: true,
    selfServicePortal: true,
    advancedReporting: false,
    dataMasking: true,
    csvExport: true,
    mspAccess: true,
    lifecycleReview: true,
    contentGovernanceReporting: "full" as false | "readonly" | "full",
    sharingLinkManagement: "readonly" as false | "readonly" | "full",
    governanceReviews: "manual" as false | "manual" | "full",
    licensingDashboard: "full" as false | "readonly" | "full",
    licensingOptimization: "basic" as false | "basic" | "full",
    emailContentStorageReport: false,
    iaAssessment: false,
    contentIntensityHeatmap: false,
    copilotPromptIntelligence: true,
    m365OverviewReport: false,
    trendRetentionDays: 30,
    maxUsers: 5000,
    maxTenants: 10,
    maxSites: -1,
    auditRetentionDays: 365 * 7,
  },
  ENTERPRISE: {
    label: "Unlimited Enterprise",
    m365WriteBack: true,
    ownershipManagement: true,
    provisioning: true,
    inventorySync: true,
    copilotReadiness: true,
    lifecycleAutomation: true,
    selfServicePortal: true,
    advancedReporting: true,
    dataMasking: true,
    csvExport: true,
    mspAccess: true,
    lifecycleReview: true,
    contentGovernanceReporting: "full" as false | "readonly" | "full",
    sharingLinkManagement: "full" as false | "readonly" | "full",
    governanceReviews: "full" as false | "manual" | "full",
    licensingDashboard: "full" as false | "readonly" | "full",
    licensingOptimization: "full" as false | "basic" | "full",
    emailContentStorageReport: true,
    iaAssessment: true,
    contentIntensityHeatmap: true,
    copilotPromptIntelligence: true,
    m365OverviewReport: true,
    trendRetentionDays: -1,
    maxUsers: -1,
    maxTenants: -1,
    maxSites: -1,
    auditRetentionDays: -1,
  },
} as const;

export type PlanFeatures = typeof PLAN_FEATURES[ServicePlanTier];

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  servicePlan: text("service_plan").notNull().default("TRIAL"),
  planStartedAt: timestamp("plan_started_at").defaultNow(),
  supportEmail: text("support_email"),
  azureTenantId: text("azure_tenant_id"),
  enforceSso: boolean("enforce_sso").default(false),
  allowLocalAuth: boolean("allow_local_auth").default(true),
  allowedDomains: text("allowed_domains").array(),
  inviteOnly: boolean("invite_only").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
});

export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

export const ZENITH_ROLES = {
  PLATFORM_OWNER: 'platform_owner',
  TENANT_ADMIN: 'tenant_admin',
  GOVERNANCE_ADMIN: 'governance_admin',
  OPERATOR: 'operator',
  VIEWER: 'viewer',
  AUDITOR: 'read_only_auditor',
} as const;

export type ZenithRole = typeof ZENITH_ROLES[keyof typeof ZENITH_ROLES];

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name"),
  role: text("role").notNull().default("viewer"),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: 'cascade' }),
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationToken: text("verification_token"),
  resetToken: text("reset_token"),
  resetTokenExpiry: timestamp("reset_token_expiry"),
  authProvider: text("auth_provider").default("local"),
  azureObjectId: text("azure_object_id"),
  azureTenantId: text("azure_tenant_id"),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const organizationUsers = pgTable("organization_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  role: text("role").notNull().default("viewer"),
  isPrimary: boolean("is_primary").notNull().default(false),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  unique("uq_user_org").on(table.userId, table.organizationId),
]);

export const insertOrganizationUserSchema = createInsertSchema(organizationUsers).omit({
  id: true,
  joinedAt: true,
});

export type InsertOrganizationUser = z.infer<typeof insertOrganizationUserSchema>;
export type OrganizationUser = typeof organizationUsers.$inferSelect;

export const graphTokens = pgTable("graph_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  service: varchar("service").notNull().default('default'),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at"),
  scopes: jsonb("scopes").$type<string[]>(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGraphTokenSchema = createInsertSchema(graphTokens).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGraphToken = z.infer<typeof insertGraphTokenSchema>;
export type GraphToken = typeof graphTokens.$inferSelect;

// Persistent app-only Graph token cache. Keyed by tenantId, clientId, and
// OAuth scope so the same app registration can hold separate tokens for Graph
// and SharePoint. Access tokens are encrypted at rest.
export const graphAppTokenCache = pgTable("graph_app_token_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull(),
  clientId: text("client_id").notNull(),
  scope: text("scope").notNull(),
  accessToken: text("access_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("uq_app_token_cache_key").on(table.tenantId, table.clientId, table.scope),
]);

export const insertGraphAppTokenCacheSchema = createInsertSchema(graphAppTokenCache).omit({
  id: true,
  updatedAt: true,
});

export type InsertGraphAppTokenCache = z.infer<typeof insertGraphAppTokenCacheSchema>;
export type GraphAppTokenCache = typeof graphAppTokenCache.$inferSelect;

export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  userEmail: text("user_email"),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: varchar("resource_id"),
  organizationId: varchar("organization_id"),
  tenantConnectionId: varchar("tenant_connection_id"),
  details: jsonb("details").$type<Record<string, any>>(),
  result: text("result").notNull().default("SUCCESS"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLog.$inferSelect;

export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull(),
  fieldName: text("field_name").notNull(),
  fieldLabel: text("field_label").notNull(),
  fieldType: text("field_type").notNull(),
  options: jsonb("options").$type<string[]>(),
  defaultValue: text("default_value"),
  required: boolean("required").notNull().default(false),
  filterable: boolean("filterable").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_field_name").on(table.tenantId, table.fieldName),
]);

export const insertCustomFieldDefinitionSchema = createInsertSchema(customFieldDefinitions).omit({
  id: true,
  createdAt: true,
});

export type InsertCustomFieldDefinition = z.infer<typeof insertCustomFieldDefinitionSchema>;
export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;

export const documentLibraries = pgTable("document_libraries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  m365ListId: text("m365_list_id").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  webUrl: text("web_url"),
  template: text("template"),
  itemCount: integer("item_count").default(0),
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }),
  sensitivityLabelId: text("sensitivity_label_id"),
  isDefaultDocLib: boolean("is_default_doc_lib").default(false),
  hidden: boolean("hidden").default(false),
  lastModifiedAt: text("last_modified_at"),
  createdGraphAt: text("created_graph_at"),
  lastSyncAt: timestamp("last_sync_at"),
  flaggedLargeItems: boolean("flagged_large_items").default(false),
  flaggedVersionSprawl: boolean("flagged_version_sprawl").default(false),
  m365DriveId: text("m365_drive_id"),
  maxFolderDepth: integer("max_folder_depth"),
  totalFolderCount: integer("total_folder_count"),
  customViewCount: integer("custom_view_count"),
  totalViewCount: integer("total_view_count"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_workspace_list").on(table.workspaceId, table.m365ListId),
]);

export const insertDocumentLibrarySchema = createInsertSchema(documentLibraries).omit({
  id: true,
  createdAt: true,
});

export type InsertDocumentLibrary = z.infer<typeof insertDocumentLibrarySchema>;
export type DocumentLibrary = typeof documentLibraries.$inferSelect;

export const domainBlocklist = pgTable("domain_blocklist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  domain: text("domain").notNull().unique(),
  reason: text("reason"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDomainBlocklistSchema = createInsertSchema(domainBlocklist).omit({
  id: true,
  createdAt: true,
});

export type InsertDomainBlocklist = z.infer<typeof insertDomainBlocklistSchema>;
export type DomainBlocklist = typeof domainBlocklist.$inferSelect;

// ── SharePoint Embedded ─────────────────────────────────────────────────────
export const speContainerTypes = pgTable("spe_container_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  containerTypeId: text("container_type_id"),
  displayName: text("display_name").notNull(),
  description: text("description"),
  azureAppId: text("azure_app_id"),
  owningTenantId: text("owning_tenant_id"),
  defaultStorageLimitBytes: bigint("default_storage_limit_bytes", { mode: "number" }),
  containerCount: integer("container_count").default(0),
  status: text("status").notNull().default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_container_type").on(table.tenantConnectionId, table.containerTypeId),
]);

export const insertSpeContainerTypeSchema = createInsertSchema(speContainerTypes).omit({
  id: true,
  createdAt: true,
});
export type InsertSpeContainerType = z.infer<typeof insertSpeContainerTypeSchema>;
export type SpeContainerType = typeof speContainerTypes.$inferSelect;

export const speContainers = pgTable("spe_containers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  containerTypeId: varchar("container_type_id"),
  m365ContainerId: text("m365_container_id"),
  displayName: text("display_name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("ACTIVE"),
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }),
  storageAllocatedBytes: bigint("storage_allocated_bytes", { mode: "number" }),
  fileCount: integer("file_count"),
  activeFileCount: integer("active_file_count"),
  lastActivityDate: text("last_activity_date"),
  sensitivityLabelId: text("sensitivity_label_id"),
  sensitivityLabel: text("sensitivity_label"),
  retentionLabelId: text("retention_label_id"),
  retentionLabel: text("retention_label"),
  sharingCapability: text("sharing_capability"),
  externalSharing: boolean("external_sharing").default(false),
  ownerDisplayName: text("owner_display_name"),
  ownerPrincipalName: text("owner_principal_name"),
  permissions: text("permissions").default("Inherited"),
  containerCreatedDate: text("container_created_date"),
  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_spe_container").on(table.tenantConnectionId, table.m365ContainerId),
]);

export const insertSpeContainerSchema = createInsertSchema(speContainers).omit({
  id: true,
  createdAt: true,
});
export type InsertSpeContainer = z.infer<typeof insertSpeContainerSchema>;
export type SpeContainer = typeof speContainers.$inferSelect;

export const speContainerUsage = pgTable("spe_container_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  containerId: varchar("container_id").notNull().references(() => speContainers.id, { onDelete: 'cascade' }),
  tenantConnectionId: varchar("tenant_connection_id"),
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }),
  storageTotalBytes: bigint("storage_total_bytes", { mode: "number" }),
  fileCount: integer("file_count"),
  activeFileCount: integer("active_file_count"),
  activeUsers: integer("active_users"),
  apiCallCount: integer("api_call_count"),
  lastActivityDate: text("last_activity_date"),
  snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSpeContainerUsageSchema = createInsertSchema(speContainerUsage).omit({
  id: true,
  createdAt: true,
  snapshotAt: true,
});
export type InsertSpeContainerUsage = z.infer<typeof insertSpeContainerUsageSchema>;
export type SpeContainerUsage = typeof speContainerUsage.$inferSelect;

// ── Platform Settings ────────────────────────────────────────────────────────
// System-level configuration shared across the entire Zenith deployment.
// Planner integration fields (plannerPlanId/plannerBucketId) are stored here
// rather than as environment variables so platform owners can target a
// specific Planner bucket within a shared plan that also contains tickets
// from other Synozur products (Constellation, Vega, etc.).
export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  defaultSignupPlan: text("default_signup_plan").notNull().default("TRIAL"),
  plannerPlanId: text("planner_plan_id"),
  plannerBucketId: text("planner_bucket_id"),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by"),
});

export const insertPlatformSettingsSchema = createInsertSchema(platformSettings).omit({
  id: true,
});

export type InsertPlatformSettings = z.infer<typeof insertPlatformSettingsSchema>;
export type PlatformSettings = typeof platformSettings.$inferSelect;

// ── Teams Recordings Discovery ───────────────────────────────────────────────
// Discovered recording and transcript files from Teams channel SharePoint
// libraries (SHAREPOINT_CHANNEL) and user OneDrive for Business (ONEDRIVE).
export const teamsRecordings = pgTable("teams_recordings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),

  // Meeting context (derived from filename / createdBy; enriched in Phase 3)
  meetingTitle: text("meeting_title"),
  meetingDate: text("meeting_date"),
  organizer: text("organizer"),                   // UPN of file creator / meeting organizer
  organizerDisplayName: text("organizer_display_name"),

  // Storage location discriminator
  storageType: text("storage_type").notNull(),    // SHAREPOINT_CHANNEL | ONEDRIVE

  // Teams / SharePoint channel context (SHAREPOINT_CHANNEL only)
  teamId: text("team_id"),
  teamDisplayName: text("team_display_name"),
  channelId: text("channel_id"),
  channelDisplayName: text("channel_display_name"),
  channelType: text("channel_type"),              // standard | private | shared

  // OneDrive user context (ONEDRIVE only)
  userId: text("user_id"),                        // M365 user object ID
  userDisplayName: text("user_display_name"),
  userPrincipalName: text("user_principal_name"),

  // Drive file identity
  driveId: text("drive_id").notNull(),
  driveItemId: text("drive_item_id").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url"),
  filePath: text("file_path"),
  fileType: text("file_type").notNull(),          // RECORDING | TRANSCRIPT
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  fileCreatedAt: text("file_created_at"),
  fileModifiedAt: text("file_modified_at"),

  // Governance metadata (populated where available from Graph)
  sensitivityLabelId: text("sensitivity_label_id"),
  sensitivityLabelName: text("sensitivity_label_name"),
  retentionLabelName: text("retention_label_name"),
  isShared: boolean("is_shared").default(false),

  // Copilot / AI accessibility (derived at discovery time; Phase 4 refines)
  copilotAccessible: boolean("copilot_accessible"),
  accessibilityBlockers: text("accessibility_blockers").array(),

  // Discovery lifecycle
  lastDiscoveredAt: timestamp("last_discovered_at").defaultNow(),
  discoveryStatus: text("discovery_status").notNull().default("ACTIVE"), // ACTIVE | DELETED | INACCESSIBLE

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_drive_item").on(table.tenantConnectionId, table.driveItemId),
]);

export const insertTeamsRecordingSchema = createInsertSchema(teamsRecordings).omit({
  id: true,
  createdAt: true,
});
export type InsertTeamsRecording = z.infer<typeof insertTeamsRecordingSchema>;
export type TeamsRecording = typeof teamsRecordings.$inferSelect;

// One row per discovery sync run per tenant connection.
export const teamsDiscoveryRuns = pgTable("teams_discovery_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull().default("RUNNING"), // RUNNING | COMPLETED | FAILED | PARTIAL
  recordingsFound: integer("recordings_found").default(0),
  transcriptsFound: integer("transcripts_found").default(0),
  teamsScanned: integer("teams_scanned").default(0),
  channelsScanned: integer("channels_scanned").default(0),
  onedrivesScanned: integer("onedrives_scanned").default(0),
  onedrivesSkipped: integer("onedrives_skipped").default(0),
  errors: jsonb("errors").$type<Array<{ context: string; message: string }>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTeamsDiscoveryRunSchema = createInsertSchema(teamsDiscoveryRuns).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});
export type InsertTeamsDiscoveryRun = z.infer<typeof insertTeamsDiscoveryRunSchema>;
export type TeamsDiscoveryRun = typeof teamsDiscoveryRuns.$inferSelect;

// ── Teams & Channels Inventory ────────────────────────────────────────────────
// Full inventory of all Teams in the tenant, independent of recordings.
export const teamsInventory = pgTable("teams_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),

  teamId: text("team_id").notNull(),                    // M365 group id
  displayName: text("display_name").notNull(),
  description: text("description"),
  mailNickname: text("mail_nickname"),
  visibility: text("visibility"),                        // Public | Private | HiddenMembership
  isArchived: boolean("is_archived").default(false),
  classification: text("classification"),                // e.g. "Confidential" from Azure AD group classification
  createdDateTime: text("created_date_time"),
  renewedDateTime: text("renewed_date_time"),

  // Membership counts
  memberCount: integer("member_count"),
  ownerCount: integer("owner_count"),
  guestCount: integer("guest_count"),

  // SharePoint site backing info
  sharepointSiteUrl: text("sharepoint_site_url"),
  sharepointSiteId: text("sharepoint_site_id"),

  // Sensitivity
  sensitivityLabel: text("sensitivity_label"),

  // Discovery metadata
  lastDiscoveredAt: timestamp("last_discovered_at").defaultNow(),
  discoveryStatus: text("discovery_status").notNull().default("ACTIVE"), // ACTIVE | DELETED

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_team").on(table.tenantConnectionId, table.teamId),
]);

export const insertTeamsInventorySchema = createInsertSchema(teamsInventory).omit({
  id: true,
  createdAt: true,
});
export type InsertTeamsInventory = z.infer<typeof insertTeamsInventorySchema>;
export type TeamsInventoryItem = typeof teamsInventory.$inferSelect;

// Full inventory of all channels across all Teams.
export const channelsInventory = pgTable("channels_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),

  teamId: text("team_id").notNull(),
  channelId: text("channel_id").notNull(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  membershipType: text("membership_type").notNull().default("standard"), // standard | private | shared
  email: text("email"),
  webUrl: text("web_url"),
  createdDateTime: text("created_date_time"),

  // Membership
  memberCount: integer("member_count"),

  // Discovery metadata
  lastDiscoveredAt: timestamp("last_discovered_at").defaultNow(),
  discoveryStatus: text("discovery_status").notNull().default("ACTIVE"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_channel").on(table.tenantConnectionId, table.teamId, table.channelId),
]);

export const insertChannelsInventorySchema = createInsertSchema(channelsInventory).omit({
  id: true,
  createdAt: true,
});
export type InsertChannelsInventory = z.infer<typeof insertChannelsInventorySchema>;
export type ChannelsInventoryItem = typeof channelsInventory.$inferSelect;

// ── OneDrive Inventory ───────────────────────────────────────────────────────
// Full inventory of all OneDrive for Business drives in the tenant.
export const onedriveInventory = pgTable("onedrive_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),

  userId: text("user_id").notNull(),                    // M365 user object ID
  userDisplayName: text("user_display_name"),
  userPrincipalName: text("user_principal_name").notNull(),
  userDepartment: text("user_department"),
  userJobTitle: text("user_job_title"),
  userMail: text("user_mail"),

  // Drive info
  driveId: text("drive_id"),
  driveType: text("drive_type"),                        // business, personal

  // Quota
  quotaTotalBytes: bigint("quota_total_bytes", { mode: "number" }),
  quotaUsedBytes: bigint("quota_used_bytes", { mode: "number" }),
  quotaRemainingBytes: bigint("quota_remaining_bytes", { mode: "number" }),
  quotaState: text("quota_state"),                      // normal | nearing | critical | exceeded

  // Activity
  lastActivityDate: text("last_activity_date"),
  fileCount: integer("file_count"),
  activeFileCount: integer("active_file_count"),

  // Discovery metadata
  lastDiscoveredAt: timestamp("last_discovered_at").defaultNow(),
  discoveryStatus: text("discovery_status").notNull().default("ACTIVE"),

  // Exclusion
  excluded: boolean("excluded").notNull().default(false),
  exclusionReason: text("exclusion_reason"),

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_user_onedrive").on(table.tenantConnectionId, table.userId),
]);

export const insertOnedriveInventorySchema = createInsertSchema(onedriveInventory).omit({
  id: true,
  createdAt: true,
});
export type InsertOnedriveInventory = z.infer<typeof insertOnedriveInventorySchema>;
export type OnedriveInventoryItem = typeof onedriveInventory.$inferSelect;

// ── Workspace Telemetry ──────────────────────────────────────────────────────
// One row per sync snapshot per workspace. Retaining multiple snapshots enables
// growth-trend analysis (storage, file count, content-type drift over time).
export const workspaceTelemetry = pgTable("workspace_telemetry", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  tenantConnectionId: varchar("tenant_connection_id"),

  // ── Storage ──
  storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }),
  storageTotalBytes: bigint("storage_total_bytes", { mode: "number" }),

  // ── Content counts ──
  fileCount: integer("file_count"),
  // folderCount = number of items directly under the drive root (top-level structure proxy)
  folderCount: integer("folder_count"),
  listCount: integer("list_count"),
  documentLibraryCount: integer("document_library_count"),

  // ── Content classification ──
  // Array of { id: string, name: string } — content types defined on this site
  contentTypes: jsonb("content_types").$type<{ id: string; name: string }[]>(),

  // ── Sensitivity / labelling ──
  sensitivityLabel: text("sensitivity_label"),     // e.g. "Highly Confidential"
  sensitivityLabelId: text("sensitivity_label_id"), // M365 label GUID

  // ── Activity ──
  lastActivityDate: timestamp("last_activity_date"),

  snapshotAt: timestamp("snapshot_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkspaceTelemetrySchema = createInsertSchema(workspaceTelemetry).omit({
  id: true,
  createdAt: true,
  snapshotAt: true,
});

export type InsertWorkspaceTelemetry = z.infer<typeof insertWorkspaceTelemetrySchema>;
export type WorkspaceTelemetry = typeof workspaceTelemetry.$inferSelect;

// ── Support Tickets ──────────────────────────────────────────────────────────
export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketNumber: integer("ticket_number").notNull(),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: text("category").notNull(),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: 'set null' }),
  applicationSource: text("application_source").notNull().default("Zenith"),
  plannerTaskId: text("planner_task_id"),
  resolvedAt: timestamp("resolved_at"),
  resolvedBy: varchar("resolved_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`now()`).notNull(),
});

export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  resolvedBy: true,
  assignedTo: true,
  plannerTaskId: true,
});

export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;

export const supportTicketReplies = pgTable("support_ticket_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => supportTickets.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  message: text("message").notNull(),
  isInternal: boolean("is_internal").default(false),
  createdAt: timestamp("created_at").default(sql`now()`).notNull(),
});

export const insertSupportTicketReplySchema = createInsertSchema(supportTicketReplies).omit({
  id: true,
  createdAt: true,
});

export type InsertSupportTicketReply = z.infer<typeof insertSupportTicketReplySchema>;
export type SupportTicketReply = typeof supportTicketReplies.$inferSelect;

// ── Content Types ─────────────────────────────────────────────────────────────
// Stores tenant-level content types synced from Microsoft 365 Graph API.
// Scope: HUB = Content Type Hub, SITE = defined at a site that is not the hub.
// libraryUsageCount / siteUsageCount are rollups maintained from libraryContentTypes.
export const contentTypes = pgTable("content_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  contentTypeId: text("content_type_id").notNull(),
  name: text("name").notNull(),
  group: text("group"),
  description: text("description"),
  isHub: boolean("is_hub").notNull().default(false),
  scope: text("scope").notNull().default("HUB"), // HUB | SITE
  subscribedSiteCount: integer("subscribed_site_count").notNull().default(0),
  libraryUsageCount: integer("library_usage_count").notNull().default(0),
  siteUsageCount: integer("site_usage_count").notNull().default(0),
  syncedAt: timestamp("synced_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_content_type").on(table.tenantConnectionId, table.contentTypeId),
]);

export const insertContentTypeSchema = createInsertSchema(contentTypes).omit({
  id: true,
  syncedAt: true,
});

export type InsertContentType = z.infer<typeof insertContentTypeSchema>;
export type ContentType = typeof contentTypes.$inferSelect;

// ── Information Architecture: per-library inventory ──────────────────────────
// libraryContentTypes: rows are the content types applied to a specific library.
// scope is derived at sync time:
//   HUB     — contentTypeId matches a row in content_types with isHub=true
//   SITE    — isInherited=true but not a hub match (inherited from a site CT)
//   LIBRARY — not inherited (locally defined on the library)
export const libraryContentTypes = pgTable("library_content_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  documentLibraryId: varchar("document_library_id").notNull(),
  contentTypeId: text("content_type_id").notNull(),
  parentContentTypeId: text("parent_content_type_id"),
  name: text("name").notNull(),
  group: text("group"),
  description: text("description"),
  scope: text("scope").notNull().default("LIBRARY"), // HUB | SITE | LIBRARY
  isBuiltIn: boolean("is_built_in").notNull().default(false),
  isInherited: boolean("is_inherited").notNull().default(false),
  hidden: boolean("hidden").notNull().default(false),
  lastSyncAt: timestamp("last_sync_at").defaultNow(),
}, (table) => [
  unique("uq_library_content_type").on(table.documentLibraryId, table.contentTypeId),
]);

export const insertLibraryContentTypeSchema = createInsertSchema(libraryContentTypes).omit({
  id: true,
  lastSyncAt: true,
});

export type InsertLibraryContentType = z.infer<typeof insertLibraryContentTypeSchema>;
export type LibraryContentType = typeof libraryContentTypes.$inferSelect;

// libraryColumns: rows are the columns present on a specific library.
// scope:
//   SITE    — column also exists on the parent site's site-columns (same internal name)
//   LIBRARY — column defined locally on the library
export const libraryColumns = pgTable("library_columns", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  documentLibraryId: varchar("document_library_id").notNull(),
  columnInternalName: text("column_internal_name").notNull(),
  displayName: text("display_name").notNull(),
  columnType: text("column_type").notNull(),
  columnGroup: text("column_group"),
  description: text("description"),
  scope: text("scope").notNull().default("LIBRARY"), // SITE | LIBRARY
  isCustom: boolean("is_custom").notNull().default(false),
  isSyntexManaged: boolean("is_syntex_managed").notNull().default(false),
  isSealed: boolean("is_sealed").notNull().default(false),
  isReadOnly: boolean("is_read_only").notNull().default(false),
  isIndexed: boolean("is_indexed").notNull().default(false),
  isRequired: boolean("is_required").notNull().default(false),
  fillRatePct: integer("fill_rate_pct"),
  fillRateSampleSize: integer("fill_rate_sample_size"),
  lastSyncAt: timestamp("last_sync_at").defaultNow(),
}, (table) => [
  unique("uq_library_column").on(table.documentLibraryId, table.columnInternalName),
]);

export const insertLibraryColumnSchema = createInsertSchema(libraryColumns).omit({
  id: true,
  lastSyncAt: true,
});

export type InsertLibraryColumn = z.infer<typeof insertLibraryColumnSchema>;
export type LibraryColumn = typeof libraryColumns.$inferSelect;

export const tenantAccessGrants = pgTable("tenant_access_grants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull().references(() => tenantConnections.id, { onDelete: 'cascade' }),
  grantedOrganizationId: varchar("granted_organization_id").notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  status: text("status").notNull().default("ACTIVE"),
  grantedBy: varchar("granted_by"),
  createdAt: timestamp("created_at").defaultNow(),
  revokedAt: timestamp("revoked_at"),
}, (table) => [
  unique("uq_tenant_org_grant").on(table.tenantConnectionId, table.grantedOrganizationId),
]);

export const insertTenantAccessGrantSchema = createInsertSchema(tenantAccessGrants).omit({
  id: true,
  createdAt: true,
  revokedAt: true,
});

export type InsertTenantAccessGrant = z.infer<typeof insertTenantAccessGrantSchema>;
export type TenantAccessGrant = typeof tenantAccessGrants.$inferSelect;

export const tenantAccessCodes = pgTable("tenant_access_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull().references(() => tenantConnections.id, { onDelete: 'cascade' }),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").notNull().default(false),
  usedByOrganizationId: varchar("used_by_organization_id"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTenantAccessCodeSchema = createInsertSchema(tenantAccessCodes).omit({
  id: true,
  createdAt: true,
  used: true,
  usedByOrganizationId: true,
});

export type InsertTenantAccessCode = z.infer<typeof insertTenantAccessCodeSchema>;
export type TenantAccessCode = typeof tenantAccessCodes.$inferSelect;

export const tenantEncryptionKeys = pgTable("tenant_encryption_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_encryption_key").on(table.tenantConnectionId),
]);

export const insertTenantEncryptionKeySchema = createInsertSchema(tenantEncryptionKeys).omit({
  id: true,
  createdAt: true,
});

export type InsertTenantEncryptionKey = z.infer<typeof insertTenantEncryptionKeySchema>;
export type TenantEncryptionKey = typeof tenantEncryptionKeys.$inferSelect;

// ── Content Governance ──────────────────────────────────────────────────────

export const contentGovernanceSnapshots = pgTable("content_governance_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  snapshotDate: date("snapshot_date").notNull(),
  totalSharepointSites: integer("total_sharepoint_sites").default(0),
  totalOnedriveAccounts: integer("total_onedrive_accounts").default(0),
  inactiveOnedriveCount: integer("inactive_onedrive_count").default(0),
  unlicensedOnedriveCount: integer("unlicensed_onedrive_count").default(0),
  orphanedSiteCount: integer("orphaned_site_count").default(0),
  sitesMissingLabels: integer("sites_missing_labels").default(0),
  externalSharingSiteCount: integer("external_sharing_site_count").default(0),
  anonymousLinkCount: integer("anonymous_link_count").default(0),
  companyLinkCount: integer("company_link_count").default(0),
  specificPeopleLinkCount: integer("specific_people_link_count").default(0),
  totalStorageUsedBytes: bigint("total_storage_used_bytes", { mode: "number" }).default(0),
  totalOnedriveStorageUsedBytes: bigint("total_onedrive_storage_used_bytes", { mode: "number" }).default(0),
  sitesOverQuotaWarning: integer("sites_over_quota_warning").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_snapshot_date").on(table.tenantConnectionId, table.snapshotDate),
]);

export const insertContentGovernanceSnapshotSchema = createInsertSchema(contentGovernanceSnapshots).omit({
  id: true,
  createdAt: true,
});
export type InsertContentGovernanceSnapshot = z.infer<typeof insertContentGovernanceSnapshotSchema>;
export type ContentGovernanceSnapshot = typeof contentGovernanceSnapshots.$inferSelect;

export const sharingLinksInventory = pgTable("sharing_links_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  resourceType: text("resource_type").notNull(), // SHAREPOINT_SITE, ONEDRIVE
  resourceId: text("resource_id").notNull(),
  resourceName: text("resource_name"),
  itemId: text("item_id"),
  itemName: text("item_name"),
  itemPath: text("item_path"),
  linkId: text("link_id").notNull(),
  linkType: text("link_type").notNull(), // anonymous, organization, specific
  linkScope: text("link_scope"), // read, write, review
  createdBy: text("created_by"),
  createdAtGraph: timestamp("created_at_graph"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  lastAccessedAt: timestamp("last_accessed_at"),
  lastDiscoveredAt: timestamp("last_discovered_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_item_link").on(table.tenantConnectionId, table.resourceId, table.itemId, table.linkId),
]);

export const insertSharingLinkSchema = createInsertSchema(sharingLinksInventory).omit({
  id: true,
  createdAt: true,
});
export type InsertSharingLink = z.infer<typeof insertSharingLinkSchema>;
export type SharingLink = typeof sharingLinksInventory.$inferSelect;

export const sharingLinkDiscoveryRuns = pgTable("sharing_link_discovery_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull().default("RUNNING"), // RUNNING | COMPLETED | FAILED | PARTIAL
  sharePointLinksFound: integer("share_point_links_found").default(0),
  oneDriveLinksFound: integer("one_drive_links_found").default(0),
  sitesScanned: integer("sites_scanned").default(0),
  usersScanned: integer("users_scanned").default(0),
  itemsScanned: integer("items_scanned").default(0),
  errors: jsonb("errors").$type<Array<{ context: string; message: string }>>(),
  createdAt: timestamp("created_at").defaultNow(),
  // Resumability cursor + progress fields
  phase: text("phase"), // SHAREPOINT | ONEDRIVE | DONE
  lastProcessedSpoSiteId: varchar("last_processed_spo_site_id"),
  lastProcessedOneDriveId: varchar("last_processed_onedrive_id"),
  resumable: boolean("resumable").notNull().default(false),
  itemsTotal: integer("items_total"),
  itemsProcessed: integer("items_processed"),
  progressLabel: text("progress_label"),
});

export const insertSharingLinkDiscoveryRunSchema = createInsertSchema(sharingLinkDiscoveryRuns).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});
export type InsertSharingLinkDiscoveryRun = z.infer<typeof insertSharingLinkDiscoveryRunSchema>;
export type SharingLinkDiscoveryRun = typeof sharingLinkDiscoveryRuns.$inferSelect;

export const governanceReviewTasks = pgTable("governance_review_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  reviewType: text("review_type").notNull(), // SHARING_REVIEW, OWNERSHIP_REVIEW, STORAGE_REVIEW, INACTIVE_REVIEW
  triggerType: text("trigger_type").notNull().default("MANUAL"), // MANUAL, THRESHOLD, SCHEDULED
  triggerConfig: jsonb("trigger_config").$type<Record<string, any>>(),
  status: text("status").notNull().default("PENDING"), // PENDING, IN_PROGRESS, COMPLETED, CANCELLED
  targetResourceType: text("target_resource_type").notNull().default("ALL"), // SHAREPOINT_SITE, ONEDRIVE, ALL
  targetResourceIds: text("target_resource_ids").array(),
  findingsCount: integer("findings_count").default(0),
  resolvedCount: integer("resolved_count").default(0),
  assignedTo: varchar("assigned_to"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGovernanceReviewTaskSchema = createInsertSchema(governanceReviewTasks).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  findingsCount: true,
  resolvedCount: true,
});
export type InsertGovernanceReviewTask = z.infer<typeof insertGovernanceReviewTaskSchema>;
export type GovernanceReviewTask = typeof governanceReviewTasks.$inferSelect;

export const governanceReviewFindings = pgTable("governance_review_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  reviewTaskId: varchar("review_task_id").notNull().references(() => governanceReviewTasks.id, { onDelete: 'cascade' }),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  resourceName: text("resource_name"),
  findingType: text("finding_type").notNull(), // ANONYMOUS_LINK, EXPIRED_OWNER, OVER_QUOTA, INACTIVE_90D, etc.
  severity: text("severity").notNull().default("MEDIUM"), // HIGH, MEDIUM, LOW, INFO
  description: text("description"),
  recommendedAction: text("recommended_action"),
  status: text("status").notNull().default("OPEN"), // OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGovernanceReviewFindingSchema = createInsertSchema(governanceReviewFindings).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
  resolvedBy: true,
});
export type InsertGovernanceReviewFinding = z.infer<typeof insertGovernanceReviewFindingSchema>;
export type GovernanceReviewFinding = typeof governanceReviewFindings.$inferSelect;

// ── Licensing ───────────────────────────────────────────────────────────────

export const licenseSubscriptions = pgTable("license_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  skuId: text("sku_id").notNull(),
  skuPartNumber: text("sku_part_number"),
  displayName: text("display_name"),
  totalUnits: integer("total_units").default(0),
  consumedUnits: integer("consumed_units").default(0),
  suspendedUnits: integer("suspended_units").default(0),
  warningUnits: integer("warning_units").default(0),
  enabledServicePlans: jsonb("enabled_service_plans").$type<Array<{ servicePlanId: string; servicePlanName: string }>>(),
  customPricePerUnit: numeric("custom_price_per_unit", { precision: 10, scale: 2 }),
  billingCycle: text("billing_cycle"),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_sku").on(table.tenantConnectionId, table.skuId),
]);

export const insertLicenseSubscriptionSchema = createInsertSchema(licenseSubscriptions).omit({
  id: true,
  createdAt: true,
});
export type InsertLicenseSubscription = z.infer<typeof insertLicenseSubscriptionSchema>;
export type LicenseSubscription = typeof licenseSubscriptions.$inferSelect;

export const licenseAssignments = pgTable("license_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  userId: text("user_id").notNull(),
  userPrincipalName: text("user_principal_name"),
  userDisplayName: text("user_display_name"),
  userDepartment: text("user_department"),
  userJobTitle: text("user_job_title"),
  accountEnabled: boolean("account_enabled"),
  lastSignInDate: text("last_sign_in_date"),
  skuId: text("sku_id").notNull(),
  skuPartNumber: text("sku_part_number"),
  assignedDate: text("assigned_date"),
  disabledPlans: text("disabled_plans").array(),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_user_sku").on(table.tenantConnectionId, table.userId, table.skuId),
]);

export const insertLicenseAssignmentSchema = createInsertSchema(licenseAssignments).omit({
  id: true,
  createdAt: true,
});
export type InsertLicenseAssignment = z.infer<typeof insertLicenseAssignmentSchema>;
export type LicenseAssignment = typeof licenseAssignments.$inferSelect;

export const licenseOptimizationRules = pgTable("license_optimization_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  ruleType: text("rule_type").notNull(), // INACTIVE_USER, DISABLED_ACCOUNT, OVERLAP_DETECTION, UNASSIGNED_LICENSE
  config: jsonb("config").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLicenseOptimizationRuleSchema = createInsertSchema(licenseOptimizationRules).omit({
  id: true,
  createdAt: true,
});
export type InsertLicenseOptimizationRule = z.infer<typeof insertLicenseOptimizationRuleSchema>;
export type LicenseOptimizationRule = typeof licenseOptimizationRules.$inferSelect;

export const licenseOptimizationFindings = pgTable("license_optimization_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  ruleId: varchar("rule_id"),
  findingType: text("finding_type").notNull(), // INACTIVE_USER, DISABLED_ACCOUNT, OVERLAP_DETECTION, UNASSIGNED_LICENSE
  userId: text("user_id"),
  userPrincipalName: text("user_principal_name"),
  skuId: text("sku_id"),
  skuDisplayName: text("sku_display_name"),
  estimatedMonthlySavings: numeric("estimated_monthly_savings", { precision: 10, scale: 2 }),
  description: text("description"),
  status: text("status").notNull().default("OPEN"), // OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLicenseOptimizationFindingSchema = createInsertSchema(licenseOptimizationFindings).omit({
  id: true,
  createdAt: true,
  resolvedAt: true,
});
export type InsertLicenseOptimizationFinding = z.infer<typeof insertLicenseOptimizationFindingSchema>;
export type LicenseOptimizationFinding = typeof licenseOptimizationFindings.$inferSelect;

// ── Zenith User Inventory ────────────────────────────────────────────────────
// Cached, minimal, read-only snapshot of tenant users. Populated via Graph
// /users by a background/admin-triggered job. Reports MUST consume this
// inventory rather than re-enumerating Entra at report execution time.
export const userInventory = pgTable("user_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),

  userId: text("user_id").notNull(),                 // Entra Object ID
  userPrincipalName: text("user_principal_name").notNull(),
  mail: text("mail"),                                 // primary SMTP (if different from UPN)
  displayName: text("display_name"),
  accountEnabled: boolean("account_enabled").notNull().default(true),
  userType: text("user_type").notNull().default("Member"), // Member | Guest

  // Optional hints (populated later if available from other services)
  mailboxLicenseHint: text("mailbox_license_hint"),
  lastKnownMailActivity: text("last_known_mail_activity"),

  lastRefreshedAt: timestamp("last_refreshed_at").defaultNow().notNull(),
  discoveryStatus: text("discovery_status").notNull().default("ACTIVE"), // ACTIVE | DELETED

  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("uq_tenant_user_inventory").on(table.tenantConnectionId, table.userId),
]);

export const insertUserInventorySchema = createInsertSchema(userInventory).omit({
  id: true,
  createdAt: true,
});
export type InsertUserInventory = z.infer<typeof insertUserInventorySchema>;
export type UserInventoryItem = typeof userInventory.$inferSelect;

// Tracks each refresh of the user inventory (throttling-safe paging, caps).
export const userInventoryRuns = pgTable("user_inventory_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  status: text("status").notNull().default("RUNNING"), // RUNNING | COMPLETED | FAILED | PARTIAL | CAP_REACHED
  maxUsersCap: integer("max_users_cap"),
  usersDiscovered: integer("users_discovered").default(0),
  usersMarkedDeleted: integer("users_marked_deleted").default(0),
  pagesFetched: integer("pages_fetched").default(0),
  errors: jsonb("errors").$type<Array<{ context: string; message: string }>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserInventoryRunSchema = createInsertSchema(userInventoryRuns).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});
export type InsertUserInventoryRun = z.infer<typeof insertUserInventoryRunSchema>;
export type UserInventoryRun = typeof userInventoryRuns.$inferSelect;

// ── Email Content Storage Report ─────────────────────────────────────────────
// Estimates how much organizational content is propagated via classic email
// attachments rather than SharePoint/OneDrive links. Built on top of the
// user_inventory cache — MUST NOT enumerate Entra directly.

export const EMAIL_REPORT_MODES = ["ESTIMATE", "METADATA"] as const;
export type EmailReportMode = typeof EMAIL_REPORT_MODES[number];

export const VALID_WINDOW_DAYS_LIST = [7, 30, 90] as const;
export type ValidEmailReportWindowDays = typeof VALID_WINDOW_DAYS_LIST[number];

export const EMAIL_REPORT_STATUSES = [
  "RUNNING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "CANCELLED",
  "INVENTORY_STALE",
] as const;
export type EmailReportStatus = typeof EMAIL_REPORT_STATUSES[number];

/** Shape of the `limits` jsonb blob. Defaults live in the service layer. */
export interface EmailReportLimits {
  windowDays: number;                 // 7 | 30 | 90
  maxUsers: number;
  maxMessagesPerUser: number;
  maxTotalMessages: number;
  attachmentMetadataEnabled: boolean;
  maxMessagesWithMetadata: number;
  minMessageSizeKBForMetadata: number;
  maxAttachmentsPerMessage: number;
}

/** Aggregates computed per-run; all counts/bytes are integers. */
export interface EmailReportSummary {
  totalMessagesAnalyzed: number;
  messagesWithAttachments: number;
  pctWithAttachments: number;           // 0..1
  estimatedAttachmentBytes: number;
  sizeStats: {
    avgBytes: number;
    medianBytes: number;
    p90Bytes: number;
    p95Bytes: number;
    maxBytes: number;
  };
  internal: { messages: number; bytes: number };
  external: { messages: number; bytes: number };
  topSenders: Array<{ sender: string; bytes: number; count: number }>;
  topRecipientDomains: Array<{ domain: string; bytes: number; count: number }>;
  topAttachmentTypes?: Array<{ contentType: string; bytes: number; count: number }>;
  repeatedAttachmentPatterns?: Array<{ key: string; count: number; bytes: number }>;
  classicAttachments?: { count: number; bytes: number };
  referenceAttachments?: { count: number };
  inlineAttachments?: { count: number; bytes: number };
  attachmentFetchErrors?: number;
}

export interface EmailReportCapsHit {
  maxUsers?: boolean;
  maxMessagesPerUser?: Array<{ userId: string }>;
  maxTotalMessages?: boolean;
  maxMessagesWithMetadata?: boolean;
  inventoryEmpty?: boolean;
  inventoryStale?: boolean;
}

export const emailStorageReports = pgTable("email_storage_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),

  mode: text("mode").notNull(),                     // ESTIMATE | METADATA
  windowDays: integer("window_days").notNull(),     // 7 | 30 | 90
  windowStart: timestamp("window_start").notNull(),
  windowEnd: timestamp("window_end").notNull(),

  status: text("status").notNull().default("RUNNING"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),

  // Snapshot of limits in effect for this run
  limits: jsonb("limits").$type<EmailReportLimits>().notNull(),

  // Progress counters (updated during run)
  usersPlanned: integer("users_planned").default(0),
  usersProcessed: integer("users_processed").default(0),
  messagesAnalyzed: integer("messages_analyzed").default(0),
  messagesWithAttachments: integer("messages_with_attachments").default(0),
  estimatedAttachmentBytes: bigint("estimated_attachment_bytes", { mode: "number" }).default(0),

  // Accuracy metadata
  inventorySnapshotAt: timestamp("inventory_snapshot_at"),
  inventorySampledCount: integer("inventory_sampled_count"),
  inventoryTotalCount: integer("inventory_total_count"),
  verifiedDomains: jsonb("verified_domains").$type<string[]>(),
  dataMaskingApplied: boolean("data_masking_applied").notNull().default(false),

  // Aggregated results (computed at completion)
  summary: jsonb("summary").$type<EmailReportSummary>(),
  capsHit: jsonb("caps_hit").$type<EmailReportCapsHit>(),
  accuracyCaveats: jsonb("accuracy_caveats").$type<string[]>(),
  errors: jsonb("errors").$type<Array<{ context: string; message: string }>>(),

  triggeredByUserId: varchar("triggered_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmailStorageReportSchema = createInsertSchema(emailStorageReports).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});
export type InsertEmailStorageReport = z.infer<typeof insertEmailStorageReportSchema>;
export type EmailStorageReport = typeof emailStorageReports.$inferSelect;

// ── M365 30-Day Overview Report (premium) ───────────────────────────────────
//
// A periodic executive-style snapshot combining 30-day change deltas across
// sites, Teams channels, document libraries, and sharing links with an
// LLM-authored narrative plus prioritized recommendations derived from
// Copilot prompt intelligence, IA scoring, and sharing posture.

export const M365_OVERVIEW_STATUSES = ["RUNNING", "COMPLETED", "FAILED"] as const;
export type M365OverviewStatus = (typeof M365_OVERVIEW_STATUSES)[number];

export interface M365OverviewKpi {
  label: string;
  value: number;
  previousValue: number | null;
  deltaPct: number | null;
  unit?: "count" | "bytes" | "percent";
}

export interface M365OverviewSiteChanges {
  newSites: number;
  archivedSites: number;
  deletedSites: number;
  /** Sum of current storageUsedBytes for the top-10 largest sites (proxy; true 30-day delta not available). */
  storageTop10Bytes: number;
  topGrowth: Array<{
    workspaceId: string;
    displayName: string;
    siteUrl: string | null;
    storageUsedBytes: number;
  }>;
  newlyInactive: number;
}

export interface M365OverviewTeamsChanges {
  newTeams: number;
  newChannels: number;
  // "Remixed" = created, renamed membership-type, archived/restored, or
  // visibility flipped within the window.
  remixedChannels: number;
  privateChannels: number;
  sharedChannels: number;
  topActiveTeams: Array<{
    teamId: string;
    displayName: string;
    channelCount: number;
    memberCount: number | null;
  }>;
}

export interface M365OverviewLibraryChanges {
  newLibraries: number;
  versionSprawlFlagged: number;
  deepFolderFlagged: number;
  averageMaxFolderDepth: number | null;
  unlabeledLibraries: number;
}

export interface M365OverviewSharingChanges {
  newExternalLinks: number;
  anonymousLinks: number;
  activeLinks: number;
  expiringSoon: number;
}

export interface M365OverviewCopilotSignals {
  totalInteractions: number;
  uniqueUsers: number;
  averageQualityScore: number | null;
  problematicShare: number; // 0..1
  topFlags: Array<{ signal: string; count: number }>;
  topDepartments: Array<{ department: string; interactions: number; avgQuality: number | null }>;
}

export interface M365OverviewIASignals {
  librariesAssessed: number;
  versionSprawlCount: number;
  deepHierarchyCount: number;
  missingSensitivityLabelsCount: number;
}

export interface M365OverviewSnapshot {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  priorWindowStart: string;
  priorWindowEnd: string;
  kpis: M365OverviewKpi[];
  sites: M365OverviewSiteChanges;
  teams: M365OverviewTeamsChanges;
  libraries: M365OverviewLibraryChanges;
  sharing: M365OverviewSharingChanges;
  copilot: M365OverviewCopilotSignals;
  ia: M365OverviewIASignals;
  dataCaveats: string[];
}

export interface M365OverviewRecommendation {
  rank: number;
  title: string;
  rationale: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  effort: "HIGH" | "MEDIUM" | "LOW";
  category: "SITES" | "TEAMS" | "IA" | "COPILOT" | "SHARING" | "LIFECYCLE" | "LABELING";
  evidenceRefs?: string[];
}

export const m365OverviewReports = pgTable("m365_overview_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),

  status: text("status").notNull().default("RUNNING"),
  windowStart: timestamp("window_start").notNull(),
  windowEnd: timestamp("window_end").notNull(),

  snapshot: jsonb("snapshot").$type<M365OverviewSnapshot>(),
  narrative: text("narrative"),
  recommendations: jsonb("recommendations").$type<M365OverviewRecommendation[]>(),

  modelUsed: text("model_used"),
  tokensUsed: integer("tokens_used"),

  triggeredByUserId: varchar("triggered_by_user_id"),

  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  error: text("error"),

  createdAt: timestamp("created_at").defaultNow(),
});

export const insertM365OverviewReportSchema = createInsertSchema(m365OverviewReports).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});
export type InsertM365OverviewReport = z.infer<typeof insertM365OverviewReportSchema>;
export type M365OverviewReport = typeof m365OverviewReports.$inferSelect;

export const aiAgentSkills = pgTable("ai_agent_skills", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  skillKey: text("skill_key").notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedBy: varchar("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  uqOrgSkill: unique("uq_org_skill").on(t.organizationId, t.skillKey),
}));

export const insertAiAgentSkillSchema = createInsertSchema(aiAgentSkills).omit({
  id: true,
  updatedAt: true,
});
export type InsertAiAgentSkill = z.infer<typeof insertAiAgentSkillSchema>;
export type AiAgentSkill = typeof aiAgentSkills.$inferSelect;

export const AI_SKILL_KEYS = ["provision", "validate", "explain", "report_and_recommend"] as const;
export type AiSkillKey = typeof AI_SKILL_KEYS[number];

// ── AI Grounding Documents ────────────────────────────────────────────────────
export const aiGroundingDocuments = pgTable("ai_grounding_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scope: text("scope").notNull(), // 'system' | 'org'
  orgId: varchar("org_id"), // nullable — only set for org-scoped docs
  name: text("name").notNull(),
  description: text("description"),
  contentText: text("content_text").notNull(),
  fileType: text("file_type").notNull(), // 'pdf' | 'docx' | 'txt' | 'md'
  fileSizeBytes: integer("file_size_bytes").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  uploadedBy: varchar("uploaded_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiGroundingDocumentSchema = createInsertSchema(aiGroundingDocuments).omit({
  id: true,
  createdAt: true,
});
export type InsertAiGroundingDocument = z.infer<typeof insertAiGroundingDocumentSchema>;
export type AiGroundingDocument = typeof aiGroundingDocuments.$inferSelect;

// ── Copilot Prompt Intelligence (BL-038) ──────────────────────────────────────
//
// Captures user-initiated Microsoft 365 Copilot interactions on a rolling
// 30-day window, scores each prompt against a 5-category quality & safety
// framework, and aggregates the results into on-demand assessment reports.

export const COPILOT_QUALITY_TIERS = ["GREAT", "GOOD", "WEAK", "PROBLEMATIC"] as const;
export type CopilotQualityTier = typeof COPILOT_QUALITY_TIERS[number];

export const COPILOT_RISK_LEVELS = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type CopilotRiskLevel = typeof COPILOT_RISK_LEVELS[number];

export const COPILOT_FLAG_CATEGORIES = [
  "CONTENT_SAFETY",
  "MISUSE",
  "SENSITIVE_DATA",
  "QUALITY",
  "FEASIBILITY",
] as const;
export type CopilotFlagCategory = typeof COPILOT_FLAG_CATEGORIES[number];

export interface CopilotPromptFlag {
  category: CopilotFlagCategory;
  signal: string;
  severity: CopilotRiskLevel;
  detail?: string;
}

export const copilotInteractions = pgTable("copilot_interactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  graphInteractionId: text("graph_interaction_id").notNull(),
  requestId: text("request_id"),
  sessionId: text("session_id"),
  interactionType: text("interaction_type").notNull().default("userPrompt"),
  userId: text("user_id").notNull(),
  userPrincipalName: text("user_principal_name").notNull(),
  userDisplayName: text("user_display_name"),
  userDepartment: text("user_department"),
  appClass: text("app_class"),
  promptText: text("prompt_text"),
  bodyContent: text("body_content"),
  bodyContentType: text("body_content_type"),
  contexts: jsonb("contexts").$type<any[]>(),
  attachments: jsonb("attachments").$type<any[]>(),
  links: jsonb("links").$type<any[]>(),
  mentions: jsonb("mentions").$type<any[]>(),
  rawData: jsonb("raw_data").$type<Record<string, any>>(),
  interactionAt: timestamp("interaction_at").notNull(),
  qualityTier: text("quality_tier"),
  qualityScore: integer("quality_score"),
  riskLevel: text("risk_level"),
  flags: jsonb("flags").$type<CopilotPromptFlag[]>().notNull().default(sql`'[]'::jsonb`),
  recommendation: text("recommendation"),
  analyzedAt: timestamp("analyzed_at"),
  capturedAt: timestamp("captured_at").defaultNow(),
}, (t) => [
  unique("uq_copilot_interactions_tenant_graph").on(t.tenantConnectionId, t.graphInteractionId),
]);

export const insertCopilotInteractionSchema = createInsertSchema(copilotInteractions).omit({
  id: true,
  capturedAt: true,
});
export type InsertCopilotInteraction = z.infer<typeof insertCopilotInteractionSchema>;
export type CopilotInteraction = typeof copilotInteractions.$inferSelect;

export const COPILOT_ASSESSMENT_STATUSES = ["PENDING", "RUNNING", "COMPLETED", "FAILED"] as const;
export type CopilotAssessmentStatus = typeof COPILOT_ASSESSMENT_STATUSES[number];

export interface CopilotOrgSummary {
  totalInteractions: number;
  uniqueUsers: number;
  dateRange: { start: string; end: string };
  qualityDistribution: Record<CopilotQualityTier, number>;
  averageQualityScore: number;
  riskDistribution: Record<CopilotRiskLevel, number>;
  appClassBreakdown: Record<string, number>;
  topFlags: Array<{ category: CopilotFlagCategory; signal: string; count: number }>;
}

export interface CopilotDepartmentBreakdown {
  department: string;
  userCount: number;
  interactionCount: number;
  averageQualityScore: number;
  qualityDistribution: Record<CopilotQualityTier, number>;
  riskDistribution: Record<CopilotRiskLevel, number>;
  topFlags: Array<{ category: CopilotFlagCategory; signal: string; count: number }>;
}

export interface CopilotUserBreakdown {
  userId: string;
  userPrincipalName: string;
  displayName: string | null;
  department: string | null;
  interactionCount: number;
  averageQualityScore: number;
  qualityDistribution: Record<CopilotQualityTier, number>;
  criticalFlags: number;
  topRecommendation?: string | null;
}

export interface CopilotRecommendation {
  rank: number;
  title: string;
  rationale: string;
  impact: "HIGH" | "MEDIUM" | "LOW";
  targetScope?: "ORGANIZATION" | "DEPARTMENT" | "USER";
  targetName?: string;
}

export const copilotPromptAssessments = pgTable("copilot_prompt_assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  status: text("status").notNull().default("PENDING"),
  triggeredBy: varchar("triggered_by"),
  interactionCount: integer("interaction_count"),
  userCount: integer("user_count"),
  dateRangeStart: timestamp("date_range_start"),
  dateRangeEnd: timestamp("date_range_end"),
  orgSummary: jsonb("org_summary").$type<CopilotOrgSummary>(),
  departmentBreakdown: jsonb("department_breakdown").$type<CopilotDepartmentBreakdown[]>(),
  userBreakdown: jsonb("user_breakdown").$type<CopilotUserBreakdown[]>(),
  executiveSummary: text("executive_summary"),
  recommendations: jsonb("recommendations").$type<CopilotRecommendation[]>(),
  modelUsed: text("model_used"),
  tokensUsed: integer("tokens_used"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCopilotPromptAssessmentSchema = createInsertSchema(copilotPromptAssessments).omit({
  id: true,
  createdAt: true,
});
export type InsertCopilotPromptAssessment = z.infer<typeof insertCopilotPromptAssessmentSchema>;
export type CopilotPromptAssessment = typeof copilotPromptAssessments.$inferSelect;

// ── Copilot Sync Runs (BL-038 — progress tracking for interaction syncs) ──────
//
// Tracks each triggered Graph interaction sync so callers can poll the run
// status via GET /api/copilot-prompt-intelligence/sync/:syncRunId, mirroring
// the assessments polling pattern.

export const copilotSyncRuns = pgTable("copilot_sync_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantConnectionId: varchar("tenant_connection_id").notNull(),
  organizationId: varchar("organization_id").notNull(),
  status: text("status").notNull().default("RUNNING"), // RUNNING | COMPLETED | FAILED
  triggeredBy: varchar("triggered_by"),
  usersScanned: integer("users_scanned"),
  interactionsCaptured: integer("interactions_captured"),
  interactionsSkipped: integer("interactions_skipped"),
  interactionsPurged: integer("interactions_purged"),
  errorCount: integer("error_count"),
  errors: jsonb("errors").$type<Array<{ userId?: string; context: string; message: string }>>(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCopilotSyncRunSchema = createInsertSchema(copilotSyncRuns).omit({
  id: true,
  createdAt: true,
});
export type InsertCopilotSyncRun = z.infer<typeof insertCopilotSyncRunSchema>;
export type CopilotSyncRun = typeof copilotSyncRuns.$inferSelect;

// ── BL-039: Scheduled Job Runs (cross-cutting job audit trail) ───────────────
//
// Single unified tracking table for every background data-gathering job on
// the platform. The existing per-service "runs" tables remain for service-
// specific detail; this table powers the Job Monitor admin page and the
// Dataset Freshness Registry.

/** Canonical job types tracked in scheduled_job_runs. */
export const JOB_TYPES = {
  tenantSync:           { label: "Tenant Sync",                 dataset: "workspaces" },
  sharingLinkDiscovery: { label: "Sharing Link Discovery",      dataset: "sharingLinks" },
  oneDriveInventory:    { label: "OneDrive Inventory",          dataset: "onedriveInventory" },
  teamsInventory:       { label: "Teams & Channels Inventory",  dataset: "teamsInventory" },
  teamsRecordings:      { label: "Recordings Discovery",        dataset: "recordings" },
  userInventory:        { label: "User Inventory",              dataset: "userInventory" },
  copilotSync:          { label: "Copilot Interaction Sync",    dataset: "copilotInteractions" },
  copilotAssessment:    { label: "Copilot Prompt Assessment",   dataset: "copilotAssessments" },
  iaAssessment:         { label: "IA Health Assessment",        dataset: "iaAssessment" },
  emailStorageReport:   { label: "Email Storage Report",        dataset: "emailStorageReport" },
  governanceSnapshot:   { label: "Governance Snapshot",         dataset: "governanceSnapshot" },
  licenseSync:          { label: "License Sync",                dataset: "licenses" },
  iaSync:               { label: "IA Column Sync",              dataset: "iaColumns" },
} as const;

export type JobType = keyof typeof JOB_TYPES;

export const JOB_STATUSES = ["running", "completed", "failed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TRIGGER_SOURCES = ["manual", "system", "scheduled"] as const;
export type JobTriggerSource = (typeof JOB_TRIGGER_SOURCES)[number];

export const scheduledJobRuns = pgTable("scheduled_job_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id"),
  tenantConnectionId: varchar("tenant_connection_id"),
  jobType: text("job_type").notNull(),
  status: text("status").notNull().default("running"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  durationMs: integer("duration_ms"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
  triggeredBy: text("triggered_by").notNull().default("manual"),
  triggeredByUserId: varchar("triggered_by_user_id"),
  targetId: text("target_id"),
  targetName: text("target_name"),
  itemsTotal: integer("items_total"),
  itemsProcessed: integer("items_processed"),
  progressLabel: text("progress_label"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertScheduledJobRunSchema = createInsertSchema(scheduledJobRuns).omit({
  id: true,
  createdAt: true,
});
export type InsertScheduledJobRun = z.infer<typeof insertScheduledJobRunSchema>;
export type ScheduledJobRun = typeof scheduledJobRuns.$inferSelect;

// ── Saved Views ───────────────────────────────────────────────────────────
// Each inventory page can save its current filter / sort / column state as a
// reusable view. Views are private by default, can be shared org-wide by
// Tenant Admins, and have a stable URL so a teammate can land on the same
// filter state with a click.
export const SAVED_VIEW_PAGES = [
  "site_governance",
  "sharing_links",
  "recordings",
  "purview",
  "workspaces",
] as const;
export type SavedViewPage = (typeof SAVED_VIEW_PAGES)[number];

export const SAVED_VIEW_SCOPES = ["PRIVATE", "ORG"] as const;
export type SavedViewScope = (typeof SAVED_VIEW_SCOPES)[number];

export const savedViews = pgTable("saved_views", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  ownerUserId: varchar("owner_user_id").notNull(),
  page: text("page").notNull(),
  name: text("name").notNull(),
  filterJson: jsonb("filter_json").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  sortJson: jsonb("sort_json").$type<{ column?: string; direction?: "asc" | "desc" } | Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  columnsJson: jsonb("columns_json").$type<{ visible?: string[]; hidden?: string[] } | Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  scope: text("scope").notNull().default("PRIVATE"),
  pinnedByUserIds: text("pinned_by_user_ids").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSavedViewSchema = createInsertSchema(savedViews)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
    page: z.enum(SAVED_VIEW_PAGES),
    scope: z.enum(SAVED_VIEW_SCOPES).default("PRIVATE"),
    filterJson: z.record(z.unknown()).default({}),
    sortJson: z.record(z.unknown()).default({}),
    columnsJson: z.record(z.unknown()).default({}),
    pinnedByUserIds: z.array(z.string()).default([]),
  });

export type InsertSavedView = z.infer<typeof insertSavedViewSchema>;
export type SavedView = typeof savedViews.$inferSelect;

// Built-in views are read-only, bundled with the app, and surfaced under the
// "Built-in" section of the view picker on each page. Their `id` is a stable,
// human-readable slug prefixed with "builtin:" so URLs are friendly and the
// API can recognise them without a DB lookup.
export type BuiltInSavedView = {
  id: string;
  page: SavedViewPage;
  name: string;
  description: string;
  filterJson: Record<string, unknown>;
  sortJson?: { column?: string; direction?: "asc" | "desc" };
  columnsJson?: { visible?: string[]; hidden?: string[] };
};

export const BUILT_IN_SAVED_VIEWS: BuiltInSavedView[] = [
  // ── Site Governance / Workspaces ──
  {
    id: "builtin:site_governance:external-shared-without-label",
    page: "site_governance",
    name: "External-Shared Without Label",
    description: "Sites with external sharing enabled that lack a sensitivity label.",
    filterJson: { externalSharing: "enabled", sensitivityLabel: "missing" },
    sortJson: { column: "displayName", direction: "asc" },
  },
  {
    id: "builtin:site_governance:stale-90-days",
    page: "site_governance",
    name: "Stale 90+ Days",
    description: "Sites with no content activity in the last 90 days.",
    filterJson: { lastActivity: "stale_90" },
    sortJson: { column: "lastActivityDate", direction: "asc" },
  },
  {
    id: "builtin:site_governance:orphaned",
    page: "site_governance",
    name: "Orphaned Sites",
    description: "Sites with zero owners.",
    filterJson: { owners: "none" },
    sortJson: { column: "displayName", direction: "asc" },
  },
  {
    id: "builtin:site_governance:highly-confidential-without-owner",
    page: "site_governance",
    name: "Highly Confidential Without Owner",
    description: "Highly confidential workspaces missing an accountable owner.",
    filterJson: { sensitivity: "HIGHLY_CONFIDENTIAL", owners: "none" },
    sortJson: { column: "displayName", direction: "asc" },
  },
  // Workspaces page mirrors the site_governance built-ins so the inventory
  // grid has the same starter set.
  {
    id: "builtin:workspaces:external-shared-without-label",
    page: "workspaces",
    name: "External-Shared Without Label",
    description: "Workspaces with external sharing enabled that lack a sensitivity label.",
    filterJson: { externalSharing: "enabled", sensitivityLabel: "missing" },
    sortJson: { column: "displayName", direction: "asc" },
  },
  {
    id: "builtin:workspaces:stale-90-days",
    page: "workspaces",
    name: "Stale 90+ Days",
    description: "Workspaces inactive for 90+ days.",
    filterJson: { lastActivity: "stale_90" },
    sortJson: { column: "lastActivityDate", direction: "asc" },
  },
  {
    id: "builtin:workspaces:orphaned",
    page: "workspaces",
    name: "Orphaned Workspaces",
    description: "Workspaces with zero owners.",
    filterJson: { owners: "none" },
  },
  // ── Sharing Links ──
  {
    id: "builtin:sharing_links:anonymous",
    page: "sharing_links",
    name: "Anonymous Links",
    description: "Sharing links accessible by anyone with the URL.",
    filterJson: { linkType: "anonymous" },
  },
  {
    id: "builtin:sharing_links:externally-shared",
    page: "sharing_links",
    name: "Externally Shared",
    description: "Sharing links granting access to external recipients.",
    filterJson: { audience: "external" },
  },
  // ── Recordings ──
  {
    id: "builtin:recordings:transcripts-only",
    page: "recordings",
    name: "With Transcripts",
    description: "Meeting recordings that have a Stream transcript.",
    filterJson: { hasTranscript: true },
  },
  {
    id: "builtin:recordings:no-label",
    page: "recordings",
    name: "Recordings Without Label",
    description: "Recordings missing a sensitivity or retention label.",
    filterJson: { label: "missing" },
  },
  // ── Purview ──
  {
    id: "builtin:purview:unlabeled-sites",
    page: "purview",
    name: "Unlabeled Sites",
    description: "Workspaces with neither a sensitivity nor a retention label.",
    filterJson: { coverage: "unlabeled" },
  },
  {
    id: "builtin:purview:sensitivity-only",
    page: "purview",
    name: "Sensitivity Labeled Only",
    description: "Sites with a sensitivity label.",
    filterJson: { coverage: "labeled" },
  },
];


// ─────────────────────────────────────────────────────────────────────────
// BL-007 — Site Lifecycle Review Queue
// ─────────────────────────────────────────────────────────────────────────

export const workspaceComplianceScores = pgTable("workspace_compliance_scores", {
  workspaceId: varchar("workspace_id").primaryKey(),
  organizationId: varchar("organization_id"),
  tenantConnectionId: varchar("tenant_connection_id"),
  score: integer("score").notNull().default(0),
  isStale: boolean("is_stale").notNull().default(false),
  isOrphaned: boolean("is_orphaned").notNull().default(false),
  missingLabel: boolean("missing_label").notNull().default(false),
  missingMetadata: boolean("missing_metadata").notNull().default(false),
  externallySharedUnclassified: boolean("externally_shared_unclassified").notNull().default(false),
  daysSinceActivity: integer("days_since_activity"),
  breakdown: jsonb("breakdown").$type<Array<{ key: string; label: string; weight: number; pass: boolean; remediation: string }>>(),
  computedAt: timestamp("computed_at").notNull().defaultNow(),
  scanRunId: varchar("scan_run_id"),
});

export const insertWorkspaceComplianceScoreSchema = createInsertSchema(workspaceComplianceScores);
export type InsertWorkspaceComplianceScore = z.infer<typeof insertWorkspaceComplianceScoreSchema>;
export type WorkspaceComplianceScore = typeof workspaceComplianceScores.$inferSelect;

export const lifecycleScanRuns = pgTable("lifecycle_scan_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  tenantConnectionId: varchar("tenant_connection_id"),
  status: text("status").notNull().default("running"), // running, completed, failed
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  workspacesScanned: integer("workspaces_scanned").notNull().default(0),
  averageScore: integer("average_score").notNull().default(0),
  compliantCount: integer("compliant_count").notNull().default(0),
  staleCount: integer("stale_count").notNull().default(0),
  orphanedCount: integer("orphaned_count").notNull().default(0),
  missingLabelCount: integer("missing_label_count").notNull().default(0),
  externallySharedCount: integer("externally_shared_count").notNull().default(0),
  errorMessage: text("error_message"),
  triggeredBy: text("triggered_by"),
});

export const insertLifecycleScanRunSchema = createInsertSchema(lifecycleScanRuns).omit({
  id: true,
});
export type InsertLifecycleScanRun = z.infer<typeof insertLifecycleScanRunSchema>;
export type LifecycleScanRun = typeof lifecycleScanRuns.$inferSelect;

export const LIFECYCLE_DETECTION_DEFAULTS = {
  staleThresholdDays: 90,
  orphanedThresholdDays: 30,
  labelRequired: true,
  metadataRequired: true,
} as const;

export const LIFECYCLE_WEIGHT_DEFAULTS = {
  primarySteward: 15,
  secondarySteward: 15,
  sensitivityLabel: 20,
  metadata: 15,
  activity: 15,
  sharingPosture: 10,
  retentionLabel: 10,
} as const;

export type LifecycleWeightKey = keyof typeof LIFECYCLE_WEIGHT_DEFAULTS;

export const lifecycleComplianceSettings = pgTable("lifecycle_compliance_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  tenantConnectionId: varchar("tenant_connection_id"),
  staleThresholdDays: integer("stale_threshold_days").notNull().default(LIFECYCLE_DETECTION_DEFAULTS.staleThresholdDays),
  orphanedThresholdDays: integer("orphaned_threshold_days").notNull().default(LIFECYCLE_DETECTION_DEFAULTS.orphanedThresholdDays),
  labelRequired: boolean("label_required").notNull().default(LIFECYCLE_DETECTION_DEFAULTS.labelRequired),
  metadataRequired: boolean("metadata_required").notNull().default(LIFECYCLE_DETECTION_DEFAULTS.metadataRequired),
  weightPrimarySteward: integer("weight_primary_steward").notNull().default(LIFECYCLE_WEIGHT_DEFAULTS.primarySteward),
  weightSecondarySteward: integer("weight_secondary_steward").notNull().default(LIFECYCLE_WEIGHT_DEFAULTS.secondarySteward),
  weightSensitivityLabel: integer("weight_sensitivity_label").notNull().default(LIFECYCLE_WEIGHT_DEFAULTS.sensitivityLabel),
  weightMetadata: integer("weight_metadata").notNull().default(LIFECYCLE_WEIGHT_DEFAULTS.metadata),
  weightActivity: integer("weight_activity").notNull().default(LIFECYCLE_WEIGHT_DEFAULTS.activity),
  weightSharingPosture: integer("weight_sharing_posture").notNull().default(LIFECYCLE_WEIGHT_DEFAULTS.sharingPosture),
  weightRetentionLabel: integer("weight_retention_label").notNull().default(LIFECYCLE_WEIGHT_DEFAULTS.retentionLabel),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by"),
}, (table) => [
  unique("uq_lifecycle_settings_scope").on(table.organizationId, table.tenantConnectionId),
]);

export const insertLifecycleComplianceSettingsSchema = createInsertSchema(lifecycleComplianceSettings).omit({
  id: true,
  updatedAt: true,
});
export type InsertLifecycleComplianceSettings = z.infer<typeof insertLifecycleComplianceSettingsSchema>;
export type LifecycleComplianceSettings = typeof lifecycleComplianceSettings.$inferSelect;
