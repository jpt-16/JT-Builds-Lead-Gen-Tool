import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiOwner, jsonError, parseJson, unexpectedError } from "@/lib/api";
import { bulkUpdate } from "@/lib/lead-actions";
import { LEAD_STATUSES } from "@/lib/leads-config";

const bulkSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(500),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("set_status"), status: z.enum(LEAD_STATUSES) }),
    z.object({ type: z.literal("queue") }),
  ]),
});

/** POST /api/leads/bulk: change status or add to queue for many leads. */
export async function POST(request: Request) {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");

  const parsed = await parseJson(request, bulkSchema);
  if ("response" in parsed) return parsed.response;

  try {
    return NextResponse.json(await bulkUpdate(auth.supabase, parsed.data.ids, parsed.data.action));
  } catch (error) {
    return unexpectedError("bulk update", error);
  }
}
