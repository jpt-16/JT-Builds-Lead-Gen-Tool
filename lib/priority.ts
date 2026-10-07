import type { Deduction } from "@/lib/score-calc";
import { NO_REAL_SITE, socialPlatform, type SiteStatus } from "@/lib/website";

// Priority: who to call first. 0 to 100, higher means call sooner.
// Tune the weights here, then press "Recalculate priorities" on the dashboard
// so existing leads pick up the change.

export const WEIGHTS = {
  /** No website, or a dead, parked or social-only one. My best leads. */
  noRealSite: 60,
  /**
   * A real site is worth up to this much, scaled by how weak it is:
   * score 0 gets all of it, score 100 gets none.
   */
  weakSiteMax: 55,
  /** A site we could not score yet (queued or blocked): middling. */
  unknownSite: 20,
  /** Fewer than LOW_REVIEW_COUNT reviews: thin online presence. */
  lowReviews: 10,
  /** Rating under LOW_RATING, or no rating at all. */
  lowRating: 5,
  /** Has a phone number, so I can actually call. */
  callable: 25,
  /** Without a phone the lead is multiplied by this (heavy penalty). */
  noPhoneFactor: 0.3,
} as const;

export const LOW_REVIEW_COUNT = 15;
export const LOW_RATING = 4.5;

/** Statuses that are finished: never put them back on the call list. */
const CLOSED_STATUSES = ["won", "lost", "do_not_contact"];

export type PriorityInput = {
  status: string;
  site_status: SiteStatus | string | null;
  score_total: number | null;
  review_count: number;
  rating: number | null;
  phone: string | null;
};

export function computePriority(lead: PriorityInput): number {
  if (CLOSED_STATUSES.includes(lead.status)) return 0;

  let priority = 0;

  // Website: the biggest factor.
  if (lead.site_status && NO_REAL_SITE.includes(lead.site_status as SiteStatus)) {
    priority += WEIGHTS.noRealSite;
  } else if (lead.score_total !== null) {
    priority += Math.round(WEIGHTS.weakSiteMax * ((100 - lead.score_total) / 100));
  } else {
    priority += WEIGHTS.unknownSite;
  }

  // Thin online presence.
  if (lead.review_count < LOW_REVIEW_COUNT) priority += WEIGHTS.lowReviews;
  if (lead.rating === null || lead.rating < LOW_RATING) priority += WEIGHTS.lowRating;

  // Callable or not.
  if (lead.phone) priority += WEIGHTS.callable;
  else priority = Math.round(priority * WEIGHTS.noPhoneFactor);

  return Math.max(0, Math.min(100, priority));
}

export type WhyInput = PriorityInput & {
  website_url: string | null;
  score_breakdown: unknown;
  trade: string | null;
  city: string | null;
  state: string | null;
};

/** One plain line, e.g. "No website. 6 reviews. Landscaper in Mansfield, MA." */
export function whyThisLead(lead: WhyInput): string {
  const parts: string[] = [siteSentence(lead)];

  const reviews = lead.review_count === 0 ? "No reviews" : `${lead.review_count} review${lead.review_count === 1 ? "" : "s"}`;
  const rating = lead.review_count > 0 && lead.rating !== null && lead.rating < LOW_RATING ? `, ${lead.rating} stars` : "";
  parts.push(`${reviews}${rating}.`);

  if (!lead.phone) parts.push("No phone listed.");

  const place = [lead.city, lead.state].filter(Boolean).join(", ");
  const trade = lead.trade ? lead.trade.charAt(0).toUpperCase() + lead.trade.slice(1) : null;
  if (trade && place) parts.push(`${trade} in ${place}.`);
  else if (trade || place) parts.push(`${trade ?? place}.`);

  return parts.join(" ");
}

function siteSentence(lead: WhyInput): string {
  switch (lead.site_status) {
    case "none":
      return "No website.";
    case "social":
      return `Only a ${socialPlatform(lead.website_url) ?? "social media"} page.`;
    case "dead":
      return "Website is down.";
    case "parked":
      return "Website is parked or a placeholder.";
    case "blocked":
      return lead.score_total !== null ? `Website scores ${lead.score_total}/100.` : "Website blocked our check.";
    case "ok": {
      const issues = topIssues(lead.score_breakdown);
      return `Website scores ${lead.score_total}/100${issues ? `: ${issues}` : ""}.`;
    }
    default:
      return lead.website_url ? "Website not checked yet." : "No website.";
  }
}

function topIssues(breakdown: unknown): string {
  const deductions = (breakdown as { deductions?: Deduction[] } | null)?.deductions;
  if (!Array.isArray(deductions)) return "";
  return deductions
    .slice(0, 2)
    .map((d) => d.short)
    .join(", ");
}
