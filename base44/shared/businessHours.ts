/**
 * businessHours.ts
 * The recruiting week runs Monday–Friday, 9:00 AM–5:00 PM Eastern.
 *
 * Async interview deadlines are counted in BUSINESS hours, so the time a
 * candidate is given only runs during the recruiting week: an invitation sent
 * on a Friday afternoon no longer hands them a deadline that lands on a weekend.
 * 48 business hours is six recruiting days.
 */
import { etParts, etWallToUtc } from "./businessEmailQueue.ts";

const OPEN_HOUR = 9;
const CLOSE_HOUR = 17;
const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** An instant's Eastern wall clock, held as a UTC-millisecond value for arithmetic. */
function wallMs(at: Date): number {
  const p = etParts(at);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
}

function atHour(ms: number, hour: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0);
}

/** The next moment inside the recruiting week, at or after this wall clock. */
function nextOpenMoment(ms: number): number {
  let cursor = ms;
  for (let guard = 0; guard < 14; guard += 1) {
    const wall = new Date(cursor);
    const weekday = wall.getUTCDay();
    if (weekday === 6) {
      cursor = atHour(cursor + 2 * DAY_MS, OPEN_HOUR);
    } else if (weekday === 0) {
      cursor = atHour(cursor + DAY_MS, OPEN_HOUR);
    } else if (wall.getUTCHours() < OPEN_HOUR) {
      cursor = atHour(cursor, OPEN_HOUR);
    } else if (wall.getUTCHours() >= CLOSE_HOUR) {
      cursor = atHour(cursor + DAY_MS, OPEN_HOUR);
    } else {
      return cursor;
    }
  }
  return cursor;
}

/**
 * Adds business hours to an instant. Only hours inside Monday–Friday,
 * 9:00 AM–5:00 PM Eastern count; nights and weekends are free.
 */
export function addBusinessHours(start: Date, hours: number): Date {
  let remaining = Math.max(0, hours);
  let cursor = nextOpenMoment(wallMs(start));

  while (remaining > 0) {
    const available = (atHour(cursor, CLOSE_HOUR) - cursor) / HOUR_MS;
    if (remaining <= available) {
      cursor += remaining * HOUR_MS;
      remaining = 0;
    } else {
      remaining -= available;
      cursor = nextOpenMoment(atHour(cursor + DAY_MS, OPEN_HOUR));
    }
  }

  const d = new Date(cursor);
  return etWallToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
}