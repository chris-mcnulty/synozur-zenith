import { ReplitConnectors } from "@replit/connectors-sdk";
import type { User } from "@shared/schema";

// HubSpot contact sync service — uses the Replit HubSpot connector (conn_hubspot_01KAH52TA9XM6ATEF6T06QN7Z1)
// Tokens and auth are handled automatically by the connector SDK.

export async function syncContactToHubSpot(user: Pick<User, "email" | "name">): Promise<void> {
  try {
    const connectors = new ReplitConnectors();

    const properties: Record<string, string> = {
      email: user.email,
      lead_source: "Zenith",
    };

    if (user.name) {
      const parts = user.name.trim().split(/\s+/);
      properties.firstname = parts[0];
      if (parts.length > 1) {
        properties.lastname = parts.slice(1).join(" ");
      }
    }

    // Upsert contact by email so duplicate signups don't create duplicate contacts
    const response = await connectors.proxy("hubspot", "/crm/v3/objects/contacts/batch/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputs: [
          {
            idProperty: "email",
            id: user.email,
            properties,
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      console.warn(`[HubSpot] Contact upsert responded with ${response.status}: ${body}`);
    } else {
      console.log(`[HubSpot] Contact synced for ${user.email}`);
    }
  } catch (err: any) {
    // Log and swallow — HubSpot sync must never block signup
    console.warn(`[HubSpot] Failed to sync contact for ${user.email}: ${err?.message ?? err}`);
  }
}
