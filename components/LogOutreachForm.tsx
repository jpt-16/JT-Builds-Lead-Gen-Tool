"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OutreachChannel, OutreachOutcome } from "@/lib/database.types";
import { CHANNEL_LABELS, CHANNELS, OUTCOME_LABELS, OUTCOMES } from "@/lib/leads-config";

export function LogOutreachForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [channel, setChannel] = useState<OutreachChannel>("call");
  const [outcome, setOutcome] = useState<OutreachOutcome | "">("no_answer");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, outcome: outcome || null, note: note || null }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setNote("");
        setMessage({ text: "Logged." });
        router.refresh();
      } else {
        setMessage({ text: data.error ?? `Failed (${response.status}).`, error: true });
      }
    } catch {
      setMessage({ text: "Network error. Nothing was saved.", error: true });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="card space-y-4" aria-labelledby="log-heading">
      <h2 id="log-heading" className="text-lg">
        Log outreach
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="field-label">Channel</span>
          <select className="field-input" value={channel} onChange={(e) => setChannel(e.target.value as OutreachChannel)}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABELS[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="field-label">Outcome</span>
          <select className="field-input" value={outcome} onChange={(e) => setOutcome(e.target.value as OutreachOutcome | "")}>
            <option value="">No outcome yet (e.g. email sent)</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="field-label">Note</span>
        <textarea className="field-input min-h-20 py-2" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Log it"}
        </button>
        <p className="text-xs text-muted">Moves the status forward and sets the next follow-up automatically.</p>
      </div>
      <div aria-live="polite">{message && <p className={message.error ? "alert-error" : "alert-success"}>{message.text}</p>}</div>
    </form>
  );
}
