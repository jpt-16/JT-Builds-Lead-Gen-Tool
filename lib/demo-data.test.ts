import { describe, expect, it } from "vitest";
import { buildDemoLeads, DEMO_PREFIX } from "./demo-data";
import { buildDrafts, type DraftLead } from "./drafts";
import { computePriority, whyThisLead } from "./priority";
import { healthBand } from "./site-issues";

const now = new Date("2026-10-16T15:00:00Z");
const demo = buildDemoLeads(now);

describe("buildDemoLeads", () => {
  it("makes ten leads with unique demo place ids", () => {
    expect(demo).toHaveLength(10);
    const ids = demo.map((d) => d.lead.place_id);
    expect(new Set(ids).size).toBe(10);
    expect(ids.every((id) => id.startsWith(DEMO_PREFIX))).toBe(true);
  });

  it("is obviously fake: Demo names, reserved 555-01xx phones, no real sites", () => {
    for (const { lead } of demo) {
      expect(lead.business_name).toMatch(/^Demo /);
      expect(lead.phone).toMatch(/^\(\d{3}\) 555-01\d\d$/);
      if (lead.website_url && !/facebook\.com/.test(lead.website_url)) expect(lead.website_url).toMatch(/\.example\/?$/);
    }
  });

  it("covers every website situation and a spread of stages", () => {
    const sites = new Set(demo.map((d) => d.lead.site_status));
    expect([...sites].sort()).toEqual(["dead", "none", "ok", "parked", "social"]);
    const bands = demo.filter((d) => d.lead.score_total != null).map((d) => healthBand(d.lead.score_total!));
    expect(new Set(bands)).toEqual(new Set(["weak", "fair", "good"]));
    const statuses = new Set(demo.map((d) => d.lead.status));
    for (const s of ["new", "queued", "contacted", "replied", "call_booked", "won"]) expect(statuses.has(s as never)).toBe(true);
  });

  it("never queues the demo leads for scoring or a Google refresh", () => {
    for (const { lead } of demo) {
      expect(lead.scored_at).toBeTruthy();
      expect(lead.last_refreshed_at).toBe(now.toISOString());
    }
  });

  it("spreads leads and outreach over the last eight weeks, never in the future", () => {
    const eightWeeks = 56 * 24 * 60 * 60 * 1000;
    for (const { lead, logs } of demo) {
      const found = new Date(lead.first_found_at!).getTime();
      expect(found).toBeLessThanOrEqual(now.getTime());
      expect(now.getTime() - found).toBeLessThan(eightWeeks);
      for (const log of logs) expect(log.daysAgo).toBeGreaterThan(0);
    }
    expect(demo.flatMap((d) => d.logs).length).toBeGreaterThanOrEqual(9);
  });

  it("has one follow-up due now and the last contact matches the latest log", () => {
    const due = demo.filter((d) => d.lead.next_follow_up_at && new Date(d.lead.next_follow_up_at) <= now);
    expect(due).toHaveLength(1);
    for (const { lead, logs } of demo.filter((d) => d.logs.length)) {
      const newest = Math.min(...logs.map((l) => l.daysAgo));
      const contacted = (now.getTime() - new Date(lead.last_contacted_at!).getTime()) / 86_400_000;
      expect(Math.abs(contacted - newest)).toBeLessThan(0.1);
    }
  });

  it("ranks sensibly: no-site leads above good sites, closed leads at zero", () => {
    const priority = (place: string) => {
      const l = demo.find((d) => d.lead.place_id === place)!.lead;
      return computePriority({
        status: l.status!,
        site_status: l.site_status!,
        score_total: l.score_total ?? null,
        review_count: l.review_count!,
        rating: l.rating ?? null,
        phone: l.phone ?? null,
      });
    };
    expect(priority("demo-01")).toBeGreaterThan(priority("demo-08"));
    expect(priority("demo-10")).toBe(0);
    expect(
      whyThisLead({
        status: "new",
        site_status: "none",
        score_total: null,
        review_count: 6,
        rating: 4.2,
        phone: "(508) 555-0101",
        trade: "landscaper",
        city: "Mansfield",
        state: "MA",
        website_url: null,
        score_breakdown: null,
      }),
    ).toContain("No website");
  });

  it("gives good sites the automation pitch and the rest the website pitch", () => {
    const config = { senderName: "Sam", callbackPhone: "(781) 555-0100", mailingAddress: "PO Box 12" };
    const pitch = (place: string) => {
      const l = demo.find((d) => d.lead.place_id === place)!.lead;
      return buildDrafts(l as unknown as DraftLead, config).basedOn[0];
    };
    expect(pitch("demo-08")).toContain("follow-up automation");
    expect(pitch("demo-09")).toContain("follow-up automation");
    expect(pitch("demo-06")).toMatch(/^Site score \d+\/100$/);
    expect(pitch("demo-01")).toBe("No website on the Google listing");
  });
});
