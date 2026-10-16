import { createHash, timingSafeEqual } from "node:crypto";

// The Vercel cron job calls /api/cron/maintain with
// "Authorization: Bearer <CRON_SECRET>". Anything else is refused.

const digest = (value: string) => createHash("sha256").update(value).digest();

/** True only if the header is exactly "Bearer <secret>". Compares in constant time. */
export function isAuthorizedCron(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false;
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

/** Per-run limits, kept small so one run fits inside the function time limit. */
export const CRON_REFRESH_BATCH = 10;
export const CRON_SCORE_BATCH = 5;
/** Stop starting new leads after this long; a lead takes up to ~70s. */
export const CRON_TIME_BUDGET_MS = 180_000;
