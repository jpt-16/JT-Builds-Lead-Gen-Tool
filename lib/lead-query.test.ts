import { describe, expect, it } from "vitest";
import { filtersToParams, parseLeadFilters } from "./lead-query";

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
    expect(f).toMatchObject({ q: "acme", status: "replied", site: "no_real", state: "MA", scoreMin: 0, scoreMax: 100, reviewsMax: 15, sort: "reviews", dir: "asc", page: 3 });
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
