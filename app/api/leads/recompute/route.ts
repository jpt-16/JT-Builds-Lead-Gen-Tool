import { NextResponse } from "next/server";
import { getApiOwner, jsonError, unexpectedError } from "@/lib/api";
import { recomputeDerived } from "@/lib/derived";

export const maxDuration = 60;

/** POST /api/leads/recompute: re-applies the priority function to every lead. No external calls. */
export async function POST() {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");

  try {
    const updated = await recomputeDerived(auth.supabase);
    return NextResponse.json({ updated });
  } catch (error) {
    return unexpectedError("recompute priorities", error);
  }
}
