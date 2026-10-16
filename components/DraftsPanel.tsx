"use client";

import { useState } from "react";
import { composeEmail, type DraftKind, type Drafts, type EmailDraft, emailComplianceProblem } from "@/lib/drafts";

// Outreach drafts for one lead. Every draft is editable, and nothing is ever
// sent from here: copy it, or open it in the mail app and send it yourself.

const TABS: { kind: DraftKind; label: string }[] = [
  { kind: "call", label: "Call" },
  { kind: "voicemail", label: "Voicemail" },
  { kind: "email", label: "Email" },
  { kind: "follow_up", label: "Follow-up" },
];

type Draft = { subject?: string; text: string; source: "template" | "gemini" };

function initialDrafts(drafts: Drafts): Partial<Record<DraftKind, Draft>> {
  const email = (d: EmailDraft | { blocked: string }): Draft | undefined =>
    "blocked" in d ? undefined : { subject: d.subject, text: composeEmail(d), source: "template" };
  return {
    call: { text: drafts.call, source: "template" },
    voicemail: { text: drafts.voicemail, source: "template" },
    email: email(drafts.email),
    follow_up: email(drafts.followUp),
  };
}

export function DraftsPanel({
  leadId,
  drafts,
  mailingAddress,
  geminiModel,
}: {
  leadId: string;
  drafts: Drafts;
  mailingAddress: string | null;
  geminiModel: string | null;
}) {
  const [kind, setKind] = useState<DraftKind>("call");
  const [current, setCurrent] = useState(() => initialDrafts(drafts));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);

  const template = initialDrafts(drafts)[kind];
  const draft = current[kind];
  const emailSource = kind === "email" ? drafts.email : kind === "follow_up" ? drafts.followUp : null;
  const blocked = emailSource && "blocked" in emailSource ? emailSource.blocked : null;
  const isEmail = emailSource !== null;
  const changed = draft && template && (draft.text !== template.text || draft.subject !== template.subject);

  function update(patch: Partial<Draft>) {
    setCurrent((prev) => ({ ...prev, [kind]: { ...prev[kind]!, ...patch } }));
  }

  /** For emails, refuses if the opt-out line, address or business name was edited out. */
  function sendable(): boolean {
    if (!isEmail || !draft || !mailingAddress) return true;
    const problem = emailComplianceProblem(draft.text, mailingAddress);
    if (problem) setStatus({ text: problem, error: true });
    return !problem;
  }

  async function copy(value: string, what: string) {
    if (!sendable()) return;
    try {
      await navigator.clipboard.writeText(value);
      setStatus({ text: `${what} copied.` });
    } catch {
      setStatus({ text: "Couldn't copy. Select the text and copy it yourself.", error: true });
    }
  }

  function openMail() {
    if (!draft || !sendable()) return;
    const params = `subject=${encodeURIComponent(draft.subject ?? "")}&body=${encodeURIComponent(draft.text.replace(/\n/g, "\r\n"))}`;
    window.location.href = `mailto:?${params}`;
  }

  async function rewrite() {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/leads/${leadId}/drafts/rewrite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus({ text: data.error ?? `Rewrite failed (${response.status}).`, error: true });
      } else if (emailSource && !("blocked" in emailSource)) {
        update({ subject: data.subject ?? emailSource.subject, text: composeEmail({ ...emailSource, body: data.text }), source: "gemini" });
        setStatus({ text: "Rewritten by Gemini. Read it before you use it." });
      } else {
        update({ text: data.text, source: "gemini" });
        setStatus({ text: "Rewritten by Gemini. Read it before you use it." });
      }
    } catch {
      setStatus({ text: "Network error. The draft wasn't changed.", error: true });
    }
    setBusy(false);
  }

  return (
    <section className="card space-y-4" aria-labelledby="drafts-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="drafts-heading" className="text-base font-semibold text-ink">
          Outreach drafts
        </h2>
        <fieldset className="inline-flex rounded-lg border border-line bg-surface-2 p-1">
          <legend className="sr-only">Draft</legend>
          {TABS.map((tab) => (
            <label
              key={tab.kind}
              className={`inline-flex min-h-10 cursor-pointer items-center rounded-md px-3 text-sm font-semibold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent ${
                kind === tab.kind ? "bg-surface text-ink shadow-sm ring-1 ring-line" : "text-ink-2 hover:text-ink"
              }`}
            >
              <input
                type="radio"
                name="draft-kind"
                value={tab.kind}
                checked={kind === tab.kind}
                onChange={() => {
                  setKind(tab.kind);
                  setStatus(null);
                }}
                className="sr-only"
              />
              {tab.label}
            </label>
          ))}
        </fieldset>
      </div>

      <p className="text-sm text-muted">
        <span className="font-medium text-ink-2">Based on:</span> {drafts.basedOn.join(" · ")}
      </p>

      {drafts.warnings.map((warning) => (
        <p key={warning} className="alert-warning">
          {warning}
        </p>
      ))}

      {blocked ? (
        <p role="alert" className="alert-error">
          {blocked}
        </p>
      ) : (
        draft && (
          <>
            {isEmail && (
              <label className="block">
                <span className="field-label">Subject</span>
                <input className="field-input" value={draft.subject ?? ""} onChange={(e) => update({ subject: e.target.value })} />
              </label>
            )}
            <label className="block">
              <span className="field-label flex flex-wrap items-center gap-2">
                {isEmail ? "Message" : "Script"}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                    draft.source === "gemini" ? "bg-accent-soft text-accent ring-accent/30" : "bg-surface-2 text-ink-2 ring-line"
                  }`}
                >
                  {draft.source === "gemini" ? `Gemini rewrite (${geminiModel})` : "Template"}
                  {changed && draft.source === "template" ? ", edited" : ""}
                </span>
              </span>
              <textarea
                className="field-input max-h-[75vh] min-h-72 field-sizing-content py-2 leading-relaxed"
                value={draft.text}
                onChange={(e) => update({ text: e.target.value })}
                spellCheck
              />
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary" onClick={() => copy(draft.text, isEmail ? "Message" : "Script")}>
                Copy {isEmail ? "message" : "script"}
              </button>
              {isEmail && (
                <>
                  <button type="button" className="btn-secondary" onClick={() => copy(draft.subject ?? "", "Subject")}>
                    Copy subject
                  </button>
                  <button type="button" className="btn-secondary" onClick={openMail}>
                    Open in mail app
                  </button>
                </>
              )}
              {geminiModel && (
                <button type="button" className="btn-secondary" onClick={rewrite} disabled={busy}>
                  {busy ? "Rewriting…" : "Rewrite with Gemini"}
                </button>
              )}
              {changed && template && (
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => {
                    update(template);
                    setStatus({ text: "Back to the template." });
                  }}
                >
                  Back to template
                </button>
              )}
            </div>
          </>
        )
      )}

      <div aria-live="polite">{status && <p className={status.error ? "alert-error" : "alert-success"}>{status.text}</p>}</div>

      <p className="text-xs text-muted">
        Nothing is sent from here. Copy a draft, or open it in your mail app and send it yourself.
        {geminiModel && " Gemini rewrites send only the business's Google listing facts, the website check and the template text. The lead's phone number, notes and history stay here."}
      </p>
    </section>
  );
}
