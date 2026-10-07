import type { Metadata } from "next";
import { ScoreBreakdownView } from "@/components/ScoreBreakdownView";
import { ScoringPanel } from "@/components/ScoringPanel";
import { getQueueCounts } from "@/lib/score-queue";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard | JT Builds Co Lead Engine" };

const SITE_LABEL: Record<string, string> = {
  none: "None",
  social: "Social only",
  dead: "Down",
  parked: "Parked",
  blocked: "Blocked",
};

// Phase 3: scoring controls and the current ranking. The call list, stats
// and quick logging replace the ranking table in Phase 4.
export default async function DashboardPage() {
  const supabase = await createClient();

  let data;
  try {
    data = await Promise.all([
      getQueueCounts(supabase),
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase
        .from("leads")
        .select("id, business_name, phone, website_url, site_status, score_total, score_breakdown, priority_score, why_this_lead")
        .in("status", ["new", "queued"])
        .order("priority_score", { ascending: false })
        .order("review_count", { ascending: true })
        .limit(25),
    ]);
  } catch (error) {
    console.error("dashboard:", error instanceof Error ? error.message : error);
    return (
      <div className="space-y-4">
        <h1 className="text-3xl tracking-tight">Dashboard</h1>
        <p role="alert" className="alert-error">
          The database is missing something this page needs. Check that every file in supabase/migrations has been
          applied, then reload.
        </p>
      </div>
    );
  }
  const [queue, total, top] = data;
  const leads = top.data ?? [];

  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Overview</p>
        <h1 className="mt-1 text-3xl tracking-tight">Dashboard</h1>
        <p className="mt-2 text-sm text-muted">{total.count ?? 0} leads in total. The full call list arrives in Phase 4.</p>
      </div>

      <ScoringPanel pending={queue.pending} failed={queue.failed} />

      <section className="card space-y-4" aria-labelledby="top-heading">
        <div>
          <p className="eyebrow">Ranking</p>
          <h2 id="top-heading" className="mt-1 text-lg">
            Top leads by priority
          </h2>
          <p className="mt-1 text-sm text-muted">New and queued leads only. Expand a row for the website breakdown.</p>
        </div>

        {leads.length === 0 ? (
          <p className="text-sm text-muted">No leads yet. Run a search on Find leads.</p>
        ) : (
          <ol className="divide-y divide-divider">
            {leads.map((lead) => (
              <li key={lead.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer list-none items-start gap-4">
                    <span
                      className="w-10 shrink-0 pt-0.5 text-right text-lg text-accent-400 tabular-nums"
                      aria-label={`Priority ${lead.priority_score}`}
                    >
                      {lead.priority_score}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-ink">{lead.business_name}</span>
                      <span className="block text-sm text-muted">{lead.why_this_lead ?? "Not ranked yet."}</span>
                    </span>
                    <span className="hidden shrink-0 text-right text-sm sm:block">
                      <span className="block">{lead.phone ?? <span className="text-muted">No phone</span>}</span>
                      <span className="block text-muted">
                        {lead.site_status === "ok" || (lead.site_status === "blocked" && lead.score_total !== null)
                          ? `Site ${lead.score_total}/100`
                          : lead.site_status
                            ? `Site: ${SITE_LABEL[lead.site_status]}`
                            : "Site: not checked"}
                      </span>
                    </span>
                  </summary>
                  <div className="mt-3 ml-14 space-y-2">
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} className="btn-link">
                        Call {lead.phone}
                      </a>
                    )}
                    {lead.website_url ? (
                      <ScoreBreakdownView breakdown={lead.score_breakdown} />
                    ) : (
                      <p className="text-sm text-muted">No website listed on Google.</p>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
