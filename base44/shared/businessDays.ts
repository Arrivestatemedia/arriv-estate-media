/**
 * businessDays.ts
 * Async interview deadlines are counted in BUSINESS DAYS:
 * Saturday and Sunday do not count, every other day does, and the time of day
 * is kept. So an invitation sent at 5:34 PM on a Friday expires at 5:34 PM on
 * the following Tuesday. 48 business hours = 2 business days.
 */
import { etParts, etWallToUtc } from "./businessEmailQueue.ts";

const DAY_MS = 24 * 3600 * 1000;

/** Whole business days for a clock-hours value (48 hours = 2 business days). */
export function businessDaysFromHours(hours: number): number {
  return Math.max(1, Math.round((Number(hours) || 48) / 24));
}

/** Adds business days to an instant, skipping Saturdays and Sundays. */
export function addBusinessDays(start: Date, days: number): Date {
  const p = etParts(start);
  let cursor = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  let remaining = Math.max(0, Math.round(days));

  while (remaining > 0) {
    cursor += DAY_MS;
    const weekday = new Date(cursor).getUTCDay();
    if (weekday >= 1 && weekday <= 5) remaining -= 1;
  }

  const d = new Date(cursor);
  return etWallToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
}