import React from "react";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-4 p-8">
          <ShieldAlert className="w-10 h-10 text-destructive" />
          <p className="text-destructive font-semibold text-base">Something went wrong rendering this page.</p>
          {this.state.error?.message && (
            <p className="text-muted-foreground text-sm font-mono bg-muted/50 px-3 py-1.5 rounded max-w-lg text-center break-all">
              {this.state.error.message}
            </p>
          )}
          <Link href={this.props.backHref ?? "/app/governance"}>
            <Button variant="outline" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              {this.props.backLabel ?? "Back"}
            </Button>
          </Link>
        </div>
      );
    }
    return this.props.children;
  }
}
