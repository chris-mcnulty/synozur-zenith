import { Router } from "express";
import { storage } from "../storage";
import { ZENITH_ROLES } from "@shared/schema";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { getAppToken, fetchSpeContainers, fetchSpeContainerTypes, fetchSpeContainerDetails } from "../services/graph";
import { decryptToken } from "../utils/encryption";

const router = Router();

function getEffectiveClientSecret(conn: { clientSecret?: string | null }): string {
  if (conn.clientSecret) {
    try { return decryptToken(conn.clientSecret); } catch { return conn.clientSecret; }
  }
  return process.env.AZURE_CLIENT_SECRET!;
}

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

  const clientId = conn.clientId || process.env.AZURE_CLIENT_ID;
  const clientSecret = getEffectiveClientSecret(conn);
  if (!clientId || !clientSecret) {
    return res.status(503).json({ success: false, error: "Zenith app credentials not configured." });
  }

  try {
    console.log(`[spe-sync] Starting SPE sync for tenant ${conn.tenantName} (${conn.tenantId})...`);
    const token = await getAppToken(conn.tenantId, clientId, clientSecret);

    const graphContainerTypes = await fetchSpeContainerTypes(token);
    console.log(`[spe-sync] Found ${graphContainerTypes.length} container types`);

    const typeIdMap = new Map<string, string>();

    for (const gct of graphContainerTypes) {
      const existing = (await storage.getSpeContainerTypes(conn.id))
        .find(ct => ct.containerTypeId === gct.containerTypeId);

      if (existing) {
        await storage.updateSpeContainerType(existing.id, {
          displayName: gct.displayName || existing.displayName,
          description: gct.description || existing.description,
          azureAppId: gct.owningAppId || existing.azureAppId,
          owningTenantId: gct.owningTenantId || existing.owningTenantId,
        });
        typeIdMap.set(gct.containerTypeId, existing.id);
      } else {
        const created = await storage.createSpeContainerType({
          tenantConnectionId: conn.id,
          containerTypeId: gct.containerTypeId,
          displayName: gct.displayName || `Type ${gct.containerTypeId}`,
          description: gct.description,
          azureAppId: gct.owningAppId,
          owningTenantId: gct.owningTenantId,
          status: "ACTIVE",
        });
        typeIdMap.set(gct.containerTypeId, created.id);
      }
    }

    const graphContainers = await fetchSpeContainers(token);
    console.log(`[spe-sync] Found ${graphContainers.length} containers`);

    let syncedCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < graphContainers.length; i += BATCH_SIZE) {
      const batch = graphContainers.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (gc) => {
        try {
          const details = await fetchSpeContainerDetails(token, gc.id);

          const ownerInfo = details.owners?.[0];
          const zenithTypeId = gc.containerTypeId ? typeIdMap.get(gc.containerTypeId) : undefined;

          const containerData = {
            tenantConnectionId: conn.id,
            containerTypeId: zenithTypeId || null,
            m365ContainerId: gc.id,
            displayName: gc.displayName || `Container ${gc.id}`,
            description: gc.description || null,
            status: gc.status === "active" ? "Active" : gc.status === "inactive" ? "Inactive" : (gc.status || "Active"),
            storageUsedBytes: details.storageUsedInBytes ?? null,
            storageAllocatedBytes: gc.storageTotalInBytes ?? null,
            fileCount: details.itemCount ?? null,
            activeFileCount: null as number | null,
            lastActivityDate: details.lastActivityDate || null,
            sensitivityLabelId: gc.sensitivityLabel?.id || null,
            sensitivityLabel: gc.sensitivityLabel?.displayName || null,
            retentionLabelId: null as string | null,
            retentionLabel: null as string | null,
            sharingCapability: null as string | null,
            externalSharing: false,
            ownerDisplayName: ownerInfo?.displayName || null,
            ownerPrincipalName: ownerInfo?.userPrincipalName || null,
            permissions: details.owners && details.owners.length > 0 ? "Custom App Role" : "System",
            containerCreatedDate: gc.createdDateTime || null,
            lastSyncAt: new Date(),
          };

          const existingContainers = await storage.getSpeContainers(undefined, conn.id);
          const existing = existingContainers.find(c => c.m365ContainerId === gc.id);

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
              activeUsers: details.owners?.length ?? null,
              apiCallCount: null,
              lastActivityDate: containerData.lastActivityDate,
            });
          }

          syncedCount++;
        } catch (err: any) {
          console.error(`[spe-sync] Error syncing container ${gc.id}:`, err.message);
          errorCount++;
        }
      }));
    }

    for (const [graphTypeId, zenithTypeId] of typeIdMap.entries()) {
      const count = graphContainers.filter(gc => gc.containerTypeId === graphTypeId).length;
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
