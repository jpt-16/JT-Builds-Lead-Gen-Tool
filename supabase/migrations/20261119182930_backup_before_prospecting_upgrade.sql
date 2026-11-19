-- JT Builds Co Lead Engine: backup before the prospecting upgrade.
--
-- Copies every table that holds your data into a separate "backup" schema,
-- as it is right now, before the next migrations change anything. This only
-- ADDS new tables: it does not read-lock, alter, move or delete any existing
-- table or row.
--
-- The backup schema is not exposed through the public API, and the app never
-- reads it. Anonymous and signed-in users have no access, and row-level
-- security is on with no policies, so only the database owner and the service
-- role can read it (for example from the Supabase SQL editor).
--
-- To restore a table by hand (example for leads), in the SQL editor:
--   insert into public.leads select * from backup.leads_20261119
--   on conflict (id) do nothing;
-- (Each backup table has the same columns as the original at the time.)
-- Once you are happy with the upgrade you can drop the backup schema:
--   drop schema backup cascade;

create schema backup;
revoke all on schema backup from public, anon, authenticated;

create table backup.leads_20261119        as table public.leads;
create table backup.outreach_log_20261119 as table public.outreach_log;
create table backup.search_runs_20261119  as table public.search_runs;
create table backup.suppression_20261119  as table public.suppression;
create table backup.places_usage_20261119 as table public.places_usage;
create table backup.app_config_20261119   as table private.app_config;

alter table backup.leads_20261119        enable row level security;
alter table backup.outreach_log_20261119 enable row level security;
alter table backup.search_runs_20261119  enable row level security;
alter table backup.suppression_20261119  enable row level security;
alter table backup.places_usage_20261119 enable row level security;
alter table backup.app_config_20261119   enable row level security;

revoke all on all tables in schema backup from public, anon, authenticated;

comment on schema backup is 'Snapshot of all data taken 2026-11-19 before the prospecting upgrade. Safe to drop once you no longer need it.';
