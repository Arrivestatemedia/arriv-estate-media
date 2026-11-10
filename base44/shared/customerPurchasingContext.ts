// ============================================================================
// CUSTOMER PURCHASING CONTEXT
//
// Answers one question, for a VERIFIED customer account:
//   "Is this order for me personally, or for an organization I am authorized to
//    order for?"
//
// It is deliberately additive. It does NOT create accounts, wallets, contracts,
// credits or invoices, and it never moves money between pools:
//   - personal value stays in PrepaidWallet / CreditLot (FIFO, expiry untouched)
//   - company value stays in B2BMediaCreditPeriod / B2BReservedCapacityPeriod
//     (owned by the organization + governing contract, never by a person)
//
// The two pools are never interchangeable. This module only proves WHICH pool
// the customer explicitly chose, and that the choice is authorized.
// ============================================================================

import { resolveB2BEntitlement } from './b2bEntitlementEngine.ts';

export type PurchasingContext =
  | { type: 'personal' }
  | { type: 'organization'; organization_id: string };

function norm(email: any): string {
  return String(email || '').trim().toLowerCase();
}

/**
 * Every membership row for a verified email.
 * Members may have been stored with mixed case, so an exact filter miss falls
 * back to a case-insensitive comparison.
 */
export async function listMemberships(client: any, email: string) {
  const target = norm(email);
  if (!target) return [];

  let rows = await client.entities.B2BOrganizationMember.filter({ user_email: target });
  if (!rows || rows.length === 0) {
    const all = await client.entities.B2BOrganizationMember.filter({}, undefined, 500);
    rows = (all || []).filter((m: any) => norm(m.user_email) === target);
  }
  return rows || [];
}

/**
 * Attach a membership row to the verified account that owns it.
 *
 * An invitation creates an 'invited' row. The first time that verified person
 * signs in, the row is activated against their EXISTING account — no second
 * login, no duplicate customer record.
 */
export async function linkVerifiedMembership(client: any, member: any, account: any) {
  if (!member || !account?.id) return member;
  const email = norm(account.email);
  if (!email || norm(member.user_email) !== email) return member;

  const patch: any = {
    customer_account_id: account.id,
    linked_at: new Date().toISOString(),
  };
  if (member.status === 'invited') {
    patch.status = 'active';
    patch.activated_at = new Date().toISOString();
  }

  const updated = await client.entities.B2BOrganizationMember.update(member.id, patch);
  return updated || { ...member, ...patch };
}

export async function ensureVerifiedMemberships(client: any, account: any) {
  const rows = await listMemberships(client, account?.email);
  const out: any[] = [];
  for (const m of rows) out.push(await linkVerifiedMembership(client, m, account));
  return out;
}

/** Human-readable view of the company pool the organization actually holds. */
export function describeCredits(entitlement: any) {
  if (entitlement?.funding_mode === 'media_credit' && entitlement?.credits) {
    return {
      source: 'b2b_media_credit',
      label: 'Company media credits',
      unit_label: 'credits',
      available: entitlement.credits.credits_available ?? 0,
      available_units: entitlement.credits.credits_available_units || 0,
      reserved: entitlement.credits.credits_reserved ?? 0,
      consumed: entitlement.credits.credits_consumed ?? 0,
      allocated: entitlement.credits.credits_allocated ?? 0,
      period_end: entitlement.period_end || null,
    };
  }
  if (entitlement?.funding_mode === 'reserved_capacity' && entitlement?.capacity) {
    return {
      source: 'b2b_reserved_capacity',
      label: 'Contracted shoots',
      unit_label: 'shoots',
      available: entitlement.capacity.shoots_available ?? 0,
      reserved: entitlement.capacity.shoots_reserved ?? 0,
      consumed: entitlement.capacity.shoots_consumed ?? 0,
      allocated: entitlement.capacity.shoots_allocated ?? 0,
      period_end: entitlement.period_end || null,
      production_standard: entitlement.capacity.production_standard || '',
    };
  }
  return {
    source: 'b2b_contract',
    label: 'Company contract',
    unit_label: '',
    available: null,
    reserved: null,
    consumed: null,
    allocated: null,
    period_end: entitlement?.period_end || null,
  };
}

/**
 * Evaluate one organization context for one verified person.
 * Fail-closed: anything unexpected means "order personally instead".
 */
