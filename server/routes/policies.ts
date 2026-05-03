import { Router } from "express";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { ZENITH_ROLES, insertGovernancePolicySchema, insertPolicyOutcomeSchema, type PolicyRuleDefinition, type GovernancePolicy } from "@shared/schema";
import { storage } from "../storage";
import { logAuditEvent, logAccessDenied, AUDIT_ACTIONS } from "../services/audit-logger";
import { auditDiff } from "../services/audit-diff";
import { evaluatePolicy, evaluationResultsToCopilotRules, formatPolicyBagValue, type EvaluationContext } from "../services/policy-engine";
import { getOrgTenantConnectionIds, getTenantConnectionIdsForOrg, getOwnedTenantConnectionIdsForOrg, getOwnedTenantConnectionIds, isWorkspaceInScope } from "./scope-helpers";
import { requireFeature } from "../services/feature-gate";
import { scoreWorkspaces, scoreWorkspace } from "../services/copilot-scoring";
import { buildRequiredFieldsByTenantId, getRequiredFieldsForWorkspace } from "../services/metadata-completeness";
import {
  runCopilotReadinessAssessment,
  getAssessmentRun,
  getLatestAssessmentRun,
  getLegacyOrgWideAssessmentRuns,
  deleteAssessmentRun,
  getWorkspaceNarrative,
  getAssessmentRunHistory,
} from "../services/copilot-assessment-service";

const router = Router();

/**
 * Resolve the SELECTOR-VALIDATION allow-list (own + MSP grants) for a request
 * scoped to a specific target organization. Use this for `?tenantConnectionId=`
 * checks so MSP-managed tenants remain reachable when a Synozur user picks
 * one explicitly.
 *
 * - Platform Owner: returns the target org's accessible connections.
 * - Other roles: returns the caller's accessible set (own + grants) via
 *   getOrgTenantConnectionIds; for non-PO users the active org matches the
 *   target org so this stays correct.
 */
async function resolveAllowedTenantIdsForOrg(
  req: AuthenticatedRequest,
  isPlatformOwner: boolean,
  targetOrgId: string,
): Promise<string[]> {
  if (isPlatformOwner) {
    return getTenantConnectionIdsForOrg(targetOrgId);
  }
  const allowed = await getOrgTenantConnectionIds(req);
  return allowed ?? (await getTenantConnectionIdsForOrg(targetOrgId));
}

/**
 * Resolve the DEFAULT-AGGREGATE tenant-connection IDs for a request scoped to a
 * specific target organization — own tenants only. MSP-granted tenants are
 * intentionally excluded; pick them via the tenant selector to drill in.
 */
async function resolveOwnedTenantIdsForOrg(
  req: AuthenticatedRequest,
  isPlatformOwner: boolean,
  targetOrgId: string,
): Promise<string[]> {
  if (isPlatformOwner) {
    return getOwnedTenantConnectionIdsForOrg(targetOrgId);
  }
  const owned = await getOwnedTenantConnectionIds(req);
  return owned ?? (await getOwnedTenantConnectionIdsForOrg(targetOrgId));
}

const RESERVED_PROPERTY_BAG_PREFIXES = ['vti_', 'ows_', 'docid_', '_vti_', '__', 'ecm_', 'ir_'];

function validatePropertyBagKey(key: string | undefined | null): string | null {
  if (!key) return null;
  const lower = key.toLowerCase();
  for (const prefix of RESERVED_PROPERTY_BAG_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return `Property bag key "${key}" uses a reserved SharePoint prefix "${prefix}". Use a custom prefix like "Zenith" instead.`;
    }
  }
  if (/[^a-zA-Z0-9_]/.test(key)) {
    return `Property bag key "${key}" contains invalid characters. Use only letters, numbers, and underscores.`;
  }
  return null;
}

router.get("/api/policies", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  const requestedOrgId = req.query.organizationId as string;
  if (!requestedOrgId) {
    return res.status(400).json({ message: "organizationId query parameter is required" });
  }
  const activeOrgId = req.activeOrganizationId || req.user?.organizationId;
  if (!isPlatformOwner && requestedOrgId !== activeOrgId) {
    await logAccessDenied(req, "governance_policy", requestedOrgId, "Cross-organization policy list");
    return res.status(403).json({ message: "Access denied: organizationId does not match your active organization" });
  }
  const policies = await storage.getGovernancePolicies(requestedOrgId);
  res.json(policies);
});

router.get("/api/policies/:id", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const policy = await storage.getGovernancePolicy(req.params.id);
  if (!policy) return res.status(404).json({ message: "Policy not found" });
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  const activeOrgId = req.activeOrganizationId || req.user?.organizationId;
  if (!isPlatformOwner && policy.organizationId !== activeOrgId) {
    await logAccessDenied(req, "governance_policy", req.params.id, "Cross-organization policy read");
    return res.status(404).json({ message: "Policy not found" });
  }
  res.json(policy);
});

