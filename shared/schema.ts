import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb, unique, bigint } from "drizzle-orm/pg-core";
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
  primarySteward: text("primary_steward"),
  secondarySteward: text("secondary_steward"),
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
  workspaceName: text("workspace_name").notNull(),
  workspaceType: text("workspace_type").notNull(),
  projectType: text("project_type").notNull().default("DEAL"),
  sensitivity: text("sensitivity").notNull().default("HIGHLY_CONFIDENTIAL"),
  externalSharing: boolean("external_sharing").notNull().default(false),
  primarySteward: text("primary_steward").notNull(),
  secondarySteward: text("secondary_steward").notNull(),
  status: text("status").notNull().default("PENDING"), // PENDING, APPROVED, PROVISIONED, REJECTED
  requestedBy: text("requested_by").notNull().default("admin@synozur.demo"),
  governedName: text("governed_name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProvisioningRequestSchema = createInsertSchema(provisioningRequests).omit({
  id: true,
  createdAt: true,
  status: true,
  requestedBy: true,
});

export type InsertProvisioningRequest = z.infer<typeof insertProvisioningRequestSchema>;
export type ProvisioningRequest = typeof provisioningRequests.$inferSelect;

export const governancePolicies = pgTable("governance_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  policyType: text("policy_type").notNull(), // COPILOT_READINESS, PROVISIONING_GATE, etc.
  status: text("status").notNull().default("ACTIVE"), // DRAFT, ACTIVE, DISABLED
  rules: jsonb("rules").notNull().default(sql`'[]'::jsonb`), // Array of rule definitions
  propertyBagKey: text("property_bag_key"), // e.g. "ZenithCopilotReady" — key to write result into SPO property bag
  propertyBagValueFormat: text("property_bag_value_format").default("PASS_FAIL"), // PASS_FAIL, READY_NOTREADY, SCORE_DATE, CUSTOM
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
  status: text("status").notNull().default("PENDING"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: text("last_sync_status"),
  lastSyncSiteCount: integer("last_sync_site_count"),
  consentGranted: boolean("consent_granted").notNull().default(false),
  isDemo: boolean("is_demo").notNull().default(false),
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
    maxUsers: 25,
    maxTenants: 1,
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
    maxUsers: 500,
    maxTenants: 2,
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
    maxUsers: 5000,
    maxTenants: 10,
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
    maxUsers: -1,
    maxTenants: -1,
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
