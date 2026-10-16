import type { LeadStatus } from "@/lib/database.types";
import { STATUS_LABELS } from "@/lib/leads-config";

// Status is always written out; colour only reinforces it.
const TONE: Record<LeadStatus, string> = {
  new: "bg-surface-2 text-ink-2 ring-line-strong/50",
  queued: "bg-accent-soft text-accent ring-accent/30",
  contacted: "bg-notice-soft text-notice ring-notice-line",
  replied: "bg-accent-soft text-accent ring-accent/30",
  call_booked: "bg-accent-soft text-accent ring-accent/30",
  won: "bg-success-soft text-success ring-success-line",
  lost: "bg-surface-2 text-muted ring-line",
  do_not_contact: "bg-danger-soft text-danger ring-danger-line",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${TONE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
