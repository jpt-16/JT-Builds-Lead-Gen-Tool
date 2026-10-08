import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiOwner, jsonError, parseJson, unexpectedError } from "@/lib/api";
import { LeadNotFoundError, logOutreach } from "@/lib/lead-actions";
import { CHANNELS, OUTCOMES } from "@/lib/leads-config";

const outreachSchema = z.object({
  channel: z.enum(CHANNELS),
  outcome: z.enum(OUTCOMES).nullable().default(null),
  note: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .default(null)
    .transform((v) => v || null),
});

/** POST /api/leads/[id]/outreach: log a call, email, DM or visit and apply its outcome. */
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/outreach">) {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid lead id.");
  const parsed = await parseJson(request, outreachSchema);
  if ("response" in parsed) return parsed.response;

  try {
    return NextResponse.json(await logOutreach(auth.supabase, id, parsed.data));
  } catch (error) {
    if (error instanceof LeadNotFoundError) return jsonError(404, error.message);
    return unexpectedError("log outreach", error);
  }
}
