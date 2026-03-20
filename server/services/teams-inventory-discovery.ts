/**
 * Teams & Channels Inventory Discovery Service
 *
 * Discovers ALL Teams and ALL Channels in a tenant, regardless of whether
 * they have recordings. Captures rich properties: visibility, archived status,
 * classification, member counts, SharePoint site URLs, etc.
 *
 * This is separate from the recordings discovery, which only finds
 * recording/transcript files in channel /Recordings/ folders.
 */

import {
  fetchAllTeamsInventory,
  fetchTeamChannelsInventory,
} from "./graph";
import { storage } from "../storage";
import type { InsertTeamsInventory, InsertChannelsInventory } from "@shared/schema";

export interface TeamsInventoryRunResult {
  teamsDiscovered: number;
  channelsDiscovered: number;
  errors: Array<{ context: string; message: string }>;
}

export async function runTeamsInventoryDiscovery(
  tenantConnectionId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<TeamsInventoryRunResult> {
  let teamsDiscovered = 0;
  let channelsDiscovered = 0;
  const errors: Array<{ context: string; message: string }> = [];

  // Phase 1: Discover all teams with rich properties
  let teams: Awaited<ReturnType<typeof fetchAllTeamsInventory>> = [];
  try {
    teams = await fetchAllTeamsInventory(tenantId, clientId, clientSecret);
  } catch (err: any) {
    errors.push({ context: "fetchAllTeamsInventory", message: err.message });
    return { teamsDiscovered: 0, channelsDiscovered: 0, errors };
  }

  for (const team of teams) {
    try {
      const record: InsertTeamsInventory = {
        tenantConnectionId,
        teamId: team.id,
        displayName: team.displayName,
        description: team.description,
        mailNickname: team.mailNickname,
        visibility: team.visibility,
        isArchived: team.isArchived,
        classification: team.classification,
        createdDateTime: team.createdDateTime,
        renewedDateTime: team.renewedDateTime,
        memberCount: team.memberCount,
        ownerCount: team.ownerCount,
        guestCount: team.guestCount,
        sharepointSiteUrl: team.sharepointSiteUrl,
        sharepointSiteId: team.sharepointSiteId,
        sensitivityLabel: team.sensitivityLabel,
        lastDiscoveredAt: new Date(),
        discoveryStatus: "ACTIVE",
      };
      await storage.upsertTeamsInventory(record);
      teamsDiscovered++;
    } catch (err: any) {
      errors.push({ context: `team:${team.id}`, message: err.message });
    }

    // Phase 2: Discover all channels for this team
    try {
      const channels = await fetchTeamChannelsInventory(team.id, tenantId, clientId, clientSecret);

      for (const channel of channels) {
        try {
          const channelRecord: InsertChannelsInventory = {
            tenantConnectionId,
            teamId: team.id,
            channelId: channel.id,
            displayName: channel.displayName,
            description: channel.description,
            membershipType: channel.membershipType,
            email: channel.email,
            webUrl: channel.webUrl,
            createdDateTime: channel.createdDateTime,
            memberCount: channel.memberCount,
            lastDiscoveredAt: new Date(),
            discoveryStatus: "ACTIVE",
          };
          await storage.upsertChannelsInventory(channelRecord);
          channelsDiscovered++;
        } catch (err: any) {
          errors.push({ context: `channel:${channel.id}`, message: err.message });
        }
      }
    } catch (err: any) {
      errors.push({ context: `team-channels:${team.id}`, message: err.message });
    }
  }

  console.log(`[teams-inventory] Discovered ${teamsDiscovered} teams, ${channelsDiscovered} channels, ${errors.length} errors`);
  return { teamsDiscovered, channelsDiscovered, errors };
}
