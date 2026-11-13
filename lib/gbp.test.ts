import { describe, expect, it } from "vitest";
import { gbpFacts, gbpGaps, type GbpInput, typeLabel } from "./gbp";

const blank: GbpInput = { has_hours: null, photo_count: null, primary_type: null, categories: null, search_rank: null, search_rank_query: null };

describe("gbpGaps", () => {
  it("says nothing about fields that were never fetched", () => {
    expect(gbpGaps(blank)).toEqual([]);
    expect(gbpFacts(blank)).toEqual([]);
  });

  it("flags missing hours, no photos, few photos and a rank outside the top three", () => {
    expect(gbpGaps({ ...blank, has_hours: false }).map((g) => g.key)).toEqual(["no_hours"]);
    expect(gbpGaps({ ...blank, photo_count: 0 }).map((g) => g.key)).toEqual(["no_photos"]);
    expect(gbpGaps({ ...blank, photo_count: 2 })[0]).toEqual({ key: "few_photos", text: "Only 2 photos on the Google listing" });
    expect(gbpGaps({ ...blank, photo_count: 1 })[0].text).toBe("Only 1 photo on the Google listing");
    expect(gbpGaps({ ...blank, search_rank: 7, search_rank_query: "plumber in Mansfield, MA" })[0].text).toBe(
      'Ranked #7 in Google results for "plumber in Mansfield, MA", outside the top 3',
    );
  });

  it("treats a complete profile and a top-three rank as fine", () => {
    expect(gbpGaps({ ...blank, has_hours: true, photo_count: 10, search_rank: 3 })).toEqual([]);
  });
});

describe("gbpFacts", () => {
  it("lists what is known", () => {
    expect(
      gbpFacts({
        has_hours: true,
        photo_count: 10,
        primary_type: "hvac_contractor",
        categories: [],
        search_rank: 2,
        search_rank_query: "HVAC in Nashua, NH",
      }),
    ).toEqual(["Category: hvac contractor", "Hours listed", "10+ photos", '#2 in results for "HVAC in Nashua, NH"']);
  });
});

describe("typeLabel", () => {
  it("makes Google types readable", () => {
    expect(typeLabel("house_cleaning_service")).toBe("house cleaning service");
    expect(typeLabel(null)).toBeNull();
  });
});
