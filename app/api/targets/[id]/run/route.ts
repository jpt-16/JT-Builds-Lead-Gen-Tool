import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiOwner, jsonError, unexpectedError } from "@/lib/api";
import { TownNotFoundError } from "@/lib/find-leads";
import { PlacesApiError } from "@/lib/places";
import { DailyLimitError, getPlacesConfig } from "@/lib/places-usage";
import { runTarget } from "@/lib/targets";

// Up to 4 Google requests plus a few database writes.
export const maxDuration = 60;

/** POST /api/targets/[id]/run: search a saved target now. */
export async function POST(_request: Request, ctx: RouteContext<"/api/targets/[id]/run">) {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid target id.");

  const { apiKey, dailyLimit } = getPlacesConfig();
  if (!apiKey) return jsonError(503, "GOOGLE_PLACES_API_KEY is not set. Add it to your environment and restart.");

  try {
    const { data: target, error } = await auth.supabase.from("targets").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!target) return jsonError(404, "Target not found.");
    return NextResponse.json(await runTarget(auth.supabase, target, { apiKey, dailyLimit }));
  } catch (error) {
    if (error instanceof DailyLimitError) return jsonError(429, error.message, { usage: error.usage });
    if (error instanceof TownNotFoundError) return jsonError(422, error.message);
    if (error instanceof PlacesApiError) return jsonError(502, error.message);
    return unexpectedError("run target", error);
  }
}
