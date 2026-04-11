import { PLAN_FEATURES, type ServicePlanTier } from "@shared/schema";
import { storage } from "../storage";
import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/rbac";

export function getPlanFeatures(plan: ServicePlanTier) {
  return PLAN_FEATURES[plan] || PLAN_FEATURES.TRIAL;
}

export function isFeatureEnabled(plan: ServicePlanTier, feature: keyof typeof PLAN_FEATURES.TRIAL): boolean {
  const features = getPlanFeatures(plan);
  return !!features[feature];
}

export function requireFeature(feature: keyof typeof PLAN_FEATURES.TRIAL) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const orgId = req.activeOrganizationId || req.user?.organizationId || undefined;
    const org = await storage.getOrganization(orgId);
    const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
    const features = getPlanFeatures(plan);

    if (!features[feature]) {
      const featureLabels: Record<string, string> = {
        m365WriteBack: "Microsoft 365 write-back",
        copilotReadiness: "Copilot readiness analysis",
        lifecycleAutomation: "lifecycle automation",
        selfServicePortal: "self-service portal",
        advancedReporting: "advanced reporting",
        dataMasking: "database masking",
        mspAccess: "MSP access code management",
        csvExport: "CSV export",
        emailContentStorageReport: "Email Content Storage Report",
        iaAssessment: "IA Assessment",
      };
      const label = featureLabels[feature] || feature;
      return res.status(403).json({
        error: "FEATURE_GATED",
        message: `${label} is not available on the ${features.label} plan. Please upgrade to access this feature.`,
        currentPlan: plan,
        requiredFeature: feature,
      });
    }
    next();
  };
}
