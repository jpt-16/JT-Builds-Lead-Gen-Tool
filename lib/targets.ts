import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { SearchSummary, State } from "@/lib/find-leads-config";
import { runSearch } from "@/lib/find-leads";

type Client = SupabaseClient<Database>;
export type Target = Database["public"]["Tables"]["targets"]["Row"];

/**
 * Runs one saved target as a normal search and records the outcome on the
 * target. The daily job uses this too, passing `ownerId` because it has no
 * signed-in user; signed-in callers leave it out. Errors (daily limit, Google down, town
 * not found) are left for the caller; the target keeps its old last-run info.
 */
export async function runTarget(
  supabase: Client,
  target: Target,
  config: { apiKey: string; dailyLimit: number; ownerId?: string },
): Promise<SearchSummary> {
  const summary = await runSearch(
    supabase,
    {
      trade: target.trade,
      city: target.city,
      state: target.state as State,
      radiusM: target.radius_m,
      maxResults: target.max_results,
      targetId: target.id,
    },
    config,
  );
  const { error } = await supabase
    .from("targets")
    .update({ last_run_at: new Date().toISOString(), last_run_found: summary.resultsFound, last_run_new: summary.newLeads })
    .eq("id", target.id);
  if (error) throw new Error(`Could not update the target: ${error.message}`);
  return summary;
}
