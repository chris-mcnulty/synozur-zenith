import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { verifyHs256, verifyRs256, type GalaxyUserClaims } from "../services/galaxy-jwt";
import { check as rateCheck } from "../services/galaxy-rate-limit";
import { logGalaxyAudit, AUDIT_ACTIONS } from "../services/audit-logger";
import type { GalaxyClient, GalaxyScope } from "@shared/schema";

export interface GalaxyAuthedRequest extends Request {
  galaxyClient?: GalaxyClient;
  galaxyTokenJti?: string;
  galaxyTokenScopes?: string[];
  galaxyUser?: GalaxyUserClaims;
  galaxyOrganizationId?: string;
}

const TOKEN_SIGNING_SECRET_ENV = "GALAXY_TOKEN_SIGNING_SECRET";

export function getTokenSigningSecret(): string {
  const s = process.env[TOKEN_SIGNING_SECRET_ENV];
  if (!s || s.length < 32) {
    throw new Error(
      `${TOKEN_SIGNING_SECRET_ENV} must be set to a 32+ char secret to issue Galaxy tokens.`,
    );
  }
  return s;
}

export const GALAXY_TOKEN_AUDIENCE = "zenith-galaxy-api";
export const GALAXY_TOKEN_ISSUER = "zenith";

function unauthorized(res: Response, error: string, description: string, realm = "galaxy") {
  res.setHeader(
    "WWW-Authenticate",
    `Bearer realm="${realm}", error="${error}", error_description="${description}"`,
  );
  return res.status(401).json({ error, error_description: description });
}

/**
 * Verifies the Bearer token from the Authorization header against a Zenith-
 * issued HS256 JWT, ensures the token has the required scope, applies per-
 * client rate limiting and stamps `req.galaxyClient` for downstream handlers.
 */
export function requireGalaxyClient(requiredScope: GalaxyScope) {
  return async (req: GalaxyAuthedRequest, res: Response, next: NextFunction) => {
    const auth = req.header("authorization") || "";
    const match = /^Bearer\s+(.+)$/i.exec(auth);
    if (!match) {
      return unauthorized(res, "invalid_token", "Missing Bearer token");
    }
    const token = match[1].trim();

    let claims: any;
    try {
      claims = verifyHs256(token, getTokenSigningSecret());
    } catch (err: any) {
      return unauthorized(res, "invalid_token", err?.message || "Token verification failed");
    }
    if (claims.iss !== GALAXY_TOKEN_ISSUER || claims.aud !== GALAXY_TOKEN_AUDIENCE) {
      return unauthorized(res, "invalid_token", "Token issuer/audience mismatch");
    }
    if (!claims.galaxy_client_id || !claims.jti) {
      return unauthorized(res, "invalid_token", "Token missing required claims");
    }

    const client = await storage.getGalaxyClient(claims.galaxy_client_id);
    if (!client || client.status !== "ACTIVE") {
      return unauthorized(res, "invalid_client", "Client not found or disabled");
    }

    if (await storage.isGalaxyTokenRevoked(claims.jti)) {
      return unauthorized(res, "invalid_token", "Token revoked");
    }

    const scopes: string[] = (claims.scope || "").split(/\s+/).filter(Boolean);
    if (!scopes.includes(requiredScope)) {
      res.setHeader(
        "WWW-Authenticate",
        `Bearer realm="galaxy", error="insufficient_scope", scope="${requiredScope}"`,
      );
      await logGalaxyAudit(
        {
          galaxyClientId: client.id,
          galaxyClientName: client.name,
          organizationId: null,
          ipAddress: req.ip,
        },
        {
          action: AUDIT_ACTIONS.GALAXY_AUTH_DENIED,
          resource: "galaxy_api",
          result: "DENIED",
          details: { reason: "insufficient_scope", required: requiredScope, granted: scopes },
        },
      );
      return res.status(403).json({ error: "insufficient_scope", required_scope: requiredScope });
    }

    const rate = rateCheck(`client:${client.id}`, client.rateLimitPerMinute);
    res.setHeader("X-RateLimit-Limit", String(rate.limit));
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      return res.status(429).json({ error: "rate_limit_exceeded", retry_after: rate.retryAfterSeconds });
    }

    req.galaxyClient = client;
    req.galaxyTokenJti = claims.jti;
    req.galaxyTokenScopes = scopes;
    // best-effort, do not block request on this update
    storage.touchGalaxyClientLastUsed(client.id).catch(() => {});
    next();
  };
}

