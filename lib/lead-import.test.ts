import { describe, expect, it } from "vitest";
import { planImport } from "./lead-import";
import type { LeadGoogleFields } from "./places";

function lead(placeId: string, overrides: Partial<LeadGoogleFields> = {}): LeadGoogleFields {
  return {
    place_id: placeId,
    business_name: `Business ${placeId}`,
    address: null,
    city: "Mansfield",
    state: "MA",
    phone: null,
    website_url: null,
    google_maps_url: null,
    rating: null,
    review_count: 0,
    has_website: false,
    ...overrides,
  };
}

const now = new Date("2026-10-07T12:00:00Z");
const base = {
  isSuppressed: () => false,
  trade: "landscaper",
  sourceQuery: "landscaper in Mansfield, MA",
  now,
  existing: new Map<string, string | null>(),
};

describe("planImport", () => {
  it("inserts new place_ids with trade and source query", () => {
    const plan = planImport([lead("a")], base);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({ place_id: "a", trade: "landscaper", source_query: "landscaper in Mansfield, MA" });
    expect(plan.updates).toEqual([]);
  });

  it("sets the starting scoring state: no site and social pages skip the queue", () => {
    const plan = planImport(
      [
        lead("none"),
        lead("fb", { website_url: "https://www.facebook.com/acme", has_website: true }),
        lead("site", { website_url: "https://acme.example", has_website: true }),
      ],
      base,
    );
    const byId = Object.fromEntries(plan.inserts.map((r) => [r.place_id, r]));
    expect(byId.none).toMatchObject({ site_status: "none", scored_at: now.toISOString() });
    expect(byId.fb).toMatchObject({ site_status: "social", scored_at: now.toISOString() });
    expect(byId.site).toMatchObject({ site_status: null, scored_at: null }); // queued for scoring
  });

  it("only refreshes Google fields for existing leads, never status, notes or trade", () => {
    const plan = planImport([lead("a", { phone: "(508) 555-0199" })], { ...base, existing: new Map([["a", null]]) });
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toHaveLength(1);
    const update = plan.updates[0];
    expect(update.phone).toBe("(508) 555-0199");
    expect(update.last_refreshed_at).toBe(now.toISOString());
    for (const protectedField of [
      "status",
      "notes",
      "trade",
      "source_query",
      "last_contacted_at",
      "next_follow_up_at",
      "priority_score",
      "score_total", // website unchanged, so the score is kept
    ]) {
      expect(update).not.toHaveProperty(protectedField);
    }
  });

  it("clears the old score when an existing lead's website changes", () => {
    const plan = planImport([lead("a", { website_url: "https://new.example", has_website: true })], {
      ...base,
      existing: new Map([["a", "https://old.example"]]),
    });
    expect(plan.updates[0]).toMatchObject({
      website_url: "https://new.example",
      site_status: null,
      scored_at: null,
      score_total: null,
      score_breakdown: null,
      score_attempts: 0,
    });
  });

  it("collapses duplicate place_ids within one batch", () => {
    const plan = planImport([lead("a"), lead("a"), lead("b")], base);
    expect(plan.inserts.map((l) => l.place_id)).toEqual(["a", "b"]);
  });

  it("skips suppressed businesses, new or existing", () => {
    const plan = planImport([lead("a", { phone: "5085550100" }), lead("b", { phone: "5085550100" }), lead("c")], {
      ...base,
      existing: new Map([["b", null]]),
      isSuppressed: (l) => l.phone === "5085550100",
    });
    expect(plan.suppressed).toBe(2);
    expect(plan.inserts.map((l) => l.place_id)).toEqual(["c"]);
    expect(plan.updates).toEqual([]);
  });
});
