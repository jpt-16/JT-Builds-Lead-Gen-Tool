-- JT Builds Co Lead Engine: initial schema.
-- Tables: leads, outreach_log, search_runs, suppression.
-- Row Level Security and the signup lock live in the next migration.
--
-- Every table carries owner_id (defaults to the signed-in user) so RLS can
-- restrict rows to the one owner account. Foreign keys to auth.users and to
-- leads use the default NO ACTION, so deleting the auth user or a lead that
-- still has history fails instead of silently wiping data.

-- Enums -----------------------------------------------------------------------

create type public.lead_status as enum (
  'new',
  'queued',
  'contacted',
  'replied',
  'call_booked',
  'won',
  'lost',
  'do_not_contact'
);

create type public.outreach_channel as enum (
  'call',
  'email',
  'text',
  'instagram_dm',
  'in_person'
);

create type public.outreach_outcome as enum (
  'no_answer',
  'voicemail',
  'spoke',
  'interested',
  'not_interested',
  'wrong_number',
  'booked'
);

-- leads -----------------------------------------------------------------------
-- place_id is the permanent Google identifier. Other Google-sourced fields
-- (name, address, phone, website, rating, review_count, maps URL) are
-- refreshable and get re-fetched when last_refreshed_at is older than 30 days.
-- status, notes and the contact dates are mine and are never overwritten by a
-- re-import.

create table public.leads (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null default auth.uid() references auth.users (id),
  place_id           text not null unique,
  business_name      text not null,
  trade              text,
  address            text,
  city               text,
  state              text,
  phone              text,
  website_url        text,
  google_maps_url    text,
  rating             numeric(2, 1) check (rating between 0 and 5),
  review_count       integer not null default 0 check (review_count >= 0),
  has_website        boolean not null default false,
  score_total        integer check (score_total between 0 and 100),
  score_breakdown    jsonb,
  priority_score     integer not null default 0 check (priority_score between 0 and 100),
  why_this_lead      text,
  status             public.lead_status not null default 'new',
  notes              text,
  source_query       text,
  first_found_at     timestamptz not null default now(),
  last_refreshed_at  timestamptz not null default now(),
  last_contacted_at  timestamptz,
  next_follow_up_at  timestamptz
);

comment on column public.leads.score_total is 'Website score 0-100. Null until scored, or when there is no website.';
comment on column public.leads.score_breakdown is 'Plain-English explanation of every scoring deduction.';
comment on column public.leads.why_this_lead is 'One-line summary, e.g. "No website. 6 reviews. Landscaper in Mansfield, MA."';

create index leads_owner_id_idx on public.leads (owner_id);
create index leads_call_list_idx on public.leads (status, priority_score desc);
create index leads_next_follow_up_idx on public.leads (next_follow_up_at)
  where next_follow_up_at is not null;
create index leads_last_refreshed_idx on public.leads (last_refreshed_at);

-- outreach_log ----------------------------------------------------------------
-- outcome is nullable so an attempt with no outcome yet (for example, an
-- email I sent) can still be logged.

create table public.outreach_log (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id),
  lead_id     uuid not null references public.leads (id),
  channel     public.outreach_channel not null,
  outcome     public.outreach_outcome,
  note        text,
  created_at  timestamptz not null default now()
);

create index outreach_log_owner_id_idx on public.outreach_log (owner_id);
create index outreach_log_lead_id_idx on public.outreach_log (lead_id, created_at desc);

-- search_runs -----------------------------------------------------------------
-- One row per Find leads search. radius_m is capped at 50 km, the Places API
-- maximum for a location bias circle.

create table public.search_runs (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references auth.users (id),
  trade            text not null,
  city             text not null,
  state            text not null,
  radius_m         integer not null check (radius_m > 0 and radius_m <= 50000),
  results_found    integer not null default 0 check (results_found >= 0),
  new_leads_added  integer not null default 0 check (new_leads_added >= 0),
  created_at       timestamptz not null default now()
);

create index search_runs_owner_id_idx on public.search_runs (owner_id);
create index search_runs_created_at_idx on public.search_runs (created_at desc);

-- suppression -----------------------------------------------------------------
-- Do-not-contact list. Find leads checks it before importing or queueing.
-- The app stores phone as digits only so matching ignores formatting.

create table public.suppression (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id),
  phone          text,
  email          text,
  business_name  text,
  reason         text,
  created_at     timestamptz not null default now(),
  constraint suppression_has_identifier check (num_nonnulls(phone, email, business_name) > 0)
);

create index suppression_owner_id_idx on public.suppression (owner_id);
create index suppression_phone_idx on public.suppression (phone)
  where phone is not null;
create index suppression_email_idx on public.suppression (lower(email))
  where email is not null;
create index suppression_business_name_idx on public.suppression (lower(business_name))
  where business_name is not null;
