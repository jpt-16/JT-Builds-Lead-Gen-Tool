"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LeadStatus } from "@/lib/database.types";
import { easternDate } from "@/lib/dates";
import { LEAD_STATUSES, STATUS_LABELS } from "@/lib/leads-config";

type EditableLead = {
  id: string;
  business_name: string;
  status: LeadStatus;
  trade: string | null;
  notes: string | null;
  next_follow_up_at: string | null;
};

/** My fields on a lead. Google fields are not editable here because a refresh would overwrite them. */
export function LeadEditor({ lead }: { lead: EditableLead }) {
  const router = useRouter();
  const initialDate = lead.next_follow_up_at ? easternDate(new Date(lead.next_follow_up_at)) : "";
  const [status, setStatus] = useState(lead.status);
  const [trade, setTrade] = useState(lead.trade ?? "");
  const [followUp, setFollowUp] = useState(initialDate);
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function patch(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setMessage({ text: done });
        router.refresh();
      } else {
        setMessage({ text: data.error ?? `Failed (${response.status}).`, error: true });
      }
    } catch {
      setMessage({ text: "Network error. Nothing was saved.", error: true });
    }
    setBusy(false);
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    const body: Record<string, unknown> = {};
    if (status !== lead.status) body.status = status;
    if (trade.trim() && trade.trim() !== (lead.trade ?? "")) body.trade = trade.trim();
    if (followUp !== initialDate) body.follow_up_date = followUp || null;
    if (notes !== (lead.notes ?? "")) body.notes = notes;
    if (!Object.keys(body).length) return setMessage({ text: "No changes to save." });
    patch(body, "Saved.");
  }

  function doNotContact() {
    if (!window.confirm(`Mark ${lead.business_name} do not contact? They will be added to the suppression list and never re-imported.`)) return;
    patch({ status: "do_not_contact" }, "Marked do not contact and added to the suppression list.");
  }

  return (
    <form onSubmit={save} className="card space-y-4" aria-labelledby="edit-heading">
      <h2 id="edit-heading" className="text-lg">
        Details
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Status</span>
          <select className="field-input" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Next follow-up</span>
          <input type="date" className="field-input" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </label>
        <label className="sm:col-span-2">
          <span className="field-label">Trade</span>
          <input className="field-input" value={trade} onChange={(e) => setTrade(e.target.value)} maxLength={60} />
        </label>
      </div>
      <label className="block">
        <span className="field-label">Notes</span>
        <textarea className="field-input min-h-28 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
      </label>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        {lead.status !== "do_not_contact" && (
          <button type="button" className="btn border-danger/60 text-danger hover:bg-danger/10" disabled={busy} onClick={doNotContact}>
            Do not contact
          </button>
        )}
      </div>
      <div aria-live="polite">{message && <p className={message.error ? "alert-error" : "alert-success"}>{message.text}</p>}</div>
    </form>
  );
}