router.post("/api/policies", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  const activeOrgId = req.activeOrganizationId || req.user?.organizationId;
  const body = { ...req.body };
  if (!isPlatformOwner) {
    if (body.organizationId && body.organizationId !== activeOrgId) {
      await logAccessDenied(req, "governance_policy", body.organizationId, "Attempt to create policy for different organization");
      return res.status(403).json({ message: "Cannot create policy for a different organization" });
    }
    body.organizationId = activeOrgId;
  }
  const parsed = insertGovernancePolicySchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  const policy = await storage.createGovernancePolicy(parsed.data);
  await logAuditEvent(req, {
    action: AUDIT_ACTIONS.POLICY_CREATED,
    resource: 'governance_policy',
    resourceId: policy.id,
    organizationId: policy.organizationId || null,
    details: { name: policy.name, policyType: policy.policyType, status: policy.status, ruleCount: Array.isArray(policy.rules) ? policy.rules.length : 0 },
  });
  res.status(201).json(policy);
});

router.patch("/api/policies/:id", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const existing = await storage.getGovernancePolicy(req.params.id);
  if (!existing) return res.status(404).json({ message: "Policy not found" });
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  const activeOrgId = req.activeOrganizationId || req.user?.organizationId;
  if (!isPlatformOwner && existing.organizationId !== activeOrgId) {
    await logAccessDenied(req, "governance_policy", req.params.id, "Cross-organization policy update");
    return res.status(404).json({ message: "Policy not found" });
  }

  const updates: Record<string, unknown> = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.status !== undefined) updates.status = req.body.status;
  if (req.body.rules !== undefined) updates.rules = req.body.rules;
  if (req.body.outcomeId !== undefined) updates.outcomeId = req.body.outcomeId;
  if (req.body.propertyBagKey !== undefined) {
    const keyError = validatePropertyBagKey(req.body.propertyBagKey);
    if (keyError) return res.status(400).json({ message: keyError });
    updates.propertyBagKey = req.body.propertyBagKey;
  }
  if (req.body.propertyBagValueFormat !== undefined) updates.propertyBagValueFormat = req.body.propertyBagValueFormat;

  const updated = await storage.updateGovernancePolicy(req.params.id, updates as any);
  const changes = auditDiff(existing as unknown as Record<string, unknown>, updates);
  await logAuditEvent(req, {
    action: AUDIT_ACTIONS.POLICY_UPDATED,
    resource: 'governance_policy',
    resourceId: req.params.id,
    organizationId: existing.organizationId || null,
    details: { name: existing.name, changedFields: Object.keys(updates), changes },
  });
  res.json(updated);
});

router.delete("/api/policies/:id", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const existing = await storage.getGovernancePolicy(req.params.id);
  if (!existing) return res.status(404).json({ message: "Policy not found" });
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  const activeOrgId = req.activeOrganizationId || req.user?.organizationId;
  if (!isPlatformOwner && existing.organizationId !== activeOrgId) {
    await logAccessDenied(req, "governance_policy", req.params.id, "Cross-organization policy delete");
    return res.status(404).json({ message: "Policy not found" });
  }
  await storage.deleteGovernancePolicy(req.params.id);
  await logAuditEvent(req, {
    action: AUDIT_ACTIONS.POLICY_DELETED,
    resource: 'governance_policy',
    resourceId: req.params.id,
    organizationId: existing.organizationId || null,
    details: { name: existing.name, policyType: existing.policyType },
  });
  res.json({ message: "Policy deleted" });
});

router.get("/api/policy-outcomes", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  const requestedOrgId = req.query.organizationId as string;
  if (!requestedOrgId) return res.status(400).json({ message: "organizationId required" });
  const activeOrgId = req.activeOrganizationId || req.user?.organizationId;
  if (!isPlatformOwner && requestedOrgId !== activeOrgId) {
    await logAccessDenied(req, "policy_outcome", requestedOrgId, "Cross-organization outcome list");
    return res.status(403).json({ message: "Access denied: organizationId does not match your active organization" });
  }
  const outcomes = await storage.getPolicyOutcomes(requestedOrgId);
  res.json(outcomes);
});

router.post("/api/policy-outcomes", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  const activeOrgId = req.activeOrganizationId || req.user?.organizationId;
  const body = { ...req.body };
  if (!isPlatformOwner) {
    if (body.organizationId && body.organizationId !== activeOrgId) {
      await logAccessDenied(req, "policy_outcome", body.organizationId, "Attempt to create outcome for different organization");
      return res.status(403).json({ message: "Cannot create policy outcome for a different organization" });
    }
    body.organizationId = activeOrgId;
  }
  if (body.propertyBagKey) {
    const keyError = validatePropertyBagKey(body.propertyBagKey);
    if (keyError) return res.status(400).json({ message: keyError });
  }
  const parsed = insertPolicyOutcomeSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  const outcome = await storage.createPolicyOutcome(parsed.data);
  await logAuditEvent(req, {
    action: AUDIT_ACTIONS.POLICY_OUTCOME_CREATED,
    resource: 'policy_outcome',
    resourceId: outcome.id,
    organizationId: outcome.organizationId || null,
    details: { name: outcome.name, workspaceField: outcome.workspaceField, propertyBagKey: outcome.propertyBagKey },
  });
  res.status(201).json(outcome);
});

