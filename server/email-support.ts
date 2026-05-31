import { getUncachableSendGridClient } from "./services/sendgrid-client";
import type {
  SupportTicket,
  User,
  Organization,
  NightlyHealthSnapshot,
} from "@shared/schema";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "https://zenith.synozur.com";

function escapeHtml(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendVerificationEmail(user: User, verificationToken: string): Promise<void> {
  const { client, fromEmail } = await getUncachableSendGridClient();
  const firstName = user.name ? user.name.split(" ")[0] : user.email;
  const verifyUrl = `${APP_PUBLIC_URL}/verify-email?token=${encodeURIComponent(verificationToken)}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify Your Email</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#5b0fbc;padding:24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Zenith</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px 16px;">
              <p style="margin:0 0 12px;color:#111827;font-size:16px;">Hi ${firstName},</p>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                Thanks for signing up for Zenith. Please verify your email address to activate your account.
              </p>
              <a href="${verifyUrl}" style="display:inline-block;background:#5b0fbc;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">
                Verify Email Address
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 32px;">
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                If you didn't create a Zenith account, you can safely ignore this email. This link expires in 24 hours.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                If the button above doesn't work, copy and paste this URL into your browser:<br/>
                <a href="${verifyUrl}" style="color:#5b0fbc;word-break:break-all;">${verifyUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await client.send({
    to: user.email,
    from: fromEmail,
    subject: "Verify your Zenith email address",
    html,
  });
}

export async function sendPasswordResetEmail(user: User, resetToken: string): Promise<void> {
  const { client, fromEmail } = await getUncachableSendGridClient();
  const firstName = user.name ? user.name.split(" ")[0] : user.email;
  const resetUrl = `${APP_PUBLIC_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#5b0fbc;padding:24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Zenith</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px 16px;">
              <p style="margin:0 0 12px;color:#111827;font-size:16px;">Hi ${firstName},</p>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                We received a request to reset your Zenith password. Click the button below to choose a new password. This link expires in 1 hour.
              </p>
              <a href="${resetUrl}" style="display:inline-block;background:#5b0fbc;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">
                Reset Password
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 32px;">
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                If the button above doesn't work, copy and paste this URL into your browser:<br/>
                <a href="${resetUrl}" style="color:#5b0fbc;word-break:break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await client.send({
    to: user.email,
    from: fromEmail,
    subject: "Reset your Zenith password",
    html,
  });
}

