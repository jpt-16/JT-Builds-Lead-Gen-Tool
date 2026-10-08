import type { LeadStatus } from "@/lib/database.types";
import { STATUS_LABELS } from "@/lib/leads-config";

// Status is always written out; colour only reinforces it.
const TONE: Record<LeadStatus, string> = {
  new: "border-neutral-500 text-neutral-200",
  queued: "border-accent-500 text-accent-300",
  contacted: "border-neutral-500 text-neutral-200",
  replied: "border-accent-500 text-accent-300",
  call_booked: "border-accent-400 text-accent-200",
  won: "border-success/60 text-success",
  lost: "border-neutral-600 text-muted",
  do_not_contact: "border-danger/50 text-danger",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[11px] tracking-[0.12em] uppercase ${TONE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
