import { describe, expect, it } from "vitest";
import { parseTownList } from "./find-leads-config";

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
