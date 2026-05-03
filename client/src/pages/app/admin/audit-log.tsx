import { Fragment, useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Filter, RefreshCw, ChevronLeft, ChevronRight, ShieldAlert, Lock, ChevronDown, FileJson, Send, Trash2, Radio, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UpgradeGate } from "@/components/upgrade-gate";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type AuditChange = { from: unknown; to: unknown };
type AuditChanges = Record<string, AuditChange>;
type PerWorkspaceChange = { id: string; displayName: string | null; changes: AuditChanges };

type AuditLogDetails = Record<string, unknown> & {
  changes?: AuditChanges;
  perWorkspaceChanges?: PerWorkspaceChange[];
};

type AuditLogEntry = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  organizationId: string | null;
  tenantConnectionId: string | null;
  details: AuditLogDetails | null;
  result: string;
  ipAddress: string | null;
  createdAt: string;
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isAuditChange(v: unknown): v is AuditChange {
  return isPlainObject(v) && "from" in v && "to" in v;
}

function getChanges(details: AuditLogDetails | null | undefined): AuditChanges | undefined {
  if (!details) return undefined;
  const raw = details.changes;
  if (!isPlainObject(raw)) return undefined;
  const out: AuditChanges = {};
  for (const [k, v] of Object.entries(raw)) {
    if (isAuditChange(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function getPerWorkspaceChanges(details: AuditLogDetails | null | undefined): PerWorkspaceChange[] | undefined {
  if (!details) return undefined;
  const raw = details.perWorkspaceChanges;
  if (!Array.isArray(raw)) return undefined;
  const out: PerWorkspaceChange[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    const id = typeof item.id === "string" ? item.id : null;
    if (!id) continue;
    const displayName = typeof item.displayName === "string" ? item.displayName : null;
    const changesRaw = item.changes;
    if (!isPlainObject(changesRaw)) continue;
    const changes: AuditChanges = {};
    for (const [k, v] of Object.entries(changesRaw)) {
      if (isAuditChange(v)) changes[k] = v;
    }
    if (Object.keys(changes).length === 0) continue;
    out.push({ id, displayName, changes });
  }
  return out.length > 0 ? out : undefined;
}

type AuditLogResponse = {
  rows: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

const ACTION_LABEL_OVERRIDES: Record<string, string> = {
  USER_LOGIN: "User Login",
  USER_SIGNUP: "User Signup",
  USER_CREATED: "User Created",
  USER_ROLE_CHANGED: "Role Changed",
  USER_DEACTIVATED: "User Deactivated",
  USER_REACTIVATED: "User Reactivated",
  PASSWORD_RESET_REQUESTED: "Password Reset Requested",
  PASSWORD_RESET_COMPLETED: "Password Reset Completed",
  WORKSPACE_PROVISIONED: "Workspace Provisioned",
  PROVISIONING_REJECTED: "Provisioning Rejected",
  PROVISIONING_FAILED: "Provisioning Failed",
  PROVISIONING_REQUEST_UPDATED: "Provisioning Updated",
  LABEL_ASSIGNED: "Label Assigned",
  METADATA_UPDATED: "Metadata Updated",
  SHARING_CHANGED: "Sharing Changed",
  SENSITIVITY_CHANGED: "Sensitivity Changed",
  SENSITIVITY_POLICY_VIOLATION: "Sensitivity Policy Violation",
  SITE_ARCHIVED: "Site Archived",
  TENANT_REGISTERED: "Tenant Registered",
  TENANT_SUSPENDED: "Tenant Suspended",
  TENANT_REVOKED: "Tenant Revoked",
  TENANT_REACTIVATED: "Tenant Reactivated",
  TENANT_SYNC_STARTED: "Tenant Sync Started",
  TENANT_SYNC_COMPLETED: "Tenant Sync Completed",
  TENANT_SYNC_FAILED: "Tenant Sync Failed",
  SYNC_STARTED: "Sync Started",
  SYNC_COMPLETED: "Sync Completed",
  SYNC_FAILED: "Sync Failed",
  IA_SYNC_STARTED: "IA Sync Started",
  IA_SYNC_COMPLETED: "IA Sync Completed",
  IA_SYNC_FAILED: "IA Sync Failed",
  ROLE_ASSIGNED: "Role Assigned",
  ROLE_REVOKED: "Role Revoked",
  ORG_CREATED: "Organization Created",
  ORG_MEMBER_ADDED: "Member Added",
  ORG_MEMBER_REMOVED: "Member Removed",
  ORG_MEMBER_ROLE_CHANGED: "Member Role Changed",
  ORG_SWITCHED: "Organization Switched",
  ORG_SETTINGS_UPDATED: "Org Settings Updated",
  ORG_DELETED_BY_ADMIN: "Organization Deleted",
  ORG_PLAN_CHANGED: "Plan Changed",
  ORG_PLAN_CHANGED_BY_ADMIN: "Plan Changed (Admin)",
  ORG_CANCELLED: "Organization Cancelled",
  TENANT_UPDATED: "Tenant Updated",
  TENANT_DELETED: "Tenant Deleted",
  ACCESS_DENIED: "Access Denied",
  POLICY_CREATED: "Policy Created",
  POLICY_UPDATED: "Policy Updated",
  POLICY_DELETED: "Policy Deleted",
  POLICY_OUTCOME_CREATED: "Policy Outcome Created",
  POLICY_OUTCOME_UPDATED: "Policy Outcome Updated",
  POLICY_OUTCOME_DELETED: "Policy Outcome Deleted",
  GOVERNANCE_REVIEW_CREATED: "Governance Review Created",
  GOVERNANCE_FINDING_UPDATED: "Governance Finding Updated",
  CUSTOM_FIELD_CREATED: "Custom Field Created",
  CUSTOM_FIELD_UPDATED: "Custom Field Updated",
  CUSTOM_FIELD_DELETED: "Custom Field Deleted",
  DATA_DICTIONARY_ENTRY_CREATED: "Data Dictionary Entry Created",
  DATA_DICTIONARY_ENTRY_DELETED: "Data Dictionary Entry Deleted",
  REQUIRED_METADATA_UPDATED: "Required Metadata Updated",
  SENSITIVITY_LABELS_SYNCED: "Sensitivity Labels Synced",
  RETENTION_LABELS_SYNCED: "Retention Labels Synced",
  DATA_MASKING_ENABLED: "Data Masking Enabled",
  DATA_MASKING_DISABLED: "Data Masking Disabled",
  CSV_IMPORT_STARTED: "CSV Import Started",
  CSV_IMPORT_COMPLETED: "CSV Import Completed",
  CSV_IMPORT_FAILED: "CSV Import Failed",
  METADATA_WRITEBACK_STARTED: "Metadata Writeback Started",
  METADATA_WRITEBACK_COMPLETED: "Metadata Writeback Completed",
  METADATA_WRITEBACK_FAILED: "Metadata Writeback Failed",
  TENANT_WRITEBACK_STARTED: "Tenant Writeback Started",
  TENANT_WRITEBACK_COMPLETED: "Tenant Writeback Completed",
  TENANT_WRITEBACK_FAILED: "Tenant Writeback Failed",
  WORKSPACE_BULK_UPDATED: "Workspace Bulk Updated",
  HUB_ASSIGNMENT_CHANGED: "Hub Assignment Changed",
  COPILOT_RULES_UPDATED: "Copilot Rules Updated",
  GROUNDING_DOC_CREATED: "Grounding Doc Created",
  GROUNDING_DOC_UPDATED: "Grounding Doc Updated",
  GROUNDING_DOC_DELETED: "Grounding Doc Deleted",
  FEATURE_TOGGLE_CHANGED: "Feature Toggle Changed",
  TENANT_DATA_PURGED: "Tenant Data Purged",
  LICENSE_PRICE_UPDATED: "License Price Updated",
  LICENSE_FINDING_UPDATED: "License Finding Updated",
  MSP_GRANT_CODE_CREATED: "MSP Grant Code Created",
  MSP_GRANT_REDEEMED: "MSP Grant Redeemed",
  MSP_GRANT_REVOKED: "MSP Grant Revoked",
  TENANT_ACCESS_CODE_CREATED: "Tenant Access Code Created",
  TENANT_ACCESS_GRANT_REVOKED: "Tenant Access Grant Revoked",
  TENANT_ACCESS_CLAIMED: "Tenant Access Claimed",
  AUDIT_RETENTION_PURGE: "Audit Retention Purge",
  USER_LOGOUT: "User Logout",
  WORKSPACE_CREATED: "Workspace Created",
  WORKSPACE_DELETED: "Workspace Deleted",
  WORKSPACE_OWNER_ADDED: "Workspace Owner Added",
  WORKSPACE_OWNER_REMOVED: "Workspace Owner Removed",
  WORKSPACE_MEMBER_ADDED: "Workspace Member Added",
  WORKSPACE_MEMBER_REMOVED: "Workspace Member Removed",
  SITE_UNARCHIVED: "Site Unarchived",
  WORKSPACE_ARCHIVED: "Workspace Archived",
  WORKSPACE_UNARCHIVED: "Workspace Unarchived",
  SITE_DELETED_M365: "Site Deleted in M365",
};

const ACTION_LABELS: Record<string, string> = ACTION_LABEL_OVERRIDES;

const RESOURCE_TYPES = [
  "workspace",
  "provisioning_request",
  "tenant_connection",
  "organization",
  "user",
  "policy",
  "governance_policy",
  "auth",
];

const ACTION_TYPES = Object.keys(ACTION_LABELS);

function humaniseAction(action: string): string {
  return ACTION_LABELS[action] || action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function resultBadge(result: string) {
  if (result === "SUCCESS") return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20" data-testid={`badge-result-${result}`}>Success</Badge>;
  if (result === "FAILURE") return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20" data-testid={`badge-result-${result}`}>Failure</Badge>;
  if (result === "DENIED") return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20" data-testid={`badge-result-${result}`}>Denied</Badge>;
  return <Badge variant="outline" data-testid={`badge-result-${result}`}>{result}</Badge>;
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "short",
      timeStyle: "medium",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function buildCsvRow(entry: AuditLogEntry): string {
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [
    escape(entry.createdAt),
    escape(entry.action),
    escape(entry.result),
    escape(entry.userEmail ?? ""),
    escape(entry.resource),
    escape(entry.resourceId ?? ""),
    escape(entry.organizationId ?? ""),
    escape(entry.ipAddress ?? ""),
    escape(entry.details ? JSON.stringify(entry.details) : ""),
  ].join(",");
}

const CSV_HEADER = "Timestamp,Action,Result,User,Resource,Resource ID,Organization ID,IP Address,Details";

function downloadCsv(rows: AuditLogEntry[]) {
  const lines = [CSV_HEADER, ...rows.map(buildCsvRow)];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadJson(rows: AuditLogEntry[]) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDiffValue(v: unknown): string {
  if (v === undefined) return "—";
  if (v === null) return "null";
  if (typeof v === "string") return v === "" ? '""' : v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function ChangesBlock({ entryId, changes }: { entryId: string; changes: AuditChanges }) {
  const fields = Object.keys(changes);
  return (
    <div className="space-y-2" data-testid={`changes-${entryId}`}>
      <div className="text-xs font-medium text-foreground/80">Changes</div>
      <div className="rounded-lg border border-border/50 overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium w-1/4">Field</th>
              <th className="text-left px-3 py-1.5 font-medium">Before</th>
              <th className="text-left px-3 py-1.5 font-medium">After</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(field => (
              <tr key={field} className="border-t border-border/40" data-testid={`change-row-${entryId}-${field}`}>
                <td className="px-3 py-1.5 font-mono">{field}</td>
                <td className="px-3 py-1.5 font-mono text-red-500/80 break-all" data-testid={`change-from-${entryId}-${field}`}>
                  {formatDiffValue(changes[field].from)}
                </td>
                <td className="px-3 py-1.5 font-mono text-emerald-500/80 break-all" data-testid={`change-to-${entryId}-${field}`}>
                  {formatDiffValue(changes[field].to)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PerWorkspaceChangesBlock({ entryId, items }: { entryId: string; items: PerWorkspaceChange[] }) {
  const visible = items.filter(i => i.changes && Object.keys(i.changes).length > 0).slice(0, 25);
  if (visible.length === 0) return null;
  return (
    <div className="space-y-2" data-testid={`per-workspace-changes-${entryId}`}>
      <div className="text-xs font-medium text-foreground/80">
        Per-workspace changes {items.length > visible.length && (<span className="text-muted-foreground">(showing first {visible.length} of {items.length})</span>)}
      </div>
      <div className="space-y-2">
        {visible.map(item => (
          <div key={item.id} className="rounded-lg border border-border/50 p-2 space-y-1.5">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">{item.displayName ?? "(unnamed)"}</span>{" "}
              <span className="font-mono">{item.id.slice(0, 8)}…</span>
            </div>
            <ChangesBlock entryId={`${entryId}-${item.id}`} changes={item.changes} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [filters, setFilters] = useState({
    action: "",
    resource: "",
    userEmail: "",
    result: "",
    startDate: "",
    endDate: "",
  });
  const [applied, setApplied] = useState(filters);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { selectedTenant } = useTenant();
  const tenantConnectionId = selectedTenant?.id ?? "";

  const buildQuery = useCallback((f: typeof filters, p: number, tid: string) => {
    const params = new URLSearchParams();
    params.set("page", String(p));
    params.set("limit", String(limit));
    if (f.action && f.action !== "ALL") params.set("action", f.action);
    if (f.resource && f.resource !== "ALL") params.set("resource", f.resource);
    if (f.userEmail) params.set("userEmail", f.userEmail);
    if (f.result && f.result !== "ALL") params.set("result", f.result);
    if (f.startDate) params.set("startDate", f.startDate);
    if (f.endDate) params.set("endDate", f.endDate);
    if (tid) params.set("tenantConnectionId", tid);
    return `/api/audit-log?${params.toString()}`;
  }, [limit]);

  const { data, isLoading, refetch } = useQuery<AuditLogResponse>({
    queryKey: ["audit-log", applied, page, tenantConnectionId],
    queryFn: async () => {
      const res = await fetch(buildQuery(applied, page, tenantConnectionId), { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
  });

  function applyFilters() {
    setPage(1);
    setApplied({ ...filters });
  }

  function resetFilters() {
    const empty = { action: "", resource: "", userEmail: "", result: "", startDate: "", endDate: "" };
    setFilters(empty);
    setApplied(empty);
    setPage(1);
  }

  function toggleExpanded(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  const rows = data?.rows ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-primary" />
            Audit Log
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Full record of governance actions, access events, and system changes across the platform.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2" data-testid="button-refresh-audit-log">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <UpgradeGate
            feature="csvExport"
            fallback={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 opacity-60"
                    disabled
                    data-testid="button-export-csv-locked"
                  >
                    <Lock className="w-4 h-4" />
                    Export CSV
                  </Button>
                </TooltipTrigger>
                <TooltipContent>CSV Export requires Standard plan or higher. Upgrade to enable.</TooltipContent>
              </Tooltip>
            }
          >
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={rows.length === 0}
              onClick={() => downloadCsv(rows)}
              data-testid="button-export-csv"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
          </UpgradeGate>
          <UpgradeGate
            feature="csvExport"
            fallback={
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 opacity-60"
                    disabled
                    data-testid="button-export-json-locked"
                  >
                    <Lock className="w-4 h-4" />
                    Export JSON
                  </Button>
                </TooltipTrigger>
                <TooltipContent>JSON Export requires Standard plan or higher. Upgrade to enable.</TooltipContent>
              </Tooltip>
            }
          >
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={rows.length === 0}
              onClick={() => downloadJson(rows)}
              data-testid="button-export-json"
            >
              <FileJson className="w-4 h-4" />
              Export JSON
            </Button>
          </UpgradeGate>
        </div>
      </div>

      <Tabs defaultValue="log" className="space-y-6">
        <TabsList data-testid="tabs-audit-log">
          <TabsTrigger value="log" data-testid="tab-log">
            <ShieldAlert className="w-4 h-4 mr-2" />
            Log Entries
          </TabsTrigger>
          <TabsTrigger value="streaming" data-testid="tab-streaming">
            <Radio className="w-4 h-4 mr-2" />
            Streaming
          </TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="space-y-6 mt-0">
      <Card className="glass-panel">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="w-4 h-4 text-primary" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="filter-action">Action Type</Label>
              <Select
                value={filters.action || "ALL"}
                onValueChange={(v) => setFilters(f => ({ ...f, action: v === "ALL" ? "" : v }))}
              >
                <SelectTrigger id="filter-action" data-testid="select-filter-action">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All actions</SelectItem>
                  {ACTION_TYPES.map(a => (
                    <SelectItem key={a} value={a}>{ACTION_LABELS[a]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-resource">Resource Type</Label>
              <Select
                value={filters.resource || "ALL"}
                onValueChange={(v) => setFilters(f => ({ ...f, resource: v === "ALL" ? "" : v }))}
              >
                <SelectTrigger id="filter-resource" data-testid="select-filter-resource">
                  <SelectValue placeholder="All resources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All resources</SelectItem>
                  {RESOURCE_TYPES.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-user">User Email</Label>
              <Input
                id="filter-user"
                placeholder="user@example.com"
                value={filters.userEmail}
                onChange={e => setFilters(f => ({ ...f, userEmail: e.target.value }))}
                data-testid="input-filter-user-email"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-result">Result</Label>
              <Select
                value={filters.result || "ALL"}
                onValueChange={(v) => setFilters(f => ({ ...f, result: v === "ALL" ? "" : v }))}
              >
                <SelectTrigger id="filter-result" data-testid="select-filter-result">
                  <SelectValue placeholder="All results" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All results</SelectItem>
                  <SelectItem value="SUCCESS">Success</SelectItem>
                  <SelectItem value="FAILURE">Failure</SelectItem>
                  <SelectItem value="DENIED">Denied</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-start">From Date</Label>
              <Input
                id="filter-start"
                type="date"
                value={filters.startDate}
                onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))}
                data-testid="input-filter-start-date"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter-end">To Date</Label>
              <Input
                id="filter-end"
                type="date"
                value={filters.endDate}
                onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))}
                data-testid="input-filter-end-date"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={applyFilters} data-testid="button-apply-filters">Apply Filters</Button>
            <Button size="sm" variant="ghost" onClick={resetFilters} data-testid="button-reset-filters">Reset</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="glass-panel">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Log Entries</CardTitle>
            <CardDescription data-testid="text-total-entries">
              {isLoading ? "Loading..." : `${total.toLocaleString()} total entries`}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-border/50 bg-muted/20">
                  <TableHead className="pl-6 w-10"></TableHead>
                  <TableHead className="w-40">Timestamp</TableHead>
                  <TableHead className="w-44">Action</TableHead>
                  <TableHead className="w-24">Result</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead className="pr-6">IP Address</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      Loading audit log entries...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                      No audit log entries found for the selected filters.
                    </TableCell>
                  </TableRow>
                ) : rows.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  const hasDetails = entry.details && Object.keys(entry.details).length > 0;
                  return (
                    <Fragment key={entry.id}>
                      <TableRow
                        className={`hover:bg-muted/10 transition-colors border-b border-border/30 ${hasDetails ? "cursor-pointer" : ""}`}
                        onClick={() => hasDetails && toggleExpanded(entry.id)}
                        data-testid={`row-audit-${entry.id}`}
                      >
                        <TableCell className="pl-6 w-10">
                          {hasDetails ? (
                            <ChevronDown
                              className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                            />
                          ) : null}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(entry.createdAt)}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm font-medium" data-testid={`text-action-${entry.id}`}>
                            {humaniseAction(entry.action)}
                          </span>
                        </TableCell>
                        <TableCell data-testid={`cell-result-${entry.id}`}>
                          {resultBadge(entry.result)}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground" data-testid={`text-user-${entry.id}`}>
                          {entry.userEmail ?? <span className="italic opacity-50">system</span>}
                        </TableCell>
                        <TableCell className="text-sm" data-testid={`text-resource-${entry.id}`}>
                          <span className="text-muted-foreground">{entry.resource}</span>
                          {entry.resourceId && (
                            <span className="ml-1 font-mono text-xs text-muted-foreground/60">
                              /{entry.resourceId.slice(0, 8)}…
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="pr-6 font-mono text-xs text-muted-foreground">
                          {entry.ipAddress ?? "—"}
                        </TableCell>
                      </TableRow>
                      {isExpanded && hasDetails && (
                        <TableRow
                          className="bg-muted/10 border-b border-border/30"
                          data-testid={`row-audit-details-${entry.id}`}
                        >
                          <TableCell colSpan={7} className="pl-16 pr-6 py-4">
                            <div className="space-y-3">
                              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                <span>
                                  Audit record ID: <span className="font-mono">{entry.id}</span>
                                </span>
                                {entry.resourceId && (
                                  <span>
                                    Resource ID: <span className="font-mono">{entry.resourceId}</span>
                                  </span>
                                )}
                                {entry.tenantConnectionId && (
                                  <span>
                                    Tenant: <span className="font-mono">{entry.tenantConnectionId.slice(0, 8)}…</span>
                                  </span>
                                )}
                              </div>
                              {(() => {
                                const changes = getChanges(entry.details);
                                return changes ? <ChangesBlock entryId={entry.id} changes={changes} /> : null;
                              })()}
                              {(() => {
                                const items = getPerWorkspaceChanges(entry.details);
                                return items ? <PerWorkspaceChangesBlock entryId={entry.id} items={items} /> : null;
                              })()}
                              <pre
                                className="text-xs bg-background/60 border border-border/50 rounded-lg p-3 overflow-x-auto max-h-72 font-mono"
                                data-testid={`text-details-${entry.id}`}
                              >
                                {JSON.stringify(entry.details, null, 2)}
                              </pre>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border/50">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="streaming" className="space-y-6 mt-0">
          <StreamingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Streaming Tab
type StreamConfig = {
  id: string;
  organizationId: string;
  destinationType: "sentinel" | "splunk_hec" | "s3" | "webhook" | "datadog";
  endpoint: string;
  secretMasked: string | null;
  secretConfigured: boolean;
  options: Record<string, any> | null;
  enabled: boolean;
  batchSize: number;
  lastDeliveryAt: string | null;
  lastDeliveryStatus: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  consecutiveFailures: number;
  totalDelivered: number;
  totalFailed: number;
  cursorTimestamp: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type StreamDelivery = {
  id: string;
  configId: string;
  status: "DELIVERED" | "FAILED" | "DLQ";
  attempts: number;
  batchSize: number;
  firstAuditId: string | null;
  lastAuditId: string | null;
  lastAuditCreatedAt: string | null;
  httpStatus: number | null;
  errorMessage: string | null;
  eventIds: string[] | null;
  createdAt: string | null;
};

const DESTINATION_LABELS: Record<StreamConfig["destinationType"], string> = {
  sentinel: "Microsoft Sentinel",
  splunk_hec: "Splunk HEC",
  s3: "Amazon S3 (presigned URL)",
  webhook: "Generic Webhook",
  datadog: "Datadog Logs",
};

function StreamingTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    destinationType: "webhook" as StreamConfig["destinationType"],
    endpoint: "",
    secret: "",
    rotateSecret: false,
    enabled: true,
    batchSize: 100,
    optionsJson: "{}",
  });

  const configQuery = useQuery<{ config: StreamConfig | null }>({
    queryKey: ["audit-streaming-config"],
    queryFn: async () => {
      const res = await fetch("/api/audit-streaming/config", { credentials: "include" });
      if (res.status === 403) {
        return { config: null };
      }
      if (!res.ok) throw new Error("Failed to load streaming configuration");
      return res.json();
    },
    retry: false,
  });

  const deliveriesQuery = useQuery<{ deliveries: StreamDelivery[] }>({
    queryKey: ["audit-streaming-deliveries"],
    queryFn: async () => {
      const res = await fetch("/api/audit-streaming/deliveries", { credentials: "include" });
      if (!res.ok) return { deliveries: [] };
      return res.json();
    },
    retry: false,
    refetchInterval: 30_000,
  });

  const cfg = configQuery.data?.config ?? null;

  useEffect(() => {
    if (cfg) {
      setForm(prev => ({
        ...prev,
        destinationType: cfg.destinationType,
        endpoint: cfg.endpoint,
        enabled: cfg.enabled,
        batchSize: cfg.batchSize,
        optionsJson: JSON.stringify(cfg.options ?? {}, null, 2),
        secret: "",
        rotateSecret: false,
      }));
    }
  }, [cfg?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async () => {
      let parsedOptions: Record<string, any> = {};
      if (form.optionsJson.trim()) {
        try {
          parsedOptions = JSON.parse(form.optionsJson);
        } catch {
          throw new Error("Options must be valid JSON");
        }
      }
      const body: Record<string, any> = {
        destinationType: form.destinationType,
        endpoint: form.endpoint,
        options: parsedOptions,
        enabled: form.enabled,
        batchSize: form.batchSize,
      };
      // Only include `secret` when the user explicitly wants to rotate it,
      // or when there is no secret configured yet on the server.
      if (form.rotateSecret || !cfg?.secretConfigured) {
        if (form.secret) body.secret = form.secret;
      }
      const res = await apiRequest("PUT", "/api/audit-streaming/config", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Streaming configuration saved" });
      queryClient.invalidateQueries({ queryKey: ["audit-streaming-config"] });
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/audit-streaming/config", undefined);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Streaming configuration removed" });
      setForm(f => ({ ...f, secret: "", rotateSecret: false }));
      queryClient.invalidateQueries({ queryKey: ["audit-streaming-config"] });
      queryClient.invalidateQueries({ queryKey: ["audit-streaming-deliveries"] });
    },
    onError: (err: any) => toast({ title: "Remove failed", description: err.message, variant: "destructive" }),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/audit-streaming/test", {});
      return res.json() as Promise<{ ok: boolean; httpStatus?: number; error?: string }>;
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast({ title: "Test event delivered", description: `HTTP ${r.httpStatus ?? "?"}` });
      } else {
        toast({
          title: "Test delivery failed",
          description: r.error ? r.error.slice(0, 240) : `HTTP ${r.httpStatus ?? "error"}`,
          variant: "destructive",
        });
      }
      queryClient.invalidateQueries({ queryKey: ["audit-streaming-deliveries"] });
    },
    onError: (err: any) => toast({ title: "Test failed", description: err.message, variant: "destructive" }),
  });

  if (configQuery.isLoading) {
    return <div className="text-muted-foreground py-8">Loading streaming configuration…</div>;
  }

  if (configQuery.isError) {
    return (
      <Card className="glass-panel">
        <CardContent className="py-8 text-center space-y-2">
          <Lock className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Audit streaming requires the Professional plan or higher. Upgrade your plan to mirror your audit trail to Sentinel, Splunk, S3, or Datadog.
          </p>
        </CardContent>
      </Card>
    );
  }

  const deliveries = deliveriesQuery.data?.deliveries ?? [];
  const successDeliveries = deliveries.filter(d => d.status === "DELIVERED").length;
  const failedDeliveries = deliveries.filter(d => d.status !== "DELIVERED").length;

  return (
    <div className="space-y-6">
      <Card className="glass-panel">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Radio className="w-4 h-4 text-primary" />
                SIEM Destination
              </CardTitle>
              <CardDescription>
                Mirror every audit event to your own SIEM. Events are batched and delivered with automatic retry.
              </CardDescription>
            </div>
            {cfg && (
              <Badge
                className={cfg.enabled
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : "bg-muted text-muted-foreground"}
                data-testid="badge-streaming-status"
              >
                {cfg.enabled ? "Enabled" : "Disabled"}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="stream-destination">Destination</Label>
              <Select
                value={form.destinationType}
                onValueChange={(v) => setForm(f => ({ ...f, destinationType: v as StreamConfig["destinationType"] }))}
              >
                <SelectTrigger id="stream-destination" data-testid="select-stream-destination">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(DESTINATION_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="stream-batch">Batch size</Label>
              <Input
                id="stream-batch"
                type="number"
                min={1}
                max={1000}
                value={form.batchSize}
                onChange={e => setForm(f => ({ ...f, batchSize: Math.max(1, Math.min(1000, parseInt(e.target.value || "1", 10))) }))}
                data-testid="input-stream-batch-size"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="stream-endpoint">Endpoint URL</Label>
              <Input
                id="stream-endpoint"
                placeholder={
                  form.destinationType === "sentinel"
                    ? "https://<workspace>.ods.opinsights.azure.com/api/logs?api-version=2016-04-01"
                    : form.destinationType === "splunk_hec"
                    ? "https://splunk.example.com:8088/services/collector"
                    : form.destinationType === "s3"
                    ? "https://bucket.s3.amazonaws.com/path?presigned-params…"
                    : form.destinationType === "datadog"
                    ? "https://http-intake.logs.datadoghq.com/api/v2/logs"
                    : "https://example.com/audit-webhook"
                }
                value={form.endpoint}
                onChange={e => setForm(f => ({ ...f, endpoint: e.target.value }))}
                data-testid="input-stream-endpoint"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="stream-secret">
                {form.destinationType === "sentinel" ? "Workspace shared key" :
                 form.destinationType === "splunk_hec" ? "HEC token" :
                 form.destinationType === "datadog" ? "API key" :
                 "Shared secret (used for HMAC signing)"}
              </Label>
              {cfg?.secretConfigured && !form.rotateSecret ? (
                <div className="flex items-center gap-3">
                  <Input
                    value={cfg.secretMasked ?? "•••••••"}
                    disabled
                    className="font-mono"
                    data-testid="input-stream-secret-masked"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setForm(f => ({ ...f, rotateSecret: true, secret: "" }))}
                    data-testid="button-rotate-secret"
                  >
                    Rotate
                  </Button>
                </div>
              ) : (
                <Input
                  id="stream-secret"
                  type="password"
                  placeholder={cfg?.secretConfigured ? "Enter a new secret to replace the existing one" : "Required for signed delivery"}
                  value={form.secret}
                  onChange={e => setForm(f => ({ ...f, secret: e.target.value }))}
                  data-testid="input-stream-secret"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Stored encrypted at rest (AES-256-GCM). Only the last few characters are shown after save.
              </p>
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="stream-options">Destination options (JSON)</Label>
              <Textarea
                id="stream-options"
                rows={4}
                className="font-mono text-xs"
                placeholder={
                  form.destinationType === "sentinel"
                    ? '{ "workspaceId": "<guid>", "logType": "ZenithAudit" }'
                    : form.destinationType === "splunk_hec"
                    ? '{ "index": "main", "sourcetype": "zenith:audit" }'
                    : form.destinationType === "datadog"
                    ? '{ "ddsource": "zenith", "service": "zenith-audit" }'
                    : "{}"
                }
                value={form.optionsJson}
                onChange={e => setForm(f => ({ ...f, optionsJson: e.target.value }))}
                data-testid="textarea-stream-options"
              />
            </div>

            <div className="flex items-center gap-3 md:col-span-2">
              <Switch
                id="stream-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => setForm(f => ({ ...f, enabled: !!v }))}
                data-testid="switch-stream-enabled"
              />
              <Label htmlFor="stream-enabled">Streaming enabled</Label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.endpoint}
              data-testid="button-save-streaming"
            >
              {cfg ? "Save changes" : "Enable streaming"}
            </Button>
            <Button
              variant="outline"
              onClick={() => testMutation.mutate()}
              disabled={!cfg || testMutation.isPending}
              className="gap-2"
              data-testid="button-test-streaming"
            >
              <Send className="w-4 h-4" />
              Send test event
            </Button>
            {cfg && (
              <Button
                variant="outline"
                className="gap-2 text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm("Remove audit streaming configuration? Pending events will not be delivered.")) {
                    deleteMutation.mutate();
                  }
                }}
                disabled={deleteMutation.isPending}
                data-testid="button-delete-streaming"
              >
                <Trash2 className="w-4 h-4" />
                Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {cfg && (
        <Card className="glass-panel">
          <CardHeader>
            <CardTitle className="text-base">Delivery health</CardTitle>
            <CardDescription>Recent batch deliveries to {DESTINATION_LABELS[cfg.destinationType]}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <HealthStat label="Delivered (lifetime)" value={cfg.totalDelivered.toLocaleString()} icon={<CheckCircle2 className="w-4 h-4 text-emerald-500" />} testId="stat-delivered" />
              <HealthStat label="Failed (lifetime)" value={cfg.totalFailed.toLocaleString()} icon={<AlertTriangle className="w-4 h-4 text-amber-500" />} testId="stat-failed" />
              <HealthStat label="Recent batches OK" value={String(successDeliveries)} testId="stat-recent-ok" />
              <HealthStat label="Recent batches failed" value={String(failedDeliveries)} testId="stat-recent-failed" />
            </div>

            {cfg.lastError && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-xs">
                <div className="font-medium text-amber-500 mb-1">Last error</div>
                <div className="font-mono break-all" data-testid="text-last-error">{cfg.lastError}</div>
                {cfg.lastErrorAt && (
                  <div className="text-muted-foreground mt-1">at {formatDate(cfg.lastErrorAt)}</div>
                )}
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Attempts</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                        No deliveries yet. New audit events will be streamed within ~30 seconds.
                      </TableCell>
                    </TableRow>
                  ) : deliveries.map(d => (
                    <DeliveryRow key={d.id} delivery={d} />
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DeliveryRow({ delivery }: { delivery: StreamDelivery }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const replayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/audit-streaming/deliveries/${delivery.id}/replay`, {});
      return res.json() as Promise<{ ok: boolean; httpStatus?: number; error?: string; deliveredCount: number }>;
    },
    onSuccess: (r) => {
      if (r.ok) {
        toast({ title: "Replay succeeded", description: `${r.deliveredCount} event(s) re-delivered (HTTP ${r.httpStatus ?? "?"}).` });
      } else {
        toast({ title: "Replay failed", description: r.error?.slice(0, 240) ?? "Unknown error", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["audit-streaming-deliveries"] });
      queryClient.invalidateQueries({ queryKey: ["audit-streaming-config"] });
    },
    onError: (err: any) => toast({ title: "Replay failed", description: err.message, variant: "destructive" }),
  });
  const canReplay = delivery.status !== "DELIVERED";
  return (
    <TableRow data-testid={`row-delivery-${delivery.id}`}>
      <TableCell className="font-mono text-xs whitespace-nowrap">{delivery.createdAt ? formatDate(delivery.createdAt) : "—"}</TableCell>
      <TableCell>
        {delivery.status === "DELIVERED" ? (
          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Delivered</Badge>
        ) : delivery.status === "DLQ" ? (
          <Badge className="bg-red-500/10 text-red-500 border-red-500/20">DLQ</Badge>
        ) : (
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Failed</Badge>
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-xs">{delivery.batchSize}</TableCell>
      <TableCell className="text-right font-mono text-xs">{delivery.attempts}</TableCell>
      <TableCell className="font-mono text-xs">{delivery.httpStatus ?? "—"}</TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-md truncate" title={delivery.errorMessage ?? ""}>
        {delivery.errorMessage ?? "—"}
      </TableCell>
      <TableCell>
        {canReplay && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => replayMutation.mutate()}
            disabled={replayMutation.isPending}
            data-testid={`button-replay-${delivery.id}`}
          >
            Replay
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function HealthStat({ label, value, icon, testId }: { label: string; value: string; icon?: React.ReactNode; testId?: string }) {
  return (
    <div className="rounded-md border border-border/50 bg-background/40 p-3" data-testid={testId}>
      <div className="text-xs text-muted-foreground flex items-center gap-1.5">{icon}{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
