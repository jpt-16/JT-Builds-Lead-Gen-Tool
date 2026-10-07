import { NextResponse } from "next/server";
import { getApiOwner, jsonError, unexpectedError } from "@/lib/api";
import { PageSpeedConfigError } from "@/lib/pagespeed";
import { getQueueCounts, scoreNextLead } from "@/lib/score-queue";
import { SeoToolError } from "@/lib/seo-tool";

// One lead per call: a homepage fetch (up to 12s) plus a PageSpeed test (up to 60s).
export const maxDuration = 90;

/**
 * POST /api/score/next: scores the next lead in the queue and returns it with
 * the queue counts. The in-app runner calls this in a loop, one lead at a
 * time with a pause between, so a big batch never hammers anyone.
 */
export async function POST() {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");

  try {
    const lead = await scoreNextLead(auth.supabase);
    const counts = await getQueueCounts(auth.supabase);
    return NextResponse.json({ lead, ...counts });
  } catch (error) {
    if (error instanceof PageSpeedConfigError || error instanceof SeoToolError) return jsonError(503, error.message);
    return unexpectedError("score next lead", error);
  }
}
