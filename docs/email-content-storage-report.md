# Email Content Storage Report

> **Design mantra:** Zenith is a governance and insight platform, not a
> forensic tool. Fast. Safe. Bounded. Defensible. If full fidelity is not
> achievable with Microsoft Graph within limits, estimate confidently and
> label clearly — do not attempt exhaustive mailbox enumeration.

The Email Content Storage Report estimates how much organizational content
is being propagated via **classic email attachments** rather than
SharePoint/OneDrive/Teams link-sharing. It is built on top of the **Zenith
User Inventory** layer and uses Microsoft Graph exclusively.

---

## 1. Architectural contract

Zenith **must not** enumerate users directly from Entra ID when running a
report. Instead, reports consume a cached `user_inventory` table that is
populated and refreshed by a separate admin-triggered job.

```
   ┌────────────────────────┐     refresh (admin)      ┌───────────────────┐
   │ Microsoft Graph /users │ ───────────────────────► │  user_inventory   │
   └────────────────────────┘                          │  (cached, bounded)│
                                                       └────────┬──────────┘
                                                                │  read-only
                                                                ▼
                                                      ┌────────────────────┐
                                                      │ Email Content      │
                                                      │ Storage Report     │
                                                      │ (Estimate/Metadata)│
                                                      └────────────────────┘
```

---

## 2. Zenith User Inventory

### Purpose

Provide a stable, bounded, performance-safe list of users whose mail
activity can be analyzed without re-querying Entra ID on every report run.
It is **not** an identity system — it is a minimal cache.

### Schema (table: `user_inventory`)

| Field                   | Notes                                        |
| ----------------------- | -------------------------------------------- |
| `user_id`               | Entra Object ID                              |
| `user_principal_name`   | Required                                     |
| `mail`                  | Optional — primary SMTP if different         |
| `display_name`          | Optional                                     |
| `account_enabled`       | `true`/`false`                               |
| `user_type`             | `Member` or `Guest`                          |
| `mailbox_license_hint`  | Optional — may be populated later            |
| `last_known_mail_activity` | Optional — may be populated later         |
| `last_refreshed_at`     | Set on each upsert                           |
| `discovery_status`      | `ACTIVE` or `DELETED`                        |

A separate table `user_inventory_runs` tracks each refresh (status,
users discovered, pages fetched, errors).

### Admin API

```
POST /api/admin/tenants/{id}/user-inventory/sync
     body: { "maxUsers"?: number }            // default cap applies
GET  /api/admin/tenants/{id}/user-inventory
     query: ?search=&limit=                   // returns items, total, ageHours, stale
GET  /api/admin/tenants/{id}/user-inventory/runs
     query: ?limit=                           // recent refresh runs
```

### Refresh cadence

- **Default staleness:** 48 hours (`DEFAULT_INVENTORY_MAX_AGE_HOURS`)
- **Default cap:** 100,000 users per run (`DEFAULT_MAX_USERS`)
- The refresh pages through `GET /users` using `$top=999` and `$select=id,
  userPrincipalName,mail,displayName,accountEnabled,userType`, with
  throttling-safe retries via `graphFetchWithRetry`.
- Missing users are marked `DELETED` at the end of a successful run so
  de-provisioned accounts drop out of reports.
- A single failed page does **not** wipe the inventory — we only mark
  deletions when the current page set returned at least one user.

### Degradation rules

- If the report runs while the inventory is stale (older than the window),
  the report still runs but adds an accuracy caveat.
- If the inventory is **empty**, the report API returns **409** and asks
  the admin to run a refresh first.

---

## 3. Email Content Storage Report

### What it tells you

For a tenant's Sent Items across a configurable time window (7/30/90 days),
how much content is being pushed around as classic email attachments, who
is sending it, and where it is going (internal vs external).

### Modes

| Mode         | Status   | What it does                                   |
| ------------ | -------- | ---------------------------------------------- |
| **ESTIMATE** | Default  | Uses `hasAttachments` + message `size` as an attachment-storage proxy. Never enumerates attachments. Fast, runs in every tenant. |
| **METADATA** | Opt-in   | Enriches a bounded subset of messages with per-attachment `$select=name,contentType,size`. Never downloads content. |

