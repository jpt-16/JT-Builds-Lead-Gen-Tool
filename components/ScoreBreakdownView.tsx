import type { ScoreBreakdown } from "@/lib/score-calc";

// Plain-English explanation of a website score: every point lost and why.

export function ScoreBreakdownView({ breakdown }: { breakdown: unknown }) {
  const b = breakdown as Partial<ScoreBreakdown> | null;
  if (!b?.summary) return <p className="text-sm text-muted">Not checked yet.</p>;

  return (
    <div className="space-y-3 text-sm">
      <p>{b.summary}</p>

      {b.metrics && (
        <p className="text-muted">
          Mobile PageSpeed {b.metrics.performance}/100
          {b.metrics.lcpMs !== null && ` · main content in ${(b.metrics.lcpMs / 1000).toFixed(1)}s`}
          {b.metrics.cls !== null && ` · layout shift ${b.metrics.cls}`}
        </p>
      )}

      {b.deductions && b.deductions.length > 0 && (
        <ul className="space-y-1">
          {b.deductions.map((d) => (
            <li key={d.check} className="flex gap-3">
              <span className="w-10 shrink-0 text-right text-danger tabular-nums">−{d.points}</span>
              <span>{d.message}</span>
            </li>
          ))}
        </ul>
      )}

      {b.flags && b.flags.length > 0 && <p className="text-muted">{b.flags.join(" · ")}</p>}
      {b.notes?.map((note) => (
        <p key={note} className="text-muted">
          {note}
        </p>
      ))}
      {b.finalUrl && (
        <p className="text-muted">
          Checked{" "}
          <a href={b.finalUrl} target="_blank" rel="noopener noreferrer" className="btn-link break-all">
            {b.finalUrl}
          </a>
          {b.source === "seo_tool" ? " with the SEO tool" : ""}.
        </p>
      )}
    </div>
  );
}
