import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { recomputeDerived } from "@/lib/derived";
import { scoreReset } from "@/lib/lead-import";
import { getPlaceDetails, toLeadFields } from "@/lib/places";
import type { RefreshSummary, Usage } from "@/lib/find-leads-config";
import { DailyLimitError, reservePlacesRequest } from "@/lib/places-usage";

type Client = SupabaseClient<Database>;

// Google's terms let us keep place_id indefinitely but expect other Places
// content to be refreshed. Leads older than this get re-fetched.
export const STALE_AFTER_DAYS = 30;

export function staleCutoff(now = new Date()): string {
  return new Date(now.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Re-fetches Google details for up to `limit` leads not refreshed in 30 days,
 * oldest first. One Places request per lead, reserved against the daily
 * limit. Only Google fields change; status, notes and history are untouched.
 */
export async function refreshStaleLeads(
  supabase: Client,
  config: { apiKey: string; dailyLimit: number; limit: number },
): Promise<RefreshSummary> {
  const { data: stale, error } = await supabase
    .from("leads")
    .select("id, place_id, business_name, website_url")
    .lt("last_refreshed_at", staleCutoff())
    .order("last_refreshed_at", { ascending: true })
    .limit(config.limit);
  if (error) throw new Error(`Could not load stale leads: ${error.message}`);

  let refreshed = 0;
  let notFound = 0;
  let limitReached = false;
  let usage: Usage | null = null;
  const nowClosed: string[] = [];

  for (const lead of stale ?? []) {
    try {
      usage = await reservePlacesRequest(supabase, config.dailyLimit);
    } catch (reserveError) {
      if (!(reserveError instanceof DailyLimitError)) throw reserveError;
      usage = reserveError.usage;
      limitReached = true;
      break;
    }

    const now = new Date().toISOString();
    const place = await getPlaceDetails(config.apiKey, lead.place_id);
    if (!place) {
      // Google no longer knows this place. Keep the lead, mark it checked.
      notFound++;
      const { error: touchError } = await supabase.from("leads").update({ last_refreshed_at: now }).eq("id", lead.id);
      if (touchError) throw new Error(`Could not update lead: ${touchError.message}`);
      continue;
    }

    // Keep the stored place_id; only the refreshable fields change.
    const { place_id, ...fields } = toLeadFields(place);
    // A new website address needs a fresh score.
    const reset = fields.website_url !== lead.website_url ? scoreReset(fields.website_url, new Date()) : {};
    const { error: updateError } = await supabase
      .from("leads")
      .update({ ...fields, ...reset, last_refreshed_at: now })
      .eq("id", lead.id);
    if (updateError) throw new Error(`Could not update lead: ${updateError.message}`);
    refreshed++;
    if (place.businessStatus === "CLOSED_PERMANENTLY") nowClosed.push(fields.business_name);
  }

  if (stale?.length) await recomputeDerived(supabase, { ids: stale.map((l) => l.id) });
  const remainingStale = await countStaleLeads(supabase);
  return { refreshed, notFound, nowClosed, limitReached, remainingStale, usage };
}

export async function countStaleLeads(supabase: Client): Promise<number> {
  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .lt("last_refreshed_at", staleCutoff());
  if (error) throw new Error(`Could not count stale leads: ${error.message}`);
  return count ?? 0;
}