**Important:** in ESTIMATE mode, `size` is the *entire MIME-encoded message
size*, not just the attachment bytes. It is a proxy — reports are clearly
labeled so consumers do not treat it as ground truth.

### Time window

- **Default:** 30 days
- **Allowed:** 7, 30, or 90

### Metrics produced

**Tenant summary**
- Total messages analyzed
- Messages with attachments
- % of messages with attachments
- Estimated total attachment bytes
- Avg / median / p90 / p95 / max size
- Internal vs external split (messages + bytes, attributed proportionally)
- Top senders by attachment bytes
- Top recipient domains by bytes

**Metadata-mode-only**
- Top attachment content types by bytes
- Repeated attachment patterns (lowercased filename + size bucket)

### Internal vs external classification

- Internal = recipient domain ∈ tenant verified domains
  (from `GET /organization?$select=verifiedDomains`)
- External = everything else
- Malformed addresses → external (conservative default)
- Mixed messages are attributed proportionally by recipient count

### Plan gate

The Email Content Storage Report is gated on the `emailContentStorageReport`
plan feature. **Enterprise** is currently the only tier where this feature is
enabled; Trial, Standard, and Professional receive HTTP 403 with a
`FEATURE_GATED` error if they attempt to use any report endpoint. The CSV
export additionally requires the `csvExport` feature (also Enterprise for this
report since both gates must pass).

### Admin API

```
POST /api/admin/tenants/{id}/email-storage-report/run
     body: {
       "mode"?:                          "ESTIMATE" | "METADATA",
       "windowDays"?:                    7 | 30 | 90,
       "maxUsers"?:                      number,
       "maxMessagesPerUser"?:            number,
       "maxTotalMessages"?:              number,
       "attachmentMetadataEnabled"?:     boolean,
       "maxMessagesWithMetadata"?:       number,
       "minMessageSizeKBForMetadata"?:   number,
       "maxAttachmentsPerMessage"?:      number
     }
     → 202 Accepted (runs asynchronously)

GET  /api/admin/tenants/{id}/email-storage-report/runs
GET  /api/admin/tenants/{id}/email-storage-report/runs/{runId}
GET  /api/admin/tenants/{id}/email-storage-report/runs/{runId}/export.csv

POST /api/admin/tenants/{id}/email-storage-report/runs/{runId}/cancel
     → 202 Accepted when the signal is queued
     → 409 Conflict if the run is already in a terminal state
```

### Cooperative cancellation

A tenant_admin can cancel a running report via the `/cancel` endpoint. The
background job checks a cancellation flag **between users** and **between
message pages** (it does not interrupt an in-flight HTTP call to Graph). On
cancel:

- The run's `status` becomes `CANCELLED`.
- Partial aggregates (users already processed, message counts, top senders)
  are preserved in the `summary` blob.
- An entry is appended to `accuracyCaveats` noting the cancel point.
- The cancellation flag is cleared so the run id cannot inherit a stale
  cancel signal on any subsequent lookup.

---

## 4. Mandatory performance limits

All limits have a **default** and can be overridden per run via the admin
API. Values are clamped to a safe range so bad input cannot take Graph down.

| Limit                             | Default   | Purpose                                    |
| --------------------------------- | --------- | ------------------------------------------ |
| `maxUsers`                        | 200       | Cap on users sampled from inventory        |
| `maxMessagesPerUser`              | 2,000     | Per-user page walk ceiling                 |
| `maxTotalMessages`                | 200,000   | Global message processing ceiling          |
| `attachmentMetadataEnabled`       | `false`   | Gate for METADATA mode                     |
| `maxMessagesWithMetadata`         | 5,000     | Max messages enriched with attachment meta |
| `minMessageSizeKBForMetadata`     | 500       | Only enrich messages above this size       |
| `maxAttachmentsPerMessage`        | 20        | Per-message attachment fetch cap           |

When a cap is hit, processing stops gracefully and the report is annotated
with a `capsHit` entry and a human-readable accuracy caveat.

---

## 5. Required Microsoft Graph permissions

All permissions are **Application** (app-only). Delegated permissions are
not required for this feature.

