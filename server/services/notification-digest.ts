/**
 * BL-013 — Governance digest builder.
 *
 * Aggregates a user's recent notifications into an HTML digest email and
 * sends it via SendGrid. The scheduler walks all users with `digestCadence`
 * of `daily` or `weekly` and sends a digest if their interval has elapsed.
 *
 * Quiet hours (per-user and per-org) defer sending until the next sweep.
 */
import { storage } from "../storage";
import { getUncachableSendGridClient } from "./sendgrid-client";
import { logAuditEvent, AUDIT_ACTIONS } from "./audit-logger";
import {
  passesOrgRules,
  passesUserPreferences,
} from "./notification-events";
import {
  NOTIFICATION_CATEGORY_LABELS,
  type DigestCadence,
  type Notification,
  type NotificationCategory,
  type NotificationPreferences,
  type NotificationRules,
  type User,
} from "@shared/schema";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "https://zenith.synozur.com";

const SEVERITY_COLOR: Record<string, string> = {
  info: "#5b0fbc",
  warning: "#d97706",
  critical: "#dc2626",
};

function cadenceWindowMs(cadence: DigestCadence): number {
  if (cadence === "daily") return 24 * 60 * 60 * 1000;
  if (cadence === "weekly") return 7 * 24 * 60 * 60 * 1000;
  return 0;
}

function isInQuietHours(now: Date, start: number | null, end: number | null): boolean {
  if (start === null || end === null) return false;
  const hour = now.getUTCHours();
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  // Wraps over midnight, e.g. 22 → 6
  return hour >= start || hour < end;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function groupByCategory(notifs: Notification[]): Record<string, Notification[]> {
  const out: Record<string, Notification[]> = {};
  for (const n of notifs) {
    (out[n.category] = out[n.category] || []).push(n);
  }
  return out;
}

export interface DigestSummary {
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  notifications: Notification[];
  windowStart: Date;
  windowEnd: Date;
}

export async function buildDigestSummary(
  userId: string,
  cadence: DigestCadence,
  context?: {
    prefs?: NotificationPreferences | null;
    rules?: NotificationRules | null;
  },
): Promise<DigestSummary> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - (cadenceWindowMs(cadence) || 7 * 24 * 60 * 60 * 1000));
  const raw = await storage.getNotificationsForUser(userId, {
    since: windowStart,
    limit: 500,
  });

  // Apply org rules + user category preferences at digest time so the email
  // matches what the recipient asked to see, even if rows were created under
  // a previous configuration.
  const prefs = context?.prefs ?? (await storage.getNotificationPreferences(userId));
  let rules = context?.rules;
  if (rules === undefined) {
    const user = await storage.getUser(userId);
    rules = user?.organizationId ? await storage.getNotificationRules(user.organizationId) : null;
  }

  const notifs = raw.filter(
    (n) =>
      passesOrgRules(n.category as NotificationCategory, n.severity as any, rules ?? null) &&
      passesUserPreferences(n.category as NotificationCategory, prefs ?? null),
  );

  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const n of notifs) {
    byCategory[n.category] = (byCategory[n.category] || 0) + 1;
    bySeverity[n.severity] = (bySeverity[n.severity] || 0) + 1;
  }
  return {
    total: notifs.length,
    byCategory,
    bySeverity,
    notifications: notifs,
    windowStart,
    windowEnd,
  };
}

