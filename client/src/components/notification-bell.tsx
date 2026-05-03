import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, Check, Settings as SettingsIcon, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  NOTIFICATION_CATEGORY_LABELS,
  type Notification,
  type NotificationCategory,
} from "@shared/schema";

interface NotificationsResponse {
  notifications: Notification[];
}

interface UnreadCountResponse {
  count: number;
}

const SEVERITY_ICON: Record<string, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertCircle,
};

const SEVERITY_COLOR: Record<string, string> = {
  info: "text-blue-500",
  warning: "text-amber-500",
  critical: "text-red-500",
};

function formatRelative(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);

  const { data: countData } = useQuery<UnreadCountResponse>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const { data: listData, isLoading } = useQuery<NotificationsResponse>({
    queryKey: ["/api/notifications"],
    enabled: open,
    staleTime: 15_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const unreadCount = countData?.count ?? 0;
  const items = listData?.notifications ?? [];
  const grouped = items.reduce<Record<string, Notification[]>>((acc, n) => {
    (acc[n.category] = acc[n.category] || []).push(n);
    return acc;
  }, {});
  const categories = Object.keys(grouped) as NotificationCategory[];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full relative hover:bg-muted"
          aria-label="Notifications"
          data-testid="button-notifications-bell"
        >
          <Bell className="w-5 h-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center border-2 border-background"
              data-testid="badge-notifications-unread-count"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[380px] p-0 rounded-xl"
        data-testid="popover-notifications"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold" data-testid="text-notifications-title">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                {unreadCount} new
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => markAllRead.mutate()}
            disabled={unreadCount === 0 || markAllRead.isPending}
            data-testid="button-mark-all-read"
          >
            <Check className="w-3 h-3 mr-1" />
            Mark all read
          </Button>
        </div>
        <ScrollArea className="max-h-[420px]">
          {isLoading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground" data-testid="text-notifications-loading">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-10 text-center" data-testid="text-notifications-empty">
              <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">You're all caught up</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                We'll notify you when something needs attention.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {categories.map((category) => (
                <div key={category} className="py-1">
                  <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/40">
                    {NOTIFICATION_CATEGORY_LABELS[category] || category}
                  </div>
                  {grouped[category].map((n) => {
                    const Icon = SEVERITY_ICON[n.severity] || Info;
                    const isUnread = !n.readAt;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          if (isUnread) markRead.mutate(n.id);
                          if (n.link) {
                            window.location.href = n.link;
                          }
                        }}
                        className={`w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors flex gap-3 ${
                          isUnread ? "bg-primary/5" : ""
                        }`}
                        data-testid={`button-notification-${n.id}`}
                      >
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${SEVERITY_COLOR[n.severity] || "text-muted-foreground"}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-tight truncate" data-testid={`text-notification-title-${n.id}`}>
                              {n.title}
                            </p>
                            {isUnread && (
                              <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />
                            )}
                          </div>
                          {n.body && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/70 mt-1">
                            {formatRelative(n.createdAt)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Link href="/app/settings/notifications">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-xs"
              onClick={() => setOpen(false)}
              data-testid="link-notification-preferences"
            >
              <SettingsIcon className="w-3 h-3 mr-2" />
              Notification preferences
            </Button>
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
