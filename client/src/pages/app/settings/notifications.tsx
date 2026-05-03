import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bell, Send, Eye, ShieldCheck, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useServicePlan } from "@/hooks/use-service-plan";
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_SEVERITIES,
  DIGEST_CADENCES,
  SERVICE_PLANS,
  type NotificationCategory,
  type NotificationSeverity,
  type DigestCadence,
  type NotificationPreferences,
  type NotificationRules,
  type Notification,
  type ServicePlanTier,
} from "@shared/schema";

function planAtLeast(plan: ServicePlanTier, minimum: ServicePlanTier): boolean {
  return SERVICE_PLANS.indexOf(plan) >= SERVICE_PLANS.indexOf(minimum);
}

interface PrefsResponse { preferences: NotificationPreferences }
interface RulesResponse { rules: NotificationRules }
interface PreviewResponse {
  cadence: DigestCadence;
  total: number;
  byCategory: Record<string, number>;
  bySeverity: Record<string, number>;
  windowStart: string;
  windowEnd: string;
  notifications: Notification[];
}

export default function NotificationsSettingsPage() {
  const { toast } = useToast();
  const { plan } = useServicePlan();

  const isStandardPlus = planAtLeast(plan, "STANDARD");
  const isProfessionalPlus = planAtLeast(plan, "PROFESSIONAL");

  const { data: authData } = useQuery<{ user?: { effectiveRole?: string; role?: string } } | null>({
    queryKey: ["/api/auth/me"],
  });
  const role = authData?.user?.effectiveRole || authData?.user?.role || "";
  const isTenantAdmin = role === "tenant_admin" || role === "platform_owner";

  const { data: prefsData } = useQuery<PrefsResponse>({
    queryKey: ["/api/notifications/preferences"],
  });
  const prefs = prefsData?.preferences;

  const { data: rulesData } = useQuery<RulesResponse>({
    queryKey: ["/api/notifications/rules"],
    enabled: isTenantAdmin || role === "governance_admin",
    retry: false,
  });
  const rules = rulesData?.rules;

  // Local form state — sync from server
  const [cadence, setCadence] = useState<DigestCadence>("weekly");
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [inAppEnabled, setInAppEnabled] = useState(true);
  const [realTimeAlerts, setRealTimeAlerts] = useState(false);
  const [categories, setCategories] = useState<NotificationCategory[]>([]);
  const [quietStart, setQuietStart] = useState<string>("");
  const [quietEnd, setQuietEnd] = useState<string>("");

  useEffect(() => {
    if (!prefs) return;
    setCadence((prefs.digestCadence || "weekly") as DigestCadence);
    setEmailEnabled(prefs.emailEnabled);
    setInAppEnabled(prefs.inAppEnabled);
    setRealTimeAlerts(prefs.realTimeAlerts);
    setCategories((prefs.categories || []) as NotificationCategory[]);
    setQuietStart(prefs.quietHoursStart != null ? String(prefs.quietHoursStart) : "");
    setQuietEnd(prefs.quietHoursEnd != null ? String(prefs.quietHoursEnd) : "");
  }, [prefs]);

  // Org rules form
  const [ruleCategories, setRuleCategories] = useState<NotificationCategory[]>([]);
  const [severityFloor, setSeverityFloor] = useState<NotificationSeverity>("info");
  const [orgQuietStart, setOrgQuietStart] = useState<string>("");
  const [orgQuietEnd, setOrgQuietEnd] = useState<string>("");

  useEffect(() => {
    if (!rules) return;
    setRuleCategories((rules.enabledCategories || []) as NotificationCategory[]);
    setSeverityFloor((rules.severityFloor || "info") as NotificationSeverity);
    setOrgQuietStart(rules.orgQuietHoursStart != null ? String(rules.orgQuietHoursStart) : "");
    setOrgQuietEnd(rules.orgQuietHoursEnd != null ? String(rules.orgQuietHoursEnd) : "");
  }, [rules]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/notifications/preferences", {
        digestCadence: cadence,
        emailEnabled,
        inAppEnabled,
        realTimeAlerts,
        categories,
        quietHoursStart: quietStart === "" ? null : Number(quietStart),
        quietHoursEnd: quietEnd === "" ? null : Number(quietEnd),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/preferences"] });
      toast({ title: "Preferences saved", description: "Your notification settings have been updated." });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const saveRulesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/notifications/rules", {
        enabledCategories: ruleCategories,
        severityFloor,
        orgQuietHoursStart: orgQuietStart === "" ? null : Number(orgQuietStart),
        orgQuietHoursEnd: orgQuietEnd === "" ? null : Number(orgQuietEnd),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/rules"] });
      toast({ title: "Org rules saved", description: "Notification rules updated for your organization." });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notifications/send-now");
      return res.json();
    },
    onSuccess: (data: { total?: number }) => {
      toast({ title: "Digest sent", description: `${data.total ?? 0} events delivered to your inbox.` });
    },
    onError: (err: any) => {
      toast({ title: "Send failed", description: err.message, variant: "destructive" });
    },
  });

  const previewMutation = useMutation<PreviewResponse>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/notifications/preview");
      return res.json();
    },
  });

  const previewData = previewMutation.data;

  const toggleCategory = (cat: NotificationCategory) => {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };
  const toggleRuleCategory = (cat: NotificationCategory) => {
    setRuleCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, "0")}:00 UTC` })),
    [],
  );

  return (
    <div className="space-y-6 max-w-5xl" data-testid="page-notifications-settings">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="w-6 h-6" />
          Notification Preferences
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Choose what governance events you want to hear about, and how often.
        </p>
      </div>

      {/* Personal preferences */}
      <Card data-testid="card-personal-preferences">
        <CardHeader>
          <CardTitle className="text-base">Email digest</CardTitle>
          <CardDescription>
            Get a periodic summary of new external sharing, orphaned sites, sync failures, and remediation suggestions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="cadence">Cadence</Label>
              <Select value={cadence} onValueChange={(v) => setCadence(v as DigestCadence)}>
                <SelectTrigger id="cadence" data-testid="select-cadence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIGEST_CADENCES.map((c) => (
                    <SelectItem key={c} value={c} data-testid={`option-cadence-${c}`}>
                      {c === "off" ? "Off (no email)" : c === "daily" ? "Daily" : "Weekly"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Email digest</p>
                <p className="text-xs text-muted-foreground">Send the digest to my email</p>
              </div>
              <Switch checked={emailEnabled} onCheckedChange={setEmailEnabled} data-testid="switch-email-enabled" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">In-app inbox</p>
                <p className="text-xs text-muted-foreground">Show alerts in the bell dropdown</p>
              </div>
              <Switch checked={inAppEnabled} onCheckedChange={setInAppEnabled} data-testid="switch-in-app-enabled" />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                {!isProfessionalPlus && <Lock className="w-3.5 h-3.5 text-muted-foreground" />}
                <div>
                  <p className="text-sm font-medium">Real-time alerts</p>
                  <p className="text-xs text-muted-foreground">
                    Critical events delivered immediately {!isProfessionalPlus && (
                      <span className="text-amber-600">— Professional plan</span>
                    )}
                  </p>
                </div>
              </div>
              <Switch
                checked={realTimeAlerts}
                onCheckedChange={setRealTimeAlerts}
                disabled={!isProfessionalPlus}
                data-testid="switch-real-time-alerts"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <Label>Categories I want included</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {NOTIFICATION_CATEGORIES.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer hover:bg-muted/40"
                  data-testid={`label-category-${cat}`}
                >
                  <Checkbox
                    checked={categories.includes(cat)}
                    onCheckedChange={() => toggleCategory(cat)}
                    data-testid={`checkbox-category-${cat}`}
                  />
                  <span className="text-sm">{NOTIFICATION_CATEGORY_LABELS[cat]}</span>
                </label>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div>
              <Label>Quiet hours (UTC)</Label>
              <p className="text-xs text-muted-foreground">
                Defer digest delivery during this window. Leave blank to disable.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <Select value={quietStart || "none"} onValueChange={(v) => setQuietStart(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="select-quiet-start">
                  <SelectValue placeholder="Start" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Disabled —</SelectItem>
                  {hourOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={quietEnd || "none"} onValueChange={(v) => setQuietEnd(v === "none" ? "" : v)}>
                <SelectTrigger data-testid="select-quiet-end">
                  <SelectValue placeholder="End" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Disabled —</SelectItem>
                  {hourOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-save-preferences">
              {saveMutation.isPending ? "Saving…" : "Save preferences"}
            </Button>
            <Button
              variant="outline"
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
              data-testid="button-preview-digest"
            >
              <Eye className="w-4 h-4 mr-2" />
              {previewMutation.isPending ? "Building…" : "Preview next digest"}
            </Button>
            <Button
              variant="outline"
              onClick={() => sendNowMutation.mutate()}
              disabled={sendNowMutation.isPending || !emailEnabled}
              data-testid="button-send-digest-now"
            >
              <Send className="w-4 h-4 mr-2" />
              {sendNowMutation.isPending ? "Sending…" : "Send a test digest now"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview */}
      {previewData && (
        <Card data-testid="card-digest-preview">
          <CardHeader>
            <CardTitle className="text-base">Preview — {previewData.cadence === "daily" ? "last 24h" : "last 7 days"}</CardTitle>
            <CardDescription>
              {previewData.total === 0
                ? "No events to summarize. Your tenants are quiet right now."
                : `${previewData.total} events would appear in your next digest.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {previewData.total === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing to show.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(previewData.byCategory).map(([cat, count]) => (
                    <Badge key={cat} variant="secondary" data-testid={`badge-preview-${cat}`}>
                      {NOTIFICATION_CATEGORY_LABELS[cat as NotificationCategory] || cat} · {count}
                    </Badge>
                  ))}
                </div>
                <ul className="space-y-2">
                  {previewData.notifications.slice(0, 10).map((n) => (
                    <li
                      key={n.id}
                      className="flex items-start gap-2 text-sm border-l-2 border-primary/40 pl-3 py-1"
                      data-testid={`item-preview-${n.id}`}
                    >
                      <div>
                        <p className="font-medium">{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Org-level rules */}
      {(isTenantAdmin || role === "governance_admin") && (
        <Card data-testid="card-org-rules">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Organization rules
              {!isStandardPlus && (
                <Badge variant="outline" className="text-xs ml-2">
                  <Lock className="w-3 h-3 mr-1" />
                  Standard plan
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Tenant Admins control which categories are emitted and at what severity threshold.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {!isStandardPlus && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-3 text-sm" data-testid="text-rules-plan-gate">
                Advanced rule customization requires the Standard plan or higher. Current plan: <strong>{plan}</strong>.
              </div>
            )}

            <div className="space-y-3">
              <Label>Enabled categories (org-wide)</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {NOTIFICATION_CATEGORIES.map((cat) => (
                  <label
                    key={cat}
                    className="flex items-center gap-2 rounded-lg border p-2.5"
                    data-testid={`label-rule-category-${cat}`}
                  >
                    <Checkbox
                      checked={ruleCategories.includes(cat)}
                      onCheckedChange={() => toggleRuleCategory(cat)}
                      disabled={!isTenantAdmin || !isStandardPlus}
                      data-testid={`checkbox-rule-category-${cat}`}
                    />
                    <span className="text-sm">{NOTIFICATION_CATEGORY_LABELS[cat]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Severity floor</Label>
                <Select
                  value={severityFloor}
                  onValueChange={(v) => setSeverityFloor(v as NotificationSeverity)}
                  disabled={!isTenantAdmin || !isStandardPlus}
                >
                  <SelectTrigger data-testid="select-severity-floor">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_SEVERITIES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Org quiet start (UTC)</Label>
                <Select value={orgQuietStart || "none"} onValueChange={(v) => setOrgQuietStart(v === "none" ? "" : v)} disabled={!isTenantAdmin || !isStandardPlus}>
                  <SelectTrigger data-testid="select-org-quiet-start">
                    <SelectValue placeholder="Disabled" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Disabled —</SelectItem>
                    {hourOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Org quiet end (UTC)</Label>
                <Select value={orgQuietEnd || "none"} onValueChange={(v) => setOrgQuietEnd(v === "none" ? "" : v)} disabled={!isTenantAdmin || !isStandardPlus}>
                  <SelectTrigger data-testid="select-org-quiet-end">
                    <SelectValue placeholder="Disabled" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Disabled —</SelectItem>
                    {hourOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={() => saveRulesMutation.mutate()}
              disabled={saveRulesMutation.isPending || !isTenantAdmin || !isStandardPlus}
              data-testid="button-save-rules"
            >
              {saveRulesMutation.isPending ? "Saving…" : "Save org rules"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
