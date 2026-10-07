import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database.types";
import { recomputeDerived } from "@/lib/derived";
import { PageSpeedConfigError } from "@/lib/pagespeed";
import { MAX_SCORE_ATTEMPTS, RetryableScoringError, scoreSite } from "@/lib/scoring";
import { SeoToolError } from "@/lib/seo-tool";

type Client = SupabaseClient<Database>;

// The scoring queue is every lead with scored_at = null. Workers take one lead
// at a time: claim it, score it, save it. A claim older than this is treated
// as abandoned (the worker crashed or timed out) and can be retaken.
const CLAIM_EXPIRES_MS = 5 * 60 * 1000;

export type ScoredLead = {
  id: string;
  business_name: string;
  site_status: string | null;
  score_total: number | null;
  error?: string;
};

export async function getQueueCounts(supabase: Client): Promise<{ pending: number; failed: number }> {
  const base = () => supabase.from("leads").select("id", { count: "exact", head: true }).is("scored_at", null);
  const [pending, failed] = await Promise.all([
    base().lt("score_attempts", MAX_SCORE_ATTEMPTS),
    base().gte("score_attempts", MAX_SCORE_ATTEMPTS),
  ]);
  if (pending.error || failed.error) throw new Error("Could not count the scoring queue.");
  return { pending: pending.count ?? 0, failed: failed.count ?? 0 };
}

/**
 * Scores the next lead in the queue, if any. Returns the lead it worked on
 * (null when the queue is empty or another worker took the lead first).
 * Throws PageSpeedConfigError / SeoToolError for setup problems that would
 * make every lead fail, after releasing the claim.
 */
export async function scoreNextLead(supabase: Client): Promise<ScoredLead | null> {
  const claimCutoff = new Date(Date.now() - CLAIM_EXPIRES_MS).toISOString();
  const { data: candidates, error } = await supabase
    .from("leads")
    .select("id, business_name, website_url, score_attempts")
    .is("scored_at", null)
    .lt("score_attempts", MAX_SCORE_ATTEMPTS)
    .or(`scoring_started_at.is.null,scoring_started_at.lt.${claimCutoff}`)
    .order("first_found_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`Could not read the scoring queue: ${error.message}`);
  const lead = candidates?.[0];
  if (!lead) return null;

  // Claim it. Matching on the current attempt count makes this safe when two
  // workers pick the same lead: only one update succeeds.
  const attempt = lead.score_attempts + 1;
  const { data: claimed, error: claimError } = await supabase
    .from("leads")
    .update({ scoring_started_at: new Date().toISOString(), score_attempts: attempt })
    .eq("id", lead.id)
    .eq("score_attempts", lead.score_attempts)
    .is("scored_at", null)
    .select("id");
  if (claimError) throw new Error(`Could not claim a lead: ${claimError.message}`);
  if (!claimed?.length) return null;

  const result: ScoredLead = { id: lead.id, business_name: lead.business_name, site_status: null, score_total: null };

  if (!lead.website_url) {
    await save(supabase, lead.id, { site_status: "none", scored_at: new Date().toISOString() });
    result.site_status = "none";
    return result;
  }

  try {
    const scored = await scoreSite(lead.website_url, { attempt });
    await save(supabase, lead.id, {
      site_status: scored.siteStatus,
      score_total: scored.scoreTotal,
      score_breakdown: scored.breakdown as unknown as Json,
      scored_at: new Date().toISOString(),
      score_error: null,
    });
    result.site_status = scored.siteStatus;
    result.score_total = scored.scoreTotal;
  } catch (scoreError) {
    if (scoreError instanceof RetryableScoringError) {
      await save(supabase, lead.id, { score_error: scoreError.message });
      result.error = `${scoreError.message} Will retry.`;
      return result;
    }
    if (scoreError instanceof PageSpeedConfigError || (scoreError instanceof SeoToolError && !scoreError.retryable)) {
      // Setup problem that would fail every lead: give the attempt back and
      // let the caller stop and report it.
      await supabase
        .from("leads")
        .update({ scoring_started_at: null, score_attempts: lead.score_attempts })
        .eq("id", lead.id);
      throw scoreError;
    }
    // Anything else is specific to this site. Use up the attempt so one odd
    // site cannot block the queue.
    console.error("scoring:", lead.id, scoreError instanceof Error ? scoreError.message : scoreError);
    await save(supabase, lead.id, { score_error: "Unexpected error while checking this site." });
    result.error = "Unexpected error while checking this site.";
    return result;
  }

  await recomputeDerived(supabase, { ids: [lead.id] });
  return result;
}

async function save(supabase: Client, id: string, fields: Database["public"]["Tables"]["leads"]["Update"]) {
  const { error } = await supabase
    .from("leads")
    .update({ ...fields, scoring_started_at: null })
    .eq("id", id);
  if (error) throw new Error(`Could not save the score: ${error.message}`);
}
