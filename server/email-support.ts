import { getUncachableSendGridClient } from "./services/sendgrid-client";
import type { SupportTicket, User, Organization } from "@shared/schema";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "https://zenith.synozur.com";

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
