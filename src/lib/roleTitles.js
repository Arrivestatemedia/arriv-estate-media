/**
 * Presentation-only role titles.
 *
 * Internal roles and their identifiers never change. Only the words shown on
 * screen change, depending on who is reading:
 *
 *   Internal role                     Internal title     Customer-facing title
 *   growth_advisor (SalesTeamMember)  Growth Advisor     Media Partner
 *   media_partner (contractor)        Media Partner      Media Specialist
 *
 * Permissions, commissions, assignments and business logic must always read the
 * internal role identifier, never one of these titles.
 */

export const INTERNAL_ROLES = {
  GROWTH_ADVISOR: 'growth_advisor',
  MEDIA_PARTNER: 'media_partner',
};

export const INTERNAL_TITLES = {
  [INTERNAL_ROLES.GROWTH_ADVISOR]: 'Growth Advisor',
  [INTERNAL_ROLES.MEDIA_PARTNER]: 'Media Partner',
};

export const CUSTOMER_TITLES = {
  [INTERNAL_ROLES.GROWTH_ADVISOR]: 'Media Partner',
  [INTERNAL_ROLES.MEDIA_PARTNER]: 'Media Specialist',
};

/** Existing identifiers that all mean the same internal role. */
const ALIASES = {
  growth_advisor: INTERNAL_ROLES.GROWTH_ADVISOR,
  sales: INTERNAL_ROLES.GROWTH_ADVISOR,
  sales_rep: INTERNAL_ROLES.GROWTH_ADVISOR,
  sales_member: INTERNAL_ROLES.GROWTH_ADVISOR,
  sales_representative: INTERNAL_ROLES.GROWTH_ADVISOR,
  media_partner: INTERNAL_ROLES.MEDIA_PARTNER,
  contractor: INTERNAL_ROLES.MEDIA_PARTNER,
  media_specialist: INTERNAL_ROLES.MEDIA_PARTNER,
};

export function normalizeRole(role) {
  return ALIASES[String(role || '').toLowerCase()] || '';
}

/** The title a customer should see for this role. Internal names fall through unchanged. */
export function customerTitleForRole(role) {
  return CUSTOMER_TITLES[normalizeRole(role)] || '';
}

/** The title employees and administrators should see for this role. */
export function internalTitleForRole(role) {
  return INTERNAL_TITLES[normalizeRole(role)] || '';
}

/** Both titles, for administrative screens where showing each one helps. */
export function titlesForRole(role) {
  const key = normalizeRole(role);
  if (!key) return { internal: '', customer: '' };
  return { internal: INTERNAL_TITLES[key], customer: CUSTOMER_TITLES[key] };
}