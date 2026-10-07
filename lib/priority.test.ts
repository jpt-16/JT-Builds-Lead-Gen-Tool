import { describe, expect, it } from "vitest";
import { computePriority, whyThisLead, type WhyInput } from "./priority";

const base: WhyInput = {
  status: "new",
  site_status: "none",
  score_total: null,
  review_count: 6,
  rating: 4.8,
  phone: "(508) 555-0100",
  website_url: null,
  score_breakdown: null,
  trade: "landscaper",
  city: "Mansfield",
  state: "MA",
};

describe("computePriority", () => {
  it("ranks no website above a weak site, and a weak site above a good one", () => {
    const none = computePriority(base);
    const weak = computePriority({ ...base, site_status: "ok", score_total: 30 });
    const good = computePriority({ ...base, site_status: "ok", score_total: 95 });
    expect(none).toBeGreaterThan(weak);
    expect(weak).toBeGreaterThan(good);
  });

  it("treats dead, parked and social-only sites exactly like no website", () => {
    const none = computePriority(base);
    for (const site_status of ["dead", "parked", "social"]) {
      expect(computePriority({ ...base, site_status, score_total: null })).toBe(none);
    }
  });

  it("gives a moderate boost for few reviews and a low or missing rating", () => {
    const established = computePriority({ ...base, review_count: 80, rating: 4.9 });
    const fewReviews = computePriority({ ...base, review_count: 6, rating: 4.9 });
    const both = computePriority({ ...base, review_count: 6, rating: 4.1 });
    expect(fewReviews).toBeGreaterThan(established);
    expect(both).toBeGreaterThan(fewReviews);
    expect(both - established).toBeLessThanOrEqual(20); // moderate, not dominant
  });

  it("heavily lowers leads without a phone number", () => {
    const callable = computePriority(base);
    const noPhone = computePriority({ ...base, phone: null });
    expect(noPhone).toBeLessThan(callable / 2);
  });

  it("is 0 for won, lost and do-not-contact leads", () => {
    for (const status of ["won", "lost", "do_not_contact"]) {
      expect(computePriority({ ...base, status })).toBe(0);
    }
  });

  it("stays within 0 to 100, with the best possible lead at 100", () => {
    expect(computePriority({ ...base, review_count: 0, rating: null })).toBe(100);
    expect(computePriority({ ...base, site_status: "ok", score_total: 100, review_count: 500, rating: 5 })).toBeGreaterThanOrEqual(0);
  });

  it("puts an unscored site in the middle", () => {
    const unscored = computePriority({ ...base, site_status: null });
    expect(unscored).toBeLessThan(computePriority(base));
    expect(unscored).toBeGreaterThan(computePriority({ ...base, site_status: "ok", score_total: 95 }));
  });
});

describe("whyThisLead", () => {
  it("matches the example format", () => {
    expect(whyThisLead(base)).toBe("No website. 6 reviews. Landscaper in Mansfield, MA.");
  });

  it("names the social platform and the two biggest site problems", () => {
    expect(whyThisLead({ ...base, site_status: "social", website_url: "https://facebook.com/acme" })).toBe(
      "Only a Facebook page. 6 reviews. Landscaper in Mansfield, MA.",
    );
    expect(
      whyThisLead({
        ...base,
        site_status: "ok",
        score_total: 41,
        website_url: "https://acme.example",
        score_breakdown: {
          deductions: [
            { check: "performance", points: 14, short: "slow on mobile", message: "" },
            { check: "click_to_call", points: 10, short: "no click-to-call", message: "" },
            { check: "schema", points: 5, short: "no LocalBusiness schema", message: "" },
          ],
        },
      }),
    ).toBe("Website scores 41/100: slow on mobile, no click-to-call. 6 reviews. Landscaper in Mansfield, MA.");
  });

  it("mentions a low rating, no reviews and a missing phone", () => {
    expect(whyThisLead({ ...base, rating: 3.9 })).toBe("No website. 6 reviews, 3.9 stars. Landscaper in Mansfield, MA.");
    expect(whyThisLead({ ...base, review_count: 0, rating: null, phone: null, trade: "HVAC" })).toBe(
      "No website. No reviews. No phone listed. HVAC in Mansfield, MA.",
    );
  });
});
