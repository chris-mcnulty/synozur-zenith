/**
 * Teams Recordings Discovery Service
 *
 * Phase 1: Scans every Teams channel's SharePoint /Recordings/ folder.
 * Phase 2: Scans the OneDrive /Recordings/ folder of every enabled tenant user.
 *
 * Each run is tracked in `teams_discovery_runs`. Discovered files are upserted
 * into `teams_recordings` (keyed on tenantConnectionId + driveItemId so
 * re-running a sync is idempotent and updates changed metadata in place).
 *
 * Copilot accessibility is assessed at discovery time with simple heuristics:
 * a file is flagged as potentially inaccessible if it carries a sensitivity
 * label whose name contains "Highly Confidential". Full assessment is deferred
 * to Phase 4 once policy rules are applied.
 */

import {
  fetchAllTeams,
  fetchTeamChannels,
  fetchChannelRecordingItems,
  fetchUserOneDriveRecordingItems,
  fetchTenantUsers,
  type RecordingFileItem,
} from "./graph";
import { storage } from "../storage";
import type { InsertTeamsRecording } from "@shared/schema";

const HIGHLY_CONFIDENTIAL_PATTERN = /highly\s*confidential/i;

function deriveCopilotAccessibility(item: RecordingFileItem): {
  accessible: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];

  if (
    item.sensitivityLabelName &&
    HIGHLY_CONFIDENTIAL_PATTERN.test(item.sensitivityLabelName)
  ) {
    blockers.push(`Sensitivity label "${item.sensitivityLabelName}" may restrict Copilot access`);
  }

  return { accessible: blockers.length === 0, blockers };
}

export interface DiscoveryRunResult {
  runId: string;
  status: string;
  recordingsFound: number;
  transcriptsFound: number;
  teamsScanned: number;
  channelsScanned: number;
  onedrivesScanned: number;
  onedrivesSkipped: number;
  errors: Array<{ context: string; message: string }>;
}

