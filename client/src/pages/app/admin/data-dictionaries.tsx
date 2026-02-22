import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import type { TenantConnection } from "@shared/schema";
import { METADATA_CATEGORIES } from "@shared/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BookOpen,
  Plus,
  X,
  Loader2,
  Building2,
  MapPin,
  Briefcase,
  Hash,
  Globe,
  AlertTriangle,
} from "lucide-react";

type DataDictionaryEntry = {
  id: string;
  tenantId: string;
  category: string;
  value: string;
  createdAt: string;
};

const CATEGORY_CONFIG: Record<string, { label: string; icon: typeof Building2; description: string; placeholder: string }> = {
  department: {
    label: "Departments",
    icon: Building2,
    description: "Organizational departments that can be assigned to SharePoint sites.",
    placeholder: "e.g., Finance, Legal, Operations...",
  },
  cost_center: {
    label: "Cost Centers",
    icon: Hash,
    description: "Cost center codes for financial tracking and chargeback.",
    placeholder: "e.g., CC-4100, CC-5200...",
  },
  business_unit: {
    label: "Business Units",
    icon: Briefcase,
    description: "Business units or divisions within the organization.",
    placeholder: "e.g., North America, EMEA...",
  },
  region: {
    label: "Regions",
    icon: MapPin,
    description: "Geographic regions for data residency and compliance classification.",
    placeholder: "e.g., US-East, EU-West...",
  },
  project_code: {
    label: "Project Codes",
    icon: Globe,
    description: "Project identifiers for tracking workspace associations.",
    placeholder: "e.g., PHX-001, DEAL-2026-04...",
  },
};

export default function DataDictionariesPage() {
  const { toast } = useToast();
  const { selectedTenant } = useTenant();
  const [selectedCategory, setSelectedCategory] = useState<string>("department");
  const [newValue, setNewValue] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");

  const { data: connections = [] } = useQuery<TenantConnection[]>({
    queryKey: ["/api/admin/tenants"],
  });

  const activeTenantId = selectedTenantId || selectedTenant?.id || connections[0]?.id || "";

  const { data: entries = [], isLoading } = useQuery<DataDictionaryEntry[]>({
    queryKey: ["/api/admin/tenants", activeTenantId, "data-dictionaries", selectedCategory],
    queryFn: () =>
      fetch(`/api/admin/tenants/${activeTenantId}/data-dictionaries?category=${selectedCategory}`)
        .then(r => r.json()),
    enabled: !!activeTenantId,
  });

  const { data: allEntries = [] } = useQuery<DataDictionaryEntry[]>({
    queryKey: ["/api/admin/tenants", activeTenantId, "data-dictionaries"],
    queryFn: () =>
      fetch(`/api/admin/tenants/${activeTenantId}/data-dictionaries`).then(r => r.json()),
    enabled: !!activeTenantId,
  });

  const addMutation = useMutation({
    mutationFn: async ({ category, value }: { category: string; value: string }) => {
      await apiRequest("POST", `/api/admin/tenants/${activeTenantId}/data-dictionaries`, { category, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", activeTenantId, "data-dictionaries"] });
      setNewValue("");
      toast({ title: "Value Added", description: "The dictionary entry has been created." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (entryId: string) => {
      await apiRequest("DELETE", `/api/admin/tenants/${activeTenantId}/data-dictionaries/${entryId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", activeTenantId, "data-dictionaries"] });
      toast({ title: "Value Removed", description: "The dictionary entry has been deleted." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const activeTenant = connections.find(c => c.id === activeTenantId);
  const config = CATEGORY_CONFIG[selectedCategory] || CATEGORY_CONFIG.department;
  const Icon = config.icon;

  const categoryCounts = METADATA_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = allEntries.filter(e => e.category === cat).length;
    return acc;
  }, {} as Record<string, number>);

  const totalEntries = allEntries.length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Data Dictionaries</h1>
          <p className="text-muted-foreground mt-1">
            Define allowed values for site metadata fields. These are shared across all organizations connected to the same tenant.
          </p>
        </div>
        {connections.length > 1 && (
          <Select value={activeTenantId} onValueChange={setSelectedTenantId}>
            <SelectTrigger className="w-[260px]" data-testid="select-tenant">
              <SelectValue placeholder="Select tenant..." />
            </SelectTrigger>
            <SelectContent>
              {connections.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.tenantName} ({c.domain})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!activeTenantId ? (
        <Card className="glass-panel border-border/50">
          <CardContent className="flex flex-col items-center justify-center h-48 gap-3 text-center p-6">
            <AlertTriangle className="w-12 h-12 text-muted-foreground/30" />
            <div>
              <p className="font-medium text-foreground">No tenant connected</p>
              <p className="text-sm text-muted-foreground mt-1">Connect a Microsoft 365 tenant first to manage data dictionaries.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {METADATA_CATEGORIES.map(cat => {
              const catConfig = CATEGORY_CONFIG[cat];
              const CatIcon = catConfig.icon;
              const count = categoryCounts[cat] || 0;
              const isActive = selectedCategory === cat;
              return (
                <Card
                  key={cat}
                  className={`cursor-pointer transition-all hover:shadow-md ${isActive ? 'border-primary/50 bg-primary/5 shadow-md shadow-primary/10' : 'glass-panel border-border/50 hover:border-border'}`}
                  onClick={() => setSelectedCategory(cat)}
                  data-testid={`card-category-${cat}`}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                    <CatIcon className={`w-5 h-5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                    <div>
                      <p className={`text-sm font-medium ${isActive ? 'text-primary' : ''}`}>{catConfig.label}</p>
                      <p className="text-2xl font-bold mt-0.5" data-testid={`text-count-${cat}`}>{count}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Icon className="w-5 h-5 text-primary" />
                    {config.label}
                    {activeTenant && (
                      <Badge variant="outline" className="text-[10px] ml-2 text-muted-foreground">{activeTenant.tenantName}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="mt-1">{config.description}</CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs">{entries.length} values</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex gap-2 mb-6">
                <Input
                  placeholder={config.placeholder}
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newValue.trim()) {
                      addMutation.mutate({ category: selectedCategory, value: newValue.trim() });
                    }
                  }}
                  className="flex-1"
                  data-testid="input-new-value"
                />
                <Button
                  onClick={() => {
                    if (newValue.trim()) {
                      addMutation.mutate({ category: selectedCategory, value: newValue.trim() });
                    }
                  }}
                  disabled={!newValue.trim() || addMutation.isPending}
                  className="gap-2"
                  data-testid="button-add-value"
                >
                  {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </Button>
              </div>

              <div className="rounded-lg border border-border/50 bg-muted/10 p-4 min-h-[120px]">
                {isLoading ? (
                  <div className="flex items-center justify-center h-20">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : entries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-20 text-center">
                    <Icon className="w-8 h-8 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground" data-testid="text-no-entries">
                      No {config.label.toLowerCase()} defined yet. Add your first value above.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2" data-testid="list-entries">
                    {entries.map((entry) => (
                      <Badge
                        key={entry.id}
                        variant="secondary"
                        className="gap-1.5 pl-3 pr-1.5 py-1.5 text-sm bg-background/80 border border-border/50"
                        data-testid={`badge-entry-${entry.id}`}
                      >
                        {entry.value}
                        <button
                          onClick={() => deleteMutation.mutate(entry.id)}
                          className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                          data-testid={`button-delete-entry-${entry.id}`}
                        >
                          <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