router.patch("/api/policy-outcomes/:id", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const existing = await storage.getPolicyOutcome(req.params.id);
  if (!existing) return res.status(404).json({ message: "Outcome not found" });
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  const activeOrgId = req.activeOrganizationId || req.user?.organizationId;
  if (!isPlatformOwner && existing.organizationId !== activeOrgId) {
    await logAccessDenied(req, "policy_outcome", req.params.id, "Cross-organization outcome update");
    return res.status(404).json({ message: "Outcome not found" });
  }
  const updates: Record<string, unknown> = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.showAsColumn !== undefined) updates.showAsColumn = req.body.showAsColumn;
  if (req.body.showAsFilter !== undefined) updates.showAsFilter = req.body.showAsFilter;
  if (req.body.propertyBagKey !== undefined) {
    const keyError = validatePropertyBagKey(req.body.propertyBagKey);
    if (keyError) return res.status(400).json({ message: keyError });
    updates.propertyBagKey = req.body.propertyBagKey;
  }
  if (req.body.sortOrder !== undefined) updates.sortOrder = req.body.sortOrder;
  const updated = await storage.updatePolicyOutcome(req.params.id, updates as any);
  const changes = auditDiff(existing as unknown as Record<string, unknown>, updates);
  await logAuditEvent(req, {
    action: AUDIT_ACTIONS.POLICY_OUTCOME_UPDATED,
    resource: 'policy_outcome',
    resourceId: req.params.id,
    organizationId: existing.organizationId || null,
    details: { name: existing.name, changedFields: Object.keys(updates), changes },
  });
  res.json(updated);
});

router.delete("/api/policy-outcomes/:id", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const existing = await storage.getPolicyOutcome(req.params.id);
  if (!existing) return res.status(404).json({ message: "Outcome not found" });
  const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
  const activeOrgId = req.activeOrganizationId || req.user?.organizationId;
  if (!isPlatformOwner && existing.organizationId !== activeOrgId) {
    await logAccessDenied(req, "policy_outcome", req.params.id, "Cross-organization outcome delete");
    return res.status(404).json({ message: "Outcome not found" });
  }
  if (existing.builtIn) return res.status(400).json({ message: "Cannot delete built-in outcomes" });
  await storage.deletePolicyOutcome(req.params.id);
  await logAuditEvent(req, {
    action: AUDIT_ACTIONS.POLICY_OUTCOME_DELETED,
    resource: 'policy_outcome',
    resourceId: req.params.id,
    organizationId: existing.organizationId || null,
    details: { name: existing.name },
  });
  res.json({ message: "Outcome deleted" });
});

