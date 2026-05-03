import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Copy, KeyRound, Plus, RotateCw, Trash2 } from "lucide-react";

type GalaxyClient = {
  id: string;
  name: string;
  clientId: string;
  organizationsAllowed: string[];
  allowedScopes: string[];
  status: "ACTIVE" | "DISABLED";
  rateLimitPerMinute: number;
  tokenTtlSeconds: number;
  rotatedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string | null;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export default function GalaxyApiAdminPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<{ name: string; clientId: string; clientSecret: string } | null>(null);

  const { data, isLoading } = useQuery<{ items: GalaxyClient[] }>({
    queryKey: ["/api/admin/galaxy/clients"],
    queryFn: () => api("/api/admin/galaxy/clients"),
  });

  const createMutation = useMutation({
    mutationFn: (body: any) => api<any>("/api/admin/galaxy/clients", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/galaxy/clients"] });
      setCreating(false);
      setRevealedSecret({ name: data.name, clientId: data.clientId, clientSecret: data.clientSecret });
    },
    onError: (e: any) => toast({ variant: "destructive", title: "Registration failed", description: e.message }),
  });

  const rotateMutation = useMutation({
    mutationFn: (id: string) => api<any>(`/api/admin/galaxy/clients/${id}/rotate-secret`, { method: "POST" }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/admin/galaxy/clients"] });
      setRevealedSecret({ name: data.name, clientId: data.clientId, clientSecret: data.clientSecret });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/api/admin/galaxy/clients/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/galaxy/clients"] }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "ACTIVE" | "DISABLED" }) =>
      api(`/api/admin/galaxy/clients/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/admin/galaxy/clients"] }),
  });

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-galaxy-api-admin">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Galaxy Partner API</h1>
          <p className="text-muted-foreground">
            Register Galaxy client applications, rotate credentials, and govern scopes.
          </p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="button-register-client">
          <Plus className="h-4 w-4 mr-2" /> Register Galaxy client
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registered clients</CardTitle>
          <CardDescription>Each Galaxy deployment authenticates with its own client_id + secret.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !data?.items?.length ? (
            <p className="text-muted-foreground" data-testid="text-empty-state">No Galaxy clients registered yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Orgs</TableHead>
                  <TableHead>Rate / TTL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((c) => (
                  <TableRow key={c.id} data-testid={`row-client-${c.id}`}>
                    <TableCell className="font-medium" data-testid={`text-client-name-${c.id}`}>{c.name}</TableCell>
                    <TableCell className="font-mono text-xs">{c.clientId}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {c.allowedScopes.map((s) => (<Badge key={s} variant="outline">{s}</Badge>))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{c.organizationsAllowed.length} org(s)</TableCell>
                    <TableCell className="text-xs">{c.rateLimitPerMinute}/min · {c.tokenTtlSeconds}s</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "ACTIVE" ? "default" : "secondary"} data-testid={`status-client-${c.id}`}>
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      {c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleMutation.mutate({ id: c.id, status: c.status === "ACTIVE" ? "DISABLED" : "ACTIVE" })}
                        data-testid={`button-toggle-${c.id}`}
                      >
                        {c.status === "ACTIVE" ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rotateMutation.mutate(c.id)}
                        data-testid={`button-rotate-${c.id}`}
                      >
                        <RotateCw className="h-3 w-3 mr-1" /> Rotate
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (confirm(`Delete Galaxy client "${c.name}"? Active tokens will become invalid.`)) {
                            deleteMutation.mutate(c.id);
                          }
                        }}
                        data-testid={`button-delete-${c.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Register Galaxy client</DialogTitle>
            <DialogDescription>
              The client secret is generated server-side and shown once. The RSA public key is used to verify
              the per-request <code>X-Galaxy-User</code> JWT.
            </DialogDescription>
          </DialogHeader>
          <CreateClientForm onSubmit={(b) => createMutation.mutate(b)} pending={createMutation.isPending} />
        </DialogContent>
      </Dialog>

      {/* Reveal secret dialog */}
      <Dialog open={!!revealedSecret} onOpenChange={(o) => !o && setRevealedSecret(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save these credentials now</DialogTitle>
            <DialogDescription>
              The client secret is shown <strong>only once</strong>. Copy it to your secret store before closing.
            </DialogDescription>
          </DialogHeader>
          {revealedSecret && (
            <div className="space-y-3">
              <div>
                <Label>Client name</Label>
                <Input value={revealedSecret.name} readOnly />
              </div>
              <div>
                <Label>Client ID</Label>
                <div className="flex gap-2">
                  <Input value={revealedSecret.clientId} readOnly data-testid="input-revealed-client-id" />
                  <Button variant="outline" onClick={() => navigator.clipboard.writeText(revealedSecret.clientId)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div>
                <Label>Client Secret</Label>
                <div className="flex gap-2">
                  <Input
                    value={revealedSecret.clientSecret}
                    readOnly
                    className="font-mono"
                    data-testid="input-revealed-client-secret"
                  />
                  <Button variant="outline" onClick={() => navigator.clipboard.writeText(revealedSecret.clientSecret)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setRevealedSecret(null)} data-testid="button-close-secret-dialog">
              I've saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateClientForm({
  onSubmit,
  pending,
}: { onSubmit: (b: any) => void; pending: boolean }) {
  const [form, setForm] = useState({
    name: "",
    publicKeyPem: "",
    organizationsAllowed: "",
    allowedScopes: "galaxy.read",
    rateLimitPerMinute: 600,
    tokenTtlSeconds: 900,
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name: form.name,
          publicKeyPem: form.publicKeyPem,
          organizationsAllowed: form.organizationsAllowed.split(/[\s,]+/).filter(Boolean),
          allowedScopes: form.allowedScopes.split(/[\s,]+/).filter(Boolean),
          rateLimitPerMinute: Number(form.rateLimitPerMinute),
          tokenTtlSeconds: Number(form.tokenTtlSeconds),
        });
      }}
      className="space-y-4"
    >
      <div>
        <Label>Display name</Label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          required
          data-testid="input-client-name"
        />
      </div>
      <div>
        <Label>Allowed organizations (comma-separated org IDs)</Label>
        <Input
          value={form.organizationsAllowed}
          onChange={(e) => setForm((f) => ({ ...f, organizationsAllowed: e.target.value }))}
          placeholder="uuid-1, uuid-2"
          required
          data-testid="input-orgs"
        />
      </div>
      <div>
        <Label>Allowed scopes (space-separated)</Label>
        <Input
          value={form.allowedScopes}
          onChange={(e) => setForm((f) => ({ ...f, allowedScopes: e.target.value }))}
          data-testid="input-scopes"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Rate limit (req/min)</Label>
          <Input
            type="number"
            value={form.rateLimitPerMinute}
            onChange={(e) => setForm((f) => ({ ...f, rateLimitPerMinute: Number(e.target.value) }))}
            data-testid="input-rate-limit"
          />
        </div>
        <div>
          <Label>Token TTL (seconds)</Label>
          <Input
            type="number"
            value={form.tokenTtlSeconds}
            onChange={(e) => setForm((f) => ({ ...f, tokenTtlSeconds: Number(e.target.value) }))}
            data-testid="input-ttl"
          />
        </div>
      </div>
      <div>
        <Label>RSA public key (SPKI PEM) — used to verify Galaxy user JWTs</Label>
        <Textarea
          rows={6}
          className="font-mono text-xs"
          value={form.publicKeyPem}
          onChange={(e) => setForm((f) => ({ ...f, publicKeyPem: e.target.value }))}
          placeholder={`-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----`}
          required
          data-testid="input-public-key"
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending} data-testid="button-create-client">
          <KeyRound className="h-4 w-4 mr-2" />
          {pending ? "Registering…" : "Register"}
        </Button>
      </DialogFooter>
    </form>
  );
}
