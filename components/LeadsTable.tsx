"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { ColumnsIcon, DownloadIcon } from "@/components/Icons";
import { PillPopover } from "@/components/Popover";
import { ScoreGauge } from "@/components/ScoreGauge";
import { StatusBadge } from "@/components/StatusBadge";
import type { LeadStatus } from "@/lib/database.types";
import { formatDay } from "@/lib/format";
import { LEAD_STATUSES, STATUS_LABELS } from "@/lib/leads-config";

export type LeadRow = {
  id: string;
  business_name: string;
  trade: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website_url: string | null;
  site_status: string | null;
  score_total: number | null;
  review_count: number;
  rating: number | null;
  priority_score: number;
  status: LeadStatus;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
};

type SortKey = "priority" | "name" | "score" | "reviews" | "found" | "contacted" | "follow_up";

const SITE_TEXT: Record<string, string> = {
  none: "None",
  social: "Social only",
  dead: "Down",
  parked: "Parked",
  blocked: "Blocked",
};

// Columns the picker can hide. Priority, business and the checkbox always show.
const OPTIONAL_COLUMNS = {
  phone: "Phone",
  website: "Website",
  score: "Site score",
  reviews: "Reviews",
  status: "Status",
  contacted: "Last contact",
  follow_up: "Follow-up",
} as const;
type ColumnKey = keyof typeof OPTIONAL_COLUMNS;

// Hidden columns live in localStorage, so the choice survives reloads on this
// device. useSyncExternalStore keeps server render (all columns) and client
// in step without a setState-in-effect.
const STORAGE_KEY = "leads.hiddenColumns";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readHidden() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function writeHidden(hidden: Set<ColumnKey>) {
  try {
    localStorage.setItem(STORAGE_KEY, [...hidden].join(","));
  } catch {
    // Private mode or blocked storage: the choice just won't persist.
  }
  listeners.forEach((l) => l());
}