router.post("/api/policies/simulate", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const { tenantConnectionId, rules, policyId } = req.body;
    if (!tenantConnectionId || !Array.isArray(rules)) {
      return res.status(400).json({ message: "tenantConnectionId and rules array are required" });
    }

    const allowedTenantIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantIds !== null && !allowedTenantIds.includes(tenantConnectionId)) {
      return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
    }

    const connection = await storage.getTenantConnection(tenantConnectionId);
    if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

    const orgId = connection.organizationId;
    if (!orgId) return res.status(400).json({ message: "No organization linked to this tenant" });

    const metaEntries = await storage.getDataDictionary(connection.tenantId, "required_metadata_field");
    const context: EvaluationContext = { requiredMetadataFields: metaEntries.map(e => e.value) };

    const proposedPolicy: GovernancePolicy = {
      id: policyId || "simulation",
      name: "Simulation",
      policyType: "CUSTOM",
      organizationId: orgId,
      status: "ACTIVE",
      rules: rules as PolicyRuleDefinition[],
      propertyBagKey: null,
      propertyBagValueFormat: null,
      description: null,
      createdAt: new Date(),
    };

    let currentPolicy: GovernancePolicy | undefined;
    if (policyId) {
      currentPolicy = await storage.getGovernancePolicy(policyId);
    }
    if (!currentPolicy) {
      const allPolicies = await storage.getGovernancePolicies(orgId);
      currentPolicy = allPolicies.find(p => p.status === "ACTIVE");
    }

    const workspaces = await storage.getWorkspaces(undefined, tenantConnectionId);

    const workspaceResults: {
      id: string;
      displayName: string;
      siteUrl: string | null;
      type: string;
      currentPass: boolean;
      proposedPass: boolean;
      changeType: "no_change" | "now_passing" | "now_failing";
      currentRules: { ruleName: string; ruleResult: string; ruleDescription: string }[];
      proposedRules: { ruleName: string; ruleResult: string; ruleDescription: string }[];
    }[] = [];

    let currentPassCount = 0;
    let currentFailCount = 0;
    let proposedPassCount = 0;
    let proposedFailCount = 0;
    let newlyPassing = 0;
    let newlyFailing = 0;

    for (const ws of workspaces) {
      const currentEval = currentPolicy
        ? evaluatePolicy(ws, currentPolicy, context)
        : { overallPass: false, results: [] as { ruleName: string; ruleResult: string; ruleDescription: string }[] };

      const proposedEval = evaluatePolicy(ws, proposedPolicy, context);

      const currentPass = currentEval.overallPass;
      const proposedPass = proposedEval.overallPass;

      if (currentPass) currentPassCount++;
      else currentFailCount++;
      if (proposedPass) proposedPassCount++;
      else proposedFailCount++;

      let changeType: "no_change" | "now_passing" | "now_failing" = "no_change";
      if (!currentPass && proposedPass) { changeType = "now_passing"; newlyPassing++; }
      if (currentPass && !proposedPass) { changeType = "now_failing"; newlyFailing++; }

      workspaceResults.push({
        id: ws.id,
        displayName: ws.displayName,
        siteUrl: ws.siteUrl,
        type: ws.type,
        currentPass,
        proposedPass,
        changeType,
        currentRules: currentEval.results.map(r => ({ ruleName: r.ruleName, ruleResult: r.ruleResult, ruleDescription: r.ruleDescription })),
        proposedRules: proposedEval.results.map(r => ({ ruleName: r.ruleName, ruleResult: r.ruleResult, ruleDescription: r.ruleDescription })),
      });
    }

    res.json({
      summary: {
        total: workspaces.length,
        currentPass: currentPassCount,
        currentFail: currentFailCount,
        proposedPass: proposedPassCount,
        proposedFail: proposedFailCount,
        newlyPassing,
        newlyFailing,
        unchanged: workspaces.length - newlyPassing - newlyFailing,
      },
      workspaces: workspaceResults,
    });
  } catch (err: any) {
    console.error("[Policy Simulate] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.post("/api/policies/:id/evaluate", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  const policy = await storage.getGovernancePolicy(req.params.id);
  if (!policy) return res.status(404).json({ message: "Policy not found" });

  const { workspaceIds } = req.body;
  if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
    return res.status(400).json({ message: "workspaceIds array is required" });
  }

  const allowedTenantIds = await getOrgTenantConnectionIds(req);

  const outcome = policy.outcomeId ? await storage.getPolicyOutcome(policy.outcomeId) : null;
  const tenantMetadataCache = new Map<string, string[]>();

  const results = [];
  for (const wsId of workspaceIds) {
    const workspace = await storage.getWorkspace(wsId);
    if (!workspace) continue;
    if (allowedTenantIds !== null && (!workspace.tenantConnectionId || !allowedTenantIds.includes(workspace.tenantConnectionId))) continue;

    let requiredMetadataFields: string[] = [];
    if (workspace.tenantConnectionId) {
      if (tenantMetadataCache.has(workspace.tenantConnectionId)) {
        requiredMetadataFields = tenantMetadataCache.get(workspace.tenantConnectionId)!;
      } else {
        const conn = await storage.getTenantConnection(workspace.tenantConnectionId);
        if (conn) {
          const entries = await storage.getDataDictionary(conn.tenantId, "required_metadata_field");
          requiredMetadataFields = entries.map(e => e.value);
          tenantMetadataCache.set(workspace.tenantConnectionId, requiredMetadataFields);
        }
      }
    }

    const context: EvaluationContext = { requiredMetadataFields };
    const evaluation = evaluatePolicy(workspace, policy, context);
    const ruleRecords = evaluationResultsToCopilotRules(wsId, evaluation);
    await storage.setCopilotRules(wsId, ruleRecords);

    const updates: Record<string, any> = {};
    if (outcome?.workspaceField === "copilotReady") {
      updates.copilotReady = evaluation.overallPass;
    }
    const effectiveBagKey = policy.propertyBagKey || outcome?.propertyBagKey;
    if (effectiveBagKey) {
      const bagValue = formatPolicyBagValue(evaluation, policy.propertyBagValueFormat);
      const existingBag = (workspace.propertyBag as Record<string, string>) || {};
      if (existingBag[effectiveBagKey] !== bagValue) {
        updates.propertyBag = { ...existingBag, [effectiveBagKey]: bagValue };
      }
    }
    if (Object.keys(updates).length > 0) {
      await storage.updateWorkspace(wsId, updates);
    }

    results.push({ workspaceId: wsId, ...evaluation, copilotReady: outcome?.workspaceField === "copilotReady" ? evaluation.overallPass : workspace.copilotReady });
  }

  res.json({ evaluated: results.length, results });
});

