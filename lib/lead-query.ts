import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database, LeadStatus } from "@/lib/database.types";
import { STATES } from "@/lib/find-leads-config";
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

export const PHONE_FILTERS = { has: "Has a phone number", none: "No phone number" } as const;
export type PhoneFilter = keyof typeof PHONE_FILTERS;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  /** Google star rating, 0 to 5. */
  ratingMin?: number;
  ratingMax?: number;
  phone?: PhoneFilter;
  /** Only leads first found by this search (a search_runs id). */
  run?: string;
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

function decimal(params: Params, key: string, min: number, max: number): number | undefined {
  const value = one(params, key);
  if (value === undefined) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(Math.max(min, Math.min(max, n)) * 10) / 10 : undefined;
}

export function parseLeadFilters(params: Params): LeadFilters {
  const sortParam = one(params, "sort");
  const sort: SortKey = sortParam && sortParam in SORTS ? (sortParam as SortKey) : "priority";
  const dirParam = one(params, "dir");
  const status = one(params, "status");
  const site = one(params, "site");
  const phone = one(params, "phone");
  const run = one(params, "run");
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
    ratingMin: decimal(params, "ratingMin", 0, 5),
    ratingMax: decimal(params, "ratingMax", 0, 5),
    phone: phone && phone in PHONE_FILTERS ? (phone as PhoneFilter) : undefined,
    run: run && UUID_PATTERN.test(run) ? run : undefined,
    sort,
    dir: dirParam === "asc" || dirParam === "desc" ? dirParam : SORTS[sort].defaultDir,
    page: int(params, "page", 1, 10_000) ?? 1,
    ids: ids?.length ? ids : undefined,
  };
}

// Strict version of the filters for the CSV export, which rejects bad input
// with a 400 instead of quietly ignoring it like the page does. A blank value
// counts as not set.
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const text = z.preprocess(blank, z.string().trim().max(100).optional());
const num = (max: number) => z.preprocess(blank, z.coerce.number().int().min(0).max(max).optional());

export const leadQuerySchema = z.object({
  q: text,
  trade: text,
  city: text,
  state: z.preprocess((v) => (typeof v === "string" ? v.trim().toUpperCase() || undefined : v), z.enum(STATES).optional()),
  status: z.preprocess(blank, z.enum(LEAD_STATUSES).optional()),
  site: z.preprocess(blank, z.enum(Object.keys(SITE_FILTERS) as [SiteFilter, ...SiteFilter[]]).optional()),
  scoreMin: num(100),
  scoreMax: num(100),
  reviewsMin: num(1_000_000),
  reviewsMax: num(1_000_000),
  ratingMin: z.preprocess(blank, z.coerce.number().min(0).max(5).optional()),
  ratingMax: z.preprocess(blank, z.coerce.number().min(0).max(5).optional()),
  phone: z.preprocess(blank, z.enum(Object.keys(PHONE_FILTERS) as [PhoneFilter, ...PhoneFilter[]]).optional()),
  run: z.preprocess(blank, z.string().regex(UUID_PATTERN, "run must be a search id").optional()),
  sort: z.preprocess(blank, z.enum(Object.keys(SORTS) as [SortKey, ...SortKey[]]).optional()),
  dir: z.preprocess(blank, z.enum(["asc", "desc"]).optional()),
  page: z.preprocess(blank, z.coerce.number().int().min(1).max(10_000).optional()),
  ids: z.preprocess(
    blank,
    z
      .string()
      .regex(/^[0-9a-f-]{36}(,[0-9a-f-]{36})*$/i, "ids must be a comma-separated list of lead ids")
      .max(37 * 1000)
      .optional(),
  ),
});

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
  if (filters.ratingMin !== undefined) query = query.gte("rating", filters.ratingMin);
  if (filters.ratingMax !== undefined) query = query.lte("rating", filters.ratingMax);
  if (filters.phone === "has") query = query.not("phone", "is", null);
  if (filters.phone === "none") query = query.is("phone", null);
  if (filters.run) query = query.eq("search_run_id", filters.run);

  return query.order(SORTS[filters.sort].column, { ascending: filters.dir === "asc", nullsFirst: false }).order("id", { ascending: true });
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
