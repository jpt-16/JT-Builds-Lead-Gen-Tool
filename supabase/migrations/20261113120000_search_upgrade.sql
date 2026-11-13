-- JT Builds Co Lead Engine: search upgrade (step 1 of the prospecting build).
-- Additive only: new columns and one new table. Nothing is dropped, renamed
-- or rewritten, and every existing row keeps working. The new lead columns
-- are empty until a lead shows up in a search or is refreshed.
--
-- 1. Saved targets: a trade + town the daily job searches automatically.
-- 2. Each lead remembers which search first found it, so "new in this run"
--    and "export this search" work.
-- 3. Google profile signals (categories, hours, photo count) and the lead's
--    position in Google's own results for its search.

-- targets -----------------------------------------------------------------------
create table public.targets (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references auth.users (id),
  trade          text not null check (char_length(trade) between 2 and 60),
  city           text not null check (char_length(city) between 2 and 60),
  state          text not null check (state in ('MA', 'NH', 'RI')),
  radius_m       integer not null default 16093 check (radius_m > 0 and radius_m <= 50000),
  max_results    integer not null default 40 check (max_results in (20, 40, 60)),
  active         boolean not null default true,
  last_run_at    timestamptz,
  last_run_found integer check (last_run_found is null or last_run_found >= 0),
  last_run_new   integer check (last_run_new is null or last_run_new >= 0),
  created_at     timestamptz not null default now()
);

create unique index targets_unique_idx on public.targets (owner_id, lower(trade), lower(city), state);
create index targets_owner_id_idx on public.targets (owner_id);

alter table public.targets enable row level security;

create policy "Owner has full access to targets"
  on public.targets for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.targets from anon;

-- search_runs -------------------------------------------------------------------
-- max_results is the cap chosen for the run. Deleting a target keeps its history.
alter table public.search_runs
  add column max_results integer check (max_results is null or (max_results > 0 and max_results <= 60)),
  add column target_id uuid references public.targets (id) on delete set null;

-- leads ---------------------------------------------------------------------------
-- search_run_id: the search that first found the lead (never changed after).
-- search_rank: 1-based position in Google's results for search_rank_query the
--   last time the lead appeared in a search. A proxy for local ranking, not
--   Google's actual local pack.
-- has_hours: null = not fetched yet, false = the listing has no opening hours.
-- photo_count: photos Google returned (at most 10 per place).
alter table public.leads
  add column search_run_id uuid references public.search_runs (id) on delete set null,
  add column search_rank integer check (search_rank is null or search_rank > 0),
  add column search_rank_query text,
  add column primary_type text,
  add column categories text[],
  add column has_hours boolean,
  add column photo_count integer check (photo_count is null or photo_count >= 0);

create index leads_search_run_id_idx on public.leads (search_run_id);