export function LeadsTable(props: { rows: LeadRow[]; sort: SortKey; dir: "asc" | "desc"; sortLinks: Record<SortKey, string> }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState("queue");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);

  const hiddenRaw = useSyncExternalStore(subscribe, readHidden, () => "");
  const hidden = useMemo(() => new Set(hiddenRaw.split(",").filter((k): k is ColumnKey => k in OPTIONAL_COLUMNS)), [hiddenRaw]);
  const show = (key: ColumnKey) => !hidden.has(key);

  const allSelected = props.rows.length > 0 && props.rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleColumn(key: ColumnKey) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    writeHidden(next);
  }

  async function applyBulk() {
    if (!selected.size) return;
    const body =
      action === "queue"
        ? { ids: [...selected], action: { type: "queue" } }
        : {
            ids: [...selected],
            action: { type: "set_status", status: action },
          };
    if (action === "do_not_contact" && !window.confirm(`Mark ${selected.size} lead(s) do not contact? They will be suppressed.`)) return;

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const skipped = data.skipped
          ? ` ${data.skipped} skipped${action === "queue" ? " (not new, or on the do-not-contact list)" : action === "do_not_contact" ? "" : " (leads on the do-not-contact list can't be changed here)"}.`
          : "";
        setMessage({ text: `Updated ${data.updated}.${skipped}` });
        setSelected(new Set());
        router.refresh();
      } else {
        setMessage({
          text: data.error ?? `Failed (${response.status}).`,
          error: true,
        });
      }
    } catch {
      setMessage({ text: "Network error. Nothing was changed.", error: true });
    }
    setBusy(false);
  }

  const header = (key: SortKey, label: string, className = "") => (
    <th scope="col" className={className} aria-sort={props.sort === key ? (props.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={props.sortLinks[key]} className="inline-flex min-h-11 min-w-11 items-center hover:text-accent">
        {label}
        {props.sort === key && (
          <span aria-hidden="true" className="ml-1">
            {props.dir === "asc" ? "↑" : "↓"}
          </span>
        )}
      </Link>
    </th>
  );

  return (
    <section className="card p-0" aria-label="Lead list">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label htmlFor="bulk-action" className="text-sm text-ink-2">
            <span className="font-semibold text-ink tabular-nums">{selected.size}</span> selected
          </label>
          <select
            id="bulk-action"
            className="field-input mt-0 w-auto min-w-0 flex-1 sm:min-w-48 sm:flex-none"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option value="queue">Add to call queue</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                Set status: {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary" disabled={!selected.size || busy} onClick={applyBulk}>
            {busy ? "Working…" : "Apply"}
          </button>
          {selected.size > 0 && (
            <a className="btn-secondary" href={`/api/leads/export?ids=${[...selected].join(",")}`}>
              <DownloadIcon className="size-4" /> Export selected
            </a>
          )}
        </div>
        <div className="ml-auto">
          <PillPopover
            id="f-columns"
            label={
              hidden.size ? `Columns (${Object.keys(OPTIONAL_COLUMNS).length - hidden.size} of ${Object.keys(OPTIONAL_COLUMNS).length})` : "Columns"
            }
            active={hidden.size > 0}
            icon={<ColumnsIcon className="size-4" />}
          >
            <fieldset className="w-52">
              <legend className="field-label mb-1">Show columns</legend>
              {(Object.entries(OPTIONAL_COLUMNS) as [ColumnKey, string][]).map(([key, label]) => (
                <label key={key} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-ink">
                  <input type="checkbox" className="size-4 accent-[var(--color-accent)]" checked={show(key)} onChange={() => toggleColumn(key)} />
                  {label}
                </label>
              ))}
            </fieldset>
          </PillPopover>
        </div>
      </div>

      <div aria-live="polite" className={message ? "px-4 pt-3" : undefined}>
        {message && <p className={message.error ? "alert-error" : "alert-success"}>{message.text}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="data-table min-w-[720px] [&_tbody_tr:last-child_td]:border-b-0">
          <thead>
            <tr>
              <th scope="col" className="w-10 pl-4">
                <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                  <span className="sr-only">Select all on this page</span>
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-accent)]"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(props.rows.map((r) => r.id)))}
                  />
                </label>
              </th>
              {header("priority", "Priority", "w-20")}
              {header("name", "Business")}
              {show("phone") && <th scope="col">Phone</th>}
              {show("website") && <th scope="col">Website</th>}
              {show("score") && header("score", "Site score")}
              {show("reviews") && header("reviews", "Reviews")}
              {show("status") && <th scope="col">Status</th>}
              {show("contacted") && header("contacted", "Last contact")}
              {show("follow_up") && header("follow_up", "Follow-up")}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.id} className={selected.has(row.id) ? "bg-accent-soft" : undefined}>
                <td className="pl-4">
                  <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                    <span className="sr-only">Select {row.business_name}</span>
                    <input
                      type="checkbox"
                      className="size-4 accent-[var(--color-accent)]"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                    />
                  </label>
                </td>
                <td className="text-base font-semibold text-accent tabular-nums">{row.priority_score}</td>
                <td>
                  <Link
                    href={`/leads/${row.id}`}
                    className="inline-flex min-h-11 items-center font-medium text-ink hover:text-accent hover:underline"
                  >
                    {row.business_name}
                  </Link>
                  <span className="block text-xs text-muted">
                    {[row.trade, [row.city, row.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                  </span>
                </td>
                {show("phone") && (
                  <td className="whitespace-nowrap">
                    {row.phone ? (
                      <a href={`tel:${row.phone}`} className="btn-link inline-flex min-h-11 min-w-11 items-center">
                        {row.phone}
                      </a>
                    ) : (
                      <span className="text-muted">None</span>
                    )}
                  </td>
                )}
                {show("website") && (
                  <td>
                    {row.site_status && SITE_TEXT[row.site_status] ? (
                      <span className="text-ink-2">{SITE_TEXT[row.site_status]}</span>
                    ) : row.website_url ? (
                      <a
                        href={row.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-link inline-flex min-h-11 min-w-11 items-center"
                      >
                        Visit
                      </a>
                    ) : (
                      <span className="text-ink-2">None</span>
                    )}
                  </td>
                )}
                {show("score") && (
                  <td>
                    {row.score_total !== null ? (
                      <ScoreGauge score={row.score_total} size={34} label="Site score" />
                    ) : (
                      <span className="text-muted">–</span>
                    )}
                  </td>
                )}
                {show("reviews") && (
                  <td className="tabular-nums">
                    {row.review_count}
                    {row.rating !== null && <span className="text-xs text-muted"> · {row.rating}★</span>}
                  </td>
                )}
                {show("status") && (
                  <td>
                    <StatusBadge status={row.status} />
                  </td>
                )}
                {show("contacted") && (
                  <td className="whitespace-nowrap text-muted">{row.last_contacted_at ? formatDay(row.last_contacted_at) : "–"}</td>
                )}
                {show("follow_up") && (
                  <td className="whitespace-nowrap text-muted">{row.next_follow_up_at ? formatDay(row.next_follow_up_at) : "–"}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
