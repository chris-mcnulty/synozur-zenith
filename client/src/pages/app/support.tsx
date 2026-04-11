import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Map,
  FileText,
  BookOpen,
  ListTodo,
  ChevronRight,
  Loader2,
  AlertCircle,
  Calendar,
  Info,
  Shield,
  Globe,
  Mail,
  ExternalLink,
  Building2,
  Layers,
  CheckCircle2,
  TicketIcon,
  Plus,
  ArrowLeft,
  Send,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface DocMeta {
  filename: string;
  slug: string;
  exists: boolean;
  lastModified: string | null;
}

interface SupportTicket {
  id: string;
  ticketNumber: number;
  organizationId: string;
  userId: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  assignedTo: string | null;
  applicationSource: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SupportTicketReply {
  id: string;
  ticketId: string;
  userId: string;
  message: string;
  isInternal: boolean;
  createdAt: string;
  authorName?: string;
  authorEmail?: string;
}

interface TicketDetail {
  ticket: SupportTicket;
  replies: SupportTicketReply[];
}

const DOC_TABS = [
  { slug: "tickets", label: "Support Tickets", icon: TicketIcon, filename: null, description: "Submit and track support requests", isDoc: false },
  { slug: "roadmap", label: "Roadmap", icon: Map, filename: "ROADMAP.md", description: "Strategic product direction and planned features", isDoc: true },
  { slug: "changelog", label: "What's New", icon: FileText, filename: "CHANGELOG.md", description: "Version history and release notes", isDoc: true },
  { slug: "user_guide", label: "User Guide", icon: BookOpen, filename: "USER_GUIDE.md", description: "Complete feature documentation and workflows", isDoc: true },
  { slug: "backlog", label: "Backlog", icon: ListTodo, filename: "BACKLOG.md", description: "Prioritized feature and enhancement requests", isDoc: true },
  { slug: "about", label: "About Zenith", icon: Info, filename: null, description: "Platform information, version details, and support contacts", isDoc: false },
];

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function statusBadge(status: string) {
  switch (status) {
    case "open":
      return <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/20 hover:bg-blue-500/20">{status}</Badge>;
    case "in_progress":
      return <Badge className="bg-yellow-500/15 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20">in progress</Badge>;
    case "resolved":
      return <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20">{status}</Badge>;
    case "closed":
      return <Badge variant="secondary">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function priorityBadge(priority: string) {
  switch (priority) {
    case "high":
      return <Badge variant="destructive" className="text-xs">{priority}</Badge>;
    case "medium":
      return <Badge variant="secondary" className="text-xs">{priority}</Badge>;
    case "low":
      return <Badge variant="outline" className="text-xs">{priority}</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{priority}</Badge>;
  }
}

function categoryLabel(cat: string) {
  const map: Record<string, string> = {
    bug: "Bug",
    feature_request: "Feature Request",
    question: "Question",
    feedback: "Feedback",
  };
  return map[cat] ?? cat;
}

// ── TicketList ────────────────────────────────────────────────────────────────
function TicketList({
  tickets,
  isLoading,
  onSelect,
  onNew,
}: {
  tickets: SupportTicket[];
  isLoading: boolean;
  onSelect: (t: SupportTicket) => void;
  onNew: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base" data-testid="text-ticket-list-title">My Tickets</h3>
        <Button size="sm" onClick={onNew} data-testid="button-new-ticket">
          <Plus className="w-4 h-4 mr-1.5" />
          New Ticket
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16" data-testid="status-tickets-loading">
          <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
          <span className="text-muted-foreground text-sm">Loading tickets…</span>
        </div>
      )}

      {!isLoading && tickets.length === 0 && (
        <div className="text-center py-16" data-testid="status-tickets-empty">
          <TicketIcon className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">No tickets yet.</p>
          <p className="text-muted-foreground/60 text-xs mt-1">Click "New Ticket" to get started.</p>
        </div>
      )}

      {!isLoading && tickets.map((t) => (
        <button
          key={t.id}
          onClick={() => onSelect(t)}
          data-testid={`card-ticket-${t.id}`}
          className="w-full text-left glass-panel border border-border/50 rounded-xl p-4 hover:border-primary/30 hover:bg-card/60 transition-all"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs text-muted-foreground font-mono" data-testid={`text-ticket-number-${t.id}`}>#{t.ticketNumber}</span>
                <Badge variant="outline" className="text-xs">{categoryLabel(t.category)}</Badge>
                {priorityBadge(t.priority)}
                {statusBadge(t.status)}
              </div>
              <p className="font-medium text-sm truncate" data-testid={`text-ticket-subject-${t.id}`}>{t.subject}</p>
            </div>
            <div className="text-[10px] text-muted-foreground/50 shrink-0 mt-1">
              {new Date(t.createdAt).toLocaleDateString()}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ── NewTicketForm ─────────────────────────────────────────────────────────────
function NewTicketForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (ticket: SupportTicket) => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    category: "",
    subject: "",
    description: "",
    priority: "medium",
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/support/tickets", data);
      return res.json() as Promise<SupportTicket>;
    },
    onSuccess: (ticket) => {
      toast({ title: "Ticket created", description: `Ticket #${ticket.ticketNumber} submitted.` });
      onCreated(ticket);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create ticket.", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.category || !form.subject || !form.description) return;
    mutation.mutate(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-testid="form-new-ticket">
      <div className="flex items-center gap-2 mb-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} data-testid="button-cancel-new-ticket">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
        <h3 className="font-semibold text-base">Submit New Ticket</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="ticket-category">Category</Label>
          <Select
            value={form.category}
            onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
          >
            <SelectTrigger id="ticket-category" data-testid="select-ticket-category">
              <SelectValue placeholder="Select category…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bug">Bug</SelectItem>
              <SelectItem value="feature_request">Feature Request</SelectItem>
              <SelectItem value="question">Question</SelectItem>
              <SelectItem value="feedback">Feedback</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ticket-priority">Priority</Label>
          <Select
            value={form.priority}
            onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}
          >
            <SelectTrigger id="ticket-priority" data-testid="select-ticket-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ticket-subject">Subject</Label>
        <Input
          id="ticket-subject"
          data-testid="input-ticket-subject"
          placeholder="Brief summary of your issue…"
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ticket-description">Description</Label>
        <Textarea
          id="ticket-description"
          data-testid="textarea-ticket-description"
          placeholder="Describe your issue in detail…"
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={5}
          required
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-form">
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending || !form.category || !form.subject || !form.description} data-testid="button-submit-ticket">
          {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Submit Ticket
        </Button>
      </div>
    </form>
  );
}

// ── TicketDetail ──────────────────────────────────────────────────────────────
function TicketDetail({
  ticketId,
  onBack,
  isAdmin,
}: {
  ticketId: string;
  onBack: () => void;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [replyText, setReplyText] = useState("");
  const [isInternal, setIsInternal] = useState(false);

  const { data, isLoading, error } = useQuery<TicketDetail>({
    queryKey: ["/api/support/tickets", ticketId],
    queryFn: async () => {
      const res = await fetch(`/api/support/tickets/${ticketId}`);
      if (!res.ok) throw new Error("Failed to load ticket");
      return res.json();
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ message, isInternal: internal }: { message: string; isInternal: boolean }) => {
      const res = await apiRequest("POST", `/api/support/tickets/${ticketId}/replies`, {
        message,
        isInternal: internal,
      });
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      setIsInternal(false);
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", ticketId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to send reply.", variant: "destructive" });
    },
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/support/tickets/${ticketId}/close`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Ticket closed" });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to close ticket.", variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiRequest("PATCH", `/api/support/tickets/${ticketId}/status`, { status });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets", ticketId] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status.", variant: "destructive" });
    },
  });

  const handleSendReply = () => {
    if (!replyText.trim()) return;
    replyMutation.mutate({ message: replyText, isInternal });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" data-testid="status-ticket-detail-loading">
        <Loader2 className="w-5 h-5 animate-spin text-primary mr-2" />
        <span className="text-muted-foreground text-sm">Loading ticket…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive" data-testid="status-ticket-detail-error">
        <AlertCircle className="w-5 h-5 mr-2" />
        <span className="text-sm">Failed to load ticket.</span>
      </div>
    );
  }

  const { ticket, replies } = data;
  const isClosed = ticket.status === "closed" || ticket.status === "resolved";

  return (
    <div className="space-y-5" data-testid={`ticket-detail-${ticketId}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-list">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <span className="text-muted-foreground/40 text-sm">|</span>
          <span className="text-xs font-mono text-muted-foreground" data-testid="text-detail-ticket-number">#{ticket.ticketNumber}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {statusBadge(ticket.status)}
          {priorityBadge(ticket.priority)}
          {!isClosed && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-close-ticket">
                  <X className="w-3.5 h-3.5 mr-1" />
                  Close Ticket
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Close this ticket?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ticket #{ticket.ticketNumber} will be marked as closed. This action can be reversed by a Platform Owner.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => closeMutation.mutate()}
                    data-testid="button-confirm-close-ticket"
                  >
                    Close Ticket
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {isAdmin && (
            <Select
              value={ticket.status}
              onValueChange={(v) => statusMutation.mutate(v)}
            >
              <SelectTrigger className="h-8 text-xs w-36" data-testid="select-ticket-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-lg leading-snug" data-testid="text-detail-ticket-subject">{ticket.subject}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge variant="outline" className="text-xs">{categoryLabel(ticket.category)}</Badge>
          <span className="text-xs text-muted-foreground">
            Submitted {new Date(ticket.createdAt).toLocaleString()}
          </span>
        </div>
      </div>

      <div className="glass-panel border border-border/50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
            ME
          </div>
          <span className="text-xs text-muted-foreground">Original description</span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-wrap" data-testid="text-ticket-description">{ticket.description}</p>
      </div>

      {replies.length > 0 && (
        <div className="space-y-3" data-testid="list-ticket-replies">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Thread</h4>
          {replies.map((reply) => (
            <div
              key={reply.id}
              data-testid={`reply-${reply.id}`}
              className={`glass-panel border rounded-xl p-4 ${
                reply.isInternal
                  ? "border-blue-500/30 bg-blue-500/5"
                  : "border-border/50"
              }`}
            >
              {reply.isInternal && (
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-xs text-blue-400 font-medium">Internal Note</span>
                </div>
              )}
              <div className="flex items-start gap-2.5">
                <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                  {getInitials(reply.authorName || reply.authorEmail || reply.userId)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-xs font-medium text-muted-foreground">{reply.authorName || reply.authorEmail || reply.userId}</span>
                    <span className="text-[10px] text-muted-foreground/50">{new Date(reply.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap" data-testid={`reply-message-${reply.id}`}>{reply.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isClosed && (
        <div className="space-y-3 pt-2 border-t border-border/40">
          <h4 className="text-sm font-semibold text-muted-foreground">Add Reply</h4>
          <Textarea
            data-testid="textarea-reply-message"
            placeholder="Write your reply…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            rows={3}
          />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isAdmin && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-testid="checkbox-internal-note"
                    className="rounded border-border"
                    checked={isInternal}
                    onChange={(e) => setIsInternal(e.target.checked)}
                  />
                  <span className="text-xs text-muted-foreground">Internal note (staff only)</span>
                </label>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleSendReply}
              disabled={!replyText.trim() || replyMutation.isPending}
              data-testid="button-send-reply"
            >
              {replyMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
              ) : (
                <Send className="w-4 h-4 mr-1.5" />
              )}
              Send Reply
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SupportTicketsPanel ───────────────────────────────────────────────────────
function SupportTicketsPanel({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const { data: tickets = [], isLoading } = useQuery<SupportTicket[]>({
    queryKey: ["/api/support/tickets"],
    queryFn: async () => {
      const res = await fetch("/api/support/tickets");
      if (!res.ok) throw new Error("Failed to load tickets");
      return res.json();
    },
  });

  const handleSelectTicket = (t: SupportTicket) => {
    setSelectedTicketId(t.id);
    setView("detail");
  };

  const handleTicketCreated = (ticket: SupportTicket) => {
    queryClient.invalidateQueries({ queryKey: ["/api/support/tickets"] });
    setSelectedTicketId(ticket.id);
    setView("detail");
  };

  if (view === "new") {
    return (
      <NewTicketForm
        onCancel={() => setView("list")}
        onCreated={handleTicketCreated}
      />
    );
  }

  if (view === "detail" && selectedTicketId) {
    return (
      <TicketDetail
        ticketId={selectedTicketId}
        onBack={() => { setView("list"); setSelectedTicketId(null); }}
        isAdmin={isAdmin}
      />
    );
  }

  return (
    <TicketList
      tickets={tickets}
      isLoading={isLoading}
      onSelect={handleSelectTicket}
      onNew={() => setView("new")}
    />
  );
}

// ── MarkdownRenderer ──────────────────────────────────────────────────────────
function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none
      prose-headings:font-bold prose-headings:tracking-tight
      prose-h1:text-2xl prose-h1:border-b prose-h1:border-border/50 prose-h1:pb-3 prose-h1:mb-6
      prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4
      prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3
      prose-h4:text-base prose-h4:mt-4 prose-h4:mb-2
      prose-p:text-muted-foreground prose-p:leading-relaxed
      prose-li:text-muted-foreground
      prose-strong:text-foreground prose-strong:font-semibold
      prose-a:text-primary prose-a:no-underline hover:prose-a:underline
      prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-medium prose-code:before:content-[''] prose-code:after:content-['']
      prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-xl
      prose-table:border-collapse prose-table:w-full
      prose-th:bg-muted/50 prose-th:border prose-th:border-border/50 prose-th:px-3 prose-th:py-2 prose-th:text-left prose-th:font-semibold prose-th:text-xs prose-th:uppercase prose-th:tracking-wider
      prose-td:border prose-td:border-border/50 prose-td:px-3 prose-td:py-2 prose-td:text-sm
      prose-hr:border-border/50 prose-hr:my-8
      prose-blockquote:border-l-primary/50 prose-blockquote:bg-primary/5 prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:px-4
    ">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

// ── AboutPanel ────────────────────────────────────────────────────────────────
function AboutPanel() {
  const capabilities = [
    "Governed SharePoint site provisioning with Deal & Portfolio Company context",
    "Sensitivity label enforcement via Microsoft Purview",
    "Multi-tenant M365 inventory with real-time Graph API sync",
    "Configurable governance policy engine with outcome-based evaluation",
    "SharePoint property bag writeback for Purview Adaptive Scope targeting",
    "Copilot eligibility explainability and readiness scoring",
    "SharePoint Embedded (SPE) container inventory with Purview labeling",
    "Role-based access control: Platform Owner → Auditor",
    "What-If scenario planner for policy rule simulation",
    "CSV export/import for bulk workspace metadata management",
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-start gap-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
          <img src="/images/brand/zenith-logo-color.png" alt="Zenith" className="h-10" />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Zenith</h2>
          <p className="text-muted-foreground mt-1">Microsoft 365 Governance Platform</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">v1.0 · Production</Badge>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs gap-1">
              <CheckCircle2 className="w-3 h-3" /> All Systems Operational
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-panel border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Built by</span>
            </div>
            <p className="text-sm text-muted-foreground">The Synozur Alliance</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Microsoft Solutions Partner</p>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-purple-500" />
              <span className="font-semibold text-sm">Platform</span>
            </div>
            <p className="text-sm text-muted-foreground">Synozur Suite</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">Zenith · Constellation · Orbit · Vega</p>
          </CardContent>
        </Card>
        <Card className="glass-panel border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-emerald-500" />
              <span className="font-semibold text-sm">Security</span>
            </div>
            <p className="text-sm text-muted-foreground">Microsoft Entra ID SSO</p>
            <p className="text-xs text-muted-foreground/60 mt-0.5">AES-256-GCM credential encryption</p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h3 className="font-semibold text-base mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-primary" />
          Platform Capabilities
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {capabilities.map((cap, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <div className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-2 shrink-0" />
              {cap}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-base mb-4 flex items-center gap-2">
          <Mail className="w-4 h-4 text-primary" />
          Support & Contact
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="mailto:contactus@synozur.com"
            className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card/40 hover:bg-card/70 hover:border-primary/30 transition-all group"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Mail className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="font-medium text-sm group-hover:text-primary transition-colors">Email Support</div>
              <div className="text-xs text-muted-foreground">contactus@synozur.com</div>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 ml-auto" />
          </a>
          <a
            href="https://synozur.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-xl border border-border/50 bg-card/40 hover:bg-card/70 hover:border-primary/30 transition-all group"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Globe className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="font-medium text-sm group-hover:text-primary transition-colors">Synozur Website</div>
              <div className="text-xs text-muted-foreground">synozur.com</div>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 ml-auto" />
          </a>
        </div>
      </div>

      <div className="pt-4 border-t border-border/40">
        <p className="text-xs text-muted-foreground/50 text-center">
          Zenith is a product of The Synozur Alliance. © {new Date().getFullYear()} The Synozur Alliance. All rights reserved.
        </p>
      </div>
    </div>
  );
}

// ── SupportPage ───────────────────────────────────────────────────────────────
export default function SupportPage() {
  const [location, setLocation] = useLocation();

  const pathParts = location.split("/");
  const activeSlug = pathParts.length > 3 ? pathParts[pathParts.length - 1] : "tickets";
  const activeTab = DOC_TABS.find((t) => t.slug === activeSlug) || DOC_TABS[0];

  const { data: authData } = useQuery<{ user: { role: string; effectiveRole?: string } } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: () => fetch("/api/auth/me", { credentials: "include" }).then((r) => r.ok ? r.json() : null),
  });

  const effectiveRole = authData?.user?.effectiveRole || authData?.user?.role || "viewer";
  const isAdmin = effectiveRole === "platform_owner";

  const { data: docContent, isLoading, error } = useQuery<{ filename: string; content: string }>({
    queryKey: ["/api/docs", activeTab.filename],
    queryFn: async () => {
      if (!activeTab.filename) return null as any;
      const res = await fetch(`/api/docs/${activeTab.filename}`);
      if (!res.ok) throw new Error("Failed to load document");
      return res.json();
    },
    enabled: !!activeTab.filename,
  });

  const { data: docsMeta } = useQuery<DocMeta[]>({
    queryKey: ["/api/docs"],
    queryFn: async () => {
      const res = await fetch("/api/docs");
      if (!res.ok) throw new Error("Failed to load docs metadata");
      return res.json();
    },
  });

  const handleTabChange = (slug: string) => {
    setLocation(`/app/support/${slug}`);
  };

  return (
    <div className="min-h-screen">
      <div className="border-b border-border/40 bg-gradient-to-r from-card/80 to-card/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 text-sm text-muted-foreground mb-4">
            <span>Zenith</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-foreground font-medium">Support & About</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Support & About
          </h1>
          <p className="text-muted-foreground mt-2 text-base">
            Submit support tickets, view documentation, and learn about the platform
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="lg:w-64 shrink-0">
            <nav className="space-y-1 lg:sticky lg:top-24">
              {DOC_TABS.map((tab) => {
                const isActive = tab.slug === activeTab.slug;
                const meta = docsMeta?.find((d) => d.slug === tab.slug);
                return (
                  <button
                    key={tab.slug}
                    onClick={() => handleTabChange(tab.slug)}
                    data-testid={`button-nav-${tab.slug}`}
                    className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                      isActive
                        ? "bg-primary/10 text-primary shadow-sm"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    }`}
                  >
                    <tab.icon className={`w-5 h-5 mt-0.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground/60"}`} />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">{tab.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tab.description}</div>
                      {meta?.lastModified && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 mt-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(meta.lastModified).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="flex-1 min-w-0">
            <div className="bg-card/40 border border-border/40 rounded-2xl backdrop-blur-sm">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <activeTab.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold text-lg" data-testid="text-active-doc-title">{activeTab.label}</h2>
                    <p className="text-xs text-muted-foreground">{activeTab.description}</p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-6">
                {activeTab.slug === "tickets" ? (
                  <SupportTicketsPanel isAdmin={isAdmin} />
                ) : activeTab.slug === "about" ? (
                  <AboutPanel />
                ) : (
                  <>
                    {isLoading && (
                      <div className="flex items-center justify-center py-20" data-testid="status-loading">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        <span className="ml-3 text-muted-foreground">Loading document...</span>
                      </div>
                    )}
                    {error && (
                      <div className="flex items-center justify-center py-20 text-destructive" data-testid="status-error">
                        <AlertCircle className="w-6 h-6" />
                        <span className="ml-3">Failed to load document. Please try again.</span>
                      </div>
                    )}
                    {docContent && !isLoading && (
                      <MarkdownRenderer content={docContent.content} />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
