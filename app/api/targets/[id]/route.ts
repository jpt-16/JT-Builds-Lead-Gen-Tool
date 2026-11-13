import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiOwner, jsonError, parseJson, unexpectedError } from "@/lib/api";

const patchSchema = z.object({ active: z.boolean() });

/** PATCH /api/targets/[id]: pause or resume a saved target. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/targets/[id]">) {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid target id.");
  const parsed = await parseJson(request, patchSchema);
  if ("response" in parsed) return parsed.response;

  try {
    const { data, error } = await auth.supabase.from("targets").update({ active: parsed.data.active }).eq("id", id).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return jsonError(404, "Target not found.");
    return NextResponse.json(data);
  } catch (error) {
    return unexpectedError("update target", error);
  }
}

/** DELETE /api/targets/[id]: remove a saved target. Leads it found are kept; past searches lose only the link to it. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/targets/[id]">) {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid target id.");

  try {
    const { data, error } = await auth.supabase.from("targets").delete().eq("id", id).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return jsonError(404, "Target not found.");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return unexpectedError("delete target", error);
  }
}
