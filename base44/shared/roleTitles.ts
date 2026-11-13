/**
 * The single mapping between an INTERNAL operational role and the title a
 * CUSTOMER sees. Nothing here changes an id, permission, payment or workflow:
 * it only decides which words are shown where.
 *
 *  Internal role            Customer-facing title
 *  growth_advisor (sales)   Media Partner
 *  media_partner (crew)     Media Specialist
 *
 * Internally the crew stay "Media Partner" (that is their existing role and
 * the label used across contractor agreements, payouts and dashboards), which
 * is exactly why customer copy must never use that word for them.
 */

export type InternalRole = 'growth_advisor' | 'media_partner' | 'client' | 'admin';

export const ROLE = {
  GROWTH_ADVISOR: 'growth_advisor',
  MEDIA_PARTNER: 'media_partner',
  CLIENT: 'client',
  ADMIN: 'admin',
} as const;

/** How each internal role is named to a customer. */
export const CUSTOMER_FACING_TITLES: Record<InternalRole, string> = {
  growth_advisor: 'Media Partner',
  media_partner: 'Media Specialist',
  client: 'Client',
  admin: 'Arriv Team',
};

/** Unambiguous internal label, for admin screens where both roles appear. */
export const INTERNAL_ROLE_LABELS: Record<InternalRole, string> = {
  growth_advisor: 'Growth Advisor (Client-facing: Media Partner)',
  media_partner: 'Media Partner — Contractor (Client-facing: Media Specialist)',
  client: 'Client',
  admin: 'Administrator',
};

/**
 * Resolve the internal role of an actor from its existing identifiers only.
 * `user_type` is the field the app already stores; 'sales' is a Growth Advisor.
 */
export function internalRoleForActor(actor: any): InternalRole {
  const userType = String(actor?.user_type || actor?.userType || '').toLowerCase();
  if (userType === 'sales' || userType === 'growth_advisor' || userType === 'sales_growth_advisor') return ROLE.GROWTH_ADVISOR;
  if (userType === 'media_partner' || userType === 'media_specialist' || userType === 'contractor') return ROLE.MEDIA_PARTNER;
  if (userType === 'client') return ROLE.CLIENT;
  if (actor?.role === 'admin') return ROLE.ADMIN;
  return ROLE.CLIENT;
}

export function customerFacingTitle(role: InternalRole | string): string {
  return CUSTOMER_FACING_TITLES[role as InternalRole] || CUSTOMER_FACING_TITLES.client;
}

export function internalRoleLabel(role: InternalRole | string): string {
  return INTERNAL_ROLE_LABELS[role as InternalRole] || INTERNAL_ROLE_LABELS.client;
}

/* ── Inbound calling ───────────────────────────────────────────────────── */

/** The client greeting. "Media Partner" here always means the Growth Advisor. */
export const IVR_CLIENT_GREETING =
  'Thank you for calling Arrive Estate Media. To speak with your Media Partner, press 1.';

/**
 * Where a client pressing 1 is connected: the designated Growth Advisor /
 * client-relations line. Configured in Admin → Phone Numbers; falls back to the
 * administrator line so the call is never sent to a contractor Media Partner.
 */
export const ADVISOR_LINE_SETTING_KEY = 'ivr_growth_advisor_target';

export async function resolveMediaPartnerLine(base44: any): Promise<string> {
  const clean = (value: string) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
  };

  try {
    const settings = await base44.asServiceRole.entities.AppSetting.filter({ key: ADVISOR_LINE_SETTING_KEY });
    const configured = clean(settings?.[0]?.value || '');
    if (configured) return configured;
  } catch (e) {
    console.error('Failed to read Media Partner line setting:', (e as Error).message);
  }

  return clean(Deno.env.get('ADMIN_PHONE') || Deno.env.get('OWNER_PHONE_NUMBER') || '');
}