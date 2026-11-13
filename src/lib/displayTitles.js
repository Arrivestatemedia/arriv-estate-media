/**
 * Frontend twin of base44/shared/roleTitles.ts.
 *
 * Internal role           Customer-facing title
 * growth_advisor (sales)  Media Partner
 * media_partner (crew)    Media Specialist
 *
 * Display only: never store these titles, never match on them, never change a
 * role id because of them. Internal records keep saying Media Partner.
 */

export const ROLE = {
  GROWTH_ADVISOR: "growth_advisor",
  MEDIA_PARTNER: "media_partner",
  CLIENT: "client",
  ADMIN: "admin",
};

export const CUSTOMER_FACING_TITLES = {
  growth_advisor: "Media Partner",
  media_partner: "Media Specialist",
  client: "Client",
  admin: "Arriv Team",
};

export const INTERNAL_ROLE_LABELS = {
  growth_advisor: "Growth Advisor (Client-facing: Media Partner)",
  media_partner: "Media Partner — Contractor (Client-facing: Media Specialist)",
  client: "Client",
  admin: "Administrator",
};

export function internalRoleForActor(actor) {
  const userType = String(actor?.user_type || actor?.userType || "").toLowerCase();
  if (["sales", "growth_advisor", "sales_growth_advisor"].includes(userType)) return ROLE.GROWTH_ADVISOR;
  if (["media_partner", "media_specialist", "contractor"].includes(userType)) return ROLE.MEDIA_PARTNER;
  if (userType === "client") return ROLE.CLIENT;
  if (actor?.role === "admin") return ROLE.ADMIN;
  return ROLE.CLIENT;
}

export function customerFacingTitle(role) {
  return CUSTOMER_FACING_TITLES[role] || CUSTOMER_FACING_TITLES.client;
}

export function internalRoleLabel(role) {
  return INTERNAL_ROLE_LABELS[role] || INTERNAL_ROLE_LABELS.client;
}