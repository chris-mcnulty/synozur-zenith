import type { Workspace, GovernancePolicy, PolicyRuleDefinition, InsertCopilotRule } from "@shared/schema";

export interface RuleEvaluationResult {
  ruleType: string;
  ruleName: string;
  ruleResult: "PASS" | "FAIL";
  ruleDescription: string;
}

export interface PolicyEvaluationResult {
  policyId: string;
  policyName: string;
  policyType: string;
  results: RuleEvaluationResult[];
  overallPass: boolean;
  passCount: number;
  failCount: number;
}

const BUILT_IN_EVALUATORS: Record<string, (workspace: Workspace, config?: Record<string, unknown>) => RuleEvaluationResult> = {
  SENSITIVITY_LABEL_REQUIRED: (workspace, _config) => ({
    ruleType: "SENSITIVITY_LABEL_REQUIRED",
    ruleName: "Sensitivity Label",
    ruleResult: workspace.sensitivityLabelId ? "PASS" : "FAIL",
    ruleDescription: "Workspace must have a Purview sensitivity label applied.",
  }),

  DEPARTMENT_REQUIRED: (workspace, _config) => ({
    ruleType: "DEPARTMENT_REQUIRED",
    ruleName: "Department Assigned",
    ruleResult: workspace.department ? "PASS" : "FAIL",
    ruleDescription: "Workspace must have a department assigned.",
  }),

  DUAL_OWNERSHIP: (workspace, _config) => ({
    ruleType: "DUAL_OWNERSHIP",
    ruleName: "Dual Ownership",
    ruleResult: workspace.owners >= 2 ? "PASS" : "FAIL",
    ruleDescription: "Workspace must have at least two active owners.",
  }),

  METADATA_COMPLETE: (workspace, config) => {
    const requiredFields = (config?.requiredFields as string[]) || [];

    if (requiredFields.length === 0) {
      return {
        ruleType: "METADATA_COMPLETE",
        ruleName: "Metadata Complete",
        ruleResult: workspace.metadataStatus === "COMPLETE" ? "PASS" : "FAIL",
        ruleDescription: "All required governance metadata fields must be populated.",
      };
    }

    const fieldAccessors: Record<string, (w: Workspace) => unknown> = {
      department: (w) => w.department,
      costCenter: (w) => w.costCenter,
      projectCode: (w) => w.projectCode,
      description: (w) => w.description,
      sensitivityLabelId: (w) => w.sensitivityLabelId,
      primarySteward: (w) => w.primarySteward,
      secondarySteward: (w) => w.secondarySteward,
    };

    const missingFields: string[] = [];
    for (const field of requiredFields) {
      const accessor = fieldAccessors[field];
      if (accessor) {
        const value = accessor(workspace);
        if (!value || (typeof value === "string" && value.trim() === "")) {
          missingFields.push(field);
        }
      }
    }

    const pass = missingFields.length === 0;
    const desc = pass
      ? "All required governance metadata fields are populated."
      : `Missing required fields: ${missingFields.join(", ")}`;

    return {
      ruleType: "METADATA_COMPLETE",
      ruleName: "Metadata Complete",
      ruleResult: pass ? "PASS" : "FAIL",
      ruleDescription: desc,
    };
  },

  SHARING_POLICY: (workspace, _config) => ({
    ruleType: "SHARING_POLICY",
    ruleName: "Sharing Policy",
    ruleResult: (!workspace.externalSharing || workspace.sensitivity !== "HIGHLY_CONFIDENTIAL") ? "PASS" : "FAIL",
    ruleDescription: "External sharing policy must align with sensitivity classification.",
  }),

  PROPERTY_BAG_CHECK: (workspace, config) => {
    const key = config?.key as string || "";
    const operator = config?.operator as string || "EQUALS";
    const expectedValue = config?.value as string || "";
    const label = config?.label as string || `Property: ${key}`;

    const propertyBag = (workspace as any).propertyBag as Record<string, string> | undefined;
    const actualValue = propertyBag?.[key];

    let pass = false;
    if (operator === "EQUALS") {
      pass = actualValue === expectedValue;
    } else if (operator === "NOT_EQUALS") {
      pass = actualValue !== expectedValue;
    } else if (operator === "EXISTS") {
      pass = actualValue !== undefined && actualValue !== null && actualValue !== "";
    } else if (operator === "NOT_EXISTS") {
      pass = !actualValue;
    } else if (operator === "CONTAINS") {
      pass = actualValue?.includes(expectedValue) ?? false;
    }

    return {
      ruleType: "PROPERTY_BAG_CHECK",
      ruleName: label,
      ruleResult: pass ? "PASS" : "FAIL",
      ruleDescription: `Property bag key "${key}" must ${operator.toLowerCase().replace("_", " ")} "${expectedValue}".`,
    };
  },

  ATTESTATION: (workspace, config) => {
    return {
      ruleType: "ATTESTATION",
      ruleName: "Attestation Current",
      ruleResult: "FAIL",
      ruleDescription: "Workspace attestation must be current. (Coming soon)",
    };
  },
};

