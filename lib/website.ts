// Classifies a lead's listed website address without fetching it.

export type SiteStatus = "none" | "social" | "dead" | "parked" | "blocked" | "ok";

// Statuses that mean "no real website" for priority purposes.
export const NO_REAL_SITE: readonly SiteStatus[] = ["none", "social", "dead", "parked"];

// Social networks and directory listings. A lead whose only "website" is one
// of these has no site of their own.
const PLATFORM_HOSTS: Record<string, string> = {
  "facebook.com": "Facebook",
  "fb.com": "Facebook",
  "fb.me": "Facebook",
  "instagram.com": "Instagram",
  "linkedin.com": "LinkedIn",
  "x.com": "X",
  "twitter.com": "X",
  "tiktok.com": "TikTok",
  "youtube.com": "YouTube",
  "nextdoor.com": "Nextdoor",
  "linktr.ee": "Linktree",
  "yelp.com": "Yelp",
  "angi.com": "Angi",
  "angieslist.com": "Angi",
  "homeadvisor.com": "HomeAdvisor",
  "thumbtack.com": "Thumbtack",
  "houzz.com": "Houzz",
  "porch.com": "Porch",
  "bbb.org": "BBB",
  "g.page": "Google Business Profile",
  "business.site": "Google Business Profile",
};

/** Parses a listed website into a URL, adding https:// if the scheme is missing. */
export function normalizeUrl(raw: string | null | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

/** The platform name if the URL is a social or directory page, else null. */
export function socialPlatform(raw: string | null | undefined): string | null {
  const url = normalizeUrl(raw);
  if (!url) return null;
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  for (const [domain, name] of Object.entries(PLATFORM_HOSTS)) {
    if (host === domain || host.endsWith(`.${domain}`)) return name;
  }
  if ((host === "google.com" || host.endsWith(".google.com")) && url.pathname.startsWith("/maps")) {
    return "Google Maps";
  }
  return null;
}

/**
 * What can be decided about a lead's site without fetching it, used when a
 * lead is created or its website changes. Leads with no site or a social-only
 * page skip the scoring queue entirely.
 */
export function initialSiteFields(websiteUrl: string | null, now: Date) {
  if (!websiteUrl) return { site_status: "none" as const, scored_at: now.toISOString() };
  if (socialPlatform(websiteUrl)) return { site_status: "social" as const, scored_at: now.toISOString() };
  return { site_status: null, scored_at: null };
}
