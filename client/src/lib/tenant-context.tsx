import { createContext, useContext, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

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

export function TenantProvider({ children }: { children: ReactNode }) {
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const { data: tenants = [] } = useQuery<TenantConnection[]>({
    queryKey: ["/api/admin/tenants"],
    queryFn: async () => {
      const res = await fetch("/api/admin/tenants");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const selectedTenant = tenants.find(t => t.id === selectedTenantId) || tenants[0];

  return (
    <TenantContext.Provider value={{ tenants, selectedTenant, setSelectedTenantId, selectedTenantId }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
