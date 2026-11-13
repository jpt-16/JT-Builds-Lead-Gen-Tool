import type { Metadata } from "next";
import Link from "next/link";
import { DownloadIcon } from "@/components/Icons";
import { LeadFilters } from "@/components/LeadFilters";
import { LeadsTable, type LeadRow } from "@/components/LeadsTable";
import { PageHeader } from "@/components/PageHeader";
import { buildLeadsQuery, filtersToParams, PAGE_SIZE, parseLeadFilters, SORTS, type SortKey } from "@/lib/lead-query";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Leads | JT Builds Co Lead Engine" };

const COLUMNS =
  "id, business_name, trade, city, state, phone, website_url, site_status, score_total, review_count, rating, priority_score, status, last_contacted_at, next_follow_up_at";

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const params = await searchParams;
  const filters = parseLeadFilters(params);
  const supabase = await createClient();
  const from = (filters.page - 1) * PAGE_SIZE;
  const runQuery = filters.run
    ? supabase.from("search_runs").select("trade, city, state").eq("id", filters.run).maybeSingle()
    : Promise.resolve({ data: null });

  const [result, tradesResult, runResult] = await Promise.all([
    buildLeadsQuery(supabase, filters, COLUMNS, { count: true }).range(from, from + PAGE_SIZE - 1),
    supabase.from("leads").select("trade").not("trade", "is", null).limit(10_000),
    runQuery,
  ]);
  const runLabel = runResult.data ? `${runResult.data.trade} in ${runResult.data.city}, ${runResult.data.state}` : null;
  if (result.error) {
    console.error("leads page:", result.error.message);
    return (
      <>
        <PageHeader crumbs={[{ label: "Leads" }]} title="Leads" />
        <p role="alert" className="alert-error">
          Could not load leads. Check that every migration has been applied, then reload.
        </p>
      </>
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
    <>
      <PageHeader
        crumbs={[{ label: "Leads" }]}
        title="Leads"
        description={`${total} ${total === 1 ? "lead matches" : "leads match"} these filters`}
        actions={
          <a href={exportAll} className="btn-secondary">
            <DownloadIcon className="size-4" /> Export CSV
          </a>
        }
      />

      <div className="space-y-4">
        <LeadFilters filters={filters} trades={trades} runLabel={runLabel} />

        <LeadsTable
          rows={rows}
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
    </>
  );
}
