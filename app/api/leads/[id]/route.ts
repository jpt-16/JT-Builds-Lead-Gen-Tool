import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiOwner, jsonError, parseJson, unexpectedError } from "@/lib/api";
import { LeadNotFoundError, updateLead } from "@/lib/lead-actions";
import { LEAD_STATUSES } from "@/lib/leads-config";

const patchSchema = z
  .object({
    status: z.enum(LEAD_STATUSES).optional(),
    notes: z.string().max(5000).nullable().optional(),
    trade: z.string().trim().min(2).max(60).optional(),
    follow_up_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
      .nullable()
      .optional(),
    snooze_days: z.number().int().min(1).max(365).optional(),
    dnc_reason: z.string().trim().max(200).optional(),
  })
  .refine((p) => Object.keys(p).length > 0, "Nothing to update.");

const idSchema = z.uuid();

/** PATCH /api/leads/[id]: edit status, notes, trade or the next follow-up. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/leads/[id]">) {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return jsonError(400, "Invalid lead id.");
  const parsed = await parseJson(request, patchSchema);
  if ("response" in parsed) return parsed.response;

  try {
    return NextResponse.json(await updateLead(auth.supabase, id, parsed.data));
  } catch (error) {
    if (error instanceof LeadNotFoundError) return jsonError(404, error.message);
    return unexpectedError("update lead", error);
  }
}
