import "server-only";
import { runPageSpeed, type PageSpeedResult } from "@/lib/pagespeed";
import { computeScore, type Deduction, type ScoreBreakdown, type ScoreResult } from "@/lib/score-calc";
import { analyzeHomepage, detectPlaceholder } from "@/lib/site-analyze";
import { fetchHomepage } from "@/lib/site-fetch";
import { getSeoToolConfig, scoreWithSeoTool, SeoToolError } from "@/lib/seo-tool";
import { normalizeUrl, socialPlatform } from "@/lib/website";

export type { Deduction, ScoreBreakdown, ScoreResult };

export const MAX_SCORE_ATTEMPTS = 3;

/** A temporary failure (rate limit, timeout). The queue retries the lead later. */
export class RetryableScoringError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableScoringError";
  }
}

/**
 * Scores one lead's website. This is the single adapter the rest of the app
 * calls; swap the scorer here.
 *
 * Every site first gets the built-in reachability checks (social page, dead,
 * parked). A real site is then scored by the SEO tool if SEO_TOOL_URL and
 * SEO_TOOL_API_KEY are set, otherwise by the built-in checks plus PageSpeed.
 */
export async function scoreSite(websiteUrl: string, opts: { attempt: number }): Promise<ScoreResult> {
  const checkedAt = new Date().toISOString();
  const base = { checkedAt, url: websiteUrl, deductions: [], passed: [], flags: [], notes: [] };

  const platform = socialPlatform(websiteUrl);
  if (platform) {
    return noSite("social", { ...base, source: "builtin", summary: `Only a ${platform} page, not a website.` });
  }

  const url = normalizeUrl(websiteUrl);
  if (!url) return noSite("dead", { ...base, source: "builtin", summary: "Listed website address is not valid." });

  const homepage = await fetchHomepage(url);
  if (homepage.kind === "dead") return noSite("dead", { ...base, source: "builtin", summary: homepage.reason });

  if (homepage.kind === "ok") {
    const placeholder = detectPlaceholder(homepage.html, homepage.finalUrl, homepage.requestedUrl);
    if (placeholder) {
      return noSite("parked", { ...base, source: "builtin", finalUrl: homepage.finalUrl, summary: placeholder });
    }
  }
  const finalUrl = homepage.finalUrl;

  const seoTool = getSeoToolConfig();
  if (seoTool) {
    try {
      const result = await scoreWithSeoTool(finalUrl, seoTool);
      const deductions: Deduction[] = result.issues.map((issue, i) => ({
        check: `seo_tool_${i}`,
        points: issue.points,
        short: issue.message.length > 40 ? `${issue.message.slice(0, 37)}…` : issue.message,
        message: issue.message,
      }));
      return {
        siteStatus: homepage.kind === "blocked" ? "blocked" : "ok",
        scoreTotal: result.scoreTotal,
        breakdown: {
          ...base,
          source: "seo_tool",
          finalUrl,
          summary: `SEO tool score ${result.scoreTotal}/100.`,
          deductions,
        },
      };
    } catch (error) {
      if (error instanceof SeoToolError && error.retryable && opts.attempt < MAX_SCORE_ATTEMPTS) {
        throw new RetryableScoringError(error.message);
      }
      throw error;
    }
  }

  const checks = homepage.kind === "ok" ? analyzeHomepage(homepage.html, homepage.finalUrl) : null;
  const pagespeedKey = process.env.GOOGLE_PAGESPEED_API_KEY || process.env.GOOGLE_PLACES_API_KEY || null;
  const pagespeed: PageSpeedResult = await runPageSpeed(finalUrl, pagespeedKey);

  if (!pagespeed.ok && pagespeed.retryable && opts.attempt < MAX_SCORE_ATTEMPTS) {
    throw new RetryableScoringError(pagespeed.reason);
  }

  const notes: string[] = [];
  if (homepage.kind === "blocked") notes.push(`${homepage.reason} Homepage checks were skipped.`);
  if (homepage.kind === "ok" && homepage.httpsBroken) notes.push("HTTPS certificate is broken; the site only loads over plain HTTP.");
  if (!pagespeed.ok) notes.push(`${pagespeed.reason} Speed was not scored.`);

  const calc = computeScore(checks, pagespeed.ok ? pagespeed : null);
  if (calc.possible === 0) {
    // Blocked and PageSpeed failed: nothing could be measured.
    return {
      siteStatus: "blocked",
      scoreTotal: null,
      breakdown: { ...base, source: "builtin", finalUrl, summary: "Could not check this site.", notes },
    };
  }

  return {
    siteStatus: homepage.kind === "blocked" ? "blocked" : "ok",
    scoreTotal: calc.score,
    breakdown: {
      ...base,
      source: "builtin",
      finalUrl,
      summary: `Scored ${calc.score}/100 (${calc.earned} of ${calc.possible} points).`,
      deductions: calc.deductions,
      passed: calc.passed,
      flags: checks?.builders.map((b) => `Built with ${b}`) ?? [],
      notes,
      metrics: pagespeed.ok ? { performance: pagespeed.performance, lcpMs: pagespeed.lcpMs, cls: pagespeed.cls } : undefined,
      earned: calc.earned,
      possible: calc.possible,
    },
  };
}

function noSite(siteStatus: "social" | "dead" | "parked", breakdown: ScoreBreakdown): ScoreResult {
  return { siteStatus, scoreTotal: null, breakdown };
}
