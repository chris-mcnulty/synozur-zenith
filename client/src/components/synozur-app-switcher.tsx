import { useState, useRef, useEffect } from "react";

const SYNOZUR_APPS = [
  {
    id: "vega",
    name: "Vega",
    tagline: "Company Operating System",
    description: "AI-augmented strategy, goals, execution, governance, and insight in one place.",
    url: "https://vega.synozur.com",
    colorIndex: 0,
  },
  {
    id: "constellation",
    name: "Constellation",
    tagline: "Delivery & Financial Management",
    description: "Time, cost, progress tracking with estimates, invoicing, and reporting.",
    url: "https://scdp.synozur.com",
    colorIndex: 1,
  },
  {
    id: "nebula",
    name: "Nebula",
    tagline: "Innovation & Envisioning",
    description: "Co-design strategy, surface insights, and turn ideas into shared direction.",
    url: "https://nebula.synozur.com",
    colorIndex: 0,
  },
  {
    id: "orion",
    name: "Orion",
    tagline: "Transformation & Maturity",
    description: "AI-powered maturity assessments with actionable roadmaps for change.",
    url: "https://orion.synozur.com",
    colorIndex: 1,
  },
  {
    id: "zenith",
    name: "Zenith",
    tagline: "M365 AI Content Governance",
    description: "AI-powered content governance, compliance, and lifecycle management for Microsoft 365.",
    url: "https://zenith.synozur.com",
    colorIndex: 0,
  },
  {
    id: "orbit",
    name: "Orbit",
    tagline: "Go-to-Market Intelligence",
    description: "Competitive and market insights for positioning, prioritization, and action.",
    url: "https://orbit.synozur.com",
    colorIndex: 1,
  },
];

function VegaIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>
  );
}

function ConstellationIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4" r="1.5" fill="currentColor" />
      <circle cx="19" cy="9" r="1.5" fill="currentColor" />
      <circle cx="17" cy="17" r="1.5" fill="currentColor" />
      <circle cx="7" cy="17" r="1.5" fill="currentColor" />
      <circle cx="5" cy="9" r="1.5" fill="currentColor" />
      <line x1="12" y1="4" x2="19" y2="9" />
      <line x1="19" y1="9" x2="17" y2="17" />
      <line x1="17" y1="17" x2="7" y2="17" />
      <line x1="7" y1="17" x2="5" y2="9" />
      <line x1="5" y1="9" x2="12" y2="4" />
    </svg>
  );
}

function NebulaIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="9" />
      <circle cx="7" cy="5" r="0.8" fill="currentColor" />
      <circle cx="18" cy="8" r="0.8" fill="currentColor" />
      <circle cx="6" cy="16" r="0.8" fill="currentColor" />
      <circle cx="19" cy="15" r="0.8" fill="currentColor" />
    </svg>
  );
}

function OrionIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6" cy="18" r="1.5" fill="currentColor" />
      <circle cx="10" cy="13" r="1.5" fill="currentColor" />
      <circle cx="14" cy="11" r="1.5" fill="currentColor" />
      <circle cx="18" cy="6" r="1.5" fill="currentColor" />
      <line x1="6" y1="18" x2="10" y2="13" />
      <line x1="10" y1="13" x2="14" y2="11" />
      <line x1="14" y1="11" x2="18" y2="6" />
    </svg>
  );
}

function ZenithIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 20,7 20,17 12,22 4,17 4,7" />
      <line x1="12" y1="2" x2="12" y2="22" />
      <line x1="4" y1="7" x2="20" y2="17" />
      <line x1="20" y1="7" x2="4" y2="17" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function OrbitIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
      <circle cx="12" cy="12" r="3" />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)" />
      <ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(30 12 12)" />
    </svg>
  );
}

const APP_ICONS: Record<string, () => JSX.Element> = {
  vega: VegaIcon,
  constellation: ConstellationIcon,
  nebula: NebulaIcon,
  orion: OrionIcon,
  zenith: ZenithIcon,
  orbit: OrbitIcon,
};

interface AppSwitcherProps {
  currentApp?: string;
}

export default function SynozurAppSwitcher({ currentApp = "zenith" }: AppSwitcherProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const colors = [
    { bg: "bg-[#810FFB]/10 dark:bg-[#810FFB]/20", text: "text-[#810FFB]" },
    { bg: "bg-[#E60CB3]/10 dark:bg-[#E60CB3]/20", text: "text-[#E60CB3]" },
  ];

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen(prev => !prev)}
        className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
        aria-label="Synozur Suite Apps"
        data-testid="button-app-switcher"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
          <circle cx="3" cy="3" r="1.8" />
          <circle cx="9" cy="3" r="1.8" />
          <circle cx="15" cy="3" r="1.8" />
          <circle cx="3" cy="9" r="1.8" />
          <circle cx="9" cy="9" r="1.8" />
          <circle cx="15" cy="9" r="1.8" />
          <circle cx="3" cy="15" r="1.8" />
          <circle cx="9" cy="15" r="1.8" />
          <circle cx="15" cy="15" r="1.8" />
        </svg>
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute top-full left-0 mt-2 w-[360px] bg-popover border border-border/60 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
          style={{ animationTimingFunction: "ease-out" }}
        >
          <div className="px-4 pt-4 pb-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Synozur Suite
            </span>
          </div>

          <div className="px-2 pb-2 max-h-[420px] overflow-y-auto">
            {SYNOZUR_APPS.map((app) => {
              const isCurrent = app.id === currentApp;
              const Icon = APP_ICONS[app.id];
              const color = colors[app.colorIndex];

              const content = (
                <div
                  className={`flex items-start gap-3 px-3 py-3 rounded-lg transition-colors group ${
                    isCurrent
                      ? "bg-primary/5 dark:bg-primary/10"
                      : "hover:bg-muted/60 cursor-pointer"
                  }`}
                  data-testid={`app-${app.id}`}
                >
                  <div className={`w-10 h-10 rounded-lg ${color.bg} ${color.text} flex items-center justify-center shrink-0`}>
                    {Icon && <Icon />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{app.name}</span>
                      {isCurrent && (
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-medium text-[#810FFB] dark:text-[#b366ff] mt-0.5">
                      {app.tagline}
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-1">
                      {app.description}
                    </p>
                  </div>
                  {!isCurrent && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-3 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
                      <polyline points="6 4 10 8 6 12" />
                    </svg>
                  )}
                </div>
              );

              if (isCurrent) {
                return (
                  <div key={app.id} onClick={() => setOpen(false)}>
                    {content}
                  </div>
                );
              }

              return (
                <a
                  key={app.id}
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block no-underline"
                  onClick={() => setOpen(false)}
                >
                  {content}
                </a>
              );
            })}
          </div>

          <div className="px-4 py-3 border-t border-border/40 bg-muted/20">
            <a
              href="https://www.synozur.com/applications"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Learn more at synozur.com &rarr;
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
