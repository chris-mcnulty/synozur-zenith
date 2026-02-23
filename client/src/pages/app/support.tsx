import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  ExternalLink,
} from "lucide-react";

interface DocMeta {
  filename: string;
  slug: string;
  exists: boolean;
  lastModified: string | null;
}

const DOC_TABS = [
  { slug: "roadmap", label: "Roadmap", icon: Map, filename: "ROADMAP.md", description: "Strategic product direction and planned features" },
  { slug: "changelog", label: "What's New", icon: FileText, filename: "CHANGELOG.md", description: "Version history and release notes" },
  { slug: "user_guide", label: "User Guide", icon: BookOpen, filename: "USER_GUIDE.md", description: "Complete feature documentation and workflows" },
  { slug: "backlog", label: "Backlog", icon: ListTodo, filename: "BACKLOG.md", description: "Prioritized feature and enhancement requests" },
];

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

export default function SupportPage() {
  const [location, setLocation] = useLocation();

  const pathParts = location.split("/");
  const activeSlug = pathParts.length > 3 ? pathParts[pathParts.length - 1] : "roadmap";
  const activeTab = DOC_TABS.find((t) => t.slug === activeSlug) || DOC_TABS[0];

  const { data: docContent, isLoading, error } = useQuery<{ filename: string; content: string }>({
    queryKey: ["/api/docs", activeTab.filename],
    queryFn: async () => {
      const res = await fetch(`/api/docs/${activeTab.filename}`);
      if (!res.ok) throw new Error("Failed to load document");
      return res.json();
    },
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
            Product documentation, roadmap, release history, and backlog
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
                    <p className="text-xs text-muted-foreground">{activeTab.filename}</p>
                  </div>
                </div>
              </div>

              <div className="px-6 py-6">
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
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
