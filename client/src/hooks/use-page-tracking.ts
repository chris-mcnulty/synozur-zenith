import { useEffect } from "react";

function getOrCreateSessionId(): string {
  const key = "zenith_session_id";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function getUtmParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    utmSource: p.get("utm_source") || undefined,
    utmMedium: p.get("utm_medium") || undefined,
    utmCampaign: p.get("utm_campaign") || undefined,
  };
}

export function usePageTracking(path: string) {
  useEffect(() => {
    const sessionId = getOrCreateSessionId();
    const utmParams = getUtmParams();
    const referrer = document.referrer || undefined;

    const debounceKey = `zenith_tracked_${path}_${sessionId}`;
    const lastTracked = sessionStorage.getItem(debounceKey);
    if (lastTracked && Date.now() - parseInt(lastTracked) < 60000) return;
    sessionStorage.setItem(debounceKey, Date.now().toString());

    fetch("/api/analytics/page-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, sessionId, referrer, ...utmParams }),
    }).catch(() => {});
  }, [path]);
}
