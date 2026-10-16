import type { Database, OutreachChannel, OutreachOutcome } from "@/lib/database.types";
import { computeScore, type ScoreBreakdown } from "@/lib/score-calc";
import type { HomepageChecks } from "@/lib/site-analyze";

// Ten made-up leads for seeing the app without spending Google credits.
// Everything here is fiction: "Demo" names, 555-01xx phone numbers (reserved
// for fiction), and .example websites. They span every state the UI shows:
// no site, social page, dead, parked, weak, fair and good sites, and every
// stage from new to won, with outreach spread over eight weeks so the weekly
// cards and the pipeline have something to draw.
//
// Run with `npm run seed:demo`; remove with `npm run seed:demo:remove`.
// Pure and dated from `now`, so it is easy to test.

export const DEMO_PREFIX = "demo-";

type LeadInsert = Omit<Database["public"]["Tables"]["leads"]["Insert"], "owner_id" | "priority_score" | "why_this_lead">;

export type DemoLog = { channel: OutreachChannel; outcome: OutreachOutcome | null; note: string | null; daysAgo: number };
export type DemoLead = { lead: LeadInsert; logs: DemoLog[] };

const DAY = 24 * 60 * 60 * 1000;

type Speed = { performance: number; lcpMs: number | null; cls: number | null };

/** The breakdown a real scan would save, built with the real score calculator. */
function scanned(url: string, checks: HomepageChecks, speed: Speed, now: Date) {
  const calc = computeScore(checks, speed);
  const breakdown: ScoreBreakdown = {
    source: "builtin",
    checkedAt: now.toISOString(),
    url,
    finalUrl: url,
    summary: `Scored ${calc.score}/100 (${calc.earned} of ${calc.possible} points). Demo data.`,
    deductions: calc.deductions,
    passed: calc.passed,
    flags: checks.builders.map((b) => `Built with ${b}`),
    notes: [],
    metrics: speed,
    earned: calc.earned,
    possible: calc.possible,
  };
  return { score_total: calc.score, score_breakdown: breakdown as unknown as LeadInsert["score_breakdown"] };
}

function noSite(url: string, summary: string, now: Date) {
  const breakdown: ScoreBreakdown = {
    source: "builtin",
    checkedAt: now.toISOString(),
    url,
    summary,
    deductions: [],
    passed: [],
    flags: [],
    notes: [],
  };
  return { score_total: null, score_breakdown: breakdown as unknown as LeadInsert["score_breakdown"] };
}

const GOOD_CHECKS: HomepageChecks = {
  https: true,
  viewport: true,
  title: true,
  metaDescription: true,
  h1Count: 1,
  visiblePhone: true,
  clickToCall: true,
  contactOrBooking: true,
  localBusinessSchema: true,
  builders: [],
};

