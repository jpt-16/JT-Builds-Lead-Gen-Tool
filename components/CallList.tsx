"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { LeadStatus, OutreachOutcome } from "@/lib/database.types";
import { formatDay } from "@/lib/format";
import { LEAD_STATUSES, OUTCOME_LABELS, QUICK_OUTCOMES, SNOOZE_OPTIONS, STATUS_LABELS } from "@/lib/leads-config";
import type { CallListLead } from "@/lib/call-list";

type Row = CallListLead & { section: "due" | "fresh" };

const SITE_TEXT: Record<string, string> = {
  none: "No website",
  social: "Social page only",
  dead: "Website down",
  parked: "Parked domain",
};

/**
 * Today's calls. Built for working through 30 calls fast:
 * j/k or arrows move, 1-5 log an outcome on the selected lead, o opens it.
 * Every action removes the lead from today's list and moves to the next.
 * Large tap targets so it works one-handed on a phone.
 */
export function CallList({ due, fresh }: { due: CallListLead[]; fresh: CallListLead[] }) {
  const router = useRouter();
  // Leads acted on this session disappear at once; the server data (refreshed
  // after each action) stays the source of truth for everything else.
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const rows = useMemo(() => toRows(due, fresh).filter((r) => !removed.has(r.id)), [due, fresh, removed]);
  const [selectedRaw, setSelected] = useState(0);
  const selected = Math.min(selectedRaw, Math.max(rows.length - 1, 0));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const rowRefs = useRef<Record<string, HTMLLIElement | null>>({});

  async function act(row: Row, request: () => Promise<Response>, success: (data: Record<string, unknown>) => string) {
    setBusyId(row.id);
    setMessage(null);
    try {
      const response = await request();
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage({ text: data.error ?? `Failed (${response.status}).`, error: true });
        return;
      }
      setRemoved((prev) => new Set(prev).add(row.id));
      setNotes(({ [row.id]: _, ...rest }) => rest);
      setMessage({ text: success(data) });
      router.refresh();
    } catch {
      setMessage({ text: "Network error. Nothing was saved.", error: true });
    } finally {
      setBusyId(null);
    }
  }

  function logOutcome(row: Row, outcome: OutreachOutcome) {
    act(
      row,
      () => post(`/api/leads/${row.id}/outreach`, "POST", { channel: "call", outcome, note: notes[row.id] ?? null }),
      (data) => {
        const followUp = typeof data.next_follow_up_at === "string" ? ` Follow up ${formatDay(data.next_follow_up_at)}.` : "";
        return `${OUTCOME_LABELS[outcome]}: ${row.business_name}.${followUp}`;
      },
    );
  }

  function snooze(row: Row, days: number, label: string) {
    act(row, () => post(`/api/leads/${row.id}`, "PATCH", { snooze_days: days }), () => `Snoozed ${row.business_name} until ${label.toLowerCase()}.`);
  }

  function setStatus(row: Row, status: LeadStatus) {
    act(row, () => post(`/api/leads/${row.id}`, "PATCH", { status }), () => `${row.business_name} is now ${STATUS_LABELS[status].toLowerCase()}.`);
  }

  function doNotContact(row: Row) {
    if (!window.confirm(`Mark ${row.business_name} do not contact? They will be added to the suppression list.`)) return;
    act(
      row,
      () => post(`/api/leads/${row.id}`, "PATCH", { status: "do_not_contact" }),
      () => `${row.business_name} marked do not contact and suppressed.`,
    );
  }

  // Keyboard shortcuts. Ignored while typing in a field.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement;
      if (target.closest("input, textarea, select, [contenteditable=true]")) return;
      const row = rows[selected];

      if (event.key === "j" || event.key === "ArrowDown") {
        event.preventDefault();
        setSelected(Math.min(selected + 1, rows.length - 1));
      } else if (event.key === "k" || event.key === "ArrowUp") {
        event.preventDefault();
        setSelected(Math.max(selected - 1, 0));
      } else if (row && !busyId && /^[1-5]$/.test(event.key)) {
        event.preventDefault();
        logOutcome(row, QUICK_OUTCOMES[Number(event.key) - 1]);
      } else if (row && event.key === "o") {
        router.push(`/leads/${row.id}`);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const row = rows[selected];
    if (row) rowRefs.current[row.id]?.scrollIntoView({ block: "nearest" });
  }, [selected, rows]);

  const dueRows = rows.filter((r) => r.section === "due");
  const freshRows = rows.filter((r) => r.section === "fresh");

  return (
    <section aria-labelledby="calls-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="eyebrow">Today</p>
          <h2 id="calls-heading" className="mt-1 text-2xl">
            Call list
          </h2>
        </div>
        <p className="hidden text-xs text-muted md:block">
          <Kbd>j</Kbd>/<Kbd>k</Kbd> move · {QUICK_OUTCOMES.map((o, i) => (
            <span key={o}>
              <Kbd>{i + 1}</Kbd> {OUTCOME_LABELS[o]} ·{" "}
            </span>
          ))}
          <Kbd>o</Kbd> open
        </p>
      </div>

      <div aria-live="polite" className="min-h-0">
        {message && <p className={message.error ? "alert-error" : "alert-success"}>{message.text}</p>}
      </div>

      {rows.length === 0 && (
        <p className="card text-sm text-muted">
          Nothing left for today. Find more leads, or check back when follow-ups come due.
        </p>
      )}

      {[
        { title: "Follow-ups due", items: dueRows },
        { title: "Fresh leads", items: freshRows },
      ].map(
        (group) =>
          group.items.length > 0 && (
            <div key={group.title} className="space-y-3">
              <h3 className="text-xs tracking-[0.2em] text-muted uppercase">
                {group.title} ({group.items.length})
              </h3>
              <ol className="space-y-3">
                {group.items.map((row) => {
                  const index = rows.indexOf(row);
                  const isSelected = index === selected;
                  return (
                    <li
                      key={row.id}
                      ref={(el) => {
                        rowRefs.current[row.id] = el;
                      }}
                      onFocus={() => setSelected(index)}
                      onClick={() => setSelected(index)}
                      aria-current={isSelected ? "true" : undefined}
                      className={`card space-y-3 transition-shadow ${isSelected ? "shadow-[0_0_0_1px_var(--color-accent-500)]" : ""} ${
                        busyId === row.id ? "opacity-60" : ""
                      }`}
                    >
                      <LeadSummary row={row} />

                      <div className="flex flex-wrap items-center gap-3">
                        {row.phone ? (
                          <a href={`tel:${row.phone}`} className="btn-primary min-h-12 grow text-sm sm:grow-0">
                            Call {row.phone}
                          </a>
                        ) : (
                          <span className="text-sm text-danger">No phone listed</span>
                        )}
                        {row.website_url && row.site_status !== "social" ? (
                          <a href={row.website_url} target="_blank" rel="noopener noreferrer" className="btn-link text-sm">
                            {row.site_status && SITE_TEXT[row.site_status] ? SITE_TEXT[row.site_status] : "Website"}
                            {row.score_total !== null ? ` · ${row.score_total}/100` : ""}
                          </a>
                        ) : (
                          <span className="text-sm text-neutral-200">
                            {row.site_status ? (SITE_TEXT[row.site_status] ?? "No website") : "No website"}
                          </span>
                        )}
                      </div>

                      <label className="block">
                        <span className="sr-only">Note for {row.business_name} (saved with the outcome)</span>
                        <input
                          className="field-input mt-0 text-sm"
                          placeholder="Note (optional, saved with the outcome)"
                          value={notes[row.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                          maxLength={2000}
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label={`Log call outcome for ${row.business_name}`}>
                        {QUICK_OUTCOMES.map((outcome, i) => (
                          <button
                            key={outcome}
                            type="button"
                            className="btn-secondary min-h-12 px-2 normal-case tracking-normal"
                            disabled={busyId !== null}
                            onClick={() => logOutcome(row, outcome)}
                          >
                            <span className="mr-1.5 hidden text-muted sm:inline" aria-hidden="true">
                              {i + 1}
                            </span>
                            {OUTCOME_LABELS[outcome]}
                          </button>
                        ))}
                        <MoreActions
                          row={row}
                          disabled={busyId !== null}
                          onOutcome={(o) => logOutcome(row, o)}
                          onSnooze={(days, label) => snooze(row, days, label)}
                          onStatus={(s) => setStatus(row, s)}
                          onDnc={() => doNotContact(row)}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ),
      )}
    </section>
  );
}

function LeadSummary({ row }: { row: Row }) {
  const place = [row.city, row.state].filter(Boolean).join(", ");
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/leads/${row.id}`} className="text-lg text-ink hover:text-accent-400">
            {row.business_name}
          </Link>
          <StatusBadge status={row.status} />
        </div>
        <p className="text-sm text-muted">
          {[row.trade, place].filter(Boolean).join(" · ")}
          {row.section === "due" && row.next_follow_up_at && ` · Follow-up due ${formatDay(row.next_follow_up_at)}`}
        </p>
        {row.why_this_lead && <p className="mt-1 text-sm text-neutral-200">{row.why_this_lead}</p>}
      </div>
      <span className="shrink-0 text-right">
        <span className="block text-2xl text-accent-400 tabular-nums">{row.priority_score}</span>
        <span className="block text-[11px] tracking-[0.12em] text-muted uppercase">Priority</span>
      </span>
    </div>
  );
}

function MoreActions(props: {
  row: Row;
  disabled: boolean;
  onOutcome: (o: OutreachOutcome) => void;
  onSnooze: (days: number, label: string) => void;
  onStatus: (s: LeadStatus) => void;
  onDnc: () => void;
}) {
  const [status, setStatus] = useState<LeadStatus>(props.row.status);
  return (
    <details className="col-span-2 sm:col-span-5">
      <summary className="btn-link inline-flex min-h-11 cursor-pointer items-center text-sm">More actions</summary>
      <div className="mt-2 space-y-3 rounded-md border border-divider p-3">
        <div className="flex flex-wrap gap-2">
          {(["not_interested", "wrong_number"] as const).map((o) => (
            <button key={o} type="button" className="btn-secondary normal-case tracking-normal" disabled={props.disabled} onClick={() => props.onOutcome(o)}>
              {OUTCOME_LABELS[o]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs tracking-[0.12em] text-muted uppercase">Snooze</span>
          {SNOOZE_OPTIONS.map((s) => (
            <button
              key={s.days}
              type="button"
              className="btn-secondary normal-case tracking-normal"
              disabled={props.disabled}
              onClick={() => props.onSnooze(s.days, s.label)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-40">
            <span className="field-label">Status</span>
            <select className="field-input" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus)}>
              {LEAD_STATUSES.filter((s) => s !== "do_not_contact").map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn-secondary"
            disabled={props.disabled || status === props.row.status}
            onClick={() => props.onStatus(status)}
          >
            Set status
          </button>
        </div>
        <button type="button" className="btn border-danger/60 text-danger hover:bg-danger/10" disabled={props.disabled} onClick={props.onDnc}>
          Do not contact
        </button>
      </div>
    </details>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded-sm border border-neutral-600 px-1 font-sans text-neutral-200">{children}</kbd>;
}

function toRows(due: CallListLead[], fresh: CallListLead[]): Row[] {
  return [...due.map((l) => ({ ...l, section: "due" as const })), ...fresh.map((l) => ({ ...l, section: "fresh" as const }))];
}

function post(url: string, method: "POST" | "PATCH", body: unknown) {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
