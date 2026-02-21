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
  Menu,
  ChevronRight,
  LogOut,
  User,
  SunMoon,
  Layers,
  Check,
  BrainCircuit,
  Library,
  LayoutTemplate,
  FileText,
  Box,
  Archive,
  CreditCard
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

interface AppShellProps {
  children: React.ReactNode;
}

const navGroups = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/app/dashboard", icon: LayoutDashboard },
      { name: "Provision", href: "/app/provision", icon: FolderPlus, badge: "3" },
    ]
  },
  {
    label: "Management",
    items: [
      { name: "Governance", href: "/app/governance", icon: ShieldCheck },
      { name: "Structures", href: "/app/structures", icon: Layers },
      { name: "Document Library", href: "/app/document-library", icon: Library },
      { name: "Content Types", href: "/app/content-types", icon: FileText },
      { name: "Embedded Containers", href: "/app/embedded-containers", icon: Box },
      { name: "Archive & Backup", href: "/app/archive-backup", icon: Archive },
      { name: "Syntex", href: "/app/syntex", icon: BrainCircuit },
      { name: "Purview", href: "/app/purview", icon: Fingerprint },
      { name: "Lifecycle", href: "/app/lifecycle", icon: Clock },
    ]
  },
  {
    label: "Insights",
    items: [
      { name: "Reports", href: "/app/reports", icon: BarChart3 },
    ]
  }
];

