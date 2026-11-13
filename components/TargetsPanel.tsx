"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestsPerTown } from "@/lib/find-leads-config";
import { formatDateTime, metersToMiles } from "@/lib/format";

export type TargetRow = {
  id: string;
  trade: string;
  city: string;
  state: string;
  radius_m: number;
  max_results: number;
  active: boolean;
  last_run_at: string | null;
  last_run_found: number | null;
  last_run_new: number | null;
};

/** Saved trade + town searches. Run one now, pause it, or delete it. */
export function TargetsPanel({ targets, dailyLimit }: { targets: TargetRow[]; dailyLimit: number }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const active = targets.filter((t) => t.active);
  const passRequests = active.reduce((sum, t) => sum + requestsPerTown(t.max_results), 0);

  async function call(id: string, init: RequestInit & { url?: string }, done: (data: Record<string, unknown>) => string) {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch(init.url ?? `/api/targets/${id}`, init);
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setMessage({ text: done(data) });
        router.refresh();
      } else {
        setMessage({ text: (data.error as string) ?? `Failed (${response.status}).`, error: true });
      }
    } catch {
      setMessage({ text: "Network error. Nothing was changed.", error: true });
    }
    setBusyId(null);
  }

  const run = (t: TargetRow) =>
    call(t.id, { method: "POST", url: `/api/targets/${t.id}/run` }, (d) => `${t.trade} in ${t.city}: ${d.resultsFound} found, ${d.newLeads} new.`);
  const toggle = (t: TargetRow) =>
    call(t.id, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !t.active }) }, () =>
      t.active ? "Paused." : "Resumed.",
    );
  const remove = (t: TargetRow) => {
    if (!window.confirm(`Delete the target "${t.trade} in ${t.city}, ${t.state}"? Leads it found are kept.`)) return;
    return call(t.id, { method: "DELETE" }, () => "Deleted.");
  };

  return (
    <section className="card space-y-3" aria-labelledby="targets-heading">
      <div>
        <h2 id="targets-heading" className="text-base font-semibold text-ink">
          Saved targets
        </h2>
        <p className="mt-1 text-sm text-muted">
          A trade and a town you want covered. Use <strong>Run now</strong> to search one. Active targets are searched by the daily job once autopilot
          is on.
          {active.length > 0 &&
            ` One pass over ${active.length} active target${active.length === 1 ? "" : "s"} is about ${passRequests} Google requests; your daily cap is ${dailyLimit}.`}
        </p>
      </div>

      {targets.length === 0 ? (
        <p className="text-sm text-muted">None yet. Fill in a search above and choose &quot;Save as daily target&quot;.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="data-table min-w-[640px]">
            <thead>
              <tr>
                <th scope="col">Target</th>
                <th scope="col">Size</th>
                <th scope="col">Last run</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {targets.map((t) => (
                <tr key={t.id} className={t.active ? undefined : "text-muted"}>
                  <td>
                    <span className="font-medium text-ink">
                      {t.trade} in {t.city}, {t.state}
                    </span>
                    {!t.active && <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium ring-1 ring-line">Paused</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    {metersToMiles(t.radius_m)} mi · up to {t.max_results}
                  </td>
                  <td className="whitespace-nowrap">
                    {t.last_run_at ? `${formatDateTime(t.last_run_at)} · ${t.last_run_found} found, ${t.last_run_new} new` : "Never"}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <button type="button" className="btn-secondary min-h-11" disabled={busyId !== null} onClick={() => run(t)}>
                      {busyId === t.id ? "Working…" : "Run now"}
                    </button>{" "}
                    <button
                      type="button"
                      className="btn-link inline-flex min-h-11 min-w-11 items-center justify-center"
                      disabled={busyId !== null}
                      onClick={() => toggle(t)}
                    >
                      {t.active ? "Pause" : "Resume"}
                    </button>{" "}
                    <button
                      type="button"
                      className="btn-link inline-flex min-h-11 min-w-11 items-center justify-center"
                      disabled={busyId !== null}
                      onClick={() => remove(t)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div aria-live="polite">{message && <p className={message.error ? "alert-error" : "alert-success"}>{message.text}</p>}</div>
    </section>
  );
}
