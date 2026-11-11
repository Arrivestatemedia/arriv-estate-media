/**
 * Where a Preferred member was in the middle of working.
 *
 * A panel open in the workspace is unfinished work: the booking they were filling, the
 * property page they were building. It is remembered per member so a refresh, a sign-out
 * or a return the next morning brings them straight back to it — and only then does the
 * concierge greet them with a welcome back.
 */

const SHELL_PATH = "/PreferredWorkspace";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

const TASK_LABELS = {
  booking: "your booking",
  galleries: "your gallery",
  jobGallery: "your gallery",
  properties: "your property pages",
  marketing: "your property page",
  analytics: "your analytics",
  billing: "your invoices",
  membership: "your membership",
  company: "your company account",
  account: "your account settings",
  dashboard: "your dashboard",
};

export const RESUME_SHELL = SHELL_PATH;

/** "your booking" — how the concierge refers to the work she kept open. */
export function resumeLabel(surface) {
  return TASK_LABELS[surface] || "where you left off";
}

function storageKey(owner) {
  return `arriv_preferred_resume:${String(owner || "").trim().toLowerCase()}`;
}

export function saveResume(owner, record) {
  if (!owner || !record?.surface) return;
  try {
    window.localStorage.setItem(storageKey(owner), JSON.stringify({ ...record, at: Date.now() }));
  } catch {
    /* storage unavailable — the member simply starts fresh next time */
  }
}

export function readResume(owner) {
  if (!owner) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(owner));
    if (!raw) return null;
    const record = JSON.parse(raw);
    if (!record?.surface) return null;
    if (Date.now() - Number(record.at || 0) > MAX_AGE_MS) {
      window.localStorage.removeItem(storageKey(owner));
      return null;
    }
    return record;
  } catch {
    return null;
  }
}

export function clearResume(owner) {
  if (!owner) return;
  try {
    window.localStorage.removeItem(storageKey(owner));
  } catch {
    /* nothing to clear */
  }
}