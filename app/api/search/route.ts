import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiOwner, jsonError, parseJson, unexpectedError } from "@/lib/api";
import { STATES } from "@/lib/find-leads-config";
import { runSearch, TownNotFoundError } from "@/lib/find-leads";
import { PlacesApiError } from "@/lib/places";
import { DailyLimitError, getPlacesConfig } from "@/lib/places-usage";

// Up to 4 Google requests plus a few database writes.
export const maxDuration = 60;

const nameText = z
  .string()
  .trim()
  .min(2, "Too short.")
  .max(60, "Too long.")
  .regex(/^[\p{L}\p{N} .,'&/-]+$/u, "Letters, numbers, spaces and . , ' & / - only.");

const searchSchema = z.object({
  trade: nameText,
  city: nameText,
  state: z.enum(STATES),
  radiusM: z.number().int().min(1000).max(50_000),
});

/** POST /api/search: one Find leads search for one town. Bulk mode calls this once per town. */
export async function POST(request: Request) {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");

  const parsed = await parseJson(request, searchSchema);
  if ("response" in parsed) return parsed.response;

  const { apiKey, dailyLimit } = getPlacesConfig();
  if (!apiKey) return jsonError(503, "GOOGLE_PLACES_API_KEY is not set. Add it to your environment and restart.");

  try {
    const summary = await runSearch(auth.supabase, parsed.data, { apiKey, dailyLimit });
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof DailyLimitError) return jsonError(429, error.message, { usage: error.usage });
    if (error instanceof TownNotFoundError) return jsonError(422, error.message);
    if (error instanceof PlacesApiError) return jsonError(502, error.message);
    return unexpectedError("search", error);
  }
}
