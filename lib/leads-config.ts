// Lead statuses, outreach outcomes and what logging an outcome does.
// Shared by the client and the server.

import type { LeadStatus, OutreachChannel, OutreachOutcome } from "@/lib/database.types";

export const LEAD_STATUSES = [
  "new",
  "queued",
  "contacted",
  "replied",
  "call_booked",
  "won",
  "lost",
  "do_not_contact",
] as const satisfies readonly LeadStatus[];

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  queued: "Queued",
  contacted: "Contacted",
  replied: "Replied",
  call_booked: "Call booked",
  won: "Won",
  lost: "Lost",
  do_not_contact: "Do not contact",
};

export const CHANNELS = ["call", "email", "text", "instagram_dm", "in_person"] as const satisfies readonly OutreachChannel[];

export const CHANNEL_LABELS: Record<OutreachChannel, string> = {
  call: "Call",
  email: "Email",
  text: "Text",
  instagram_dm: "Instagram DM",
  in_person: "In person",
};

export const OUTCOMES = [
  "no_answer",
  "voicemail",
  "spoke",
  "interested",
  "booked",
  "not_interested",
  "wrong_number",
] as const satisfies readonly OutreachOutcome[];

export const OUTCOME_LABELS: Record<OutreachOutcome, string> = {
  no_answer: "No answer",
  voicemail: "Voicemail",
  spoke: "Spoke",
  interested: "Interested",
  booked: "Booked",
  not_interested: "Not interested",
  wrong_number: "Wrong number",
};

/** Call list keyboard shortcuts 1 to 5, in this order. */
export const QUICK_OUTCOMES = ["no_answer", "voicemail", "spoke", "interested", "booked"] as const satisfies readonly OutreachOutcome[];

/** How many fresh leads the daily call list shows (follow-ups due are added on top). */
export const CALL_LIST_SIZE = 30;

export const SNOOZE_OPTIONS = [
  { days: 1, label: "Tomorrow" },
  { days: 3, label: "3 days" },
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 30, label: "1 month" },
];

/**
 * What logging an outcome does to the lead. Tune here.
 * status: the stage the lead moves to (it never moves backwards; see nextStatus).
 * followUpDays: when it comes back on the call list, or null to clear it.
 */
export const OUTCOME_RULES: Record<OutreachOutcome, { status: LeadStatus; followUpDays: number | null }> = {
  no_answer: { status: "contacted", followUpDays: 2 },
  voicemail: { status: "contacted", followUpDays: 3 },
  spoke: { status: "contacted", followUpDays: 7 },
  interested: { status: "replied", followUpDays: 2 },
  booked: { status: "call_booked", followUpDays: null },
  not_interested: { status: "lost", followUpDays: null },
  wrong_number: { status: "lost", followUpDays: null },
};

const FORWARD_ORDER: LeadStatus[] = ["new", "queued", "contacted", "replied", "call_booked", "won"];

/**
 * The status after logging an outcome that points at `target`.
 * - Won and do-not-contact are final and never change automatically.
 * - Lost is applied from any open stage.
 * - Otherwise the lead only moves forward (a "no answer" on a lead that
 *   already replied keeps it at replied). A lost lead that turns
 *   interested again is revived.
 */
export function nextStatus(current: LeadStatus, target: LeadStatus): LeadStatus {
  if (current === "won" || current === "do_not_contact") return current;
  if (target === "lost") return "lost";
  if (current === "lost") return target;
  return FORWARD_ORDER.indexOf(target) > FORWARD_ORDER.indexOf(current) ? target : current;
}

/** Finished statuses: no follow-ups, never on the call list. */
export const CLOSED_STATUSES: LeadStatus[] = ["won", "lost", "do_not_contact"];
