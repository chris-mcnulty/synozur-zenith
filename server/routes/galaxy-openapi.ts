/**
 * Hand-authored OpenAPI 3.0 spec for the Galaxy Partner API.
 * Served at GET /api/galaxy/v1/openapi.json so partner developers (Galaxy)
 * can codegen clients and explore the surface in Swagger UI.
 */

const securitySchemes = {
  galaxyClientBearer: {
    type: "oauth2",
    description: "Zenith-issued bearer token from the client_credentials flow.",
    flows: {
      clientCredentials: {
        tokenUrl: "/api/galaxy/oauth/token",
        scopes: {
          "galaxy.read": "Read M365 governance data on behalf of a Galaxy user",
          "galaxy.interact": "Submit low-risk acknowledgements / provisioning requests",
        },
      },
    },
  },
  galaxyUserToken: {
    type: "apiKey",
    in: "header",
    name: "X-Galaxy-User",
    description:
      "Galaxy-signed RS256 JWT carrying end-user identity. Required on every /v1 request.",
  },
};

const paginationParams = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  { name: "pageSize", in: "query", schema: { type: "integer", minimum: 1, maximum: 200, default: 50 } },
];

function listOp(summary: string, scope: "galaxy.read" | "galaxy.interact" = "galaxy.read", extraParams: any[] = []) {
  return {
    summary,
    security: [{ galaxyClientBearer: [scope], galaxyUserToken: [] }],
    parameters: [...paginationParams, ...extraParams],
    responses: {
      "200": { description: "OK" },
      "401": { description: "Missing/invalid bearer or user token" },
      "403": { description: "Insufficient scope, feature disabled, or org mismatch" },
      "429": { description: "Rate limit exceeded" },
    },
  };
}

export const galaxyOpenApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Zenith Galaxy Partner API",
    version: "1.0.0",
    description:
      "Curated, partner-grade API exposing M365 governance data and low-risk actions to the Galaxy portal on behalf of authenticated client users. Two-factor auth: OAuth2 client_credentials bearer token + per-request `X-Galaxy-User` RS256 JWT for end-user identity & audit.",
  },
  servers: [{ url: "/" }],
  components: { securitySchemes },
  security: [{ galaxyClientBearer: ["galaxy.read"], galaxyUserToken: [] }],
  paths: {
    "/api/galaxy/oauth/token": {
      post: {
        summary: "OAuth2 client_credentials token endpoint",
        security: [],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["grant_type", "client_id", "client_secret"],
                properties: {
                  grant_type: { type: "string", enum: ["client_credentials"] },
                  client_id: { type: "string" },
                  client_secret: { type: "string" },
                  scope: { type: "string", description: "Space-separated list of requested scopes." },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Token issued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    access_token: { type: "string" },
                    token_type: { type: "string" },
                    expires_in: { type: "integer" },
                    scope: { type: "string" },
                  },
                },
              },
            },
          },
          "401": { description: "invalid_client" },
          "400": { description: "invalid_request / invalid_scope" },
        },
      },
    },
    "/api/galaxy/v1/me": { get: listOp("Resolve the calling Galaxy user, org and granted scopes") },
    "/api/galaxy/v1/tenants": { get: listOp("List M365 tenants for the user's organization") },
    "/api/galaxy/v1/workspaces": {
      get: listOp("List M365 workspaces for the org", "galaxy.read", [
        { name: "search", in: "query", schema: { type: "string" } },
      ]),
    },
    "/api/galaxy/v1/lifecycle/scan-runs": { get: listOp("List recent lifecycle scan runs") },
    "/api/galaxy/v1/lifecycle/orphaned": { get: listOp("List orphaned workspaces") },
    "/api/galaxy/v1/sharing-links": {
      get: listOp("List sharing links (requires sharing-link-management feature)", "galaxy.read", [
        { name: "tenantConnectionId", in: "query", required: true, schema: { type: "string" } },
        { name: "resourceType", in: "query", schema: { type: "string" } },
        { name: "linkType", in: "query", schema: { type: "string" } },
      ]),
    },
    "/api/galaxy/v1/label-coverage": {
      get: listOp("Workspace sensitivity/retention label coverage for a tenant", "galaxy.read", [
        { name: "tenantConnectionId", in: "query", required: true, schema: { type: "string" } },
      ]),
    },
    "/api/galaxy/v1/provisioning-requests": {
      get: listOp("List provisioning requests for the org"),
      post: {
        summary: "Submit a provisioning request",
        security: [{ galaxyClientBearer: ["galaxy.interact"], galaxyUserToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["workspaceName", "workspaceType", "governedName", "siteOwners"],
                properties: {
                  workspaceName: { type: "string" },
                  workspaceType: { type: "string" },
                  governedName: { type: "string", description: "Must start with DEAL-, PORTCO-, or GEN-" },
                  projectType: { type: "string", enum: ["DEAL", "PORTCO", "GENERAL"] },
                  sensitivity: { type: "string" },
                  externalSharing: { type: "boolean" },
                  siteOwners: { type: "array", minItems: 2, items: { type: "object", required: ["displayName"], properties: { displayName: { type: "string" }, mail: { type: "string" }, userPrincipalName: { type: "string" } } } },
                  tenantConnectionId: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "400": { description: "invalid_request" }, "403": { description: "tenant_not_in_organization" } },
      },
    },
    "/api/galaxy/v1/copilot/assessments": {
      get: listOp("List Copilot prompt assessments (Professional+ feature)"),
    },
    "/api/galaxy/v1/email-storage-reports": {
      get: listOp("Email storage reports (Enterprise feature)", "galaxy.read", [
        { name: "tenantConnectionId", in: "query", required: true, schema: { type: "string" } },
      ]),
    },
    "/api/galaxy/v1/teams-recordings": {
      get: listOp("Teams recordings inventory", "galaxy.read", [
        { name: "search", in: "query", schema: { type: "string" } },
      ]),
    },
    "/api/galaxy/v1/audit-log": {
      get: listOp("Galaxy-source audit-log entries for the user's org"),
    },
    "/api/galaxy/v1/acknowledgements": {
      get: listOp("List acknowledgements for the org", "galaxy.read", [
        { name: "resourceType", in: "query", schema: { type: "string" } },
        { name: "resourceId", in: "query", schema: { type: "string" } },
        { name: "mine", in: "query", schema: { type: "boolean" } },
      ]),
      post: {
        summary: "Record an acknowledgement / dismissal / comment",
        security: [{ galaxyClientBearer: ["galaxy.interact"], galaxyUserToken: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["resourceType", "resourceId", "action"],
                properties: {
                  resourceType: { type: "string", enum: ["sharing_link", "lifecycle_finding", "copilot_blocker", "workspace", "provisioning_request"] },
                  resourceId: { type: "string" },
                  action: { type: "string", enum: ["ACKNOWLEDGE", "DISMISS", "COMMENT"] },
                  comment: { type: "string" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "400": { description: "invalid_request" } },
      },
    },
  },
};
