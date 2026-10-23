// careersReturn.js
// Carries an applicant's way back to their private Careers Profile from the
// public job pages.
//
// The profile link itself grants access to the applicant's profile, so it is
// never placed in the job page's address. The profile page keeps the link on the
// applicant's own device under a random id, and only that id travels with the
// job link. The job page shows "Back to My Careers Profile" on the device the
// link was opened from, and shows nothing at all anywhere else — so a job page
// address shared onward never exposes an applicant's profile.

const STORAGE_PREFIX = "arriv_careers_return_";

/** Query parameter a public job page reads to find the visitor's stored profile. */
export const CAREERS_RETURN_PARAM = "careers_profile";

function newId() {
  try {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  } catch (err) {
    // Fall through to the time-based id below.
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Remembers the profile link for this visit and returns the id that carries it. */
export function createCareersReturnId(token) {
  if (!token) return "";
  const id = newId();
  try {
    window.localStorage.setItem(STORAGE_PREFIX + id, token);
  } catch (err) {
    return "";
  }
  return id;
}

/** Adds the return id to a public job link, so that page can offer the way back. */
export function withCareersReturn(url, id) {
  if (!url || !id) return url;
  return `${url}${url.includes("?") ? "&" : "?"}${CAREERS_RETURN_PARAM}=${encodeURIComponent(id)}`;
}

/** The visitor's Careers Profile path for this visit, or "" when there is none. */
export function careersReturnHref(id) {
  if (!id) return "";
  try {
    const token = window.localStorage.getItem(STORAGE_PREFIX + id) || "";
    return token ? `/careers/continue/${encodeURIComponent(token)}` : "";
  } catch (err) {
    return "";
  }
}