import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

const STORAGE_KEY = "zenith.selectedTenantId";

interface TenantConnection {
  id: string;
  tenantId: string;
  tenantName: string;
  domain: string;
  ownershipType: string;
  status: string;
  isDemo: boolean;
}

interface TenantContextType {
  tenants: TenantConnection[];
  selectedTenant: TenantConnection | undefined;
  setSelectedTenantId: (id: string) => void;
  selectedTenantId: string | null;
}

const TenantContext = createContext<TenantContextType>({
  tenants: [],
  selectedTenant: undefined,
  setSelectedTenantId: () => {},
  selectedTenantId: null,
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
  const matchesStored = storedId ? tenants.find(t => t.id === storedId) : undefined;
  const selectedTenant = matchesStored || tenants[0];

  useEffect(() => {
    if (tenants.length > 0 && selectedTenant && selectedTenant.id !== storedId) {
      setSelectedTenantId(selectedTenant.id);
    }
  }, [tenants, selectedTenant, storedId, setSelectedTenantId]);

  return (
    <TenantContext.Provider value={{ tenants, selectedTenant, setSelectedTenantId, selectedTenantId }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