/**
 * Verifies the X-Galaxy-User RS256 JWT (Galaxy-side user identity), checks
 * the user's `org` claim is in the registered client's allowed orgs, resolves
 * to a Zenith organization, and stamps `req.galaxyUser` + `req.galaxyOrganizationId`.
 *
 * The `org` claim from Galaxy is interpreted as a Zenith organization id.
 */
export function requireGalaxyUser() {
  return async (req: GalaxyAuthedRequest, res: Response, next: NextFunction) => {
    const client = req.galaxyClient;
    if (!client) {
      return res.status(500).json({ error: "server_error", message: "requireGalaxyClient must run first" });
    }
    const userToken = req.header("x-galaxy-user");
    if (!userToken) {
      return res.status(401).json({ error: "missing_user_token", message: "X-Galaxy-User header is required" });
    }
    let claims: GalaxyUserClaims;
    try {
      claims = verifyRs256(userToken, client.publicKeyPem);
    } catch (err: any) {
      await logGalaxyAudit(
        {
          galaxyClientId: client.id,
          galaxyClientName: client.name,
          organizationId: null,
          ipAddress: req.ip,
        },
        {
          action: AUDIT_ACTIONS.GALAXY_AUTH_DENIED,
          resource: "galaxy_user_token",
          result: "DENIED",
          details: { reason: err?.message || "verification_failed" },
        },
      );
      return res.status(401).json({ error: "invalid_user_token", message: err?.message || "verification failed" });
    }

    const allowed = client.organizationsAllowed;
    if (allowed.length > 0 && !allowed.includes(claims.org)) {
      await logGalaxyAudit(
        {
          galaxyClientId: client.id,
          galaxyClientName: client.name,
          galaxyUserSub: claims.sub,
          galaxyUserEmail: claims.email,
          organizationId: claims.org,
          ipAddress: req.ip,
        },
        {
          action: AUDIT_ACTIONS.GALAXY_AUTH_DENIED,
          resource: "galaxy_user_token",
          result: "DENIED",
          details: { reason: "org_not_allowed", org: claims.org },
        },
      );
      return res.status(403).json({ error: "org_not_allowed", message: "User's org is not registered for this Galaxy client" });
    }

    const org = await storage.getOrganization(claims.org);
    if (!org) {
      return res.status(404).json({ error: "organization_not_found", message: `org=${claims.org} does not exist in Zenith` });
    }

    req.galaxyUser = claims;
    req.galaxyOrganizationId = claims.org;
    next();
  };
}

/**
 * Express helper for attaching a per-user rate limit on top of the per-client
 * one. Galaxy clients can be high-throughput, but a single end user shouldn't
 * be able to monopolize their quota.
 */
export function requireGalaxyUserRateLimit(perMinute = 120) {
  return (req: GalaxyAuthedRequest, res: Response, next: NextFunction) => {
    if (!req.galaxyUser || !req.galaxyClient) return next();
    const r = rateCheck(`user:${req.galaxyClient.id}:${req.galaxyUser.sub}`, perMinute);
    res.setHeader("X-RateLimit-User-Limit", String(r.limit));
    res.setHeader("X-RateLimit-User-Remaining", String(r.remaining));
    if (!r.allowed) {
      res.setHeader("Retry-After", String(r.retryAfterSeconds));
      return res.status(429).json({ error: "user_rate_limit_exceeded", retry_after: r.retryAfterSeconds });
    }
    next();
  };
}

/**
 * Build the `GalaxyAuditContext` from the authenticated request — used by
 * route handlers when emitting audit entries.
 */
export function galaxyAuditCtx(req: GalaxyAuthedRequest) {
  return {
    galaxyClientId: req.galaxyClient!.id,
    galaxyClientName: req.galaxyClient!.name,
    galaxyUserSub: req.galaxyUser?.sub,
    galaxyUserEmail: req.galaxyUser?.email,
    galaxyUserName: req.galaxyUser?.name,
    organizationId: req.galaxyOrganizationId ?? null,
    ipAddress: req.ip ?? null,
  };
}
