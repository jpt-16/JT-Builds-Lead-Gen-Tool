// Find leads settings shared by the form (client) and the API (server).

export const STATES = ["MA", "NH", "RI"] as const;
export type State = (typeof STATES)[number];

export const TRADE_PRESETS = [
  "landscaper",
  "house cleaner",
  "plumber",
  "auto detailer",
  "general contractor",
  "electrician",
  "roofer",
  "painter",
  "HVAC",
  "pressure washing",
] as const;

const METERS_PER_MILE = 1609.344;
export const RADIUS_OPTIONS = [5, 10, 15, 25].map((miles) => ({
  miles,
  meters: Math.round(miles * METERS_PER_MILE),
}));
export const DEFAULT_RADIUS_METERS = RADIUS_OPTIONS[1].meters;

// Google returns at most 20 results per page and 60 per query, so 3 pages.
export const MAX_PAGES_PER_SEARCH = 3;
// One request to locate the town, then up to MAX_PAGES_PER_SEARCH result pages.
export const MAX_REQUESTS_PER_TOWN = 1 + MAX_PAGES_PER_SEARCH;

// The cap on results per town. Each page of 20 is one Google request.
export const RESULT_CAPS = [20, 40, 60] as const;
export type ResultCap = (typeof RESULT_CAPS)[number];
export const DEFAULT_RESULT_CAP: ResultCap = 40;

/** Result pages needed to reach `cap` results. */
export function pagesForCap(cap: number): number {
  return Math.min(MAX_PAGES_PER_SEARCH, Math.max(1, Math.ceil(cap / 20)));
}

/** Google requests for one town: one to locate it, then one per page. */
export function requestsPerTown(cap: number): number {
  return 1 + pagesForCap(cap);
}
export const MAX_BULK_TOWNS = 25;

export type Town = { city: string; state: State };

/**
 * Parses the bulk towns box: one town per line, optionally "Town, ST".
 * Lines without a state use `defaultState`. Duplicates are dropped.
 */
export function parseTownList(text: string, defaultState: State): { towns: Town[]; errors: string[] } {
  const towns: Town[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;

    const match = line.match(/^(.*?)(?:,\s*([A-Za-z]{2}))?$/);
    const city = match?.[1]?.trim() ?? "";
    const stateText = match?.[2]?.toUpperCase();

    if (!city) {
      errors.push(`"${line}": missing town name`);
      continue;
    }
    if (stateText && !STATES.includes(stateText as State)) {
      errors.push(`"${line}": state must be MA, NH or RI`);
      continue;
    }

    const state = (stateText as State | undefined) ?? defaultState;
    const key = `${city.toLowerCase()}|${state}`;
    if (seen.has(key)) continue;
    seen.add(key);
    towns.push({ city, state });
  }

  return { towns, errors };
}

// Shapes returned by the API, shared with the client.

export type Usage = { used: number; limit: number };

export type FoundBusiness = {
  place_id: string;
  business_name: string;
  city: string | null;
  phone: string | null;
  website_url: string | null;
  isNew: boolean;
};

export type SearchSummary = {
  /** The search_runs row this search created. */
  runId: string;
  query: string;
  resultsFound: number;
  newLeads: number;
  updatedLeads: number;
  skippedClosed: number;
  skippedOutsideRadius: number;
  skippedSuppressed: number;
  requestsUsed: number;
  limitReached: boolean;
  usage: Usage;
  businesses: FoundBusiness[];
};

export type RefreshSummary = {
  refreshed: number;
  notFound: number;
  nowClosed: string[];
  limitReached: boolean;
  remainingStale: number;
  usage: Usage | null;
};