export async function evaluateOrganizationContext(
  client: any,
  params: { email: string; organization_id: string }
) {
  const email = norm(params.email);
  const memberships = await listMemberships(client, email);
  const member = memberships.find((m: any) => m.organization_id === params.organization_id);

  const base: any = {
    type: 'organization',
    organization_id: params.organization_id,
    ordering_person_email: email,
  };

  if (!member) {
    return {
      ...base,
      authorized: false,
      can_order: false,
      code: 'NOT_A_MEMBER',
      reason: 'You are not a member of this organization.',
    };
  }

  if (member.status !== 'active') {
    return {
      ...base,
      authorized: false,
      can_order: false,
      code: 'MEMBERSHIP_INACTIVE',
      member_id: member.id,
      reason:
        'Your access to this organization has ended. Order personally, or ask an organization administrator to restore your access.',
    };
  }

  let org: any = null;
  try {
    org = await client.entities.B2BOrganization.get(member.organization_id);
  } catch {
    org = null;
  }
  if (!org) {
    return {
      ...base,
      authorized: false,
      can_order: false,
      code: 'ORGANIZATION_NOT_FOUND',
      member_id: member.id,
      reason: 'This organization could not be loaded.',
    };
  }

  const entitlement = await resolveB2BEntitlement(client, {
    email,
    organization_id: org.id,
  });

  const credits = describeCredits(entitlement);

  const summary: any = {
    ...base,
    authorized: true,
    member_id: member.id,
    member_role: member.role,
    is_admin: member.role === 'admin',
    seat_type: member.seat_type || '',
    organization_id_record: org.id,
    organization_name: org.display_name || org.legal_name,
    contract_id: entitlement?.contract_id || null,
    contract_type: entitlement?.contract_type || null,
    contract_status: entitlement?.contract_status || null,
    contract_version_id: entitlement?.contract_version_id || null,
    funding_mode: entitlement?.funding_mode || null,
    period_id: entitlement?.period_id || null,
    period_end: entitlement?.period_end || null,
    credits,
    credit_source: credits.source,
    account_hold: !!entitlement?.account_hold,
  };

  if (entitlement?.commercial_domain !== 'B2B' || !entitlement?.contract_id) {
    return {
      ...summary,
      can_order: false,
      code: 'NO_ACTIVE_CONTRACT',
      reason:
        'This organization has no active billing agreement yet. Order personally, or contact your Arriv representative.',
    };
  }

  if (entitlement.account_hold) {
    return {
      ...summary,
      can_order: false,
      code: 'ACCOUNT_ON_HOLD',
      reason: entitlement.hold_reason || 'This organization is on hold for billing reasons.',
    };
  }

  if (!entitlement.can_book) {
    return {
      ...summary,
      can_order: false,
      code: 'CONTRACT_NOT_ACTIVE',
      reason:
        entitlement.reason_if_cannot_book ||
        'This organization cannot place new orders right now.',
    };
  }

  return { ...summary, can_order: true };
}

/**
 * Everything the portal needs to render the "Ordering as" selector.
 * Activates any invitation that matches this verified account on the way.
 */
export async function listPurchasingContexts(client: any, account: any) {
  const memberships = await ensureVerifiedMemberships(client, account);

  const organizations: any[] = [];
  const seen = new Set<string>();
  for (const m of memberships) {
    if (!m?.organization_id || seen.has(m.organization_id)) continue;
    seen.add(m.organization_id);
    organizations.push(
      await evaluateOrganizationContext(client, {
        email: account?.email,
        organization_id: m.organization_id,
      })
    );
  }

  const usable = organizations.filter((o) => o.authorized && o.can_order);

  return {
    ordering_person_email: norm(account?.email),
    personal: {
      type: 'personal',
      authorized: true,
      can_order: true,
      code: null,
      reason: null,
      credit_source: 'personal',
      credit_label: 'Your own account',
      organization_name: null,
    },
    organizations,
    has_usable_organization: usable.length > 0,
    default_context:
      usable.length === 1
        ? { type: 'organization', organization_id: usable[0].organization_id }
        : { type: 'personal' },
  };
}

/**
 * Guard used by order paths. Returns a result the caller turns into a 4xx;
 * it never silently falls back to another account.
 */
export async function authorizeOrderContext(
  client: any,
  params: { account: any; organization_id?: string }
) {
  if (!params.organization_id) {
    return {
      type: 'personal',
      authorized: true,
      can_order: true,
      ordering_person_email: norm(params.account?.email),
      credit_source: 'personal',
    } as any;
  }
  return await evaluateOrganizationContext(client, {
    email: params.account?.email,
    organization_id: params.organization_id,
  });
}