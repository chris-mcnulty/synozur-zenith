/**
 * Information Architecture sync service.
 *
 * Walks all visible document libraries for a tenant, fetches per-library
 * content types and columns from the Graph API, persists them into
 * library_content_types / library_columns, and refreshes content_type
 * usage rollups. Safe to call standalone or through the dataset dispatcher.
 *
 * Entry point: runIASync(tenantConnectionId, tenantId, clientId, clientSecret)
 */

import { storage } from "../storage";
import {
  getAppToken,
  graphFetchWithRetry,
  fetchLibraryDetails,
  fetchLibraryFolderDepth,
  fetchLibraryViews,
  fetchLibraryItemFillRates,
} from "./graph";

export interface IASyncSummary {
  workspacesProcessed: number;
  librariesProcessed: number;
  contentTypesUpserted: number;
  columnsUpserted: number;
  errors: number;
}

function classifyCtScope(
  contentTypeId: string,
  isInherited: boolean,
  hubCtIds: Set<string>,
): "HUB" | "SITE" | "LIBRARY" {
  if (hubCtIds.has(contentTypeId)) return "HUB";
  if (isInherited) return "SITE";
  return "LIBRARY";
}

export async function runIASync(
  tenantConnectionId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
  /** Optional pre-acquired Graph token (e.g. delegated). If omitted, an app token is fetched. */
  preAcquiredToken?: string,
): Promise<IASyncSummary> {
  const token = preAcquiredToken ?? await getAppToken(tenantId, clientId, clientSecret);

  const hubContentTypes = await storage.getContentTypes(tenantConnectionId);
  const hubCtIds = new Set(hubContentTypes.filter(c => c.isHub).map(c => c.contentTypeId));

  const allLibraries = await storage.getDocumentLibrariesByTenant(tenantConnectionId);
  const visibleLibraries = allLibraries.filter(l => !l.hidden);
  const byWorkspace = new Map<string, typeof visibleLibraries>();
  for (const lib of visibleLibraries) {
    const arr = byWorkspace.get(lib.workspaceId) || [];
    arr.push(lib);
    byWorkspace.set(lib.workspaceId, arr);
  }
  const workspaceIds = Array.from(byWorkspace.keys());
  console.log(`[ia-sync] Starting for ${visibleLibraries.length} libraries across ${workspaceIds.length} workspaces`);

  const result: IASyncSummary = {
    workspacesProcessed: 0,
    librariesProcessed: 0,
    contentTypesUpserted: 0,
    columnsUpserted: 0,
    errors: 0,
  };

  // 3 concurrent workspaces keeps per-tenant Graph request rate well below
  // throttling limits on large tenants (88+ sites produced heavy 429s at 5).
  const BATCH_SIZE = 3;
  for (let i = 0; i < workspaceIds.length; i += BATCH_SIZE) {
    const batch = workspaceIds.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (wsId) => {
        const ws = await storage.getWorkspace(wsId);
        if (!ws?.m365ObjectId) return;
        const graphSiteId = ws.m365ObjectId;

        // Load the site's site-columns once so we can tag library columns as SITE vs LIBRARY.
        const siteColumnNames = new Set<string>();
        try {
          let pageUrl: string | null =
            `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/columns?$select=id,name&$top=200`;
          while (pageUrl) {
            const sres = await graphFetchWithRetry(pageUrl, { headers: { Authorization: `Bearer ${token}` } });
            if (!sres.ok) break;
            const sdata = await sres.json();
            for (const sc of sdata.value || []) {
              if (sc.name) siteColumnNames.add(sc.name);
            }
            pageUrl = sdata["@odata.nextLink"] || null;
          }
        } catch (e: any) {
          console.warn(`[ia-sync] Could not fetch site columns for ${graphSiteId}: ${e.message}`);
        }

        // Build a listId → driveId map for folder-depth crawls.
        const listIdToDriveId = new Map<string, string>();
        try {
          let drivesNextLink: string | null =
            `https://graph.microsoft.com/v1.0/sites/${graphSiteId}/drives?$select=id,name,webUrl&$top=100`;
          while (drivesNextLink) {
            const drivesRes = await graphFetchWithRetry(drivesNextLink, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!drivesRes.ok) {
              console.warn(`[ia-sync] drives page returned ${drivesRes.status} for ${graphSiteId}`);
              break;
            }
            const drivesData = await drivesRes.json();
            for (const drive of drivesData.value || []) {
              try {
                const listRes = await graphFetchWithRetry(
                  `https://graph.microsoft.com/v1.0/drives/${drive.id}/list?$select=id`,
                  { headers: { Authorization: `Bearer ${token}` } },
                );
                if (listRes.ok) {
                  const listData = await listRes.json();
                  if (listData.id) listIdToDriveId.set(listData.id, drive.id);
                }
              } catch { /* skip individual drive lookup failures */ }
            }
            drivesNextLink = drivesData["@odata.nextLink"] || null;
          }
        } catch (e: any) {
          console.warn(`[ia-sync] Could not fetch drives for ${graphSiteId}: ${e.message}`);
        }

        const libs = byWorkspace.get(wsId) || [];
        for (const lib of libs) {
          try {
            const details = await fetchLibraryDetails(token, graphSiteId, lib.m365ListId);
            if (details.error) {
              result.errors++;
              console.warn(`[ia-sync] fetchLibraryDetails error for ${lib.displayName}: ${details.error}`);
              continue;
            }

            const driveId = listIdToDriveId.get(lib.m365ListId) || lib.m365DriveId || "";
            const [folderInfo, viewInfo] = await Promise.all([
              fetchLibraryFolderDepth(token, driveId),
              fetchLibraryViews(token, graphSiteId, lib.m365ListId),
            ]);

            const customColNames = details.columns.filter(c => c.isCustom).map(c => c.name);
            const fillResult =
              customColNames.length > 0
                ? await fetchLibraryItemFillRates(token, graphSiteId, lib.m365ListId, customColNames)
                : { fillRates: new Map<string, number>(), sampleSize: 0 };

            if (driveId || folderInfo.maxDepth > 0 || viewInfo.totalViews > 0) {
              await storage.upsertDocumentLibrary({
                workspaceId: lib.workspaceId,
                tenantConnectionId,
                m365ListId: lib.m365ListId,
                displayName: lib.displayName,
                m365DriveId: driveId || null,
                maxFolderDepth: folderInfo.error ? null : folderInfo.maxDepth,
                totalFolderCount: folderInfo.error ? null : folderInfo.folderCount,
                customViewCount: viewInfo.error ? null : viewInfo.customViews,
                totalViewCount: viewInfo.error ? null : viewInfo.totalViews,
              });
            }

            const ctRows = details.contentTypes.map(ct => ({
              workspaceId: lib.workspaceId,
              tenantConnectionId,
              documentLibraryId: lib.id,
              contentTypeId: ct.id,
              parentContentTypeId: ct.parentId,
              name: ct.name,
              group: ct.group,
              description: ct.description,
              scope: classifyCtScope(ct.id, ct.isInherited, hubCtIds),
              isBuiltIn: ct.isBuiltIn,
              isInherited: ct.isInherited,
              hidden: ct.hidden,
            }));

            const colRows = details.columns.map(col => ({
              workspaceId: lib.workspaceId,
              tenantConnectionId,
              documentLibraryId: lib.id,
              columnInternalName: col.name,
              displayName: col.displayName,
              columnType: col.type,
              columnGroup: col.columnGroup,
              description: col.description,
              scope: (siteColumnNames.has(col.name) ? "SITE" : "LIBRARY") as "SITE" | "LIBRARY",
              isCustom: col.isCustom,
              isSyntexManaged: col.isSyntexManaged,
              isSealed: col.sealed,
              isReadOnly: col.readOnly,
              isIndexed: col.indexed,
              isRequired: col.required,
              fillRatePct: fillResult.fillRates.get(col.name) ?? null,
              fillRateSampleSize: fillResult.fillRates.has(col.name) ? fillResult.sampleSize : null,
            }));

            const counts = await storage.replaceLibraryIaData(lib.id, ctRows, colRows);
            result.contentTypesUpserted += counts.contentTypesCount;
            result.columnsUpserted += counts.columnsCount;
            result.librariesProcessed++;
          } catch (libErr: any) {
            result.errors++;
            console.error(`[ia-sync] Library ${lib.displayName} failed: ${libErr.message}`);
          }
        }
        result.workspacesProcessed++;
      }),
    );
  }

  await storage.updateContentTypeUsageCounts(tenantConnectionId);
  console.log(
    `[ia-sync] Complete: ${result.librariesProcessed} libraries, ` +
    `${result.contentTypesUpserted} CTs, ${result.columnsUpserted} columns, ${result.errors} errors`,
  );

  return result;
}