export function renderDigestHtml(
  user: User,
  summary: DigestSummary,
  prefs: NotificationPreferences,
  cadence: DigestCadence,
): string {
  const firstName = user.name ? user.name.split(" ")[0] : user.email;
  const cadenceLabel = cadence === "daily" ? "Daily" : "Weekly";
  const grouped = groupByCategory(summary.notifications);
  const settingsUrl = `${APP_PUBLIC_URL}/app/settings/notifications`;
  const unsubUrl = `${APP_PUBLIC_URL}/api/notifications/unsubscribe?token=${encodeURIComponent(prefs.unsubscribeToken)}`;

  const sectionHtml = Object.entries(grouped)
    .map(([category, items]) => {
      const label = NOTIFICATION_CATEGORY_LABELS[category as keyof typeof NOTIFICATION_CATEGORY_LABELS] || category;
      const rows = items
        .slice(0, 10)
        .map((n) => {
          const color = SEVERITY_COLOR[n.severity] || SEVERITY_COLOR.info;
          const link = n.link ? `${APP_PUBLIC_URL}${n.link.startsWith("/") ? "" : "/"}${n.link}` : settingsUrl;
          return `
            <tr>
              <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;">
                <div style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:8px;"></div>
                <a href="${link}" style="color:#111827;text-decoration:none;font-size:14px;font-weight:500;">${escapeHtml(n.title)}</a>
                ${n.body ? `<div style="color:#6b7280;font-size:13px;margin-top:4px;">${escapeHtml(n.body)}</div>` : ""}
              </td>
            </tr>`;
        })
        .join("");
      const moreCount = items.length > 10 ? items.length - 10 : 0;
      return `
        <tr>
          <td style="padding:20px 24px 8px;">
            <p style="margin:0;color:#374151;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
              ${escapeHtml(label)} · ${items.length}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 24px 8px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
              ${rows}
              ${moreCount > 0 ? `<tr><td style="padding:10px 12px;color:#6b7280;font-size:12px;">+${moreCount} more</td></tr>` : ""}
            </table>
          </td>
        </tr>`;
    })
    .join("");

  const emptyHtml = `
    <tr>
      <td style="padding:24px;color:#6b7280;font-size:14px;">
        No new governance events in the last ${cadence === "daily" ? "24 hours" : "7 days"}.
        Your tenants are quiet — nothing to act on right now.
      </td>
    </tr>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Zenith ${cadenceLabel} Governance Digest</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:640px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#5b0fbc;padding:24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Zenith ${cadenceLabel} Digest</h1>
              <p style="margin:6px 0 0;color:#ddd6fe;font-size:13px;">${summary.windowStart.toUTCString().slice(0, 16)} → ${summary.windowEnd.toUTCString().slice(0, 16)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 8px;color:#111827;font-size:16px;">Hi ${escapeHtml(firstName)},</p>
              <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">
                Here's your governance summary for the last ${cadence === "daily" ? "day" : "week"} —
                <strong>${summary.total}</strong> ${summary.total === 1 ? "event" : "events"} across
                ${Object.keys(summary.byCategory).length} ${Object.keys(summary.byCategory).length === 1 ? "category" : "categories"}.
              </p>
            </td>
          </tr>
          ${summary.total === 0 ? emptyHtml : sectionHtml}
          <tr>
            <td style="padding:8px 24px 28px;">
              <a href="${settingsUrl}" style="display:inline-block;background:#5b0fbc;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
                Open Notifications Center
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
                You're receiving this because you opted into ${cadence} digests.
                <a href="${settingsUrl}" style="color:#5b0fbc;">Manage preferences</a> · <a href="${unsubUrl}" style="color:#5b0fbc;">Unsubscribe with one click</a>
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

function renderInstantAlertHtml(user: User, notification: Notification): string {
  const firstName = user.name ? user.name.split(" ")[0] : user.email;
  const color = SEVERITY_COLOR[notification.severity] || SEVERITY_COLOR.info;
  const link = notification.link
    ? `${APP_PUBLIC_URL}${notification.link.startsWith("/") ? "" : "/"}${notification.link}`
    : `${APP_PUBLIC_URL}/app/settings/notifications`;
  const settingsUrl = `${APP_PUBLIC_URL}/app/settings/notifications`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Zenith Critical Alert</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:640px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#dc2626;padding:24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">&#9888; Critical Governance Alert</h1>
              <p style="margin:6px 0 0;color:#fecaca;font-size:13px;">Immediate attention required</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <p style="margin:0 0 16px;color:#111827;font-size:16px;">Hi ${escapeHtml(firstName)},</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:2px solid ${color};border-radius:6px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;background:#fef2f2;">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <div style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${color};margin-right:8px;"></div>
                      <span style="color:#991b1b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Critical</span>
                    </div>
                    <p style="margin:8px 0 4px;color:#111827;font-size:16px;font-weight:600;">${escapeHtml(notification.title)}</p>
                    ${notification.body ? `<p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">${escapeHtml(notification.body)}</p>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 28px;">
              <a href="${link}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;margin-right:8px;">
                View Details
              </a>
              <a href="${settingsUrl}" style="display:inline-block;background:#f3f4f6;color:#374151;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
                Notification Settings
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;">
                You received this because you have real-time critical alerts enabled.
                <a href="${settingsUrl}" style="color:#5b0fbc;">Manage preferences</a>
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

/**
 * Send an immediate email alert for a single critical notification.
 * Skips the digest interval gate but still honors quiet hours.
 */
export async function sendInstantAlert(
  notification: Notification,
  user: User,
): Promise<{ sent: boolean; reason?: string }> {
  const now = new Date();

  const prefs = await storage.getNotificationPreferences(user.id);
  if (prefs && isInQuietHours(now, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    return { sent: false, reason: "user_quiet_hours" };
  }

  if (user.organizationId) {
    const rules = await storage.getNotificationRules(user.organizationId);
    if (rules && isInQuietHours(now, rules.orgQuietHoursStart, rules.orgQuietHoursEnd)) {
      return { sent: false, reason: "org_quiet_hours" };
    }
  }

  const html = renderInstantAlertHtml(user, notification);

  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    await client.send({
      to: user.email,
      from: fromEmail,
      subject: `[Critical Alert] ${notification.title}`,
      html,
    });
  } catch (err: any) {
    console.error(`[notification-digest] Failed to send instant alert to ${user.email}:`, err?.message || err);
    return { sent: false, reason: "send_failed" };
  }

  console.log(`[notification-digest] Instant alert sent to ${user.email}: ${notification.title}`);
  return { sent: true };
}

export async function sendDigestForUser(userId: string, options: { force?: boolean } = {}): Promise<{
  sent: boolean;
  reason?: string;
  total?: number;
}> {
  const user = await storage.getUser(userId);
  if (!user) return { sent: false, reason: "user_not_found" };

  const prefs = await storage.upsertNotificationPreferences(userId, {});
  const cadence = (prefs.digestCadence || "weekly") as DigestCadence;

  if (cadence === "off" && !options.force) return { sent: false, reason: "cadence_off" };
  if (!prefs.emailEnabled && !options.force) return { sent: false, reason: "email_disabled" };

  // Quiet hours check (per-user + org-level)
  const now = new Date();
  if (!options.force && isInQuietHours(now, prefs.quietHoursStart, prefs.quietHoursEnd)) {
    return { sent: false, reason: "user_quiet_hours" };
  }
  if (user.organizationId) {
    const rules = await storage.getNotificationRules(user.organizationId);
    if (
      rules &&
      !options.force &&
      isInQuietHours(now, rules.orgQuietHoursStart, rules.orgQuietHoursEnd)
    ) {
      return { sent: false, reason: "org_quiet_hours" };
    }
  }

  // Cadence interval gate
  if (!options.force && prefs.lastDigestSentAt) {
    const elapsed = now.getTime() - new Date(prefs.lastDigestSentAt).getTime();
    if (elapsed < cadenceWindowMs(cadence) - 60 * 60 * 1000) {
      return { sent: false, reason: "interval_not_elapsed" };
    }
  }

  const rules = user.organizationId ? await storage.getNotificationRules(user.organizationId) : null;
  const summary = await buildDigestSummary(userId, cadence, { prefs, rules });
  const html = renderDigestHtml(user, summary, prefs, cadence);

  try {
    const { client, fromEmail } = await getUncachableSendGridClient();
    await client.send({
      to: user.email,
      from: fromEmail,
      subject: `Your Zenith ${cadence === "daily" ? "daily" : "weekly"} governance digest — ${summary.total} ${summary.total === 1 ? "event" : "events"}`,
      html,
    });
  } catch (err: any) {
    console.error(`[notification-digest] Failed to send digest to ${user.email}:`, err?.message || err);
    return { sent: false, reason: "send_failed" };
  }

  await storage.upsertNotificationPreferences(userId, { lastDigestSentAt: now });
  await logAuditEvent(null, {
    action: AUDIT_ACTIONS.NOTIFICATION_DIGEST_SENT,
    resource: "notification_digest",
    resourceId: userId,
    userId,
    userEmail: user.email,
    organizationId: user.organizationId ?? null,
    details: {
      cadence,
      total: summary.total,
      byCategory: summary.byCategory,
      bySeverity: summary.bySeverity,
      windowStart: summary.windowStart.toISOString(),
      windowEnd: summary.windowEnd.toISOString(),
    },
  });

  return { sent: true, total: summary.total };
}

export async function runDigestSweep(): Promise<{ candidates: number; sent: number; skipped: number }> {
  const allPrefs = await storage.getAllNotificationPreferences();
  let sent = 0;
  let skipped = 0;
  for (const p of allPrefs) {
    if (p.digestCadence === "off") {
      skipped++;
      continue;
    }
    try {
      const result = await sendDigestForUser(p.userId);
      if (result.sent) sent++;
      else skipped++;
    } catch (err) {
      skipped++;
      console.error("[notification-digest] sweep error for user", p.userId, err);
    }
  }
  return { candidates: allPrefs.length, sent, skipped };
}

let digestTimer: NodeJS.Timeout | null = null;

export function startDigestScheduler(): void {
  if (digestTimer) return;
  // Sweep hourly. Each user has cadence + lastDigestSentAt gating, so this
  // is cheap and converges to the right cadence regardless of restart timing.
  const HOUR_MS = 60 * 60 * 1000;
  const runSweep = async () => {
    try {
      const stats = await runDigestSweep();
      if (stats.sent > 0) {
        console.log(`[notification-digest] Sweep: sent=${stats.sent} skipped=${stats.skipped} candidates=${stats.candidates}`);
      }
    } catch (err) {
      console.error("[notification-digest] sweep failed:", err);
    }
  };
  // First sweep 5 minutes after startup to give DB migrations time to settle.
  setTimeout(() => void runSweep(), 5 * 60 * 1000);
  digestTimer = setInterval(() => void runSweep(), HOUR_MS);
  digestTimer.unref?.();
}
