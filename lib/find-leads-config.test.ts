import { describe, expect, it } from "vitest";
import { DEFAULT_RESULT_CAP, pagesForCap, parseTownList, requestsPerTown, RESULT_CAPS } from "./find-leads-config";

describe("parseTownList", () => {
  it("uses the default state and honours a per-line override", () => {
    const { towns, errors } = parseTownList("Mansfield\n  Foxborough  \nNashua, nh\n\n", "MA");
    expect(errors).toEqual([]);
    expect(towns).toEqual([
      { city: "Mansfield", state: "MA" },
      { city: "Foxborough", state: "MA" },
      { city: "Nashua", state: "NH" },
    ]);
  });

  it("drops duplicates, ignoring case", () => {
    expect(parseTownList("Sharon\nsharon\nSharon, MA", "MA").towns).toEqual([{ city: "Sharon", state: "MA" }]);
  });

  it("rejects states outside MA, NH, RI", () => {
    const { towns, errors } = parseTownList("Hartford, CT\nWarwick, RI", "MA");
    expect(towns).toEqual([{ city: "Warwick", state: "RI" }]);
    expect(errors).toEqual(['"Hartford, CT": state must be MA, NH or RI']);
  });
});

describe("result caps", () => {
  it("maps a cap to Google pages and requests (20 per page, one request to locate the town)", () => {
    expect(RESULT_CAPS.map(pagesForCap)).toEqual([1, 2, 3]);
    expect(RESULT_CAPS.map(requestsPerTown)).toEqual([2, 3, 4]);
  });

  it("never asks for more than three pages and defaults to 40", () => {
    expect(pagesForCap(500)).toBe(3);
    expect(pagesForCap(0)).toBe(1);
    expect(DEFAULT_RESULT_CAP).toBe(40);
  });
});
