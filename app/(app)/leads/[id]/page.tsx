import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadEditor } from "@/components/LeadEditor";
import { LogOutreachForm } from "@/components/LogOutreachForm";
import { ScoreBreakdownView } from "@/components/ScoreBreakdownView";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime, formatDay } from "@/lib/format";
import { CHANNEL_LABELS, OUTCOME_LABELS } from "@/lib/leads-config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lead | JT Builds Co Lead Engine" };

const SITE_TEXT: Record<string, string> = {
  none: "No website",
  social: "Social page only",
  dead: "Website is down",
  parked: "Parked or placeholder",
  blocked: "Website blocked our check",
  ok: "Website",
};

export default async function LeadPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const supabase = await createClient();
  const [leadResult, historyResult] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).maybeSingle(),
    supabase.from("outreach_log").select("id, channel, outcome, note, created_at").eq("lead_id", id).order("created_at", { ascending: false }),
  ]);
  const lead = leadResult.data;
  if (!lead) notFound();
  const history = historyResult.data ?? [];

  return (
    <div className="space-y-8">
      <Link href="/leads" className="btn-link inline-flex min-h-11 items-center text-sm">
        ← All leads
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="eyebrow">{[lead.trade, [lead.city, lead.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
          <h1 className="text-3xl tracking-tight">{lead.business_name}</h1>
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={lead.status} />
            {lead.next_follow_up_at && <span className="text-sm text-muted">Follow up {formatDay(lead.next_follow_up_at)}</span>}
          </div>
          {lead.why_this_lead && <p className="text-neutral-200">{lead.why_this_lead}</p>}
        </div>
        <div className="text-right">
          <span className="block text-5xl text-accent-400 tabular-nums">{lead.priority_score}</span>
          <span className="text-xs tracking-[0.2em] text-muted uppercase">Priority</span>
        </div>
      </header>

      <section className="card grid gap-4 sm:grid-cols-2" aria-label="Contact details">
        <div className="space-y-2">
          {lead.phone ? (
            <a href={`tel:${lead.phone}`} className="btn-primary min-h-12 w-full sm:w-auto">
              Call {lead.phone}
            </a>
          ) : (
            <p className="text-danger">No phone listed on Google.</p>
          )}
          {lead.address && <p className="text-sm text-neutral-200">{lead.address}</p>}
          <p className="text-sm text-muted">
            {lead.review_count} review{lead.review_count === 1 ? "" : "s"}
            {lead.rating !== null && ` · ${lead.rating} stars`}
            {lead.google_maps_url && (
              <>
                {" · "}
                <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="btn-link">
                  Google Maps
                </a>
              </>
            )}
          </p>
        </div>
        <div className="space-y-1 text-sm">
          {lead.website_url ? (
            <p>
              <span className="text-muted">{lead.site_status ? SITE_TEXT[lead.site_status] : "Website"}: </span>
              <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="btn-link break-all">
                {lead.website_url}
              </a>
            </p>
          ) : (
            <p>No website listed on Google.</p>
          )}
          {lead.score_total !== null && <p>Site score {lead.score_total}/100</p>}
          <p className="text-muted">
            Found {formatDay(lead.first_found_at)} · Google data refreshed {formatDay(lead.last_refreshed_at)}
          </p>
          {lead.last_contacted_at && <p className="text-muted">Last contacted {formatDateTime(lead.last_contacted_at)}</p>}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <LogOutreachForm leadId={lead.id} />

          <section className="card space-y-3" aria-labelledby="history-heading">
            <h2 id="history-heading" className="text-lg">
              Outreach history
            </h2>
            {history.length === 0 ? (
              <p className="text-sm text-muted">Nothing logged yet.</p>
            ) : (
              <ol className="space-y-3 border-l border-divider-strong pl-4">
                {history.map((entry) => (
                  <li key={entry.id} className="relative">
                    <span className="absolute top-1.5 -left-[21px] size-2 rounded-full bg-accent-500" aria-hidden="true" />
                    <p className="text-sm">
                      <span className="text-ink">{CHANNEL_LABELS[entry.channel]}</span>
                      {entry.outcome && <span className="text-neutral-200"> · {OUTCOME_LABELS[entry.outcome]}</span>}
                      <span className="text-muted"> · {formatDateTime(entry.created_at)}</span>
                    </p>
                    {entry.note && <p className="mt-0.5 text-sm whitespace-pre-wrap text-neutral-200">{entry.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-8">
          <LeadEditor
            lead={{
              id: lead.id,
              business_name: lead.business_name,
              status: lead.status,
              trade: lead.trade,
              notes: lead.notes,
              next_follow_up_at: lead.next_follow_up_at,
            }}
          />

          <section className="card space-y-3" aria-labelledby="score-heading">
            <h2 id="score-heading" className="text-lg">
              Website score
            </h2>
            {lead.website_url ? (
              <ScoreBreakdownView breakdown={lead.score_breakdown} />
            ) : (
              <p className="text-sm text-muted">No website listed on Google.</p>
            )}
          </section>

          <section className="card space-y-2" aria-labelledby="drafts-heading">
            <h2 id="drafts-heading" className="text-lg">
              Outreach drafts
            </h2>
            <p className="text-sm text-muted">Call openers, voicemail scripts and emails for this lead arrive in Phase 5.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