export async function sendUserInviteEmail(
  user: User,
  invitedByName: string,
  invitedByEmail: string,
  organizationName: string,
  inviteToken: string,
): Promise<void> {
  const { client, fromEmail } = await getUncachableSendGridClient();
  const firstName = escapeHtml(user.name ? user.name.split(" ")[0] : user.email);
  const safeInvitedByName = escapeHtml(invitedByName);
  const safeInvitedByEmail = escapeHtml(invitedByEmail);
  const safeOrganizationName = escapeHtml(organizationName);
  // BL-050: the /verify-email landing page verifies the token, then collects
  // a password and signs the user in. `mode=invite` tells both the page and
  // the server that this URL belongs to the invite flow (no password chosen
  // yet) — self-signup verification emails omit it so those users are not
  // forced through a password-set step.
  const acceptUrl = `${APP_PUBLIC_URL}/verify-email?token=${encodeURIComponent(inviteToken)}&mode=invite`;
  const safeAcceptUrl = escapeHtml(acceptUrl);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>You've been invited to Zenith</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#5b0fbc;padding:24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Zenith</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px 16px;">
              <p style="margin:0 0 12px;color:#111827;font-size:16px;">Hi ${firstName},</p>
              <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.6;">
                ${safeInvitedByName} (${safeInvitedByEmail}) has invited you to join
                <strong>${safeOrganizationName}</strong> on Zenith — the Microsoft 365 governance platform from Synozur.
              </p>
              <a href="${safeAcceptUrl}" style="display:inline-block;background:#5b0fbc;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">
                Accept Invitation
              </a>
              <p style="margin:24px 0 0;color:#6b7280;font-size:13px;line-height:1.6;">
                You'll be asked to set a password and signed in automatically. If your organization uses SSO, you can also sign in with your Microsoft Entra account once your invite is accepted.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                If the button above doesn't work, copy and paste this URL into your browser:<br/>
                <a href="${safeAcceptUrl}" style="color:#5b0fbc;word-break:break-all;">${safeAcceptUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await client.send({
    to: user.email,
    from: fromEmail,
    subject: `${invitedByName} invited you to ${organizationName} on Zenith`,
    html,
  });
}

function getPriorityColor(priority: string): string {
  switch (priority.toLowerCase()) {
    case "high":
      return "#dc2626";
    case "medium":
      return "#d97706";
    case "low":
    default:
      return "#5b0fbc";
  }
}

export async function sendSupportTicketNotification(
  ticket: SupportTicket,
  user: User,
  org?: Organization | null
): Promise<void> {
  const { client, fromEmail } = await getUncachableSendGridClient();

  const priorityColor = getPriorityColor(ticket.priority);
  const priorityLabel = ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1);
  const categoryLabel = ticket.category.charAt(0).toUpperCase() + ticket.category.slice(1);
  const orgName = org?.name ?? "Unknown Organization";
  const userName = user.name ?? user.email;
  const ticketsUrl = `${APP_PUBLIC_URL}/app/support/tickets`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Support Ticket</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <!-- Priority header bar -->
          <tr>
            <td style="background:${priorityColor};padding:16px 24px;">
              <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">
                ${priorityLabel} Priority &mdash; ${categoryLabel}
              </span>
            </td>
          </tr>
          <!-- Title -->
          <tr>
            <td style="padding:24px 24px 8px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">New Support Ticket</h1>
              <p style="margin:4px 0 0;color:#9ca3af;font-size:14px;">Ticket #${ticket.ticketNumber}</p>
            </td>
          </tr>
          <!-- Details table -->
          <tr>
            <td style="padding:16px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;color:#9ca3af;font-size:13px;width:140px;">Application</td>
                  <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;color:#ffffff;font-size:13px;">Zenith</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;color:#9ca3af;font-size:13px;">Organization</td>
                  <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;color:#ffffff;font-size:13px;">${orgName}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;color:#9ca3af;font-size:13px;">User</td>
                  <td style="padding:8px 0;border-bottom:1px solid #2a2a2a;color:#ffffff;font-size:13px;">${userName} &lt;${user.email}&gt;</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#9ca3af;font-size:13px;">Subject</td>
                  <td style="padding:8px 0;color:#ffffff;font-size:13px;">${ticket.subject}</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Description -->
          <tr>
            <td style="padding:0 24px 16px;">
              <p style="margin:0 0 8px;color:#9ca3af;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Description</p>
              <pre style="margin:0;padding:16px;background:#111111;border:1px solid #2a2a2a;border-radius:6px;color:#e5e7eb;font-size:13px;font-family:'Courier New',monospace;white-space:pre-wrap;word-break:break-word;">${ticket.description}</pre>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding:8px 24px 32px;">
              <a href="${ticketsUrl}" style="display:inline-block;background:${priorityColor};color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
                View All Tickets
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  await client.send({
    to: "support@synozur.com",
    from: fromEmail,
    subject: `[Zenith Support] New ${priorityLabel} ${categoryLabel} - Ticket #${ticket.ticketNumber}`,
    html,
  });
}

export async function sendTicketConfirmationToSubmitter(
  ticket: SupportTicket,
  user: User
): Promise<void> {
  const { client, fromEmail } = await getUncachableSendGridClient();

  const firstName = user.name ? user.name.split(" ")[0] : user.email;
  const priorityLabel = ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1);
  const categoryLabel = ticket.category.charAt(0).toUpperCase() + ticket.category.slice(1);
  const ticketsUrl = `${APP_PUBLIC_URL}/app/support/tickets`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Support Ticket Received</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#5b0fbc;padding:24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Zenith Support</h1>
            </td>
          </tr>
          <!-- Greeting -->
          <tr>
            <td style="padding:28px 24px 16px;">
              <p style="margin:0 0 12px;color:#111827;font-size:16px;">Hi ${firstName},</p>
              <p style="margin:0;color:#374151;font-size:15px;line-height:1.6;">
                Thank you for reaching out. We've received your support ticket and our team will review it shortly.
              </p>
            </td>
          </tr>
          <!-- Summary table -->
          <tr>
            <td style="padding:8px 24px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                <tr style="background:#f9fafb;">
                  <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;font-weight:600;width:140px;">Ticket Number</td>
                  <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:13px;font-weight:600;">#${ticket.ticketNumber}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;font-weight:600;">Subject</td>
                  <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:13px;">${ticket.subject}</td>
                </tr>
                <tr style="background:#f9fafb;">
                  <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;font-weight:600;">Category</td>
                  <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:13px;">${categoryLabel}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;color:#6b7280;font-size:13px;font-weight:600;">Priority</td>
                  <td style="padding:10px 16px;color:#111827;font-size:13px;">${priorityLabel}</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding:0 24px 28px;">
              <a href="${ticketsUrl}" style="display:inline-block;background:#5b0fbc;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-size:14px;font-weight:600;">
                View Your Ticket
              </a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:13px;">
                You'll receive another email when your ticket is resolved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

  await client.send({
    to: user.email,
    from: fromEmail,
    subject: `Your Zenith support ticket #${ticket.ticketNumber} has been received`,
    html,
  });
}

