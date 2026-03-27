import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { 
  Sparkles, 
  MessageSquare, 
  Bot, 
  ShieldCheck, 
  Settings2, 
  Send,
  Globe,
  Lock,
  Search,
  CheckCircle2,
  FileSearch,
  LayoutTemplate,
  Loader2,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTenant } from "@/lib/tenant-context";

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
  time: string;
  action?: string | null;
  isLoading?: boolean;
};

const SUGGESTIONS = [
  "Which sites are overdue for review?",
  "How many orphaned workspaces?",
  "What's my Copilot readiness?",
  "Give me a governance summary",
  "Which sites have external sharing?",
  "What sensitivity labels are in use?",
];

function renderContent(content: string) {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

const INITIAL_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "Hi! I'm the **Zenith AI Governance Assistant**. I can answer governance questions using your live workspace inventory — no hallucinations, just real data.\n\nTry asking me about lifecycle reviews, Copilot readiness, orphaned sites, or external sharing risks.",
  time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
};

export default function AICopilotIntegration() {
  const [message, setMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([INITIAL_MESSAGE]);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { selectedTenant } = useTenant();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isSending) return;
    const userMsg: ChatMessage = {
      role: "user",
      content: text.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    const loadingMsg: ChatMessage = {
      role: "assistant",
      content: "",
      time: "",
      isLoading: true,
    };
    setChatHistory(prev => [...prev, userMsg, loadingMsg]);
    setMessage("");
    setIsSending(true);

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          tenantConnectionId: selectedTenant?.id,
        }),
      });

      if (!res.ok) throw new Error("Chat request failed");
      const data = await res.json();

      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.content ?? "I couldn't process that request.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        action: data.action ?? null,
      };

      setChatHistory(prev => {
        const without = prev.filter(m => !m.isLoading);
        return [...without, assistantMsg];
      });
    } catch {
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: "I'm having trouble connecting to the governance data. Please check your session and try again.",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatHistory(prev => {
        const without = prev.filter(m => !m.isLoading);
        return [...without, errorMsg];
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(message);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI & Copilot Integration</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Configure Zenith's agent skills and test the Copilot Extension experience. Zenith assists with intent interpretation and policy explanation, without monitoring behavior.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
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
                {[
                  {
                    icon: <LayoutTemplate className="w-4 h-4 text-blue-500" />,
                    name: "Provision",
                    desc: `Allows agents to interpret user requests like "create a project team" and map them to Zenith provisioning templates and naming policies.`,
                    enabled: true,
                  },
                  {
                    icon: <ShieldCheck className="w-4 h-4 text-emerald-500" />,
                    name: "Validate",
                    desc: "Checks if a requested action (e.g., adding an external guest) violates any declarative governance policies before execution.",
                    enabled: true,
                  },
                  {
                    icon: <FileSearch className="w-4 h-4 text-purple-500" />,
                    name: "Explain",
                    desc: `Translates complex Purview rules or Zenith policies into natural language when a user asks "Why can't I share this?" or "Why is this blocked?".`,
                    enabled: true,
                  },
                  {
                    icon: <Search className="w-4 h-4 text-amber-500" />,
                    name: "Report & Recommend",
                    desc: `Allows querying of lifecycle states ("Which sites are up for renewal?") and surfacing of governance narratives.`,
                    enabled: false,
                  },
                ].map((skill) => (
                  <div key={skill.name} className="p-4 flex items-start justify-between hover:bg-muted/5 transition-colors">
                    <div className="space-y-1 pr-6">
                      <div className="flex items-center gap-2">
                        {skill.icon}
                        <h3 className="font-semibold text-sm">{skill.name}</h3>
                        <Badge variant="outline" className={`text-[10px] ${skill.enabled ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                          {skill.enabled ? "Active" : "Disabled"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{skill.desc}</p>
                    </div>
                    <Switch defaultChecked={skill.enabled} data-testid={`switch-skill-${skill.name.toLowerCase()}`} />
                  </div>
                ))}
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
                <Button variant="ghost" className="text-muted-foreground text-sm gap-2" disabled>
                  <Lock className="w-4 h-4" /> API Keys
                </Button>
              </CardContent>
            </Card>
          </div>

          <Card className="glass-panel border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                Governance Context Source
              </CardTitle>
              <CardDescription className="text-xs">
                All AI responses are grounded in live Zenith workspace inventory — not external knowledge bases.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "Live workspace inventory", description: "Real-time from connected tenants", active: true },
                { label: "Active governance policies", description: "Evaluated policy definitions", active: true },
                { label: "Sensitivity label metadata", description: "From SharePoint + Purview", active: true },
                { label: "Microsoft Graph / Entra ID", description: "Owner and group membership", active: true },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/40">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${item.active ? "bg-emerald-500" : "bg-muted"}`} />
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  {item.active && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</Badge>}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-5">
          <Card className="glass-panel border-border/50 shadow-2xl flex flex-col h-[650px] relative overflow-hidden">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-4 flex items-center gap-3 border-b border-white/10 shrink-0">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">Zenith AI Governance Assistant</h3>
                <p className="text-[10px] text-slate-300 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Grounded in live workspace inventory
                </p>
              </div>
              {selectedTenant && (
                <div className="ml-auto">
                  <Badge className="bg-white/10 text-white border-white/20 text-[10px]">
                    <Globe className="w-2.5 h-2.5 mr-1" />
                    {selectedTenant.tenantName ?? selectedTenant.domain}
                  </Badge>
                </div>
              )}
            </div>

            <div
              ref={scrollRef}
              className="flex-1 p-4 bg-slate-50/50 dark:bg-black/20 overflow-y-auto space-y-4"
              data-testid="chat-scroll-area"
            >
              {chatHistory.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col max-w-[88%] ${msg.role === "user" ? "ml-auto items-end" : "mr-auto items-start"}`}
                  data-testid={`chat-message-${i}`}
                >
                  {msg.isLoading ? (
                    <div className="p-3 rounded-2xl bg-background border border-border/50 rounded-bl-none shadow-sm flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Analysing governance data...
                    </div>
                  ) : (
                    <div className={`p-3 rounded-2xl text-sm shadow-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : "bg-background border border-border/50 rounded-bl-none"
                    }`}>
                      <span className="whitespace-pre-wrap leading-relaxed">
                        {renderContent(msg.content)}
                      </span>
                      {msg.action && (
                        <div className="mt-3 pt-3 border-t border-border/30">
                          {msg.action === "View Lifecycle Review" ? (
                            <Button size="sm" variant="default" className="w-full h-8 text-xs font-semibold shadow-sm" asChild>
                              <Link href="/app/lifecycle-review">{msg.action}</Link>
                            </Button>
                          ) : msg.action === "View Copilot Readiness Report" ? (
                            <Button size="sm" variant="default" className="w-full h-8 text-xs font-semibold shadow-sm" asChild>
                              <Link href="/app/governance">{msg.action}</Link>
                            </Button>
                          ) : msg.action === "Review Orphaned Workspaces" ? (
                            <Button size="sm" variant="default" className="w-full h-8 text-xs font-semibold shadow-sm" asChild>
                              <Link href="/app/lifecycle-review">{msg.action}</Link>
                            </Button>
                          ) : msg.action === "Manage Policies" ? (
                            <Button size="sm" variant="outline" className="w-full h-8 text-xs font-semibold shadow-sm" asChild>
                              <Link href="/app/admin/policies">{msg.action}</Link>
                            </Button>
                          ) : msg.action === "Start Provisioning" ? (
                            <Button size="sm" variant="default" className="w-full h-8 text-xs font-semibold shadow-sm" asChild>
                              <Link href="/app/governance">{msg.action}</Link>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="w-full h-8 text-xs font-semibold shadow-sm" disabled>
                              {msg.action}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {!msg.isLoading && msg.time && (
                    <span className="text-[10px] text-muted-foreground mt-1 px-1">{msg.time}</span>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-border/50 bg-background/80 backdrop-blur-sm shrink-0">
              <form onSubmit={handleSubmit} className="relative flex items-center">
                <Input
                  placeholder="Ask about governance, lifecycle, Copilot readiness..."
                  className="pr-10 rounded-full bg-background border-border/50 shadow-inner h-10 text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={isSending}
                  data-testid="input-chat-message"
                />
                <Button
                  type="submit"
                  size="icon"
                  className="absolute right-1 w-8 h-8 rounded-full"
                  disabled={!message.trim() || isSending}
                  data-testid="button-send-message"
                >
                  {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </Button>
              </form>
              <div className="flex gap-2 mt-2 px-1 overflow-x-auto no-scrollbar pb-0.5">
                {SUGGESTIONS.map((s) => (
                  <Badge
                    key={s}
                    variant="secondary"
                    className="text-[10px] cursor-pointer whitespace-nowrap hover:bg-primary/10 hover:text-primary transition-colors shrink-0"
                    onClick={() => !isSending && sendMessage(s)}
                    data-testid={`suggestion-${s.substring(0, 10)}`}
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
