import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Users, 
  Search, 
  UserPlus, 
  ShieldCheck, 
  MoreVertical,
  Mail,
  Key,
  Loader2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";

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

function getRoleDisplay(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
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

  const { data: authData } = useQuery<{ user: { organizationId: string }; organization: { name: string } | null }>({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : null),
  });

  const { data: users = [], isLoading } = useQuery<OrgUser[]>({
    queryKey: ["/api/auth/users"],
    queryFn: () => fetch("/api/auth/users", { credentials: "include" }).then(r => r.ok ? r.json() : []),
  });

  const orgName = authData?.organization?.name || "your organization";

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
        <div className="flex gap-3">
          <Button variant="outline" className="gap-2" data-testid="button-invite-users">
            <Mail className="w-4 h-4" />
            Invite Users
          </Button>
          <Button className="gap-2 shadow-md shadow-primary/20" data-testid="button-add-user">
            <UserPlus className="w-4 h-4" />
            Add User
          </Button>
        </div>
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
                <TableHead className="w-[50px]"></TableHead>
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
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-user-actions-${user.id}`}>
                          <MoreVertical className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>Edit Roles</DropdownMenuItem>
                        <DropdownMenuItem>Reset Password</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">Deactivate User</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
