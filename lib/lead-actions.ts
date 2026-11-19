import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LeadStatus, OutreachChannel, OutreachOutcome } from "@/lib/database.types";
import { easternTime, followUpAt } from "@/lib/dates";
import { recomputeDerived } from "@/lib/derived";
import { CLOSED_STATUSES, nextStatus, OUTCOME_RULES } from "@/lib/leads-config";
import { normalizePhone } from "@/lib/phone";
import { buildSuppressionMatcher, normalizeBusinessName } from "@/lib/suppression";

type Client = SupabaseClient<Database>;
type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

export class LeadNotFoundError extends Error {
  constructor() {
    super("Lead not found.");
    this.name = "LeadNotFoundError";
  }
}

/** The lead is on the do-not-contact list and its status can't be changed by accident. */
export class DoNotContactLockedError extends Error {
  constructor() {
    super('This lead is on the do-not-contact list. Use "Remove from do-not-contact list" first if that was a mistake.');
    this.name = "DoNotContactLockedError";
  }
}

export class NotDoNotContactError extends Error {
  constructor() {
    super("This lead is not on the do-not-contact list.");
    this.name = "NotDoNotContactError";
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

  const { data, error } = await supabase.from("leads").update(update).eq("id", leadId).select("status, next_follow_up_at").single();
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
  // Do-not-contact is a promise to someone. A stray click or bulk action must
  // not quietly undo it; removing it is its own, confirmed action.
  if (lead.status === "do_not_contact" && patch.status !== undefined && patch.status !== "do_not_contact") {
    throw new DoNotContactLockedError();
  }
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

  // Suppress first, then change the status. If the second step fails, the
  // lead is protected but still shows its old status, never the reverse.
  if (patch.status === "do_not_contact" && lead.status !== "do_not_contact") {
    await addToSuppression(supabase, [lead], patch.dnc_reason ?? "Marked do not contact");
  }

  const { data, error } = await supabase.from("leads").update(update).eq("id", leadId).select("id, status, notes, trade, next_follow_up_at").single();
  if (error) throw new Error(`Could not update lead: ${error.message}`);

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

  const status: LeadStatus = action.type === "queue" ? "queued" : action.status;
  let targets = found;
  if (action.type === "queue") {
    const { data: suppression, error: suppressionError } = await supabase.from("suppression").select("phone, email, business_name");
    if (suppressionError) throw new Error(`Could not load suppression list: ${suppressionError.message}`);
    const isSuppressed = buildSuppressionMatcher(suppression ?? []);
    targets = found.filter((l) => l.status === "new" && !isSuppressed(l));
  } else if (status !== "do_not_contact") {
    // A bulk status change never takes a lead off the do-not-contact list.
    targets = found.filter((l) => l.status !== "do_not_contact");
  }

  if (targets.length) {
    // Suppress first, then change the status (see updateLead).
    if (status === "do_not_contact") {
      await addToSuppression(
        supabase,
        targets.filter((l) => l.status !== "do_not_contact"),
        "Marked do not contact",
      );
    }

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

    await recomputeDerived(supabase, { ids: targets.map((l) => l.id) });
  }

  return { updated: targets.length, skipped: ids.length - targets.length };
}

/**
 * Takes a lead off the do-not-contact list: for a mistake, such as a stray
 * click. Sets the lead back to New and removes the suppression rows that were
 * created for it (same phone, or same name with no phone). Rows that belong to
 * a different business with the same name are left alone, so the result says
 * when the lead is still suppressed by one.
 */
export async function removeFromDoNotContact(supabase: Client, leadId: string) {
  const lead = await loadLead(supabase, leadId);
  if (lead.status !== "do_not_contact") throw new NotDoNotContactError();

  const { data: rows, error } = await supabase.from("suppression").select("id, phone, email, business_name");
  if (error) throw new Error(`Could not load the do-not-contact list: ${error.message}`);

  const phone = normalizePhone(lead.phone);
  const name = normalizeBusinessName(lead.business_name);
  const own = (rows ?? []).filter((row) => {
    const rowPhone = normalizePhone(row.phone);
    if (phone && rowPhone === phone) return true;
    return Boolean(name && normalizeBusinessName(row.business_name) === name && rowPhone === null);
  });
  const ownIds = new Set(own.map((row) => row.id));
  const remaining = (rows ?? []).filter((row) => !ownIds.has(row.id));

  // Status first: if the removal below fails, the lead is a normal lead that
  // is still suppressed, which is the safe way round.
  const { error: updateError } = await supabase.from("leads").update({ status: "new", next_follow_up_at: null }).eq("id", leadId);
  if (updateError) throw new Error(`Could not update lead: ${updateError.message}`);

  if (own.length) {
    const { error: deleteError } = await supabase
      .from("suppression")
      .delete()
      .in(
        "id",
        own.map((row) => row.id),
      );
    if (deleteError) throw new Error(`Could not remove from the do-not-contact list: ${deleteError.message}`);
  }

  await recomputeDerived(supabase, { ids: [leadId] });
  return { status: "new" as const, removed: own.length, stillSuppressed: buildSuppressionMatcher(remaining)(lead) };
}

/** Adds leads to the do-not-contact list so Find leads never re-imports or re-queues them. */
async function addToSuppression(supabase: Client, leads: { phone: string | null; business_name: string }[], reason: string) {
  if (!leads.length) return;
  const { data: existing, error: loadError } = await supabase.from("suppression").select("phone, business_name");
  if (loadError) throw new Error(`Could not load the do-not-contact list: ${loadError.message}`);
  const key = (phone: string | null, name: string | null) => `${normalizePhone(phone) ?? ""}|${normalizeBusinessName(name) ?? ""}`;
  const have = new Set((existing ?? []).map((row) => key(row.phone, row.business_name)));

  const rows = leads
    .map((l) => ({ phone: normalizePhone(l.phone), business_name: l.business_name, reason }))
    .filter((row) => {
      const k = key(row.phone, row.business_name);
      if (have.has(k)) return false;
      have.add(k); // also collapses duplicates within this batch
      return true;
    });
  if (!rows.length) return;
  const { error } = await supabase.from("suppression").insert(rows);
  if (error) throw new Error(`Could not add to the do-not-contact list: ${error.message}`);
}
