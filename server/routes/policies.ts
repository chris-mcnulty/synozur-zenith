import { Router } from "express";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middleware/rbac";
import { ZENITH_ROLES, insertGovernancePolicySchema } from "@shared/schema";
import { storage } from "../storage";
import { evaluatePolicy, evaluationResultsToCopilotRules, formatPolicyBagValue, type EvaluationContext } from "../services/policy-engine";

const router = Router();

router.get("/api/policies", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const organizationId = req.query.organizationId as string;
  if (!organizationId) {
    return res.status(400).json({ message: "organizationId query parameter is required" });
  }
  const policies = await storage.getGovernancePolicies(organizationId);
  res.json(policies);
});

router.get("/api/policies/:id", requireAuth(), async (req: AuthenticatedRequest, res) => {
  const policy = await storage.getGovernancePolicy(req.params.id);
  if (!policy) return res.status(404).json({ message: "Policy not found" });
  res.json(policy);
});

router.post("/api/policies", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const parsed = insertGovernancePolicySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  const policy = await storage.createGovernancePolicy(parsed.data);
  res.status(201).json(policy);
});

router.patch("/api/policies/:id", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const existing = await storage.getGovernancePolicy(req.params.id);
  if (!existing) return res.status(404).json({ message: "Policy not found" });

  const updates: Record<string, unknown> = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.status !== undefined) updates.status = req.body.status;
  if (req.body.rules !== undefined) updates.rules = req.body.rules;
  if (req.body.propertyBagKey !== undefined) updates.propertyBagKey = req.body.propertyBagKey;
  if (req.body.propertyBagValueFormat !== undefined) updates.propertyBagValueFormat = req.body.propertyBagValueFormat;

  const updated = await storage.updateGovernancePolicy(req.params.id, updates as any);
  res.json(updated);
});

router.delete("/api/policies/:id", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  await storage.deleteGovernancePolicy(req.params.id);
  res.json({ message: "Policy deleted" });
});

router.post("/api/policies/:id/evaluate", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  const policy = await storage.getGovernancePolicy(req.params.id);
  if (!policy) return res.status(404).json({ message: "Policy not found" });

  const { workspaceIds } = req.body;
  if (!Array.isArray(workspaceIds) || workspaceIds.length === 0) {
    return res.status(400).json({ message: "workspaceIds array is required" });
  }

  const tenantMetadataCache = new Map<string, string[]>();

  const results = [];
  for (const wsId of workspaceIds) {
    const workspace = await storage.getWorkspace(wsId);
    if (!workspace) continue;

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

    const copilotReady = evaluation.overallPass;
    await storage.updateWorkspace(wsId, { copilotReady });

    results.push({ workspaceId: wsId, ...evaluation, copilotReady });
  }

  res.json({ evaluated: results.length, results });
});

router.post("/api/admin/tenants/:id/evaluate-policies", requireRole(ZENITH_ROLES.GOVERNANCE_ADMIN, ZENITH_ROLES.TENANT_ADMIN), async (req: AuthenticatedRequest, res) => {
  try {
    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

    const orgId = connection.organizationId;
    if (!orgId) return res.status(400).json({ message: "No organization linked to this tenant" });

    const allPolicies = await storage.getGovernancePolicies(orgId);
    const activePolicies = allPolicies.filter(p => p.status === "ACTIVE");
    if (activePolicies.length === 0) return res.json({ message: "No active policies found", evaluated: 0 });

    const metaEntries = await storage.getDataDictionary(connection.tenantId, "required_metadata_field");
    const context: EvaluationContext = { requiredMetadataFields: metaEntries.map(e => e.value) };

    const workspaces = await storage.getWorkspaces(undefined, req.params.id);
    let evaluated = 0;
    let changed = 0;
    const policyNames: string[] = [];

    for (const policy of activePolicies) {
      policyNames.push(policy.name);
      for (const ws of workspaces) {
        const evaluation = evaluatePolicy(ws, policy, context);
        const ruleRecords = evaluationResultsToCopilotRules(ws.id, evaluation);
        await storage.setCopilotRules(ws.id, ruleRecords);
        const updates: Record<string, any> = {};

        const isCopilotPolicy = policy.policyType === "COPILOT_READINESS" || activePolicies.length === 1;
        if (isCopilotPolicy && ws.copilotReady !== evaluation.overallPass) {
          updates.copilotReady = evaluation.overallPass;
          changed++;
        }
        if (policy.propertyBagKey) {
          const bagValue = formatPolicyBagValue(evaluation, policy.propertyBagValueFormat);
          const existingBag = (ws.propertyBag as Record<string, string>) || {};
          if (existingBag[policy.propertyBagKey] !== bagValue) {
            updates.propertyBag = { ...existingBag, [policy.propertyBagKey]: bagValue };
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

router.get("/api/workspaces/:id/policy-results", requireAuth(), async (req: AuthenticatedRequest, res) => {
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

  const allPolicies = await storage.getGovernancePolicies(org.id);
  const activePolicies = allPolicies.filter(p => p.status === "ACTIVE");
  if (activePolicies.length === 0) {
    const storedRules = await storage.getCopilotRules(req.params.id);
    return res.json({ policyId: null, policyName: "Copilot Readiness", policies: [], results: storedRules, overallPass: workspace.copilotReady });
  }

  const requiredMetadataEntries = await storage.getDataDictionary(connection.tenantId, "required_metadata_field");
  const context: EvaluationContext = {
    requiredMetadataFields: requiredMetadataEntries.map(e => e.value),
  };

  const allResults: { ruleType: string; ruleName: string; ruleResult: string; ruleDescription: string; policyName?: string }[] = [];
  const policyEvaluations: { policyId: string; policyName: string; policyType: string; overallPass: boolean; passCount: number; failCount: number }[] = [];
  let overallCopilotReady = true;
  const evalUpdates: Record<string, any> = {};
  const existingBag = (workspace.propertyBag as Record<string, string>) || {};
  let bagUpdated = false;
  const allRuleRecords: any[] = [];

  for (const policy of activePolicies) {
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
      overallPass: evaluation.overallPass,
      passCount: evaluation.passCount,
      failCount: evaluation.failCount,
    });

    if (!evaluation.overallPass) overallCopilotReady = false;

    if (policy.propertyBagKey) {
      const bagValue = formatPolicyBagValue(evaluation, policy.propertyBagValueFormat);
      if (existingBag[policy.propertyBagKey] !== bagValue) {
        existingBag[policy.propertyBagKey] = bagValue;
        bagUpdated = true;
      }
    }
  }

  await storage.setCopilotRules(req.params.id, allRuleRecords);

  if (workspace.copilotReady !== overallCopilotReady) {
    evalUpdates.copilotReady = overallCopilotReady;
  }
  if (bagUpdated) {
    evalUpdates.propertyBag = existingBag;
  }
  if (Object.keys(evalUpdates).length > 0) {
    await storage.updateWorkspace(req.params.id, evalUpdates);
  }

  const primaryPolicy = activePolicies.find(p => p.policyType === "COPILOT_READINESS") || activePolicies[0];

  res.json({
    policyId: primaryPolicy.id,
    policyName: primaryPolicy.name,
    policyType: primaryPolicy.policyType,
    policies: policyEvaluations,
    results: allResults,
    overallPass: overallCopilotReady,
    passCount: allResults.filter(r => r.ruleResult === "PASS").length,
    failCount: allResults.filter(r => r.ruleResult === "FAIL").length,
  });
});

export default router;
