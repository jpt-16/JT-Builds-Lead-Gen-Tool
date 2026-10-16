import { describe, expect, it } from "vitest";
import { filtersToParams, leadQuerySchema, parseLeadFilters } from "./lead-query";

describe("parseLeadFilters", () => {
  it("defaults to priority, highest first, page 1", () => {
    expect(parseLeadFilters({})).toMatchObject({ sort: "priority", dir: "desc", page: 1 });
  });

  it("parses and clamps filters, ignoring junk", () => {
    const f = parseLeadFilters({
      q: "  acme ",
      status: "replied",
      site: "no_real",
      state: "ma",
      scoreMin: "-5",
      scoreMax: "250",
      reviewsMax: "15",
      sort: "reviews",
      page: "3",
    });
    expect(f).toMatchObject({
      q: "acme",
      status: "replied",
      site: "no_real",
      state: "MA",
      scoreMin: 0,
      scoreMax: 100,
      reviewsMax: 15,
      sort: "reviews",
      dir: "asc",
      page: 3,
    });
    expect(parseLeadFilters({ status: "bogus", site: "bogus", sort: "bogus", page: "x" })).toMatchObject({
      status: undefined,
      site: undefined,
      sort: "priority",
      page: 1,
    });
  });

  it("only accepts uuid-shaped ids for exports", () => {
    const id = "3f1c2a3b-1111-4222-8333-444455556666";
    expect(parseLeadFilters({ ids: `${id},not-an-id` }).ids).toEqual([id]);
  });
});

describe("filtersToParams", () => {
  it("round-trips and drops defaults", () => {
    const f = parseLeadFilters({ q: "acme", trade: "plumber", sort: "priority", dir: "desc", page: "1" });
    expect(filtersToParams(f).toString()).toBe("q=acme&trade=plumber");
    expect(filtersToParams(f, { page: 2, sort: "name", dir: "asc" }).toString()).toBe("q=acme&trade=plumber&sort=name&page=2");
  });
});

describe("leadQuerySchema", () => {
  const ok = (params: Record<string, string>) => leadQuerySchema.safeParse(params).success;

  it("accepts what the leads table links to", () => {
    expect(ok({})).toBe(true);
    expect(
      ok({
        q: "alpha",
        trade: "plumber",
        state: "ma",
        status: "new",
        site: "no_real",
        scoreMin: "10",
        scoreMax: "60",
        sort: "score",
        dir: "asc",
        page: "2",
      }),
    ).toBe(true);
    expect(ok({ trade: "", status: "", scoreMin: "" })).toBe(true);
    expect(ok({ ids: "4df0b52c-0f59-4747-be8d-8a1bfb4bf65b,7fa3f2a7-7f73-4595-9ff8-4ce70d52de07" })).toBe(true);
  });

  it.each([
    ["unknown status", { status: "hot" }],
    ["unknown state", { state: "TX" }],
    ["score out of range", { scoreMax: "500" }],
    ["score not a number", { scoreMin: "abc" }],
    ["unknown sort", { sort: "random" }],
    ["bad direction", { dir: "sideways" }],
    ["page zero", { page: "0" }],
    ["too-long search", { q: "x".repeat(101) }],
    ["bad ids", { ids: "1,2,3" }],
  ])("rejects %s", (_label, params) => {
    expect(ok(params)).toBe(false);
  });
});
