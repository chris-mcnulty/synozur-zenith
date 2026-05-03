/**
 * Saved View Digest Job
 *
 * Periodically evaluates saved view subscriptions and emails the subscriber
 * a summary of new items that have appeared since the last digest.
 *
 * The job applies a best-effort server-side evaluation of the view's filterJson
 * against the org's workspaces, then diffs the result against the stored
 * snapshot. If new items are detected (or the snapshot is missing), a digest
 * email is sent via SendGrid.
 */
import { storage } from "../storage";
import { getUncachableSendGridClient } from "../services/sendgrid-client";
import type { SavedViewSubscription, SavedView, Workspace } from "@shared/schema";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "https://zenith.synozur.com";

const CADENCE_WINDOW_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Apply known filterJson keys against a workspace record.
 * Returns true if the workspace matches all active filters.
 */
function matchesFilter(w: Workspace, filterJson: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(filterJson)) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    switch (key) {
      case "externalSharing":
        if (value === "enabled" && !w.externalSharing) return false;
        if (value === "disabled" && w.externalSharing) return false;
        break;
      case "owners":
        if (value === "none" && w.owners !== 0) return false;
        break;
      case "sensitivity":
        if (typeof value === "string" && w.sensitivity !== value) return false;
        break;
      case "sensitivityLabel":
        if (value === "missing" && w.sensitivityLabelId) return false;
        if (value === "present" && !w.sensitivityLabelId) return false;
        break;
      case "lastActivity":
        if (value === "stale_90" && w.lastActivityDate) {
          const actDate = new Date(w.lastActivityDate);
          const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          if (actDate > cutoff) return false;
        }
        break;
      case "type":
        if (typeof value === "string" && w.type !== value) return false;
        break;
      case "metadataStatus":
        if (typeof value === "string" && w.metadataStatus !== value) return false;
        break;
      case "copilotReady":
        if (value === true && !w.copilotReady) return false;
        if (value === false && w.copilotReady) return false;
        break;
      case "usage":
        if (typeof value === "string" && w.usage !== value) return false;
        break;
      default:
        break;
    }
  }
  return true;
}

