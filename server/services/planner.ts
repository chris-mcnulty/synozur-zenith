/**
 * Microsoft Planner integration for support ticket triage.
 *
 * Mirrors the Constellation/Vega behaviour: when a new Zenith support ticket
 * is created, a corresponding Planner task is posted into the shared
 * Synozur support Planner plan so engineers can triage tickets from all
 * three products in a single board.
 *
 * Configuration model
 * -------------------
 * - Credentials (tenant id, client id, client secret) come from environment
 *   variables. They are secrets and must not live in the database.
 * - The target plan id and bucket id live in the `platform_settings` table
 *   so a platform owner can re-target the integration without redeploying.
 *   This is necessary because the shared Synozur Planner plan also contains
 *   tickets from Constellation and Vega — Zenith must drop into a specific
 *   bucket inside that plan.
 *
 * The Planner integration is intentionally best-effort: failures are logged
 * but never propagate to the support ticket creation response.
 */

import { storage } from "../storage";
import { getAppToken } from "./graph";
import type { SupportTicket } from "@shared/schema";

const APP_PUBLIC_URL = process.env.APP_PUBLIC_URL || "https://zenith.synozur.com";

function getCredentials(): { tenantId: string; clientId: string; clientSecret: string } | null {
  const tenantId =
    process.env.PLANNER_TENANT_ID ||
    process.env.MICROSOFT_GRAPH_TENANT_ID ||
    process.env.AZURE_TENANT_ID;
  const clientId =
    process.env.PLANNER_CLIENT_ID ||
    process.env.MICROSOFT_GRAPH_CLIENT_ID ||
    process.env.AZURE_CLIENT_ID;
  const clientSecret =
    process.env.PLANNER_CLIENT_SECRET ||
    process.env.MICROSOFT_GRAPH_CLIENT_SECRET ||
    process.env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) return null;
  return { tenantId, clientId, clientSecret };
}

async function getPlannerAccessToken(): Promise<string | null> {
  const creds = getCredentials();
  if (!creds) return null;
  return getAppToken(creds.tenantId, creds.clientId, creds.clientSecret);
}

/**
 * Create a Planner task for the given support ticket. Returns the created
 * task id, or null if the integration is disabled / misconfigured / failed.
 *
 * This function never throws — callers can treat a null return as "skipped".
 */
export async function createPlannerTaskForTicket(ticket: SupportTicket): Promise<string | null> {
  try {
    const settings = await storage.getPlatformSettings();
    const planId = settings.plannerPlanId?.trim();
    const bucketId = settings.plannerBucketId?.trim();

    if (!planId || !bucketId) {
      console.warn(
        `[planner] Skipping Planner task for ticket ${ticket.id}: plannerPlanId/plannerBucketId not configured in platform_settings`
      );
      return null;
    }

    const creds = getCredentials();
    if (!creds) {
      console.warn(
        `[planner] Skipping Planner task for ticket ${ticket.id}: Microsoft Graph credentials not configured (set PLANNER_TENANT_ID/PLANNER_CLIENT_ID/PLANNER_CLIENT_SECRET, MICROSOFT_GRAPH_TENANT_ID/MICROSOFT_GRAPH_CLIENT_ID/MICROSOFT_GRAPH_CLIENT_SECRET, or AZURE_TENANT_ID/AZURE_CLIENT_ID/AZURE_CLIENT_SECRET)`
      );
      return null;
    }

    const token = await getPlannerAccessToken();
    if (!token) return null;

    const priorityTag = (ticket.priority || "medium").toUpperCase();
    const title = `[${priorityTag}] ${ticket.subject}`.slice(0, 255);

    const createRes = await fetch("https://graph.microsoft.com/v1.0/planner/tasks", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        planId,
        bucketId,
        title,
      }),
    });

    if (!createRes.ok) {
      const errorText = await createRes.text();
      console.error(
        `[planner] Failed to create Planner task for ticket ${ticket.id} (${createRes.status}): ${errorText}`
      );
      return null;
    }

    const created = await createRes.json();
    const taskId: string = created.id;
    const initialEtag: string | undefined = created["@odata.etag"];

    // Patch task details with the description and a back-link to the ticket.
    // This requires an If-Match header with the details ETag — fetch it first.
    try {
      const detailsGet = await fetch(
        `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(taskId)}/details`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const detailsEtag = detailsGet.headers.get("etag") || initialEtag || "*";
      const ticketUrl = `${APP_PUBLIC_URL}/app/support/tickets/${ticket.id}`;

      const detailsBody: Record<string, any> = {
        description:
          `${ticket.description}\n\n` +
          `— Submitted via Zenith (ticket #${ticket.ticketNumber}, priority ${ticket.priority}, category ${ticket.category})\n` +
          ticketUrl,
        previewType: "description",
        references: {
          [ticketUrl]: {
            "@odata.type": "#microsoft.graph.plannerExternalReference",
            alias: `Zenith ticket #${ticket.ticketNumber}`,
            type: "Other",
          },
        },
      };

      const patchRes = await fetch(
        `https://graph.microsoft.com/v1.0/planner/tasks/${encodeURIComponent(taskId)}/details`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "If-Match": detailsEtag,
          },
          body: JSON.stringify(detailsBody),
        }
      );

      if (!patchRes.ok) {
        const errorText = await patchRes.text();
        console.warn(
          `[planner] Created task ${taskId} for ticket ${ticket.id} but failed to patch details (${patchRes.status}): ${errorText}`
        );
      }
    } catch (detailsErr) {
      console.warn(
        `[planner] Created task ${taskId} for ticket ${ticket.id} but failed to patch details:`,
        detailsErr
      );
    }

    return taskId;
  } catch (err) {
    console.error(`[planner] Unexpected error creating Planner task for ticket ${ticket.id}:`, err);
    return null;
  }
}
