-- JT Builds Co Lead Engine: website scoring queue and priority support.

-- site_status: what is actually at the lead's website address.
--   none     no website listed
--   social   only a Facebook/Instagram/etc. page
--   dead     domain does not resolve, refuses connections, or errors
--   parked   parked, for sale, or a "coming soon" placeholder
--   blocked  site refused our check (403, bot wall); scored from PageSpeed only
--   ok       a real site that was scored
-- none, social, dead and parked all count as "no real website" for priority.
--
-- Scoring queue: a lead needs scoring while scored_at is null. A worker
-- claims one lead at a time by setting scoring_started_at (a claim older
-- than 5 minutes is treated as abandoned) and gives up after 3 attempts.

alter table public.leads
  add column site_status text check (site_status in ('none', 'social', 'dead', 'parked', 'blocked', 'ok')),
  add column scored_at timestamptz,
  add column scoring_started_at timestamptz,
  add column score_attempts integer not null default 0 check (score_attempts >= 0),
  add column score_error text;

comment on column public.leads.site_status is 'none | social | dead | parked | blocked | ok. Null until checked.';
comment on column public.leads.scored_at is 'When the website was last checked. Null means it is waiting in the scoring queue.';

-- Leads with no website have nothing to score.
update public.leads
set site_status = 'none', scored_at = now()
where not has_website;

create index leads_scoring_queue_idx on public.leads (first_found_at)
  where scored_at is null;

-- Writes recomputed priority_score and why_this_lead for many leads in one
-- round trip. payload: [{"id": "...", "priority_score": 80, "why_this_lead": "..."}].
-- Runs as the caller, so RLS limits it to the owner's own leads.
create function public.set_lead_priorities(payload jsonb)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with updated as (
    update public.leads as l
    set priority_score = x.priority_score,
        why_this_lead = x.why_this_lead
    from jsonb_to_recordset(payload) as x(id uuid, priority_score integer, why_this_lead text)
    where l.id = x.id
    returning 1
  )
  select count(*)::integer from updated;
$$;

revoke execute on function public.set_lead_priorities(jsonb) from public, anon;
grant execute on function public.set_lead_priorities(jsonb) to authenticated, service_role;