function renderDigestHtml(opts: {
  userName: string;
  viewName: string;
  viewId: string;
  frequency: string;
  newItems: Workspace[];
  totalCount: number;
  previousCount: number;
  unsubscribeUrl: string;
}): string {
  const { userName, viewName, viewId, frequency, newItems, totalCount, previousCount, unsubscribeUrl } = opts;
  const viewUrl = `${APP_PUBLIC_URL}/app/site-governance?view=${encodeURIComponent(viewId)}`;
  const cadenceLabel = frequency === "daily" ? "Daily" : "Weekly";
  const newCount = newItems.length;

  const rowsHtml = newItems.slice(0, 20).map((w) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">
        ${escapeHtml(w.displayName)}
        ${w.sensitivity ? `<span style="margin-left:8px;font-size:11px;color:#6b7280;">[${escapeHtml(w.sensitivity)}]</span>` : ""}
      </td>
    </tr>`).join("");

  const moreCount = newItems.length > 20 ? newItems.length - 20 : 0;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Zenith ${cadenceLabel} View Digest: ${escapeHtml(viewName)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:640px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#5b0fbc;padding:24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Zenith ${cadenceLabel} Digest</h1>
              <p style="margin:6px 0 0;color:#ddd6fe;font-size:13px;">${escapeHtml(viewName)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 8px;color:#111827;font-size:16px;">Hi ${escapeHtml(userName)},</p>
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">
                Your saved view <strong>${escapeHtml(viewName)}</strong> now contains
                <strong>${totalCount}</strong> ${totalCount === 1 ? "item" : "items"}
                ${newCount > 0 ? `— <strong>${newCount} new</strong> since your last digest` : `(no new items since your last digest)`}.
              </p>
            </td>
          </tr>
          ${newCount > 0 ? `
          <tr>
            <td style="padding:0 24px 8px;">
              <p style="margin:0 0 8px;color:#374151;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">New Items</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                ${rowsHtml}
                ${moreCount > 0 ? `<tr><td style="padding:10px 12px;color:#6b7280;font-size:12px;">+${moreCount} more — open the view to see all</td></tr>` : ""}
              </table>
            </td>
          </tr>` : ""}
          <tr>
            <td style="padding:${newCount > 0 ? "16px" : "0"} 24px 28px;">
              <a href="${viewUrl}" style="display:inline-block;background:#5b0fbc;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
                Open View in Zenith
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
                You subscribed to ${frequency} digests for this view.
                <a href="${unsubscribeUrl}" style="color:#5b0fbc;">Unsubscribe from this view</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function processSavedViewSubscription(sub: SavedViewSubscription): Promise<{ sent: boolean; reason?: string }> {
  const now = new Date();

  // Cadence gate
  const windowMs = CADENCE_WINDOW_MS[sub.frequency] ?? CADENCE_WINDOW_MS.weekly;
  if (sub.lastSentAt) {
    const elapsed = now.getTime() - new Date(sub.lastSentAt).getTime();
    if (elapsed < windowMs - 60 * 60 * 1000) {
      return { sent: false, reason: "interval_not_elapsed" };
    }
  }

  const [view, user] = await Promise.all([
    storage.getSavedView(sub.savedViewId),
    storage.getUser(sub.userId),
  ]);

  if (!view) return { sent: false, reason: "view_not_found" };
  if (!user) return { sent: false, reason: "user_not_found" };

  // Load all workspaces for the org and apply the view's filter
  const allWorkspaces = await storage.getWorkspaces(undefined, undefined, sub.organizationId);
  const filterJson = (view.filterJson ?? {}) as Record<string, unknown>;
  const matched = allWorkspaces.filter((w) => matchesFilter(w, filterJson));
  const matchedIds = matched.map((w) => w.id).sort();
  const snapshot = sub.lastSnapshotJson;

  // Determine new items (ids in matched but not in previous snapshot)
  const previousIds = new Set(snapshot?.ids ?? []);
  const newItems = matched.filter((w) => !previousIds.has(w.id));

  // If we have a previous snapshot and nothing changed, still send on schedule
  // (first run: always send to establish the baseline)
  const isFirstRun = !snapshot;
  if (!isFirstRun && newItems.length === 0) {
    // Update snapshot only (no email needed — view hasn't changed)
    await storage.updateSavedViewSubscriptionSnapshot(sub.id, { ids: matchedIds, count: matched.length }, now);
    return { sent: false, reason: "no_new_items" };
  }

  const unsubscribeUrl = `${APP_PUBLIC_URL}/api/saved-views/${encodeURIComponent(sub.savedViewId)}/subscription?action=unsubscribe&userId=${encodeURIComponent(sub.userId)}`;
  const userName = user.name ? user.name.split(" ")[0] : user.email;

  const html = renderDigestHtml({
    userName,
    viewName: view.name,
    viewId: sub.savedViewId,
    frequency: sub.frequency,
    newItems: isFirstRun ? matched.slice(0, 20) : newItems,
    totalCount: matched.length,
    previousCount: snapshot?.count ?? 0,
    unsubscribeUrl,
  });

  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    const subject = isFirstRun
      ? `Your Zenith view digest: ${view.name} — ${matched.length} ${matched.length === 1 ? "item" : "items"}`
      : `Zenith view digest: ${view.name} — ${newItems.length} new ${newItems.length === 1 ? "item" : "items"}`;
    await client.send({ to: user.email, from: fromEmail, subject, html });
  } catch (err: any) {
    console.error(`[saved-view-digest] Failed to send digest to ${user.email}:`, err?.message || err);
    return { sent: false, reason: "send_failed" };
  }

  await storage.updateSavedViewSubscriptionSnapshot(sub.id, { ids: matchedIds, count: matched.length }, now);
  return { sent: true };
}

export async function runSavedViewDigestSweep(): Promise<{ candidates: number; sent: number; skipped: number }> {
  const subs = await storage.listAllSavedViewSubscriptions();
  let sent = 0;
  let skipped = 0;
  for (const sub of subs) {
    try {
      const result = await processSavedViewSubscription(sub);
      if (result.sent) sent++;
      else skipped++;
    } catch (err) {
      skipped++;
      console.error("[saved-view-digest] Error processing subscription", sub.id, err);
    }
  }
  return { candidates: subs.length, sent, skipped };
}

let digestTimer: NodeJS.Timeout | null = null;

export function startSavedViewDigestScheduler(): void {
  if (digestTimer) return;
  const HOUR_MS = 60 * 60 * 1000;
  const runSweep = async () => {
    try {
      const stats = await runSavedViewDigestSweep();
      if (stats.sent > 0) {
        console.log(`[saved-view-digest] Sweep: sent=${stats.sent} skipped=${stats.skipped} candidates=${stats.candidates}`);
      }
    } catch (err) {
      console.error("[saved-view-digest] sweep failed:", err);
    }
  };
  // First sweep 5 minutes after startup
  setTimeout(() => void runSweep(), 5 * 60 * 1000);
  digestTimer = setInterval(() => void runSweep(), HOUR_MS);
  digestTimer.unref?.();
}
