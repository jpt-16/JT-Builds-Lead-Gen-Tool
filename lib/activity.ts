import { addDays, easternDate, easternTime, startOfWeekEastern } from "@/lib/dates";

// Weekly activity for the dashboard metric cards: this week vs last week and
// an 8-week trend. Weeks start Monday 00:00 Eastern.

export const TREND_WEEKS = 8;

/** Start instants of the last `weeks` weeks, oldest first; the last one is this week. */
export function weekStarts(now = new Date(), weeks = TREND_WEEKS): Date[] {
  const thisWeek = easternDate(startOfWeekEastern(now));
  return Array.from({ length: weeks }, (_, i) => easternTime(addDays(thisWeek, -7 * (weeks - 1 - i))));
}

/** Counts timestamps into the weekly buckets that start at `starts`. Earlier timestamps are ignored. */
export function bucketByWeek(timestamps: string[], starts: Date[]): number[] {
  const counts = starts.map(() => 0);
  const bounds = starts.map((d) => d.getTime());
  for (const iso of timestamps) {
    const t = new Date(iso).getTime();
    for (let i = bounds.length - 1; i >= 0; i--) {
      if (t >= bounds[i]) {
        counts[i]++;
        break;
      }
    }
  }
  return counts;
}

export type WeeklyMetric = { thisWeek: number; lastWeek: number; series: number[] };

export function toMetric(series: number[]): WeeklyMetric {
  return { thisWeek: series.at(-1) ?? 0, lastWeek: series.at(-2) ?? 0, series };
}
