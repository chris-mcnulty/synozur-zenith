import { createHash } from "crypto";
import { pool } from "../db";

const ipCountryCache = new Map<string, { country: string; expires: number }>();
const IP_CACHE_TTL = 24 * 60 * 60 * 1000;

export async function getCountryFromIP(ip: string): Promise<string | null> {
  try {
    const cached = ipCountryCache.get(ip);
    if (cached && cached.expires > Date.now()) return cached.country;

    if (
      ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") ||
      ip.startsWith("172.1") || ip.startsWith("172.2") || ip.startsWith("172.3") ||
      ip === "::1" || ip === "localhost" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")
    ) return null;

    const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6 = /^[0-9a-fA-F:]+$/;
    if (!ipv4.test(ip) && !ipv6.test(ip)) return null;

    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { "User-Agent": "Zenith/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.country_code && !data.error) {
      ipCountryCache.set(ip, { country: data.country_code, expires: Date.now() + IP_CACHE_TTL });
      return data.country_code;
    }
    return null;
  } catch {
    return null;
  }
}

export async function recordPageView(data: {
  path: string;
  sessionId: string;
  ip: string;
  userAgent: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}): Promise<void> {
  const ipHash = createHash("sha256").update(data.ip).digest("hex").substring(0, 16);
  const country = await getCountryFromIP(data.ip);

  await pool.query(
    `INSERT INTO page_views (path, session_id, ip_hash, user_agent, referrer, utm_source, utm_medium, utm_campaign, country)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      data.path,
      data.sessionId,
      ipHash,
      data.userAgent || null,
      data.referrer || null,
      data.utmSource || null,
      data.utmMedium || null,
      data.utmCampaign || null,
      country,
    ]
  );
}

export interface TrafficStats {
  ytd: {
    totalViews: number;
    uniqueSessions: number;
    homeViews: number;
    loginViews: number;
  };
  monthly: Array<{
    month: string;
    label: string;
    views: number;
    sessions: number;
    homeViews: number;
    loginViews: number;
  }>;
  topReferrers: Array<{ referrer: string; count: number }>;
}

export async function getTrafficStats(): Promise<TrafficStats> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const ytdResult = await pool.query(
    `SELECT
       COUNT(*) AS total_views,
       COUNT(DISTINCT session_id) AS unique_sessions,
       COUNT(*) FILTER (WHERE path = '/') AS home_views,
       COUNT(*) FILTER (WHERE path = '/login') AS login_views
     FROM page_views
     WHERE created_at >= $1`,
    [yearStart]
  );

  const ytdRow = ytdResult.rows[0];

  const monthlyResult = await pool.query(
    `SELECT
       TO_CHAR(created_at, 'YYYY-MM') AS month,
       COUNT(*) AS views,
       COUNT(DISTINCT session_id) AS sessions,
       COUNT(*) FILTER (WHERE path = '/') AS home_views,
       COUNT(*) FILTER (WHERE path = '/login') AS login_views
     FROM page_views
     WHERE created_at >= $1
     GROUP BY TO_CHAR(created_at, 'YYYY-MM')
     ORDER BY month ASC`,
    [yearStart]
  );

  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const allMonths: TrafficStats["monthly"] = [];
  const now = new Date();
  for (let m = 0; m <= now.getMonth(); m++) {
    const key = `${now.getFullYear()}-${String(m + 1).padStart(2, "0")}`;
    const found = monthlyResult.rows.find((r: any) => r.month === key);
    allMonths.push({
      month: key,
      label: MONTH_LABELS[m],
      views: parseInt(found?.views ?? 0),
      sessions: parseInt(found?.sessions ?? 0),
      homeViews: parseInt(found?.home_views ?? 0),
      loginViews: parseInt(found?.login_views ?? 0),
    });
  }

  const referrerResult = await pool.query(
    `SELECT
       COALESCE(NULLIF(referrer, ''), 'Direct') AS referrer,
       COUNT(*) AS count
     FROM page_views
     WHERE created_at >= $1
     GROUP BY COALESCE(NULLIF(referrer, ''), 'Direct')
     ORDER BY count DESC
     LIMIT 10`,
    [yearStart]
  );

  return {
    ytd: {
      totalViews: parseInt(ytdRow.total_views),
      uniqueSessions: parseInt(ytdRow.unique_sessions),
      homeViews: parseInt(ytdRow.home_views),
      loginViews: parseInt(ytdRow.login_views),
    },
    monthly: allMonths,
    topReferrers: referrerResult.rows.map((r: any) => ({
      referrer: r.referrer,
      count: parseInt(r.count),
    })),
  };
}
