import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhoneIcon } from "@/components/Icons";
import { LeadEditor } from "@/components/LeadEditor";
import { LogOutreachForm } from "@/components/LogOutreachForm";
import { PageHeader } from "@/components/PageHeader";
import { SiteHealth } from "@/components/SiteHealth";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime, formatDay } from "@/lib/format";
import { CHANNEL_LABELS, OUTCOME_LABELS } from "@/lib/leads-config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Lead | JT Builds Co Lead Engine" };

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
  const place = [lead.city, lead.state].filter(Boolean).join(", ");

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Leads", href: "/leads" }, { label: lead.business_name }]}
        title={lead.business_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={lead.status} />
            {[lead.trade, place].filter(Boolean).join(" · ")}
            {lead.next_follow_up_at && <span>· Follow up {formatDay(lead.next_follow_up_at)}</span>}
          </span>
        }
        actions={
          lead.phone ? (
            <a href={`tel:${lead.phone}`} className="btn-primary min-h-12">
              <PhoneIcon className="size-4" /> Call {lead.phone}
            </a>
          ) : (
            <span className="text-sm font-medium text-danger">No phone listed</span>
          )
        }
      />

      <div className="space-y-6">
        <section className="card grid gap-5 sm:grid-cols-[auto_1fr_1fr]" aria-label="Summary">
          <div className="flex items-center gap-3">
            <span className="text-5xl font-bold text-accent tabular-nums">{lead.priority_score}</span>
            <span className="text-xs font-semibold text-muted uppercase">
              Priority
              <br />
              of 100
            </span>
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-ink">Why this lead</p>
            <p className="text-ink-2">{lead.why_this_lead ?? "Not ranked yet."}</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">Reviews</dt>
            <dd className="text-ink">
              {lead.review_count}
              {lead.rating !== null && ` · ${lead.rating} stars`}
            </dd>
            <dt className="text-muted">Website</dt>
            <dd className="min-w-0 truncate">
              {lead.website_url ? (
                <a href={lead.website_url} target="_blank" rel="noopener noreferrer" className="btn-link">
                  {lead.website_url.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              ) : (
                <span className="text-ink">None listed</span>
              )}
            </dd>
            {lead.address && (
              <>
                <dt className="text-muted">Address</dt>
                <dd className="text-ink">{lead.address}</dd>
              </>
            )}
            <dt className="text-muted">Found</dt>
            <dd className="text-ink">
              {formatDay(lead.first_found_at)}
              {lead.google_maps_url && (
                <>
                  {" · "}
                  <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="btn-link">
                    Google Maps
                  </a>
                </>
              )}
            </dd>
          </dl>
        </section>

        <section className="card" aria-labelledby="health-heading">
          <h2 id="health-heading" className="mb-4 text-base font-semibold text-ink">
            Website health
          </h2>
          <SiteHealth lead={lead} />
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <LogOutreachForm leadId={lead.id} />

            <section className="card" aria-labelledby="history-heading">
              <h2 id="history-heading" className="mb-3 text-base font-semibold text-ink">
                Outreach history
              </h2>
              {history.length === 0 ? (
                <p className="text-sm text-muted">Nothing logged yet.</p>
              ) : (
                <ol className="space-y-4 border-l-2 border-line pl-4">
                  {history.map((entry) => (
                    <li key={entry.id} className="relative">
                      <span className="absolute top-1.5 -left-[23px] size-2.5 rounded-full border-2 border-surface bg-accent" aria-hidden="true" />
                      <p className="text-sm">
                        <span className="font-semibold text-ink">{CHANNEL_LABELS[entry.channel]}</span>
                        {entry.outcome && <span className="text-ink-2"> · {OUTCOME_LABELS[entry.outcome]}</span>}
                      </p>
                      <p className="text-xs text-muted">{formatDateTime(entry.created_at)}</p>
                      {entry.note && <p className="mt-1 text-sm whitespace-pre-wrap text-ink-2">{entry.note}</p>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <div className="space-y-6">
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
            <section className="card" aria-labelledby="drafts-heading">
              <h2 id="drafts-heading" className="text-base font-semibold text-ink">
                Outreach drafts
              </h2>
              <p className="mt-1 text-sm text-muted">Call openers, voicemail scripts and emails for this lead arrive in Phase 5.</p>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
