import type { Metadata } from "next";
import Link from "next/link";
import { LeadsTable, type LeadRow } from "@/components/LeadsTable";
import { STATES } from "@/lib/find-leads-config";
import { buildLeadsQuery, filtersToParams, PAGE_SIZE, parseLeadFilters, SITE_FILTERS, SORTS, type SortKey } from "@/lib/lead-query";
import { LEAD_STATUSES, STATUS_LABELS } from "@/lib/leads-config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Leads | JT Builds Co Lead Engine" };

const COLUMNS =
  "id, business_name, trade, city, state, phone, website_url, site_status, score_total, review_count, rating, priority_score, status, last_contacted_at, next_follow_up_at";

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const params = await searchParams;
  const filters = parseLeadFilters(params);
  const supabase = await createClient();
  const from = (filters.page - 1) * PAGE_SIZE;

  const [result, tradesResult] = await Promise.all([
    buildLeadsQuery(supabase, filters, COLUMNS, { count: true }).range(from, from + PAGE_SIZE - 1),
    supabase.from("leads").select("trade").not("trade", "is", null).limit(10_000),
  ]);
  if (result.error) {
    console.error("leads page:", result.error.message);
    return (
      <p role="alert" className="alert-error">
        Could not load leads. Check that every migration has been applied, then reload.
      </p>
    );
  }

  const rows = (result.data ?? []) as unknown as LeadRow[];
  const total = result.count ?? 0;
  const trades = [...new Set((tradesResult.data ?? []).map((r) => r.trade as string))].sort();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const exportAll = `/api/leads/export?${filtersToParams({ ...filters, page: 1 })}`;

  const sortLink = (key: SortKey) => {
    const dir = filters.sort === key ? (filters.dir === "asc" ? "desc" : "asc") : SORTS[key].defaultDir;
    return `/leads?${filtersToParams(filters, { sort: key, dir, page: 1 })}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Pipeline</p>
        <h1 className="mt-1 text-3xl tracking-tight">Leads</h1>
      </div>

      <form method="get" className="card grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filter leads">
        <input type="hidden" name="sort" value={filters.sort} />
        <input type="hidden" name="dir" value={filters.dir} />
        <label className="sm:col-span-2">
          <span className="field-label">Search</span>
          <input name="q" defaultValue={filters.q} className="field-input" placeholder="Name, phone, town or notes" />
        </label>
        <label>
          <span className="field-label">Trade</span>
          <select name="trade" defaultValue={filters.trade ?? ""} className="field-input">
            <option value="">Any</option>
            {trades.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Status</span>
          <select name="status" defaultValue={filters.status ?? ""} className="field-input">
            <option value="">Any</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Town</span>
          <input name="city" defaultValue={filters.city} className="field-input" />
        </label>
        <label>
          <span className="field-label">State</span>
          <select name="state" defaultValue={filters.state ?? ""} className="field-input">
            <option value="">Any</option>
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">Website</span>
          <select name="site" defaultValue={filters.site ?? ""} className="field-input">
            <option value="">Any</option>
            {Object.entries(SITE_FILTERS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="field-label">Site score</legend>
          <label>
            <span className="sr-only">Minimum site score</span>
            <input name="scoreMin" type="number" min={0} max={100} defaultValue={filters.scoreMin} placeholder="Min" className="field-input" />
          </label>
          <label>
            <span className="sr-only">Maximum site score</span>
            <input name="scoreMax" type="number" min={0} max={100} defaultValue={filters.scoreMax} placeholder="Max" className="field-input" />
          </label>
        </fieldset>
        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="field-label">Reviews</legend>
          <label>
            <span className="sr-only">Minimum reviews</span>
            <input name="reviewsMin" type="number" min={0} defaultValue={filters.reviewsMin} placeholder="Min" className="field-input" />
          </label>
          <label>
            <span className="sr-only">Maximum reviews</span>
            <input name="reviewsMax" type="number" min={0} defaultValue={filters.reviewsMax} placeholder="Max" className="field-input" />
          </label>
        </fieldset>
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
          <button type="submit" className="btn-primary">
            Apply filters
          </button>
          <Link href="/leads" className="btn-secondary">
            Clear
          </Link>
        </div>
      </form>

      <LeadsTable
        rows={rows}
        exportAllHref={exportAll}
        total={total}
        sort={filters.sort}
        dir={filters.dir}
        sortLinks={Object.fromEntries((Object.keys(SORTS) as SortKey[]).map((k) => [k, sortLink(k)])) as Record<SortKey, string>}
      />

      <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="text-muted">
          {total === 0 ? "No leads match." : `Showing ${from + 1}–${Math.min(from + PAGE_SIZE, total)} of ${total}`}
        </span>
        <span className="flex gap-3">
          {filters.page > 1 && (
            <Link className="btn-secondary" href={`/leads?${filtersToParams(filters, { page: filters.page - 1 })}`}>
              Previous
            </Link>
          )}
          {filters.page < pages && (
            <Link className="btn-secondary" href={`/leads?${filtersToParams(filters, { page: filters.page + 1 })}`}>
              Next
            </Link>
          )}
        </span>
      </nav>
    </div>
  );
}
