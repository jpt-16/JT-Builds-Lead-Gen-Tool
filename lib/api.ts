import "server-only";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { getOwner, type Owner } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Every API route answers errors as { error: string } with a matching status
// code. Unexpected errors are logged server-side and the client gets a
// generic message, never a stack trace.

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Supabase client and owner for an API route, or null if not signed in as the owner. */
export async function getApiOwner(): Promise<{ supabase: Awaited<ReturnType<typeof createClient>>; owner: Owner } | null> {
  const owner = await getOwner();
  if (!owner) return null;
  return { supabase: await createClient(), owner };
}

/** Parses and validates a JSON body. Returns the data or a 400 response. */
export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: jsonError(400, "Request body must be JSON.") };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue?.path.join(".");
    return { response: jsonError(400, field ? `${field}: ${issue.message}` : (issue?.message ?? "Invalid request.")) };
  }
  return { data: result.data };
}

export function unexpectedError(context: string, error: unknown) {
  console.error(`${context}:`, error instanceof Error ? error.message : error);
  return jsonError(500, "Something went wrong. Try again.");
}
