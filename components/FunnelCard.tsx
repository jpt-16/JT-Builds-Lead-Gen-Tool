import type { Funnel } from "@/lib/call-list";

// Pipeline funnel, all time. One series, one colour; every bar is labelled
// with its count and the conversion from the stage before.

function rate(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "–";
}

export function FunnelCard({ funnel }: { funnel: Funnel }) {
  const stages = [
    { label: "Leads", value: funnel.total, conversion: null },
    { label: "Contacted", value: funnel.contacted, conversion: rate(funnel.contacted, funnel.total) },
    { label: "Replies", value: funnel.replied, conversion: rate(funnel.replied, funnel.contacted) },
    { label: "Calls booked", value: funnel.booked, conversion: rate(funnel.booked, funnel.replied) },
    { label: "Won", value: funnel.won, conversion: rate(funnel.won, funnel.booked) },
  ];
  const max = Math.max(funnel.total, 1);

  return (
    <section className="card" aria-labelledby="funnel-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="funnel-heading" className="text-base font-semibold text-ink">
          Pipeline
        </h2>
        <span className="text-xs text-muted">All time · % = from the stage before</span>
      </div>
      <ol className="mt-4 space-y-3">
        {stages.map((s) => (
          <li key={s.label} className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-3 text-sm">
            <span className="text-ink-2">{s.label}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <span
                className="block h-full rounded-full bg-accent"
                style={{ width: `${s.value ? Math.max((s.value / max) * 100, 1.5) : 0}%` }}
                title={`${s.label}: ${s.value}${s.conversion ? ` (${s.conversion})` : ""}`}
              />
            </span>
            <span className="text-right tabular-nums">
              <span className="font-semibold text-ink">{s.value}</span>
              {s.conversion && <span className="ml-1.5 text-xs text-muted">{s.conversion}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
