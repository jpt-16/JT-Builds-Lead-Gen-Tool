# JT Builds Co Lead Engine

Private, single-user tool that finds, scores, ranks and tracks local-business prospects for JT Builds Co. One owner account, no public pages.

**Status:** Phases 1 to 3 are done: foundation, lead discovery, and website scoring with priority. The call-list dashboard, outreach drafts, compliance notes and the full deployment checklist come in later phases.

The look matches jtbuildsco.com (its "Nocturne" design system: dark, Inter, one blurple accent, outlined buttons).

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
   - `20261007170640_places_usage.sql`: daily Places request counter and its reserve function
   - `20261007234951_scoring.sql`: website status and scoring-queue columns, and a bulk priority update function
3. Open `supabase/setup/set_allowed_email.sql`, replace the placeholder with your `ALLOWED_EMAIL`, and run it in the SQL editor. Until you do, the database rejects every signup.
4. Auth settings (Authentication in the dashboard):
   - Email provider: enabled.
   - URL configuration: set Site URL to your app URL, and add `http://localhost:3000/auth/callback` plus `https://<your-domain>/auth/callback` to Redirect URLs.
5. Create the owner account, either way works:
   - In the app: on `/login`, choose "Create the owner account", then click the confirmation link in your email.
   - In the dashboard: Authentication > Users > Add user, with "Auto confirm" ticked.
6. Optional, after the account exists: turn off "Allow new users to sign up". The trigger already blocks other emails; this closes the endpoint entirely.
7. API keys: use the new publishable (`sb_publishable_...`) and secret (`sb_secret_...`) keys. Supabase's legacy `anon` and `service_role` keys stop working at the end of 2026.

## Finding leads (Phase 2)

`/find` searches Google Places (New) for a trade in a town, one town or several in a row.

- Each town costs up to 4 Places requests: 1 to locate the town, then up to 3 pages of 20 results (Google's maximum is 60 per query).
- Results outside the chosen radius, permanently closed businesses and anything on the do-not-contact list are skipped.
- Leads are matched on `place_id`. Re-running a search never creates duplicates and only refreshes the Google fields. `status`, `notes`, `trade`, contact dates and outreach history are never overwritten.
- Every run is logged in `search_runs` and listed on the page.

### Cost guardrail

The page shows an estimate before running and today's usage. `MAX_PLACES_REQUESTS_PER_DAY` (default 30) is a hard cap enforced in the database: the app reserves one request before every call to Google, and once the cap is reached it stops with a clear error. Results already fetched are kept. The count resets at midnight Eastern.

Pricing as of late 2026 (check Google's pricing page): requesting phone, website and rating puts Text Search and Place Details in the Enterprise tier, about $35 per 1,000 requests after a free 1,000 per month per SKU. 30 a day stays roughly inside the free tier. Set a billing budget alert in Google Cloud as well.

### Google's terms and data freshness

Google's Places terms let us store `place_id` permanently but treat other Places content (name, address, phone, website, rating, review count, Maps link) as something to refresh rather than keep indefinitely. So:

- `place_id` is the permanent key for every lead.
- Every other Google field is overwritten whenever the lead turns up in a search, and `last_refreshed_at` records when.
- "Refresh stale leads" on `/find` re-fetches details for leads older than 30 days (one request each, counted against the daily cap). A Vercel cron job runs the same refresh automatically from Phase 6.
- Town coordinates are used only during a search and never stored.

This is a summary to keep the app on the right side of the terms, not legal advice. Read the Google Maps Platform terms for your account.

## Website scoring and priority (Phase 3)

### What happens to each lead

1. **No website** on Google, or a **social or directory page** only (Facebook, Instagram, Yelp, Angi, etc.): marked straight away, no checks needed.
2. Everything else joins the **scoring queue**. The homepage is fetched (12 second timeout, up to 5 redirects, private network addresses refused):
   - Domain doesn't resolve, connection refused, timeout, 404 or server error: **dead**.
   - Parked, for sale, a default hosting page, or a "coming soon" placeholder: **parked**.
   - 403, rate limited or a bot wall: **blocked**. Scored from PageSpeed alone.
   - Otherwise it's a real site and gets **scored**.
3. Dead, parked and social-only sites count the same as no website.

### The built-in score (0 to 100)

| Check | Points |
| --- | --- |
| PageSpeed Insights mobile performance | 20 |
| Largest Contentful Paint (2.5s or less full marks, 4s or less partial) | 5 |
| Cumulative Layout Shift (0.1 or less full, 0.25 or less partial) | 5 |
| HTTPS | 10 |
| Mobile viewport tag | 10 |
| Phone number visible on the homepage | 10 |
| Click-to-call (`tel:`) link | 10 |
| Contact form, booking link, or link to a contact/quote page | 10 |
| Title tag | 5 |
| Meta description | 5 |
| Exactly one H1 | 5 |
| LocalBusiness structured data | 5 |

Every lost point is listed in plain English in `score_breakdown`. If part of the check couldn't run (blocked homepage, PageSpeed failed after 3 tries), those points are left out and the score is scaled to what was measured, with a note saying so. Wix, Squarespace, GoDaddy and Weebly are flagged for information only; they don't cost points. Only the homepage HTML is checked, without running JavaScript.

### The queue

Leads are scored one at a time with a pause between, so a batch of 50 never hammers a site or Google. The runner lives in the app layout: it starts after a search adds new leads, or from "Score websites now" on the dashboard. It keeps going while you move between pages and shows progress in the header. A lead that fails temporarily (PageSpeed busy, timeout) is retried, up to 3 attempts. Two runners can't score the same lead. From Phase 6 a cron job drains the queue when the app is closed.

PageSpeed uses `GOOGLE_PAGESPEED_API_KEY`, or falls back to `GOOGLE_PLACES_API_KEY`. Enable the PageSpeed Insights API on that key, since without a key Google's shared quota is nearly always exhausted. If the key is rejected, scoring stops with a message saying so.

### Using your SEO tool instead

Set `SEO_TOOL_URL` and `SEO_TOOL_API_KEY`. Real sites (after the dead/parked/social checks) are then sent as `POST {"url": "..."}` with `Authorization: Bearer <key>`. The response needs a 0-100 `score` (also accepted: `score_total`, `overall_score`, `total`, or a 0-1 fraction) and optionally `issues` (or `deductions` / `findings`): strings, or objects with `message`/`title` and `points`/`impact`. The mapping is in `lib/seo-tool.ts`, and `scoreSite()` in `lib/scoring.ts` is the single place to swap scorers.

### Priority (0 to 100)

`computePriority()` in `lib/priority.ts`, with the weights at the top of the file:

- No real website: +60. A real site: up to +55, more the lower its score. Not scored yet: +20.
- Under 15 reviews: +10. Rating under 4.5 or none: +5.
- Has a phone: +25. No phone: the total is multiplied by 0.3.
- Won, lost or do-not-contact: always 0.

After changing the weights, press "Recalculate priorities" on the dashboard. The same file writes the "why this lead" line, e.g. "No website. 6 reviews. Landscaper in Mansfield, MA."

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
| `places_usage` | Places API requests per day, for the daily cap. |

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
