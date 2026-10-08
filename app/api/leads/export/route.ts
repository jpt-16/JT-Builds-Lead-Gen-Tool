import { getApiOwner, jsonError, unexpectedError } from "@/lib/api";
import { toCsv } from "@/lib/csv";
import { easternDate } from "@/lib/dates";
import { buildLeadsQuery, parseLeadFilters } from "@/lib/lead-query";

const MAX_ROWS = 5000;

const COLUMNS = [
  "business_name",
  "trade",
  "phone",
  "website_url",
  "site_status",
  "score_total",
  "priority_score",
  "why_this_lead",
  "status",
  "address",
  "city",
  "state",
  "rating",
  "review_count",
  "notes",
  "last_contacted_at",
  "next_follow_up_at",
  "first_found_at",
  "google_maps_url",
] as const;

/**
 * GET /api/leads/export: CSV of the leads matching the same filters as the
 * leads table (or ?ids=a,b,c for a selection).
 */
export async function GET(request: Request) {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = parseLeadFilters(params);

  try {
    const { data, error } = await buildLeadsQuery(auth.supabase, filters, COLUMNS.join(", ")).limit(MAX_ROWS);
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => COLUMNS.map((c) => row[c]));
    return new Response(toCsv([...COLUMNS], rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="jt-leads-${easternDate()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return unexpectedError("export leads", error);
  }
}
