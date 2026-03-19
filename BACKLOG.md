# Zenith Feature Backlog

Items here are scoped, designed, and ready to implement in a future session.

---

## Teams Recordings Discovery — Phase 3: Meeting Metadata Enrichment

**Context:** Phase 1 and Phase 2 discover recording/transcript *files* from Teams channel SharePoint libraries and user OneDrives. The files themselves carry limited meeting context (only what's in the filename and `createdBy` facet). Phase 3 enriches each discovered file with authoritative meeting metadata from the Online Meetings API.

### What this adds

| Field | Source |
|---|---|
| `meetingTitle` | `onlineMeeting.subject` |
| `meetingDate` | `onlineMeeting.startDateTime` |
| `organizer` | `onlineMeeting.organizer.upn` |
| Participant count | `onlineMeeting.attendees` count |
| Meeting duration | `endDateTime - startDateTime` |
| Meeting ID | `onlineMeeting.id` (links recording to meeting) |

### Implementation approach

The linkage between a discovered DriveItem and a specific `onlineMeeting` is not a direct foreign key in the Graph API. The recommended approach is:

1. **Filename parsing:** Teams recording filenames follow the pattern `<MeetingTitle>-<OrganiserDisplayName>-<Timestamp>`. Parse the timestamp to narrow the date range, then query the organizer's meetings within a ±1 hour window.
2. **Meeting lookup per organizer:** `GET /users/{organizerId}/onlineMeetings?$filter=startDateTime ge {start} and startDateTime le {end}` — requires `OnlineMeetings.Read.All` (application permission).
3. **Recording-to-meeting link via Recordings API:** For matched meetings, call `GET /users/{userId}/onlineMeetings/{meetingId}/recordings` to confirm the recording file is attached to that meeting and retrieve the `contentCorrelationId`.

### New Graph permissions required

```
Application: OnlineMeetings.Read.All
Application: OnlineMeetingRecording.Read.All
Application: OnlineMeetingTranscript.Read.All
```

### Schema changes

Add to `teams_recordings` table:
- `meetingId` (text) — M365 online meeting ID
- `meetingDurationSeconds` (integer) — derived from start/end
- `participantCount` (integer) — from attendees list

Add `meetingEnriched` (boolean, default false) to track which rows have been enriched so the enrichment job can run incrementally.

### Service design

New function `enrichRecordingsWithMeetingMetadata(tenantConnectionId, tenantId, clientId, clientSecret)` in `recordings-discovery.ts`:
- Queries all `teams_recordings` where `meetingEnriched = false`
- Groups by `organizer` UPN to batch meeting lookups per user
- For each organizer, fetches meetings in the date range of their unenriched recordings
- Fuzzy-matches by timestamp (within 30 min of `fileCreatedAt`)
- Updates matched rows with meeting metadata; marks all as `meetingEnriched = true`

### Notes

- This is a best-effort enrichment — some recordings will not match (e.g., if the organizer's mailbox is disabled, or the meeting was created by a service account).
- The Online Meetings API only returns meetings where the queried user is the organizer. Cross-organizer lookup is not supported.
- Rate limiting: large tenants may have thousands of users with recorded meetings. Implement per-user throttling with exponential backoff (same pattern as existing Graph functions).

---

## Teams Recordings Discovery — Phase 4: Copilot & AI Accessibility Assessment

**Context:** Phase 1/2 derive a basic `copilotAccessible` flag by checking for "Highly Confidential" sensitivity labels. Phase 4 implements a rigorous, policy-driven accessibility assessment aligned with how Microsoft 365 Copilot actually evaluates access to content.

### Assessment dimensions

| Dimension | How to determine | Data available after Phase 1/2 |
|---|---|---|
| Sensitivity label tier | Compare label name/ID against tenant's label hierarchy | `sensitivityLabelId` / `sensitivityLabelName` — ✅ |
| Label has encryption | `sensitivityLabel.protection.doesContentExpire`, `applyToEmail` | Need to join against `sensitivity_labels` table |
| Retention hold | Label has `behaviorDuringRetentionPeriod = DoNotDelete` | Need `retentionLabelName` → join `retention_labels` — ✅ |
| File location (SPO vs ODB) | `storageType` | ✅ already stored |
| Private channel | `channelType = private` — private channel sites are separate SPO site collections; Copilot access follows the same ACL rules | ✅ `channelType` stored |
| External sharing | `isShared` (basic flag); full external-vs-internal determination needs `GET /drives/{id}/items/{id}/permissions` | Partial — `isShared` boolean only |
| Copilot license on organizer | Requires `GET /users/{userId}/licenseDetails` | Not yet fetched |
| Tenant Copilot deployment | Org-level setting; check if the tenant connection has Copilot enabled | New field on `tenant_connections` or admin confirmation |

### Implementation approach

1. **Enrich sensitivity label metadata.** After Phase 1/2 discovery, join `sensitivityLabelId` against the `sensitivity_labels` table (already synced by the existing label sync). Populate `accessibilityBlockers` based on `hasProtection`, `appliesToGroupsSites` flag mismatches, and label sensitivity score threshold (configurable per org).

2. **Permissions check for shared files.** For recordings where `isShared = true`, call `GET /drives/{driveId}/items/{driveItemId}/permissions` to determine if the sharing includes external users. Mark as `EXTERNAL_SHARING` blocker if external link found.

3. **Copilot license check.** Batch-fetch `licenseDetails` for all unique organizer UPNs. Known Copilot SKU IDs (e.g., `639dec6b-bb19-468b-871c-c5c441b4b0cb` for M365 Copilot) signal whether the organizer has a Copilot seat. Store result on the recording row.

4. **Re-derive `copilotAccessible`.** Re-evaluate the flag and `accessibilityBlockers` array for all recordings after the above enrichment. Persist.

5. **Scheduled re-assessment.** Add a background job (or trigger it post-label-sync) to re-evaluate accessibility when sensitivity labels change in the tenant.

### New Graph permissions required

```
Application: UserAuthenticationMethod.Read.All  (for license check, if not already present)
```
The `User.Read.All` already present should cover `licenseDetails`.

### Schema changes

Add to `teams_recordings` table:
- `organizerHasCopilotLicense` (boolean) — whether the organizer's account has an M365 Copilot license
- `hasExternalPermissions` (boolean) — whether permissions include external principals
- `accessibilityAssessedAt` (timestamp) — when Phase 4 assessment last ran

### UI changes

- Surface a new "Accessibility" column variant in the Recordings page with detailed blocker categorisation (Label Blocked / External Sharing / No Copilot License / Unknown).
- Add a summary card "Fully Assessed" vs "Pending Assessment" to make the coverage of Phase 4 visible.
- Consider an "Export" button for audit/compliance reporting (CSV of all recordings with accessibility status).

### Notes

- Phase 4 does **not** apply any remediation — it is still discovery/assessment only. Policy enforcement (applying labels, restricting sharing, etc.) is a separate feature.
- The Copilot accessibility rules may vary by tenant configuration (e.g., some orgs allow Copilot on Highly Confidential content). Design the assessment to be configurable per-org rather than hard-coded.
