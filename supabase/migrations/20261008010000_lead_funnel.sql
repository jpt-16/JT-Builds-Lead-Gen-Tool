-- JT Builds Co Lead Engine: funnel counts for the dashboard stats.
-- A lead counts at a stage if it ever reached it, based on its current
-- status or its outreach history, so a lead that later went to "lost"
-- still counts as contacted and replied.
--   contacted: any outreach logged, or status contacted or later
--   replied:   a conversation happened (spoke, interested, not interested,
--              booked) or status replied or later
--   booked:    a call was booked, or status call_booked or won
--   won:       status won
-- Runs as the caller, so RLS limits it to the owner's own rows.

create function public.lead_funnel(week_start timestamptz)
returns table (found_this_week integer, total integer, contacted integer, replied integer, booked integer, won integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (select count(*) from public.leads where first_found_at >= week_start)::integer,
    (select count(*) from public.leads)::integer,
    (select count(*) from public.leads l
      where l.last_contacted_at is not null
         or l.status in ('contacted', 'replied', 'call_booked', 'won')
         or exists (select 1 from public.outreach_log o where o.lead_id = l.id))::integer,
    (select count(*) from public.leads l
      where l.status in ('replied', 'call_booked', 'won')
         or exists (select 1 from public.outreach_log o
                    where o.lead_id = l.id and o.outcome in ('spoke', 'interested', 'not_interested', 'booked')))::integer,
    (select count(*) from public.leads l
      where l.status in ('call_booked', 'won')
         or exists (select 1 from public.outreach_log o where o.lead_id = l.id and o.outcome = 'booked'))::integer,
    (select count(*) from public.leads where status = 'won')::integer;
$$;

revoke execute on function public.lead_funnel(timestamptz) from public, anon;
grant execute on function public.lead_funnel(timestamptz) to authenticated;
