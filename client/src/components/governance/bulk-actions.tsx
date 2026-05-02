import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Workspace } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useServicePlan } from "@/hooks/use-service-plan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ChevronDown,
  Tag,
  UserPlus,
  Users,
  Archive,
  Mail,
  Loader2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Lock,
  ShieldCheck,
  FileText,
} from "lucide-react";

type SensitivityLabel = {
  labelId: string;
  name: string;
  color: string | null;
  hasProtection: boolean;
  appliesToGroupsSites: boolean;
};

type RetentionLabel = {
  labelId: string;
  name: string;
  retentionDays?: number | null;
  isRecordLabel?: boolean;
};

type ApplyMode = "fillEmpty" | "overwrite";
type StewardRole = "primary" | "secondary";

export type BulkActionKey =
  | "label"
  | "primary-steward"
  | "secondary-steward"
  | "retention"
  | "metadata"
  | "archive"
  | "email-owner";

interface BulkActionResult {
  workspaceId: string;
  displayName: string;
  success: boolean;
  error?: string;
  errorCode?: string;
}

interface BulkActionResponse {
  action: string;
  count: number;
  succeeded: number;
  failed: number;
  results: BulkActionResult[];
  rollupAuditId: string | null;
}

export interface BulkFilterCriteria {
  search?: string;
  tenantConnectionId?: string;
  filters?: Record<string, unknown>;
  totalMatching?: number;
  selectionMode?: "explicit" | "all-matching";
}

interface BulkActionsExtrasProps {
  selectedIds: Set<string>;
  selectedWorkspacesById: Map<string, Workspace>;
  tenantConnectionId: string;
  filterCriteria: BulkFilterCriteria;
  onClearSelection: () => void;
  onAfterAction?: () => void;
}

