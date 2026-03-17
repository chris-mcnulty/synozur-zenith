import { Router } from "express";
import { storage } from "../storage";
import { ZENITH_ROLES } from "@shared/schema";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";

const router = Router();

async function getOrgTenantConnectionIds(user: AuthenticatedRequest["user"]): Promise<string[] | null> {
  if (!user?.organizationId) return null;
  if (user.role === ZENITH_ROLES.PLATFORM_OWNER) return null;
  const connections = await storage.getTenantConnectionsByOrganization(user.organizationId);
  return connections.map(c => c.id);
}

router.get("/api/spe/container-types", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
  const allowedIds = await getOrgTenantConnectionIds(req.user);

  if (tenantConnectionId) {
    if (allowedIds && !allowedIds.includes(tenantConnectionId)) return res.json([]);
    const types = await storage.getSpeContainerTypes(tenantConnectionId);
    return res.json(types);
  }

  if (allowedIds) {
    let all: any[] = [];
    for (const id of allowedIds) {
      const types = await storage.getSpeContainerTypes(id);
      all = all.concat(types);
    }
    return res.json(all);
  }

  const types = await storage.getSpeContainerTypes();
  res.json(types);
});

router.post("/api/spe/container-types", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const { displayName, description, azureAppId, containerTypeId, tenantConnectionId, defaultStorageLimitBytes } = req.body;
  if (!displayName || !tenantConnectionId) {
    return res.status(400).json({ message: "displayName and tenantConnectionId are required" });
  }
  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(tenantConnectionId)) {
    return res.status(403).json({ message: "Tenant connection not in scope" });
  }
  const ct = await storage.createSpeContainerType({
    displayName,
    description,
    azureAppId,
    containerTypeId,
    tenantConnectionId,
    defaultStorageLimitBytes,
    status: "ACTIVE",
  });
  res.status(201).json(ct);
});

router.patch("/api/spe/container-types/:id", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const existing = await storage.getSpeContainerType(req.params.id);
  if (!existing) return res.status(404).json({ message: "Container type not found" });
  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(existing.tenantConnectionId)) {
    return res.status(404).json({ message: "Container type not found" });
  }
  const updated = await storage.updateSpeContainerType(req.params.id, req.body);
  res.json(updated);
});

router.delete("/api/spe/container-types/:id", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const existing = await storage.getSpeContainerType(req.params.id);
  if (!existing) return res.status(404).json({ message: "Container type not found" });
  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(existing.tenantConnectionId)) {
    return res.status(404).json({ message: "Container type not found" });
  }
  await storage.deleteSpeContainerType(req.params.id);
  res.status(204).send();
});

router.get("/api/spe/containers", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const search = req.query.search as string | undefined;
  const tenantConnectionId = req.query.tenantConnectionId as string | undefined;
  const allowedIds = await getOrgTenantConnectionIds(req.user);

  if (tenantConnectionId) {
    if (allowedIds && !allowedIds.includes(tenantConnectionId)) return res.json([]);
    const containers = await storage.getSpeContainers(search, tenantConnectionId);
    return res.json(containers);
  }

  if (allowedIds) {
    let all: any[] = [];
    for (const id of allowedIds) {
      const containers = await storage.getSpeContainers(search, id);
      all = all.concat(containers);
    }
    return res.json(all);
  }

  const containers = await storage.getSpeContainers(search, tenantConnectionId);
  res.json(containers);
});

router.get("/api/spe/containers/:id", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const container = await storage.getSpeContainer(req.params.id);
  if (!container) return res.status(404).json({ message: "Container not found" });
  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(container.tenantConnectionId)) {
    return res.status(404).json({ message: "Container not found" });
  }
  res.json(container);
});

