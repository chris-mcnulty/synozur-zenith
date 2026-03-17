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

router.post("/api/spe/container-types", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const { tenantConnectionId, displayName, azureAppId, description } = req.body;
    if (!tenantConnectionId || !displayName || !azureAppId) {
      return res.status(400).json({ error: "tenantConnectionId, displayName, and azureAppId are required" });
    }

    const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!guidRegex.test(azureAppId)) {
      return res.status(400).json({ error: "azureAppId must be a valid GUID" });
    }

    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(tenantConnectionId)) {
      return res.status(404).json({ error: "Tenant connection not found" });
    }

    const existing = (await storage.getSpeContainerTypes(tenantConnectionId))
      .find(ct => ct.azureAppId === azureAppId);
    if (existing) {
      return res.status(409).json({ error: "An application with this App ID is already registered", existing });
    }

    const created = await storage.createSpeContainerType({
      tenantConnectionId,
      containerTypeId: azureAppId,
      displayName,
      description: description || `${displayName} containers`,
      azureAppId,
      status: "ACTIVE",
    });

    res.status(201).json(created);
  } catch (err: any) {
    console.error("[spe] Error creating container type:", err);
    res.status(500).json({ error: err.message || "Failed to register application" });
  }
});

router.delete("/api/spe/container-types/:id", requireRole(ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const ct = (await storage.getSpeContainerTypes()).find(t => t.id === req.params.id);
    if (!ct) return res.status(404).json({ error: "Container type not found" });
    const allowedIds = await getOrgTenantConnectionIds(req.user);
    if (allowedIds && !allowedIds.includes(ct.tenantConnectionId)) {
      return res.status(404).json({ error: "Container type not found" });
    }
    await storage.deleteSpeContainerType(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

    const existingTypesForApps = await storage.getSpeContainerTypes(conn.id);
    const customApps = existingTypesForApps
      .filter(ct => ct.azureAppId)
      .map(ct => ({ name: ct.displayName, appId: ct.azureAppId! }));

    const graphContainers = await fetchAllSpeContainers(
      graphToken || "",
      adminToken || "",
      adminHost,
      customApps
    );
    console.log(`[spe-sync] Found ${graphContainers.length} containers`);

    if (containerTypes.length === 0 && graphContainers.length > 0) {
      const appGroups = new Map<string, { name: string; appId: string; typeId: string }>();
      for (const gc of graphContainers) {
        const ext = gc as any;
        const appId = ext._owningAppId;
        const appName = ext._owningAppName;
        if (appId && !appGroups.has(appId)) {
          appGroups.set(appId, { name: appName || appId, appId, typeId: gc.containerTypeId || appId });
        }
      }

      const existingTypes = await storage.getSpeContainerTypes(conn.id);
      for (const [appId, info] of appGroups) {
        const existing = existingTypes.find(ct => ct.azureAppId === appId || ct.containerTypeId === info.typeId);
        if (existing) {
          typeIdMap.set(info.typeId, existing.id);
          typeIdMap.set(appId, existing.id);
          await storage.updateSpeContainerType(existing.id, {
            displayName: info.name,
            azureAppId: appId,
          });
        } else {
          try {
            const created = await storage.createSpeContainerType({
              tenantConnectionId: conn.id,
              containerTypeId: info.typeId,
              displayName: info.name,
              description: `${info.name} containers`,
              azureAppId: appId,
              status: "ACTIVE",
            });
            typeIdMap.set(info.typeId, created.id);
            typeIdMap.set(appId, created.id);
            console.log(`[spe-sync] Auto-created container type for ${info.name}`);
          } catch (err: any) {
            if (err.message?.includes("duplicate key")) {
              const refreshed = await storage.getSpeContainerTypes(conn.id);
              const found = refreshed.find(ct => ct.azureAppId === appId || ct.containerTypeId === info.typeId);
              if (found) {
                typeIdMap.set(info.typeId, found.id);
                typeIdMap.set(appId, found.id);
              }
            } else {
              throw err;
            }
          }
        }
      }
    }

    let syncedCount = 0;
    let errorCount = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < graphContainers.length; i += BATCH_SIZE) {
      const batch = graphContainers.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map(async (gc) => {
        try {
          const ext = gc as any;

          const zenithTypeId = (gc.containerTypeId ? typeIdMap.get(gc.containerTypeId) : undefined)
            || (ext._owningAppId ? typeIdMap.get(ext._owningAppId) : undefined);

          const sharingCap = ext._sharingCapability != null ? String(ext._sharingCapability) : null;
          const isExternal = sharingCap === "1" || sharingCap === "2" ||
            sharingCap === "ExternalUserSharingOnly" || sharingCap === "ExternalUserAndGuestSharing";

          const containerData = {
            tenantConnectionId: conn.id,
            containerTypeId: zenithTypeId || null,
            m365ContainerId: gc.id,
            displayName: gc.displayName || `Container ${gc.id}`,
            description: gc.description || null,
            status: gc.status === "active" ? "Active" : gc.status === "inactive" ? "Inactive" : (gc.status || "Active"),
            storageUsedBytes: ext._storageUsed ?? null,
            storageAllocatedBytes: ext._storageTotal ?? null,
            fileCount: null as number | null,
            activeFileCount: null as number | null,
            lastActivityDate: null as string | null,
            sensitivityLabelId: null as string | null,
            sensitivityLabel: ext._sensitivityLabel || null,
            retentionLabelId: null as string | null,
            retentionLabel: null as string | null,
            sharingCapability: sharingCap,
            externalSharing: isExternal,
            ownerDisplayName: ext._owningAppName || null,
            ownerPrincipalName: typeof ext._owners === "string" ? ext._owners : null,
            permissions: ext._owningAppName || "System",
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
