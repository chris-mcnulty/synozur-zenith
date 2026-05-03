/* eslint-disable no-console */
// End-to-end smoke test for the Galaxy Partner API.
// Registers a Galaxy client directly via the storage layer, then exercises
// the OAuth token endpoint + a sampling of v1 endpoints with real RS256
// X-Galaxy-User JWTs.

import crypto from "crypto";
import { storage } from "../server/storage";
import { signHs256 } from "../server/services/galaxy-jwt";
import { encryptToken } from "../server/utils/encryption";

const BASE = process.env.BASE_URL || "http://localhost:5000";

function b64url(buf: Buffer | string) {
  return Buffer.from(buf).toString("base64url");
}

function signRs256(payload: any, privateKey: crypto.KeyObject): string {
  const header = { alg: "RS256", typ: "JWT" };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${b64url(sig)}`;
}

let pass = 0;
let fail = 0;
function assert(cond: any, label: string, extra?: any) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`, extra ?? "");
  }
}

async function main() {
  console.log("Galaxy Partner API smoke test\n");

  // 1. Generate RSA keypair representing Galaxy's signing key.
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  // 2. Find an organization to allow.
  const orgList = await storage.getOrganizations();
  if (!Array.isArray(orgList) || orgList.length === 0) {
    console.error("No organizations found in DB; cannot run test.");
    process.exit(1);
  }
  const orgId = orgList[0].id as string;

  // 3. Register a Galaxy client directly through storage.
  const clientId = `gal_test_${crypto.randomBytes(6).toString("hex")}`;
  const clientSecret = crypto.randomBytes(32).toString("base64url");
  const created = await storage.createGalaxyClient({
    name: "Galaxy Smoke Test",
    clientId,
    clientSecretEncrypted: encryptToken(clientSecret),
    publicKeyPem,
    organizationsAllowed: [orgId],
    allowedScopes: ["galaxy.read", "galaxy.interact"],
    rateLimitPerMinute: 600,
    tokenTtlSeconds: 900,
    status: "ACTIVE",
  } as any);
  console.log(`Registered client ${created.id} for org ${orgId}\n`);

  // 4. OAuth token request — happy path.
  console.log("[1] OAuth token endpoint");
  let r = await fetch(`${BASE}/api/galaxy/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "galaxy.read galaxy.interact",
    }),
  });
  assert(r.status === 200, "valid creds → 200");
  const tok = await r.json();
  assert(typeof tok.access_token === "string", "access_token returned");
  assert(tok.token_type === "Bearer", "token_type=Bearer");
  const accessToken = tok.access_token as string;

  // 5. OAuth token request — bad secret.
  r = await fetch(`${BASE}/api/galaxy/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: "wrong",
    }),
  });
  assert(r.status === 401, "bad secret → 401");

  // 6. Mint a Galaxy user JWT.
  const now = Math.floor(Date.now() / 1000);
  const userJwt = signRs256(
    {
      sub: "galaxy-user-1",
      email: "alice@galaxy.example",
      org: orgId,
      aud: "zenith-galaxy-api",
      iat: now,
      exp: now + 300,
    },
    privateKey
  );

  // 7. v1 endpoints — requires both bearer + user JWT.
  console.log("\n[2] v1 endpoint auth");
  r = await fetch(`${BASE}/api/galaxy/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert(r.status === 401, "missing X-Galaxy-User → 401");

  r = await fetch(`${BASE}/api/galaxy/v1/me`, {
    headers: { "X-Galaxy-User": userJwt },
  });
  assert(r.status === 401, "missing bearer → 401");

  r = await fetch(`${BASE}/api/galaxy/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Galaxy-User": userJwt },
  });
  assert(r.status === 200, "both → 200");
  const me = await r.json();
  assert(me.organization?.id === orgId, "echoes org");
  assert(me.user?.sub === "galaxy-user-1", "echoes user sub");

  // 8. Cross-org rejection.
  console.log("\n[3] Cross-org rejection");
  const wrongOrgJwt = signRs256(
    { sub: "u", email: "x@x", org: "00000000-0000-0000-0000-000000000000", aud: "zenith-galaxy-api", iat: now, exp: now + 300 },
    privateKey
  );
  r = await fetch(`${BASE}/api/galaxy/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Galaxy-User": wrongOrgJwt },
  });
  assert(r.status === 403, "disallowed org → 403");

  // 9. Tampered user JWT.
  console.log("\n[4] Tampered user JWT");
  const parts = userJwt.split(".");
  const tampered = `${parts[0]}.${parts[1]}.${b64url(crypto.randomBytes(256))}`;
  r = await fetch(`${BASE}/api/galaxy/v1/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Galaxy-User": tampered },
  });
  assert(r.status === 401, "bad signature → 401");

  // 10. Read endpoints sample.
  console.log("\n[5] Read endpoints");
  for (const path of [
    "/api/galaxy/v1/tenants",
    "/api/galaxy/v1/workspaces",
    "/api/galaxy/v1/lifecycle/scan-runs",
    "/api/galaxy/v1/audit-log",
    "/api/galaxy/v1/acknowledgements",
  ]) {
    r = await fetch(`${BASE}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, "X-Galaxy-User": userJwt },
    });
    assert(r.status === 200, `${path} → 200`);
  }

  // 11. Acknowledgement create + list round-trip.
  console.log("\n[6] Acknowledgement round-trip");
  r = await fetch(`${BASE}/api/galaxy/v1/acknowledgements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-Galaxy-User": userJwt,
    },
    body: JSON.stringify({
      resourceType: "sharing_link",
      resourceId: "smoke-test-link-1",
      action: "ACKNOWLEDGE",
      comment: "smoke test",
    }),
  });
  if (r.status !== 201) console.log("    body:", await r.text());
  assert(r.status === 201, "POST ack → 201");

  r = await fetch(`${BASE}/api/galaxy/v1/acknowledgements?resourceType=sharing_link&resourceId=smoke-test-link-1`, {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Galaxy-User": userJwt },
  });
  const ackList = await r.json();
  assert(Array.isArray(ackList.items) && ackList.items.length >= 1, "ack appears in list");

  // 12. Scope enforcement: a read-only token cannot write.
  console.log("\n[7] Scope enforcement");
  r = await fetch(`${BASE}/api/galaxy/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "galaxy.read",
    }),
  });
  const readToken = (await r.json()).access_token as string;
  r = await fetch(`${BASE}/api/galaxy/v1/acknowledgements`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${readToken}`,
      "X-Galaxy-User": userJwt,
    },
    body: JSON.stringify({
      resourceType: "sharing_link",
      resourceId: "x",
      action: "ACKNOWLEDGE",
    }),
  });
  assert(r.status === 403, "read-only token blocked from write → 403");

  // 13. Audit log filter.
  console.log("\n[8] Galaxy audit trail");
  r = await fetch(`${BASE}/api/galaxy/v1/audit-log?limit=10`, {
    headers: { Authorization: `Bearer ${accessToken}`, "X-Galaxy-User": userJwt },
  });
  const audit = await r.json();
  const rows = audit.rows || audit.items || [];
  assert(
    rows.length > 0 && rows.every((row: any) => row?.details?.source === "galaxy"),
    `every audit row has source='galaxy' (n=${rows.length})`
  );

  // Cleanup
  await storage.deleteGalaxyClient(created.id);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
