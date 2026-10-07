import type { HomepageChecks } from "@/lib/site-analyze";
import type { SiteStatus } from "@/lib/website";

// Turns homepage checks and PageSpeed numbers into a 0-100 score with a
// plain-English reason for every point lost. Pure, so it is easy to test.
//
// Points (100 total):
//   Speed 30: PageSpeed mobile performance 20, LCP 5, CLS 5
//   HTTPS 10, mobile viewport 10, visible phone 10, click-to-call 10,
//   contact form or booking link 10, title 5, meta description 5,
//   one H1 5, LocalBusiness schema 5
// If part of the check could not run (site blocked us, or PageSpeed failed),
// those points are left out and the score is scaled to what was measured.

export type Deduction = {
  check: string;
  points: number;
  /** A few words for the "why this lead" line, e.g. "no click-to-call". */
  short: string;
  message: string;
};

export type ScoreBreakdown = {
  source: "builtin" | "seo_tool";
  checkedAt: string;
  url: string;
  finalUrl?: string;
  summary: string;
  deductions: Deduction[];
  passed: string[];
  flags: string[];
  notes: string[];
  metrics?: { performance: number; lcpMs: number | null; cls: number | null };
  earned?: number;
  possible?: number;
};

export type ScoreResult = {
  siteStatus: SiteStatus;
  scoreTotal: number | null;
  breakdown: ScoreBreakdown;
};

type Speed = { performance: number; lcpMs: number | null; cls: number | null };

type Item = { check: string; points: number; earned: number; short: string; message: string };

function passFail(check: string, points: number, pass: boolean, short: string, message: string): Item {
  return { check, points, earned: pass ? points : 0, short, message };
}

export function computeScore(checks: HomepageChecks | null, speed: Speed | null) {
  const items: Item[] = [];

  if (speed) {
    items.push({
      check: "performance",
      points: 20,
      earned: Math.round((speed.performance / 100) * 20),
      short: speed.performance < 50 ? "slow on mobile" : "mobile speed could be better",
      message: `Mobile PageSpeed performance is ${speed.performance}/100.`,
    });
    if (speed.lcpMs !== null) {
      items.push({
        check: "lcp",
        points: 5,
        earned: speed.lcpMs <= 2500 ? 5 : speed.lcpMs <= 4000 ? 2 : 0,
        short: "slow to load",
        message: `Main content takes ${(speed.lcpMs / 1000).toFixed(1)}s to appear on a phone. Good is under 2.5s.`,
      });
    }
    if (speed.cls !== null) {
      items.push({
        check: "cls",
        points: 5,
        earned: speed.cls <= 0.1 ? 5 : speed.cls <= 0.25 ? 2 : 0,
        short: "layout jumps while loading",
        message: `Layout shifts while loading (CLS ${speed.cls}). Good is under 0.1.`,
      });
    }
  }

  if (checks) {
    items.push(
      passFail("https", 10, checks.https, "no HTTPS", 'Site does not load over HTTPS, so browsers mark it "Not secure".'),
      passFail("viewport", 10, checks.viewport, "not mobile-friendly", "No mobile viewport tag, so phones show a shrunken desktop page."),
      passFail("visible_phone", 10, checks.visiblePhone, "phone number not shown", "No phone number visible on the homepage."),
      passFail("click_to_call", 10, checks.clickToCall, "no click-to-call", "No click-to-call link, so mobile visitors cannot tap to call."),
      passFail(
        "contact",
        10,
        checks.contactOrBooking,
        "no way to request service",
        "No contact form, booking link or link to a contact page on the homepage.",
      ),
      passFail("title", 5, checks.title, "no page title", "Homepage has no title tag."),
      passFail(
        "meta_description",
        5,
        checks.metaDescription,
        "no meta description",
        "No meta description, so Google picks its own snippet for search results.",
      ),
      passFail(
        "h1",
        5,
        checks.h1Count === 1,
        checks.h1Count === 0 ? "no main heading" : "several main headings",
        checks.h1Count === 0
          ? "No H1 heading, so the page has no clear main headline."
          : `${checks.h1Count} H1 headings. A page should have exactly one.`,
      ),
      passFail(
        "schema",
        5,
        checks.localBusinessSchema,
        "no LocalBusiness schema",
        "No LocalBusiness structured data, which helps Google show hours, area and contact details.",
      ),
    );
  }

  let earned = 0;
  let possible = 0;
  const deductions: Deduction[] = [];
  const passed: string[] = [];
  for (const item of items) {
    possible += item.points;
    earned += item.earned;
    if (item.earned < item.points) {
      deductions.push({ check: item.check, points: item.points - item.earned, short: item.short, message: item.message });
    } else {
      passed.push(item.check);
    }
  }
  deductions.sort((a, b) => b.points - a.points);

  return { score: possible ? Math.round((earned / possible) * 100) : 0, earned, possible, deductions, passed };
}
