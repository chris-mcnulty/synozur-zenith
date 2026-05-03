# Galaxy Partner API

The Galaxy Partner API is a curated, partner-grade surface that exposes a subset of Zenith's M365 governance data and a small set of low-risk actions to the sibling Galaxy portal, on behalf of authenticated end users.

- Base path: `/api/galaxy/v1/*`
- OpenAPI: `GET /api/galaxy/v1/openapi.json`
- Token endpoint: `POST /api/galaxy/oauth/token`
- Admin UI: **Platform Owner → Galaxy Partner API** (`/app/admin/galaxy-api`)

## Authentication (two-factor)

Each request must carry **both**:

1. **`Authorization: Bearer <access_token>`** — OAuth2 `client_credentials` token (HS256), obtained from the token endpoint and signed by Zenith with `GALAXY_TOKEN_SIGNING_SECRET`.
2. **`X-Galaxy-User: <user_jwt>`** — a short-lived RS256 JWT minted by Galaxy, signed with the client's RSA private key and verified by Zenith against the registered SPKI public key.

The `X-Galaxy-User` JWT identifies the **end user** acting on this request and is what gets stamped into the audit log.

### Required JWT claims (`X-Galaxy-User`)

| Claim | Description |
|---|---|
| `sub` | Galaxy user ID |
| `email` | Galaxy user email (logged for audit) |
| `org` | Zenith organization ID — must be in the client's `organizationsAllowed` list |
| `iat`, `exp` | Issued/expires (max 10 min lifetime recommended) |
| `aud` | `zenith-galaxy-api` |

Skew tolerance: ±60 seconds.

## Token request

```http
POST /api/galaxy/oauth/token
Content-Type: application/json

{
  "grant_type": "client_credentials",
  "client_id":  "...",
  "client_secret": "...",
  "scope": "galaxy.read galaxy.write"
}
```

Response:

```json
{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 900,
  "scope": "galaxy.read galaxy.write"
}
```

Tokens are HS256-signed JWTs that also embed the granted scopes; Zenith additionally records a hashed copy in `galaxy_tokens` for revocation/audit.

## Scopes

| Scope | Grants |
|---|---|
| `galaxy.read` | Read endpoints (tenants, workspaces, lifecycle, sharing-links, label-coverage, copilot assessments, email-storage reports, recordings, audit log, acknowledgements). |
| `galaxy.write` | Low-risk interactions: create acknowledgements, submit governed provisioning requests. |

## Endpoints (read)

- `GET /me` — echoes the resolved org, user, scopes (debugging).
- `GET /tenants` — connected M365 tenants in the org.
- `GET /workspaces` — governed SharePoint workspaces.
- `GET /lifecycle/scan-runs`, `GET /lifecycle/orphaned`
- `GET /sharing-links` — gated by `sharingLinkManagement` feature.
- `GET /label-coverage`
- `GET /provisioning-requests`
- `GET /copilot/assessments` — gated by `copilotPromptIntelligence`.
- `GET /email-storage-reports` — gated by `emailContentStorageReport`.
- `GET /teams-recordings`
- `GET /audit-log` — filtered to `details.source='galaxy'`.
- `GET /acknowledgements`

## Endpoints (interaction, `galaxy.write`)

- `POST /acknowledgements` — record that a Galaxy user has acknowledged a policy or notice.
- `POST /provisioning-requests` — submit a governed workspace provisioning request (project type `DEAL` / `PORTCO` / `GENERAL`, ≥2 site owners).

## Rate limiting

- **Per client**: configurable per registration (default `600/min`). Returns `429` with `Retry-After`.
- **Per Galaxy user**: `120/min` per user JWT subject.

## Audit

Every Galaxy-originated action is recorded via `audit-logger` with:

- `action` ∈ `GALAXY_TOKEN_ISSUED`, `GALAXY_TOKEN_REJECTED`, `GALAXY_REQUEST`, `GALAXY_ACK_CREATED`, `GALAXY_PROVISIONING_REQUESTED`, `GALAXY_RATE_LIMITED`
- `details.source = "galaxy"`, `details.galaxyClientId`, `details.galaxyUserSub`, `details.galaxyUserEmail`

## Admin (Platform Owner)

`/app/admin/galaxy-api` — register clients, rotate secrets (shown once), enable/disable, delete. Each client requires:

- Display name
- Allowed organization IDs
- Allowed scopes
- Rate limit, token TTL
- RSA SPKI public key PEM (for `X-Galaxy-User` verification)

## Required environment

- `GALAXY_TOKEN_SIGNING_SECRET` — ≥32 chars; used to sign access tokens.
- `TOKEN_ENCRYPTION_SECRET` — already used to encrypt the per-client secret hash at rest.
