import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Layers, GitMerge, Search, Filter, Globe, Users, Hash, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";

const structures = [
  { id: 1, name: "Global Intranet Hub", type: "Hub Site", children: 12, status: "Active", admin: "Corporate Comms" },
  { id: 2, name: "Sales & Marketing", type: "Department", children: 8, status: "Active", admin: "VP Sales" },
  { id: 3, name: "Engineering & Product", type: "Department", children: 24, status: "Active", admin: "CTO Office" },
  { id: 4, name: "Project Phoenix", type: "Project", children: 3, status: "Archived", admin: "PMO" },
];

export default function StructuresPage() {
  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Site Structures</h1>
          <p className="text-muted-foreground mt-1">Manage organizational hierarchy, hub sites, and navigational architecture.</p>
        </div>
        <div className="flex gap-3">
          <Button className="gap-2 shadow-md shadow-primary/20">
            <GitMerge className="w-4 h-4" />
            Create Hub Association
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Total Hub Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">14</div>
            <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">+2 this month</p>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Associated Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">342</div>
            <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">+18 this month</p>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Orphaned Sites</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">28</div>
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1">Requires review</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-panel border-border/50 shadow-xl">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-xl flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              Architecture Map
            </CardTitle>
            <div className="flex gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search structures..."
                  className="pl-9 h-9 bg-background/50 rounded-lg border-border/50"
                />
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <Filter className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/40">
            {structures.map((item) => (
              <div key={item.id} className="p-4 hover:bg-muted/10 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center border border-border/50 ${
                    item.type === 'Hub Site' ? 'bg-primary/10 text-primary' : 
                    item.type === 'Department' ? 'bg-blue-500/10 text-blue-500' : 
                    'bg-purple-500/10 text-purple-500'
                  }`}>
                    {item.type === 'Hub Site' ? <Globe className="w-5 h-5" /> : 
                     item.type === 'Department' ? <Users className="w-5 h-5" /> : 
                     <Hash className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold">{item.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>{item.type}</span>
                      <span>•</span>
                      <span>{item.children} associated sites</span>
                      <span>•</span>
                      <span>Managed by {item.admin}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={item.status === 'Active' ? 'default' : 'secondary'} className={
                    item.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 shadow-none border-emerald-500/20' : ''
                  }>
                    {item.status}
                  </Badge>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