export async function sendTenantAutoSuspendedEmail(
  recipientEmail: string,
  recipientName: string,
  tenantName: string,
  errorReason: string,
  tenantsPageUrl: string,
): Promise<void> {
  const { client, fromEmail } = await getUncachableSendGridClient();
  const firstName = recipientName.split(" ")[0] || recipientEmail;
  const shortReason = errorReason.slice(0, 300);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tenant Auto-Suspended</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:#b91c1c;padding:24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Zenith &mdash; Action Required</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 24px 16px;">
              <p style="margin:0 0 12px;color:#111827;font-size:16px;">Hi ${firstName},</p>
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">
                The Microsoft 365 tenant <strong>${tenantName}</strong> has been <strong>automatically suspended</strong> because Zenith can no longer access it — admin consent was revoked or has expired.
              </p>
              <p style="margin:0 0 8px;color:#374151;font-size:14px;font-weight:600;">Error reason:</p>
              <p style="margin:0 0 24px;padding:12px 16px;background:#fef2f2;border-left:3px solid #b91c1c;color:#991b1b;font-size:13px;font-family:monospace;line-height:1.5;word-break:break-word;">
                ${shortReason}
              </p>
              <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.6;">
                Sync and governance operations for this tenant are paused. To restore access, a Global Administrator of the tenant must re-grant admin consent.
              </p>
              <a href="${tenantsPageUrl}" style="display:inline-block;background:#5b0fbc;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">
                Go to Tenant Connections &rarr;
              </a>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 32px;">
              <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;">
                Once you are on the Tenant Connections page, find <strong>${tenantName}</strong> and click
                <strong>Re-consent</strong> from the actions menu to initiate the Microsoft admin consent flow.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                This is an automated alert from Zenith. If you believe this is an error, please contact your Zenith administrator.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await client.send({
    to: recipientEmail,
    from: fromEmail,
    subject: `[Action Required] Tenant "${tenantName}" suspended — consent lost`,
    html,
  });
}

