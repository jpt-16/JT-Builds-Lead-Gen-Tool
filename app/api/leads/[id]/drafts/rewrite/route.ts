import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiOwner, jsonError, parseJson, unexpectedError } from "@/lib/api";
import { buildDrafts, DRAFT_FIELDS, DRAFT_KINDS, draftFacts, type DraftLead } from "@/lib/drafts";
import { getGeminiConfig, rewriteDraft, RewriteError } from "@/lib/gemini";
import { getOutreachConfig } from "@/lib/outreach-config";

const rewriteSchema = z.object({ kind: z.enum(DRAFT_KINDS) });

/**
 * POST /api/leads/[id]/drafts/rewrite: rewrite one template draft with Gemini.
 * The template is rebuilt here from the database, so only the lead's public
 * facts and the template text ever go to Gemini. Nothing is sent anywhere else.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/leads/[id]/drafts/rewrite">) {
  const auth = await getApiOwner();
  if (!auth) return jsonError(401, "Not signed in.");

  const gemini = getGeminiConfig();
  if (!gemini) return jsonError(400, "Gemini rewrites are off. Set GEMINI_API_KEY to turn them on.");

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(400, "Invalid lead id.");
  const parsed = await parseJson(request, rewriteSchema);
  if ("response" in parsed) return parsed.response;
  const { kind } = parsed.data;

  try {
    const { data, error } = await auth.supabase.from("leads").select(`${DRAFT_FIELDS}, status`).eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return jsonError(404, "Lead not found.");
    if (data.status === "do_not_contact") return jsonError(409, "This lead is on the do-not-contact list.");

    const lead = data as unknown as DraftLead;
    const drafts = buildDrafts(lead, getOutreachConfig());
    const email = kind === "email" ? drafts.email : kind === "follow_up" ? drafts.followUp : null;
    if (email && "blocked" in email) return jsonError(400, email.blocked);

    const result = await rewriteDraft(gemini, {
      kind,
      facts: draftFacts(lead),
      subject: email?.subject,
      text: email ? email.body : kind === "call" ? drafts.call : drafts.voicemail,
    });
    return NextResponse.json({ ...result, model: gemini.model });
  } catch (error) {
    if (error instanceof RewriteError) return jsonError(502, error.message);
    return unexpectedError("rewrite draft", error);
  }
}
