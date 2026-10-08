import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LeadStatus, OutreachChannel, OutreachOutcome } from "@/lib/database.types";
import { easternTime, followUpAt } from "@/lib/dates";
import { recomputeDerived } from "@/lib/derived";
import { CLOSED_STATUSES, nextStatus, OUTCOME_RULES } from "@/lib/leads-config";
import { normalizePhone } from "@/lib/phone";
import { buildSuppressionMatcher } from "@/lib/suppression";

type Client = SupabaseClient<Database>;
type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

export class LeadNotFoundError extends Error {
  constructor() {
    super("Lead not found.");
    this.name = "LeadNotFoundError";
  }
}

async function loadLead(supabase: Client, id: string) {
  const { data, error } = await supabase.from("leads").select("id, status, phone, business_name").eq("id", id).maybeSingle();
  if (error) throw new Error(`Could not load lead: ${error.message}`);
  if (!data) throw new LeadNotFoundError();
  return data;
}

/**
 * Logs one outreach attempt and applies OUTCOME_RULES: moves the status
 * forward and sets (or clears) the next follow-up.
 */
export async function logOutreach(
  supabase: Client,
  leadId: string,
  input: { channel: OutreachChannel; outcome: OutreachOutcome | null; note: string | null },
) {
  const lead = await loadLead(supabase, leadId);

  const { error: logError } = await supabase
    .from("outreach_log")
    .insert({ lead_id: leadId, channel: input.channel, outcome: input.outcome, note: input.note });
  if (logError) throw new Error(`Could not log outreach: ${logError.message}`);

  const update: LeadUpdate = { last_contacted_at: new Date().toISOString() };
  if (input.outcome) {
    const rule = OUTCOME_RULES[input.outcome];
    update.status = nextStatus(lead.status, rule.status);
    update.next_follow_up_at = rule.followUpDays ? followUpAt(rule.followUpDays).toISOString() : null;
  } else {
    // An attempt with no outcome yet (e.g. an email sent) still counts as contact.
    update.status = nextStatus(lead.status, "contacted");
  }
  if (CLOSED_STATUSES.includes(update.status!)) update.next_follow_up_at = null;

  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", leadId)
    .select("status, next_follow_up_at")
    .single();
  if (error) throw new Error(`Could not update lead: ${error.message}`);

  await recomputeDerived(supabase, { ids: [leadId] });
  return data;
}

export type LeadPatch = {
  status?: LeadStatus;
  notes?: string | null;
  trade?: string;
  /** YYYY-MM-DD (9am Eastern that day) or null to clear. */
  follow_up_date?: string | null;
  snooze_days?: number;
  dnc_reason?: string;
};

/** Edits the fields that belong to me (never the Google fields). */
export async function updateLead(supabase: Client, leadId: string, patch: LeadPatch) {
  const lead = await loadLead(supabase, leadId);
  const update: LeadUpdate = {};

  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;
  if (patch.trade !== undefined) update.trade = patch.trade.trim();
  if (patch.follow_up_date !== undefined) {
    update.next_follow_up_at = patch.follow_up_date ? easternTime(patch.follow_up_date, 9).toISOString() : null;
  }
  if (patch.snooze_days !== undefined) update.next_follow_up_at = followUpAt(patch.snooze_days).toISOString();
  if (patch.status !== undefined) {
    update.status = patch.status;
    if (CLOSED_STATUSES.includes(patch.status)) update.next_follow_up_at = null;
  }

  if (Object.keys(update).length === 0) return lead;

  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", leadId)
    .select("id, status, notes, trade, next_follow_up_at")
    .single();
  if (error) throw new Error(`Could not update lead: ${error.message}`);

  if (patch.status === "do_not_contact" && lead.status !== "do_not_contact") {
    await addToSuppression(supabase, [lead], patch.dnc_reason ?? "Marked do not contact");
  }
  await recomputeDerived(supabase, { ids: [leadId] });
  return data;
}

export type BulkAction = { type: "set_status"; status: LeadStatus } | { type: "queue" };

/**
 * Applies one action to many leads.
 * "queue" only moves new leads to queued, and never queues a lead on the
 * do-not-contact list; everything else is skipped and counted.
 */
export async function bulkUpdate(supabase: Client, ids: string[], action: BulkAction) {
  const { data: leads, error } = await supabase.from("leads").select("id, status, phone, business_name").in("id", ids);
  if (error) throw new Error(`Could not load leads: ${error.message}`);
  const found = leads ?? [];

  let targets = found;
  if (action.type === "queue") {
    const { data: suppression, error: suppressionError } = await supabase.from("suppression").select("phone, email, business_name");
    if (suppressionError) throw new Error(`Could not load suppression list: ${suppressionError.message}`);
    const isSuppressed = buildSuppressionMatcher(suppression ?? []);
    targets = found.filter((l) => l.status === "new" && !isSuppressed(l));
  }

  if (targets.length) {
    const status: LeadStatus = action.type === "queue" ? "queued" : action.status;
    const update: LeadUpdate = { status };
    if (CLOSED_STATUSES.includes(status)) update.next_follow_up_at = null;
    const { error: updateError } = await supabase
      .from("leads")
      .update(update)
      .in(
        "id",
        targets.map((l) => l.id),
      );
    if (updateError) throw new Error(`Could not update leads: ${updateError.message}`);

    if (status === "do_not_contact") {
      await addToSuppression(
        supabase,
        targets.filter((l) => l.status !== "do_not_contact"),
        "Marked do not contact",
      );
    }
    await recomputeDerived(supabase, { ids: targets.map((l) => l.id) });
  }

  return { updated: targets.length, skipped: ids.length - targets.length };
}

/** Adds leads to the do-not-contact list so Find leads never re-imports or re-queues them. */
async function addToSuppression(supabase: Client, leads: { phone: string | null; business_name: string }[], reason: string) {
  if (!leads.length) return;
  const rows = leads.map((l) => ({ phone: normalizePhone(l.phone), business_name: l.business_name, reason }));
  const { error } = await supabase.from("suppression").insert(rows);
  if (error) throw new Error(`Could not add to the do-not-contact list: ${error.message}`);
}