export function BulkActionsExtras(props: BulkActionsExtrasProps) {
  const [activeAction, setActiveAction] = useState<BulkActionKey | null>(null);
  const [resultsResponse, setResultsResponse] = useState<BulkActionResponse | null>(null);
  const [retryIds, setRetryIds] = useState<string[] | null>(null);
  const { features } = useServicePlan();

  const closeDialog = () => {
    setActiveAction(null);
    setRetryIds(null);
  };

  const handleSuccess = (resp: BulkActionResponse) => {
    setResultsResponse(resp);
    setActiveAction(null);
    setRetryIds(null);
    props.onAfterAction?.();
    queryClient.invalidateQueries({ queryKey: ["/api/workspaces"] });
  };

  const handleRetry = (action: BulkActionKey, ids: string[]) => {
    setResultsResponse(null);
    setRetryIds(ids);
    setActiveAction(action);
  };

  const targetIds = retryIds && retryIds.length > 0 ? retryIds : Array.from(props.selectedIds);
  const targetCount = targetIds.length;
  const targetWorkspaces = useMemo(
    () => targetIds.map(id => props.selectedWorkspacesById.get(id)).filter((w): w is Workspace => !!w),
    [targetIds, props.selectedWorkspacesById],
  );

  const sharedDialogProps = {
    workspaceIds: targetIds,
    targetCount,
    filterCriteria: retryIds ? { ...props.filterCriteria, selectionMode: "explicit" as const } : props.filterCriteria,
    onClose: closeDialog,
    onSuccess: handleSuccess,
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-2 border-primary/20 text-primary hover:bg-primary/10"
            data-testid="button-bulk-more-actions"
          >
            More actions <ChevronDown className="w-4 h-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Bulk actions ({props.selectedIds.size})</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setActiveAction("label")}
            data-testid="menu-bulk-apply-label"
          >
            <Tag className="w-4 h-4 mr-2" /> Apply Sensitivity Label
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setActiveAction("retention")}
            data-testid="menu-bulk-set-retention"
          >
            <ShieldCheck className="w-4 h-4 mr-2" /> Set Retention Label
          </DropdownMenuItem>
          {features.m365WriteBack ? (
            <DropdownMenuItem
              onSelect={() => setActiveAction("metadata")}
              data-testid="menu-bulk-apply-metadata"
            >
              <FileText className="w-4 h-4 mr-2" /> Apply Metadata Defaults
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled data-testid="menu-bulk-apply-metadata-locked">
              <Lock className="w-4 h-4 mr-2" /> Apply Metadata Defaults (Standard+)
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {features.ownershipManagement ? (
            <>
              <DropdownMenuItem
                onSelect={() => setActiveAction("primary-steward")}
                data-testid="menu-bulk-set-primary-steward"
              >
                <UserPlus className="w-4 h-4 mr-2" /> Add/Replace Primary Steward
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setActiveAction("secondary-steward")}
                data-testid="menu-bulk-set-secondary-steward"
              >
                <Users className="w-4 h-4 mr-2" /> Add as M365 Group Co-owner
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem disabled data-testid="menu-bulk-stewards-locked">
              <Lock className="w-4 h-4 mr-2" /> Steward management (Standard+)
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          {features.lifecycleAutomation ? (
            <DropdownMenuItem
              onSelect={() => setActiveAction("archive")}
              className="text-destructive focus:text-destructive"
              data-testid="menu-bulk-archive"
            >
              <Archive className="w-4 h-4 mr-2" /> Archive Sites
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled data-testid="menu-bulk-archive-locked">
              <Lock className="w-4 h-4 mr-2" /> Archive sites (Professional+)
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => setActiveAction("email-owner")}
            data-testid="menu-bulk-email-owner"
          >
            <Mail className="w-4 h-4 mr-2" /> Email Owner
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {activeAction === "label" && (
        <ApplyLabelDialog open {...sharedDialogProps} tenantConnectionId={props.tenantConnectionId} />
      )}
      {activeAction === "retention" && (
        <SetRetentionDialog open {...sharedDialogProps} tenantConnectionId={props.tenantConnectionId} />
      )}
      {activeAction === "metadata" && (
        <ApplyMetadataDialog open {...sharedDialogProps} />
      )}
      {(activeAction === "primary-steward" || activeAction === "secondary-steward") && (
        <SetStewardDialog
          open
          role={activeAction === "primary-steward" ? "primary" : "secondary"}
          {...sharedDialogProps}
        />
      )}
      {activeAction === "archive" && (
        <ArchiveDialog
          open
          {...sharedDialogProps}
          targetWorkspaces={targetWorkspaces}
        />
      )}
      {activeAction === "email-owner" && (
        <EmailOwnerDialog
          open
          {...sharedDialogProps}
          targetWorkspaces={targetWorkspaces}
        />
      )}

      {resultsResponse && (
        <BulkResultDrawer
          response={resultsResponse}
          onClose={() => setResultsResponse(null)}
          onRetryFailed={(ids) => {
            const action = bulkActionKeyFromAction(resultsResponse.action);
            if (action) handleRetry(action, ids);
          }}
        />
      )}
    </>
  );
}

function bulkActionKeyFromAction(action: string): BulkActionKey | null {
  switch (action) {
    case "apply_label": return "label";
    case "set_retention": return "retention";
    case "apply_metadata": return "metadata";
    case "set_primary_steward": return "primary-steward";
    case "set_secondary_steward": return "secondary-steward";
    case "archive": return "archive";
    case "email_owner": return "email-owner";
    default: return null;
  }
}

interface DialogBaseProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (resp: BulkActionResponse) => void;
  workspaceIds: string[];
  targetCount: number;
  filterCriteria: BulkFilterCriteria;
}

async function postBulk<TPayload>(
  url: string,
  body: { workspaceIds: string[]; payload?: TPayload; filterCriteria: BulkFilterCriteria },
): Promise<BulkActionResponse> {
  const res = await apiRequest("POST", url, body);
  return (await res.json()) as BulkActionResponse;
}

function ApplyLabelDialog(props: DialogBaseProps & { tenantConnectionId: string }) {
  const [labelId, setLabelId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();

  const { data: labels = [], isLoading } = useQuery<SensitivityLabel[]>({
    queryKey: ["/api/admin/tenants", props.tenantConnectionId, "sensitivity-labels"],
    queryFn: () =>
      fetch(`/api/admin/tenants/${props.tenantConnectionId}/sensitivity-labels`).then(r => r.json()),
    enabled: !!props.tenantConnectionId && props.open,
  });

  const submit = async () => {
    setSubmitting(true);
    try {
      const data = await postBulk<{ sensitivityLabelId: string | null }>("/api/workspaces/bulk/label", {
        workspaceIds: props.workspaceIds,
        payload: { sensitivityLabelId: labelId === "__clear__" ? null : labelId },
        filterCriteria: props.filterCriteria,
      });
      toast({
        title: "Sensitivity label updated",
        description: `${data.succeeded}/${data.count} succeeded${data.failed ? ` · ${data.failed} failed` : ""}`,
      });
      props.onSuccess(data);
    } catch (err: any) {
      toast({ title: "Bulk apply label failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && !submitting && props.onClose()}>
      <DialogContent data-testid="dialog-bulk-apply-label">
        <DialogHeader>
          <DialogTitle>Apply Sensitivity Label</DialogTitle>
          <DialogDescription>
            Set the sensitivity label for the selected workspaces. The new label is saved against
            each workspace and pushed to Microsoft 365 on the next sync.
          </DialogDescription>
        </DialogHeader>
        {!confirming ? (
          <div className="space-y-3 py-2">
            <Label>New sensitivity label</Label>
            <Select value={labelId} onValueChange={setLabelId}>
              <SelectTrigger data-testid="select-bulk-label">
                <SelectValue placeholder={isLoading ? "Loading labels..." : "Choose a label"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__clear__">— Clear label —</SelectItem>
                {labels.filter(l => l.appliesToGroupsSites).map(l => (
                  <SelectItem key={l.labelId} value={l.labelId}>{l.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <ConfirmCount verb="apply this label to" count={props.targetCount} />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={submitting}>Cancel</Button>
          {!confirming ? (
            <Button
              onClick={() => setConfirming(true)}
              disabled={!labelId}
              data-testid="button-bulk-label-continue"
            >
              Continue
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting} data-testid="button-bulk-label-confirm">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Apply to {props.targetCount} site{props.targetCount === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SetRetentionDialog(props: DialogBaseProps & { tenantConnectionId: string }) {
  const [labelId, setLabelId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();

  const { data: labels = [], isLoading } = useQuery<RetentionLabel[]>({
    queryKey: ["/api/admin/tenants", props.tenantConnectionId, "retention-labels"],
    queryFn: () =>
      fetch(`/api/admin/tenants/${props.tenantConnectionId}/retention-labels`).then(r => r.json()),
    enabled: !!props.tenantConnectionId && props.open,
  });

  const submit = async () => {
    setSubmitting(true);
    try {
      const data = await postBulk<{ retentionLabelId: string | null }>("/api/workspaces/bulk/retention", {
        workspaceIds: props.workspaceIds,
        payload: { retentionLabelId: labelId === "__clear__" ? null : labelId },
        filterCriteria: props.filterCriteria,
      });
      toast({
        title: "Retention label updated",
        description: `${data.succeeded}/${data.count} succeeded${data.failed ? ` · ${data.failed} failed` : ""}`,
      });
      props.onSuccess(data);
    } catch (err: any) {
      toast({ title: "Bulk retention update failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && !submitting && props.onClose()}>
      <DialogContent data-testid="dialog-bulk-set-retention">
        <DialogHeader>
          <DialogTitle>Set Retention Label</DialogTitle>
          <DialogDescription>
            Set the retention label that should govern these workspaces.
          </DialogDescription>
        </DialogHeader>
        {!confirming ? (
          <div className="space-y-3 py-2">
            <Label>Retention label</Label>
            <Select value={labelId} onValueChange={setLabelId}>
              <SelectTrigger data-testid="select-bulk-retention">
                <SelectValue placeholder={isLoading ? "Loading labels..." : "Choose a label"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__clear__">— Clear label —</SelectItem>
                {labels.map(l => (
                  <SelectItem key={l.labelId} value={l.labelId}>{l.name}</SelectItem>
                ))}
                {labels.length === 0 && !isLoading && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No retention labels synced yet.</div>
                )}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <ConfirmCount verb="apply this retention label to" count={props.targetCount} />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={submitting}>Cancel</Button>
          {!confirming ? (
            <Button
              onClick={() => setConfirming(true)}
              disabled={!labelId}
              data-testid="button-bulk-retention-continue"
            >
              Continue
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting} data-testid="button-bulk-retention-confirm">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Apply to {props.targetCount} site{props.targetCount === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface MetadataPayload {
  department?: string;
  costCenter?: string;
  projectCode?: string;
  mode: ApplyMode;
}

function ApplyMetadataDialog(props: DialogBaseProps) {
  const [department, setDepartment] = useState<string>("");
  const [costCenter, setCostCenter] = useState<string>("");
  const [projectCode, setProjectCode] = useState<string>("");
  const [mode, setMode] = useState<ApplyMode>("fillEmpty");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();

  const hasAnyValue = department.trim() !== "" || costCenter.trim() !== "" || projectCode.trim() !== "";

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload: MetadataPayload = { mode };
      if (department.trim()) payload.department = department.trim();
      if (costCenter.trim()) payload.costCenter = costCenter.trim();
      if (projectCode.trim()) payload.projectCode = projectCode.trim();

      const data = await postBulk<MetadataPayload>("/api/workspaces/bulk/metadata", {
        workspaceIds: props.workspaceIds,
        payload,
        filterCriteria: props.filterCriteria,
      });
      toast({
        title: "Metadata defaults applied",
        description: `${data.succeeded}/${data.count} succeeded${data.failed ? ` · ${data.failed} failed` : ""}`,
      });
      props.onSuccess(data);
    } catch (err: any) {
      toast({ title: "Bulk metadata update failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && !submitting && props.onClose()}>
      <DialogContent data-testid="dialog-bulk-apply-metadata">
        <DialogHeader>
          <DialogTitle>Apply Metadata Defaults</DialogTitle>
          <DialogDescription>
            Set default values for Department, Cost Center, and Project Code on the selected workspaces.
          </DialogDescription>
        </DialogHeader>
        {!confirming ? (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-meta-dept">Department</Label>
              <Input
                id="bulk-meta-dept"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Leave empty to skip"
                data-testid="input-bulk-meta-department"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-meta-cc">Cost Center</Label>
              <Input
                id="bulk-meta-cc"
                value={costCenter}
                onChange={(e) => setCostCenter(e.target.value)}
                placeholder="Leave empty to skip"
                data-testid="input-bulk-meta-cost-center"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-meta-pc">Project Code</Label>
              <Input
                id="bulk-meta-pc"
                value={projectCode}
                onChange={(e) => setProjectCode(e.target.value)}
                placeholder="Leave empty to skip"
                data-testid="input-bulk-meta-project-code"
              />
            </div>
            <div className="space-y-1.5 pt-2">
              <Label>Apply mode</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v === "overwrite" ? "overwrite" : "fillEmpty")}>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="mode-fill" value="fillEmpty" data-testid="radio-bulk-meta-fill-empty" />
                  <Label htmlFor="mode-fill" className="font-normal text-sm">Only fill where empty</Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem id="mode-overwrite" value="overwrite" data-testid="radio-bulk-meta-overwrite" />
                  <Label htmlFor="mode-overwrite" className="font-normal text-sm">Overwrite existing values</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        ) : (
          <ConfirmCount verb="apply metadata defaults to" count={props.targetCount} />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={submitting}>Cancel</Button>
          {!confirming ? (
            <Button
              onClick={() => setConfirming(true)}
              disabled={!hasAnyValue}
              data-testid="button-bulk-metadata-continue"
            >
              Continue
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting} data-testid="button-bulk-metadata-confirm">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Apply to {props.targetCount} site{props.targetCount === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface StewardPayload {
  role: StewardRole;
  userPrincipalName: string;
  displayName?: string;
}

function SetStewardDialog(props: DialogBaseProps & { role: StewardRole }) {
  const [upn, setUpn] = useState<string>("");
  const [displayName, setDisplayName] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();

  const submit = async () => {
    setSubmitting(true);
    try {
      const payload: StewardPayload = {
        role: props.role,
        userPrincipalName: upn.trim(),
      };
      if (displayName.trim()) payload.displayName = displayName.trim();

      const data = await postBulk<StewardPayload>("/api/workspaces/bulk/owner", {
        workspaceIds: props.workspaceIds,
        payload,
        filterCriteria: props.filterCriteria,
      });
      toast({
        title: props.role === "primary" ? "Primary steward set" : "Secondary steward added",
        description: `${data.succeeded}/${data.count} succeeded${data.failed ? ` · ${data.failed} failed` : ""}`,
      });
      props.onSuccess(data);
    } catch (err: any) {
      toast({ title: "Bulk steward update failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const title = props.role === "primary" ? "Add/Replace Primary Steward" : "Add Secondary Steward";

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && !submitting && props.onClose()}>
      <DialogContent data-testid={`dialog-bulk-steward-${props.role}`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {props.role === "primary"
              ? "Set this user as the primary steward on each selected workspace and add them as a Microsoft 365 Group owner."
              : "Add this user as an additional owner on each selected workspace's Microsoft 365 Group."}
          </DialogDescription>
        </DialogHeader>
        {!confirming ? (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="steward-upn">User principal name (email)</Label>
              <Input
                id="steward-upn"
                type="email"
                value={upn}
                onChange={(e) => setUpn(e.target.value)}
                placeholder="user@contoso.com"
                data-testid="input-bulk-steward-upn"
              />
            </div>
            {props.role === "primary" && (
              <div className="space-y-1.5">
                <Label htmlFor="steward-display">Display name (optional)</Label>
                <Input
                  id="steward-display"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Used to update the directory display"
                  data-testid="input-bulk-steward-display"
                />
              </div>
            )}
          </div>
        ) : (
          <ConfirmCount
            verb={props.role === "primary" ? "set this primary steward on" : "add this secondary steward to"}
            count={props.targetCount}
          />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={submitting}>Cancel</Button>
          {!confirming ? (
            <Button
              onClick={() => setConfirming(true)}
              disabled={!upn.trim() || !/.+@.+\..+/.test(upn.trim())}
              data-testid="button-bulk-steward-continue"
            >
              Continue
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting} data-testid="button-bulk-steward-confirm">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Apply to {props.targetCount} site{props.targetCount === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveDialog(props: DialogBaseProps & { targetWorkspaces: Workspace[] }) {
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const knownAlreadyArchived = props.targetWorkspaces.filter(ws => ws.isArchived).length;
  const trimmedReason = reason.trim();
  const reasonValid = trimmedReason.length >= 3 && trimmedReason.length <= 500;

  const submit = async () => {
    setSubmitting(true);
    try {
      const data = await postBulk<{ reason: string }>("/api/workspaces/bulk/archive", {
        workspaceIds: props.workspaceIds,
        filterCriteria: props.filterCriteria,
        payload: { reason: trimmedReason },
      });
      toast({
        title: "Archive complete",
        description: `${data.succeeded}/${data.count} archived${data.failed ? ` · ${data.failed} failed` : ""}`,
      });
      props.onSuccess(data);
    } catch (err: any) {
      toast({ title: "Bulk archive failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && !submitting && props.onClose()}>
      <DialogContent data-testid="dialog-bulk-archive">
        <DialogHeader>
          <DialogTitle className="text-destructive">
            Archive {props.targetCount} site{props.targetCount === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            Each site will be locked read-only in Microsoft 365 and marked as archived in Zenith. End
            users will lose write access until you restore.
            {knownAlreadyArchived > 0 && (
              <span className="block mt-2 text-amber-600">
                {knownAlreadyArchived} of these site{knownAlreadyArchived === 1 ? " is" : "s are"} already archived and will be skipped.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="bulk-archive-reason">
            Reason for archive<span className="text-destructive ml-0.5">*</span>
          </Label>
          <Textarea
            id="bulk-archive-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. End-of-quarter cleanup; retain content read-only for 1 year before disposition."
            maxLength={500}
            rows={3}
            data-testid="textarea-bulk-archive-reason"
          />
          <p className="text-xs text-muted-foreground">
            Recorded in the audit log and stored on each workspace. {reason.length}/500
          </p>
        </div>
        <div className="space-y-2 py-2">
          <Label htmlFor="archive-confirm">Type ARCHIVE to confirm</Label>
          <Input
            id="archive-confirm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="ARCHIVE"
            data-testid="input-bulk-archive-confirm"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={submitting}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={submitting || confirmation !== "ARCHIVE" || !reasonValid}
            data-testid="button-bulk-archive-confirm"
          >
            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Archive className="w-4 h-4 mr-2" />}
            Archive {props.targetCount} site{props.targetCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EmailPayload {
  subject: string;
  message: string;
}

function EmailOwnerDialog(props: DialogBaseProps & { targetWorkspaces: Workspace[] }) {
  const [subject, setSubject] = useState("Action requested for your SharePoint site");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { toast } = useToast();

  const knownTargets = props.targetWorkspaces.length;
  const knownOwnersOnFile = props.targetWorkspaces.filter(ws => !!ws.ownerPrincipalName).length;
  const knownMissingOwners = knownTargets - knownOwnersOnFile;
  const unknownTargets = Math.max(0, props.targetCount - knownTargets);

  const submit = async () => {
    setSubmitting(true);
    try {
      const data = await postBulk<EmailPayload>("/api/workspaces/bulk/email-owner", {
        workspaceIds: props.workspaceIds,
        payload: { subject: subject.trim(), message: message.trim() },
        filterCriteria: props.filterCriteria,
      });
      toast({
        title: "Owner emails sent",
        description: `${data.succeeded}/${data.count} sent${data.failed ? ` · ${data.failed} failed` : ""}`,
      });
      props.onSuccess(data);
    } catch (err: any) {
      toast({ title: "Bulk owner email failed", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && !submitting && props.onClose()}>
      <DialogContent data-testid="dialog-bulk-email-owner">
        <DialogHeader>
          <DialogTitle>Email Owners</DialogTitle>
          <DialogDescription>
            Send a message to the recorded owner of each selected workspace.
            {knownMissingOwners > 0 && (
              <span className="block mt-2 text-amber-600">
                {knownMissingOwners} site{knownMissingOwners === 1 ? "" : "s"} {knownMissingOwners === 1 ? "has" : "have"} no
                owner email on file and will be skipped.
              </span>
            )}
            {unknownTargets > 0 && (
              <span className="block mt-2 text-muted-foreground">
                {unknownTargets} site{unknownTargets === 1 ? "" : "s"} {unknownTargets === 1 ? "is" : "are"} on other pages — owner
                availability will be checked server-side and reported in the result drawer.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        {!confirming ? (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                data-testid="input-bulk-email-subject"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-message">Message</Label>
              <Textarea
                id="email-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                maxLength={5000}
                placeholder="Hi — please review the metadata on this site so we can keep its governance posture accurate..."
                data-testid="textarea-bulk-email-message"
              />
            </div>
          </div>
        ) : (
          <ConfirmCount verb="send this email to owners of" count={props.targetCount} />
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={props.onClose} disabled={submitting}>Cancel</Button>
          {!confirming ? (
            <Button
              onClick={() => setConfirming(true)}
              disabled={!subject.trim() || !message.trim() || props.targetCount === 0}
              data-testid="button-bulk-email-continue"
            >
              Continue
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting} data-testid="button-bulk-email-confirm">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
              Send to {props.targetCount} owner{props.targetCount === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmCount({ verb, count }: { verb: string; count: number }) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-4 text-sm" data-testid="confirm-count">
      You're about to {verb} <strong>{count}</strong> workspace{count === 1 ? "" : "s"}. This action
      will run server-side and emit one audit entry per workspace plus a rollup summary entry.
    </div>
  );
}

function BulkResultDrawer({
  response,
  onClose,
  onRetryFailed,
}: {
  response: BulkActionResponse;
  onClose: () => void;
  onRetryFailed: (ids: string[]) => void;
}) {
  const failed = useMemo(() => response.results.filter(r => !r.success), [response]);
  const succeeded = useMemo(() => response.results.filter(r => r.success), [response]);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Bulk action results</SheetTitle>
          <SheetDescription>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">{response.action}</Badge>
              <span className="text-xs text-muted-foreground">
                {response.succeeded}/{response.count} succeeded · {response.failed} failed
              </span>
            </div>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-4">
          {failed.length > 0 && (
            <section>
              <h4 className="text-sm font-medium text-destructive mb-2 flex items-center gap-1.5">
                <XCircle className="w-4 h-4" /> Failed ({failed.length})
              </h4>
              <ul className="space-y-1.5">
                {failed.map(r => (
                  <li
                    key={r.workspaceId}
                    className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm"
                    data-testid={`result-failed-${r.workspaceId}`}
                  >
                    <div className="font-medium truncate">{r.displayName}</div>
                    <div className="text-xs text-destructive break-words mt-0.5">
                      {r.error || "Unknown error"}
                      {r.errorCode && <span className="ml-1 opacity-70">({r.errorCode})</span>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {succeeded.length > 0 && (
            <section>
              <h4 className="text-sm font-medium text-emerald-600 mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Succeeded ({succeeded.length})
              </h4>
              <ul className="space-y-1 max-h-64 overflow-y-auto">
                {succeeded.map(r => (
                  <li
                    key={r.workspaceId}
                    className="text-sm text-muted-foreground truncate px-3 py-1"
                    data-testid={`result-success-${r.workspaceId}`}
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 inline mr-1.5" />
                    {r.displayName}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <SheetFooter className="flex flex-row gap-2 justify-between sm:justify-between">
          <Button variant="ghost" onClick={onClose} data-testid="button-result-close">Close</Button>
          {failed.length > 0 && (
            <Button
              onClick={() => onRetryFailed(failed.map(r => r.workspaceId))}
              data-testid="button-result-retry"
            >
              <RefreshCw className="w-4 h-4 mr-2" /> Retry {failed.length} failed
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
