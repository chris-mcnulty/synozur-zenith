import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  BrainCircuit,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Save,
  AlertTriangle,
  Zap,
  Brain,
  Upload,
  FileText,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  File,
  Plus,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AI_PROVIDERS,
  AI_FEATURES,
  AI_FEATURE_LABELS,
  AI_PROVIDER_LABELS,
  AI_MODELS,
  type AIProvider,
  type AIFeature,
} from "@shared/ai-schema";

// ── Provider foundation helpers ───────────────────────────────────────────────

const PROVIDER_OPTIONS = Object.entries(AI_PROVIDER_LABELS).map(([value, label]) => ({ value, label }));
const MODEL_OPTIONS = Object.values(AI_MODELS);

function ProviderStatusBadge({ available }: { available: boolean }) {
  if (available) {
    return (
      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1.5">
        <CheckCircle2 className="w-3 h-3" /> Connected
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-500/10 text-red-500 border-red-500/20 gap-1.5">
      <XCircle className="w-3 h-3" /> Not configured
    </Badge>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

// ── Grounding doc helpers ─────────────────────────────────────────────────────

type GroundingDoc = {
  id: string;
  scope: string;
  orgId: string | null;
  name: string;
  description: string | null;
  contentText: string;
  fileType: string;
  fileSizeBytes: number;
  isActive: boolean;
  uploadedBy: string | null;
  createdAt: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function GroundingDocCard({
  doc,
  onDelete,
  onToggle,
}: {
  doc: GroundingDoc;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
}) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <Card className="glass-panel border-border/50" data-testid={`card-grounding-doc-${doc.id}`}>
      <CardContent className="pt-4 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <FileText className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm truncate" data-testid={`text-doc-name-${doc.id}`}>
                  {doc.name}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {doc.fileType.toUpperCase()}
                </Badge>
                <Badge
                  data-testid={`badge-doc-status-${doc.id}`}
                  variant={doc.isActive ? "default" : "secondary"}
                  className={doc.isActive ? "text-[10px] bg-green-500/10 text-green-500 border-green-500/20" : "text-[10px]"}
                >
                  {doc.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              {doc.description && (
                <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {formatBytes(doc.fileSizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}
              </p>
              {showPreview && (
                <div
                  className="mt-3 p-3 rounded bg-muted/30 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto border border-border/40"
                  data-testid={`text-doc-preview-${doc.id}`}
                >
                  {doc.contentText.slice(0, 500)}
                  {doc.contentText.length > 500 && "\n\n… (truncated)"}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              data-testid={`switch-doc-active-${doc.id}`}
              checked={doc.isActive}
              onCheckedChange={(checked) => onToggle(doc.id, checked)}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowPreview(v => !v)}
              data-testid={`button-preview-doc-${doc.id}`}
              title={showPreview ? "Hide preview" : "Show preview"}
            >
              {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/10"
              onClick={() => onDelete(doc.id)}
              data-testid={`button-delete-doc-${doc.id}`}
              title="Delete document"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UploadDialog({
  endpoint,
  docLimit,
  currentCount,
  onSuccess,
}: {
  endpoint: string;
  docLimit: number;
  currentCount: number;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", file);
      if (name) formData.append("name", name);
      if (description) formData.append("description", description);

      const res = await fetch(endpoint, { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document uploaded", description: "Grounding document has been added." });
      setOpen(false);
      setFile(null);
      setName("");
      setDescription("");
      onSuccess();
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      setFile(droppedFile);
      if (!name) setName(droppedFile.name.replace(/\.[^.]+$/, ""));
    }
  }, [name]);

  const atLimit = currentCount >= docLimit;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gap-2"
          disabled={atLimit}
          data-testid="button-upload-grounding-doc"
        >
          <Plus className="w-4 h-4" />
          Upload Document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Grounding Document</DialogTitle>
          <DialogDescription>
            Upload a PDF, DOCX, TXT, or Markdown file. Max 500 KB per file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border/60 hover:border-primary/50 hover:bg-muted/30"
            }`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-grounding-doc"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              data-testid="input-file-grounding"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  if (!name) setName(f.name.replace(/\.[^.]+$/, ""));
                }
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <File className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">{file.name}</span>
                <span className="text-xs text-muted-foreground">({formatBytes(file.size)})</span>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drag & drop or click to select a file
                </p>
                <p className="text-xs text-muted-foreground mt-1">PDF, DOCX, TXT, MD · Max 500 KB</p>
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-name">Document Name</Label>
            <Input
              id="doc-name"
              data-testid="input-doc-name"
              placeholder="e.g., M365 Governance Standards"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-description">Description (optional)</Label>
            <Textarea
              id="doc-description"
              data-testid="input-doc-description"
              placeholder="Brief description of what this document contains…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            data-testid="button-cancel-upload"
          >
            Cancel
          </Button>
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={!file || uploadMutation.isPending}
            data-testid="button-confirm-upload"
            className="gap-2"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroundingContextPreview({ previewUrl }: { previewUrl: string }) {
  const [show, setShow] = useState(false);
  const preview = useQuery<{ context: string; charCount: number }>({
    queryKey: [previewUrl],
    queryFn: async () => {
      const res = await fetch(previewUrl);
      if (!res.ok) throw new Error("Failed to load preview");
      return res.json();
    },
    enabled: show,
  });

  return (
    <Card className="glass-panel border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Grounding Context Preview</CardTitle>
            <CardDescription>
              Preview exactly what the AI model sees as its system grounding context.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShow(v => !v)}
            data-testid="button-toggle-preview"
          >
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {show ? "Hide" : "Show"} Preview
          </Button>
        </div>
      </CardHeader>
      {show && (
        <CardContent>
          {preview.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : preview.error ? (
            <p className="text-sm text-destructive">Failed to load preview</p>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" data-testid="badge-preview-chars">
                  {preview.data?.charCount?.toLocaleString() ?? 0} characters
                </Badge>
                {(preview.data?.charCount ?? 0) === 0 && (
                  <span className="text-xs text-muted-foreground">No active documents yet.</span>
                )}
              </div>
              {(preview.data?.context?.length ?? 0) > 0 && (
                <div
                  className="p-4 rounded-lg bg-muted/30 border border-border/40 text-xs font-mono whitespace-pre-wrap max-h-96 overflow-y-auto"
                  data-testid="text-grounding-preview"
                >
                  {preview.data?.context}
                </div>
              )}
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AISettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Provider foundation state
  const [alertEmail, setAlertEmail] = useState("");
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [alertThreshold, setAlertThreshold] = useState("80");
  const [defaultProvider, setDefaultProvider] = useState<AIProvider>(AI_PROVIDERS.AZURE_FOUNDRY);

  const { data: providerStatuses, refetch: refetchStatus } = useQuery<Array<{ name: AIProvider; available: boolean; label: string }>>({
    queryKey: ["/api/admin/ai/provider-status"],
    queryFn: async () => {
      const r = await fetch("/api/admin/ai/provider-status", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch provider status");
      return r.json();
    },
  });

  const { data: featureAssignments, refetch: refetchFeatures } = useQuery<Record<AIFeature, { provider: AIProvider; model: string; isActive: boolean }>>({
    queryKey: ["/api/admin/ai/features"],
    queryFn: async () => {
      const r = await fetch("/api/admin/ai/features", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch feature assignments");
      return r.json();
    },
  });

  const { data: configuration } = useQuery<{
    defaultProvider: AIProvider;
    monthlyTokenBudget: number | null;
    alertThresholdPercent: number;
    alertEmail: string | null;
  }>({
    queryKey: ["/api/admin/ai/configuration"],
    queryFn: async () => {
      const r = await fetch("/api/admin/ai/configuration", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch configuration");
      return r.json();
    },
  });

  const { data: usageData } = useQuery<{
    rows: Array<{
      id: string;
      orgId: string | null;
      feature: string;
      provider: string;
      model: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
      durationMs: number;
      success: boolean;
      errorMessage: string | null;
      createdAt: string;
    }>;
    monthly: {
      totalInputTokens: number;
      totalOutputTokens: number;
      totalCostUsd: number;
      callCount: number;
    };
  }>({
    queryKey: ["/api/admin/ai/usage"],
    queryFn: async () => {
      const r = await fetch("/api/admin/ai/usage?limit=50", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch usage");
      return r.json();
    },
  });

  useEffect(() => {
    if (configuration) {
      setDefaultProvider(configuration.defaultProvider);
      setMonthlyBudget(configuration.monthlyTokenBudget ? String(configuration.monthlyTokenBudget) : "");
      setAlertThreshold(String(configuration.alertThresholdPercent));
      setAlertEmail(configuration.alertEmail ?? "");
    }
  }, [configuration]);

  const saveConfigMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/admin/ai/configuration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          defaultProvider,
          monthlyTokenBudget: monthlyBudget ? parseInt(monthlyBudget, 10) : null,
          alertThresholdPercent: parseInt(alertThreshold, 10),
          alertEmail: alertEmail || null,
        }),
      });
      if (!r.ok) throw new Error("Failed to save configuration");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Configuration saved", description: "AI provider settings have been updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/configuration"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const saveFeatureMutation = useMutation({
    mutationFn: async ({ feature, provider, model }: { feature: string; provider: string; model: string }) => {
      const r = await fetch("/api/admin/ai/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ feature, provider, model }),
      });
      if (!r.ok) throw new Error("Failed to save feature assignment");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Feature assignment saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/features"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Grounding documents state
  const groundingDocs = useQuery<GroundingDoc[]>({
    queryKey: ["/api/admin/ai/grounding"],
    queryFn: async () => {
      const res = await fetch("/api/admin/ai/grounding", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/ai/grounding/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed to delete document");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/grounding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/grounding/preview"] });
      toast({ title: "Document deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleDocMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/admin/ai/grounding/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to update document");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/grounding"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/grounding/preview"] });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const monthly = usageData?.monthly;
  const usageRows = usageData?.rows ?? [];
  const docList = groundingDocs.data ?? [];
  const activeDocCount = docList.filter(d => d.isActive).length;
  const DOC_LIMIT = 10;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3" data-testid="text-page-title">
            <BrainCircuit className="w-8 h-8 text-primary" />
            AI Settings
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Configure AI providers, feature model assignments, monitor token usage, set budget alerts, and manage grounding documents.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetchStatus(); refetchFeatures(); }} className="gap-2" data-testid="button-refresh-ai-settings">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="glass-panel" data-testid="tabs-ai-settings">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="features" data-testid="tab-features">Feature Assignments</TabsTrigger>
          <TabsTrigger value="usage" data-testid="tab-usage">Usage</TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">Alerts & Budget</TabsTrigger>
          <TabsTrigger value="grounding" data-testid="tab-grounding-docs">Grounding Documents</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(providerStatuses ?? []).map(ps => (
              <Card key={ps.name} className="glass-panel" data-testid={`card-provider-${ps.name}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">{ps.label}</CardTitle>
                    <ProviderStatusBadge available={ps.available} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {ps.name === AI_PROVIDERS.AZURE_FOUNDRY && "Uses AZURE_FOUNDRY_API_KEY + AZURE_FOUNDRY_OPENAI_ENDPOINT"}
                    {ps.name === AI_PROVIDERS.REPLIT_OPENAI && "Uses OPENAI_API_KEY (Replit-managed)"}
                    {ps.name === AI_PROVIDERS.REPLIT_ANTHROPIC && "Uses ANTHROPIC_API_KEY (Replit-managed)"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-base">Default Provider</CardTitle>
              <CardDescription>Select the fallback provider when no per-feature assignment is set.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="default-provider">Default AI Provider</Label>
                <Select value={defaultProvider} onValueChange={v => setDefaultProvider(v as AIProvider)}>
                  <SelectTrigger id="default-provider" className="w-64" data-testid="select-default-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => saveConfigMutation.mutate()} disabled={saveConfigMutation.isPending} data-testid="button-save-config">
                <Save className="w-4 h-4 mr-2" />
                Save Configuration
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feature Assignments Tab */}
        <TabsContent value="features" className="mt-4">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-base">Per-Feature Provider & Model</CardTitle>
              <CardDescription>Each AI feature can be independently routed to a different provider and model.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border/50 bg-muted/20">
                    <TableHead className="pl-6">Feature</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="pr-6 w-24">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.values(AI_FEATURES).map(feature => {
                    const current = featureAssignments?.[feature];

                    return (
                      <TableRow key={feature} className="border-b border-border/30" data-testid={`row-feature-${feature}`}>
                        <TableCell className="pl-6 font-medium">{AI_FEATURE_LABELS[feature]}</TableCell>
                        <TableCell>
                          <Select
                            value={current?.provider ?? AI_PROVIDERS.AZURE_FOUNDRY}
                            onValueChange={v => {
                              saveFeatureMutation.mutate({ feature, provider: v, model: current?.model ?? "gpt-4o" });
                            }}
                          >
                            <SelectTrigger className="w-44" data-testid={`select-provider-${feature}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROVIDER_OPTIONS.map(o => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={current?.model ?? "gpt-4o"}
                            onValueChange={v => {
                              saveFeatureMutation.mutate({ feature, provider: current?.provider ?? AI_PROVIDERS.AZURE_FOUNDRY, model: v });
                            }}
                          >
                            <SelectTrigger className="w-56" data-testid={`select-model-${feature}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {MODEL_OPTIONS.map(m => (
                                <SelectItem key={m} value={m}>{m}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="pr-6">
                          <Badge variant="outline" className="text-xs text-emerald-500 border-emerald-500/30">
                            Active
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Usage Tab */}
        <TabsContent value="usage" className="space-y-4 mt-4">
          {monthly && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="glass-panel" data-testid="card-monthly-calls">
                <CardHeader className="pb-1">
                  <CardDescription className="text-xs">Monthly Calls</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold" data-testid="text-monthly-calls">{formatNumber(monthly.callCount)}</p>
                </CardContent>
              </Card>
              <Card className="glass-panel" data-testid="card-input-tokens">
                <CardHeader className="pb-1">
                  <CardDescription className="text-xs">Input Tokens</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold" data-testid="text-input-tokens">{formatNumber(monthly.totalInputTokens)}</p>
                </CardContent>
              </Card>
              <Card className="glass-panel" data-testid="card-output-tokens">
                <CardHeader className="pb-1">
                  <CardDescription className="text-xs">Output Tokens</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold" data-testid="text-output-tokens">{formatNumber(monthly.totalOutputTokens)}</p>
                </CardContent>
              </Card>
              <Card className="glass-panel" data-testid="card-estimated-cost">
                <CardHeader className="pb-1">
                  <CardDescription className="text-xs">Estimated Cost (MTD)</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold" data-testid="text-estimated-cost">{formatCost(monthly.totalCostUsd)}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Azure Foundry: $0.00 (org subscription)</p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                Recent AI Calls
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-border/50 bg-muted/20">
                      <TableHead className="pl-6">Timestamp</TableHead>
                      <TableHead>Feature</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Tokens In</TableHead>
                      <TableHead>Tokens Out</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead className="pr-6">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-10 pl-6">
                          No AI usage recorded yet.
                        </TableCell>
                      </TableRow>
                    ) : usageRows.map(row => (
                      <TableRow key={row.id} className="border-b border-border/30" data-testid={`row-usage-${row.id}`}>
                        <TableCell className="pl-6 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">{AI_FEATURE_LABELS[row.feature as AIFeature] ?? row.feature}</TableCell>
                        <TableCell className="text-sm">{AI_PROVIDER_LABELS[row.provider as AIProvider] ?? row.provider}</TableCell>
                        <TableCell className="text-sm font-mono text-muted-foreground">{row.model}</TableCell>
                        <TableCell className="text-sm">{formatNumber(row.inputTokens)}</TableCell>
                        <TableCell className="text-sm">{formatNumber(row.outputTokens)}</TableCell>
                        <TableCell className="text-sm">{formatCost(row.estimatedCostUsd)}</TableCell>
                        <TableCell className="pr-6">
                          {row.success
                            ? <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">OK</Badge>
                            : <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Error</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Alerts & Budget Tab */}
        <TabsContent value="alerts" className="mt-4">
          <Card className="glass-panel">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Monthly Token Budget & Alert Thresholds
              </CardTitle>
              <CardDescription>
                Set a monthly token budget and receive alerts when usage approaches the limit.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-1.5">
                  <Label htmlFor="monthly-budget">Monthly Token Budget</Label>
                  <Input
                    id="monthly-budget"
                    type="number"
                    placeholder="e.g. 1000000"
                    value={monthlyBudget}
                    onChange={e => setMonthlyBudget(e.target.value)}
                    data-testid="input-monthly-budget"
                  />
                  <p className="text-xs text-muted-foreground">Leave blank for unlimited</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="alert-threshold">Alert Threshold (%)</Label>
                  <Input
                    id="alert-threshold"
                    type="number"
                    min="1"
                    max="100"
                    placeholder="80"
                    value={alertThreshold}
                    onChange={e => setAlertThreshold(e.target.value)}
                    data-testid="input-alert-threshold"
                  />
                  <p className="text-xs text-muted-foreground">Alert when usage reaches this % of budget</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="alert-email">Alert Email</Label>
                  <Input
                    id="alert-email"
                    type="email"
                    placeholder="admin@example.com"
                    value={alertEmail}
                    onChange={e => setAlertEmail(e.target.value)}
                    data-testid="input-alert-email"
                  />
                  <p className="text-xs text-muted-foreground">Notification recipient for budget alerts</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={() => saveConfigMutation.mutate()}
                  disabled={saveConfigMutation.isPending}
                  data-testid="button-save-budget"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Save Budget Settings
                </Button>
                {configuration?.monthlyTokenBudget && (
                  <p className="text-sm text-muted-foreground">
                    Current budget: {formatNumber(configuration.monthlyTokenBudget)} tokens/month at {configuration.alertThresholdPercent}% alert threshold
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Grounding Documents Tab */}
        <TabsContent value="grounding" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="glass-panel border-border/50">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-doc-count">{docList.length}</p>
                    <p className="text-xs text-muted-foreground">Total Documents</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel border-border/50">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold" data-testid="text-active-count">{activeDocCount}</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel border-border/50">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{DOC_LIMIT - docList.length}</p>
                    <p className="text-xs text-muted-foreground">Slots Remaining</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-panel border-border/50">
            <CardHeader className="border-b border-border/40 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-primary" />
                    System Grounding Documents
                  </CardTitle>
                  <CardDescription>
                    Platform-wide knowledge injected into every AI feature call. Visible to all organizations.
                    Max {DOC_LIMIT} documents · 500 KB per file.
                  </CardDescription>
                </div>
                <UploadDialog
                  endpoint="/api/admin/ai/grounding"
                  docLimit={DOC_LIMIT}
                  currentCount={docList.length}
                  onSuccess={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/grounding"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/admin/ai/grounding/preview"] });
                  }}
                />
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {groundingDocs.isLoading ? (
                <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" /> Loading documents…
                </div>
              ) : docList.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground" data-testid="text-no-docs">
                  <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No grounding documents yet.</p>
                  <p className="text-xs mt-1">Upload a PDF, DOCX, TXT, or Markdown file to get started.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {docList.map(doc => (
                    <GroundingDocCard
                      key={doc.id}
                      doc={doc}
                      onDelete={id => deleteDocMutation.mutate(id)}
                      onToggle={(id, isActive) => toggleDocMutation.mutate({ id, isActive })}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <GroundingContextPreview previewUrl="/api/admin/ai/grounding/preview" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Named export alias for compatibility with App.tsx imports
export { AISettingsPage as AiSettingsPage };
