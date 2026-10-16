import { NextResponse } from "next/server";
import { jsonError, unexpectedError } from "@/lib/api";
import { CRON_REFRESH_BATCH, CRON_SCORE_BATCH, CRON_TIME_BUDGET_MS, isAuthorizedCron } from "@/lib/cron";
import { PageSpeedConfigError } from "@/lib/pagespeed";
import { getPlacesConfig } from "@/lib/places-usage";
import { refreshStaleLeads } from "@/lib/refresh";
import { scoreNextLead } from "@/lib/score-queue";
import { SeoToolError } from "@/lib/seo-tool";
import { createAdminClient } from "@/lib/supabase/admin";

// One lead takes up to ~70s to score, so give the run room.
export const maxDuration = 300;

/**
 * GET /api/cron/maintain: the scheduled job (see vercel.json). Refreshes a few
 * stale leads, then scores a few unscored ones. Small batches on purpose; the
 * dashboard's "Score websites now" handles big backlogs. Protected by
 * CRON_SECRET: Vercel sends it as "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return jsonError(503, "CRON_SECRET is not set, so the cron job is disabled.");
  if (!isAuthorizedCron(request.headers.get("authorization"), secret)) return jsonError(401, "Unauthorized.");

  const started = Date.now();
  try {
    const supabase = createAdminClient();
    const summary: Record<string, unknown> = {};

    const { apiKey, dailyLimit } = getPlacesConfig();
    if (apiKey) {
      const refresh = await refreshStaleLeads(supabase, { apiKey, dailyLimit, limit: CRON_REFRESH_BATCH, asOwner: true });
      summary.refresh = {
        refreshed: refresh.refreshed,
        notFound: refresh.notFound,
        limitReached: refresh.limitReached,
        remainingStale: refresh.remainingStale,
      };
    } else {
      summary.refresh = "skipped: GOOGLE_PLACES_API_KEY is not set";
    }

    let scored = 0;
    try {
      while (scored < CRON_SCORE_BATCH && Date.now() - started < CRON_TIME_BUDGET_MS) {
        const lead = await scoreNextLead(supabase);
        if (!lead) break;
        scored++;
      }
      summary.scored = scored;
    } catch (error) {
      // Setup problems (bad PageSpeed key, SEO tool down) affect every lead:
      // report them and keep the refresh results.
      if (!(error instanceof PageSpeedConfigError || error instanceof SeoToolError)) throw error;
      summary.scored = scored;
      summary.scoringStopped = error.message;
    }

    return NextResponse.json({ ok: true, ...summary, seconds: Math.round((Date.now() - started) / 1000) });
  } catch (error) {
    return unexpectedError("cron maintain", error);
  }
}
