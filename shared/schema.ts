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
  siteCreatedDate: text("site_created_date"),
  reportRefreshDate: text("report_refresh_date"),
  propertyBag: jsonb("property_bag").$type<Record<string, string>>(),
  siteOwners: jsonb("site_owners").$type<Array<{ id?: string; displayName: string; mail?: string; userPrincipalName?: string }>>(),
  customFields: jsonb("custom_fields").$type<Record<string, any>>(),
  spoSyncHash: text("spo_sync_hash"),
  localHash: text("local_hash"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
});

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
    provisioning: true,
    inventorySync: true,
    copilotReadiness: false,
    lifecycleAutomation: false,
    selfServicePortal: false,
    advancedReporting: false,
    dataMasking: false,
    csvExport: false,
    mspAccess: false,
    contentGovernanceReporting: false as false | "readonly" | "full",
    sharingLinkManagement: false as false | "readonly" | "full",
    governanceReviews: false as false | "manual" | "full",
    licensingDashboard: false as false | "readonly" | "full",
    licensingOptimization: false as false | "basic" | "full",
    emailContentStorageReport: false,
    iaAssessment: false,
    contentIntensityHeatmap: false,
    trendRetentionDays: 0,
    maxUsers: 25,
    maxTenants: 1,
    maxSites: 1000,
    auditRetentionDays: 30,
  },
  STANDARD: {
    label: "Standard",
    m365WriteBack: true,
    provisioning: true,
    inventorySync: true,
    copilotReadiness: false,
    lifecycleAutomation: false,
    selfServicePortal: false,
    advancedReporting: false,
    dataMasking: false,
    csvExport: true,
    mspAccess: false,
    contentGovernanceReporting: "readonly" as false | "readonly" | "full",
    sharingLinkManagement: false as false | "readonly" | "full",
    governanceReviews: false as false | "manual" | "full",
    licensingDashboard: "readonly" as false | "readonly" | "full",
    licensingOptimization: false as false | "basic" | "full",
    emailContentStorageReport: false,
    iaAssessment: false,
    contentIntensityHeatmap: false,
    trendRetentionDays: 0,
    maxUsers: 500,
    maxTenants: 2,
    maxSites: -1,
    auditRetentionDays: 365,
  },
  PROFESSIONAL: {
    label: "Professional",
    m365WriteBack: true,
    provisioning: true,
    inventorySync: true,
    copilotReadiness: true,
    lifecycleAutomation: true,
    selfServicePortal: true,
    advancedReporting: false,
    dataMasking: true,
    csvExport: true,
    mspAccess: true,
    contentGovernanceReporting: "full" as false | "readonly" | "full",
    sharingLinkManagement: "readonly" as false | "readonly" | "full",
    governanceReviews: "manual" as false | "manual" | "full",
    licensingDashboard: "full" as false | "readonly" | "full",
    licensingOptimization: "basic" as false | "basic" | "full",
    emailContentStorageReport: false,
    iaAssessment: false,
    contentIntensityHeatmap: false,
    trendRetentionDays: 30,
    maxUsers: 5000,
    maxTenants: 10,
    maxSites: -1,
    auditRetentionDays: 365 * 7,
  },
  ENTERPRISE: {
    label: "Unlimited Enterprise",
    m365WriteBack: true,
    provisioning: true,
    inventorySync: true,
    copilotReadiness: true,
    lifecycleAutomation: true,
    selfServicePortal: true,
    advancedReporting: true,
    dataMasking: true,
    csvExport: true,
    mspAccess: true,
    contentGovernanceReporting: "full" as false | "readonly" | "full",
    sharingLinkManagement: "full" as false | "readonly" | "full",
    governanceReviews: "full" as false | "manual" | "full",
    licensingDashboard: "full" as false | "readonly" | "full",
    licensingOptimization: "full" as false | "basic" | "full",
    emailContentStorageReport: true,
    iaAssessment: true,
    contentIntensityHeatmap: true,
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
export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  defaultSignupPlan: text("default_signup_plan").notNull().default("TRIAL"),
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
