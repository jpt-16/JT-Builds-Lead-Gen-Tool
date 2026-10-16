import type { Deduction, ScoreBreakdown } from "@/lib/score-calc";

// Groups a website's score deductions into Errors, Warnings and Notices (the
// way site-audit tools present them) and pairs each with a plain fix I can
// quote on a call. Severity reflects how much the problem costs the business
// in lost calls, not how many points it is worth.

export type Severity = "error" | "warning" | "notice";

export type Issue = {
  check: string;
  severity: Severity;
  message: string;
  fix: string;
  points: number;
};

const RULES: Record<string, { severity: Severity; fix: string }> = {
  https: { severity: "error", fix: "Turn on the free SSL certificate most hosts include and redirect http to https." },
  viewport: { severity: "error", fix: "Rebuild the page to be mobile-first, starting with a proper viewport tag." },
  visible_phone: { severity: "error", fix: "Put the phone number in the header of every page." },
  contact: { severity: "error", fix: "Add a short quote-request form or booking link near the top of the homepage." },
  click_to_call: { severity: "warning", fix: "Make the phone number a tap-to-call link." },
  performance: { severity: "warning", fix: "Compress images, drop unused scripts and plugins, and serve the page from a fast host." },
  lcp: { severity: "warning", fix: "Serve a smaller, compressed hero image so the main content shows sooner." },
  title: { severity: "warning", fix: "Add a title with the service and town, e.g. \"Landscaping in Mansfield, MA\"." },
  h1: { severity: "warning", fix: "Use one main heading that says what the business does and where." },
  meta_description: { severity: "notice", fix: "Add a one-sentence description that names the service area." },
  schema: { severity: "notice", fix: "Add LocalBusiness structured data with name, phone, address and hours." },
  cls: { severity: "notice", fix: "Give images and embeds fixed sizes so the page stops jumping while it loads." },
};

/** Mobile speed under 50 counts as an error: most local searches are on phones. */
const SLOW_PERFORMANCE_POINTS = 10;

export function issueFor(deduction: Deduction): Issue {
  const rule = RULES[deduction.check];
  let severity: Severity = rule?.severity ?? "warning";
  if (deduction.check === "performance" && deduction.points >= SLOW_PERFORMANCE_POINTS) severity = "error";
  return {
    check: deduction.check,
    severity,
    message: deduction.message,
    fix: rule?.fix ?? "Review this on the site.",
    points: deduction.points,
  };
}

export function groupIssues(breakdown: unknown): Record<Severity, Issue[]> {
  const groups: Record<Severity, Issue[]> = { error: [], warning: [], notice: [] };
  const b = breakdown as Partial<ScoreBreakdown> | null;
  for (const deduction of b?.deductions ?? []) {
    const issue = issueFor(deduction);
    groups[issue.severity].push(issue);
  }
  // Builder flags are information only and cost no points.
  for (const flag of b?.flags ?? []) {
    groups.notice.push({
      check: `flag:${flag}`,
      severity: "notice",
      message: `${flag}. Template builders tend to be slow and hard to rank.`,
      fix: "A hand-coded site loads faster and is easier to optimize.",
      points: 0,
    });
  }
  return groups;
}

export type HealthBand = "good" | "fair" | "weak";

export function healthBand(score: number): HealthBand {
  if (score >= 80) return "good";
  if (score >= 50) return "fair";
  return "weak";
}

export const BAND_LABEL: Record<HealthBand, string> = { good: "Good", fair: "Fair", weak: "Weak" };
