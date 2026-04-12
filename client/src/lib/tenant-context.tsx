import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

const STORAGE_KEY = "zenith.selectedTenantId";

interface TenantConnection {
  id: string;
  tenantId: string;
  tenantName: string;
  domain: string;
  ownershipType: string;
  installMode: string;
  status: string;
  isDemo: boolean;
  lastSyncSiteCount?: number | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  mspAccessDenied?: boolean;
  isGrantedAccess?: boolean;
  onedriveInventoryEnabled?: boolean;
  recordingsDiscoveryEnabled?: boolean;
  teamsDiscoveryEnabled?: boolean;
  telemetryEnabled?: boolean;
  speDiscoveryEnabled?: boolean;
  contentGovernanceEnabled?: boolean;
  licensingEnabled?: boolean;
}

interface TenantContextType {
  tenants: TenantConnection[];
  selectedTenant: TenantConnection | undefined;
  setSelectedTenantId: (id: string) => void;
  selectedTenantId: string | null;
  isFeatureEnabled: (feature: "onedriveInventory" | "recordingsDiscovery" | "teamsDiscovery" | "telemetry" | "speDiscovery" | "contentGovernance" | "licensing") => boolean;
}

const FEATURE_FIELD_MAP: Record<string, keyof TenantConnection> = {
  onedriveInventory: "onedriveInventoryEnabled",
  recordingsDiscovery: "recordingsDiscoveryEnabled",
  teamsDiscovery: "teamsDiscoveryEnabled",
  telemetry: "telemetryEnabled",
  speDiscovery: "speDiscoveryEnabled",
  contentGovernance: "contentGovernanceEnabled",
  licensing: "licensingEnabled",
};

const TenantContext = createContext<TenantContextType>({
  tenants: [],
  selectedTenant: undefined,
  setSelectedTenantId: () => {},
  selectedTenantId: null,
  isFeatureEnabled: () => false,
});

function readStoredTenantId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [selectedTenantId, setSelectedTenantIdRaw] = useState<string | null>(() => readStoredTenantId());

  const setSelectedTenantId = useCallback((id: string) => {
    setSelectedTenantIdRaw(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {}
  }, []);

  const { data: tenants = [] } = useQuery<TenantConnection[]>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenants");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const storedId = selectedTenantId;
  const accessibleTenants = tenants.filter(t => !t.mspAccessDenied);
  const matchesStored = storedId ? tenants.find(t => t.id === storedId && !t.mspAccessDenied) : undefined;
  const selectedTenant = matchesStored || accessibleTenants[0];

  useEffect(() => {
    if (tenants.length > 0 && selectedTenant && selectedTenant.id !== storedId) {
      setSelectedTenantId(selectedTenant.id);
    }
  }, [tenants, selectedTenant, storedId, setSelectedTenantId]);

  const isFeatureEnabled = useCallback((feature: "onedriveInventory" | "recordingsDiscovery" | "teamsDiscovery" | "telemetry" | "speDiscovery" | "contentGovernance" | "licensing"): boolean => {
    if (!selectedTenant) return false;
    const field = FEATURE_FIELD_MAP[feature];
    return !!(selectedTenant as any)[field];
  }, [selectedTenant]);

  return (
    <TenantContext.Provider value={{ tenants, selectedTenant, setSelectedTenantId, selectedTenantId, isFeatureEnabled }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
