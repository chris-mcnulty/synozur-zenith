import { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  BookmarkPlus,
  Check,
  ChevronDown,
  Copy,
  Globe2,
  Home,
  Link2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Sparkles,
  Star,
  StarOff,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { SavedViewPage } from "@shared/schema";
import {
  buildShareableUrl,
  useSavedViewsList,
  type SavedViewWire,
  type ViewState,
} from "@/lib/saved-views";

type AuthMe = {
  user?: { id: string; role: string; effectiveRole?: string };
} | null;

const ROLE_LEVELS: Record<string, number> = {
  platform_owner: 100,
  tenant_admin: 80,
  governance_admin: 60,
  operator: 40,
  viewer: 20,
  read_only_auditor: 10,
};

function isTenantAdmin(role: string | undefined): boolean {
  if (!role) return false;
  return (ROLE_LEVELS[role] ?? 0) >= ROLE_LEVELS.tenant_admin;
}

export interface SavedViewsBarProps {
  page: SavedViewPage;
  currentState: ViewState;
  activeViewId: string | null;
  onApplyView: (view: SavedViewWire) => void;
  onClearView: () => void;
  /** Optional helper to compare a view's state with the current state. */
  isStateDirty?: boolean;
}

export function SavedViewsBar({
  page,
  currentState,
  activeViewId,
  onApplyView,
  onClearView,
  isStateDirty,
}: SavedViewsBarProps) {
  const { toast } = useToast();
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [renameView, setRenameView] = useState<SavedViewWire | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedViewWire | null>(null);

  const { data: authData } = useQuery<AuthMe>({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then((r) => (r.ok ? r.json() : null)),
    staleTime: 5 * 60 * 1000,
  });
  const role = authData?.user?.effectiveRole || authData?.user?.role;
  const canShareOrg = isTenantAdmin(role);

  const { data, isLoading } = useSavedViewsList(page);

  const all = useMemo<SavedViewWire[]>(() => {
    if (!data) return [];
    return [...data.my, ...data.shared, ...data.builtIn];
  }, [data]);

  const activeView = activeViewId ? all.find((v) => v.id === activeViewId) : null;
  const pinnedViews = all.filter((v) => v.isPinned);

  const invalidateViews = () => queryClient.invalidateQueries({ queryKey: ["/api/saved-views", page] });

  const pinMutation = useMutation({
    mutationFn: async (vars: { id: string; pinned: boolean }) => {
      const res = await fetch(`/api/saved-views/${vars.id}/pin`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: vars.pinned }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to update pin");
      return res.json();
    },
    onSuccess: () => invalidateViews(),
    onError: (err: Error) => toast({ title: "Could not update pin", description: err.message, variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/saved-views/${id}/duplicate`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to duplicate");
      return res.json();
    },
    onSuccess: (created: SavedViewWire) => {
      invalidateViews();
      toast({ title: "View duplicated", description: `"${created.name}" added to your views.` });
    },
    onError: (err: Error) => toast({ title: "Could not duplicate", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/saved-views/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok && res.status !== 204) throw new Error((await res.json()).error || "Failed to delete");
    },
    onSuccess: (_data, id) => {
      invalidateViews();
      if (activeViewId === id) onClearView();
      toast({ title: "View deleted" });
    },
    onError: (err: Error) => toast({ title: "Could not delete", description: err.message, variant: "destructive" }),
    onSettled: () => setConfirmDelete(null),
  });

  const renameMutation = useMutation({
    mutationFn: async (vars: { id: string; name: string; scope: "PRIVATE" | "ORG" }) => {
      const res = await fetch(`/api/saved-views/${vars.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: vars.name, scope: vars.scope }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to update");
      return res.json();
    },
    onSuccess: () => {
      invalidateViews();
      setRenameView(null);
      toast({ title: "View updated" });
    },
    onError: (err: Error) => toast({ title: "Could not update view", description: err.message, variant: "destructive" }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (vars: { id: string; isDefault: boolean }) => {
      if (vars.isDefault) {
        const res = await fetch(`/api/saved-views/${vars.id}/default`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error((await res.json()).error || "Failed to set default");
        return res.json();
      } else {
        const view = all.find((v) => v.id === vars.id);
        if (!view) return null;
        const res = await fetch(`/api/saved-views/default?page=${encodeURIComponent(view.page)}`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!res.ok && res.status !== 204) throw new Error((await res.json()).error || "Failed to clear default");
        return null;
      }
    },
    onSuccess: (_data, vars) => {
      invalidateViews();
      toast({
        title: vars.isDefault ? "Default view set" : "Default view cleared",
        description: vars.isDefault
          ? "Team members landing on this page will see this view applied automatically."
          : "No default view is set for this page.",
      });
    },
    onError: (err: Error) => toast({ title: "Could not update default", description: err.message, variant: "destructive" }),
  });

  const handleCopyLink = (viewId?: string) => {
    if (typeof navigator === "undefined") return;
    const url = viewId
      ? buildShareableUrl({ viewId })
      : buildShareableUrl({ state: currentState });
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: "Link copied", description: "Share it with a teammate to land on the same filter." }),
      () => toast({ title: "Could not copy link", variant: "destructive" }),
    );
  };

  return (
    <>
      <div className="flex flex-col gap-2" data-testid={`saved-views-bar-${page}`}>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-2 text-xs"
                data-testid="button-saved-views-picker"
              >
                <Bookmark className="w-3.5 h-3.5" />
                {activeView ? <span className="truncate max-w-[180px]">{activeView.name}</span> : "Views"}
                {isStateDirty && activeView && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Unsaved changes" />
                )}
                <ChevronDown className="w-3 h-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              {isLoading ? (
                <div className="p-3 text-xs text-muted-foreground">Loading views…</div>
              ) : (
                <>
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <UserIcon className="w-3 h-3" /> My Views
                  </DropdownMenuLabel>
                  {data && data.my.length > 0 ? (
                    data.my.map((v) => (
                      <ViewMenuItem
                        key={v.id}
                        view={v}
                        isActive={v.id === activeViewId}
                        onApply={() => onApplyView(v)}
                        onPin={(pinned) => pinMutation.mutate({ id: v.id, pinned })}
                        onDuplicate={() => duplicateMutation.mutate(v.id)}
                        onRename={() => setRenameView(v)}
                        onDelete={() => setConfirmDelete(v)}
                        onCopyLink={() => handleCopyLink(v.id)}
                        canEdit={v.isOwner}
                        canShareOrg={canShareOrg}
                      />
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">No private views yet.</div>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Globe2 className="w-3 h-3" /> Shared with my Org
                  </DropdownMenuLabel>
                  {data && data.shared.length > 0 ? (
                    data.shared.map((v) => (
                      <ViewMenuItem
                        key={v.id}
                        view={v}
                        isActive={v.id === activeViewId}
                        onApply={() => onApplyView(v)}
                        onPin={(pinned) => pinMutation.mutate({ id: v.id, pinned })}
                        onDuplicate={() => duplicateMutation.mutate(v.id)}
                        onRename={() => setRenameView(v)}
                        onDelete={() => setConfirmDelete(v)}
                        onCopyLink={() => handleCopyLink(v.id)}
                        onSetDefault={canShareOrg ? () => setDefaultMutation.mutate({ id: v.id, isDefault: !v.isDefault }) : undefined}
                        canEdit={v.isOwner || canShareOrg}
                        canShareOrg={canShareOrg}
                      />
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">No org-shared views.</div>
                  )}

                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Built-in
                  </DropdownMenuLabel>
                  {data && data.builtIn.length > 0 ? (
                    data.builtIn.map((v) => (
                      <ViewMenuItem
                        key={v.id}
                        view={v}
                        isActive={v.id === activeViewId}
                        onApply={() => onApplyView(v)}
                        onDuplicate={() => duplicateMutation.mutate(v.id)}
                        onCopyLink={() => handleCopyLink(v.id)}
                        canEdit={false}
                        canShareOrg={canShareOrg}
                      />
                    ))
                  ) : (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">No built-in views.</div>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-2 text-xs"
            onClick={() => setSaveDialogOpen(true)}
            data-testid="button-save-view"
          >
            <BookmarkPlus className="w-3.5 h-3.5" /> Save view
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-2 text-xs"
            onClick={() => handleCopyLink(activeViewId ?? undefined)}
            data-testid="button-copy-view-link"
          >
            <Link2 className="w-3.5 h-3.5" /> Copy link
          </Button>

          {activeView && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={onClearView}
              data-testid="button-clear-view"
            >
              Clear
            </Button>
          )}
        </div>

        {pinnedViews.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5" data-testid="pinned-views">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mr-1">Pinned</span>
            {pinnedViews.map((v) => (
              <button
                key={v.id}
                onClick={() => onApplyView(v)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                  v.id === activeViewId
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "bg-muted/40 hover:bg-muted/70 border-border/40 text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`chip-pinned-view-${v.id}`}
              >
                <Pin className="w-2.5 h-2.5" />
                {v.name}
                {v.scope === "ORG" && <Globe2 className="w-2.5 h-2.5 opacity-60" />}
              </button>
            ))}
          </div>
        )}
      </div>

      <SaveViewDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        page={page}
        canShareOrg={canShareOrg}
        currentState={currentState}
        onCreated={(view) => {
          invalidateViews();
          onApplyView(view);
        }}
      />

      <RenameViewDialog
        view={renameView}
        canShareOrg={canShareOrg}
        onClose={() => setRenameView(null)}
        onSubmit={(name, scope) => {
          if (!renameView) return;
          renameMutation.mutate({ id: renameView.id, name, scope });
        }}
        isSubmitting={renameMutation.isPending}
      />

      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent data-testid="dialog-delete-view">
          <DialogHeader>
            <DialogTitle>Delete saved view?</DialogTitle>
            <DialogDescription>
              "{confirmDelete?.name}" will be removed{confirmDelete?.scope === "ORG" ? " for everyone in your organization" : ""}. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-view"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ViewMenuItem({
  view,
  isActive,
  onApply,
  onPin,
  onDuplicate,
  onRename,
  onDelete,
  onCopyLink,
  onSetDefault,
  canEdit,
  canShareOrg: _canShareOrg,
}: {
  view: SavedViewWire;
  isActive: boolean;
  onApply: () => void;
  onPin?: (pinned: boolean) => void;
  onDuplicate?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onCopyLink?: () => void;
  onSetDefault?: () => void;
  canEdit: boolean;
  canShareOrg: boolean;
}) {
  return (
    <div className="flex items-center gap-1 group" data-testid={`view-row-${view.id}`}>
      <button
        type="button"
        onClick={onApply}
        className={`flex-1 flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-accent text-left ${
          isActive ? "bg-accent/60" : ""
        }`}
        data-testid={`button-apply-view-${view.id}`}
      >
        {isActive ? <Check className="w-3.5 h-3.5 text-primary" /> : <span className="w-3.5" />}
        <span className="truncate flex-1">{view.name}</span>
        {view.isDefault && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[9px] py-0 h-4 bg-amber-500/10 text-amber-700 border-amber-500/30 gap-0.5">
                <Home className="w-2.5 h-2.5" />
                Default
              </Badge>
            </TooltipTrigger>
            <TooltipContent>This view is automatically applied for all team members on this page</TooltipContent>
          </Tooltip>
        )}
        {view.scope === "ORG" && !view.isDefault && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[9px] py-0 h-4">Org</Badge>
            </TooltipTrigger>
            <TooltipContent>Shared org-wide</TooltipContent>
          </Tooltip>
        )}
        {view.isBuiltIn && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[9px] py-0 h-4 bg-purple-500/10 text-purple-600 border-purple-500/20">Starter</Badge>
            </TooltipTrigger>
            <TooltipContent>{view.description}</TooltipContent>
          </Tooltip>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent text-muted-foreground"
            data-testid={`button-view-actions-${view.id}`}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {!view.isBuiltIn && onPin && (
            <DropdownMenuItem onClick={() => onPin(!view.isPinned)} data-testid={`menu-pin-${view.id}`}>
              {view.isPinned ? <PinOff className="w-3.5 h-3.5 mr-2" /> : <Pin className="w-3.5 h-3.5 mr-2" />}
              {view.isPinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
          )}
          {onSetDefault && (
            <DropdownMenuItem onClick={onSetDefault} data-testid={`menu-set-default-${view.id}`}>
              {view.isDefault
                ? <><StarOff className="w-3.5 h-3.5 mr-2" /> Remove default</>
                : <><Star className="w-3.5 h-3.5 mr-2" /> Set as page default</>
              }
            </DropdownMenuItem>
          )}
          {onCopyLink && (
            <DropdownMenuItem onClick={onCopyLink} data-testid={`menu-copy-link-${view.id}`}>
              <Link2 className="w-3.5 h-3.5 mr-2" /> Copy link
            </DropdownMenuItem>
          )}
          {onDuplicate && (
            <DropdownMenuItem onClick={onDuplicate} data-testid={`menu-duplicate-${view.id}`}>
              <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
            </DropdownMenuItem>
          )}
          {canEdit && onRename && (
            <DropdownMenuItem onClick={onRename} data-testid={`menu-rename-${view.id}`}>
              <Pencil className="w-3.5 h-3.5 mr-2" /> Rename / Share
            </DropdownMenuItem>
          )}
          {canEdit && onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className="text-destructive focus:text-destructive"
                data-testid={`menu-delete-${view.id}`}
              >
                <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function SaveViewDialog({
  open,
  onOpenChange,
  page,
  canShareOrg,
  currentState,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page: SavedViewPage;
  canShareOrg: boolean;
  currentState: ViewState;
  onCreated: (view: SavedViewWire) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"PRIVATE" | "ORG">("PRIVATE");
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/saved-views`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page,
          name: name.trim(),
          scope,
          filterJson: currentState.filterJson,
          sortJson: currentState.sortJson,
          columnsJson: currentState.columnsJson,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.formErrors?.join(", ") || data.error || "Failed to save view");
      }
      return res.json();
    },
    onSuccess: (created: SavedViewWire) => {
      toast({ title: "View saved", description: `"${created.name}" is now in your views.` });
      onOpenChange(false);
      setName("");
      setScope("PRIVATE");
      onCreated(created);
    },
    onError: (err: Error) => toast({ title: "Could not save view", description: err.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-save-view">
        <DialogHeader>
          <DialogTitle>Save view</DialogTitle>
          <DialogDescription>
            Capture the current filter, sort, and columns as a reusable view.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="view-name" className="text-xs">Name</Label>
            <Input
              id="view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. External-Shared, Marketing"
              maxLength={80}
              data-testid="input-view-name"
            />
          </div>
          <div>
            <Label className="text-xs">Visibility</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "PRIVATE" | "ORG")}>
              <SelectTrigger data-testid="select-view-scope"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">Private — only me</SelectItem>
                <SelectItem value="ORG" disabled={!canShareOrg}>
                  Shared — everyone in my organization{!canShareOrg ? " (Tenant Admin only)" : ""}
                </SelectItem>
              </SelectContent>
            </Select>
            {!canShareOrg && scope === "PRIVATE" && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Org-shared views can only be created by Tenant Admins or higher.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
            data-testid="button-confirm-save-view"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameViewDialog({
  view,
  canShareOrg,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  view: SavedViewWire | null;
  canShareOrg: boolean;
  onClose: () => void;
  onSubmit: (name: string, scope: "PRIVATE" | "ORG") => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState(view?.name ?? "");
  const [scope, setScope] = useState<"PRIVATE" | "ORG">(view?.scope === "ORG" ? "ORG" : "PRIVATE");

  // Sync local form state whenever the dialog opens with a different view.
  useEffect(() => {
    if (view) {
      setName(view.name);
      setScope(view.scope === "ORG" ? "ORG" : "PRIVATE");
    }
  }, [view]);

  return (
    <Dialog open={!!view} onOpenChange={(open) => !open && onClose()}>
      <DialogContent data-testid="dialog-rename-view">
        <DialogHeader>
          <DialogTitle>Edit view</DialogTitle>
          <DialogDescription>Rename or change the visibility of this view.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="rename-view-name" className="text-xs">Name</Label>
            <Input
              id="rename-view-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              data-testid="input-rename-view-name"
            />
          </div>
          <div>
            <Label className="text-xs">Visibility</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "PRIVATE" | "ORG")}>
              <SelectTrigger data-testid="select-rename-view-scope"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">Private — only me</SelectItem>
                <SelectItem value="ORG" disabled={!canShareOrg}>
                  Shared — everyone in my organization{!canShareOrg ? " (Tenant Admin only)" : ""}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onSubmit(name.trim(), scope)}
            disabled={!name.trim() || isSubmitting}
            data-testid="button-confirm-rename-view"
          >
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

