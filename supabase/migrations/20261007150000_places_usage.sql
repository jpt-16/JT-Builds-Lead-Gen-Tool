-- JT Builds Co Lead Engine: daily Places API request counter.
-- Backs the MAX_PLACES_REQUESTS_PER_DAY guardrail. The app reserves one
-- request before every call to Google; when the day's limit is reached the
-- reservation is refused and the app stops with a clear error.
-- Days roll over at midnight Eastern time.

create table public.places_usage (
  owner_id       uuid not null default auth.uid() references auth.users (id),
  day            date not null,
  request_count  integer not null default 0 check (request_count >= 0),
  primary key (owner_id, day)
);

alter table public.places_usage enable row level security;

create policy "Owner has full access to places_usage"
  on public.places_usage for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.places_usage from anon;

-- Atomically adds `requested` to today's count if that stays within
-- `daily_limit`. Returns whether it was allowed and the count afterwards.
-- Runs as the caller, so RLS keeps it to the owner's own row.
create function public.reserve_places_requests(requested integer, daily_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  today date := (now() at time zone 'America/New_York')::date;
  new_count integer;
begin
  if requested < 1 then
    raise exception 'requested must be at least 1';
  end if;

  -- Only reserve when the total stays within the limit. Checking requested
  -- first also covers the day's first insert, which skips the WHERE below.
  if requested <= daily_limit then
    insert into public.places_usage (owner_id, day, request_count)
    values (auth.uid(), today, requested)
    on conflict (owner_id, day) do update
      set request_count = public.places_usage.request_count + excluded.request_count
      where public.places_usage.request_count + excluded.request_count <= daily_limit
    returning request_count into new_count;
  end if;

  if new_count is not null then
    return query select true, new_count;
  else
    return query
      select false, coalesce(
        (select request_count from public.places_usage where owner_id = auth.uid() and day = today),
        0);
  end if;
end;
$$;

revoke execute on function public.reserve_places_requests(integer, integer) from public, anon;
grant execute on function public.reserve_places_requests(integer, integer) to authenticated;
