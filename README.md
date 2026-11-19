# JT Builds Co Lead Engine

Private, single-user tool that finds, scores, ranks and tracks local-business prospects for JT Builds Co. One owner account, no public pages.

**Status:** All seven phases are done: foundation, lead discovery, website scoring with priority, the daily call list, leads table and lead pages, outreach drafts, safety (compliance notes, input validation, tests, the scheduled job, accessibility), and deployment (a checklist and a demo mode). To go live, follow **[DEPLOY.md](DEPLOY.md)**. To look around without spending any Google credits, see **Demo mode** below.

The layout borrows from analytics tools like Semrush: a dark sidebar with breadcrumbs, a light work area, metric cards with weekly trends, a website health gauge with issues grouped by severity, and pill filters with a column picker. Colours and the logo come from jtbuildsco.com (Inter, one blurple accent). Every text and control colour passes WCAG AA; the values are in the header comment of `app/globals.css`.

## Stack

- Next.js 16 (App Router, TypeScript) and Tailwind CSS 4, deployed on Vercel
- Supabase: Postgres, Auth (email and password), Row Level Security
- Vitest for tests

## Local setup

1. Node 22 or newer.
2. `npm install`
3. `cp .env.example .env.local` and fill in the Supabase values and `ALLOWED_EMAIL`. Each variable has a one-line comment in `.env.example`. You need the Google key only to find and score real leads, and the outreach variables only for drafts. The demo mode needs neither.
4. Set up Supabase (next section).
5. `npm run dev` and open http://localhost:3000. You land on `/login`.

## Supabase setup

1. Create a Supabase project.
2. **Review, then apply the migrations** in `supabase/migrations/`, in filename order. Paste each file into the SQL editor, or use the Supabase CLI (`supabase link` then `supabase db push`).
   - `20261007141435_initial_schema.sql`: enums, the `leads`, `outreach_log`, `search_runs` and `suppression` tables, indexes
   - `20261007141444_rls_and_signup_lock.sql`: RLS policies and the signup lock trigger
   - `20261007170640_places_usage.sql`: daily Places request counter and its reserve function
   - `20261007234951_scoring.sql`: website status and scoring-queue columns, and a bulk priority update function
   - `20261008003320_lead_funnel.sql`: one function that returns the dashboard funnel counts
   - `20261016222802_cron_places_reserve.sql`: a Places-quota function only the server's service key can run, for the daily job
   - `20261113115900_backup_before_prospecting_upgrade.sql`: copies your data tables into a private `backup` schema (nothing reads it; restore steps are in the file). Run before the next migration.
   - `20261113120000_search_upgrade.sql`: saved targets, the search each lead came from, Google profile signals and rank in results
3. Open `supabase/setup/set_allowed_email.sql`, replace the placeholder with your `ALLOWED_EMAIL`, and run it in the SQL editor. Until you do, the database rejects every signup.
4. Auth settings (Authentication in the dashboard):
   - Email provider: enabled.
   - URL configuration: set Site URL to your app URL, and add `http://localhost:3000/**` plus `https://<your-domain>/**` to Redirect URLs. The wildcard matters: sign-up and password-reset links carry extra details in the address, and an exact `/auth/callback` entry would not match them.
5. Create the owner account, either way works:
   - In the app: on `/login`, choose "Create the owner account", then click the confirmation link in your email.
   - In the dashboard: Authentication > Users > Add user, with "Auto confirm" ticked.
6. Optional, after the account exists: turn off "Allow new users to sign up". The trigger already blocks other emails; this closes the endpoint entirely.
7. API keys: use the new publishable (`sb_publishable_...`) and secret (`sb_secret_...`) keys. Supabase's legacy `anon` and `service_role` keys stop working at the end of 2026.

## Finding leads (Phase 2)

`/find` searches Google Places (New) for a trade in a town, one town or several in a row.

