import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";
import { buildSuppressionMatcher, normalizeBusinessName } from "./suppression";

describe("normalizePhone", () => {
  it("reduces US formats to 10 digits", () => {
    expect(normalizePhone("(508) 555-0100")).toBe("5085550100");
    expect(normalizePhone("+1 508-555-0100")).toBe("5085550100");
    expect(normalizePhone("508.555.0100")).toBe("5085550100");
  });

  it("returns null for missing or short numbers", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("555-0100")).toBeNull();
  });
});

describe("normalizeBusinessName", () => {
  it("ignores case, punctuation and legal suffixes", () => {
    expect(normalizeBusinessName("Acme Landscaping, LLC")).toBe("acme landscaping");
    expect(normalizeBusinessName("ACME Landscaping Inc.")).toBe("acme landscaping");
    expect(normalizeBusinessName("Smith & Sons Plumbing Co")).toBe("smith and sons plumbing");
  });
});

describe("buildSuppressionMatcher", () => {
  const isSuppressed = buildSuppressionMatcher([
    { phone: "508-555-0100", email: null, business_name: null },
    { phone: null, email: null, business_name: "Bright Clean LLC" },
    { phone: null, email: "owner@example.com", business_name: null },
  ]);

  it("matches on phone regardless of formatting", () => {
    expect(isSuppressed({ phone: "(508) 555-0100", business_name: "Different Name" })).toBe(true);
  });

  it("matches on normalized business name", () => {
    expect(isSuppressed({ phone: null, business_name: "Bright Clean" })).toBe(true);
  });

  it("lets everyone else through", () => {
    expect(isSuppressed({ phone: "(508) 555-0199", business_name: "Acme Landscaping" })).toBe(false);
  });
});