export interface EvaluationContext {
  requiredMetadataFields?: string[];
}

export function evaluatePolicy(workspace: Workspace, policy: GovernancePolicy, context?: EvaluationContext): PolicyEvaluationResult {
  const ruleDefinitions = (policy.rules as PolicyRuleDefinition[]) || [];
  const results: RuleEvaluationResult[] = [];

  for (const ruleDef of ruleDefinitions) {
    if (!ruleDef.enabled) continue;

    const evaluator = BUILT_IN_EVALUATORS[ruleDef.ruleType];
    if (evaluator) {
      let config = ruleDef.config || {};
      if (ruleDef.ruleType === "METADATA_COMPLETE" && context?.requiredMetadataFields) {
        config = { ...config, requiredFields: context.requiredMetadataFields };
      }
      const result = evaluator(workspace, config);
      results.push({
        ...result,
        ruleName: ruleDef.label || result.ruleName,
        ruleDescription: ruleDef.description || result.ruleDescription,
      });
    }
  }

  const passCount = results.filter(r => r.ruleResult === "PASS").length;
  const failCount = results.filter(r => r.ruleResult === "FAIL").length;

  return {
    policyId: policy.id,
    policyName: policy.name,
    policyType: policy.policyType,
    results,
    overallPass: failCount === 0 && results.length > 0,
    passCount,
    failCount,
  };
}

export function evaluationResultsToCopilotRules(
  workspaceId: string,
  evaluation: PolicyEvaluationResult
): InsertCopilotRule[] {
  return evaluation.results.map(r => ({
    workspaceId,
    policyId: evaluation.policyId,
    ruleType: r.ruleType,
    ruleName: r.ruleName,
    ruleResult: r.ruleResult,
    ruleDescription: r.ruleDescription,
  }));
}

export function formatPolicyBagValue(
  evaluation: PolicyEvaluationResult,
  format: string | null | undefined
): string {
  const fmt = format || "PASS_FAIL";
  switch (fmt) {
    case "READY_NOTREADY":
      return evaluation.overallPass ? "Ready" : "Not Ready";
    case "SCORE_DATE": {
      const date = new Date().toISOString().split("T")[0];
      return `${evaluation.overallPass ? "PASS" : "FAIL"}|${evaluation.passCount}/${evaluation.passCount + evaluation.failCount}|${date}`;
    }
    case "PASS_FAIL":
    default:
      return evaluation.overallPass ? "PASS" : "FAIL";
  }
}

export const DEFAULT_COPILOT_READINESS_RULES: PolicyRuleDefinition[] = [
  {
    ruleType: "SENSITIVITY_LABEL_REQUIRED",
    label: "Sensitivity Label",
    description: "Workspace must have a Purview sensitivity label applied.",
    enabled: true,
  },
  {
    ruleType: "DEPARTMENT_REQUIRED",
    label: "Department Assigned",
    description: "Workspace must have a department assigned.",
    enabled: true,
  },
  {
    ruleType: "DUAL_OWNERSHIP",
    label: "Dual Ownership",
    description: "Workspace must have at least two active owners.",
    enabled: true,
  },
  {
    ruleType: "METADATA_COMPLETE",
    label: "Metadata Complete",
    description: "All required governance metadata fields must be populated.",
    enabled: true,
  },
  {
    ruleType: "SHARING_POLICY",
    label: "Sharing Policy",
    description: "External sharing policy must align with sensitivity classification.",
    enabled: true,
  },
];
