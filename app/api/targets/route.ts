import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiOwner, jsonError, parseJson, unexpectedError } from "@/lib/api";
import { DEFAULT_RESULT_CAP, RESULT_CAPS, STATES } from "@/lib/find-leads-config";

const nameText = z
  .string()
  .trim()
  .min(2, "Too short.")
  .max(60, "Too long.")
  .regex(/^[\p{L}\p{N} .,'&/-]+$/u, "Letters, numbers, spaces and . , ' & / - only.");

const createSchema = z.object({
  trade: nameText,
  city: nameText,
  state: z.enum(STATES),
  radiusM: z.number().int().min(1000).max(50_000),
  maxResults: z
    .number()
    .int()
    .refine((n) => (RESULT_CAPS as readonly number[]).includes(n), "Choose 20, 40 or 60.")
    .default(DEFAULT_RESULT_CAP),
});

const MAX_TARGETS = 100;

/** POST /api/targets: save a trade + town for the daily job to search. */
export async function POST(request: Request) {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");
  const parsed = await parseJson(request, createSchema);
  if ("response" in parsed) return parsed.response;
  const { trade, city, state, radiusM, maxResults } = parsed.data;

  try {
    const { count, error: countError } = await auth.supabase.from("targets").select("id", { count: "exact", head: true });
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) >= MAX_TARGETS) return jsonError(409, `You can save up to ${MAX_TARGETS} targets. Delete some first.`);

    const { data, error } = await auth.supabase
      .from("targets")
      .insert({ trade, city, state, radius_m: radiusM, max_results: maxResults })
      .select("*")
      .single();
    if (error) {
      // 23505 = the unique index on (trade, town, state).
      if (error.code === "23505") return jsonError(409, `${trade} in ${city}, ${state} is already saved.`);
      throw new Error(error.message);
    }
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return unexpectedError("create target", error);
  }
}