| Permission               | Used by                        | Justification                                                            |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------------ |
| `User.Read.All`          | User Inventory refresh only    | Minimal `$select` enumeration of tenant users. Reports never call this.  |
| `Mail.Read`              | Email report (Sent Items read) | Metadata-only reads. Body and subject are never requested.               |
| `Organization.Read.All`  | Verified-domain lookup         | Already used elsewhere in Zenith for internal/external classification.   |

**Not used / not required:**
- `Mail.ReadWrite` — never written
- `User.ReadWrite.All` — inventory is read-only
- `Directory.Read.All` — too broad; `User.Read.All` suffices

---

## 6. Accuracy and label conventions

Every report row includes:

- `mode` — `ESTIMATE` | `METADATA`
- `limits` — the exact caps in effect for the run
- `capsHit` — which caps were reached (if any)
- `accuracyCaveats[]` — human-readable notes
- `inventorySnapshotAt`, `inventorySampledCount`, `inventoryTotalCount`

Reports clearly label:

1. Whether they are Estimate or Metadata mode.
2. That `size` is a proxy in Estimate mode.
3. The percentage of users and messages sampled.
4. Whether the inventory was stale at run time.

---

## 7. Data masking at rest

When a tenant has `data_masking_enabled = true`:

- `user_inventory` rows encrypt `userPrincipalName`, `mail`, and
  `displayName` using the tenant's encryption key (same pattern as other
  inventories).
- Email storage reports encrypt each `summary.topSenders[*].sender` address
  in the jsonb blob with the tenant key. Aggregate counts and byte totals
  remain in the clear for analytics.
- **Message subjects are never fetched from Graph** — the `$select` on
  Sent Items reads deliberately excludes `subject` and `bodyPreview`. There
  is nothing to mask.

On read, the storage layer automatically decrypts the inventory fields and
the email report summary blob before returning them to the API.

---

## 8. Runtime expectations

Rough order of magnitude for a 30-day window on a tenant of 200 active
mailboxes with the default caps:

- Graph calls: `maxUsers` (= 200) × (pages of Sent Items) → usually
  ~400–2,000 requests, well under `maxTotalMessages`
- All requests go through `graphFetchWithRetry` for 429/5xx handling
- Live progress is flushed to the DB every 10 users
- Expected wall-clock: a few minutes per tenant with the defaults

Reports beyond the default caps should be run off-hours. Admins can reduce
caps for a dry run before scaling up.

---

## 9. Testing

Pure metrics logic is unit-tested with Node's built-in test runner (no
additional test framework required):

```bash
npm run test:email-report
```

Covered:
- Domain classification (extract, normalize, classify)
- Internal/external proportional attribution
- Percentile / median / average computation
- Aggregator totals and top-N ordering
- Caps enforcement (total, per-user, metadata gate)
- Limit resolution + clamping
- Accuracy-caveat generation

---

## 10. Reuse for downstream insights

The per-run summary is designed to feed other Zenith signals:

### 10a. "Document-as-attachment culture" score
- High `pctWithAttachments` + large `p95Bytes` + small `topRecipientDomains`
  diversity → a team is still using Outlook as a file share.
- Surface the top senders with the governance review workflow to nudge
  them toward SharePoint/Teams links.

### 10b. Copilot readiness signal
- Copilot works best when documents live in SharePoint/OneDrive where
  Copilot can reason over permissions and versions.
- `external.bytes / (internal.bytes + external.bytes)` > threshold
  indicates content is escaping outside managed storage and should be
  weighed *against* tenant readiness.
- Correlate `topSenders` with OneDrive storage usage from the existing
  inventory to spot users who send lots of attachments but underuse
  OneDrive.

### 10c. Link-sharing adoption guidance
- Track `estimatedAttachmentBytes` trend over successive runs — a
  downward curve after policy rollouts is evidence the "share a link"
  messaging is working.
- Use `topRecipientDomains` to identify partners where attachment-heavy
  exchanges might justify an external-sharing policy review.

---

## 11. What this report deliberately does NOT do

- It does not open, download, or scan attachment content.
- It does not read message bodies or subjects.
- It does not attempt to inspect inboxes outside of Sent Items.
- It does not retry indefinitely — caps are hard limits.
- It does not enumerate Entra during a run — the inventory is the only
  source of users.
