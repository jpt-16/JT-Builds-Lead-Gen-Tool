# JT Builds Co Lead Engine

Private, single-user tool that finds, scores, ranks and tracks local-business prospects for JT Builds Co. One owner account, no public pages.

**Status:** Phase 1 (foundation and data model) is done. Lead discovery, scoring, the dashboard, outreach drafts, compliance notes and the full deployment checklist come in later phases.

## Stack

- Next.js 16 (App Router, TypeScript) and Tailwind CSS 4, deployed on Vercel
- Supabase: Postgres, Auth (email and password), Row Level Security
- Vitest for tests

## Local setup

1. Node 22 or newer.
2. `npm install`
3. `cp .env.example .env.local` and fill in the Supabase values and `ALLOWED_EMAIL`. Each variable has a one-line comment in `.env.example`. The Google, outreach and cron variables are not needed until later phases.
4. Set up Supabase (next section).
5. `npm run dev` and open http://localhost:3000. You land on `/login`.

## Supabase setup

1. Create a Supabase project.
2. **Review, then apply the migrations** in `supabase/migrations/`, in filename order. Paste each file into the SQL editor, or use the Supabase CLI (`supabase link` then `supabase db push`).
   - `20261007141435_initial_schema.sql`: enums, the `leads`, `outreach_log`, `search_runs` and `suppression` tables, indexes
   - `20261007141444_rls_and_signup_lock.sql`: RLS policies and the signup lock trigger
3. Open `supabase/setup/set_allowed_email.sql`, replace the placeholder with your `ALLOWED_EMAIL`, and run it in the SQL editor. Until you do, the database rejects every signup.
4. Auth settings (Authentication in the dashboard):
   - Email provider: enabled.
   - URL configuration: set Site URL to your app URL, and add `http://localhost:3000/auth/callback` plus `https://<your-domain>/auth/callback` to Redirect URLs.
5. Create the owner account, either way works:
   - In the app: on `/login`, choose "Create the owner account", then click the confirmation link in your email.
   - In the dashboard: Authentication > Users > Add user, with "Auto confirm" ticked.
6. Optional, after the account exists: turn off "Allow new users to sign up". The trigger already blocks other emails; this closes the endpoint entirely.
7. API keys: use the new publishable (`sb_publishable_...`) and secret (`sb_secret_...`) keys. Supabase's legacy `anon` and `service_role` keys stop working at the end of 2026.

## How access is locked down

Four layers. RLS and the signup lock protect the data even if someone calls Supabase directly with the public key; the proxy and server check keep strangers out of the app itself.

1. **Proxy** (`proxy.ts`, Next 16's name for middleware): every request without a session is redirected to `/login` (API routes get a 401). A session for any email other than `ALLOWED_EMAIL` is signed out.
2. **Server check**: signed-in pages call `requireOwner()` (`lib/session.ts`). API routes will too.
3. **Row Level Security**: every table has RLS on, with one policy allowing only rows where `owner_id = auth.uid()`. The `anon` role has no access at all.
4. **Signup lock**: a database trigger on `auth.users` rejects any new user, or email change, that does not match `private.app_config`. It fails closed if that table is empty. The login form also rejects other emails before calling Supabase.

## Data model

| Table | Purpose |
| --- | --- |
| `leads` | One row per business, unique on `place_id`. Google fields are refreshable; `status`, `notes` and contact dates are never overwritten on re-import. |
| `outreach_log` | Every call, email, DM or visit, with an outcome. |
| `search_runs` | One row per Find leads search. |
| `suppression` | Do-not-contact list (phone, email, business name). |

Every table also has `owner_id` (defaults to the signed-in user) for RLS. `leads.why_this_lead` holds the one-line summary from Phase 3. Deleting a lead that has outreach history, or deleting the auth user while data exists, is blocked by foreign keys so history cannot be wiped by accident.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | Generates route types, then runs `tsc` |
| `npm run lint` | ESLint |

## Project structure

```
app/
  (app)/          signed-in pages (dashboard for now) and their shared layout
  api/            route handlers (from Phase 2)
  auth/callback/  email confirmation landing route
  login/          sign-in and owner signup
components/       shared UI
lib/
  supabase/       browser, server and proxy clients
  auth.ts         pure helpers: allowed email check, safe redirects
  session.ts      requireOwner() for server code
  database.types.ts
supabase/
  migrations/     SQL migrations, applied in order
  setup/          one-off SQL you run by hand
proxy.ts          session refresh and route protection
```

Ideas outside the spec go in `FUTURE.md`.
