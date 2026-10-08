import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LeadStatus } from "@/lib/database.types";
import { LEAD_STATUSES } from "@/lib/leads-config";

// Filters, sorting and paging for the leads table and the CSV export.
// Parsed from URL search params, so a filtered view is a shareable link.

type Client = SupabaseClient<Database>;

export const PAGE_SIZE = 50;

export const SORTS = {
  priority: { column: "priority_score", label: "Priority", defaultDir: "desc" },
  name: { column: "business_name", label: "Name", defaultDir: "asc" },
  score: { column: "score_total", label: "Site score", defaultDir: "asc" },
  reviews: { column: "review_count", label: "Reviews", defaultDir: "asc" },
  found: { column: "first_found_at", label: "Found", defaultDir: "desc" },
  contacted: { column: "last_contacted_at", label: "Last contact", defaultDir: "desc" },
  follow_up: { column: "next_follow_up_at", label: "Follow-up", defaultDir: "asc" },
} as const;
export type SortKey = keyof typeof SORTS;

export const SITE_FILTERS = {
  listed: "Has a website listed",
  none: "No website listed",
  no_real: "No real website (none, social, down, parked)",
} as const;
export type SiteFilter = keyof typeof SITE_FILTERS;

export type LeadFilters = {
  q?: string;
  trade?: string;
  city?: string;
  state?: string;
  status?: LeadStatus;
  site?: SiteFilter;
  scoreMin?: number;
  scoreMax?: number;
  reviewsMin?: number;
  reviewsMax?: number;
  sort: SortKey;
  dir: "asc" | "desc";
  page: number;
  ids?: string[];
};

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | undefined {
  const value = params[key];
  const text = (Array.isArray(value) ? value[0] : value)?.trim();
  return text ? text.slice(0, 100) : undefined;
}

function int(params: Params, key: string, min: number, max: number): number | undefined {
  const value = one(params, key);
  if (value === undefined) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : undefined;
}

export function parseLeadFilters(params: Params): LeadFilters {
  const sortParam = one(params, "sort");
  const sort: SortKey = sortParam && sortParam in SORTS ? (sortParam as SortKey) : "priority";
  const dirParam = one(params, "dir");
  const status = one(params, "status");
  const site = one(params, "site");
  const ids = one(params, "ids")
    ?.split(",")
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id));

  return {
    q: one(params, "q"),
    trade: one(params, "trade"),
    city: one(params, "city"),
    state: one(params, "state")?.toUpperCase(),
    status: status && (LEAD_STATUSES as readonly string[]).includes(status) ? (status as LeadStatus) : undefined,
    site: site && site in SITE_FILTERS ? (site as SiteFilter) : undefined,
    scoreMin: int(params, "scoreMin", 0, 100),
    scoreMax: int(params, "scoreMax", 0, 100),
    reviewsMin: int(params, "reviewsMin", 0, 1_000_000),
    reviewsMax: int(params, "reviewsMax", 0, 1_000_000),
    sort,
    dir: dirParam === "asc" || dirParam === "desc" ? dirParam : SORTS[sort].defaultDir,
    page: int(params, "page", 1, 10_000) ?? 1,
    ids: ids?.length ? ids : undefined,
  };
}

/** Characters that would break PostgREST's or() / ilike syntax. */
function cleanSearch(text: string): string {
  return text.replace(/[%_,()*\\"]/g, " ").trim();
}

export function buildLeadsQuery(supabase: Client, filters: LeadFilters, columns: string, opts: { count?: boolean } = {}) {
  let query = supabase.from("leads").select(columns, opts.count ? { count: "exact" } : undefined);

  if (filters.ids) query = query.in("id", filters.ids);
  if (filters.q) {
    const q = cleanSearch(filters.q);
    if (q) query = query.or(`business_name.ilike.%${q}%,phone.ilike.%${q}%,city.ilike.%${q}%,notes.ilike.%${q}%`);
  }
  if (filters.trade) query = query.eq("trade", filters.trade);
  if (filters.city) query = query.ilike("city", cleanSearch(filters.city));
  if (filters.state) query = query.eq("state", filters.state);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.site === "listed") query = query.eq("has_website", true);
  if (filters.site === "none") query = query.eq("has_website", false);
  if (filters.site === "no_real") query = query.in("site_status", ["none", "social", "dead", "parked"]);
  if (filters.scoreMin !== undefined) query = query.gte("score_total", filters.scoreMin);
  if (filters.scoreMax !== undefined) query = query.lte("score_total", filters.scoreMax);
  if (filters.reviewsMin !== undefined) query = query.gte("review_count", filters.reviewsMin);
  if (filters.reviewsMax !== undefined) query = query.lte("review_count", filters.reviewsMax);

  return query
    .order(SORTS[filters.sort].column, { ascending: filters.dir === "asc", nullsFirst: false })
    .order("id", { ascending: true });
}

/** Search params for a filters object, for links (sorting, paging, export). */
export function filtersToParams(filters: LeadFilters, overrides: Partial<LeadFilters> = {}): URLSearchParams {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || value === null || value === "") continue;
    if (key === "page" && value === 1) continue;
    if (key === "sort" && value === "priority") continue;
    if (key === "dir" && value === SORTS[merged.sort].defaultDir) continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  return params;
}
