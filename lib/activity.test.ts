import { describe, expect, it } from "vitest";
import { bucketByWeek, toMetric, weekStarts } from "./activity";

describe("weekly activity", () => {
  const now = new Date("2026-10-16T15:00:00Z"); // Friday

  it("returns 8 Monday-midnight Eastern week starts, oldest first", () => {
    const starts = weekStarts(now);
    expect(starts).toHaveLength(8);
    expect(starts.at(-1)!.toISOString()).toBe("2026-10-12T04:00:00.000Z");
    expect(starts[0].toISOString()).toBe("2026-08-24T04:00:00.000Z");
  });

  it("counts timestamps into their week and ignores older ones", () => {
    const starts = weekStarts(now);
    const counts = bucketByWeek(
      [
        "2026-10-12T04:00:00.000Z", // this week, first instant
        "2026-10-16T12:00:00.000Z", // this week
        "2026-10-12T03:59:59.000Z", // Sunday 11:59pm Eastern: last week
        "2026-08-01T00:00:00.000Z", // too old
      ],
      starts,
    );
    expect(counts.at(-1)).toBe(2);
    expect(counts.at(-2)).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("summarises this week vs last week", () => {
    expect(toMetric([0, 0, 0, 0, 0, 0, 3, 5])).toEqual({ thisWeek: 5, lastWeek: 3, series: [0, 0, 0, 0, 0, 0, 3, 5] });
  });
});
