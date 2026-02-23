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

  METADATA_COMPLETE: (workspace, _config) => ({
    ruleType: "METADATA_COMPLETE",
    ruleName: "Metadata Complete",
    ruleResult: workspace.metadataStatus === "COMPLETE" ? "PASS" : "FAIL",
    ruleDescription: "All required governance metadata fields must be populated.",
  }),

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

export function evaluatePolicy(workspace: Workspace, policy: GovernancePolicy): PolicyEvaluationResult {
  const ruleDefinitions = (policy.rules as PolicyRuleDefinition[]) || [];
  const results: RuleEvaluationResult[] = [];

  for (const ruleDef of ruleDefinitions) {
    if (!ruleDef.enabled) continue;

    const evaluator = BUILT_IN_EVALUATORS[ruleDef.ruleType];
    if (evaluator) {
      const result = evaluator(workspace, ruleDef.config);
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
