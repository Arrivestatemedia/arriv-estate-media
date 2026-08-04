import { sendBrevoEmail } from "./brevoClient.ts";

// Quiet hours: no automated business emails between 9:00 PM and 8:00 AM ET.
// Emails triggered during this window are queued and sent at the next 8:00 AM ET.

function etParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t) => {
    const p = parts.find((x) => x.type === t);
    let v = Number(p.value);
    // Some ICU versions emit "24" at midnight with hour12:false.
    if (t === "hour" && v === 24) v = 0;
    return v;
  };
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

// Convert a wall-clock Eastern Time (America/New_York) moment to a UTC Date,
// correctly handling DST transitions.
function etWallToUtc(year, month, day, hour, minute) {
  let instant = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let i = 0; i < 2; i++) {
    const p = etParts(new Date(instant));
    const actualUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
    instant += Date.UTC(year, month - 1, day, hour, minute, 0, 0) - actualUtc;
  }
  return new Date(instant);
}

export function isEtQuietHours(now = new Date()) {
  const p = etParts(now);
  const minutes = p.hour * 60 + p.minute;
  return minutes >= 21 * 60 || minutes < 8 * 60;
}

// Next 9:00 AM ET that is at or after 48 hours from now.
// Used for delayed disqualification notices: the email goes out at 9am ET,
// no sooner than 48 hours after the admin clicks "Disqualify".
export function nextEt9amAfter48hIso(now = new Date()) {
  const future = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const p = etParts(future);
  let candidate = etWallToUtc(p.year, p.month, p.day, 9, 0);
  if (candidate <= future) {
    const t = new Date(Date.UTC(p.year, p.month - 1, p.day) + 86400000);
    candidate = etWallToUtc(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), 9, 0);
  }
  return candidate.toISOString();
}

export function nextEt8amIso(now = new Date()) {
  const p = etParts(now);
  let candidate = etWallToUtc(p.year, p.month, p.day, 8, 0);
  if (candidate <= now) {
    const t = new Date(Date.UTC(p.year, p.month - 1, p.day) + 86400000);
    candidate = etWallToUtc(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), 8, 0);
  }
  return candidate.toISOString();
}

/**
 * Send a business email now, unless we're inside the 9pm–8am ET quiet window,
 * in which case queue it for the next 8:00 AM ET via the QueuedApplicationEmail entity.
 */
export async function sendBusinessEmailOrQueue(base44, { to, subject, htmlContent }) {
  if (isEtQuietHours()) {
    const scheduledFor = nextEt8amIso();
    await base44.asServiceRole.entities.QueuedApplicationEmail.create({
      recipient_email: to,
      subject,
      html_content: htmlContent,
      scheduled_for: scheduledFor,
      status: "pending",
      attempts: 0,
    });
    return { queued: true, scheduled_for: scheduledFor };
  }
  await sendBrevoEmail({ to, subject, htmlContent });
  return { queued: false, sentImmediately: true };
}