import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiOwner, jsonError, parseJson, unexpectedError } from "@/lib/api";
import { PlacesApiError } from "@/lib/places";
import { getPlacesConfig } from "@/lib/places-usage";
import { refreshStaleLeads } from "@/lib/refresh";

export const maxDuration = 60;

const refreshSchema = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});

/** POST /api/leads/refresh: re-fetch Google details for leads older than 30 days. */
export async function POST(request: Request) {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");

  const parsed = await parseJson(request, refreshSchema);
  if ("response" in parsed) return parsed.response;

  const { apiKey, dailyLimit } = getPlacesConfig();
  if (!apiKey) return jsonError(503, "GOOGLE_PLACES_API_KEY is not set. Add it to your environment and restart.");

  try {
    const summary = await refreshStaleLeads(auth.supabase, { apiKey, dailyLimit, limit: parsed.data.limit });
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof PlacesApiError) return jsonError(502, error.message);
    return unexpectedError("refresh stale leads", error);
  }
}