router.post("/api/admin/tenants/:id/evaluate-policies", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), requireFeature("lifecycleAutomation"), async (req: AuthenticatedRequest, res) => {
  try {
    const allowedTenantIds = await getOrgTenantConnectionIds(req);
    if (allowedTenantIds !== null && !allowedTenantIds.includes(req.params.id)) {
      return res.status(403).json({ message: "Tenant connection is outside your organization scope" });
    }

    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

    const orgId = connection.organizationId;
    if (!orgId) return res.status(400).json({ message: "No organization linked to this tenant" });

    const policiesWithOutcomes = await storage.getActivePoliciesWithOutcomes(orgId);
    if (policiesWithOutcomes.length === 0) return res.json({ message: "No active policies found", evaluated: 0 });

    const metaEntries = await storage.getDataDictionary(connection.tenantId, "required_metadata_field");
    const context: EvaluationContext = { requiredMetadataFields: metaEntries.map(e => e.value) };

    const workspaces = await storage.getWorkspaces(undefined, req.params.id);
    let evaluated = 0;
    let changed = 0;
    const policyNames: string[] = [];

    for (const policy of policiesWithOutcomes) {
      policyNames.push(policy.name);
      for (const ws of workspaces) {
        const evaluation = evaluatePolicy(ws, policy, context);
        const ruleRecords = evaluationResultsToCopilotRules(ws.id, evaluation);
        await storage.setCopilotRules(ws.id, ruleRecords);
        const updates: Record<string, any> = {};

        if (policy.outcome?.workspaceField === "copilotReady" && ws.copilotReady !== evaluation.overallPass) {
          updates.copilotReady = evaluation.overallPass;
          changed++;
        }
        const effectiveBagKey = policy.propertyBagKey || policy.outcome?.propertyBagKey;
        if (effectiveBagKey) {
          const bagValue = formatPolicyBagValue(evaluation, policy.propertyBagValueFormat);
          const existingBag = (ws.propertyBag as Record<string, string>) || {};
          if (existingBag[effectiveBagKey] !== bagValue) {
            updates.propertyBag = { ...existingBag, [effectiveBagKey]: bagValue };
          }
        }
        if (Object.keys(updates).length > 0) {
          await storage.updateWorkspace(ws.id, updates);
        }
      }
      evaluated += workspaces.length;
    }

    res.json({ evaluated, changed, policies: policyNames });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/workspaces/:id/policy-results", requireAuth(), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  const workspace = await storage.getWorkspace(req.params.id);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });

  const connection = workspace.tenantConnectionId
    ? await storage.getTenantConnection(workspace.tenantConnectionId)
    : null;

  if (!connection) {
    const storedRules = await storage.getCopilotRules(req.params.id);
    return res.json({ policyId: null, policyName: "Copilot Readiness", policies: [], results: storedRules, overallPass: workspace.copilotReady });
  }

  const org = connection.organizationId ? await storage.getOrganization(connection.organizationId) : undefined;
  if (!org) {
    const storedRules = await storage.getCopilotRules(req.params.id);
    return res.json({ policyId: null, policyName: "Copilot Readiness", policies: [], results: storedRules, overallPass: workspace.copilotReady });
  }

  const policiesWithOutcomes = await storage.getActivePoliciesWithOutcomes(org.id);
  if (policiesWithOutcomes.length === 0) {
    const storedRules = await storage.getCopilotRules(req.params.id);
    return res.json({ policyId: null, policyName: "Copilot Readiness", policies: [], results: storedRules, overallPass: workspace.copilotReady });
  }

  const requiredMetadataEntries = await storage.getDataDictionary(connection.tenantId, "required_metadata_field");
  const context: EvaluationContext = {
    requiredMetadataFields: requiredMetadataEntries.map(e => e.value),
  };

  const allResults: { ruleType: string; ruleName: string; ruleResult: string; ruleDescription: string; policyName?: string }[] = [];
  const policyEvaluations: { policyId: string; policyName: string; policyType: string; outcomeId?: string | null; outcomeName?: string; overallPass: boolean; passCount: number; failCount: number }[] = [];
  const evalUpdates: Record<string, any> = {};
  const existingBag = (workspace.propertyBag as Record<string, string>) || {};
  let bagUpdated = false;
  const allRuleRecords: any[] = [];

  for (const policy of policiesWithOutcomes) {
    const evaluation = evaluatePolicy(workspace, policy, context);
    const ruleRecords = evaluationResultsToCopilotRules(req.params.id, evaluation);
    allRuleRecords.push(...ruleRecords);

    for (const r of evaluation.results) {
      allResults.push({ ...r, policyName: policy.name });
    }

    policyEvaluations.push({
      policyId: policy.id,
      policyName: policy.name,
      policyType: policy.policyType,
      outcomeId: policy.outcomeId,
      outcomeName: policy.outcome?.name,
      overallPass: evaluation.overallPass,
      passCount: evaluation.passCount,
      failCount: evaluation.failCount,
    });

    if (policy.outcome?.workspaceField === "copilotReady") {
      if (workspace.copilotReady !== evaluation.overallPass) {
        evalUpdates.copilotReady = evaluation.overallPass;
      }
    }

    const effectiveBagKey = policy.propertyBagKey || policy.outcome?.propertyBagKey;
    if (effectiveBagKey) {
      const bagValue = formatPolicyBagValue(evaluation, policy.propertyBagValueFormat);
      if (existingBag[effectiveBagKey] !== bagValue) {
        existingBag[effectiveBagKey] = bagValue;
        bagUpdated = true;
      }
    }
  }

  await storage.setCopilotRules(req.params.id, allRuleRecords);

  if (bagUpdated) {
    evalUpdates.propertyBag = existingBag;
  }
  if (Object.keys(evalUpdates).length > 0) {
    await storage.updateWorkspace(req.params.id, evalUpdates);
  }

  const primaryPolicy = policiesWithOutcomes.find(p => p.outcome?.workspaceField === "copilotReady") || policiesWithOutcomes[0];

  res.json({
    policyId: primaryPolicy.id,
    policyName: primaryPolicy.name,
    policyType: primaryPolicy.policyType,
    policies: policyEvaluations,
    results: allResults,
    overallPass: evalUpdates.copilotReady !== undefined ? evalUpdates.copilotReady : workspace.copilotReady,
    passCount: allResults.filter(r => r.ruleResult === "PASS").length,
    failCount: allResults.filter(r => r.ruleResult === "FAIL").length,
  });
});

