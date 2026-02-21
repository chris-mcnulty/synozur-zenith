import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  FolderPlus, 
  ShieldCheck, 
  Fingerprint, 
  Clock, 
  BarChart3, 
  Settings,
  HelpCircle,
  BookOpen,
  Bell,
  Search,
  ChevronDown,
  Building2,
  Menu
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface AppShellProps {
  children: React.ReactNode;
}

const navItems = [
  { name: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
  { name: "Provision", href: "/app/provision", icon: FolderPlus },
  { name: "Governance", href: "/app/governance", icon: ShieldCheck },
  { name: "Purview", href: "/app/purview", icon: Fingerprint },
  { name: "Lifecycle", href: "/app/lifecycle", icon: Clock },
  { name: "Reports", href: "/app/reports", icon: BarChart3 },
];

export default function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();

  const NavLinks = () => (
    <>
      <div className="space-y-1 py-4">
        {navItems.map((item) => {
          const isActive = location.startsWith(item.href);
          return (
            <Link key={item.name} href={item.href}>
              <a className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
                <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                {item.name}
              </a>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 space-y-1">
        <h4 className="px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Administration
        </h4>
        <Link href="/app/admin">
          <a className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            location.startsWith("/app/admin") 
              ? "bg-primary/10 text-primary" 
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}>
            <Settings className="w-5 h-5" />
            Admin Center
          </a>
        </Link>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-card/50 backdrop-blur-xl">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-2 text-primary">
            <ShieldCheck className="w-6 h-6" />
            <span className="font-bold text-lg tracking-tight text-foreground">Zenith</span>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks />
        </div>

        <div className="p-4 border-t border-border mt-auto">
          <a href="#" className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <BookOpen className="w-4 h-4" />
            User Guide
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-background/80 backdrop-blur-md flex items-center justify-between px-4 sm:px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden -ml-2">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <div className="h-16 flex items-center px-6 border-b border-border">
                  <div className="flex items-center gap-2 text-primary">
                    <ShieldCheck className="w-6 h-6" />
                    <span className="font-bold text-lg tracking-tight text-foreground">Zenith</span>
                  </div>
                </div>
                <div className="px-3 py-4">
                  <NavLinks />
                </div>
              </SheetContent>
            </Sheet>

            {/* Tenant / Env Selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 gap-2 border-border/50 bg-muted/30 hidden sm:flex">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">Synozur Demo</span>
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">PROD</Badge>
                  <ChevronDown className="w-4 h-4 text-muted-foreground ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Tenant & Environment</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="flex justify-between">
                  <span>Synozur Demo</span>
                  <Badge variant="outline">PROD</Badge>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex justify-between text-muted-foreground">
                  <span>Synozur Demo</span>
                  <Badge variant="outline">TEST</Badge>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/app/select-tenant" className="cursor-pointer text-primary">
                    Change Tenant...
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative hidden lg:block w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search workspaces..."
                className="h-9 pl-9 bg-muted/30 border-border/50 rounded-full"
              />
            </div>

            <Button variant="ghost" size="icon" className="rounded-full relative">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-background"></span>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-full ml-1">
                  <Avatar className="h-9 w-9 border border-border/50">
                    <AvatarImage src="https://github.com/shadcn.png" alt="User" />
                    <AvatarFallback>AD</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">Admin User</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      admin@synozur.demo
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Profile Settings</DropdownMenuItem>
                <DropdownMenuItem>Theme (Dark)</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/" className="cursor-pointer text-destructive">
                    Sign out
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-muted/10 p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>

        {/* Global Help Button */}
        <div className="fixed bottom-6 right-6 z-50">
          <Button size="icon" className="h-12 w-12 rounded-full shadow-lg shadow-primary/20">
            <HelpCircle className="w-6 h-6" />
          </Button>
        </div>
      </main>
    </div>
  );
}

// Needed to wrap badge component inside dropdowns properly
function Badge({ className, variant, ...props }: any) {
  return <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variant === 'secondary' ? 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80' : 'text-foreground'} ${className}`} {...props} />;
}