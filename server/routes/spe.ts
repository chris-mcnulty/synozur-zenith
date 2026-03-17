import { Router } from "express";
import { storage } from "../storage";
import { ZENITH_ROLES } from "@shared/schema";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { fetchSpeContainerTypesViaAdmin, fetchSpeContainersViaAdmin } from "../services/graph";
import { getDelegatedSpoToken } from "../routes-entra";

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

router.post("/api/spe/tenants/:id/sync", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const conn = await storage.getTenantConnection(req.params.id);
  if (!conn) return res.status(404).json({ message: "Tenant connection not found" });

  const allowedIds = await getOrgTenantConnectionIds(req.user);
  if (allowedIds && !allowedIds.includes(conn.id)) {
    return res.status(404).json({ message: "Tenant connection not found" });
  }

  const userId = req.user!.id;
  const domain = conn.domain || "";
  const spoHost = domain.includes(".sharepoint.com")
    ? domain
    : `${domain.split(".")[0]}.sharepoint.com`;
  const adminHost = `${spoHost.split(".")[0]}-admin.sharepoint.com`;

  let adminToken: string | null = null;
  try {
    adminToken = await getDelegatedSpoToken(userId, adminHost);
  } catch (err: any) {
    console.error(`[spe-sync] Failed to get admin SPO token: ${err.message}`);
  }
  if (!adminToken) {
    return res.status(403).json({
      success: false,
      error: "Could not acquire SharePoint Admin token. Ensure you have SharePoint Admin permissions and have completed Entra consent.",
    });
  }

  try {
    console.log(`[spe-sync] Starting SPE sync for tenant ${conn.tenantName} (${conn.tenantId}) via SPO Admin API...`);

    const graphContainerTypes = await fetchSpeContainerTypesViaAdmin(adminToken, adminHost);
    console.log(`[spe-sync] Found ${graphContainerTypes.length} container types via admin API`);

    const typeIdMap = new Map<string, string>();

    for (const gct of graphContainerTypes) {
      const existing = (await storage.getSpeContainerTypes(conn.id))
        .find(ct => ct.containerTypeId === gct.ContainerTypeId);

      if (existing) {
        await storage.updateSpeContainerType(existing.id, {
          displayName: gct.DisplayName || existing.displayName,
          description: gct.Description || existing.description,
          azureAppId: gct.OwningAppId || existing.azureAppId,
          owningTenantId: gct.OwningTenantId || existing.owningTenantId,
        });
        typeIdMap.set(gct.ContainerTypeId, existing.id);
      } else {
        const created = await storage.createSpeContainerType({
          tenantConnectionId: conn.id,
          containerTypeId: gct.ContainerTypeId,
          displayName: gct.DisplayName || `Type ${gct.ContainerTypeId}`,
          description: gct.Description,
          azureAppId: gct.OwningAppId,
          owningTenantId: gct.OwningTenantId,
          status: "ACTIVE",
        });
        typeIdMap.set(gct.ContainerTypeId, created.id);
      }
    }

    const graphContainers = await fetchSpeContainersViaAdmin(adminToken, adminHost, spoHost);
    console.log(`[spe-sync] Found ${graphContainers.length} containers via admin API`);

    let syncedCount = 0;
    let errorCount = 0;

    for (const gc of graphContainers) {
      try {
        const zenithTypeId = gc.ContainerTypeId ? typeIdMap.get(gc.ContainerTypeId) : undefined;

        const containerData = {
          tenantConnectionId: conn.id,
          containerTypeId: zenithTypeId || null,
          m365ContainerId: gc.ContainerId,
          displayName: gc.ContainerName || `Container ${gc.ContainerId}`,
          description: gc.Description || null,
          status: gc.Status || "Active",
          storageUsedBytes: gc.StorageUsedInBytes ?? null,
          storageAllocatedBytes: gc.StorageTotalInBytes ?? null,
          fileCount: null as number | null,
          activeFileCount: null as number | null,
          lastActivityDate: null as string | null,
          sensitivityLabelId: gc.SensitivityLabelId || null,
          sensitivityLabel: gc.SensitivityLabel || null,
          retentionLabelId: null as string | null,
          retentionLabel: null as string | null,
          sharingCapability: gc.SharingCapability || null,
          externalSharing: gc.SharingCapability === "ExternalUserSharingOnly" ||
                           gc.SharingCapability === "ExternalUserAndGuestSharing" ||
                           gc.SharingCapability === "ExistingExternalUserSharingOnly",
          ownerDisplayName: gc.OwningApplicationName || null,
          ownerPrincipalName: gc.Owners?.[0] || null,
          permissions: gc.OwningApplicationName || "System",
          containerCreatedDate: gc.CreatedOn || null,
          lastSyncAt: new Date(),
        };

        const existingContainers = await storage.getSpeContainers(undefined, conn.id);
        const existing = existingContainers.find(c => c.m365ContainerId === gc.ContainerId);

        let savedContainer;
        if (existing) {
          savedContainer = await storage.updateSpeContainer(existing.id, containerData);
        } else {
          savedContainer = await storage.createSpeContainer(containerData);
        }

        if (savedContainer) {
          await storage.createSpeContainerUsage({
            containerId: savedContainer.id,
            tenantConnectionId: conn.id,
            storageUsedBytes: containerData.storageUsedBytes,
            storageTotalBytes: containerData.storageAllocatedBytes,
            fileCount: containerData.fileCount,
            activeFileCount: containerData.activeFileCount,
            activeUsers: null,
            apiCallCount: null,
            lastActivityDate: containerData.lastActivityDate,
          });
        }

        syncedCount++;
      } catch (err: any) {
        console.error(`[spe-sync] Error syncing container ${gc.ContainerId}:`, err.message);
        errorCount++;
      }
    }

    for (const [graphTypeId, zenithTypeId] of typeIdMap.entries()) {
      const count = graphContainers.filter(gc => gc.ContainerTypeId === graphTypeId).length;
      await storage.updateSpeContainerType(zenithTypeId, { containerCount: count });
    }

    console.log(`[spe-sync] Completed: ${syncedCount} synced, ${errorCount} errors`);

    res.json({
      success: true,
      containerTypes: graphContainerTypes.length,
      containers: syncedCount,
      errors: errorCount,
    });
  } catch (err: any) {
    console.error(`[spe-sync] Sync failed for tenant ${conn.tenantId}:`, err);
    res.status(500).json({ success: false, error: err.message || "SPE sync failed" });
  }
});

export default router;
