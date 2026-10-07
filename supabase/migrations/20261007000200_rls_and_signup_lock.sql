-- JT Builds Co Lead Engine: Row Level Security and single-owner signup lock.

-- Row Level Security ----------------------------------------------------------
-- Only the signed-in owner can read or write their rows. Signed-out requests
-- (the anon role) get no policies and no table privileges, so they see nothing.
-- (select auth.uid()) is wrapped in a subquery so Postgres evaluates it once
-- per statement instead of once per row.

alter table public.leads        enable row level security;
alter table public.outreach_log enable row level security;
alter table public.search_runs  enable row level security;
alter table public.suppression  enable row level security;

create policy "Owner has full access to leads"
  on public.leads for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owner has full access to outreach_log"
  on public.outreach_log for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owner has full access to search_runs"
  on public.search_runs for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owner has full access to suppression"
  on public.suppression for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.leads, public.outreach_log, public.search_runs, public.suppression from anon;

-- Signup lock -----------------------------------------------------------------
-- The app rejects signups for any email other than ALLOWED_EMAIL, but the
-- Supabase publishable key is public, so someone could call the Auth API
-- directly. This trigger enforces the same rule inside the database: a user
-- can only be created (or have their email changed) if the email matches the
-- one stored in private.app_config. If app_config is empty, every signup is
-- rejected (fails closed).
--
-- After applying this migration, set the allowed email once with
-- supabase/setup/set_allowed_email.sql. It must match ALLOWED_EMAIL.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_config (
  id             boolean primary key default true check (id), -- single row
  allowed_email  text not null
);

create function private.enforce_allowed_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed text;
begin
  select lower(allowed_email) into allowed from private.app_config where id;

  if allowed is null or lower(coalesce(new.email, '')) <> allowed then
    raise exception 'Signups are closed for this app.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

create trigger enforce_allowed_email
  before insert or update of email on auth.users
  for each row execute function private.enforce_allowed_email();
