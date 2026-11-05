// mlsServiceWindow.ts
// The two-business-hour MLS upload service window, in America/New_York.
//
// The existing businessDays helper counts whole days for interview deadlines. This is a
// different question: how many working MINUTES inside an operating window (e.g. 09:00–18:00)
// a request is allowed to take. A request submitted at 5 PM with a 09:00–18:00 window and a
// two hour service target is therefore due at 10 AM the next operating day, not at 7 PM.
//
// Settings live in AppSetting under `mls_service_window` so the window, the operating days,
// the holidays and the service target can all change without a deploy.

import { etParts, etWallToUtc } from "./businessEmailQueue.ts";

export const MLS_SERVICE_WINDOW_KEY = "mls_service_window";

export interface MlsServiceWindow {
  days: number[];          // 0 = Sunday … 6 = Saturday
  open_minute: number;     // minutes from midnight ET
  close_minute: number;    // minutes from midnight ET
  service_hours: number;   // business hours allowed for the upload
  holidays: string[];      // YYYY-MM-DD in ET
  timezone: string;
}

export const DEFAULT_MLS_SERVICE_WINDOW: MlsServiceWindow = {
  days: [1, 2, 3, 4, 5],
  open_minute: 9 * 60,
  close_minute: 18 * 60,
  service_hours: 2,
  holidays: [],
  timezone: "America/New_York",
};

function hhmmToMinutes(value: string): number | null {
  const m = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function minutesToHhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Reads the configured window, falling back to the documented default for any value
 * that is missing or malformed, so a bad setting can never stop requests being accepted.
 */
export async function loadMlsServiceWindow(base44: any): Promise<MlsServiceWindow> {
  try {
    const rows = await base44.asServiceRole.entities.AppSetting.filter({ key: MLS_SERVICE_WINDOW_KEY }, undefined, 1);
    const raw = rows?.[0]?.value;
    if (!raw) return DEFAULT_MLS_SERVICE_WINDOW;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const days = Array.isArray(parsed?.days)
      ? parsed.days.map((d: any) => Number(d)).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6)
      : DEFAULT_MLS_SERVICE_WINDOW.days;
    const open = hhmmToMinutes(parsed?.open) ?? DEFAULT_MLS_SERVICE_WINDOW.open_minute;
    const close = hhmmToMinutes(parsed?.close) ?? DEFAULT_MLS_SERVICE_WINDOW.close_minute;
    const hours = Number(parsed?.service_hours);
    return {
      days: days.length > 0 ? days : DEFAULT_MLS_SERVICE_WINDOW.days,
      open_minute: open,
      close_minute: close > open ? close : DEFAULT_MLS_SERVICE_WINDOW.close_minute,
      service_hours: Number.isFinite(hours) && hours > 0 && hours <= 24 ? hours : DEFAULT_MLS_SERVICE_WINDOW.service_hours,
      holidays: Array.isArray(parsed?.holidays) ? parsed.holidays.map((h: any) => String(h)) : [],
      timezone: "America/New_York",
    };
  } catch {
    return DEFAULT_MLS_SERVICE_WINDOW;
  }
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isOperatingDay(config: MlsServiceWindow, year: number, month: number, day: number): boolean {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (!config.days.includes(weekday)) return false;
  if (config.holidays.includes(dateKey(year, month, day))) return false;
  return true;
}

function nextCalendarDay(year: number, month: number, day: number) {
  const d = new Date(Date.UTC(year, month - 1, day + 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/**
 * The instant the service target is reached, counting only operating minutes.
 * Returns null only if no operating day could be found within a year of scanning.
 */
export function computeMlsDeadline(from: Date, config: MlsServiceWindow): Date | null {
  let remaining = Math.round(config.service_hours * 60);
  let cursor = new Date(from.getTime());

  for (let guard = 0; guard < 400; guard++) {
    const p = etParts(cursor);
    if (!isOperatingDay(config, p.year, p.month, p.day)) {
      const next = nextCalendarDay(p.year, p.month, p.day);
      cursor = etWallToUtc(next.year, next.month, next.day, Math.floor(config.open_minute / 60), config.open_minute % 60);
      continue;
    }

    const minuteOfDay = p.hour * 60 + p.minute;
    if (minuteOfDay < config.open_minute) {
      cursor = etWallToUtc(p.year, p.month, p.day, Math.floor(config.open_minute / 60), config.open_minute % 60);
      continue;
    }
    if (minuteOfDay >= config.close_minute) {
      const next = nextCalendarDay(p.year, p.month, p.day);
      cursor = etWallToUtc(next.year, next.month, next.day, Math.floor(config.open_minute / 60), config.open_minute % 60);
      continue;
    }

    const available = config.close_minute - minuteOfDay;
    if (remaining <= available) {
      return new Date(cursor.getTime() + remaining * 60 * 1000);
    }
    remaining -= available;

    const next = nextCalendarDay(p.year, p.month, p.day);
    cursor = etWallToUtc(next.year, next.month, next.day, Math.floor(config.open_minute / 60), config.open_minute % 60);
  }
  return null;
}

/**
 * Operating minutes elapsed between two instants. Used for the 60-minute and 90-minute
 * reminders, which are measured in business processing time rather than wall clock time.
 */
export function businessMinutesBetween(from: Date, to: Date, config: MlsServiceWindow): number {
  if (!(to > from)) return 0;
  let total = 0;
  let cursor = new Date(from.getTime());

  for (let guard = 0; guard < 400 && cursor < to; guard++) {
    const p = etParts(cursor);
    if (!isOperatingDay(config, p.year, p.month, p.day)) {
      const next = nextCalendarDay(p.year, p.month, p.day);
      cursor = etWallToUtc(next.year, next.month, next.day, Math.floor(config.open_minute / 60), config.open_minute % 60);
      continue;
    }
    const minuteOfDay = p.hour * 60 + p.minute;
    if (minuteOfDay < config.open_minute) {
      cursor = etWallToUtc(p.year, p.month, p.day, Math.floor(config.open_minute / 60), config.open_minute % 60);
      continue;
    }
    if (minuteOfDay >= config.close_minute) {
      const next = nextCalendarDay(p.year, p.month, p.day);
      cursor = etWallToUtc(next.year, next.month, next.day, Math.floor(config.open_minute / 60), config.open_minute % 60);
      continue;
    }

    const closeInstant = etWallToUtc(p.year, p.month, p.day, Math.floor(config.close_minute / 60), config.close_minute % 60);
    const segmentEnd = closeInstant < to ? closeInstant : to;
    total += Math.max(0, Math.round((segmentEnd.getTime() - cursor.getTime()) / 60000));
    if (closeInstant >= to) break;

    const next = nextCalendarDay(p.year, p.month, p.day);
    cursor = etWallToUtc(next.year, next.month, next.day, Math.floor(config.open_minute / 60), config.open_minute % 60);
  }
  return total;
}

/** "Thu, Nov 6 at 10:00 AM ET" — always shown in the customer's own language, in ET. */
export function formatEtDeadline(date: Date | string | null): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
  return `${day} at ${time} ET`;
}

export function describeWindow(config: MlsServiceWindow): string {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayList = config.days.slice().sort().map((d) => names[d]).join(", ");
  return `${config.service_hours} business hour${config.service_hours === 1 ? "" : "s"} (${minutesToHhmm(config.open_minute)}–${minutesToHhmm(config.close_minute)} ET, ${dayList})`;
}