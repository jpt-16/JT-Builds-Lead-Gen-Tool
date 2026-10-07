import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { computePriority, whyThisLead } from "@/lib/priority";

type Client = SupabaseClient<Database>;

const COLUMNS =
  "id, status, site_status, score_total, score_breakdown, review_count, rating, phone, website_url, trade, city, state, priority_score, why_this_lead";
const PAGE = 1000;

/**
 * Recomputes priority_score and why_this_lead for the given leads (by id or
 * place_id), or for every lead when no filter is given. Only rows whose values
 * changed are written, in one round trip. Returns how many changed.
 */
export async function recomputeDerived(
  supabase: Client,
  filter?: { ids?: string[]; placeIds?: string[] },
): Promise<number> {
  const rows = await loadRows(supabase, filter);

  const changed = rows
    .map((row) => ({ id: row.id, priority_score: computePriority(row), why_this_lead: whyThisLead(row), row }))
    .filter((r) => r.priority_score !== r.row.priority_score || r.why_this_lead !== r.row.why_this_lead)
    .map(({ id, priority_score, why_this_lead }) => ({ id, priority_score, why_this_lead }));

  let updated = 0;
  for (let i = 0; i < changed.length; i += 500) {
    const { data, error } = await supabase.rpc("set_lead_priorities", { payload: changed.slice(i, i + 500) });
    if (error) throw new Error(`Could not save priorities: ${error.message}`);
    updated += data ?? 0;
  }
  return updated;
}

async function loadRows(supabase: Client, filter?: { ids?: string[]; placeIds?: string[] }) {
  if (filter?.ids || filter?.placeIds) {
    const column = filter.ids ? "id" : "place_id";
    const values = filter.ids ?? filter.placeIds ?? [];
    const rows = [];
    for (let i = 0; i < values.length; i += 200) {
      const { data, error } = await supabase.from("leads").select(COLUMNS).in(column, values.slice(i, i + 200));
      if (error) throw new Error(`Could not load leads: ${error.message}`);
      rows.push(...(data ?? []));
    }
    return rows;
  }

  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("leads")
      .select(COLUMNS)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Could not load leads: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}
