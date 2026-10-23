// careersProfileLink.ts
// Personalized Careers Profile links for applicants imported from Indeed.
//
// A link is a single opaque token that belongs to exactly one JobApplication
// record. The token carries no applicant information and no record id, so the
// URL never reveals an internal id or personal detail. Every read and write
// through a link is validated server-side against the record the token belongs
// to. Regenerating a token replaces it, which invalidates the previous link.

const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 30;

export const CAREERS_PROFILE_PATH = "/careers/continue";

/** A cryptographically secure, unguessable token (256 bits, URL-safe). */
export function generateCareersToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function tokenExpiryFrom(now: Date = new Date(), days: number = DEFAULT_TTL_DAYS): string {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * The public origin applicant links are served on, resolved here on the server
 * and never taken from the request. Inside the builder the page is served from a
 * preview host (preview--…base44.app), and a link carrying that host would stop
 * working the moment it left the editor and would show a Base44 address. A
 * configured public origin is used when one is set; a Base44 address never is.
 */
const DEFAULT_PUBLIC_ORIGIN = "https://app.arrivestatemedia.com";
const PLATFORM_HOST = /(^|\.)base44\.(app|com)$/i;

export function publicCareersOrigin(): string {
  const configured = (Deno.env.get("PUBLIC_CAREERS_ORIGIN") || Deno.env.get("PUBLIC_APP_URL") || "").trim();
  if (!configured) return DEFAULT_PUBLIC_ORIGIN;
  try {
    if (PLATFORM_HOST.test(new URL(configured).hostname)) return DEFAULT_PUBLIC_ORIGIN;
  } catch {
    return DEFAULT_PUBLIC_ORIGIN;
  }
  return configured.replace(/\/+$/, "");
}

/** Builds the applicant-facing link on the app's own domain. */
export function careersProfileUrl(token: string): string {
  return `${publicCareersOrigin()}${CAREERS_PROFILE_PATH}/${token}`;
}

export type LinkState = "none" | "active" | "expired" | "revoked";

/** The state of an applicant's link, evaluated from the record alone. */
export function linkStateFor(record: any): LinkState {
  if (!record?.careers_profile_token) return "none";
  if (record.careers_profile_link_revoked_at) return "revoked";
  const expires = record.careers_profile_token_expires_at;
  if (expires && new Date(expires).getTime() < Date.now()) return "expired";
  return "active";
}

/**
 * Loads the applicant record a token belongs to. Returns null when the token
 * does not resolve — an unknown token is never distinguishable from a removed one.
 */
export async function loadApplicantByToken(base44: any, token: string): Promise<any | null> {
  const clean = (token || "").trim();
  if (!clean || clean.length < 32) return null;
  const rows = await base44.asServiceRole.entities.JobApplication.filter({
    careers_profile_token: clean,
  });
  const list = rows?.data ?? rows ?? [];
  return Array.isArray(list) && list.length ? list[0] : null;
}

/** The ready-to-send Indeed message. Never sent by the app — copied by the admin. */
export function indeedInvitationMessage({ firstName, link }: { firstName: string; link: string }): string {
  return [
    `Hi ${firstName}!`,
    ``,
    `Thank you for applying for the Founding Sales Growth Advisor position with Arriv Estate Media!`,
    ``,
    `We're excited to connect with candidates interested in joining our founding sales team, with a four-day workweek, uncapped commissions, and recurring earning opportunities.`,
    ``,
    `To continue your application and be considered for an interview, please complete your quick 3-minute Careers Profile below:`,
    ``,
    link,
    ``,
    `We look forward to learning more about you!`,
    ``,
    `Arriv Recruiting Team`,
  ].join("\n");
}

/** Field-level state used to show which required details are still missing. */
export function missingProfileFields(record: any): string[] {
  const missing: string[] = [];
  if (!record?.full_name) missing.push("Full name");
  if (!record?.email) missing.push("Email address");
  if (!record?.phone) missing.push("Phone number");
  if (!record?.address) missing.push("Residential address");
  if (!record?.dob) missing.push("Date of birth");
  return missing;
}