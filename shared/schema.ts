import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
  createdAt: true,
  m365ObjectId: true,
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

export const copilotRules = pgTable("copilot_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workspaceId: varchar("workspace_id").notNull(),
  ruleName: text("rule_name").notNull(),
  ruleResult: text("rule_result").notNull(), // PASS, FAIL
  ruleDescription: text("rule_description").notNull(),
});

export const insertCopilotRuleSchema = createInsertSchema(copilotRules).omit({
  id: true,
});

export type InsertCopilotRule = z.infer<typeof insertCopilotRuleSchema>;
export type CopilotRule = typeof copilotRules.$inferSelect;

export const tenantConnections = pgTable("tenant_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull(),
  tenantName: text("tenant_name").notNull(),
  domain: text("domain").notNull(),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret").notNull(),
  ownershipType: text("ownership_type").notNull().default("MSP"),
  status: text("status").notNull().default("PENDING"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: text("last_sync_status"),
  lastSyncSiteCount: integer("last_sync_site_count"),
  consentGranted: boolean("consent_granted").notNull().default(false),
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
});

export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;
