import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useTenant } from "@/lib/tenant-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Loader2,
  AlertTriangle,
  Pencil,
  Trash2,
  ListFilter,
  X,
  TextCursorInput,
} from "lucide-react";

type CustomFieldDefinition = {
  id: string;
  tenantId: string;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  filterable: boolean;
  sortOrder: number;
  createdAt: string;
};

const FIELD_TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "SELECT", label: "Select (Dropdown)" },
  { value: "NUMBER", label: "Number" },
  { value: "BOOLEAN", label: "Boolean (Yes/No)" },
  { value: "DATE", label: "Date" },
];

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export default function CustomFieldsPage() {
  const { toast } = useToast();
  const { selectedTenant } = useTenant();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDefinition | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CustomFieldDefinition | null>(null);

  const [formLabel, setFormLabel] = useState("");
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState("TEXT");
  const [formOptions, setFormOptions] = useState<string[]>([]);
  const [formOptionInput, setFormOptionInput] = useState("");
  const [formRequired, setFormRequired] = useState(false);
  const [formFilterable, setFormFilterable] = useState(true);

  const activeTenantId = selectedTenant?.id || "";

  const { data: fields = [], isLoading } = useQuery<CustomFieldDefinition[]>({
    queryKey: ["/api/admin/tenants", activeTenantId, "custom-fields"],
    queryFn: () =>
      fetch(`/api/admin/tenants/${activeTenantId}/custom-fields`).then(r => r.json()),
    enabled: !!activeTenantId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: {
      fieldName: string;
      fieldLabel: string;
      fieldType: string;
      options?: string[];
      required: boolean;
      filterable: boolean;
    }) => {
      await apiRequest("POST", `/api/admin/tenants/${activeTenantId}/custom-fields`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", activeTenantId, "custom-fields"] });
      closeDialog();
      toast({ title: "Custom Field Created", description: "The custom field definition has been added." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: {
      id: string;
      fieldLabel?: string;
      fieldType?: string;
      options?: string[];
      required?: boolean;
      filterable?: boolean;
    }) => {
      await apiRequest("PATCH", `/api/admin/tenants/${activeTenantId}/custom-fields/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", activeTenantId, "custom-fields"] });
      closeDialog();
      toast({ title: "Custom Field Updated", description: "The custom field definition has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/tenants/${activeTenantId}/custom-fields/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tenants", activeTenantId, "custom-fields"] });
      setDeleteTarget(null);
      toast({ title: "Custom Field Deleted", description: "The custom field definition has been removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  function openCreateDialog() {
    setEditingField(null);
    setFormLabel("");
    setFormName("");
    setFormType("TEXT");
    setFormOptions([]);
    setFormOptionInput("");
    setFormRequired(false);
    setFormFilterable(true);
    setDialogOpen(true);
  }

  function openEditDialog(field: CustomFieldDefinition) {
    setEditingField(field);
    setFormLabel(field.fieldLabel);
    setFormName(field.fieldName);
    setFormType(field.fieldType);
    setFormOptions(field.options || []);
    setFormOptionInput("");
    setFormRequired(field.required);
    setFormFilterable(field.filterable);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditingField(null);
  }

  function addOption() {
    const val = formOptionInput.trim();
    if (val && !formOptions.includes(val)) {
      setFormOptions([...formOptions, val]);
    }
    setFormOptionInput("");
  }

  function removeOption(opt: string) {
    setFormOptions(formOptions.filter(o => o !== opt));
  }

  function handleSubmit() {
    const label = formLabel.trim();
    if (!label) {
      toast({ title: "Validation Error", description: "Field label is required.", variant: "destructive" });
      return;
    }
    const name = formName.trim() || slugify(label);
    if (!name) {
      toast({ title: "Validation Error", description: "Field name could not be generated.", variant: "destructive" });
      return;
    }
    if (formType === "SELECT" && formOptions.length === 0) {
      toast({ title: "Validation Error", description: "SELECT fields require at least one option.", variant: "destructive" });
      return;
    }

    if (editingField) {
      updateMutation.mutate({
        id: editingField.id,
        fieldLabel: label,
        fieldType: formType,
        options: formType === "SELECT" ? formOptions : undefined,
        required: formRequired,
        filterable: formFilterable,
      });
    } else {
      createMutation.mutate({
        fieldName: name,
        fieldLabel: label,
        fieldType: formType,
        options: formType === "SELECT" ? formOptions : undefined,
        required: formRequired,
        filterable: formFilterable,
      });
    }
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Custom Fields</h1>
          <p className="text-muted-foreground mt-1">
            Define custom metadata fields for workspaces. These fields are tenant-specific and can be used for tracking, filtering, and policy evaluation.
          </p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="gap-2 shadow-md shadow-primary/20"
          disabled={!activeTenantId}
          data-testid="button-create-custom-field"
        >
          <Plus className="w-4 h-4" />
          New Custom Field
        </Button>
      </div>

      {!activeTenantId ? (
        <Card className="glass-panel border-border/50">
          <CardContent className="flex flex-col items-center justify-center h-48 gap-3 text-center p-6">
            <AlertTriangle className="w-12 h-12 text-muted-foreground/30" />
            <div>
              <p className="font-medium text-foreground">No tenant connected</p>
              <p className="text-sm text-muted-foreground mt-1">Connect a Microsoft 365 tenant first to manage custom fields.</p>
            </div>
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : fields.length === 0 ? (
        <Card className="glass-panel border-border/50">
          <CardContent className="py-16 text-center">
            <TextCursorInput className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2" data-testid="text-no-fields">No Custom Fields Defined</h3>
            <p className="text-muted-foreground mb-6">Create custom metadata fields to capture additional information on workspaces.</p>
            <Button onClick={openCreateDialog} className="gap-2" data-testid="button-create-first-field">
              <Plus className="w-4 h-4" /> Create Custom Field
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass-panel border-border/50 shadow-xl">
          <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TextCursorInput className="w-5 h-5 text-primary" />
                  Custom Field Definitions
                  {selectedTenant && (
                    <Badge variant="outline" className="text-[10px] ml-2 text-muted-foreground">{selectedTenant.tenantName}</Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1">Manage custom metadata fields for workspaces in this tenant.</CardDescription>
              </div>
              <Badge variant="secondary" className="text-xs" data-testid="text-field-count">{fields.length} fields</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40">
                  <TableHead>Label</TableHead>
                  <TableHead>Field Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Required</TableHead>
                  <TableHead className="text-center">Filterable</TableHead>
                  <TableHead>Options</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field) => (
                  <TableRow key={field.id} className="border-border/30" data-testid={`row-field-${field.id}`}>
                    <TableCell className="font-medium" data-testid={`text-label-${field.id}`}>{field.fieldLabel}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono" data-testid={`text-name-${field.id}`}>{field.fieldName}</code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs" data-testid={`text-type-${field.id}`}>{field.fieldType}</Badge>
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-required-${field.id}`}>
                      {field.required ? (
                        <Badge variant="default" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">Required</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Optional</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center" data-testid={`text-filterable-${field.id}`}>
                      {field.filterable ? (
                        <ListFilter className="w-4 h-4 text-primary mx-auto" />
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell data-testid={`text-options-${field.id}`}>
                      {field.options && field.options.length > 0 ? (
                        <span className="text-xs text-muted-foreground">{field.options.length} options</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEditDialog(field)}
                          data-testid={`button-edit-field-${field.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(field)}
                          data-testid={`button-delete-field-${field.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingField ? "Edit Custom Field" : "Create Custom Field"}
            </DialogTitle>
            <DialogDescription>
              {editingField
                ? "Update the custom field definition. Field name cannot be changed after creation."
                : "Define a new custom metadata field for workspaces."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Field Label *</Label>
              <Input
                value={formLabel}
                onChange={(e) => {
                  setFormLabel(e.target.value);
                  if (!editingField) {
                    setFormName(slugify(e.target.value));
                  }
                }}
                placeholder="e.g., Region"
                data-testid="input-field-label"
              />
            </div>
            <div className="space-y-2">
              <Label>Field Name (internal key)</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="auto-generated from label"
                disabled={!!editingField}
                className="font-mono text-sm"
                data-testid="input-field-name"
              />
              <p className="text-[11px] text-muted-foreground">Used as the key in the customFields JSON object.</p>
            </div>
            <div className="space-y-2">
              <Label>Field Type *</Label>
              <Select value={formType} onValueChange={setFormType}>
                <SelectTrigger data-testid="select-field-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map(ft => (
                    <SelectItem key={ft.value} value={ft.value}>{ft.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formType === "SELECT" && (
              <div className="space-y-2">
                <Label>Options *</Label>
                <div className="flex gap-2">
                  <Input
                    value={formOptionInput}
                    onChange={(e) => setFormOptionInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addOption();
                      }
                    }}
                    placeholder="Add an option..."
                    data-testid="input-option-value"
                  />
                  <Button type="button" variant="outline" onClick={addOption} data-testid="button-add-option">
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {formOptions.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2" data-testid="list-options">
                    {formOptions.map((opt) => (
                      <Badge
                        key={opt}
                        variant="secondary"
                        className="gap-1.5 pl-3 pr-1.5 py-1.5 text-sm bg-background/80 border border-border/50"
                        data-testid={`badge-option-${opt}`}
                      >
                        {opt}
                        <button
                          onClick={() => removeOption(opt)}
                          className="ml-1 rounded-full hover:bg-destructive/20 p-0.5 transition-colors"
                          data-testid={`button-remove-option-${opt}`}
                        >
                          <X className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div>
                <Label className="text-sm font-medium">Required</Label>
                <p className="text-[11px] text-muted-foreground">Workspace metadata must include this field</p>
              </div>
              <Switch
                checked={formRequired}
                onCheckedChange={setFormRequired}
                data-testid="switch-required"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 p-3">
              <div>
                <Label className="text-sm font-medium">Filterable</Label>
                <p className="text-[11px] text-muted-foreground">Show as a filter option in governance views</p>
              </div>
              <Switch
                checked={formFilterable}
                onCheckedChange={setFormFilterable}
                data-testid="switch-filterable"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel">Cancel</Button>
            <Button onClick={handleSubmit} disabled={isSaving} data-testid="button-submit-field">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {editingField ? "Update Field" : "Create Field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-delete-title">Delete Custom Field</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the field "{deleteTarget?.fieldLabel}"? This action cannot be undone. Existing workspace data for this field will no longer be accessible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
