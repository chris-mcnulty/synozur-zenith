// Library default sensitivity label operations.
//
// Setting/reading a document library's default sensitivity label
// ("DefaultSensitivityLabelForLibrary") is NOT exposed through Microsoft
// Graph — it is only available via the SharePoint REST API. Retroactively
// labelling existing files uses the Graph beta driveItem:assignSensitivityLabel
// API, which is a protected AND metered API (per-call charges; the tenant must
// have metered Graph APIs enabled).

const GRAPH_BETA = "https://graph.microsoft.com/beta";

async function getFormDigest(
  spoToken: string,
  siteUrl: string,
): Promise<{ digest: string; error?: string }> {
  const normalizedUrl = siteUrl.replace(/\/$/, "");
  try {
    const res = await fetch(`${normalizedUrl}/_api/contextinfo`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
        "Content-Length": "0",
      },
    });
    if (!res.ok) {
      return { digest: "", error: `ContextInfo ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    const data = await res.json();
    const digest = data.FormDigestValue || data.d?.GetContextWebInformation?.FormDigestValue;
    if (!digest) return { digest: "", error: "No FormDigestValue in contextinfo response" };
    return { digest };
  } catch (e: any) {
    return { digest: "", error: e.message };
  }
}

/**
 * Read the current default sensitivity label GUID for a document library.
 * Returns labelId === null when no default is configured.
 */
export async function getLibraryDefaultLabel(
  spoToken: string,
  siteUrl: string,
  listId: string,
): Promise<{ labelId: string | null; error?: string }> {
  const normalizedUrl = siteUrl.replace(/\/$/, "");
  const url = `${normalizedUrl}/_api/web/lists(guid'${listId}')?$select=DefaultSensitivityLabelForLibrary`;
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${spoToken}`,
        Accept: "application/json;odata=nometadata",
      },
    });
    if (!res.ok) {
      return { labelId: null, error: `SharePoint REST ${res.status}: ${(await res.text()).slice(0, 300)}` };
    }
    const data = await res.json();
    const raw = data?.DefaultSensitivityLabelForLibrary;
    const labelId = raw && typeof raw === "string" && raw.replace(/[{}]/g, "").trim().length > 0
      ? raw.replace(/[{}]/g, "").trim().toLowerCase()
      : null;
    return { labelId };
  } catch (e: any) {
    return { labelId: null, error: e.message };
  }
}

/**
 * Set (or clear, when labelId is null) the default sensitivity label for a
 * document library via the SharePoint REST API.
 */
export async function setLibraryDefaultLabel(
  spoToken: string,
  siteUrl: string,
  listId: string,
  labelId: string | null,
): Promise<{ success: boolean; error?: string }> {
  const normalizedUrl = siteUrl.replace(/\/$/, "");
  const { digest, error: digestError } = await getFormDigest(spoToken, normalizedUrl);
  if (!digest) {
    return { success: false, error: `Could not acquire SharePoint form digest: ${digestError}` };
  }
  const body = JSON.stringify({
    __metadata: { type: "SP.List" },
    DefaultSensitivityLabelForLibrary: labelId ? labelId.replace(/[{}]/g, "").toLowerCase() : "",
  });
  try {
    const res = await fetch(`${normalizedUrl}/_api/web/lists(guid'${listId}')`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${spoToken}`,
        "Content-Type": "application/json;odata=verbose",
        Accept: "application/json;odata=verbose",
        "X-RequestDigest": digest,
        "IF-MATCH": "*",
        "X-HTTP-Method": "MERGE",
      },
      body,
    });
    // A successful MERGE returns 204 No Content.
    if (res.status === 204 || res.ok) return { success: true };
    return { success: false, error: `SharePoint REST ${res.status}: ${(await res.text()).slice(0, 400)}` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

interface DriveFile {
  id: string;
  name: string;
}

/**
 * Recursively enumerate file driveItems (folders excluded) under a drive.
 * Aborts cooperatively when the supplied signal fires.
 */
export async function enumerateDriveFiles(
  graphToken: string,
  driveId: string,
  signal?: AbortSignal,
): Promise<{ files: DriveFile[]; error?: string }> {
  const files: DriveFile[] = [];
  const folderStack: string[] = ["root"];
  try {
    while (folderStack.length > 0) {
      if (signal?.aborted) return { files, error: "aborted" };
      const folderId = folderStack.pop()!;
      let next: string | null =
        `${GRAPH_BETA}/drives/${driveId}/items/${folderId}/children?$select=id,name,file,folder&$top=200`;
      while (next) {
        if (signal?.aborted) return { files, error: "aborted" };
        const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${graphToken}` } });
        if (!res.ok) {
          if (res.status === 429) {
            const retry = Number(res.headers.get("Retry-After")) || 10;
            await new Promise((r) => setTimeout(r, retry * 1000));
            continue;
          }
          return { files, error: `Graph ${res.status}: ${(await res.text()).slice(0, 300)}` };
        }
        const data = await res.json();
        for (const item of data.value || []) {
          if (item.folder) folderStack.push(item.id);
          else if (item.file) files.push({ id: item.id, name: item.name });
        }
        next = data["@odata.nextLink"] || null;
      }
    }
    return { files };
  } catch (e: any) {
    return { files, error: e.message };
  }
}

/**
 * Assign a sensitivity label to a single driveItem (file at rest) via the
 * Graph beta protected/metered API. Polls the async operation to completion.
 */
export async function assignSensitivityLabelToDriveItem(
  graphToken: string,
  driveId: string,
  itemId: string,
  labelId: string,
  justificationText = "Applied via Zenith library default sensitivity label",
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${GRAPH_BETA}/drives/${driveId}/items/${itemId}/assignSensitivityLabel`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${graphToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sensitivityLabelId: labelId,
        assignmentMethod: "standard",
        justificationText,
      }),
    });
    if (res.status === 429) {
      const retry = Number(res.headers.get("Retry-After")) || 10;
      return { success: false, error: `Throttled (retry after ${retry}s)` };
    }
    if (res.status !== 202 && !res.ok) {
      return { success: false, error: `Graph ${res.status}: ${(await res.text()).slice(0, 400)}` };
    }
    const location = res.headers.get("Location");
    if (!location) return { success: true };

    // Poll the operation. assignSensitivityLabel is async; the Location URL
    // reports progress until it reaches a terminal state.
    const pollUrl = location.startsWith("http") ? location : `${GRAPH_BETA}${location}`;
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise((r) => setTimeout(r, 1500));
      const poll = await fetch(pollUrl, { headers: { Authorization: `Bearer ${graphToken}` } });
      if (!poll.ok) {
        if (poll.status === 404) return { success: true }; // operation expired after completion
        continue;
      }
      const status = await poll.json();
      const state = String(status.status || status.state || "").toLowerCase();
      if (state === "completed" || state === "succeeded") return { success: true };
      if (state === "failed") {
        return { success: false, error: status.error?.message || "assignSensitivityLabel failed" };
      }
    }
    // Operation accepted but not confirmed within the poll window — treat as
    // submitted (label assignment is eventually consistent).
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export const LIBRARY_RETRO_LABELING_ENABLED =
  process.env.LIBRARY_RETRO_LABELING_ENABLED === "true";

export const METERED_API_WARNING =
  "Retroactive labelling calls the Microsoft Graph beta driveItem:assignSensitivityLabel API, " +
  "which is a protected and metered API. Per-call charges may apply and the tenant must have " +
  "metered Microsoft Graph APIs enabled.";