function formatBytesEmail(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function severityColor(severity: "info" | "warning" | "critical"): string {
  if (severity === "critical") return "#b91c1c";
  if (severity === "warning") return "#d97706";
  return "#5b0fbc";
}

export interface NightlyHealthReportEmailOptions {
  recipientEmail: string;
  recipientName: string;
  tenantName: string;
  reportDate: string;
  snapshot: NightlyHealthSnapshot;
  reportUrl: string;
}

export async function sendNightlyHealthReportEmail(
  opts: NightlyHealthReportEmailOptions,
): Promise<void> {
  const { client, fromEmail } = await getUncachableSendGridClient();
  const { recipientEmail, recipientName, tenantName, reportDate, snapshot, reportUrl } = opts;

  const firstName = escapeHtml(recipientName.split(" ")[0] || recipientEmail);
  const safeTenant = escapeHtml(tenantName);
  // Base the header color on the highest issue severity so info-only reports
  // don't render with an elevated (amber) header.
  const maxSeverity = snapshot.issues.some((i) => i.severity === "critical")
    ? "critical"
    : snapshot.issues.some((i) => i.severity === "warning")
      ? "warning"
      : "info";
  const headerColor = maxSeverity === "critical" ? "#b91c1c" : maxSeverity === "warning" ? "#d97706" : "#5b0fbc";
  const totalIssues = snapshot.issues.reduce((sum, i) => sum + i.count, 0);

  // sitesOver75 is inclusive of sitesOver90; show the 75–90% band explicitly
  // so the figures don't read as double-counting.
  const between75And90 = snapshot.storage.sitesOver75 - snapshot.storage.sitesOver90;
  const summaryLine =
    totalIssues > 0
      ? `${snapshot.storage.sitesOver90} site(s) over 90% and ${between75And90} between 75–90% of storage quota, with ${snapshot.issues.length} governance issue type(s) needing attention.`
      : `No governance health issues were detected in tonight's scan.`;

  const issueRows =
    snapshot.issues.length === 0
      ? `<tr><td colspan="2" style="padding:10px 16px;color:#6b7280;font-size:13px;">No issues flagged — all clear.</td></tr>`
      : snapshot.issues
          .map(
            (i) => `
            <tr>
              <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:13px;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${severityColor(
                  i.severity,
                )};margin-right:8px;"></span>
                <strong>${escapeHtml(i.title)}</strong><br/>
                <span style="color:#6b7280;font-size:12px;">${escapeHtml(i.detail)}</span>
              </td>
              <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:700;text-align:right;white-space:nowrap;">${i.count}</td>
            </tr>`,
          )
          .join("");

  const topSites = snapshot.storage.topSites.slice(0, 10);
  const siteRows =
    topSites.length === 0
      ? ""
      : `
        <p style="margin:24px 0 8px;color:#111827;font-size:14px;font-weight:600;">Sites over storage quota threshold</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
          <tr style="background:#f9fafb;">
            <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;font-weight:600;">Site</td>
            <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;font-weight:600;text-align:right;">Used / Quota</td>
            <td style="padding:8px 16px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:12px;font-weight:600;text-align:right;">%</td>
          </tr>
          ${topSites
            .map(
              (s) => `
            <tr>
              <td style="padding:8px 16px;border-bottom:1px solid #f0f0f0;color:#111827;font-size:13px;">${escapeHtml(
                s.displayName,
              )}</td>
              <td style="padding:8px 16px;border-bottom:1px solid #f0f0f0;color:#374151;font-size:12px;text-align:right;white-space:nowrap;">${formatBytesEmail(
                s.storageUsedBytes,
              )} / ${formatBytesEmail(s.storageAllocatedBytes)}</td>
              <td style="padding:8px 16px;border-bottom:1px solid #f0f0f0;font-size:13px;font-weight:700;text-align:right;color:${
                s.severity === "critical" ? "#b91c1c" : "#d97706"
              };">${s.percentUsed}%</td>
            </tr>`,
            )
            .join("")}
        </table>`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nightly Health Report</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="background:${headerColor};padding:24px;">
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">Zenith &mdash; Nightly Health Report</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">${safeTenant} &middot; ${escapeHtml(
                reportDate,
              )}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 24px 8px;">
              <p style="margin:0 0 12px;color:#111827;font-size:16px;">Hi ${firstName},</p>
              <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">${escapeHtml(
                summaryLine,
              )}</p>
            </td>
          </tr>
          <!-- Storage KPIs -->
          <tr>
            <td style="padding:0 24px 8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;text-align:center;width:50%;">
                    <div style="font-size:24px;font-weight:700;color:#b91c1c;">${snapshot.storage.sitesOver90}</div>
                    <div style="font-size:12px;color:#991b1b;">sites over 90% quota</div>
                  </td>
                  <td style="width:8px;"></td>
                  <td style="padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;text-align:center;width:50%;">
                    <div style="font-size:24px;font-weight:700;color:#d97706;">${snapshot.storage.sitesOver75}</div>
                    <div style="font-size:12px;color:#92400e;">sites over 75% quota</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Issues -->
          <tr>
            <td style="padding:16px 24px 0;">
              <p style="margin:0 0 8px;color:#111827;font-size:14px;font-weight:600;">Governance health issues</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
                ${issueRows}
              </table>
              ${siteRows}
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding:24px;">
              <a href="${escapeHtml(reportUrl)}" style="display:inline-block;background:#5b0fbc;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:15px;font-weight:600;">
                View full report in Zenith &rarr;
              </a>
            </td>
          </tr>
          ${
            snapshot.dataCaveats.length > 0
              ? `<tr><td style="padding:0 24px 16px;"><p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;">${snapshot.dataCaveats
                  .map((c) => `&bull; ${escapeHtml(c)}`)
                  .join("<br/>")}</p></td></tr>`
              : ""
          }
          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;color:#9ca3af;font-size:12px;">
                This is an automated nightly governance report from Zenith. Manage delivery from your tenant connection settings.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  await client.send({
    to: recipientEmail,
    from: fromEmail,
    subject: `[Zenith] Nightly health report — ${tenantName} (${reportDate})`,
    html,
  });
}
