import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export type ComingSoonConfig = {
  title: string;
  description: string;
  icon: React.ElementType;
  relatedHref?: string;
  relatedLabel?: string;
  relatedIcon?: React.ElementType;
  phase?: string;
};

export function ComingSoonPage({ config }: { config: ComingSoonConfig }) {
  const Icon = config.icon;
  const RelatedIcon = config.relatedIcon;

  return (
    <div className="flex items-start justify-center pt-12">
      <div className="glass-panel p-12 rounded-2xl max-w-lg w-full text-center bg-card/40 backdrop-blur-xl border border-border/40">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/5 border border-primary/10 mb-4">
          <Icon className="w-12 h-12 text-primary opacity-70" />
        </div>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-semibold px-2.5 py-0.5 rounded-full tracking-wide uppercase">
            Planned Feature
          </span>
          {config.phase && (
            <span className="bg-muted/60 text-muted-foreground text-xs font-medium px-2.5 py-0.5 rounded-full">
              {config.phase}
            </span>
          )}
        </div>
        <h2 className="text-2xl font-bold mt-4" data-testid="text-coming-soon-title">{config.title}</h2>
        <p className="text-muted-foreground mt-2 leading-relaxed">{config.description}</p>

        {config.relatedHref && config.relatedLabel && (
          <div className="mt-6">
            <Button variant="outline" asChild>
              <Link href={config.relatedHref} className="inline-flex items-center gap-2">
                {RelatedIcon && <RelatedIcon className="w-4 h-4" />}
                {config.relatedLabel}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