// ── Copilot Readiness Dashboard (BL-006) ──

/**
 * Org-wide Copilot readiness dashboard — summary, full workspace list, and
 * remediation queue. Service-plan gated (Professional+).
 */
router.get("/api/copilot-readiness", requireAuth(), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  try {
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = isPlatformOwner
      ? ((req.query.orgId as string | undefined) || req.activeOrganizationId || req.user?.organizationId)
      : (req.activeOrganizationId || req.user?.organizationId);

    if (!orgId) {
      return res.json({
        summary: {
          totalWorkspaces: 0,
          evaluated: 0,
          excluded: 0,
          ready: 0,
          nearlyReady: 0,
          atRisk: 0,
          blocked: 0,
          averageScore: 0,
          readinessPercent: 0,
          blockerBreakdown: [],
        },
        workspaces: [],
        remediationQueue: [],
      });
    }

    const tenantFilter = typeof req.query.tenantConnectionId === "string" && req.query.tenantConnectionId
      ? req.query.tenantConnectionId
      : undefined;

    let allWorkspaces: Awaited<ReturnType<typeof storage.getWorkspaces>> = [];
    if (tenantFilter) {
      // Selector pick — validate against the broader accessible set (own +
      // MSP grants) so MSP users can drill into managed tenants.
      const accessibleIdsForOrg = await resolveAllowedTenantIdsForOrg(req, isPlatformOwner, orgId);
      if (!accessibleIdsForOrg.includes(tenantFilter)) {
        return res.status(403).json({ message: "Tenant connection is not in scope for this organization." });
      }
      allWorkspaces = await storage.getWorkspaces(undefined, tenantFilter);
    } else {
      // Default aggregate — own tenants only.
      const ownedIdsForOrg = await resolveOwnedTenantIdsForOrg(req, isPlatformOwner, orgId);
      if (ownedIdsForOrg.length > 0) {
        const perTenantResults = await Promise.all(
          ownedIdsForOrg.map(tid => storage.getWorkspaces(undefined, tid)),
        );
        allWorkspaces = perTenantResults.flat();
      }
    }

    const requiredFieldsByTenantId = await buildRequiredFieldsByTenantId(allWorkspaces);
    const result = scoreWorkspaces(allWorkspaces, requiredFieldsByTenantId);
    res.json(result);
  } catch (err: any) {
    console.error("[copilot-readiness] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Per-workspace readiness breakdown — criteria, score, and remediation steps
 * for a single workspace.
 */
router.get("/api/workspaces/:id/copilot-readiness", requireAuth(), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  const workspace = await storage.getWorkspace(req.params.id);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });
  const requiredFields = await getRequiredFieldsForWorkspace(workspace);
  res.json(scoreWorkspace(workspace, requiredFields));
});

/**
 * Toggle the explicit Copilot-exclusion flag on a workspace. The value lives
 * inside the existing `customFields` jsonb column to avoid a schema change.
 */
