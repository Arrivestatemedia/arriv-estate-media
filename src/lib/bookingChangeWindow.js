// A client may reschedule or cancel their own booking up until 24 hours before
// the shoot. Inside that window they must contact us instead.

export const CLIENT_CHANGE_CUTOFF_HOURS = 24;

const OPEN_STATUSES = ["pending", "confirmed", "approved"];

function easternOffsetMinutes(utcMs) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "shortOffset",
  });
  const label = dtf.formatToParts(new Date(utcMs)).find((p) => p.type === "timeZoneName")?.value || "GMT-5";
  const match = label.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const sign = match?.[1] === "-" ? -1 : 1;
  return sign * (Number(match?.[2] || 5) * 60 + Number(match?.[3] || 0));
}

function parseTime(time) {
  const t = String(time || "").trim();
  const twelve = t.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (twelve) {
    let hours = Number(twelve[1]) % 12;
    if (/p/i.test(twelve[3])) hours += 12;
    return { hours, minutes: Number(twelve[2]) };
  }
  const twentyFour = t.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) return { hours: Number(twentyFour[1]), minutes: Number(twentyFour[2]) };
  return null;
}

export function bookingShootStart(booking) {
  const dateStr = String(booking?.preferred_date || "").slice(0, 10);
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !n)) return null;
  const [year, month, day] = parts;
  const time = parseTime(booking?.preferred_time) || { hours: 0, minutes: 0 };
  const naiveUtc = Date.UTC(year, month - 1, day, time.hours, time.minutes);
  const startMs = naiveUtc - easternOffsetMinutes(naiveUtc) * 60000;
  return new Date(startMs);
}

export function bookingChangeWindow(booking) {
  const start = bookingShootStart(booking);
  if (!start) return { canChange: true, start: null, hoursLeft: null };
  const hoursLeft = (start.getTime() - Date.now()) / 3600000;
  const status = booking?.status || "pending";
  if (!OPEN_STATUSES.includes(status)) return { canChange: false, start, hoursLeft };
  return { canChange: hoursLeft > CLIENT_CHANGE_CUTOFF_HOURS, start, hoursLeft };
}