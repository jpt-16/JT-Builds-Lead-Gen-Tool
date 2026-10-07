import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  MAX_PAGES_PER_SEARCH,
  type FoundBusiness,
  type SearchSummary,
  type State,
} from "@/lib/find-leads-config";
import { planImport } from "@/lib/lead-import";
import { distanceMeters, locateTown, searchTextPage, toLeadFields, type Place } from "@/lib/places";
import { DailyLimitError, reservePlacesRequest } from "@/lib/places-usage";
import { buildSuppressionMatcher } from "@/lib/suppression";

type Client = SupabaseClient<Database>;

export type SearchInput = { trade: string; city: string; state: State; radiusM: number };

export class TownNotFoundError extends Error {
  constructor(city: string, state: string) {
    super(`Google could not find ${city}, ${state}. Check the spelling.`);
    this.name = "TownNotFoundError";
  }
}

/**
 * Runs one Find leads search for one town and saves the results.
 * Every request to Google is reserved against the daily limit first. If the
 * limit is hit after some pages, the pages already fetched are still saved.
 */
export async function runSearch(
  supabase: Client,
  input: SearchInput,
  config: { apiKey: string; dailyLimit: number },
): Promise<SearchSummary> {
  const { apiKey, dailyLimit } = config;
  const query = `${input.trade} in ${input.city}, ${input.state}`;
  let requestsUsed = 0;
  let limitReached = false;

  // Throws DailyLimitError straight away if nothing is left today.
  let usage = await reservePlacesRequest(supabase, dailyLimit);
  requestsUsed++;
  const center = await locateTown(apiKey, input.city, input.state);
  if (!center) throw new TownNotFoundError(input.city, input.state);

  const places: Place[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < MAX_PAGES_PER_SEARCH; page++) {
    try {
      usage = await reservePlacesRequest(supabase, dailyLimit);
    } catch (error) {
      if (!(error instanceof DailyLimitError)) throw error;
      usage = error.usage;
      limitReached = true;
      break;
    }
    requestsUsed++;
    const result = await searchTextPage(apiKey, { textQuery: query, center, radiusM: input.radiusM, pageToken });
    places.push(...result.places);
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }
  // Out of requests before a single results page: nothing to save.
  if (limitReached && requestsUsed === 1) throw new DailyLimitError(usage);

  // Location bias prefers the circle but can return results outside it.
  let skippedClosed = 0;
  let skippedOutsideRadius = 0;
  // The same place can appear on two pages; keep the first copy.
  const seen = new Set<string>();
  const unique = places.filter((place) => {
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });
  const kept = unique.filter((place) => {
    if (place.businessStatus === "CLOSED_PERMANENTLY") {
      skippedClosed++;
      return false;
    }
    if (place.location && distanceMeters(center, place.location) > input.radiusM) {
      skippedOutsideRadius++;
      return false;
    }
    return true;
  });
  const leads = kept.map(toLeadFields);

  const [suppressionResult, existingResult] = await Promise.all([
    supabase.from("suppression").select("phone, email, business_name"),
    leads.length
      ? supabase.from("leads").select("place_id").in("place_id", leads.map((l) => l.place_id))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (suppressionResult.error) throw new Error(`Could not load suppression list: ${suppressionResult.error.message}`);
  if (existingResult.error) throw new Error(`Could not check existing leads: ${existingResult.error.message}`);

  const plan = planImport(leads, {
    existingPlaceIds: new Set((existingResult.data ?? []).map((r) => r.place_id)),
    isSuppressed: buildSuppressionMatcher(suppressionResult.data ?? []),
    trade: input.trade,
    sourceQuery: query,
    now: new Date(),
  });

  // ignoreDuplicates makes this ON CONFLICT DO NOTHING, so a lead added by a
  // parallel run is left alone, and only rows actually inserted come back.
  const insertedIds = new Set<string>();
  if (plan.inserts.length) {
    const { data, error } = await supabase
      .from("leads")
      .upsert(plan.inserts, { onConflict: "place_id", ignoreDuplicates: true })
      .select("place_id");
    if (error) throw new Error(`Could not save new leads: ${error.message}`);
    for (const row of data ?? []) insertedIds.add(row.place_id);
  }
  if (plan.updates.length) {
    const { error } = await supabase.from("leads").upsert(plan.updates, { onConflict: "place_id" });
    if (error) throw new Error(`Could not refresh existing leads: ${error.message}`);
  }

  const { error: runError } = await supabase.from("search_runs").insert({
    trade: input.trade,
    city: input.city,
    state: input.state,
    radius_m: input.radiusM,
    results_found: leads.length,
    new_leads_added: insertedIds.size,
  });
  if (runError) throw new Error(`Could not record the search run: ${runError.message}`);

  const businesses: FoundBusiness[] = [...plan.inserts, ...plan.updates].map((lead) => ({
    place_id: lead.place_id,
    business_name: lead.business_name,
    city: lead.city,
    phone: lead.phone,
    website_url: lead.website_url,
    isNew: insertedIds.has(lead.place_id),
  }));

  return {
    query,
    resultsFound: leads.length,
    newLeads: insertedIds.size,
    updatedLeads: plan.updates.length,
    skippedClosed,
    skippedOutsideRadius,
    skippedSuppressed: plan.suppressed,
    requestsUsed,
    limitReached,
    usage,
    businesses,
  };
}
