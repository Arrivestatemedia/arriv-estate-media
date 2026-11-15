/**
 * Presentation-only role titles (server mirror of src/lib/roleTitles.js).
 *
 *   Internal role                     Internal title     Customer-facing title
 *   growth_advisor (SalesTeamMember)  Media Partner      Media Partner
 *   media_partner (legacy contractor key) Media Specialist Media Specialist
 *
 * Used only to word automated customer messages. Never used for permissions,
 * ownership, commissions or assignment decisions.
 */

export const AI_ROLE_TERMINOLOGY = `Media Partner, sales rep, sales representative and Growth Advisor all mean the SALES role: prospecting, customer relationships, bookings and sales commissions. Media Specialist means a PHOTOGRAPHY, VIDEO or PRODUCTION contractor, never a sales representative. Use these titles consistently in summaries, responses and generated follow-up tasks. Do not infer an assignment or a person's role without evidence. Legacy stored identifiers are not spoken role labels.`;

export const INTERNAL_ROLES = {
  GROWTH_ADVISOR: 'growth_advisor',
  MEDIA_PARTNER: 'media_partner',
};

export const INTERNAL_TITLES: Record<string, string> = {
  [INTERNAL_ROLES.GROWTH_ADVISOR]: 'Media Partner',
  [INTERNAL_ROLES.MEDIA_PARTNER]: 'Media Specialist',
};

export const CUSTOMER_TITLES: Record<string, string> = {
  [INTERNAL_ROLES.GROWTH_ADVISOR]: 'Media Partner',
  [INTERNAL_ROLES.MEDIA_PARTNER]: 'Media Specialist',
};

const ALIASES: Record<string, string> = {
  growth_advisor: INTERNAL_ROLES.GROWTH_ADVISOR,
  sales: INTERNAL_ROLES.GROWTH_ADVISOR,
  sales_rep: INTERNAL_ROLES.GROWTH_ADVISOR,
  sales_member: INTERNAL_ROLES.GROWTH_ADVISOR,
  sales_representative: INTERNAL_ROLES.GROWTH_ADVISOR,
  media_partner: INTERNAL_ROLES.MEDIA_PARTNER,
  contractor: INTERNAL_ROLES.MEDIA_PARTNER,
  media_specialist: INTERNAL_ROLES.MEDIA_PARTNER,
};

export function normalizeRole(role: string): string {
  return ALIASES[String(role || '').toLowerCase()] || '';
}

export function customerTitleForRole(role: string): string {
  return CUSTOMER_TITLES[normalizeRole(role)] || '';
}

export function internalTitleForRole(role: string): string {
  return INTERNAL_TITLES[normalizeRole(role)] || '';
}

export function titlesForRole(role: string) {
  const key = normalizeRole(role);
  if (!key) return { internal: '', customer: '' };
  return { internal: INTERNAL_TITLES[key], customer: CUSTOMER_TITLES[key] };
}