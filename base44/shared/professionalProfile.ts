// Professional profiles: who may manage one, what may be published, and what may be shown.
//
// Two rules this module exists to enforce:
//   * nothing becomes public without BOTH the profile owner's explicit authorization and an
//     administrator's approval, and then only while the publication switch is on;
//   * a credential or brokerage affiliation that has not been verified is never presented as fact.

export const PROFILE_DISCLOSURES = [
  "Arriv Estate Media is a real estate media company. Arriv is not the listing brokerage, the seller's agent or your buyer's representative, and hosting this page does not make Arriv a party to any transaction.",
  "All housing is offered without regard to race, color, religion, sex, disability, familial status or national origin.",
  "Your inquiry is shared only with the professional you contacted, so they can respond to you about your request.",
];

export const PROFILE_AUTHORIZATION_TEXT =
  "I confirm I am authorized to publish this profile, that the information and credentials in it are accurate, " +
  "and that I will keep my service areas and affiliations current. I authorize Arriv Estate Media to display this " +
  "profile and its public property listings at a public web address until I unpublish it.";

export function normalizeSlug(input: any): string {
  return String(input || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function profileBasePath(profileType: string): string {
  return String(profileType) === "brokerage" ? "/brokerages" : "/agents";
}

export function profilePath(profile: any): string {
  const base = profileBasePath(profile?.profile_type);
  return profile?.slug ? `${base}/${profile.slug}` : base;
}

export function uniqueSuffix(existing: string[] = []): string {
  const taken = new Set((existing || []).map((s) => String(s || "")));
  for (let n = 2; n < 500; n += 1) {
    const candidate = String(n);
    if (!taken.has(candidate)) return candidate;
  }
  return String(Date.now());
}

export function profileDisplayName(profile: any): string {
  return String(profile?.display_name || "").trim();
}

// Nothing published unless every one of these is true.
export function publicationBlockers(
  profile: any,
  ctx: { switchOn: boolean; nowIso?: string; minBioChars?: number },
): string[] {
  const blockers: string[] = [];
  if (!profile) return ["Profile not found."];
  if (!profile.authorization_confirmed) blockers.push("The profile owner has not authorized publication.");
  if (!profile.admin_approved_at) blockers.push("An administrator has not approved this profile.");
  if (profile.publication_state === "ARCHIVED") blockers.push("An archived profile cannot be published.");
  if (!ctx.switchOn) blockers.push("Profile publication is switched off.");
  const minBio = ctx.minBioChars ?? 80;
  if (String(profile.bio || "").trim().length < minBio) blockers.push("The biography is too short to publish.");
  if (!String(profile.contact_email || "").includes("@")) blockers.push("A business contact email is required.");
  if (profile.profile_type === "agent" && !String(profile.brokerage_name || "").trim()) {
    blockers.push("A brokerage affiliation is required for an agent profile.");
  }
  if (profile.profile_type === "brokerage" && !String(profile.display_name || "").trim()) {
    blockers.push("A brokerage name is required.");
  }
  return blockers;
}

// What a public visitor may see. A draft, an unauthorized or an unapproved profile is invisible.
export function isPubliclyVisible(profile: any): boolean {
  return (
    !!profile &&
    profile.publication_state === "PUBLISHED" &&
    profile.authorization_confirmed === true &&
    !!profile.admin_approved_at &&
    profile.certification_mode !== true
  );
}

export function canIndex(profile: any): boolean {
  return isPubliclyVisible(profile) && String(profile.indexing || "noindex") === "index";
}

// --- permissions -----------------------------------------------------------------------------

function emailIn(value: any, emails: string[]): boolean {
  const list = (Array.isArray(value) ? value : []).map((e) => String(e || "").trim().toLowerCase());
  return list.some((e) => !!e && emails.includes(e));
}

export function isBrokerageManager(brokerage: any, actor: any): boolean {
  if (!brokerage || brokerage.profile_type !== "brokerage") return false;
  const email = String(actor?.email || "").trim().toLowerCase();
  if (!email) return false;
  if (String(brokerage.owner_email || "").toLowerCase() === email) return true;
  return emailIn(brokerage.team_emails, [email]);
}

export function canManageProfile(profile: any, actor: any): boolean {
  if (!profile) return false;
  if (actor?.isAdmin) return true;
  const email = String(actor?.email || "").trim().toLowerCase();
  if (!email) return false;
  if (String(profile.owner_email || "").toLowerCase() === email) return true;
  return emailIn(profile.team_emails, [email]);
}

// A brokerage may manage an agent profile only when that agent is actually on its roster, the
// affiliation was verified, and the brokerage itself is an active manager for the request.
export function canManageAgentAsBrokerage(agent: any, brokerage: any, actor: any): { allowed: boolean; reason: string } {
  if (!agent || !brokerage) return { allowed: false, reason: "Profile not found." };
  if (actor?.isAdmin) return { allowed: true, reason: "Administrator" };
  if (!isBrokerageManager(brokerage, actor)) {
    return { allowed: false, reason: "This account does not manage that brokerage." };
  }
  if (String(agent.brokerage_profile_id || "") !== String(brokerage.profile_id || "")) {
    return { allowed: false, reason: "That agent profile is not on your roster." };
  }
  if (agent.brokerage_affiliation_verified !== true) {
    return { allowed: false, reason: "The affiliation has not been verified by an administrator yet." };
  }
  return { allowed: true, reason: "Verified brokerage manager" };
}

// --- what may be displayed ---------------------------------------------------------------

export function credentialsForDisplay(profile: any): { license_number: string; license_state: string; verified: boolean } {
  const verified = profile?.license_verified === true;
  return {
    license_number: verified ? String(profile?.license_number || "") : "",
    license_state: verified ? String(profile?.license_state || "") : "",
    verified,
  };
}

export function affiliationForDisplay(profile: any): { name: string; verified: boolean; note: string } {
  const name = String(profile?.brokerage_name || "").trim();
  const verified = profile?.brokerage_affiliation_verified === true && !!name;
  return {
    name: verified ? name : "",
    verified,
    note: verified ? "" : "Brokerage affiliation is not verified. Arriv does not confirm or display unverified affiliations.",
  };
}

export function serviceAreasForDisplay(profile: any): string[] {
  return (Array.isArray(profile?.service_areas) ? profile.service_areas : [])
    .map((a) => String(a || "").trim())
    .filter(Boolean);
}

// The public projection: everything a visitor needs and nothing private. Owner and team addresses,
// verification evidence and internal review notes are deliberately absent.
export function publicProfileView(profile: any, extra: Record<string, any> = {}): any {
  if (!isPubliclyVisible(profile)) return null;
  const affiliation = affiliationForDisplay(profile);
  const credentials = credentialsForDisplay(profile);
  return {
    profile_type: profile.profile_type,
    profile_id: profile.profile_id,
    slug: profile.slug,
    path: profilePath(profile),
    display_name: profile.display_name,
    headline: profile.headline || "",
    bio: profile.bio || "",
    photo_url: profile.photo_url || "",
    logo_url: profile.logo_url || "",
    contact_email: profile.contact_email || "",
    contact_phone: profile.contact_phone || "",
    website_url: profile.website_url || "",
    city: profile.city || "",
    state: profile.state || "",
    service_areas: serviceAreasForDisplay(profile),
    brokerage_name: affiliation.name,
    brokerage_verified: affiliation.verified,
    license_number: credentials.license_number,
    license_state: credentials.license_state,
    plan_key: profile.plan_key || "",
    disclosures: PROFILE_DISCLOSURES,
    ...extra,
  };
}