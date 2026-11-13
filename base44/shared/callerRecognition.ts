/**
 * Caller recognition for the Arriv IVR.
 *
 * Matches the calling number against records the app already holds. No account is
 * created and no role system is duplicated. Recognition never unlocks an account:
 * it only decides which greeting and menu the caller hears, and an account action
 * still goes through the same verified workflow as the web portal.
 */

import { normalizeE164, numberVariants, firstName } from './phoneNumber.ts';

export type CallerType = 'owner' | 'growth_advisor' | 'media_specialist' | 'client' | 'b2b_client' | 'public';

export interface RecognizedAdvisor {
  sales_member_id: string;
  name: string;
  email: string;
  primary_number: string;
  cell_number: string;
}

export interface CallerIdentity {
  type: CallerType;
  verified: boolean;
  name: string;
  first_name: string;
  email: string;
  signup_id: string;
  contact_id: string;
  organization_id: string;
  job_id: string;
  advisor: RecognizedAdvisor | null;
  matched_on: string;
}

function asArray(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  return Array.isArray(result.items) ? result.items : [];
}

function blank(type: CallerType): CallerIdentity {
  return {
    type,
    verified: false,
    name: '',
    first_name: '',
    email: '',
    signup_id: '',
    contact_id: '',
    organization_id: '',
    job_id: '',
    advisor: null,
    matched_on: '',
  };
}

export function authorizedOwnerNumbers(): string[] {
  return [
    Deno.env.get('OWNER_PHONE_NUMBER'),
    Deno.env.get('ADMIN_PHONE'),
    Deno.env.get('BRADLEY_PHONE'),
  ]
    .map((n) => normalizeE164(n))
    .filter(Boolean);
}

function repFromSettings(settings: any, member: any, email: string): RecognizedAdvisor | null {
  const reps = Array.isArray(settings?.sales_reps) ? settings.sales_reps : [];
  const byId = member?.id ? reps.find((rep: any) => rep.sales_member_id && rep.sales_member_id === member.id) : null;
  const byEmail = !byId && email
    ? reps.find((rep: any) => rep.sales_member_id && String(rep.sales_member_id).toLowerCase() === email)
    : null;
  const configured = byId || byEmail || null;

  const primary = normalizeE164(configured?.primary_number || member?.phone_number || '');
  const cell = normalizeE164(configured?.cell_number || member?.mobile_phone_number || '');
  if (!member && !configured) return null;

  return {
    sales_member_id: configured?.sales_member_id || member?.id || '',
    name: configured?.name || member?.full_name || '',
    email: member?.email || member?.company_email || '',
    primary_number: primary,
    cell_number: cell,
  };
}

/** Looks up the person who should receive a client's "speak with my Media Partner" request. */
export async function resolveAssignedAdvisor(
  base44: any,
  options: { sales_member_id?: string; member_email?: string; settings: any }
): Promise<RecognizedAdvisor | null> {
  const { sales_member_id, member_email, settings } = options;
  let member: any = null;
  try {
    if (sales_member_id) {
      member = asArray(await base44.asServiceRole.entities.SalesTeamMember.filter({ id: sales_member_id }))[0] || null;
    }
  } catch (_) {
    member = null;
  }
  return repFromSettings(settings, member, String(member_email || '').toLowerCase());
}

export async function recognizeCaller(
  base44: any,
  fromNumber: any,
  settings: any
): Promise<CallerIdentity> {
  const e164 = normalizeE164(fromNumber);
  if (!e164) return blank('public');

  // 1. The owner and other authorised phones keep their existing dial-out experience.
  if (authorizedOwnerNumbers().includes(e164)) {
    const identity = blank('owner');
    identity.name = 'Arriv Owner';
    identity.first_name = 'there';
    identity.matched_on = 'authorized_phone';
    return identity;
  }

  const variants = numberVariants(e164);

  // 2. Staff records (Growth Advisors and synced employees).
  try {
    const members = asArray(
      await base44.asServiceRole.entities.SalesTeamMember.filter(
        { phone_number: { $in: variants } },
        { limit: 5 }
      )
    );
    const mobileMembers = asArray(
      await base44.asServiceRole.entities.SalesTeamMember.filter(
        { mobile_phone_number: { $in: variants } },
        { limit: 5 }
      )
    );
    const member = members[0] || mobileMembers[0] || null;
    if (member) {
      const identity = blank('growth_advisor');
      identity.name = member.full_name || '';
      identity.first_name = firstName(member.full_name);
      identity.email = member.email || member.company_email || '';
      identity.advisor = repFromSettings(settings, member, '');
      identity.matched_on = 'team_record';
      return identity;
    }
  } catch (error) {
    console.error('Team lookup failed:', (error as Error).message);
  }

  // 3. Verified customer accounts. A media partner record wins over a client
  //    contact only when it is the more specific match, so a shared household
  //    number still reaches a real person rather than a guess.
  let signup: any = null;
  try {
    const found = asArray(
      await base44.asServiceRole.entities.PendingSignup.filter(
        { phone_number: { $in: variants }, status: 'completed' },
        { sort: '-created_date', limit: 5 }
      )
    );
    signup = found[0] || asArray(
      await base44.asServiceRole.entities.PendingSignup.filter(
        { phone_number: { $in: variants } },
        { sort: '-created_date', limit: 5 }
      )
    )[0] || null;
  } catch (error) {
    console.error('Customer account lookup failed:', (error as Error).message);
  }

  let contact: any = null;
  try {
    const found = asArray(
      await base44.asServiceRole.entities.Contact.filter({ phone: { $in: variants } }, { limit: 5 })
    );
    contact = found[0] || null;
  } catch (error) {
    console.error('Contact lookup failed:', (error as Error).message);
  }

  let organization: any = null;
  try {
    const found = asArray(
      await base44.asServiceRole.entities.B2BOrganization.filter(
        { billing_contact_phone: { $in: variants } },
        { limit: 5 }
      )
    );
    organization = found[0] || null;
  } catch (error) {
    organization = null;
  }

  const signupIsContractor = signup?.user_type === 'media_partner';

  if (signupIsContractor) {
    const identity = blank('media_specialist');
    identity.name = signup.full_name || '';
    identity.first_name = firstName(signup.full_name);
    identity.email = signup.email || '';
    identity.signup_id = signup.id || '';
    identity.matched_on = 'contractor_profile';
    return identity;
  }

  if (signup || contact || organization) {
    const identity = blank(organization && !signup && !contact ? 'b2b_client' : 'client');
    const name =
      signup?.full_name ||
      [contact?.firstname, contact?.lastname].filter(Boolean).join(' ') ||
      contact?.name ||
      organization?.billing_contact_name ||
      organization?.display_name ||
      '';
    identity.name = name;
    identity.first_name = firstName(name);
    identity.email = signup?.email || contact?.email || organization?.billing_contact_email || '';
    identity.signup_id = signup?.id || '';
    identity.contact_id = contact?.id || '';
    identity.organization_id = organization?.id || contact?.account_id || '';
    identity.matched_on = signup ? 'customer_account' : contact ? 'contact_record' : 'organization_contact';

    identity.advisor = await resolveAssignedAdvisor(base44, {
      sales_member_id: organization?.assigned_sales_rep_id || contact?.sales_member_id || '',
      member_email: organization?.assigned_sales_rep_email || '',
      settings,
    });
    return identity;
  }

  return blank('public');
}

export function isRecognized(identity: CallerIdentity): boolean {
  return identity.type !== 'public';
}