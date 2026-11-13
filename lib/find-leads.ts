import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { DEFAULT_RESULT_CAP, pagesForCap, type FoundBusiness, type SearchSummary, type State } from "@/lib/find-leads-config";
import { recomputeDerived } from "@/lib/derived";
import { planImport } from "@/lib/lead-import";
import { distanceMeters, locateTown, searchTextPage, toLeadFields, type Place } from "@/lib/places";
import { DailyLimitError, reservePlacesRequest } from "@/lib/places-usage";
import { buildSuppressionMatcher } from "@/lib/suppression";

type Client = SupabaseClient<Database>;

export type SearchInput = {
  trade: string;
  city: string;
  state: State;
  radiusM: number;
  /** Most results to keep for this town (20, 40 or 60). Fewer pages means fewer Google requests. */
  maxResults?: number;
  /** Set when a saved target started this search. */
  targetId?: string;
};

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
  config: {
    apiKey: string;
    dailyLimit: number;
    /** Only for the daily job, which has no signed-in user: the owner to write rows for. */
    ownerId?: string;
  },
): Promise<SearchSummary> {
  const { apiKey, dailyLimit, ownerId } = config;
  const asOwner = ownerId ? { owner_id: ownerId } : {};
  const maxResults = input.maxResults ?? DEFAULT_RESULT_CAP;
  const query = `${input.trade} in ${input.city}, ${input.state}`;
  let requestsUsed = 0;
  let limitReached = false;

  // Throws DailyLimitError straight away if nothing is left today.
  let usage = await reservePlacesRequest(supabase, dailyLimit, ownerId);
  requestsUsed++;
  const center = await locateTown(apiKey, input.city, input.state);
  if (!center) throw new TownNotFoundError(input.city, input.state);

  const places: Place[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < pagesForCap(maxResults); page++) {
    try {
      usage = await reservePlacesRequest(supabase, dailyLimit, ownerId);
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
  const unique = places
    .filter((place) => {
      if (seen.has(place.id)) return false;
      seen.add(place.id);
      return true;
    })
    .slice(0, maxResults);
  // Position in Google's own results for this search: a stand-in for how
  // visible the business is locally. Taken before closed and far-away places
  // are dropped, so it matches what a searcher would have seen.
  const ranks = new Map(unique.map((place, index) => [place.id, index + 1]));
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
      ? supabase
          .from("leads")
          .select("place_id, website_url")
          .in(
            "place_id",
            leads.map((l) => l.place_id),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (suppressionResult.error) throw new Error(`Could not load suppression list: ${suppressionResult.error.message}`);
  if (existingResult.error) throw new Error(`Could not check existing leads: ${existingResult.error.message}`);

  // The run row comes first so new leads can point at it. Its counts are
  // finished once the leads are saved.
  const { data: run, error: runError } = await supabase
    .from("search_runs")
    .insert({
      ...asOwner,
      trade: input.trade,
      city: input.city,
      state: input.state,
      radius_m: input.radiusM,
      results_found: leads.length,
      new_leads_added: 0,
      max_results: maxResults,
      target_id: input.targetId ?? null,
    })
    .select("id")
    .single();
  if (runError || !run) throw new Error(`Could not record the search run: ${runError?.message ?? "no row returned"}`);

  const plan = planImport(leads, {
    existing: new Map((existingResult.data ?? []).map((r) => [r.place_id, r.website_url])),
    isSuppressed: buildSuppressionMatcher(suppressionResult.data ?? []),
    trade: input.trade,
    sourceQuery: query,
    now: new Date(),
    runId: run.id,
    ranks,
  });

  // ignoreDuplicates makes this ON CONFLICT DO NOTHING, so a lead added by a
  // parallel run is left alone, and only rows actually inserted come back.
  const insertedIds = new Set<string>();
  if (plan.inserts.length) {
    const { data, error } = await supabase
      .from("leads")
      .upsert(
        plan.inserts.map((row) => ({ ...row, ...asOwner })),
        { onConflict: "place_id", ignoreDuplicates: true },
      )
      .select("place_id");
    if (error) throw new Error(`Could not save new leads: ${error.message}`);
    for (const row of data ?? []) insertedIds.add(row.place_id);
  }
  // A bulk upsert writes the union of all rows' keys and fills missing keys
  // with NULL, so rows that reset the score and rows that keep it must be
  // sent separately or the second kind would lose their scores.
  const websiteChanged = plan.updates.filter((u) => "score_total" in u);
  const websiteSame = plan.updates.filter((u) => !("score_total" in u));
  for (const group of [websiteChanged, websiteSame]) {
    if (!group.length) continue;
    // An upsert is an insert first, so it needs an owner even when the row exists.
    const { error } = await supabase.from("leads").upsert(
      group.map((row) => ({ ...row, ...asOwner })),
      { onConflict: "place_id" },
    );
    if (error) throw new Error(`Could not refresh existing leads: ${error.message}`);
  }

  await recomputeDerived(supabase, { placeIds: [...insertedIds, ...plan.updates.map((u) => u.place_id)] });

  const { error: countError } = await supabase.from("search_runs").update({ new_leads_added: insertedIds.size }).eq("id", run.id);
  if (countError) throw new Error(`Could not record the search run: ${countError.message}`);

  const businesses: FoundBusiness[] = [...plan.inserts, ...plan.updates].map((lead) => ({
    place_id: lead.place_id,
    business_name: lead.business_name,
    city: lead.city,
    phone: lead.phone,
    website_url: lead.website_url,
    isNew: insertedIds.has(lead.place_id),
  }));

  return {
    runId: run.id,
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
