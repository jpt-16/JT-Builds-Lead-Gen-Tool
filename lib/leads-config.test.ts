import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";
import { addDays, easternDate, easternTime, endOfTodayEastern, followUpAt, startOfWeekEastern } from "./dates";
import { nextStatus, OUTCOME_RULES } from "./leads-config";

describe("nextStatus", () => {
  it("moves forward but never backwards", () => {
    expect(nextStatus("new", "contacted")).toBe("contacted");
    expect(nextStatus("queued", "replied")).toBe("replied");
    expect(nextStatus("replied", "contacted")).toBe("replied"); // a later no-answer keeps the stage
    expect(nextStatus("call_booked", "replied")).toBe("call_booked");
  });

  it("applies lost from any open stage and revives a lost lead that turns interested", () => {
    expect(nextStatus("contacted", "lost")).toBe("lost");
    expect(nextStatus("lost", "replied")).toBe("replied");
  });

  it("never changes won or do-not-contact automatically", () => {
    expect(nextStatus("won", "lost")).toBe("won");
    expect(nextStatus("do_not_contact", "replied")).toBe("do_not_contact");
  });

  it("has a rule for every outcome, and closing outcomes clear the follow-up", () => {
    expect(OUTCOME_RULES.no_answer).toEqual({ status: "contacted", followUpDays: 2 });
    expect(OUTCOME_RULES.booked.followUpDays).toBeNull();
    expect(OUTCOME_RULES.not_interested).toEqual({ status: "lost", followUpDays: null });
  });
});

describe("Eastern dates", () => {
  it("uses the Eastern calendar day, not UTC", () => {
    // 11pm Eastern on Oct 7 is already Oct 8 in UTC.
    expect(easternDate(new Date("2026-10-08T03:00:00Z"))).toBe("2026-10-07");
  });

  it("finds Eastern midnight on both sides of a DST change", () => {
    expect(easternTime("2026-10-08").toISOString()).toBe("2026-10-08T04:00:00.000Z"); // EDT
    expect(easternTime("2026-11-02").toISOString()).toBe("2026-11-02T05:00:00.000Z"); // EST
    expect(easternTime("2026-11-02", 9).toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("computes end of today, start of week and follow-ups", () => {
    const now = new Date("2026-10-07T15:00:00Z"); // Wednesday
    expect(endOfTodayEastern(now).toISOString()).toBe("2026-10-08T04:00:00.000Z");
    expect(startOfWeekEastern(now).toISOString()).toBe("2026-10-05T04:00:00.000Z"); // Monday
    expect(followUpAt(2, now).toISOString()).toBe("2026-10-09T13:00:00.000Z"); // Fri 9am EDT
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("CSV", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('Smith, "Sons" & Co')).toBe('"Smith, ""Sons"" & Co"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
  });

  it("defuses spreadsheet formulas from outside data", () => {
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvCell("+1 508 555 0100")).toBe("'+1 508 555 0100");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });

  it("writes a header row and CRLF line endings", () => {
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
  });
});
