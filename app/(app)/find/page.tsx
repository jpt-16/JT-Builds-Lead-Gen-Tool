import type { Metadata } from "next";
import { FindLeadsForm } from "@/components/FindLeadsForm";
import { RefreshStalePanel } from "@/components/RefreshStalePanel";
import { formatDateTime, metersToMiles } from "@/lib/format";
import { getPlacesConfig, getUsageToday } from "@/lib/places-usage";
import { countStaleLeads } from "@/lib/refresh";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Find leads | JT Builds Co Lead Engine" };

export default async function FindLeadsPage() {
  const supabase = await createClient();
  const { apiKey, dailyLimit } = getPlacesConfig();

  let data;
  try {
    data = await Promise.all([
      getUsageToday(supabase, dailyLimit),
      countStaleLeads(supabase),
      supabase
        .from("search_runs")
        .select("id, trade, city, state, radius_m, results_found, new_leads_added, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
  } catch (error) {
    console.error("find page:", error instanceof Error ? error.message : error);
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Find leads</h1>
        <p role="alert" className="alert-error">
          The database is missing something this page needs. Check that every file in supabase/migrations has been
          applied, then reload.
        </p>
      </div>
    );
  }
  const [usage, staleCount, runsResult] = data;
  const runs = runsResult.data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Find leads</h1>

      {!apiKey && (
        <p role="alert" className="alert-error">
          GOOGLE_PLACES_API_KEY is not set. Add it to .env.local (or Vercel env vars) and restart before searching.
        </p>
      )}

      <FindLeadsForm initialUsage={usage} />

      <RefreshStalePanel staleCount={staleCount} />

      <section className="card space-y-3" aria-labelledby="runs-heading">
        <h2 id="runs-heading" className="text-lg font-semibold">
          Recent searches
        </h2>
        {runs.length === 0 ? (
          <p className="text-sm text-slate-600">No searches yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">When</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Trade</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Town</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Radius</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Found</th>
                  <th scope="col" className="py-2 text-right font-medium">New</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(run.created_at)}</td>
                    <td className="py-2 pr-3">{run.trade}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {run.city}, {run.state}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{metersToMiles(run.radius_m)} mi</td>
                    <td className="py-2 pr-3 text-right">{run.results_found}</td>
                    <td className="py-2 text-right">{run.new_leads_added}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
