"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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

export function LeadsTable(props: {
  rows: LeadRow[];
  total: number;
  exportAllHref: string;
  sort: SortKey;
  dir: "asc" | "desc";
  sortLinks: Record<SortKey, string>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState("queue");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const allSelected = props.rows.length > 0 && props.rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulk() {
    if (!selected.size) return;
    const body =
      action === "queue"
        ? { ids: [...selected], action: { type: "queue" } }
        : { ids: [...selected], action: { type: "set_status", status: action } };
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
        const skipped = data.skipped ? ` ${data.skipped} skipped${action === "queue" ? " (not new, or on the do-not-contact list)" : ""}.` : "";
        setMessage({ text: `Updated ${data.updated}.${skipped}` });
        setSelected(new Set());
        router.refresh();
      } else {
        setMessage({ text: data.error ?? `Failed (${response.status}).`, error: true });
      }
    } catch {
      setMessage({ text: "Network error. Nothing was changed.", error: true });
    }
    setBusy(false);
  }

  const header = (key: SortKey, label: string, className = "") => (
    <th scope="col" className={className} aria-sort={props.sort === key ? (props.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link href={props.sortLinks[key]} className="inline-flex min-h-11 items-center hover:text-accent-400">
        {label}
        {props.sort === key && <span aria-hidden="true">{props.dir === "asc" ? " ↑" : " ↓"}</span>}
      </Link>
    </th>
  );

  return (
    <section className="card space-y-4" aria-label="Lead list">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56">
          <span className="field-label">With {selected.size} selected</span>
          <select className="field-input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="queue">Add to queue</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                Set status: {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-primary" disabled={!selected.size || busy} onClick={applyBulk}>
          {busy ? "Working…" : "Apply"}
        </button>
        {selected.size > 0 && (
          <a className="btn-secondary" href={`/api/leads/export?ids=${[...selected].join(",")}`}>
            Export selected
          </a>
        )}
        <a className="btn-secondary" href={props.exportAllHref}>
          Export all {props.total} as CSV
        </a>
      </div>

      <div aria-live="polite">{message && <p className={message.error ? "alert-error" : "alert-success"}>{message.text}</p>}</div>

      <div className="overflow-x-auto">
        <table className="data-table min-w-[960px]">
          <thead>
            <tr>
              <th scope="col" className="w-10">
                <label className="inline-flex min-h-11 items-center">
                  <span className="sr-only">Select all on this page</span>
                  <input
                    type="checkbox"
                    className="size-4 accent-accent-500"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(props.rows.map((r) => r.id)))}
                  />
                </label>
              </th>
              {header("priority", "Priority", "w-20")}
              {header("name", "Business")}
              <th scope="col">Phone</th>
              <th scope="col">Website</th>
              {header("score", "Score")}
              {header("reviews", "Reviews")}
              <th scope="col">Status</th>
              {header("contacted", "Last contact")}
              {header("follow_up", "Follow-up")}
            </tr>
          </thead>
          <tbody>
            {props.rows.map((row) => (
              <tr key={row.id} className={selected.has(row.id) ? "bg-accent-500/8" : undefined}>
                <td>
                  <label className="inline-flex min-h-11 items-center">
                    <span className="sr-only">Select {row.business_name}</span>
                    <input type="checkbox" className="size-4 accent-accent-500" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
                  </label>
                </td>
                <td className="text-lg text-accent-400 tabular-nums">{row.priority_score}</td>
                <td>
                  <Link href={`/leads/${row.id}`} className="text-ink hover:text-accent-400">
                    {row.business_name}
                  </Link>
                  <span className="block text-xs text-muted">{[row.trade, [row.city, row.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
                </td>
                <td className="whitespace-nowrap">
                  {row.phone ? (
                    <a href={`tel:${row.phone}`} className="btn-link">
                      {row.phone}
                    </a>
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                </td>
                <td>
                  {row.site_status && SITE_TEXT[row.site_status] ? (
                    <span className={row.site_status === "blocked" ? "text-neutral-200" : "text-ink"}>{SITE_TEXT[row.site_status]}</span>
                  ) : row.website_url ? (
                    <a href={row.website_url} target="_blank" rel="noopener noreferrer" className="btn-link">
                      Visit
                    </a>
                  ) : (
                    "None"
                  )}
                </td>
                <td className="tabular-nums">{row.score_total ?? <span className="text-muted">–</span>}</td>
                <td className="tabular-nums">
                  {row.review_count}
                  {row.rating !== null && <span className="text-xs text-muted"> · {row.rating}★</span>}
                </td>
                <td>
                  <StatusBadge status={row.status} />
                </td>
                <td className="whitespace-nowrap text-muted">{row.last_contacted_at ? formatDay(row.last_contacted_at) : "–"}</td>
                <td className="whitespace-nowrap text-muted">{row.next_follow_up_at ? formatDay(row.next_follow_up_at) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
