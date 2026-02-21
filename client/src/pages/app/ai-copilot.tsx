import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Sparkles, 
  MessageSquare, 
  Bot, 
  ShieldCheck, 
  Settings2, 
  Send,
  Zap,
  Globe,
  Database,
  Lock,
  Search,
  CheckCircle2,
  FileSearch,
  LayoutTemplate
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function AICopilotIntegration() {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState([
    {
      role: "assistant",
      content: "Hi! I'm Zenith AI. I can help you provision workspaces, explain governance policies, or check Copilot readiness across your tenant. What would you like to do?",
      time: "10:00 AM"
    },
    {
      role: "user",
      content: "Create a project team for Finance with external auditors",
      time: "10:01 AM"
    },
    {
      role: "assistant",
      content: "I can help with that. Since this involves Finance and external auditors, our 'Highly Confidential Data Safeguard' policy requires this to be a Private Team with 'Confidential' sensitivity. \n\nI've prepared a provisioning request draft for you. Would you like me to submit it for approval?",
      time: "10:01 AM",
      action: "Draft Ready"
    }
  ]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setChatHistory([...chatHistory, {
      role: "user",
      content: message,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    
    const currentMessage = message;
    setMessage("");

    // Simulate AI response
    setTimeout(() => {
      let response = "I understand you're asking about governance. Let me check the policies for that.";
      let action = null;
      
      if (currentMessage.toLowerCase().includes("why can't copilot")) {
        response = "This SharePoint site is excluded from Copilot because it is tagged as 'Highly Confidential' and contains an active Information Barrier policy. Zenith automatically mapped these metadata tags to Purview exclusion scopes.";
        action = "View Policy Details";
      } else if (currentMessage.toLowerCase().includes("renewal")) {
        response = "You have 4 workspaces up for renewal this week. The 'Mergers & Acquisitions' Team is the most urgent, expiring in 2 days. Would you like me to send a reminder to the owners?";
        action = "Send Reminders";
      }

      setChatHistory(prev => [...prev, {
        role: "assistant",
        content: response,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        ...(action && { action })
      }]);
    }, 1000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-3xl font-bold tracking-tight">AI & Copilot Integration</h1>
          </div>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Configure Zenith's agent skills and test the Copilot Extension experience. Zenith assists with intent interpretation and policy explanation, without monitoring behavior.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Agent Skills Configuration */}
        <div className="lg:col-span-7 space-y-6">
          <Card className="glass-panel border-border/50 shadow-xl">
            <CardHeader className="pb-4 border-b border-border/40 bg-muted/10">
              <CardTitle className="text-lg flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-primary" />
                Exposed Agent Skills
              </CardTitle>
              <CardDescription>
                Manage which Zenith capabilities can be called by Microsoft 365 Copilot, Vega, or other external agents. All actions are permission-scoped and auditable.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/40">
                <div className="p-4 flex items-start justify-between hover:bg-muted/5 transition-colors">
                  <div className="space-y-1 pr-6">
                    <div className="flex items-center gap-2">
                      <LayoutTemplate className="w-4 h-4 text-blue-500" />
                      <h3 className="font-semibold text-sm">Provision</h3>
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Allows agents to interpret user requests like "create a project team" and map them to Zenith provisioning templates and naming policies.
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>
                
                <div className="p-4 flex items-start justify-between hover:bg-muted/5 transition-colors">
                  <div className="space-y-1 pr-6">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      <h3 className="font-semibold text-sm">Validate</h3>
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Checks if a requested action (e.g., adding an external guest) violates any declarative governance policies before execution.
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="p-4 flex items-start justify-between hover:bg-muted/5 transition-colors">
                  <div className="space-y-1 pr-6">
                    <div className="flex items-center gap-2">
                      <FileSearch className="w-4 h-4 text-purple-500" />
                      <h3 className="font-semibold text-sm">Explain</h3>
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Translates complex Purview rules or Zenith policies into natural language when a user asks "Why can't I share this?" or "Why is this blocked?".
                    </p>
                  </div>
                  <Switch defaultChecked />
                </div>

                <div className="p-4 flex items-start justify-between hover:bg-muted/5 transition-colors">
                  <div className="space-y-1 pr-6">
                    <div className="flex items-center gap-2">
                      <Search className="w-4 h-4 text-amber-500" />
                      <h3 className="font-semibold text-sm">Report & Recommend</h3>
                      <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground border-border">Disabled</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Allows querying of lifecycle states ("Which sites are up for renewal?") and surfacing of governance narratives.
                    </p>
                  </div>
                  <Switch />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="glass-panel border-border/50">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <div className="text-sm font-bold">M365 Copilot</div>
                  <div className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Connected</div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel border-border/50">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <div className="text-sm font-bold">Vega Agent</div>
                  <div className="text-xs text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Connected</div>
                </div>
              </CardContent>
            </Card>
            <Card className="glass-panel border-border/50 border-dashed bg-muted/5">
              <CardContent className="p-4 flex items-center justify-center h-full">
                <Button variant="ghost" className="text-muted-foreground text-sm gap-2">
                  <Lock className="w-4 h-4" /> API Keys
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column: Copilot Extension Simulator */}
        <div className="lg:col-span-5">
          <Card className="glass-panel border-border/50 shadow-2xl flex flex-col h-[600px] relative overflow-hidden">
            
            {/* Simulator Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 flex items-center gap-3 border-b border-white/10 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">Zenith AI Simulator</h3>
                <p className="text-[10px] text-slate-300">Testing Copilot Extension UX</p>
              </div>
            </div>

            {/* Chat Area */}
            <ScrollArea className="flex-1 p-4 bg-slate-50/50 dark:bg-black/20">
              <div className="space-y-4 pb-4">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'}`}>
                    <div className={`p-3 rounded-2xl text-sm shadow-sm ${
                      msg.role === 'user' 
                        ? 'bg-primary text-primary-foreground rounded-br-none' 
                        : 'bg-background border border-border/50 rounded-bl-none'
                    }`}>
                      <span className="whitespace-pre-wrap">{msg.content}</span>
                      
                      {msg.action && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <Button size="sm" variant={msg.action === 'Draft Ready' ? 'default' : 'outline'} className="w-full h-8 text-xs font-semibold shadow-sm">
                            {msg.action}
                          </Button>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 px-1">{msg.time}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>

            {/* Input Area */}
            <div className="p-3 border-t border-border/50 bg-background/80 backdrop-blur-sm shrink-0">
              <form onSubmit={handleSendMessage} className="relative flex items-center">
                <Input 
                  placeholder="Ask Zenith about governance or provisioning..." 
                  className="pr-10 rounded-full bg-background border-border/50 shadow-inner h-10 text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <Button 
                  type="submit" 
                  size="icon" 
                  className="absolute right-1 w-8 h-8 rounded-full"
                  disabled={!message.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
              <div className="flex gap-2 mt-2 px-1 overflow-x-auto no-scrollbar">
                <Badge variant="secondary" className="text-[10px] cursor-pointer whitespace-nowrap hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => setMessage("Why can't Copilot use this site?")}>Why can't Copilot use this site?</Badge>
                <Badge variant="secondary" className="text-[10px] cursor-pointer whitespace-nowrap hover:bg-primary/10 hover:text-primary transition-colors" onClick={() => setMessage("Which sites are up for renewal?")}>Which sites are up for renewal?</Badge>
              </div>
            </div>

          </Card>
        </div>

      </div>
    </div>
  );
}