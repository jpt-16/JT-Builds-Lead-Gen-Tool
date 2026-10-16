import { describe, expect, it } from "vitest";
import { groupIssues, healthBand, issueFor } from "./site-issues";

describe("site issues", () => {
  it("groups deductions by severity with a fix for each", () => {
    const groups = groupIssues({
      deductions: [
        { check: "https", points: 10, short: "no HTTPS", message: "No HTTPS." },
        { check: "click_to_call", points: 10, short: "no click-to-call", message: "No tap to call." },
        { check: "schema", points: 5, short: "no schema", message: "No schema." },
      ],
      flags: ["Built with Wix"],
    });
    expect(groups.error.map((i) => i.check)).toEqual(["https"]);
    expect(groups.warning.map((i) => i.check)).toEqual(["click_to_call"]);
    expect(groups.notice.map((i) => i.check)).toEqual(["schema", "flag:Built with Wix"]);
    for (const issue of [...groups.error, ...groups.warning, ...groups.notice]) expect(issue.fix.length).toBeGreaterThan(10);
  });

  it("treats slow mobile speed as an error and mild slowness as a warning", () => {
    expect(issueFor({ check: "performance", points: 13, short: "", message: "" }).severity).toBe("error");
    expect(issueFor({ check: "performance", points: 4, short: "", message: "" }).severity).toBe("warning");
  });

  it("defaults unknown checks (e.g. from the SEO tool) to warnings", () => {
    expect(issueFor({ check: "seo_tool_0", points: 3, short: "", message: "x" }).severity).toBe("warning");
  });

  it("handles a missing breakdown", () => {
    expect(groupIssues(null)).toEqual({ error: [], warning: [], notice: [] });
  });

  it("bands scores", () => {
    expect([healthBand(30), healthBand(50), healthBand(79), healthBand(80)]).toEqual(["weak", "fair", "fair", "good"]);
  });
});