router.patch("/api/workspaces/:id/copilot-exclusion", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  if (!(await isWorkspaceInScope(req, req.params.id))) {
    return res.status(404).json({ message: "Workspace not found" });
  }
  const workspace = await storage.getWorkspace(req.params.id);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });

  const { excluded, reason } = req.body as { excluded?: boolean; reason?: string };
  if (typeof excluded !== "boolean") {
    return res.status(400).json({ message: "Body must include `excluded: boolean`." });
  }

  const existingFields = (workspace.customFields as Record<string, any>) || {};
  const nextFields: Record<string, any> = { ...existingFields };
  if (excluded) {
    nextFields.copilot_excluded = true;
    if (reason) nextFields.copilot_exclusion_reason = reason;
  } else {
    delete nextFields.copilot_excluded;
    delete nextFields.copilot_exclusion_reason;
  }

  const updated = await storage.updateWorkspace(req.params.id, { customFields: nextFields } as any);

  await storage.createAuditEntry({
    userId: req.user?.id || null,
    userEmail: req.user?.email || null,
    action: excluded ? 'COPILOT_EXCLUDED' : 'COPILOT_EXCLUSION_REMOVED',
    resource: 'workspace',
    resourceId: req.params.id,
    organizationId: req.user?.organizationId || null,
    tenantConnectionId: workspace.tenantConnectionId || null,
    details: {
      workspaceName: workspace.displayName,
      excluded,
      reason: reason || null,
    },
    result: 'SUCCESS',
    ipAddress: req.ip || null,
  });

  const requiredFields = updated ? await getRequiredFieldsForWorkspace(updated) : [];
  res.json(updated ? scoreWorkspace(updated, requiredFields) : null);
});

// ── AI Copilot Readiness Assessment Routes (Task #52) ──

/**
 * Trigger a background AI assessment for the org.
 * Returns a runId that can be polled via GET /api/copilot-readiness/assessment/:runId
 */
