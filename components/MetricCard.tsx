import { ArrowDownIcon, ArrowUpIcon } from "@/components/Icons";
import type { WeeklyMetric } from "@/lib/activity";

// KPI card: this week's number, the change from last week (arrow plus words,
// never colour alone) and an 8-week sparkline. One series, one colour.

const W = 120;
const H = 36;
const PAD = 4;

export function MetricCard({ label, metric, weekLabels }: { label: string; metric: WeeklyMetric; weekLabels: string[] }) {
  const delta = metric.thisWeek - metric.lastWeek;
  const max = Math.max(...metric.series, 1);
  const points = metric.series.map((v, i) => {
    const x = PAD + (i * (W - 2 * PAD)) / Math.max(metric.series.length - 1, 1);
    const y = H - PAD - (v / max) * (H - 2 * PAD);
    return { x, y, v, label: weekLabels[i] };
  });
  const last = points.at(-1);

  return (
    <div className="card flex flex-col gap-3">
      <p className="text-sm font-semibold text-ink-2">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold text-ink tabular-nums">{metric.thisWeek}</p>
          <p className="text-xs text-muted">this week</p>
        </div>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-hidden="true">
          <polyline
            points={points.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {last && <circle cx={last.x} cy={last.y} r={3.5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />}
          {/* Larger invisible hit targets give each week a hover tooltip. */}
          {points.map((p) => (
            <circle key={p.label} cx={p.x} cy={p.y} r={8} fill="transparent">
              <title>{`${p.label}: ${p.v}`}</title>
            </circle>
          ))}
        </svg>
      </div>
      <p
        className={`flex items-center gap-1 text-[13px] font-medium ${
          delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-muted"
        }`}
      >
        {delta > 0 && <ArrowUpIcon className="size-4" />}
        {delta < 0 && <ArrowDownIcon className="size-4" />}
        {delta === 0 ? "No change vs last week" : `${delta > 0 ? "+" : ""}${delta} vs last week (${metric.lastWeek})`}
      </p>
      <p className="sr-only">
        {label} per week for the last {metric.series.length} weeks, oldest first: {metric.series.join(", ")}.
      </p>
    </div>
  );
}
