import type { LeadGoogleFields } from "@/lib/places";

export type NewLeadRow = LeadGoogleFields & { trade: string; source_query: string };
export type UpdateLeadRow = LeadGoogleFields & { last_refreshed_at: string };

/**
 * Splits search results into rows to insert and rows to refresh.
 *
 * - New place_id: inserted with trade and source_query.
 * - Existing place_id: only the Google fields are updated. status, notes,
 *   trade, contact dates and outreach history are never touched.
 * - Suppressed (do-not-contact phone or name): skipped entirely.
 * - Duplicate place_ids within one batch are collapsed.
 */
export function planImport(
  leads: LeadGoogleFields[],
  opts: {
    existingPlaceIds: Set<string>;
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

    if (opts.existingPlaceIds.has(lead.place_id)) {
      updates.push({ ...lead, last_refreshed_at: opts.now.toISOString() });
    } else {
      inserts.push({ ...lead, trade: opts.trade, source_query: opts.sourceQuery });
    }
  }

  return { inserts, updates, suppressed };
}