router.post("/api/copilot-readiness/assessment", requireAuth(), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  try {
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = isPlatformOwner
      ? ((req.body.orgId as string | undefined) || req.activeOrganizationId || req.user?.organizationId)
      : (req.activeOrganizationId || req.user?.organizationId);

    if (!orgId) {
      return res.status(400).json({ message: "Organization context required" });
    }

    const tenantConnectionId = typeof req.body.tenantConnectionId === "string" && req.body.tenantConnectionId
      ? req.body.tenantConnectionId
      : null;

    if (tenantConnectionId) {
      const allowedIds = await resolveAllowedTenantIdsForOrg(req, isPlatformOwner, orgId);
      if (!allowedIds.includes(tenantConnectionId)) {
        return res.status(403).json({ message: "Tenant connection is not in scope for this organization." });
      }
    }

    const triggeredBy = req.user?.id || req.user?.email || null;
    const runId = await runCopilotReadinessAssessment(orgId, triggeredBy, tenantConnectionId);
    res.status(202).json({ runId, status: "PENDING" });
  } catch (err: any) {
    console.error("[AI Assessment] Error triggering assessment:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Get the latest completed assessment for the org.
 */
router.get("/api/copilot-readiness/assessment/latest", requireAuth(), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  try {
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = isPlatformOwner
      ? ((req.query.orgId as string | undefined) || req.activeOrganizationId || req.user?.organizationId)
      : (req.activeOrganizationId || req.user?.organizationId);

    if (!orgId) {
      return res.json(null);
    }

    const tenantConnectionId = typeof req.query.tenantConnectionId === "string" && req.query.tenantConnectionId
      ? req.query.tenantConnectionId
      : null;

    if (tenantConnectionId) {
      const allowedIds = await resolveAllowedTenantIdsForOrg(req, isPlatformOwner, orgId);
      if (!allowedIds.includes(tenantConnectionId)) {
        return res.status(403).json({ message: "Tenant connection is not in scope for this organization." });
      }
    }

    const run = await getLatestAssessmentRun(orgId, 'copilot_readiness', tenantConnectionId);
    res.json(run);
  } catch (err: any) {
    console.error("[AI Assessment] Error fetching latest:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * List "legacy" org-wide Copilot Readiness assessment runs — completed
 * runs that pre-date tenant scoping (Task #57) and weren't safely
 * attributable to a single tenant by the Task #58 backfill (i.e. the
 * org has multiple tenant connections). Surfaced behind a "View
 * previous org-wide runs" affordance so historical executive summaries
 * and roadmaps stay visible instead of looking deleted.
 */
router.get("/api/copilot-readiness/assessment/legacy", requireAuth(), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  try {
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = isPlatformOwner
      ? ((req.query.orgId as string | undefined) || req.activeOrganizationId || req.user?.organizationId)
      : (req.activeOrganizationId || req.user?.organizationId);

    if (!orgId) {
      return res.json([]);
    }

    const runs = await getLegacyOrgWideAssessmentRuns(orgId, 'copilot_readiness');
    res.json(runs);
  } catch (err: any) {
    console.error("[AI Assessment] Error fetching legacy runs:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Paginated history of past Copilot Readiness assessments for the active tenant
 * within the active organization. Newest first.
 */
router.get("/api/copilot-readiness/assessment/history", requireAuth(), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  try {
    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = isPlatformOwner
      ? ((req.query.orgId as string | undefined) || req.activeOrganizationId || req.user?.organizationId)
      : (req.activeOrganizationId || req.user?.organizationId);

    if (!orgId) {
      return res.status(400).json({ message: "Organization context required" });
    }

    const tenantConnectionId = typeof req.query.tenantConnectionId === "string" && req.query.tenantConnectionId
      ? req.query.tenantConnectionId
      : null;

    if (tenantConnectionId) {
      const allowedIds = await resolveAllowedTenantIdsForOrg(req, isPlatformOwner, orgId);
      if (!allowedIds.includes(tenantConnectionId)) {
        return res.status(403).json({ message: "Tenant connection is not in scope for this organization." });
      }
    }

    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? "20"), 10) || 20, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? "0"), 10) || 0, 0);

    const { runs, total } = await getAssessmentRunHistory(
      orgId,
      'copilot_readiness',
      tenantConnectionId,
      limit,
      offset,
    );
    res.json({ runs, total, limit, offset });
  } catch (err: any) {
    console.error("[AI Assessment] Error fetching history:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Poll the status and result of a specific assessment run.
 */
router.get("/api/copilot-readiness/assessment/:runId", requireAuth(), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  try {
    const run = await getAssessmentRun(req.params.runId);
    if (!run) {
      return res.status(404).json({ message: "Assessment run not found" });
    }

    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = isPlatformOwner
      ? run.orgId
      : (req.activeOrganizationId || req.user?.organizationId);

    if (!isPlatformOwner && run.orgId !== orgId) {
      return res.status(404).json({ message: "Assessment run not found" });
    }

    const tenantConnectionId = typeof req.query.tenantConnectionId === "string" && req.query.tenantConnectionId
      ? req.query.tenantConnectionId
      : null;

    if (!isPlatformOwner && tenantConnectionId && run.tenantConnectionId !== tenantConnectionId) {
      return res.status(404).json({ message: "Assessment run not found" });
    }

    res.json(run);
  } catch (err: any) {
    console.error("[AI Assessment] Error fetching run:", err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete a Copilot Readiness assessment run. Governance admins only.
 * Refuses to delete RUNNING runs. Enforces tenant + org scope.
 */
router.delete(
  "/api/copilot-readiness/assessment/:runId",
  requireAuth(),
  requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN),
  requireFeature("copilotReadiness"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const run = await getAssessmentRun(req.params.runId);
      if (!run) {
        return res.status(404).json({ message: "Assessment run not found" });
      }

      const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
      const orgId = isPlatformOwner
        ? run.orgId
        : (req.activeOrganizationId || req.user?.organizationId);

      if (!orgId || (!isPlatformOwner && run.orgId !== orgId)) {
        return res.status(404).json({ message: "Assessment run not found" });
      }

      const tenantConnectionId = typeof req.query.tenantConnectionId === "string" && req.query.tenantConnectionId
        ? req.query.tenantConnectionId
        : null;

      if (!isPlatformOwner && tenantConnectionId && run.tenantConnectionId !== tenantConnectionId) {
        return res.status(404).json({ message: "Assessment run not found" });
      }

      if (run.status === "RUNNING") {
        return res.status(409).json({ message: "Cannot delete a run that is still in progress" });
      }

      const deleted = await deleteAssessmentRun(req.params.runId, run.orgId);
      if (!deleted) {
        return res.status(404).json({ message: "Assessment run not found or already deleted" });
      }

      return res.status(204).end();
    } catch (err: any) {
      console.error("[AI Assessment] Error deleting run:", err);
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * Per-workspace AI remediation narrative — fetched on demand, cached 1 hour.
 */
router.get("/api/workspaces/:id/copilot-readiness/narrative", requireAuth(), requireFeature("copilotReadiness"), async (req: AuthenticatedRequest, res) => {
  try {
    if (!(await isWorkspaceInScope(req, req.params.id))) {
      return res.status(404).json({ message: "Workspace not found" });
    }

    const isPlatformOwner = req.user?.role === ZENITH_ROLES.PLATFORM_OWNER;
    const orgId = isPlatformOwner
      ? ((req.query.orgId as string | undefined) || req.activeOrganizationId || req.user?.organizationId)
      : (req.activeOrganizationId || req.user?.organizationId);

    if (!orgId) {
      return res.status(400).json({ message: "Organization context required" });
    }

    // If the caller has an active tenant scope, ensure the workspace belongs
    // to that tenant — prevents cross-tenant lookup by guessed workspace id.
    const tenantConnectionId = typeof req.query.tenantConnectionId === "string" && req.query.tenantConnectionId
      ? req.query.tenantConnectionId
      : null;
    if (tenantConnectionId) {
      const ws = await storage.getWorkspace(req.params.id);
      if (!ws || ws.tenantConnectionId !== tenantConnectionId) {
        return res.status(404).json({ message: "Workspace not found" });
      }
    }

    const narrative = await getWorkspaceNarrative(req.params.id, orgId);
    res.json({ narrative });
  } catch (err: any) {
    console.error("[AI Assessment] Error fetching workspace narrative:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
