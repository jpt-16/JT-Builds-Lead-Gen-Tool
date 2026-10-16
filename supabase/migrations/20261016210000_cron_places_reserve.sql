-- JT Builds Co Lead Engine: Places quota for the scheduled cron job.
-- The nightly job has no signed-in user, so it can't call
-- reserve_places_requests (which uses auth.uid()). This variant takes the
-- owner id as an argument and can only be run by the service role, which
-- only the server holds. Signed-in browsers and anonymous visitors cannot
-- call it. It uses the same daily limit and the same Eastern-time day.

create function public.reserve_places_requests_for(owner uuid, requested integer, daily_limit integer)
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

  if requested <= daily_limit then
    insert into public.places_usage (owner_id, day, request_count)
    values (owner, today, requested)
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
        (select request_count from public.places_usage where owner_id = owner and day = today),
        0);
  end if;
end;
$$;

revoke execute on function public.reserve_places_requests_for(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_places_requests_for(uuid, integer, integer) to service_role;
