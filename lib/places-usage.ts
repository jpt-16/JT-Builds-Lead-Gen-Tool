import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { easternDate } from "@/lib/dates";
import type { Usage } from "@/lib/find-leads-config";

type Client = SupabaseClient<Database>;

export const DEFAULT_DAILY_LIMIT = 30;

export class DailyLimitError extends Error {
  constructor(readonly usage: Usage) {
    super(
      `Daily Places API limit reached (${usage.used} of ${usage.limit} requests used today). It resets at midnight Eastern, or raise MAX_PLACES_REQUESTS_PER_DAY.`,
    );
    this.name = "DailyLimitError";
  }
}

/** Places settings from env. apiKey is null when GOOGLE_PLACES_API_KEY is unset. */
export function getPlacesConfig() {
  const parsed = Number.parseInt(process.env.MAX_PLACES_REQUESTS_PER_DAY ?? "", 10);
  return {
    apiKey: process.env.GOOGLE_PLACES_API_KEY || null,
    dailyLimit: Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_LIMIT,
  };
}


export async function getUsageToday(supabase: Client, limit: number): Promise<Usage> {
  const { data, error } = await supabase
    .from("places_usage")
    .select("request_count")
    .eq("day", easternDate())
    .maybeSingle();
  if (error) throw new Error(`Could not read Places usage: ${error.message}`);
  return { used: data?.request_count ?? 0, limit };
}

/**
 * Reserves one Places request against today's limit. Call this right before
 * every request to Google. Returns the usage after reserving, or throws
 * DailyLimitError if the limit is reached.
 * Pass `ownerId` only from the cron job, which uses the service-role client
 * and has no signed-in user; everywhere else the signed-in user is the owner.
 */
export async function reservePlacesRequest(supabase: Client, limit: number, ownerId?: string): Promise<Usage> {
  const { data, error } = ownerId
    ? await supabase.rpc("reserve_places_requests_for", { owner: ownerId, requested: 1, daily_limit: limit })
    : await supabase.rpc("reserve_places_requests", { requested: 1, daily_limit: limit });
  if (error) throw new Error(`Could not reserve a Places request: ${error.message}`);
  const row = data?.[0];
  if (!row?.allowed) throw new DailyLimitError({ used: row?.used ?? limit, limit });
  return { used: row.used, limit };
}
