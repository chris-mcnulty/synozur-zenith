import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ChevronRight } from "lucide-react";

export type PaletteItem = {
  name: string;
  href: string;
  icon: any;
  sectionPath: string; // e.g. "Management › Governance"
  badge?: string;
  isMock?: boolean;
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: PaletteItem[];
}

const RECENT_KEY = "zenith_palette_recent";
const MAX_RECENT = 3;

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string").slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecent(hrefs: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(hrefs.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

export function CommandPalette({ open, onOpenChange, items }: CommandPaletteProps) {
  const [, navigate] = useLocation();
  const [recentHrefs, setRecentHrefs] = useState<string[]>(() => loadRecent());

  // Group items by sectionPath
  const grouped = useMemo(() => {
    const map = new Map<string, PaletteItem[]>();
    for (const item of items) {
      const key = item.sectionPath || "Other";
      const existing = map.get(key) || [];
      existing.push(item);
      map.set(key, existing);
    }
    return Array.from(map.entries()).map(([section, groupItems]) => ({ section, items: groupItems }));
  }, [items]);

  const recentItems = useMemo(() => {
    return recentHrefs
      .map(href => items.find(i => i.href === href))
      .filter((i): i is PaletteItem => !!i);
  }, [recentHrefs, items]);

  const handleSelect = (item: PaletteItem) => {
    const updated = [item.href, ...recentHrefs.filter(h => h !== item.href)].slice(0, MAX_RECENT);
    setRecentHrefs(updated);
    saveRecent(updated);
    onOpenChange(false);
    navigate(item.href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      aria-label="Command palette"
    >
      <CommandInput placeholder="Search features, pages, and settings..." />
      <CommandList>
        <CommandEmpty>
          <div className="text-sm text-muted-foreground">No features match your search.</div>
          <div className="text-xs text-muted-foreground/70 mt-1">Try broader terms like "policy" or "tenant".</div>
        </CommandEmpty>

        {recentItems.length > 0 && (
          <CommandGroup heading="Recent">
            {recentItems.map(item => (
              <CommandItem
                key={`recent-${item.href}`}
                value={`recent ${item.name} ${item.sectionPath}`}
                onSelect={() => handleSelect(item)}
                className="cursor-pointer"
              >
                <item.icon className="w-4 h-4 mr-2 text-muted-foreground" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium truncate">{item.name}</span>
                  <span className="text-[11px] text-muted-foreground truncate">{item.sectionPath}</span>
                </div>
                {item.badge && (
                  <span className="ml-2 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5">
                    {item.badge}
                  </span>
                )}
                {item.isMock && (
                  <span className="ml-1 rounded bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[9px] font-semibold px-1.5 py-0.5 tracking-wide">
                    MOCK
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {grouped.map(group => (
          <CommandGroup key={group.section} heading={group.section}>
            {group.items.map(item => (
              <CommandItem
                key={item.href}
                value={`${item.name} ${item.sectionPath}`}
                onSelect={() => handleSelect(item)}
                className="cursor-pointer"
              >
                <item.icon className="w-4 h-4 mr-2 text-muted-foreground" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-medium truncate">{item.name}</span>
                  <span className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                    {item.sectionPath.split(" › ").map((seg, i, arr) => (
                      <span key={i} className="flex items-center gap-1">
                        {seg}
                        {i < arr.length - 1 && <ChevronRight className="w-2.5 h-2.5 opacity-60" />}
                      </span>
                    ))}
                  </span>
                </div>
                {item.badge && (
                  <span className="ml-2 rounded-full bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5">
                    {item.badge}
                  </span>
                )}
                {item.isMock && (
                  <span className="ml-1 rounded bg-amber-100/80 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[9px] font-semibold px-1.5 py-0.5 tracking-wide">
                    MOCK
                  </span>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

// Hook to wire up the global ⌘K / Ctrl+K keyboard shortcut
export function useCommandPaletteShortcut(setOpen: (open: boolean) => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setOpen]);
}
