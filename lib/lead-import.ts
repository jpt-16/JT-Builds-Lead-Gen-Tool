import type { LeadGoogleFields } from "@/lib/places";
import { initialSiteFields } from "@/lib/website";

type SiteFields = ReturnType<typeof initialSiteFields>;
type ScoreReset = SiteFields & {
  score_total: null;
  score_breakdown: null;
  score_attempts: 0;
  score_error: null;
};

export type NewLeadRow = LeadGoogleFields & SiteFields & { trade: string; source_query: string };
export type UpdateLeadRow = LeadGoogleFields & { last_refreshed_at: string } & Partial<ScoreReset>;

/**
 * Fields that clear a lead's old website score and put it back in the
 * scoring queue (or mark it as having no site). Used when the website changes.
 */
export function scoreReset(websiteUrl: string | null, now: Date): ScoreReset {
  return { ...initialSiteFields(websiteUrl, now), score_total: null, score_breakdown: null, score_attempts: 0, score_error: null };
}

/**
 * Splits search results into rows to insert and rows to refresh.
 *
 * - New place_id: inserted with trade, source_query and its starting scoring
 *   state (no site and social-only pages skip the queue).
 * - Existing place_id: only the Google fields are updated. status, notes,
 *   trade, contact dates and outreach history are never touched. If the
 *   website changed, the old score is cleared so the new site gets scored.
 * - Suppressed (do-not-contact phone or name): skipped entirely.
 * - Duplicate place_ids within one batch are collapsed.
 */
export function planImport(
  leads: LeadGoogleFields[],
  opts: {
    /** Existing leads' current website, keyed by place_id. */
    existing: Map<string, string | null>;
    isSuppressed: (lead: LeadGoogleFields) => boolean;
    trade: string;
    sourceQuery: string;
    now: Date;
  },
) {
  const inserts: NewLeadRow[] = [];
  const updates: UpdateLeadRow[] = [];
  let suppressed = 0;
  const seen = new Set<string>();

  for (const lead of leads) {
    if (seen.has(lead.place_id)) continue;
    seen.add(lead.place_id);

    if (opts.isSuppressed(lead)) {
      suppressed++;
      continue;
    }

    if (opts.existing.has(lead.place_id)) {
      const websiteChanged = (opts.existing.get(lead.place_id) ?? null) !== lead.website_url;
      updates.push({
        ...lead,
        last_refreshed_at: opts.now.toISOString(),
        ...(websiteChanged ? scoreReset(lead.website_url, opts.now) : {}),
      });
    } else {
      inserts.push({ ...lead, ...initialSiteFields(lead.website_url, opts.now), trade: opts.trade, source_query: opts.sourceQuery });
    }
  }

  return { inserts, updates, suppressed };
}