export async function runTeamsRecordingsDiscovery(
  tenantConnectionId: string,
  tenantId: string,
  clientId: string,
  clientSecret: string,
): Promise<DiscoveryRunResult> {
  // Create the run record
  const run = await storage.createTeamsDiscoveryRun({
    tenantConnectionId,
    status: "RUNNING",
    recordingsFound: 0,
    transcriptsFound: 0,
    teamsScanned: 0,
    channelsScanned: 0,
    onedrivesScanned: 0,
    onedrivesSkipped: 0,
    errors: [],
  });

  let recordingsFound = 0;
  let transcriptsFound = 0;
  let teamsScanned = 0;
  let channelsScanned = 0;
  let onedrivesScanned = 0;
  let onedrivesSkipped = 0;
  const errors: Array<{ context: string; message: string }> = [];

  // ── Phase 1: Teams channel recordings ────────────────────────────────────
  try {
    const teams = await fetchAllTeams(tenantId, clientId, clientSecret);

    for (const team of teams) {
      let channels: Awaited<ReturnType<typeof fetchTeamChannels>> = [];
      try {
        channels = await fetchTeamChannels(team.id, tenantId, clientId, clientSecret);
      } catch (err: any) {
        errors.push({ context: `team:${team.id}`, message: err.message });
        continue;
      }

      teamsScanned++;

      for (const channel of channels) {
        let items: RecordingFileItem[] = [];
        try {
          items = await fetchChannelRecordingItems(
            team.id,
            channel.id,
            tenantId,
            clientId,
            clientSecret,
          );
        } catch (err: any) {
          errors.push({ context: `channel:${channel.id}`, message: err.message });
        }

        channelsScanned++;

        for (const item of items) {
          const { accessible, blockers } = deriveCopilotAccessibility(item);
          const record: InsertTeamsRecording = {
            tenantConnectionId,
            storageType: "SHAREPOINT_CHANNEL",
            teamId: team.id,
            teamDisplayName: team.displayName,
            channelId: channel.id,
            channelDisplayName: channel.displayName,
            channelType: channel.membershipType,
            driveId: item.driveId,
            driveItemId: item.driveItemId,
            fileName: item.fileName,
            fileUrl: item.fileUrl,
            filePath: item.filePath,
            fileType: item.fileType,
            fileSizeBytes: item.fileSizeBytes,
            fileCreatedAt: item.fileCreatedAt,
            fileModifiedAt: item.fileModifiedAt,
            meetingDate: item.fileCreatedAt?.split("T")[0] ?? null,
            organizer: item.organizer,
            organizerDisplayName: item.organizerDisplayName,
            sensitivityLabelId: item.sensitivityLabelId,
            sensitivityLabelName: item.sensitivityLabelName,
            isShared: item.isShared,
            copilotAccessible: accessible,
            accessibilityBlockers: blockers,
            lastDiscoveredAt: new Date(),
            discoveryStatus: "ACTIVE",
          };

          await storage.upsertTeamsRecording(record);

          if (item.fileType === "RECORDING") recordingsFound++;
          else transcriptsFound++;
        }
      }
    }
  } catch (err: any) {
    errors.push({ context: "phase1:teams", message: err.message });
  }

  // ── Phase 2: OneDrive personal recordings ─────────────────────────────────
  try {
    const users = await fetchTenantUsers(tenantId, clientId, clientSecret);

    for (const user of users) {
      let result: Awaited<ReturnType<typeof fetchUserOneDriveRecordingItems>>;
      try {
        result = await fetchUserOneDriveRecordingItems(
          user.id,
          tenantId,
          clientId,
          clientSecret,
        );
      } catch (err: any) {
        errors.push({ context: `onedrive:${user.userPrincipalName}`, message: err.message });
        onedrivesSkipped++;
        continue;
      }

      if (result.skipped) {
        onedrivesSkipped++;
        continue;
      }

      onedrivesScanned++;

      for (const item of result.items) {
        const { accessible, blockers } = deriveCopilotAccessibility(item);
        const record: InsertTeamsRecording = {
          tenantConnectionId,
          storageType: "ONEDRIVE",
          userId: user.id,
          userDisplayName: user.displayName,
          userPrincipalName: user.userPrincipalName,
          driveId: item.driveId,
          driveItemId: item.driveItemId,
          fileName: item.fileName,
          fileUrl: item.fileUrl,
          filePath: item.filePath,
          fileType: item.fileType,
          fileSizeBytes: item.fileSizeBytes,
          fileCreatedAt: item.fileCreatedAt,
          fileModifiedAt: item.fileModifiedAt,
          meetingDate: item.fileCreatedAt?.split("T")[0] ?? null,
          organizer: user.userPrincipalName,
          organizerDisplayName: user.displayName,
          sensitivityLabelId: item.sensitivityLabelId,
          sensitivityLabelName: item.sensitivityLabelName,
          isShared: item.isShared,
          copilotAccessible: accessible,
          accessibilityBlockers: blockers,
          lastDiscoveredAt: new Date(),
          discoveryStatus: "ACTIVE",
        };

        await storage.upsertTeamsRecording(record);

        if (item.fileType === "RECORDING") recordingsFound++;
        else transcriptsFound++;
      }
    }
  } catch (err: any) {
    errors.push({ context: "phase2:onedrive", message: err.message });
  }

  // ── Finalise run record ───────────────────────────────────────────────────
  const status = errors.length === 0
    ? "COMPLETED"
    : errors.length < 5
    ? "PARTIAL"
    : "FAILED";

  await storage.updateTeamsDiscoveryRun(run.id, {
    completedAt: new Date(),
    status,
    recordingsFound,
    transcriptsFound,
    teamsScanned,
    channelsScanned,
    onedrivesScanned,
    onedrivesSkipped,
    errors,
  });

  return {
    runId: run.id,
    status,
    recordingsFound,
    transcriptsFound,
    teamsScanned,
    channelsScanned,
    onedrivesScanned,
    onedrivesSkipped,
    errors,
  };
}