- **Results per town** is a cap you choose: up to 20, 40 or 60 (default 40). Each town costs 1 Places request to locate it plus 1 per page of 20, so 2, 3 or 4 requests. Google's maximum is 60 results per query.
- Results outside the chosen radius, permanently closed businesses and anything on the do-not-contact list are skipped.
- Leads are matched on `place_id`. Re-running a search never creates duplicates and only refreshes the Google fields. `status`, `notes`, `trade`, contact dates and outreach history are never overwritten.
- Every run is logged in `search_runs` and listed on the page, with a **View leads** link. Each lead remembers the search that first found it (`search_run_id`), so you can see only the new leads from a run (`/leads?run=...`) or export just that search.
- **Google profile signals** come back with every search and refresh at no extra cost, because the request is already in the phone-and-website pricing tier: the main category, all categories, whether the listing has opening hours, and how many photos it has (Google returns at most 10).
- **Rank in results:** each lead stores its position in Google's own results for the search that found it (`search_rank`, with the query). This is a stand-in for local visibility, not Google's actual local pack, which depends on where the searcher is. Leads found before this update fill in the new fields the next time they show up in a search or are refreshed.

### Saved targets

On the Find page, **Save as daily target** stores a trade and town (or several towns) as a saved target. **Run now** searches one immediately. Targets can be paused or deleted; deleting one keeps the leads it found and your search history. A target counts against the same daily Google cap as everything else. The daily job will search active targets automatically once autopilot is turned on.

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

## Daily workflow (Phase 4)

### Dashboard: today's call list

- **Metric cards** at the top: leads found, outreach logged, conversations and calls booked this week, each with the change from last week and an 8-week sparkline (Eastern-time weeks starting Monday).
- **Pipeline:** leads, contacted, replies, calls booked and won, each with the conversion from the stage before. A lead counts at every stage it ever reached, so a lead that later went cold still counts as contacted.
- **Website health:** how many leads have no real website, a weak site (under 50), a fair site (50 to 79), a good site (80+) or are not checked yet. Each line links to the leads table filtered to that group. The scoring buttons live here too.
- **Follow-ups due** today or overdue come first, then **fresh leads**: everything you queued, then the highest-priority new leads, up to 30 (`CALL_LIST_SIZE` in `lib/leads-config.ts`). Leads snoozed to a later day stay off the list.
- Each card has a big call button, the website or "No website", the score, and the "why this lead" line. One tap logs an outcome. "More actions" has not interested, wrong number, snooze, set status and do not contact.
- **Keyboard:** `j`/`k` or the arrow keys move, `1` to `5` log No answer, Voicemail, Spoke, Interested or Booked on the selected lead, `o` opens it. Shortcuts are ignored while typing in a field. Each action takes the lead off today's list and moves to the next one.
- On a phone the sidebar becomes a menu drawer (tap the menu button, swipe or tap outside to close), cards are full width and every button is at least 44px tall.

### What logging an outcome does

Set in `OUTCOME_RULES` in `lib/leads-config.ts`:

| Outcome | Status | Next follow-up |
| --- | --- | --- |
| No answer | Contacted | 2 days |
| Voicemail | Contacted | 3 days |
| Spoke | Contacted | 1 week |
| Interested | Replied | 2 days |
| Booked | Call booked | cleared |
| Not interested | Lost | cleared |
| Wrong number | Lost | cleared |

