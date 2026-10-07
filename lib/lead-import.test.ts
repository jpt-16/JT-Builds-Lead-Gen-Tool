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

const base = {
  isSuppressed: () => false,
  trade: "landscaper",
  sourceQuery: "landscaper in Mansfield, MA",
  now: new Date("2026-10-07T12:00:00Z"),
};

describe("planImport", () => {
  it("inserts new place_ids with trade and source query", () => {
    const plan = planImport([lead("a")], { ...base, existingPlaceIds: new Set() });
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]).toMatchObject({ place_id: "a", trade: "landscaper", source_query: "landscaper in Mansfield, MA" });
    expect(plan.updates).toEqual([]);
  });

  it("only refreshes Google fields for existing leads, never status, notes or trade", () => {
    const plan = planImport([lead("a", { phone: "(508) 555-0199" })], { ...base, existingPlaceIds: new Set(["a"]) });
    expect(plan.inserts).toEqual([]);
    expect(plan.updates).toHaveLength(1);
    const update = plan.updates[0];
    expect(update.phone).toBe("(508) 555-0199");
    expect(update.last_refreshed_at).toBe("2026-10-07T12:00:00.000Z");
    for (const protectedField of ["status", "notes", "trade", "source_query", "last_contacted_at", "next_follow_up_at", "priority_score"]) {
      expect(update).not.toHaveProperty(protectedField);
    }
  });

  it("collapses duplicate place_ids within one batch", () => {
    const plan = planImport([lead("a"), lead("a"), lead("b")], { ...base, existingPlaceIds: new Set() });
    expect(plan.inserts.map((l) => l.place_id)).toEqual(["a", "b"]);
  });

  it("skips suppressed businesses, new or existing", () => {
    const plan = planImport([lead("a", { phone: "5085550100" }), lead("b", { phone: "5085550100" }), lead("c")], {
      ...base,
      existingPlaceIds: new Set(["b"]),
      isSuppressed: (l) => l.phone === "5085550100",
    });
    expect(plan.suppressed).toBe(2);
    expect(plan.inserts.map((l) => l.place_id)).toEqual(["c"]);
    expect(plan.updates).toEqual([]);
  });
});
