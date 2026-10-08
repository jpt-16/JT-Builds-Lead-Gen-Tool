import type { Funnel } from "@/lib/call-list";

// KPI row plus a simple funnel. One series, so one colour (the accent) for
// every bar; numbers and labels stay in text colours. Each bar is labelled
// directly and the same numbers appear in the tiles, so nothing relies on
// the bar length alone.

function rate(part: number, whole: number): string {
  if (!whole) return "–";
  return `${Math.round((part / whole) * 100)}%`;
}

export function StatsRow({ funnel }: { funnel: Funnel }) {
  const stages = [
    { label: "Leads", value: funnel.total, note: `${funnel.found_this_week} found this week` },
    { label: "Contacted", value: funnel.contacted, note: `${rate(funnel.contacted, funnel.total)} of leads` },
    { label: "Replies", value: funnel.replied, note: `${rate(funnel.replied, funnel.contacted)} of contacted` },
    { label: "Calls booked", value: funnel.booked, note: `${rate(funnel.booked, funnel.replied)} of replies` },
    { label: "Won", value: funnel.won, note: `${rate(funnel.won, funnel.booked)} of booked` },
  ];
  const max = Math.max(funnel.total, 1);

  return (
    <section aria-labelledby="stats-heading" className="space-y-4">
      <h2 id="stats-heading" className="sr-only">
        Pipeline stats
      </h2>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="card col-span-2 sm:col-span-1">
          <dt className="eyebrow">Found this week</dt>
          <dd className="mt-2 text-4xl tabular-nums">{funnel.found_this_week}</dd>
        </div>
        {stages.slice(1).map((s) => (
          <div key={s.label} className="card">
            <dt className="eyebrow">{s.label}</dt>
            <dd className="mt-2 text-3xl tabular-nums">{s.value}</dd>
            <dd className="mt-1 text-xs text-muted">{s.note}</dd>
          </div>
        ))}
      </dl>

      <figure className="card">
        <figcaption className="eyebrow">Funnel, all time</figcaption>
        <ol className="mt-3 space-y-2">
          {stages.map((s) => (
            <li key={s.label} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
              <span className="text-neutral-200">{s.label}</span>
              <span className="h-2.5 rounded-sm bg-neutral-700/60" aria-hidden="true">
                <span
                  className="block h-full rounded-sm bg-accent-500"
                  style={{ width: `${s.value ? Math.max((s.value / max) * 100, 1) : 0}%` }}
                  title={`${s.label}: ${s.value} (${s.note})`}
                />
              </span>
              <span className="w-28 text-right tabular-nums">
                {s.value} <span className="text-xs text-muted">{s.label === "Leads" ? "" : s.note.split(" ")[0]}</span>
              </span>
            </li>
          ))}
        </ol>
      </figure>
    </section>
  );
}