router.post("/api/spe/containers", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const { displayName, tenantConnectionId } = req.body;
  if (!displayName || !tenantConnectionId) {
    return res.status(400).json({ message: "displayName and tenantConnectionId are required" });
  }
  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(tenantConnectionId)) {
    return res.status(403).json({ message: "Tenant connection not in scope" });
  }
  const container = await storage.createSpeContainer(req.body);
  res.status(201).json(container);
});

router.patch("/api/spe/containers/:id", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const existing = await storage.getSpeContainer(req.params.id);
  if (!existing) return res.status(404).json({ message: "Container not found" });
  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(existing.tenantConnectionId)) {
    return res.status(404).json({ message: "Container not found" });
  }
  const updated = await storage.updateSpeContainer(req.params.id, req.body);
  res.json(updated);
});

router.delete("/api/spe/containers/:id", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const existing = await storage.getSpeContainer(req.params.id);
  if (!existing) return res.status(404).json({ message: "Container not found" });
  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(existing.tenantConnectionId)) {
    return res.status(404).json({ message: "Container not found" });
  }
  await storage.deleteSpeContainer(req.params.id);
  res.status(204).send();
});

router.get("/api/spe/containers/:id/usage", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const container = await storage.getSpeContainer(req.params.id);
  if (!container) return res.status(404).json({ message: "Container not found" });
  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(container.tenantConnectionId)) {
    return res.status(404).json({ message: "Container not found" });
  }
  const usage = await storage.getSpeContainerUsage(req.params.id, Number(req.query.limit) || 30);
  res.json(usage);
});