export function buildDemoLeads(now: Date): DemoLead[] {
  const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();
  const ahead = (days: number) => new Date(now.getTime() + days * DAY).toISOString();
  const iso = now.toISOString();

  const base = (
    n: number,
    fields: Omit<LeadInsert, "place_id" | "last_refreshed_at" | "source_query" | "has_website"> & { website_url: string | null },
  ) =>
    ({
      place_id: `${DEMO_PREFIX}${String(n).padStart(2, "0")}`,
      source_query: "demo seed",
      last_refreshed_at: iso,
      has_website: Boolean(fields.website_url),
      ...fields,
    }) satisfies LeadInsert;

  return [
    {
      lead: base(1, {
        business_name: "Demo Pine Ridge Landscaping",
        trade: "landscaper",
        address: "12 Demo Way, Mansfield, MA",
        city: "Mansfield",
        state: "MA",
        phone: "(508) 555-0101",
        website_url: null,
        rating: 4.2,
        review_count: 6,
        status: "new",
        first_found_at: ago(2),
        site_status: "none",
        scored_at: iso,
      }),
      logs: [],
    },
    {
      lead: base(2, {
        business_name: "Demo Granite State Cleaning",
        trade: "house cleaner",
        address: "48 Demo Street, Nashua, NH",
        city: "Nashua",
        state: "NH",
        phone: "(603) 555-0102",
        website_url: null,
        rating: 4.0,
        review_count: 11,
        status: "new",
        first_found_at: ago(3),
        site_status: "none",
        scored_at: iso,
      }),
      logs: [],
    },
    {
      lead: base(3, {
        business_name: "Demo Bay Road Plumbing",
        trade: "plumber",
        address: "7 Demo Road, Warwick, RI",
        city: "Warwick",
        state: "RI",
        phone: "(401) 555-0103",
        website_url: "https://www.facebook.com/bayroadplumbingdemo",
        rating: 5.0,
        review_count: 3,
        status: "new",
        first_found_at: ago(9),
        site_status: "social",
        scored_at: iso,
        ...noSite("https://www.facebook.com/bayroadplumbingdemo", "Only a Facebook page, not a website. Demo data.", now),
      }),
      logs: [],
    },
    {
      lead: base(4, {
        business_name: "Demo Shoreline Detailing",
        trade: "auto detailer",
        address: "301 Demo Avenue, Taunton, MA",
        city: "Taunton",
        state: "MA",
        phone: "(508) 555-0104",
        website_url: "http://shorelinedetailing.example",
        rating: 4.6,
        review_count: 24,
        status: "new",
        first_found_at: ago(12),
        site_status: "dead",
        scored_at: iso,
        ...noSite("http://shorelinedetailing.example", "The website did not load. Demo data.", now),
      }),
      logs: [],
    },
    {
      lead: base(5, {
        business_name: "Demo Cedar Contracting",
        trade: "contractor",
        address: "90 Demo Lane, Manchester, NH",
        city: "Manchester",
        state: "NH",
        phone: "(603) 555-0105",
        website_url: "https://cedarcontracting.example",
        rating: 3.9,
        review_count: 8,
        status: "queued",
        first_found_at: ago(16),
        site_status: "parked",
        scored_at: iso,
        ...noSite("https://cedarcontracting.example", "The address shows a parked-domain page. Demo data.", now),
      }),
      logs: [],
    },
    {
      lead: base(6, {
        business_name: "Demo Blue Heron HVAC",
        trade: "HVAC",
        address: "22 Demo Court, Providence, RI",
        city: "Providence",
        state: "RI",
        phone: "(401) 555-0106",
        website_url: "https://blueheronhvac.example",
        rating: 4.4,
        review_count: 57,
        status: "contacted",
        first_found_at: ago(20),
        last_contacted_at: ago(3),
        next_follow_up_at: ago(0.05),
        notes: "Demo: left a voicemail, follow up today.",
        site_status: "ok",
        scored_at: iso,
        ...scanned(
          "https://blueheronhvac.example",
          {
            ...GOOD_CHECKS,
            viewport: false,
            metaDescription: false,
            h1Count: 0,
            clickToCall: false,
            contactOrBooking: false,
            localBusinessSchema: false,
            builders: ["Wix"],
          },
          { performance: 31, lcpMs: 6200, cls: 0.31 },
          now,
        ),
      }),
      logs: [
        { channel: "call", outcome: "no_answer", note: null, daysAgo: 8 },
        { channel: "call", outcome: "voicemail", note: "Left the standard voicemail.", daysAgo: 3 },
      ],
    },
    {
      lead: base(7, {
        business_name: "Demo Old Mill Roofing",
        trade: "roofer",
        address: "5 Demo Hill, Attleboro, MA",
        city: "Attleboro",
        state: "MA",
        phone: "(508) 555-0107",
        website_url: "https://oldmillroofing.example",
        rating: 4.7,
        review_count: 90,
        status: "replied",
        first_found_at: ago(27),
        last_contacted_at: ago(4),
        next_follow_up_at: ahead(1),
        site_status: "ok",
        scored_at: iso,
        ...scanned(
          "https://oldmillroofing.example",
          { ...GOOD_CHECKS, metaDescription: false, clickToCall: false, localBusinessSchema: false },
          { performance: 62, lcpMs: 3600, cls: 0.12 },
          now,
        ),
      }),
      logs: [
        { channel: "call", outcome: "spoke", note: "Owner was busy, asked me to call back.", daysAgo: 15 },
        { channel: "call", outcome: "interested", note: "Wants to see a mockup.", daysAgo: 4 },
      ],
    },
    {
      lead: base(8, {
        business_name: "Demo Summit Painting",
        trade: "painter",
        address: "64 Demo Pond Road, Concord, NH",
        city: "Concord",
        state: "NH",
        phone: "(603) 555-0108",
        website_url: "https://summitpainting.example",
        rating: 4.8,
        review_count: 33,
        status: "new",
        first_found_at: ago(5),
        site_status: "ok",
        scored_at: iso,
        ...scanned("https://summitpainting.example", GOOD_CHECKS, { performance: 94, lcpMs: 1700, cls: 0.02 }, now),
      }),
      logs: [],
    },
    {
      lead: base(9, {
        business_name: "Demo Harbor Lights Electric",
        trade: "electrician",
        address: "18 Demo Pier, Newport, RI",
        city: "Newport",
        state: "RI",
        phone: "(401) 555-0109",
        website_url: "https://harborlightselectric.example",
        rating: 4.9,
        review_count: 120,
        status: "call_booked",
        first_found_at: ago(34),
        last_contacted_at: ago(6),
        site_status: "ok",
        scored_at: iso,
        ...scanned(
          "https://harborlightselectric.example",
          { ...GOOD_CHECKS, metaDescription: false, localBusinessSchema: false },
          { performance: 85, lcpMs: 2300, cls: 0.05 },
          now,
        ),
      }),
      logs: [
        { channel: "call", outcome: "spoke", note: null, daysAgo: 20 },
        { channel: "call", outcome: "interested", note: null, daysAgo: 12 },
        { channel: "email", outcome: null, note: "Sent the intro email.", daysAgo: 10 },
        { channel: "call", outcome: "booked", note: "Call booked for next week.", daysAgo: 6 },
      ],
    },
    {
      lead: base(10, {
        business_name: "Demo Maple Street Lawn Care",
        trade: "landscaper",
        address: "3 Demo Maple Street, Franklin, MA",
        city: "Franklin",
        state: "MA",
        phone: "(508) 555-0110",
        website_url: null,
        rating: 4.1,
        review_count: 14,
        status: "won",
        first_found_at: ago(45),
        last_contacted_at: ago(26),
        notes: "Demo: signed up for the $97 plan.",
        site_status: "none",
        scored_at: iso,
      }),
      logs: [
        { channel: "call", outcome: "spoke", note: null, daysAgo: 30 },
        { channel: "call", outcome: "interested", note: null, daysAgo: 28 },
        { channel: "call", outcome: "booked", note: null, daysAgo: 26 },
      ],
    },
  ];
}
