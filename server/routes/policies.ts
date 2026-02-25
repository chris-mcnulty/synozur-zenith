import { Router } from "express";
import { storage } from "../storage";
import { insertGovernancePolicySchema } from "@shared/schema";
import { evaluatePolicy, evaluationResultsToCopilotRules, type EvaluationContext } from "../services/policy-engine";

const router = Router();

router.get("/api/policies", async (req, res) => {
  const organizationId = req.query.organizationId as string;
  if (!organizationId) {
    return res.status(400).json({ message: "organizationId query parameter is required" });
  }
  const policies = await storage.getGovernancePolicies(organizationId);
  res.json(policies);
});

router.get("/api/policies/:id", async (req, res) => {
  const policy = await storage.getGovernancePolicy(req.params.id);
  if (!policy) return res.status(404).json({ message: "Policy not found" });
  res.json(policy);
});

router.post("/api/policies", async (req, res) => {
  const parsed = insertGovernancePolicySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
  const policy = await storage.createGovernancePolicy(parsed.data);
  res.status(201).json(policy);
});

router.patch("/api/policies/:id", async (req, res) => {
  const existing = await storage.getGovernancePolicy(req.params.id);
  if (!existing) return res.status(404).json({ message: "Policy not found" });

  const updates: Record<string, unknown> = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.description !== undefined) updates.description = req.body.description;
  if (req.body.status !== undefined) updates.status = req.body.status;
  if (req.body.rules !== undefined) updates.rules = req.body.rules;

  const updated = await storage.updateGovernancePolicy(req.params.id, updates as any);
  res.json(updated);
});

router.delete("/api/policies/:id", async (req, res) => {
  await storage.deleteGovernancePolicy(req.params.id);
  res.json({ message: "Policy deleted" });
});

router.post("/api/policies/:id/evaluate", async (req, res) => {
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

router.post("/api/admin/tenants/:id/evaluate-policies", async (req, res) => {
  try {
    const connection = await storage.getTenantConnection(req.params.id);
    if (!connection) return res.status(404).json({ message: "Tenant connection not found" });

    const orgId = connection.organizationId;
    if (!orgId) return res.status(400).json({ message: "No organization linked to this tenant" });

    const policy = await storage.getGovernancePolicyByType(orgId, "COPILOT_READINESS");
    if (!policy) return res.json({ message: "No COPILOT_READINESS policy found", evaluated: 0 });

    const metaEntries = await storage.getDataDictionary(connection.tenantId, "required_metadata_field");
    const context: EvaluationContext = { requiredMetadataFields: metaEntries.map(e => e.value) };

    const workspaces = await storage.getWorkspaces(undefined, req.params.id);
    let evaluated = 0;
    let changed = 0;

    for (const ws of workspaces) {
      const evaluation = evaluatePolicy(ws, policy, context);
      const ruleRecords = evaluationResultsToCopilotRules(ws.id, evaluation);
      await storage.setCopilotRules(ws.id, ruleRecords);
      if (ws.copilotReady !== evaluation.overallPass) {
        await storage.updateWorkspace(ws.id, { copilotReady: evaluation.overallPass });
        changed++;
      }
      evaluated++;
    }

    res.json({ evaluated, changed, policyName: policy.name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/api/workspaces/:id/policy-results", async (req, res) => {
  const workspace = await storage.getWorkspace(req.params.id);
  if (!workspace) return res.status(404).json({ message: "Workspace not found" });

  const policyType = (req.query.policyType as string) || "COPILOT_READINESS";

  const connection = workspace.tenantConnectionId
    ? await storage.getTenantConnection(workspace.tenantConnectionId)
    : null;

  if (!connection) {
    const storedRules = await storage.getCopilotRules(req.params.id);
    return res.json({ policyId: null, policyName: policyType, results: storedRules, overallPass: workspace.copilotReady });
  }

  const org = connection.organizationId ? await storage.getOrganization(connection.organizationId) : undefined;
  if (!org) {
    const storedRules = await storage.getCopilotRules(req.params.id);
    return res.json({ policyId: null, policyName: policyType, results: storedRules, overallPass: workspace.copilotReady });
  }

  const policy = await storage.getGovernancePolicyByType(org.id, policyType);
  if (!policy) {
    const storedRules = await storage.getCopilotRules(req.params.id);
    return res.json({ policyId: null, policyName: policyType, results: storedRules, overallPass: workspace.copilotReady });
  }

  const requiredMetadataEntries = await storage.getDataDictionary(connection.tenantId, "required_metadata_field");
  const context: EvaluationContext = {
    requiredMetadataFields: requiredMetadataEntries.map(e => e.value),
  };

  const evaluation = evaluatePolicy(workspace, policy, context);
  const ruleRecords = evaluationResultsToCopilotRules(req.params.id, evaluation);
  await storage.setCopilotRules(req.params.id, ruleRecords);

  const copilotReady = evaluation.overallPass;
  if (workspace.copilotReady !== copilotReady) {
    await storage.updateWorkspace(req.params.id, { copilotReady });
  }

  res.json({
    policyId: policy.id,
    policyName: policy.name,
    policyType: policy.policyType,
    results: evaluation.results,
    overallPass: copilotReady,
    passCount: evaluation.passCount,
    failCount: evaluation.failCount,
  });
});

export default router;
