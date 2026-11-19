# Deployment checklist

Work top to bottom and tick each box. Nothing here changes your data without you doing it: you apply the migrations, you set the keys, you press deploy.

Time needed: about an hour, most of it in Google Cloud and Supabase.

## 0. Before you start

- [ ] The code is on GitHub (branch `claude/eloquent-mayer-6i4eir`, or `main` once you merge it).
- [ ] You can sign in to Supabase, Google Cloud and Vercel.
- [ ] A password manager is open. You'll create several keys. Paste each one straight into Vercel (step 4) and nowhere else. Never put a key in the code, in GitHub, or in a chat.
- [ ] Optional: try the app with fake data first. See "Demo mode" in the README (`npm run seed:demo`).

## 1. Supabase

You already have a project ("JT-Builds-Lead-Gen-Tool"). To start fresh on a new project, do steps 1 to 5.

- [ ] **Create the project** (Supabase dashboard > New project). Pick a region close to where you'll use it. Save the database password somewhere safe. The app never uses it.
- [ ] **Apply the migrations in order** (SQL editor, one file at a time, or `supabase link` then `supabase db push`). Read each file before you run it. They are in `supabase/migrations/`:
  1. `20261007141435_initial_schema.sql`
  2. `20261007141444_rls_and_signup_lock.sql`
  3. `20261007170640_places_usage.sql`
  4. `20261007234951_scoring.sql`
  5. `20261008003320_lead_funnel.sql`
  6. `20261016222802_cron_places_reserve.sql`
  7. `20261119182930_backup_before_prospecting_upgrade.sql` (copies your data into a private `backup` schema; run this before the next one)
  8. `20261119183021_search_upgrade.sql`
- [ ] **Lock signup to your email.** Open `supabase/setup/set_allowed_email.sql`, put your address in place of `you@example.com`, and run it. Until you do, every signup is rejected.
- [ ] **Auth settings** (Authentication in the dashboard):
  - Email provider is on, and "Confirm email" is on.
  - **URL Configuration:** set the Site URL to your final app address (you get it in step 4, so come back). Under Redirect URLs add `http://localhost:3000/**` and `https://YOUR-APP-ADDRESS/**`. The password reset and sign-up links need these. Without them they fall back to the sign-in page.
  - Leaked password protection (Authentication > Policies or Providers): turn it on if your plan has it. It checks new passwords against known breaches.
  - Optional: Authentication > SMTP Settings. Supabase's built-in email sends only a few messages an hour. That's enough for one person, but add your own sender if you get "email rate limit exceeded".
- [ ] **Create your account** (either way):
  - Authentication > Users > Add user, tick "Auto confirm", or
  - open the app's `/login` and choose "Create the owner account", then click the email link.
- [ ] **After your account exists:** Authentication > Sign In / Providers, turn off "Allow new users to sign up". The database already blocks other emails, and this closes the door completely. Password reset still works for your account.
- [ ] **Copy the three values for Vercel** (Project Settings > API Keys): the project URL, the publishable key (`sb_publishable_...`) and the secret key (`sb_secret_...`). Use these new keys. Supabase's old `anon` and `service_role` keys stop working at the end of 2026.
- [ ] **Check the advisors** (Advisors > Security). The only warning you should see is "Leaked password protection", if your plan doesn't include it.
- [ ] **Backups:** the free plan has no point-in-time restore. Export your leads as CSV from the Leads page now and then.

## 2. Google Cloud

One Google Cloud project is fine.

- [ ] **Create or choose a project** at console.cloud.google.com and **attach a billing account** (Places needs one, even to use the free allowance).
- [ ] **Enable two APIs** (APIs & Services > Library): **Places API (New)** and **PageSpeed Insights API**. Enable "Places API (New)", not the older "Places API".
- [ ] **Create an API key** (APIs & Services > Credentials > Create credentials > API key).
- [ ] **Restrict the key:**
  - API restrictions: select **Places API (New)** and **PageSpeed Insights API** only.
  - Application restrictions: leave "None". Vercel's outgoing addresses aren't fixed, so an IP restriction would break the app. The key stays safe because it lives only in Vercel's server settings.
  - Optional: make a second key for PageSpeed alone and put it in `GOOGLE_PAGESPEED_API_KEY`.
- [ ] **Set a billing alert** (Billing > Budgets & alerts > Create budget). A budget of a few dollars with alerts at 50%, 90% and 100% is plenty. An alert tells you; it does not stop spending.
- [ ] **Set a hard quota** so a bug or a leaked key can't run up a bill (APIs & Services > Enabled APIs > Places API (New) > Quotas & System Limits). Lower the per-day request limit to something small, such as 100. This one does stop requests.
- [ ] **Know what it costs.** The app's own cap, `MAX_PLACES_REQUESTS_PER_DAY` (default 30), keeps you near Google's free monthly allowance for text searches. Check Google's current Places pricing page, because prices change. PageSpeed Insights is free with a key.