router.post("/api/spe/seed-demo", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const { tenantConnectionId } = req.body;
  if (!tenantConnectionId) {
    return res.status(400).json({ message: "tenantConnectionId is required" });
  }

  const existing = await storage.getSpeContainers(undefined, tenantConnectionId);
  if (existing.length > 0) {
    return res.json({ message: "Demo data already exists", containers: existing.length });
  }

  const containerTypeDefs = [
    { displayName: "Client Portal Application", containerTypeId: "CTYPE-PORTAL", azureAppId: "c8a4b1e2-3f56-4d89-a012-b3c4d5e6f7a8", defaultStorageLimitBytes: 107374182400 },
    { displayName: "Internal HR Knowledge Base", containerTypeId: "CTYPE-HRKB", azureAppId: "f9b2a3c4-5d6e-7f80-9123-a4b5c6d7e8f9", defaultStorageLimitBytes: 536870912000 },
    { displayName: "Partner Extranet", containerTypeId: "CTYPE-EXTRANET", azureAppId: "3e7d8f9a-0b1c-2d3e-4f56-789a0b1c2d3e", defaultStorageLimitBytes: 268435456000 },
    { displayName: "Custom CRM Integration", containerTypeId: "CTYPE-CRM", azureAppId: "a1c9b2d3-e4f5-6789-0abc-def123456789", defaultStorageLimitBytes: 53687091200 },
  ];

  const createdTypes = [];
  for (const def of containerTypeDefs) {
    const ct = await storage.createSpeContainerType({
      ...def,
      tenantConnectionId,
      status: "ACTIVE",
    });
    createdTypes.push(ct);
  }

  const containerDefs = [
    { displayName: "Acme Corp Portal", containerTypeId: createdTypes[0].id, m365ContainerId: "CONT-8492", storageUsedBytes: 45_634_023_424, storageAllocatedBytes: 107_374_182_400, fileCount: 2847, activeFileCount: 312, lastActivityDate: "2026-03-16", sensitivityLabel: "Highly Confidential", sensitivityLabelId: "hc-001", retentionLabel: "7 Year Retention", retentionLabelId: "ret-7y", ownerDisplayName: "Sarah Chen", ownerPrincipalName: "sarah.chen@synozur.com", permissions: "Custom App Role", status: "Active", containerCreatedDate: "2024-11-15" },
    { displayName: "Stark Industries Portal", containerTypeId: createdTypes[0].id, m365ContainerId: "CONT-8493", storageUsedBytes: 105_360_893_542, storageAllocatedBytes: 107_374_182_400, fileCount: 8421, activeFileCount: 1203, lastActivityDate: "2026-03-17", sensitivityLabel: "Confidential", sensitivityLabelId: "conf-001", retentionLabel: "5 Year Retention", retentionLabelId: "ret-5y", ownerDisplayName: "Marcus Rivera", ownerPrincipalName: "marcus.rivera@synozur.com", permissions: "Custom App Role", status: "Warning", containerCreatedDate: "2024-08-22", externalSharing: true },
    { displayName: "Wayne Enterprises Portal", containerTypeId: createdTypes[0].id, m365ContainerId: "CONT-8494", storageUsedBytes: 72_456_123_456, storageAllocatedBytes: 107_374_182_400, fileCount: 5134, activeFileCount: 876, lastActivityDate: "2026-03-15", sensitivityLabel: "Highly Confidential", sensitivityLabelId: "hc-001", retentionLabel: "7 Year Retention", retentionLabelId: "ret-7y", ownerDisplayName: "Diana Prince", ownerPrincipalName: "diana.prince@synozur.com", permissions: "Custom App Role", status: "Active", containerCreatedDate: "2025-01-10" },
    { displayName: "Q1 Benefits Docs", containerTypeId: createdTypes[1].id, m365ContainerId: "CONT-1004", storageUsedBytes: 13_314_398_208, storageAllocatedBytes: 536_870_912_000, fileCount: 945, activeFileCount: 124, lastActivityDate: "2026-03-12", sensitivityLabel: "Internal", sensitivityLabelId: "int-001", retentionLabel: "3 Year Retention", retentionLabelId: "ret-3y", ownerDisplayName: "HR Team", ownerPrincipalName: "hr@synozur.com", permissions: "Inherited", status: "Active", containerCreatedDate: "2025-12-01" },
    { displayName: "Employee Handbook 2026", containerTypeId: createdTypes[1].id, m365ContainerId: "CONT-1005", storageUsedBytes: 2_147_483_648, storageAllocatedBytes: 536_870_912_000, fileCount: 234, activeFileCount: 18, lastActivityDate: "2026-02-28", sensitivityLabel: "Internal", sensitivityLabelId: "int-001", ownerDisplayName: "HR Team", ownerPrincipalName: "hr@synozur.com", permissions: "Inherited", status: "Active", containerCreatedDate: "2025-11-15" },
    { displayName: "Alpha Partners Extranet", containerTypeId: createdTypes[2].id, m365ContainerId: "CONT-3391", storageUsedBytes: 226_120_269_824, storageAllocatedBytes: 268_435_456_000, fileCount: 12453, activeFileCount: 2341, lastActivityDate: "2026-03-17", sensitivityLabel: "Confidential", sensitivityLabelId: "conf-001", retentionLabel: "5 Year Retention", retentionLabelId: "ret-5y", ownerDisplayName: "Partner Relations", ownerPrincipalName: "partners@synozur.com", permissions: "Custom App Role", status: "Active", containerCreatedDate: "2024-06-01", externalSharing: true },
    { displayName: "Beta Partners Extranet", containerTypeId: createdTypes[2].id, m365ContainerId: "CONT-3392", storageUsedBytes: 42_949_672_960, storageAllocatedBytes: 268_435_456_000, fileCount: 3201, activeFileCount: 456, lastActivityDate: "2026-03-14", sensitivityLabel: "Internal", sensitivityLabelId: "int-001", ownerDisplayName: "Partner Relations", ownerPrincipalName: "partners@synozur.com", permissions: "Custom App Role", status: "Active", containerCreatedDate: "2025-03-15", externalSharing: true },
    { displayName: "CRM-OPP-1482", containerTypeId: createdTypes[3].id, m365ContainerId: "CONT-9912", storageUsedBytes: 2_254_857_830, storageAllocatedBytes: 53_687_091_200, fileCount: 156, activeFileCount: 43, lastActivityDate: "2026-03-16", ownerDisplayName: "CRM System", ownerPrincipalName: "crm-svc@synozur.com", permissions: "System Account", status: "Active", containerCreatedDate: "2025-09-01" },
    { displayName: "CRM-OPP-2847", containerTypeId: createdTypes[3].id, m365ContainerId: "CONT-9913", storageUsedBytes: 5_368_709_120, storageAllocatedBytes: 53_687_091_200, fileCount: 342, activeFileCount: 87, lastActivityDate: "2026-03-17", ownerDisplayName: "CRM System", ownerPrincipalName: "crm-svc@synozur.com", permissions: "System Account", status: "Active", containerCreatedDate: "2025-10-20" },
    { displayName: "CRM-OPP-3156", containerTypeId: createdTypes[3].id, m365ContainerId: "CONT-9914", storageUsedBytes: 1_073_741_824, storageAllocatedBytes: 53_687_091_200, fileCount: 89, activeFileCount: 12, lastActivityDate: "2026-01-15", ownerDisplayName: "CRM System", ownerPrincipalName: "crm-svc@synozur.com", permissions: "System Account", status: "Inactive", containerCreatedDate: "2025-06-10" },
    { displayName: "Legal Discovery Vault", containerTypeId: createdTypes[0].id, m365ContainerId: "CONT-8495", storageUsedBytes: 95_234_567_890, storageAllocatedBytes: 107_374_182_400, fileCount: 15234, activeFileCount: 45, lastActivityDate: "2026-03-10", sensitivityLabel: "Highly Confidential", sensitivityLabelId: "hc-001", retentionLabel: "10 Year Retention", retentionLabelId: "ret-10y", ownerDisplayName: "Legal Dept", ownerPrincipalName: "legal@synozur.com", permissions: "Custom App Role", status: "Active", containerCreatedDate: "2024-03-01" },
    { displayName: "Investor Relations Portal", containerTypeId: createdTypes[2].id, m365ContainerId: "CONT-3393", storageUsedBytes: 16_106_127_360, storageAllocatedBytes: 268_435_456_000, fileCount: 1876, activeFileCount: 234, lastActivityDate: "2026-03-16", sensitivityLabel: "Confidential", sensitivityLabelId: "conf-001", retentionLabel: "7 Year Retention", retentionLabelId: "ret-7y", ownerDisplayName: "IR Team", ownerPrincipalName: "ir@synozur.com", permissions: "Custom App Role", status: "Active", containerCreatedDate: "2025-02-14", externalSharing: true },
  ];

  const createdContainers = [];
  for (const def of containerDefs) {
    const container = await storage.createSpeContainer({
      ...def,
      tenantConnectionId,
    });
    createdContainers.push(container);

    const daysOfUsage = [0, 7, 14, 21, 28];
    for (const daysAgo of daysOfUsage) {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      const factor = 1 - (daysAgo * 0.03);
      await storage.createSpeContainerUsage({
        containerId: container.id,
        tenantConnectionId,
        storageUsedBytes: Math.round((def.storageUsedBytes || 0) * factor),
        storageTotalBytes: def.storageAllocatedBytes,
        fileCount: Math.round((def.fileCount || 0) * factor),
        activeFileCount: Math.round((def.activeFileCount || 0) * (factor + 0.1)),
        activeUsers: Math.floor(Math.random() * 50) + 5,
        apiCallCount: Math.floor(Math.random() * 50000) + 1000,
        lastActivityDate: def.lastActivityDate,
      });
    }
  }

  await Promise.all(createdTypes.map(async (ct) => {
    const containers = createdContainers.filter(c => c.containerTypeId === ct.id);
    await storage.updateSpeContainerType(ct.id, { containerCount: containers.length });
  }));

  res.json({ message: "Demo data seeded", containerTypes: createdTypes.length, containers: createdContainers.length });
});

export default router;
