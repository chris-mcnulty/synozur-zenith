import { useQuery } from "@tanstack/react-query";
import type { Organization } from "@shared/schema";
import { PLAN_FEATURES, type ServicePlanTier } from "@shared/schema";

interface OrgWithFeatures extends Organization {
  features: typeof PLAN_FEATURES[ServicePlanTier];
}

export function useServicePlan() {
  const { data: org, isLoading } = useQuery<OrgWithFeatures>({
    queryKey: ["/api/organization"],
  });

  const plan = (org?.servicePlan || "TRIAL") as ServicePlanTier;
  const features = org?.features || PLAN_FEATURES.TRIAL;

  return {
    org,
    plan,
    features,
    isLoading,
    isTrial: plan === "TRIAL",
    isFeatureEnabled: (feature: keyof typeof PLAN_FEATURES.TRIAL) => !!features[feature],
    canWriteBack: !!features.m365WriteBack,
    maxSites: features.maxSites,
    maxUsers: features.maxUsers,
    maxTenants: features.maxTenants,
  };
}
