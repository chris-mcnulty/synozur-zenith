import crypto from "crypto";

/**
 * Minimal JWT helper supporting RS256 verification (for X-Galaxy-User tokens
 * signed by Galaxy's private key) and HS256 signing (for Zenith-issued bearer
 * tokens from the client_credentials endpoint).
 *
 * Implemented with Node's built-in crypto module to avoid an extra dep.
 */

function b64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export interface SignedJwtClaims {
  sub: string;
  iss: string;
  aud: string;
  scope: string;
  jti: string;
  iat: number;
  exp: number;
  galaxy_client_id: string;
  [k: string]: unknown;
}

export function signHs256(claims: Record<string, unknown>, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = b64urlEncode(JSON.stringify(header));
  const payloadB64 = b64urlEncode(JSON.stringify(claims));
  const data = `${headerB64}.${payloadB64}`;
  const sig = crypto.createHmac("sha256", secret).update(data).digest();
  return `${data}.${b64urlEncode(sig)}`;
}

export function verifyHs256(token: string, secret: string): Record<string, any> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt_format");
  const [h, p, s] = parts;
  const expected = b64urlEncode(crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest());
  // Constant-time compare
  const a = Buffer.from(s);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("invalid_signature");
  }
  const header = JSON.parse(b64urlDecode(h).toString("utf8"));
  if (header.alg !== "HS256") throw new Error("unexpected_alg");
  const claims = JSON.parse(b64urlDecode(p).toString("utf8"));
  if (typeof claims.exp === "number" && Date.now() / 1000 > claims.exp) {
    throw new Error("token_expired");
  }
  return claims;
}

export interface GalaxyUserClaims {
  sub: string;
  email: string;
  name?: string;
  org: string;
  groups?: string[];
  tenantScope?: string[];
  iat?: number;
  exp: number;
  iss?: string;
  aud?: string;
  [k: string]: unknown;
}

/**
 * Verifies an RS256-signed JWT (the X-Galaxy-User user-identity token) using
 * the Galaxy-registered public key (PEM, SPKI). Returns the parsed claims on
 * success; throws an Error with a stable code for any failure.
 *
 * Errors thrown: invalid_jwt_format, unexpected_alg, invalid_signature,
 * token_expired, missing_claim:<name>.
 */
export function verifyRs256(token: string, publicKeyPem: string): GalaxyUserClaims {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt_format");
  const [h, p, s] = parts;

  const header = JSON.parse(b64urlDecode(h).toString("utf8"));
  if (header.alg !== "RS256") throw new Error("unexpected_alg");

  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(`${h}.${p}`);
  verifier.end();
  const ok = verifier.verify(publicKeyPem, b64urlDecode(s));
  if (!ok) throw new Error("invalid_signature");

  const claims = JSON.parse(b64urlDecode(p).toString("utf8")) as GalaxyUserClaims;
  if (typeof claims.exp !== "number") throw new Error("missing_claim:exp");
  if (Date.now() / 1000 > claims.exp) throw new Error("token_expired");
  if (!claims.sub) throw new Error("missing_claim:sub");
  if (!claims.email) throw new Error("missing_claim:email");
  if (!claims.org) throw new Error("missing_claim:org");
  return claims;
}

/**
 * Validates that a value looks like an RSA SPKI public key in PEM form.
 * Used at registration time so we fail early with a clear error.
 */
export function isValidRsaPublicKeyPem(pem: string): boolean {
  try {
    const k = crypto.createPublicKey(pem);
    return k.asymmetricKeyType === "rsa";
  } catch {
    return false;
  }
}
