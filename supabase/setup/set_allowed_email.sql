-- Run once in the Supabase SQL editor after applying the migrations.
-- Replace the placeholder with the same address you put in ALLOWED_EMAIL.
-- Until this row exists, every signup is rejected.

insert into private.app_config (id, allowed_email)
values (true, 'you@example.com')
on conflict (id) do update set allowed_email = excluded.allowed_email;
