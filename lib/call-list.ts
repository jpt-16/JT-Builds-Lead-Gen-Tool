import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { endOfTodayEastern, startOfWeekEastern } from "@/lib/dates";
import { bucketByWeek, toMetric, weekStarts, type WeeklyMetric } from "@/lib/activity";
import { CALL_LIST_SIZE, CLOSED_STATUSES } from "@/lib/leads-config";
import { healthBand } from "@/lib/site-issues";

type Client = SupabaseClient<Database>;

export const CALL_LIST_COLUMNS =
  "id, business_name, trade, city, state, phone, website_url, site_status, score_total, priority_score, why_this_lead, status, next_follow_up_at, last_contacted_at";

export type CallListLead = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  | "id"
  | "business_name"
  | "trade"
  | "city"
  | "state"
  | "phone"
  | "website_url"
  | "site_status"
  | "score_total"
  | "priority_score"
  | "why_this_lead"
  | "status"
  | "next_follow_up_at"
  | "last_contacted_at"
>;

/**
 * Today's call list:
 * 1. Follow-ups due today or overdue (any open status), oldest first.
 * 2. Then fresh leads: everything I queued, then the highest-priority new
 *    leads, up to CALL_LIST_SIZE. Leads snoozed to a later day are left out.
 */
export async function getCallList(supabase: Client): Promise<{ due: CallListLead[]; fresh: CallListLead[] }> {
  const endOfToday = endOfTodayEastern().toISOString();
  // Leave out leads snoozed to a later day: keep no follow-up, or one already due.
  const notSnoozed = `next_follow_up_at.is.null,next_follow_up_at.lt.${endOfToday}`;

  const [due, queued, fresh] = await Promise.all([
    supabase
      .from("leads")
      .select(CALL_LIST_COLUMNS)
      .lt("next_follow_up_at", endOfToday)
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .order("next_follow_up_at", { ascending: true })
      .limit(100),
    supabase
      .from("leads")
      .select(CALL_LIST_COLUMNS)
      .eq("status", "queued")
      .or(notSnoozed)
      .order("priority_score", { ascending: false })
      .limit(CALL_LIST_SIZE),
    supabase
      .from("leads")
      .select(CALL_LIST_COLUMNS)
      .eq("status", "new")
      .or(notSnoozed)
      .order("priority_score", { ascending: false })
      .order("review_count", { ascending: true })
      .limit(CALL_LIST_SIZE),
  ]);
  for (const result of [due, queued, fresh]) {
    if (result.error) throw new Error(`Could not load the call list: ${result.error.message}`);
  }

  const dueLeads = due.data ?? [];
  const dueIds = new Set(dueLeads.map((l) => l.id));
  const freshLeads = [...(queued.data ?? []), ...(fresh.data ?? [])].filter((l) => !dueIds.has(l.id)).slice(0, CALL_LIST_SIZE);
  return { due: dueLeads, fresh: freshLeads };
}

export type Funnel = { found_this_week: number; total: number; contacted: number; replied: number; booked: number; won: number };

export async function getFunnel(supabase: Client): Promise<Funnel> {
  const { data, error } = await supabase.rpc("lead_funnel", { week_start: startOfWeekEastern().toISOString() });
  if (error) throw new Error(`Could not load stats: ${error.message}`);
  return data?.[0] ?? { found_this_week: 0, total: 0, contacted: 0, replied: 0, booked: 0, won: 0 };
}

const CONVERSATION_OUTCOMES = ["spoke", "interested", "not_interested", "booked"];

export type Activity = {
  leadsFound: WeeklyMetric;
  outreach: WeeklyMetric;
  conversations: WeeklyMetric;
  booked: WeeklyMetric;
};

/** Leads found, outreach logged, conversations and calls booked per week, for the last 8 weeks. */
export async function getWeeklyActivity(supabase: Client): Promise<Activity> {
  const starts = weekStarts();
  const since = starts[0].toISOString();
  const [leads, logs] = await Promise.all([
    supabase.from("leads").select("first_found_at").gte("first_found_at", since).limit(20_000),
    supabase.from("outreach_log").select("created_at, outcome").gte("created_at", since).limit(20_000),
  ]);
  if (leads.error || logs.error) throw new Error("Could not load weekly activity.");

  const logRows = logs.data ?? [];
  return {
    leadsFound: toMetric(bucketByWeek((leads.data ?? []).map((l) => l.first_found_at), starts)),
    outreach: toMetric(bucketByWeek(logRows.map((l) => l.created_at), starts)),
    conversations: toMetric(
      bucketByWeek(
        logRows.filter((l) => l.outcome && CONVERSATION_OUTCOMES.includes(l.outcome)).map((l) => l.created_at),
        starts,
      ),
    ),
    booked: toMetric(bucketByWeek(logRows.filter((l) => l.outcome === "booked").map((l) => l.created_at), starts)),
  };
}

export type HealthDistribution = { noRealSite: number; weak: number; fair: number; good: number; unchecked: number };

/** How many leads fall in each website-health band. */
export async function getHealthDistribution(supabase: Client): Promise<HealthDistribution> {
  const { data, error } = await supabase.from("leads").select("site_status, score_total").limit(50_000);
  if (error) throw new Error(`Could not load website health: ${error.message}`);
  const dist: HealthDistribution = { noRealSite: 0, weak: 0, fair: 0, good: 0, unchecked: 0 };
  for (const lead of data ?? []) {
    if (lead.site_status && ["none", "social", "dead", "parked"].includes(lead.site_status)) dist.noRealSite++;
    else if (lead.score_total === null) dist.unchecked++;
    else dist[healthBand(lead.score_total)]++;
  }
  return dist;
}
