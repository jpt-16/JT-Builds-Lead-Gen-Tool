import type { Metadata } from "next";
import Link from "next/link";
import { FindLeadsForm } from "@/components/FindLeadsForm";
import { PageHeader } from "@/components/PageHeader";
import { RefreshStalePanel } from "@/components/RefreshStalePanel";
import { TargetsPanel } from "@/components/TargetsPanel";
import { formatDateTime, metersToMiles } from "@/lib/format";
import { getPlacesConfig, getUsageToday } from "@/lib/places-usage";
import { countStaleLeads } from "@/lib/refresh";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Find leads | JT Builds Co Lead Engine",
};

export default async function FindLeadsPage() {
  const supabase = await createClient();
  const { apiKey, dailyLimit } = getPlacesConfig();

  let data;
  try {
    data = await Promise.all([
      getUsageToday(supabase, dailyLimit),
      countStaleLeads(supabase),
      supabase.from("targets").select("*").order("created_at", { ascending: true }),
      supabase
        .from("search_runs")
        .select("id, trade, city, state, radius_m, results_found, new_leads_added, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
  } catch (error) {
    console.error("find page:", error instanceof Error ? error.message : error);
    return (
      <>
        <PageHeader crumbs={[{ label: "Find leads" }]} title="Find leads" />
        <p role="alert" className="alert-error">
          The database is missing something this page needs. Check that every file in supabase/migrations has been applied, then reload.
        </p>
      </>
    );
  }
  const [usage, staleCount, targetsResult, runsResult] = data;
  const runs = runsResult.data ?? [];
  const targets = targetsResult.data ?? [];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Find leads" }]}
        title="Find leads"
        description="Search Google Places by trade and town. New businesses land in Leads, ranked."
      />

      <div className="space-y-6">
        {!apiKey && (
          <p role="alert" className="alert-error">
            GOOGLE_PLACES_API_KEY is not set. Add it to .env.local (or Vercel env vars) and restart before searching.
          </p>
        )}

        <FindLeadsForm initialUsage={usage} />

        <TargetsPanel targets={targets} dailyLimit={dailyLimit} />

        <RefreshStalePanel staleCount={staleCount} />

        <section className="card space-y-3" aria-labelledby="runs-heading">
          <h2 id="runs-heading" className="text-base font-semibold text-ink">
            Recent searches
          </h2>
          {runs.length === 0 ? (
            <p className="text-sm text-muted">No searches yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Trade</th>
                    <th scope="col">Town</th>
                    <th scope="col">Radius</th>
                    <th scope="col" className="text-right">
                      Found
                    </th>
                    <th scope="col" className="text-right">
                      New
                    </th>
                    <th scope="col">
                      <span className="sr-only">Leads from this search</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="whitespace-nowrap">{formatDateTime(run.created_at)}</td>
                      <td>{run.trade}</td>
                      <td className="whitespace-nowrap">
                        {run.city}, {run.state}
                      </td>
                      <td className="whitespace-nowrap">{metersToMiles(run.radius_m)} mi</td>
                      <td className="text-right tabular-nums">{run.results_found}</td>
                      <td className="text-right tabular-nums">{run.new_leads_added}</td>
                      <td className="text-right">
                        <Link href={`/leads?run=${run.id}`} className="btn-link inline-flex min-h-11 items-center">
                          View leads
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