## 3. Optional keys

- [ ] **Gemini rewrite button:** make a key at Google AI Studio and use it as `GEMINI_API_KEY`. Leave it empty to use templates only. On the free tier Google may use what you send to improve its products, so turn on billing for the key's project if that matters to you.
- [ ] **Your SEO audit tool:** only if you want it to replace the built-in scorer, set `SEO_TOOL_URL` and `SEO_TOOL_API_KEY`.

## 4. Vercel

- [ ] **Import the project:** vercel.com > Add New > Project > pick the GitHub repository. Framework is detected as Next.js. Leave the build settings alone. Set the **Production Branch** to the branch you deploy from.
- [ ] **Add the environment variables** (Settings > Environment Variables) before the first deploy. Use the table below. Mark the secret ones **Sensitive**.
- [ ] **Function region** (Settings > Functions): choose one close to your Supabase region. A Supabase project in `us-west-2` (Oregon) pairs well with Portland (`pdx1`) or San Francisco (`sfo1`). The app makes many small database calls, so distance adds up.
- [ ] **Deploy.** Copy the production address, then go back to Supabase and set the Site URL and Redirect URLs from step 1.
- [ ] **Cron job:** nothing to configure. `vercel.json` sets it to run daily at 11:00 UTC, and Vercel picks it up on production deploys. Check it under Settings > Cron Jobs. Vercel's free (Hobby) plan allows jobs that run once a day, which matches this.
- [ ] **If the build complains about `maxDuration`**, lower it in `app/api/cron/maintain/route.ts`, `app/api/score/next/route.ts` and `app/api/leads/recompute/route.ts` to what your plan allows.

### Environment variables

| Variable | Needed? | Where it comes from |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Required | Supabase > Project Settings > API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Required | Supabase > API Keys (`sb_publishable_...`). Safe in the browser by design. |
| `SUPABASE_SECRET_KEY` | Required for the cron job and the demo seed | Supabase > API Keys (`sb_secret_...`). **Sensitive.** Server only. |
| `ALLOWED_EMAIL` | Required | Your email. Must match what you ran in `set_allowed_email.sql`. |
| `CRON_SECRET` | Required for the cron job | A long random value: run `openssl rand -hex 32`. **Sensitive.** Vercel sends it automatically. |
| `GOOGLE_PLACES_API_KEY` | Required to find leads | Google Cloud key from step 2. **Sensitive.** |
| `MAX_PLACES_REQUESTS_PER_DAY` | Optional (default 30) | Your daily cap on Google requests |
| `GOOGLE_PAGESPEED_API_KEY` | Optional | A separate Google key for PageSpeed. If empty, the Places key is used. **Sensitive.** |
| `BUSINESS_MAILING_ADDRESS` | Required for email drafts | Your mailing address or registered PO box |
| `OUTREACH_SENDER_NAME` | Recommended | Your first name, for scripts and signatures |
| `OUTREACH_CALLBACK_PHONE` | Recommended | The number prospects should call back |
| `GEMINI_API_KEY` | Optional | Google AI Studio. **Sensitive.** |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-3.8-flash` |
| `SEO_TOOL_URL`, `SEO_TOOL_API_KEY` | Optional | Your own SEO tool. **Sensitive.** |

`.env.example` has the same list with a one-line comment for each. Never commit a real `.env.local`.

## 5. After the first deploy: smoke test

- [ ] Open the production address. You land on the sign-in page. Sign in with your email and password.
- [ ] The dashboard loads, with no "database is missing something" message.
- [ ] Signed out, `https://YOUR-APP/api/leads/export` answers `{"error":"Not signed in"}` (401), not a file.
- [ ] **Find leads:** search one small town. Expect about 4 Google requests and some new leads. The page shows today's usage.
- [ ] **Score websites now** on the dashboard scores a few leads. If it says PageSpeed rejected the key, enable the PageSpeed Insights API for that key.
- [ ] Open a lead. The Outreach drafts panel fills in your name, number and mailing address. Email drafts are not blocked.
- [ ] **Cron:** run it once by hand and read the answer.
  ```
  curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-APP/api/cron/maintain
  ```
  Expect `{"ok":true, ...}`. With a wrong or missing secret it answers 401. If you get a page of HTML from Vercel instead, check Deployment Protection in the project settings.
- [ ] **Forgot password:** use "Forgot your password?" once to check the email and the redirect work.
- [ ] Vercel > Logs shows no red errors. Supabase > Advisors shows nothing new.

## 6. Ongoing

- [ ] When a migration is added to `supabase/migrations/`, read it and apply it to Supabase **before** deploying the code that needs it.
- [ ] If a key leaks, make a new one, paste it into Vercel, redeploy, then delete the old one. Do this for the Supabase secret key, the Google keys and `CRON_SECRET`.
- [ ] Keep an eye on the Google billing alert emails.
- [ ] Remove demo leads before you start real outreach: `npm run seed:demo:remove`.
