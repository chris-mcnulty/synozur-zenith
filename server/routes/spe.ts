import { Router } from "express";
import { storage } from "../storage";
import { ZENITH_ROLES } from "@shared/schema";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { getAppToken, fetchAllSpeContainerTypes, fetchAllSpeContainers, fetchSpeContainerDriveDetails } from "../services/graph";
import { getDelegatedSpoToken } from "../routes-entra";
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

  const userId = req.user!.id;
  const domain = conn.domain || "";
  const spoHost = domain.includes(".sharepoint.com")
    ? domain
    : `${domain.split(".")[0]}.sharepoint.com`;
  const adminHost = `${spoHost.split(".")[0]}-admin.sharepoint.com`;

  const clientId = conn.clientId || process.env.AZURE_CLIENT_ID;
  const clientSecret = getEffectiveClientSecret(conn);

  let graphToken: string | null = null;
  if (clientId && clientSecret && conn.tenantId) {
    try {
      graphToken = await getAppToken(conn.tenantId, clientId, clientSecret);
      console.log(`[spe-sync] Got Graph app token for tenant ${conn.tenantName}`);
    } catch (err: any) {
      console.warn(`[spe-sync] Could not get Graph app token: ${err.message}`);
    }
  }

  let adminToken: string | null = null;
  try {
    adminToken = await getDelegatedSpoToken(userId, adminHost);
    if (adminToken) {
      console.log(`[spe-sync] Got SPO Admin token for ${adminHost}`);
    }
  } catch (err: any) {
    console.warn(`[spe-sync] Could not get SPO Admin token: ${err.message}`);
  }

  if (!graphToken && !adminToken) {
    return res.status(403).json({
      success: false,
      error: "Could not acquire any token for SPE sync. Ensure Entra consent is completed and app credentials are configured.",
    });
  }

  try {
    console.log(`[spe-sync] Starting SPE sync for tenant ${conn.tenantName} (${conn.tenantId})...`);

    const containerTypes = await fetchAllSpeContainerTypes(
      graphToken || "",
      adminToken || "",
      adminHost
    );
    console.log(`[spe-sync] Found ${containerTypes.length} container types`);

    const typeIdMap = new Map<string, string>();

    for (const gct of containerTypes) {
      const existing = (await storage.getSpeContainerTypes(conn.id))
        .find(ct => ct.containerTypeId === gct.containerTypeId);

      if (existing) {
        await storage.updateSpeContainerType(existing.id, {
          displayName: gct.displayName || existing.displayName,
          description: gct.description || existing.description,
          azureAppId: gct.owningAppId || existing.azureAppId,
        });
        typeIdMap.set(gct.containerTypeId, existing.id);
      } else {
        const created = await storage.createSpeContainerType({
          tenantConnectionId: conn.id,
          containerTypeId: gct.containerTypeId,
          displayName: gct.displayName || `Type ${gct.containerTypeId}`,
          description: gct.description,
          azureAppId: gct.owningAppId,
          status: "ACTIVE",
        });
        typeIdMap.set(gct.containerTypeId, created.id);
      }
    }

    const graphContainers = await fetchAllSpeContainers(
      graphToken || "",
      adminToken || "",
      adminHost
    );
    console.log(`[spe-sync] Found ${graphContainers.length} containers`);

    let syncedCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < graphContainers.length; i += BATCH_SIZE) {
      const batch = graphContainers.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (gc) => {
        try {
          let details: any = {};
          if (graphToken) {
            try {
              details = await fetchSpeContainerDriveDetails(graphToken, gc.id);
            } catch {}
          }

          const zenithTypeId = gc.containerTypeId ? typeIdMap.get(gc.containerTypeId) : undefined;

          const containerData = {
            tenantConnectionId: conn.id,
            containerTypeId: zenithTypeId || null,
            m365ContainerId: gc.id,
            displayName: gc.displayName || `Container ${gc.id}`,
            description: gc.description || null,
            status: gc.status === "active" ? "Active" : gc.status === "inactive" ? "Inactive" : (gc.status || "Active"),
            storageUsedBytes: details.storageUsedInBytes ?? null,
            storageAllocatedBytes: null as number | null,
            fileCount: details.itemCount ?? null,
            activeFileCount: null as number | null,
            lastActivityDate: details.lastActivityDate || null,
            sensitivityLabelId: null as string | null,
            sensitivityLabel: null as string | null,
            retentionLabelId: null as string | null,
            retentionLabel: null as string | null,
            sharingCapability: null as string | null,
            externalSharing: false,
            ownerDisplayName: details.owners?.[0]?.displayName || null,
            ownerPrincipalName: details.owners?.[0]?.userPrincipalName || null,
            permissions: details.owners?.length > 0 ? "Custom" : "System",
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
      containerTypes: containerTypes.length,
      containers: syncedCount,
      errors: errorCount,
    });
  } catch (err: any) {
    console.error(`[spe-sync] Sync failed for tenant ${conn.tenantId}:`, err);
    res.status(500).json({ success: false, error: err.message || "SPE sync failed" });
  }
});

export default router;