Status only moves forward (a later no-answer doesn't undo "replied"), won and do-not-contact never change automatically, and a lost lead that turns interested is revived. Follow-ups land at 9am Eastern. Priority is recalculated after every change, so won, lost and do-not-contact drop to 0.

### Do not contact

Marking a lead do not contact (call list, lead page, or bulk) also adds its phone and name to the `suppression` table. Find leads never re-imports a suppressed business, and "Add to queue" never queues one.

- **The status is locked.** A lead on the list can't be moved to another status from the lead page or a bulk action. Bulk actions skip those leads and say how many they skipped.
- **Mistakes:** the lead page has **Remove from do-not-contact list** (with a confirmation). It sets the lead back to New and deletes only the suppression rows made for that lead (same phone, or same name with no phone). If a different business with the same name is also on the list, the lead stays suppressed and the page says so.
- **Failures fail safe.** The suppression row is written before the status changes, so a failure between the two leaves a lead protected but showing its old status, never the other way round.
- Anything that sends email must check the `suppression` table itself, not just the status.

### Leads table (`/leads`)

A search box and filter pills (trade, status, location, website, rating range, phone, site score range, review count range). Each pill opens a small panel; active filters show as chips you can remove one at a time. Sorting by any underlined column, and 50 per page. Filters live in the URL, so a filtered view can be bookmarked. The **Columns** pill hides columns you don't need; the choice is remembered in this browser. Site scores show as small coloured rings with the number inside.

Bulk actions: add to queue (new leads only), set any status, or export the selection. **Export CSV** at the top exports everything matching the filters. The CSV defuses spreadsheet formulas in names and notes.

### Lead page (`/leads/[id]`)

Contact details and priority, a **Website health** panel (score gauge, error/warning/notice counts, and each problem with a plain-English fix), a form to log any channel and outcome with a note, the outreach history timeline, the editable fields (status, next follow-up, trade, notes), and the outreach drafts panel, which arrives in Phase 5. Severity rules for the health panel are in `lib/site-issues.ts`. Google-sourced fields aren't editable because the 30-day refresh would overwrite them.

## Outreach drafts (Phase 5)

Each lead page has a drafts panel with four drafts: **call opener**, **voicemail**, **cold email** and **follow-up email**. They're built from templates in `lib/drafts.ts`, using only what the app knows about the lead: its Google listing (name, trade, town, review count, rating) and the website check. A "Based on" line above the draft lists those facts so you can check them before you use it.

What each lead gets:

| Website | Pitch |
| --- | --- |
| None, social page only, dead or parked | A website, naming exactly what's wrong (e.g. "The listing doesn't link to a website") |
| Weak or fair (under 80) | A website, naming its top three problems from the check (speed, no tap-to-call, no quote form and so on) |
| Good (80+) | Follow-up automation instead of a site: instant replies to quote requests, missed-call text-back and review requests. No price is quoted. |
| Not checked yet, or the site blocked the check | A general note, with a warning to score it or look at it first |

The voice is spare, first person and blunt: no exclamation marks, no urgency, no invented facts. Tests check every variant for exclamation marks and for the compliance footer.

- **Nothing is ever sent.** Each draft is editable. Copy it, or for emails, use **Open in mail app** (a `mailto:` link with the subject and body filled in) and send it yourself.
- **Email compliance:** every email ends with your name, JT Builds Co, your callback number, the line "Reply stop and I won't contact you again." and `BUSINESS_MAILING_ADDRESS`. If that address isn't set, email drafts are blocked with a message saying so. If you edit out the opt-out line, the address or the business name, the panel won't copy the email or open it until you put them back.
- **Sender details:** set `OUTREACH_SENDER_NAME` and `OUTREACH_CALLBACK_PHONE`. Until you do, the drafts say "[your name]" and "[your callback number]" and show a warning.
- **Do not contact:** leads on the do-not-contact list get no drafts.

### Rewrite with Gemini (optional)

If `GEMINI_API_KEY` is set, each draft gets a **Rewrite with Gemini** button. The rewrite is labeled as a Gemini rewrite, and **Back to template** undoes it.

- **Model:** `GEMINI_MODEL` picks the model. It defaults to `gemini-3.8-flash`.
- **What it sends:** only the business name, trade, town, state, review count, rating, the website finding and the template text. It never sends the lead's phone number, address, notes or outreach history. The key goes in a request header, never the URL.
- **Voice and accuracy:** the instructions repeat the voice rules and tell it not to invent facts, quote prices the template doesn't, or offer deals. The app also strips any exclamation marks. Emails get the signature and compliance footer added after the rewrite, so the model can't drop them.
- **Get a key:** create one in Google AI Studio. On the free tier, Google may use what you send to improve its products, so turn on billing for the key's project if that matters to you.

## Demo mode (Phase 7)

Ten made-up leads let you try the whole app with no Google credits and no real businesses.

```
npm run seed:demo          # add (or refresh) the demo leads
npm run seed:demo:remove   # delete them again
```

- **What you get:** leads named "Demo ...", with 555-01xx phone numbers and `.example` websites, so nothing real can be called or emailed. They cover every case: no website, a social page only, a dead site, a parked domain, and weak, fair and good sites. Statuses run from new to won, with outreach spread over eight weeks. The dashboard cards and trends, the pipeline, the website health bar, a follow-up that's due today, and drafts of every kind all have something to show. Sites that score 80 or higher get the automation pitch.
- **Scores and priorities are real calculations.** The demo site scores come from the same calculator the app uses, and the priorities and "why this lead" lines from the same priority function.
- **It writes to the project in `.env.local`,** using `SUPABASE_SECRET_KEY` and the account that matches `ALLOWED_EMAIL`. Sign up first. If that file points at your live project, the demo leads land beside your real ones, which is why every one is clearly labeled "Demo".
- **It only ever touches rows whose `place_id` starts with `demo-`.** Running `seed:demo` again replaces the demo leads rather than duplicating them. `seed:demo:remove` deletes those leads and their outreach history, and nothing else. Your real leads, notes and history are never read or changed.
- **They never cost a Google request.** Demo leads are marked as already scored, and the 30-day Google refresh skips them.
- Remove the demo leads before you begin real outreach.

## Compliance reminders (Phase 6)

**This is a reminder for how the app is built to behave, not legal advice.** Rules change and differ by state. If you're unsure, ask a lawyer who handles marketing law.

### What the app does for you

- **Never sends anything.** Calls are manual (click to call). Emails are drafts you copy or open in your mail app. There is no bulk email and no texting automation in v1.
- **One do-not-contact list.** Marking a lead "do not contact" (call list, lead page or bulk) adds its phone and name to the `suppression` table. Find leads never re-imports a suppressed business, "Add to queue" skips it, and it gets no drafts. Changing the status later does not remove it.
- **Every email carries** your business name, your mailing address and a plain opt-out line, and is blocked without `BUSINESS_MAILING_ADDRESS`.

### Email: CAN-SPAM

The federal CAN-SPAM Act covers commercial email, **including business-to-business** email. The FTC's [compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) is short and worth a read. In short:

- Send from your real address. Don't disguise who you are.
- Keep subject lines honest. The drafts' subjects describe what's in the email.
- Say it's an ad where that isn't obvious. The drafts are plainly a sales note from a named sender.
- Include a valid physical postal address. A registered PO box or registered private mailbox counts. Put it in `BUSINESS_MAILING_ADDRESS`.
- Honor opt-outs. The law gives you up to 10 business days; do it the same day. When someone replies "stop" (or anything like it), open the lead, set the status to **Do not contact**, and don't email or call them again. Don't charge for or require anything to opt out.
- The FTC lists penalties of more than $50,000 per violating email, so one careless mistake isn't worth it.

### Text messages: TCPA and carrier rules

Marketing texts to cell phones generally need the recipient's **prior express written consent** under the federal Telephone Consumer Protection Act, and automated texting also runs into carrier registration rules (10DLC). Many small-business owners list a personal cell number. **That is why v1 has no texting automation, and I'd advise against cold texting too.** "Text" exists in the outreach log only so you can record a message you chose to send yourself.

If you later sell the missed-call text-back or review-request automation to clients, the texting rules apply to *them* and the messages they send to their customers. Get the consent wording right before you offer it.

### Calls: do-not-call and calling hours

- The **National Do Not Call Registry** is aimed at personal numbers, and calls to businesses are generally treated differently. But a sole proprietor's cell phone can count as personal, so treat any cell number with care. You can check numbers at [donotcall.gov](https://www.donotcall.gov).
- You must keep and honor your own do-not-call list. That's the `suppression` table. If someone says "don't call me again", mark them do not contact right away.
- **Calling hours.** Federal rules say 8am to 9pm in the *called person's* local time. State rules can be tighter, and these are from vendor summaries, so **verify them**:
  - **Massachusetts:** reported as 8am to 8pm.
  - **Rhode Island:** reported as weekdays 9am to 6pm and Saturdays 10am to 5pm for residential and mobile numbers, with no calls on legal holidays.
  - **New Hampshire:** I couldn't confirm its rules. Check them yourself.
- **A simple rule that fits all three states:** call weekdays between 9am and 5pm Eastern, skip holidays, and never call after a "don't call again". The app schedules follow-ups for 9am Eastern.
- **Business-to-business exemptions.** Some state telemarketing rules treat calls to businesses differently, and I couldn't confirm how each of the three states does. Don't assume you're exempt.

## Scheduled job (Phase 6)

A Vercel cron job runs once a day at 11:00 UTC (7am or 6am Eastern, depending on daylight saving). It calls `GET /api/cron/maintain`, which:

1. Re-fetches Google details for up to 10 leads not refreshed in 30 days (oldest first), counting each against `MAX_PLACES_REQUESTS_PER_DAY`.
2. Scores up to 5 leads that haven't been scored yet, one at a time.

The batches are small on purpose. Use **Score websites now** on the dashboard for a big backlog.

- **It is protected by `CRON_SECRET`.** Add a long random value as an env var in Vercel. Vercel then sends it as `Authorization: Bearer <CRON_SECRET>` on every cron call. Without the variable the route answers 503, and with a wrong or missing header it answers 401. Generate one with `openssl rand -hex 32`.
- **It needs `SUPABASE_SECRET_KEY`.** The job has no signed-in user, so it uses the server-only service key to do its work. That key bypasses row-level security, so it is only ever used in this route, never sent to a browser and never logged.
- **It needs migration `20261016222802_cron_places_reserve.sql`,** which adds a Places-quota function that only the service role can run. Apply it before the first run.
- **Vercel's free (Hobby) plan allows cron jobs that run once a day.** The schedule is in `vercel.json`. On a paid plan you can run it more often.
- **To test it by hand,** run `curl -H "Authorization: Bearer YOUR_SECRET" https://YOUR-SITE/api/cron/maintain`. It returns a short JSON summary.

## Password reset

On the sign-in page, **Forgot your password?** emails a reset link that returns to the app and opens a "choose a new password" page. Once signed in, **Change password** in the sidebar opens the same page. Only the owner's email gets a link, and the page gives the same answer for any email, so it doesn't reveal which one is allowed.

In Supabase, go to **Authentication → URL Configuration**. Set the **Site URL** to your deployed address, and add these under **Redirect URLs**, or the link will fall back to the Site URL and land on the sign-in page:

- `http://localhost:3000/**`
- `https://YOUR-SITE/**`

Supabase's built-in email service only sends a few messages an hour. If you hit "email rate limit exceeded", wait an hour, or add your own email service under **Authentication → SMTP Settings**.

## Security headers

Every response carries `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and `Strict-Transport-Security`. Production responses also carry a Content-Security-Policy (set in `next.config.ts`): nothing loads from another origin, the app can't be framed, forms post only to the app, and the browser never talks to Supabase directly. It keeps `'unsafe-inline'` for scripts and styles because Next.js writes inline scripts into every page; a nonce-based policy would need the proxy to mint a nonce per request. The policy is off in `npm run dev`, which needs eval for hot reload.

If you add something that loads from outside (an analytics script, a font host, an embedded map), the browser console will show a "Content Security Policy" error and you'll need to allow that host in `next.config.ts`.

## API safety and tests

- **Every route that takes input validates it with zod** and answers errors as `{ "error": "..." }` with a matching status code. Unexpected errors are logged on the server and the browser only sees "Something went wrong. Try again." No stack traces leave the server. The CSV export rejects bad filters with a 400.
- **Every API route requires the signed-in owner**, except `/api/cron/*`, which requires the `CRON_SECRET` instead.
- `npm test` runs the unit tests, including the priority function, the import and dedupe logic, the suppression list, the website scorer's parsing (with mocked network responses), the drafts, and the cron secret check.

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
| `npm run seed:demo` | Adds ten fake demo leads to the project in `.env.local` (see Demo mode) |
| `npm run seed:demo:remove` | Deletes only the demo leads and their history |

## Project structure

```
app/
  (app)/          signed-in pages (dashboard, leads, find) and their shared layout
  api/            route handlers, including the daily job at api/cron/maintain
  forgot-password/  reset-password/   password reset pages
  auth/callback/  email confirmation landing route
  login/          sign-in and owner signup
components/       shared UI
lib/
  supabase/       server, proxy and (cron-only) admin clients
  auth.ts         pure helpers: allowed email check, safe redirects
  session.ts      requireOwner() for server code
  database.types.ts
  demo-data.ts    the ten demo leads
scripts/          seed-demo.ts (demo mode)
supabase/
  migrations/     SQL migrations, applied in order
  setup/          one-off SQL you run by hand
proxy.ts          session refresh and route protection
```

Ideas outside the spec go in `FUTURE.md`.
