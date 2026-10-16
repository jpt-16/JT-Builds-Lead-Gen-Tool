import { ErrorIcon, NoticeIcon, WarningIcon } from "@/components/Icons";
import { ScoreGauge } from "@/components/ScoreGauge";
import type { ScoreBreakdown } from "@/lib/score-calc";
import { groupIssues, type Issue, type Severity } from "@/lib/site-issues";

const SEVERITY = {
  error: { label: "Errors", Icon: ErrorIcon, text: "text-danger", tint: "bg-danger-soft border-danger-line" },
  warning: { label: "Warnings", Icon: WarningIcon, text: "text-warning", tint: "bg-warning-soft border-warning-line" },
  notice: { label: "Notices", Icon: NoticeIcon, text: "text-notice", tint: "bg-notice-soft border-notice-line" },
} as const;

const NO_SITE_TEXT: Record<string, string> = {
  none: "No website listed on Google.",
  social: "Only a social media page, not a website.",
  dead: "The website does not load.",
  parked: "The domain is parked or a placeholder.",
};

type Lead = {
  site_status: string | null;
  score_total: number | null;
  score_breakdown: unknown;
  website_url: string | null;
};

/**
 * Site-audit style panel: health gauge, Errors / Warnings / Notices counts,
 * then every problem grouped by severity with a plain fix.
 */
export function SiteHealth({ lead }: { lead: Lead }) {
  const breakdown = lead.score_breakdown as Partial<ScoreBreakdown> | null;

  if (lead.site_status && NO_SITE_TEXT[lead.site_status]) {
    return (
      <div className="flex flex-wrap items-center gap-5">
        <ScoreGauge score={null} />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="flex items-center gap-2 font-semibold text-danger">
            <ErrorIcon className="size-5" /> No real website
          </p>
          <p className="text-sm text-ink-2">{breakdown?.summary ?? NO_SITE_TEXT[lead.site_status]}</p>
          <p className="text-sm text-muted">The strongest pitch: they need a site that works on phones and gets calls.</p>
        </div>
      </div>
    );
  }

  if (!breakdown?.summary) {
    return (
      <div className="flex flex-wrap items-center gap-5">
        <ScoreGauge score={null} />
        <p className="text-sm text-muted">Not checked yet. It is in the scoring queue.</p>
      </div>
    );
  }

  const groups = groupIssues(breakdown);
  const order: Severity[] = ["error", "warning", "notice"];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-5">
        <ScoreGauge score={lead.score_total} />
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
          {order.map((sev) => {
            const { label, Icon, text } = SEVERITY[sev];
            return (
              <div key={sev} className="rounded-md border border-line bg-surface-2 p-3">
                <p className={`flex items-center gap-1.5 text-xs font-semibold ${text}`}>
                  <Icon className="size-4" /> {label}
                </p>
                <p className="mt-1 text-2xl font-bold text-ink tabular-nums">{groups[sev].length}</p>
              </div>
            );
          })}
        </div>
      </div>

      {breakdown.metrics && (
        <p className="text-sm text-muted">
          Mobile PageSpeed {breakdown.metrics.performance}/100
          {breakdown.metrics.lcpMs !== null && ` · main content in ${(breakdown.metrics.lcpMs / 1000).toFixed(1)}s`}
          {breakdown.metrics.cls !== null && ` · layout shift ${breakdown.metrics.cls}`}
        </p>
      )}

      {order.map(
        (sev) =>
          groups[sev].length > 0 && (
            <section key={sev} aria-label={SEVERITY[sev].label}>
              <SeverityHeading severity={sev} count={groups[sev].length} />
              <ul className="space-y-2">
                {groups[sev].map((issue) => (
                  <IssueRow key={issue.check} issue={issue} />
                ))}
              </ul>
            </section>
          ),
      )}

      {breakdown.notes && breakdown.notes.length > 0 && (
        <ul className="space-y-1 text-sm text-muted">
          {breakdown.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}
      {breakdown.finalUrl && (
        <p className="text-sm text-muted">
          Checked{" "}
          <a href={breakdown.finalUrl} target="_blank" rel="noopener noreferrer" className="btn-link break-all">
            {breakdown.finalUrl}
          </a>
          {breakdown.source === "seo_tool" ? " with the SEO tool" : ""}.
        </p>
      )}
    </div>
  );
}

function SeverityHeading({ severity, count }: { severity: Severity; count: number }) {
  const { Icon, label, text } = SEVERITY[severity];
  return (
    <h3 className={`mb-2 flex items-center gap-1.5 text-sm font-semibold ${text}`}>
      <Icon className="size-4" />
      {label} ({count})
    </h3>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  const { tint } = SEVERITY[issue.severity];
  return (
    <li className={`rounded-md border p-3 ${tint}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink">{issue.message}</p>
        {issue.points > 0 && <span className="shrink-0 text-xs font-semibold text-ink-2 tabular-nums">−{issue.points} pts</span>}
      </div>
      <p className="mt-1 text-sm text-ink-2">
        <span className="font-semibold">Fix: </span>
        {issue.fix}
      </p>
    </li>
  );
}
