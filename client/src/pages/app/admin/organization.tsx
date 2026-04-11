import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Building2, 
  Save, 
  ShieldCheck, 
  Globe, 
  CreditCard,
  X,
  Plus,
  Loader2,
  UserPlus,
  Lock,
  AlertTriangle,
  Trash2,
  Brain,
  FileText,
  Upload,
  File,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";
import { useLocation } from "wouter";
import { useServicePlan } from "@/hooks/use-service-plan";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

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

function OrgGroundingDocCard({
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
    <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border/40 bg-muted/20" data-testid={`card-org-grounding-doc-${doc.id}`}>
      <div className="flex items-start gap-2 min-w-0 flex-1">
        <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate" data-testid={`text-org-doc-name-${doc.id}`}>{doc.name}</span>
            <Badge variant="outline" className="text-[10px]">{doc.fileType.toUpperCase()}</Badge>
            <Badge
              variant={doc.isActive ? "default" : "secondary"}
              className={doc.isActive ? "text-[10px] bg-green-500/10 text-green-500 border-green-500/20" : "text-[10px]"}
            >
              {doc.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          {doc.description && <p className="text-xs text-muted-foreground mt-0.5">{doc.description}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(doc.fileSizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}</p>
          {showPreview && (
            <div className="mt-2 p-2 rounded bg-muted/40 text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto border border-border/40">
              {doc.contentText.slice(0, 500)}{doc.contentText.length > 500 && "\n…"}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Switch
          checked={doc.isActive}
          onCheckedChange={v => onToggle(doc.id, v)}
          data-testid={`switch-org-doc-active-${doc.id}`}
        />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPreview(v => !v)} title="Preview">
          {showPreview ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(doc.id)}
          data-testid={`button-delete-org-doc-${doc.id}`}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function OrgGroundingUploadDialog({
  orgId,
  currentCount,
  onSuccess,
}: {
  orgId: string;
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
  const ORG_DOC_LIMIT = 20;
  const atLimit = currentCount >= ORG_DOC_LIMIT;

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      const formData = new FormData();
      formData.append("file", file);
      if (name) formData.append("name", name);
      if (description) formData.append("description", description);
      const res = await fetch(`/api/admin/tenants/${orgId}/ai/grounding`, { method: "POST", body: formData });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Upload failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Document uploaded" });
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
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); if (!name) setName(f.name.replace(/\.[^.]+$/, "")); }
  }, [name]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={atLimit} data-testid="button-upload-org-grounding-doc">
          <Plus className="w-3.5 h-3.5" /> Add Document
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Knowledge Base Document</DialogTitle>
          <DialogDescription>Upload a PDF, DOCX, TXT, or Markdown file. Max 500 KB.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/50"}`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-org-grounding-doc"
          >
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" className="hidden" data-testid="input-file-org-grounding"
              onChange={e => { const f = e.target.files?.[0]; if (f) { setFile(f); if (!name) setName(f.name.replace(/\.[^.]+$/, "")); } }} />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <File className="w-4 h-4 text-primary" />
                <span className="text-sm">{file.name}</span>
                <span className="text-xs text-muted-foreground">({formatBytes(file.size)})</span>
              </div>
            ) : (
              <>
                <Upload className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Drag & drop or click to select</p>
                <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, MD · Max 500 KB</p>
              </>
            )}
          </div>
          <div className="space-y-2">
            <Label>Document Name</Label>
            <Input data-testid="input-org-doc-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., SharePoint Naming Standards" />
          </div>
          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea data-testid="input-org-doc-description" value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Brief description…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => uploadMutation.mutate()} disabled={!file || uploadMutation.isPending} className="gap-2" data-testid="button-confirm-org-upload">
            {uploadMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrgKnowledgeBase({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const ORG_DOC_LIMIT = 20;

  const groundingDocs = useQuery<GroundingDoc[]>({
    queryKey: [`/api/admin/tenants/${orgId}/ai/grounding`],
    queryFn: async () => {
      const res = await fetch(`/api/admin/tenants/${orgId}/ai/grounding`);
      if (!res.ok) throw new Error("Failed to load knowledge base");
      return res.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/tenants/${orgId}/ai/grounding/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${orgId}/ai/grounding`] });
      toast({ title: "Document deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(`/api/admin/tenants/${orgId}/ai/grounding/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Update failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${orgId}/ai/grounding`] });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const docList = groundingDocs.data ?? [];

  return (
    <Card className="glass-panel border-border/50 shadow-xl" data-testid="card-knowledge-base">
      <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              Knowledge Base
            </CardTitle>
            <CardDescription>
              Organization-specific documents injected into AI assessments for this org only.
              Max {ORG_DOC_LIMIT} documents · 500 KB per file.
            </CardDescription>
          </div>
          <OrgGroundingUploadDialog
            orgId={orgId}
            currentCount={docList.length}
            onSuccess={() => queryClient.invalidateQueries({ queryKey: [`/api/admin/tenants/${orgId}/ai/grounding`] })}
          />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {groundingDocs.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : docList.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground" data-testid="text-no-org-docs">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No knowledge base documents yet.</p>
            <p className="text-xs mt-1">Upload organization-specific policies or standards.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {docList.map(doc => (
              <OrgGroundingDocCard
                key={doc.id}
                doc={doc}
                onDelete={id => deleteMutation.mutate(id)}
                onToggle={(id, isActive) => toggleMutation.mutate({ id, isActive })}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OrganizationSettingsPage() {
  const { plan, features, org } = useServicePlan();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const { data: authData } = useQuery<{
    user: any;
    organization: { id: string; name: string; domain: string; allowedDomains: string[] | null; inviteOnly: boolean | null } | null;
  }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : null),
    staleTime: 5 * 60 * 1000,
  });

  const activeOrg = authData?.organization;
  const userRole = authData?.user?.role || authData?.user?.effectiveRole;
  const isTenantAdmin = userRole === 'tenant_admin' || userRole === 'platform_owner';

  const [inviteOnly, setInviteOnly] = useState(false);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelConfirmName, setCancelConfirmName] = useState("");

  const { data: dataCounts } = useQuery<Record<string, number>>({
    queryKey: ["/api/orgs", activeOrg?.id, "data-counts"],
    queryFn: async () => {
      if (!activeOrg?.id) return {};
      const res = await fetch(`/api/orgs/${activeOrg.id}/data-counts`, { credentials: "include" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: showCancelDialog && !!activeOrg?.id,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!activeOrg?.id) throw new Error("No active organization");
      const res = await fetch(`/api/orgs/${activeOrg.id}/cancel`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to cancel organization");
      }
      return res.json();
    },
    onSuccess: () => {
      setShowCancelDialog(false);
      window.location.href = "/auth?cancelled=true";
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (activeOrg) {
      setInviteOnly(activeOrg.inviteOnly ?? false);
      setAllowedDomains(activeOrg.allowedDomains ?? []);
    }
  }, [activeOrg]);

  const settingsMutation = useMutation({
    mutationFn: async (updates: { allowedDomains?: string[]; inviteOnly?: boolean }) => {
      if (!activeOrg) throw new Error("No active organization");
      const res = await fetch(`/api/orgs/${activeOrg.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Settings updated", description: "Organization access settings have been saved." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleAddDomain = () => {
    const domain = newDomain.toLowerCase().trim();
    if (!domain) return;
    if (allowedDomains.includes(domain)) {
      toast({ title: "Domain already exists", variant: "destructive" });
      return;
    }
    const updated = [...allowedDomains, domain];
    setAllowedDomains(updated);
    setNewDomain("");
    settingsMutation.mutate({ allowedDomains: updated });
  };

  const handleRemoveDomain = (domain: string) => {
    const updated = allowedDomains.filter(d => d !== domain);
    setAllowedDomains(updated);
    settingsMutation.mutate({ allowedDomains: updated });
  };

  const handleInviteOnlyToggle = (checked: boolean) => {
    setInviteOnly(checked);
    settingsMutation.mutate({ inviteOnly: checked });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
        <p className="text-muted-foreground mt-1">Manage profile, security, and preferences for {activeOrg?.name || 'your organization'}.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Organization Profile
              </CardTitle>
              <CardDescription>Core identity and contact information.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>Organization Name</Label>
                  <Input defaultValue={activeOrg?.name || ""} className="bg-background/50" data-testid="input-org-name" />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label>Primary Domain</Label>
                  <Input value={activeOrg?.domain || ""} disabled className="bg-muted/50" data-testid="text-org-domain" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Support Email</Label>
                  <Input defaultValue={`it-support@${activeOrg?.domain || "example.com"}`} className="bg-background/50" />
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-border/40 bg-muted/10 pt-4 pb-4 justify-end">
              <Button className="gap-2 shadow-md shadow-primary/20">
                <Save className="w-4 h-4" /> Save Profile
              </Button>
            </CardFooter>
          </Card>

          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-500" />
                Membership & Access Controls
              </CardTitle>
              <CardDescription>Control how users join this organization.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50">
                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-500" />
                    Invite Only
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    When enabled, new users cannot self-join this organization. They must be invited by an admin.
                  </p>
                </div>
                <Switch
                  checked={inviteOnly}
                  onCheckedChange={handleInviteOnlyToggle}
                  disabled={settingsMutation.isPending}
                  data-testid="switch-invite-only"
                />
              </div>

              <div className="p-4 rounded-xl border border-border/50 bg-background/50 space-y-4">
                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-2">
                    <Globe className="w-4 h-4 text-blue-500" />
                    Allowed Email Domains
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Only users with email addresses matching these domains can join. Leave empty to allow any domain.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. contoso.com"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddDomain()}
                    className="bg-background"
                    data-testid="input-allowed-domain"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddDomain}
                    disabled={!newDomain.trim() || settingsMutation.isPending}
                    className="shrink-0"
                    data-testid="button-add-domain"
                  >
                    {settingsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  </Button>
                </div>

                {allowedDomains.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {allowedDomains.map((domain) => (
                      <Badge
                        key={domain}
                        variant="secondary"
                        className="gap-1 pr-1 text-xs"
                        data-testid={`badge-domain-${domain}`}
                      >
                        {domain}
                        <button
                          onClick={() => handleRemoveDomain(domain)}
                          className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 transition-colors"
                          disabled={settingsMutation.isPending}
                          data-testid={`button-remove-domain-${domain}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No domain restrictions — any email domain is allowed.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="border-b border-border/40 bg-muted/10 pb-4">
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                Security & Access
              </CardTitle>
              <CardDescription>Configure authentication and tenant restrictions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50">
                <div>
                  <h4 className="font-semibold text-sm">Enforce MFA</h4>
                  <p className="text-xs text-muted-foreground mt-1">Require multi-factor authentication for all Zenith logins.</p>
                </div>
                <Switch checked={true} />
              </div>
              <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-background/50">
                <div>
                  <h4 className="font-semibold text-sm">Cross-Tenant Isolation</h4>
                  <p className="text-xs text-muted-foreground mt-1">Prevent users from authenticating to external M365 tenants.</p>
                </div>
                <Switch checked={true} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                Current Plan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`p-4 rounded-xl flex flex-col items-center justify-center text-center ${plan === 'TRIAL' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-primary/10 border border-primary/20'}`}>
                <Badge className={`mb-2 uppercase tracking-widest text-[10px] ${plan === 'TRIAL' ? 'bg-amber-500/20 text-amber-600 border-amber-500/30' : ''}`}>{features.label}</Badge>
                <div className="text-2xl font-bold mt-1">
                  {features.maxUsers === -1 ? 'Unlimited' : <>{features.maxUsers.toLocaleString()}<span className="text-sm text-muted-foreground font-normal"> max users</span></>}
                </div>
                <div className={`text-xs mt-2 ${plan === 'TRIAL' ? 'text-amber-600' : 'text-primary'}`}>
                  {plan === 'TRIAL' ? 'Trial (No M365 Write-Back)' : 'Active Subscription'}
                </div>
              </div>
              <Button asChild variant="outline" className="w-full mt-4">
                <a href="mailto:support@synozur.com">{plan === 'TRIAL' ? 'Contact Us to Upgrade' : 'Contact Us to Manage Plan'}</a>
              </Button>
            </CardContent>
          </Card>
          
          <Card className="glass-panel border-border/50">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" />
                Connected Tenants
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border/50">
                <div className="text-sm font-medium">Production</div>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/50 border border-border/50">
                <div className="text-sm font-medium">UAT Sandbox</div>
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              </div>
              <Button variant="ghost" className="w-full text-xs mt-2" size="sm">Configure Tenants</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {isTenantAdmin && activeOrg && (
        <OrgKnowledgeBase orgId={activeOrg.id} />
      )}

      {isTenantAdmin && activeOrg && (
        <Card className="border-destructive/30 shadow-xl bg-destructive/5">
          <CardHeader className="border-b border-destructive/20 bg-destructive/5 pb-4">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>Irreversible actions that affect your entire organization.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between p-4 rounded-xl border border-destructive/30 bg-background/50">
              <div>
                <h4 className="font-semibold text-sm">Cancel Account & Delete All Data</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Permanently delete this organization and all associated data including tenants, workspaces, users, policies, tickets, and inventory. This action is immediate and cannot be undone.
                </p>
              </div>
              <Button
                variant="destructive"
                className="shrink-0 gap-2 ml-4"
                onClick={() => { setShowCancelDialog(true); setCancelConfirmName(""); }}
                data-testid="button-cancel-account"
              >
                <Trash2 className="w-4 h-4" />
                Cancel Account
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showCancelDialog} onOpenChange={open => { if (!open) { setShowCancelDialog(false); setCancelConfirmName(""); } }}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              Cancel Account & Delete All Data
            </DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{activeOrg?.name}</strong> and all associated data.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <p className="text-sm font-semibold text-destructive">The following data will be permanently deleted:</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Tenant connections ({dataCounts?.tenantConnections ?? '...'})</li>
                <li>Workspaces ({dataCounts?.workspaces ?? '...'})</li>
                <li>Users & memberships ({dataCounts?.users ?? '...'} users, {dataCounts?.memberships ?? '...'} memberships)</li>
                <li>Governance policies ({dataCounts?.policies ?? '...'})</li>
                <li>Support tickets ({dataCounts?.tickets ?? '...'})</li>
                <li>Audit log entries ({dataCounts?.auditEntries ?? '...'})</li>
                <li>All inventory data (Teams, OneDrive, SPE containers, etc.)</li>
                <li>All MSP access grants (granted and received)</li>
              </ul>
            </div>

            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 flex gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-destructive">
                This action is immediate and cannot be undone. All data will be permanently lost.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Type <strong>{activeOrg?.name}</strong> to confirm</Label>
              <Input
                value={cancelConfirmName}
                onChange={e => setCancelConfirmName(e.target.value)}
                placeholder={activeOrg?.name || "Organization name"}
                data-testid="input-cancel-confirm-name"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => { setShowCancelDialog(false); setCancelConfirmName(""); }}
              disabled={cancelMutation.isPending}
              data-testid="button-cancel-dismiss"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelConfirmName !== activeOrg?.name || cancelMutation.isPending}
              className="gap-2"
              data-testid="button-confirm-cancel-account"
            >
              {cancelMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
              Permanently Delete Everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}