import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Users,
  Search,
  UserPlus,
  ShieldCheck,
  MoreVertical,
  Mail,
  Key,
  Loader2,
  UserCheck,
  UserX,
  Building2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type OrgUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: boolean;
  authProvider: string | null;
  lastLoginAt: string | null;
  createdAt: string | null;
};

type EntraUser = {
  id: string;
  displayName: string;
  mail: string | null;
  userPrincipalName: string;
  jobTitle: string | null;
  department: string | null;
};

const ZENITH_ROLES = [
  { value: "platform_owner", label: "Platform Owner", description: "Full platform control" },
  { value: "tenant_admin", label: "Tenant Admin", description: "Organization management" },
  { value: "governance_admin", label: "Governance Admin", description: "Governance & compliance" },
  { value: "operator", label: "Operator", description: "Day-to-day operations" },
  { value: "viewer", label: "Viewer", description: "Read-only access" },
  { value: "read_only_auditor", label: "Read-Only Auditor", description: "Audit trail access" },
];

function getRoleDisplay(role: string): string {
  const found = ZENITH_ROLES.find(r => r.value === role);
  return found?.label || role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function getInitials(name: string | null, email: string): string {
  if (name) return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  return email[0]?.toUpperCase() || "?";
}

function isAdminRole(role: string): boolean {
  return ["platform_owner", "tenant_admin", "governance_admin"].includes(role);
}

export default function UserManagementPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editRoleOpen, setEditRoleOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<OrgUser | null>(null);

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserRole, setNewUserRole] = useState("viewer");
  const [editRole, setEditRole] = useState("");
  const [entraSearch, setEntraSearch] = useState("");
  const [entraResults, setEntraResults] = useState<EntraUser[]>([]);
  const [entraLoading, setEntraLoading] = useState(false);
  const [showEntraDropdown, setShowEntraDropdown] = useState(false);
  const [selectedEntraUser, setSelectedEntraUser] = useState<EntraUser | null>(null);
  const entraDropdownRef = useRef<HTMLDivElement>(null);
  const entraSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { toast } = useToast();

  const { data: authData } = useQuery<{ user: { organizationId: string; role: string }; organization: { id: string; name: string } | null; activeOrganizationId: string | null }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });
  const activeOrgId = authData?.activeOrganizationId ?? authData?.organization?.id;

  const searchEntraDirectory = useCallback(async (q: string) => {
    if (!activeOrgId || q.length < 2) {
      setEntraResults([]);
      setShowEntraDropdown(false);
      return;
    }
    setEntraLoading(true);
    try {
      const res = await fetch(`/api/orgs/${activeOrgId}/entra-users?q=${encodeURIComponent(q)}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setEntraResults(data.users || []);
        setShowEntraDropdown((data.users || []).length > 0);
      } else {
        setEntraResults([]);
        setShowEntraDropdown(false);
      }
    } catch {
      setEntraResults([]);
      setShowEntraDropdown(false);
    } finally {
      setEntraLoading(false);
    }
  }, [activeOrgId]);

  const handleEntraSearchChange = (value: string) => {
    setEntraSearch(value);
    setSelectedEntraUser(null);
    if (entraSearchTimerRef.current) clearTimeout(entraSearchTimerRef.current);
    if (value.length >= 2) {
      entraSearchTimerRef.current = setTimeout(() => searchEntraDirectory(value), 300);
    } else {
      setEntraResults([]);
      setShowEntraDropdown(false);
    }
  };

  const selectEntraUser = (user: EntraUser) => {
    setSelectedEntraUser(user);
    setNewUserEmail(user.mail || user.userPrincipalName);
    setNewUserName(user.displayName);
    setEntraSearch(user.displayName);
    setShowEntraDropdown(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (entraDropdownRef.current && !entraDropdownRef.current.contains(e.target as Node)) {
        setShowEntraDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { data: users = [], isLoading } = useQuery<OrgUser[]>({
    queryKey: ["/api/auth/users"],
    queryFn: () => fetch("/api/auth/users", { credentials: "include" }).then(r => r.ok ? r.json() : []),
  });

  const canManageUsers = authData?.user && ["platform_owner", "tenant_admin"].includes(authData.user.role);
  const orgName = authData?.organization?.name || "your organization";

  const addUserMutation = useMutation({
    mutationFn: async (data: { email: string; name: string; role: string }) => {
      const res = await apiRequest("POST", "/api/auth/users/add", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      setAddUserOpen(false);
      setNewUserEmail("");
      setNewUserName("");
      setNewUserRole("viewer");
      toast({ title: "User added", description: "The user has been added to your organization." });
    },
    onError: (error: Error) => {
      const msg = error.message.includes(":") ? error.message.split(":").slice(1).join(":").trim() : error.message;
      let parsed = msg;
      try { parsed = JSON.parse(msg).error || msg; } catch {}
      toast({ title: "Failed to add user", description: parsed, variant: "destructive" });
    },
  });

  const editRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await apiRequest("PATCH", `/api/auth/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      setEditRoleOpen(false);
      setSelectedUser(null);
      toast({ title: "Role updated", description: "The user's role has been changed." });
    },
    onError: (error: Error) => {
      const msg = error.message.includes(":") ? error.message.split(":").slice(1).join(":").trim() : error.message;
      let parsed = msg;
      try { parsed = JSON.parse(msg).error || msg; } catch {}
      toast({ title: "Failed to update role", description: parsed, variant: "destructive" });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("PATCH", `/api/auth/users/${userId}/deactivate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      setDeactivateOpen(false);
      setSelectedUser(null);
      toast({ title: "User deactivated", description: "The user has been deactivated." });
    },
    onError: (error: Error) => {
      const msg = error.message.includes(":") ? error.message.split(":").slice(1).join(":").trim() : error.message;
      let parsed = msg;
      try { parsed = JSON.parse(msg).error || msg; } catch {}
      toast({ title: "Failed to deactivate user", description: parsed, variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("PATCH", `/api/auth/users/${userId}/reactivate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/users"] });
      setReactivateOpen(false);
      setSelectedUser(null);
      toast({ title: "User reactivated", description: "The user has been reactivated." });
    },
    onError: (error: Error) => {
      const msg = error.message.includes(":") ? error.message.split(":").slice(1).join(":").trim() : error.message;
      let parsed = msg;
      try { parsed = JSON.parse(msg).error || msg; } catch {}
      toast({ title: "Failed to reactivate user", description: parsed, variant: "destructive" });
    },
  });

  const filteredUsers = users.filter(u => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (u.name?.toLowerCase().includes(term) || u.email.toLowerCase().includes(term) || u.role.toLowerCase().includes(term));
  });

  const totalUsers = users.length;
  const adminCount = users.filter(u => isAdminRole(u.role)).length;
  const pendingCount = users.filter(u => !u.emailVerified).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">User Management</h1>
          <p className="text-muted-foreground mt-1">Manage users, roles, and access for {orgName}.</p>
        </div>
        {canManageUsers && (
          <div className="flex gap-3">
            <Button
              className="gap-2 shadow-md shadow-primary/20"
              onClick={() => setAddUserOpen(true)}
              data-testid="button-add-user"
            >
              <UserPlus className="w-4 h-4" />
              Add User
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold" data-testid="text-total-users">{totalUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">In {orgName}</p>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Org Admins</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary" data-testid="text-admin-count">{adminCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Full organization access</p>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Pending Verification</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-500" data-testid="text-pending-count">{pendingCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Email not yet verified</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50 shadow-xl">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Organization Users
            </CardTitle>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                data-testid="input-search-users"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex items-center justify-center p-12 text-muted-foreground">
              {searchTerm ? "No users match your search." : "No users found."}
            </div>
          ) : (
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="pl-6">User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Auth Provider</TableHead>
                <TableHead>Status</TableHead>
                {canManageUsers && <TableHead className="w-[50px]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => (
                <TableRow key={user.id} className="hover:bg-muted/10 transition-colors" data-testid={`row-user-${user.id}`}>
                  <TableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 bg-primary/10 text-primary">
                        <AvatarFallback className="text-xs">{getInitials(user.name, user.email)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{user.name || user.email.split("@")[0]}</div>
                        <div className="text-xs text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {isAdminRole(user.role) && <ShieldCheck className="w-3.5 h-3.5 text-primary" />}
                      {user.role === 'read_only_auditor' && <Key className="w-3.5 h-3.5 text-purple-500" />}
                      <span className={isAdminRole(user.role) ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                        {getRoleDisplay(user.role)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Badge variant="outline" className="text-[10px]">
                      {user.authProvider === 'entra' ? 'SSO (Entra ID)' : user.authProvider === 'local' ? 'Email/Password' : user.authProvider || 'Unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      user.emailVerified ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                      'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    }>
                      {user.emailVerified ? 'Active' : 'Pending'}
                    </Badge>
                  </TableCell>
                  {canManageUsers && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-user-actions-${user.id}`}>
                            <MoreVertical className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => { setSelectedUser(user); setEditRole(user.role); setEditRoleOpen(true); }}
                            data-testid={`button-edit-role-${user.id}`}
                          >
                            <ShieldCheck className="w-4 h-4 mr-2" />
                            Edit Role
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {user.emailVerified ? (
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => { setSelectedUser(user); setDeactivateOpen(true); }}
                              data-testid={`button-deactivate-${user.id}`}
                            >
                              <UserX className="w-4 h-4 mr-2" />
                              Deactivate User
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => { setSelectedUser(user); setReactivateOpen(true); }}
                              data-testid={`button-reactivate-${user.id}`}
                            >
                              <UserCheck className="w-4 h-4 mr-2" />
                              Reactivate User
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addUserOpen} onOpenChange={(open) => {
        setAddUserOpen(open);
        if (!open) {
          setEntraSearch("");
          setEntraResults([]);
          setShowEntraDropdown(false);
          setSelectedEntraUser(null);
          setNewUserEmail("");
          setNewUserName("");
          setNewUserRole("viewer");
        }
      }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Search your Entra ID directory to find and add users to {orgName}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2 relative" ref={entraDropdownRef}>
              <Label htmlFor="entra-search" className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-blue-500" />
                Search Entra Directory
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="entra-search"
                  placeholder="Start typing a name or email..."
                  className="pl-9 pr-9"
                  value={entraSearch}
                  onChange={(e) => handleEntraSearchChange(e.target.value)}
                  autoComplete="off"
                  data-testid="input-entra-search"
                />
                {entraLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
              {showEntraDropdown && entraResults.length > 0 && (
                <div className="absolute z-50 top-[calc(100%+4px)] left-0 right-0 bg-popover border border-border rounded-lg shadow-lg max-h-[240px] overflow-y-auto">
                  {entraResults.map((user) => (
                    <button
                      key={user.id}
                      className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/30 last:border-b-0"
                      onClick={() => selectEntraUser(user)}
                      data-testid={`entra-user-${user.id}`}
                    >
                      <Avatar className="h-8 w-8 bg-blue-500/10 text-blue-600 shrink-0 mt-0.5">
                        <AvatarFallback className="text-xs">{getInitials(user.displayName, user.userPrincipalName)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{user.displayName}</div>
                        <div className="text-xs text-muted-foreground truncate">{user.mail || user.userPrincipalName}</div>
                        {(user.jobTitle || user.department) && (
                          <div className="text-xs text-muted-foreground/70 truncate mt-0.5">
                            {[user.jobTitle, user.department].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {entraSearch.length >= 2 && !entraLoading && entraResults.length === 0 && !selectedEntraUser && (
                <p className="text-xs text-muted-foreground mt-1">No users found. You can still add manually below.</p>
              )}
            </div>

            {selectedEntraUser && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <Avatar className="h-9 w-9 bg-blue-500/10 text-blue-600">
                  <AvatarFallback className="text-xs">{getInitials(selectedEntraUser.displayName, selectedEntraUser.userPrincipalName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm">{selectedEntraUser.displayName}</div>
                  <div className="text-xs text-muted-foreground">{selectedEntraUser.mail || selectedEntraUser.userPrincipalName}</div>
                </div>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20 text-[10px] shrink-0">Entra ID</Badge>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                placeholder="user@example.com"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                data-testid="input-add-user-email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-name">Name</Label>
              <Input
                id="add-name"
                placeholder="Jane Doe"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                data-testid="input-add-user-name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="add-role">Role</Label>
              <Select value={newUserRole} onValueChange={setNewUserRole}>
                <SelectTrigger data-testid="select-add-user-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ZENITH_ROLES.filter(r => r.value !== 'platform_owner' || authData?.user?.role === 'platform_owner').map((role) => (
                    <SelectItem key={role.value} value={role.value} data-testid={`option-role-${role.value}`}>
                      <div className="flex flex-col">
                        <span>{role.label}</span>
                        <span className="text-xs text-muted-foreground">{role.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddUserOpen(false)} data-testid="button-cancel-add-user">
              Cancel
            </Button>
            <Button
              onClick={() => addUserMutation.mutate({ email: newUserEmail, name: newUserName, role: newUserRole })}
              disabled={!newUserEmail || addUserMutation.isPending}
              data-testid="button-confirm-add-user"
            >
              {addUserMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editRoleOpen} onOpenChange={setEditRoleOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Role</DialogTitle>
            <DialogDescription>
              Change the role for {selectedUser?.name || selectedUser?.email}.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Current Role</Label>
              <Badge variant="outline" className="w-fit">{getRoleDisplay(selectedUser?.role || '')}</Badge>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-role">New Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger data-testid="select-edit-role">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {ZENITH_ROLES.filter(r => r.value !== 'platform_owner' || authData?.user?.role === 'platform_owner').map((role) => (
                    <SelectItem key={role.value} value={role.value} data-testid={`option-edit-role-${role.value}`}>
                      <div className="flex flex-col">
                        <span>{role.label}</span>
                        <span className="text-xs text-muted-foreground">{role.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRoleOpen(false)} data-testid="button-cancel-edit-role">
              Cancel
            </Button>
            <Button
              onClick={() => selectedUser && editRoleMutation.mutate({ userId: selectedUser.id, role: editRole })}
              disabled={!editRole || editRole === selectedUser?.role || editRoleMutation.isPending}
              data-testid="button-confirm-edit-role"
            >
              {editRoleMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate <strong>{selectedUser?.name || selectedUser?.email}</strong>?
              They will lose access to {orgName} immediately.
              This action can be reversed by reactivating the user.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => selectedUser && deactivateMutation.mutate(selectedUser.id)}
              disabled={deactivateMutation.isPending}
              data-testid="button-confirm-deactivate"
            >
              {deactivateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reactivateOpen} onOpenChange={setReactivateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to reactivate <strong>{selectedUser?.name || selectedUser?.email}</strong>?
              They will regain access to {orgName} with their current role.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reactivate">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedUser && reactivateMutation.mutate(selectedUser.id)}
              disabled={reactivateMutation.isPending}
              data-testid="button-confirm-reactivate"
            >
              {reactivateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
