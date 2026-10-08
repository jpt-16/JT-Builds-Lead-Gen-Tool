// Calendar helpers in Eastern time, where I work. "Today", "this week" and
// follow-up dates mean Eastern days no matter where the server runs.

const TZ = "America/New_York";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function easternParts(at: Date) {
  const p = Object.fromEntries(partsFormatter.formatToParts(at).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Eastern wall-clock time minus UTC, in ms (negative: -4h or -5h). */
function easternOffsetMs(at: Date): number {
  const p = easternParts(at);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(at.getTime() / 1000) * 1000;
}

/** Today's date in Eastern time as YYYY-MM-DD. */
export function easternDate(now = new Date()): string {
  const p = easternParts(now);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The instant an Eastern date starts at the given hour (default midnight). */
export function easternTime(ymd: string, hour = 0): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour);
  let result = guess - easternOffsetMs(new Date(guess));
  // Re-check once in case the guess and the result straddle a DST change.
  result = guess - easternOffsetMs(new Date(result));
  return new Date(result);
}

/** End of today in Eastern time: anything due before this is due today or overdue. */
export function endOfTodayEastern(now = new Date()): Date {
  return easternTime(addDays(easternDate(now), 1));
}

/** Monday 00:00 Eastern of the current week. */
export function startOfWeekEastern(now = new Date()): Date {
  const today = easternDate(now);
  const [y, m, d] = today.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  return easternTime(addDays(today, -((weekday + 6) % 7)));
}

/** A follow-up `days` from today, at 9am Eastern. */
export function followUpAt(days: number, now = new Date()): Date {
  return easternTime(addDays(easternDate(now), days), 9);
}