export default function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();

  const NavLinks = () => (
    <div className="space-y-6 py-4">
      {navGroups.map((group, i) => (
        <div key={i} className="space-y-2">
          <h4 className="px-4 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
            {group.label}
          </h4>
          <div className="space-y-1">
            {group.items.map((item) => {
              const isActive = location.startsWith(item.href);
              return (
                <Link key={item.name} href={item.href}>
                  <a className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive 
                      ? "bg-primary/10 text-primary shadow-sm shadow-primary/5" 
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}>
                    <div className="flex items-center gap-3">
                      <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : "text-muted-foreground/70"}`} />
                      {item.name}
                    </div>
                    {item.badge && (
                      <span className={`flex h-5 items-center justify-center rounded-full px-2 text-[10px] font-bold ${isActive ? 'bg-primary text-primary-foreground' : 'bg-primary/20 text-primary'}`}>
                        {item.badge}
                      </span>
                    )}
                  </a>
                </Link>
              );
            })}
          </div>
        </div>
      ))}

      <div className="space-y-2 pt-4 border-t border-border/50">
        <h4 className="px-4 text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">
          Administration
        </h4>
        <div className="space-y-1">
          <Link href="/app/admin">
            <a className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              location === "/app/admin" 
                ? "bg-primary/10 text-primary shadow-sm shadow-primary/5" 
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}>
              <div className="flex items-center gap-3">
                <LayoutTemplate className={`w-5 h-5 ${location === "/app/admin" ? "text-primary" : "text-muted-foreground/70"}`} />
                Provisioning Templates
              </div>
            </a>
          </Link>
          <Link href="/app/admin/plans">
            <a className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              location.startsWith("/app/admin/plans") 
                ? "bg-primary/10 text-primary shadow-sm shadow-primary/5" 
                : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}>
              <div className="flex items-center gap-3">
                <CreditCard className={`w-5 h-5 ${location.startsWith("/app/admin/plans") ? "text-primary" : "text-muted-foreground/70"}`} />
                Service Plans
              </div>
            </a>
          </Link>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col border-r border-border/40 bg-card/40 backdrop-blur-xl">
        <div className="h-16 flex items-center px-6 border-b border-border/40">
          <Link href="/app/dashboard" className="flex items-center gap-2 cursor-pointer group">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20 transition-transform group-hover:scale-105">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/80">Zenith</span>
          </Link>
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-hide">
          <NavLinks />
        </div>

        <div className="p-4 border-t border-border/40 bg-card/50">
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all">
            <BookOpen className="w-5 h-5 text-muted-foreground/70" />
            Documentation
            <ChevronRight className="w-4 h-4 ml-auto opacity-50" />
          </a>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-16 border-b border-border/40 bg-background/80 backdrop-blur-md flex items-center justify-between px-4 lg:px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden -ml-2">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 border-r-border/40 bg-card/95 backdrop-blur-xl">
                <div className="h-16 flex items-center px-6 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-xl tracking-tight">Zenith</span>
                  </div>
                </div>
                <div className="px-4 py-2 overflow-y-auto h-[calc(100vh-4rem)]">
                  <NavLinks />
                  <div className="mt-8 pt-4 border-t border-border/40">
                    <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-all">
                      <BookOpen className="w-5 h-5 text-muted-foreground/70" />
                      Documentation
                    </a>
                  </div>
                </div>
              </SheetContent>
            </Sheet>

            {/* Master Selectors */}
            <div className="hidden md:flex items-center bg-card/40 border border-border/50 rounded-full shadow-sm p-0.5 backdrop-blur-md transition-colors hover:border-border/80">
              
              {/* Company Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 rounded-full px-3 hover:bg-muted/60 data-[state=open]:bg-muted/60">
                    <Building2 className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-sm leading-none text-foreground">Synozur</span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground opacity-50 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-60 rounded-xl p-2">
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">Company</DropdownMenuLabel>
                  <DropdownMenuSeparator className="mb-2 mt-1" />
                  <DropdownMenuItem className="flex justify-between rounded-lg p-2.5 bg-primary/10 cursor-default">
                    <div className="flex items-center gap-2.5">
                      <div className="w-6 h-6 rounded bg-primary/20 flex items-center justify-center">
                        <Building2 className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="font-semibold text-primary">Synozur</span>
                    </div>
                    <Check className="w-4 h-4 text-primary" />
                  </DropdownMenuItem>
                  <DropdownMenuItem className="flex items-center gap-2.5 rounded-lg p-2.5 cursor-pointer text-muted-foreground hover:text-foreground mt-1">
                    <div className="w-6 h-6 rounded bg-muted flex items-center justify-center">
                      <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <span className="font-medium">Contoso Corp</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-2" />
                  <DropdownMenuItem asChild className="rounded-lg p-2.5 cursor-pointer group">
                    <Link href="/app/add-tenant" className="flex items-center text-primary font-medium">
                      <FolderPlus className="w-4 h-4 mr-2" />
                      Connect new company...
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="w-px h-5 bg-border/80 mx-0.5"></div>

              {/* Environment Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-9 gap-2 rounded-full px-3 hover:bg-muted/60 data-[state=open]:bg-muted/60">
                    <Layers className="w-4 h-4 text-secondary" />
                    <span className="font-medium text-sm leading-none text-muted-foreground">PROD</span>
                    <ChevronDown className="w-3 h-3 text-muted-foreground opacity-50 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52 rounded-xl p-2">
                  <DropdownMenuLabel className="text-xs text-muted-foreground uppercase tracking-wider">Environment</DropdownMenuLabel>
                  <DropdownMenuSeparator className="mb-2 mt-1" />
                  <DropdownMenuItem className="flex justify-between rounded-lg p-2.5 bg-secondary/10 cursor-default">
                    <span className="font-semibold text-secondary">PROD</span>
                    <Badge variant="default" className="text-[10px] bg-secondary text-secondary-foreground hover:bg-secondary uppercase tracking-wider h-5 px-1.5 shadow-sm shadow-secondary/20">Active</Badge>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-lg p-2.5 cursor-pointer text-muted-foreground hover:text-foreground mt-1">
                    <span className="font-medium">TEST</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-lg p-2.5 cursor-pointer text-muted-foreground hover:text-foreground">
                    <span className="font-medium">SANDBOX</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="my-2" />
                  <DropdownMenuItem asChild className="rounded-lg p-2.5 cursor-pointer group">
                    <Link href="/app/admin" className="flex items-center text-muted-foreground">
                      <Settings className="w-4 h-4 mr-2" />
                      Manage environments
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="relative hidden md:block w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search resources..."
                className="h-10 pl-9 pr-12 bg-muted/40 border-border/50 rounded-full focus-visible:ring-primary/30 focus-visible:border-primary/50 transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <kbd className="inline-flex h-5 items-center gap-1 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </div>
            </div>

            <Button variant="ghost" size="icon" className="rounded-full relative hover:bg-muted">
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="absolute top-2 right-2.5 w-2 h-2 bg-primary rounded-full border-2 border-background"></span>
            </Button>

            <div className="h-6 w-px bg-border/50 mx-1 hidden sm:block"></div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full p-0">
                  <Avatar className="h-10 w-10 border-2 border-background shadow-sm hover:border-primary/20 transition-colors">
                    <AvatarImage src="https://github.com/shadcn.png" alt="User" />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold">AD</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60 rounded-xl p-2">
                <DropdownMenuLabel className="font-normal p-3">
                  <div className="flex flex-col space-y-1.5">
                    <p className="text-sm font-semibold leading-none">Admin User</p>
                    <p className="text-xs leading-none text-muted-foreground">
                      admin@synozur.demo
                    </p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="mb-2" />
                <DropdownMenuGroup className="space-y-1">
                  <DropdownMenuItem className="rounded-lg cursor-pointer p-2.5">
                    <User className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>Profile Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="rounded-lg cursor-pointer p-2.5">
                    <SunMoon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>Toggle Theme</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator className="my-2" />
                <DropdownMenuItem asChild className="rounded-lg cursor-pointer p-2.5 text-destructive focus:text-destructive focus:bg-destructive/10">
                  <Link href="/" className="flex items-center">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Sign out</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-background/50 p-4 sm:p-6 lg:p-8">
          <div className="max-w-[1600px] mx-auto">
            {children}
          </div>
        </div>

        {/* Global Help Button */}
        <div className="fixed bottom-6 right-6 z-50">
          <Button size="icon" className="h-14 w-14 rounded-full shadow-xl shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground transition-transform hover:scale-105">
            <HelpCircle className="w-6 h-6" />
          </Button>
        </div>
      </main>
    </div>
  );
}

// Needed to wrap badge component inside dropdowns properly
function Badge({ className, variant, ...props }: any) {
  return <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variant === 'secondary' ? 'border-transparent bg-secondary/80 text-secondary-foreground' : variant === 'outline' ? 'text-foreground border-border/50' : 'border-transparent bg-primary text-primary-foreground'} ${className}`} {...props} />;
}