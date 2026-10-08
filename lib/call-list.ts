import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { endOfTodayEastern, startOfWeekEastern } from "@/lib/dates";
import { CALL_LIST_SIZE, CLOSED_STATUSES } from "@/lib/leads-config";

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
