// ============================================================================
// B2B ENTITLEMENT ENGINE
//
// The authoritative system for:
//   - resolving B2B entitlement (identity → org → contract → period)
//   - monthly credit/capacity allocation
//   - reservation (AVAILABLE → RESERVED → CONSUMED)
//   - consumption, release, reversal, expiration
//   - administrative adjustment
//   - concurrency protection (atomic conditional updates)
//   - idempotency (idempotency_key deduplication)
//   - contract-version economic locking
//   - split-tender (credit shortfall → cash obligation)
//   - overage records
//   - capacity review (3 consecutive overage periods)
//   - balance invariant verification
//
// All credit values use integer units (1 credit = 100 units).
// Ledger events are NEVER deleted — corrections are compensating entries.
// Retail pricing, commissions, and Media Specialist compensation are NEVER touched.
// ============================================================================

import { creditsToUnits, unitsToCredits, CREDIT_SCALE } from './b2bCreditUnits.ts';
import { determineB2BTier, isB2BCustomTier, isB2BLargeTier, B2BTier } from './b2bSqftResolver.ts';
import {
  buildLockedConfigSnapshots, getLockedConfigSnapshots,
  getPlanMonthlyCredits, getFundingMode, LockedConfigSnapshots,
} from './b2bContractVersionLock.ts';
import { resolveCreditCost, calculateB2BLargePropertySurcharge, AddOnInput } from './b2bCreditCostResolver.ts';
import { resolveB2BGoverningContract, isOrganizationOnHold, canConsumeWithContractStatus } from './b2bGoverningContract.ts';
import { getActivePricingConfig } from './mediaConfigLoader.ts';

// --- Contract state validation (§3) ---

export const CONTRACT_STATES = {
  DRAFT: 'draft',
  PENDING_SIGNATURE: 'awaiting_signature',
  SIGNED: 'signed',
  IMPLEMENTATION: 'implementing',
  ACTIVE: 'active',
  LIVE: 'live',
  PAST_DUE: 'past_due',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
} as const;

const CONSUMPTION_ALLOWED_STATES = ['active', 'live', 'implementing'];

function canConsume(contractStatus: string): boolean {
  return CONSUMPTION_ALLOWED_STATES.includes(contractStatus);
}

// --- Idempotency helper ---

async function checkIdempotency(client: any, entityName: string, idempotencyKey: string) {
  if (!idempotencyKey) return null;
  const existing = await client.entities[entityName].filter({ idempotency_key: idempotencyKey });
  return existing && existing.length > 0 ? existing[0] : null;
}

// --- Audit log helper ---

async function createAuditLog(client: any, params: {
  actor: string; action: string; entity_type: string; entity_id: string;
  reason?: string; before_snapshot?: string; after_snapshot?: string;
}) {
  await client.entities.B2BAuditLog.create({
    actor: params.actor,
    actor_type: 'admin',
    action: params.action,
    reason: params.reason || '',
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    before_snapshot: params.before_snapshot,
    after_snapshot: params.after_snapshot,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// 1. ENTITLEMENT RESOLUTION (§2, Addendum §12)
// ============================================================================

export async function resolveB2BEntitlement(client: any, params: {
  user_id?: string; email?: string; organization_member_id?: string; organization_id?: string;
}) {
  const { user_id, email, organization_member_id, organization_id } = params;

  // 1. Find B2BOrganizationMember
  let member: any = null;
  if (organization_member_id) {
    try { member = await client.entities.B2BOrganizationMember.get(organization_member_id); } catch {}
  }
  if (!member && email) {
    const members = await client.entities.B2BOrganizationMember.filter({ user_email: email, status: 'active' });
    member = members[0];
  }
  if (!member && user_id) {
    const members = await client.entities.B2BOrganizationMember.filter({ user_id, status: 'active' });
    member = members[0];
  }

  if (!member) return { commercial_domain: 'RETAIL', can_book: true, reason_if_cannot_book: null };

  // 2. Find B2BOrganization
  let org: any = null;
  try { org = await client.entities.B2BOrganization.get(member.organization_id); } catch {}
  if (!org) return { commercial_domain: 'RETAIL', can_book: true, reason_if_cannot_book: null };

  // 3. Resolve governing contract (deterministic, fail-closed on ambiguity)
  const governingResult = await resolveB2BGoverningContract(client, org.id);

  if (!governingResult.contract) {
    // No governing contract — retail experience
    return {
      commercial_domain: 'RETAIL',
      can_book: true,
      organization_id: org.id,
      organization_name: org.display_name || org.legal_name,
      organization_member_id: member.id,
      organization_role: member.role,
      reason_if_cannot_book: null,
    };
  }

  if (governingResult.ambiguous) {
    // Ambiguous governing contracts — fail closed
    return {
      commercial_domain: 'B2B',
      can_book: false,
      organization_id: org.id,
      organization_name: org.display_name || org.legal_name,
      organization_member_id: member.id,
      organization_role: member.role,
      contract_id: governingResult.contract.id,
      contract_status: governingResult.contract.status,
      reason_if_cannot_book: 'AMBIGUOUS_GOVERNING_CONTRACT: Multiple qualifying contracts. Commercial resolution required.',
    };
  }

  const contract = governingResult.contract;
  const lockedSnapshots = governingResult.locked_snapshots;
  const fundingMode = governingResult.funding_mode;

  // 4. Check account hold (non-payment suspension)
  const holdCheck = isOrganizationOnHold(org, contract);
  if (holdCheck.on_hold) {
    return {
      commercial_domain: 'B2B',
      funding_mode: fundingMode,
      organization_id: org.id,
      organization_name: org.display_name || org.legal_name,
      organization_member_id: member.id,
      organization_role: member.role,
      contract_id: contract.id,
      contract_version_id: contract.contract_version_id,
      contract_type: contract.contract_type,
      contract_status: contract.status,
      billing_frequency: contract.billing_frequency,
      implementation_status: org.implementation_status,
      account_hold: true,
      hold_reason: holdCheck.reason,
      can_book: false,
      reason_if_cannot_book: 'ACCOUNT_ON_HOLD: Your account is currently on hold. Please contact your sales representative for assistance.',
      locked_config_versions: lockedSnapshots ? {
        plan: lockedSnapshots.plan.version,
        media_credit: lockedSnapshots.media_credit.version,
        reserved_capacity: lockedSnapshots.reserved_capacity.version,
        seats: lockedSnapshots.seats.version,
        implementation: lockedSnapshots.implementation.version,
        sqft_surcharge: lockedSnapshots.sqft_surcharge.version,
        commission: lockedSnapshots.commission.version,
      } : null,
    };
  }

  // 5. Determine entitlement period based on funding mode
  let period: any = null;
  let credits: any = null;
  let capacity: any = null;

  if (fundingMode === 'media_credit') {
    const periods = await client.entities.B2BMediaCreditPeriod.filter({
      organization_id: org.id, contract_id: contract.id, status: 'active',
    });
    period = periods[0];

    // JIT ALLOCATION FALLBACK: if period missing and contract is eligible, create it
    if (!period && canConsumeWithContractStatus(contract.status)) {
      try {
        period = await jitAllocateCreditPeriod(client, org, contract, lockedSnapshots);
      } catch (e) {
        // JIT allocation failed — continue without period (booking will fail)
      }
    }

    if (period) {
      credits = {
        credits_allocated: unitsToCredits(period.credits_allocated_units || 0),
        credits_available: unitsToCredits(period.credits_available_units || 0),
        credits_reserved: unitsToCredits(period.credits_reserved_units || 0),
        credits_consumed: unitsToCredits(period.credits_consumed_units || 0),
        credits_remaining: unitsToCredits(period.credits_available_units || 0),
        credits_allocated_units: period.credits_allocated_units || 0,
        credits_available_units: period.credits_available_units || 0,
        credits_reserved_units: period.credits_reserved_units || 0,
        credits_consumed_units: period.credits_consumed_units || 0,
      };
    }
  } else if (fundingMode === 'reserved_capacity') {
    const periods = await client.entities.B2BReservedCapacityPeriod.filter({
      organization_id: org.id, contract_id: contract.id, status: 'active',
    });
    period = periods[0];

    // JIT ALLOCATION FALLBACK
    if (!period && canConsumeWithContractStatus(contract.status)) {
      try {
        period = await jitAllocateCapacityPeriod(client, org, contract, lockedSnapshots);
      } catch (e) {
        // JIT allocation failed
      }
    }

    if (period) {
      capacity = {
        production_standard: period.production_standard,
        shoots_allocated: period.contracted_shoots,
        shoots_available: period.available_shoots || 0,
        shoots_reserved: period.reserved_shoots || 0,
        shoots_consumed: period.consumed_shoots || 0,
        shoots_remaining: period.available_shoots || 0,
      };
    }
  }

  const canBook = canConsume(contract.status);
  const reasonIfCannotBook = canBook ? null : `Contract status is '${contract.status}'. Consumption requires an active contract.`;

  return {
    commercial_domain: 'B2B',
    funding_mode: fundingMode,
    organization_id: org.id,
    organization_name: org.display_name || org.legal_name,
    organization_member_id: member.id,
    organization_role: member.role,
    contract_id: contract.id,
    contract_version_id: contract.contract_version_id,
    contract_type: contract.contract_type,
    contract_status: contract.status,
    billing_frequency: contract.billing_frequency,
    implementation_status: org.implementation_status,
    period_id: period?.id,
    period_start: period?.period_start,
    period_end: period?.period_end,
    locked_config_versions: lockedSnapshots ? {
      plan: lockedSnapshots.plan.version,
      media_credit: lockedSnapshots.media_credit.version,
      reserved_capacity: lockedSnapshots.reserved_capacity.version,
      seats: lockedSnapshots.seats.version,
      implementation: lockedSnapshots.implementation.version,
      sqft_surcharge: lockedSnapshots.sqft_surcharge.version,
      commission: lockedSnapshots.commission.version,
    } : null,
    credits,
    capacity,
    can_book: canBook,
    reason_if_cannot_book: reasonIfCannotBook,
  };
}

// ============================================================================
// 2. MONTHLY ALLOCATION (§4, §5)
// ============================================================================

export async function allocateB2BMediaCredits(client: any, params: {
  organization_id: string; contract_id: string; contract_version_id: string;
  period_start: string; period_end: string; credits_allocated: number;
  config_version: string; actor: string; idempotency_key: string;
}) {
  // Idempotency check
  const existing = await checkIdempotency(client, 'B2BMediaCreditLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const allocatedUnits = creditsToUnits(params.credits_allocated);

  // Check if period already exists (idempotency by period)
  const existingPeriods = await client.entities.B2BMediaCreditPeriod.filter({
    organization_id: params.organization_id, contract_id: params.contract_id,
    period_start: params.period_start, period_end: params.period_end,
  });
  if (existingPeriods.length > 0) {
    return { idempotent: true, period: existingPeriods[0], message: 'Period already exists' };
  }

  // Create period
  const period = await client.entities.B2BMediaCreditPeriod.create({
    organization_id: params.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_start: params.period_start,
    period_end: params.period_end,
    credits_allocated: params.credits_allocated,
    credits_allocated_units: allocatedUnits,
    credits_available_units: allocatedUnits,
    credits_reserved_units: 0,
    credits_consumed_units: 0,
    credits_expired_units: 0,
    credits_adjusted_units: 0,
    status: 'active',
    config_version: params.config_version,
    created_at: new Date().toISOString(),
  });

  // Create allocation ledger event
  const ledger = await client.entities.B2BMediaCreditLedger.create({
    organization_id: params.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: period.id,
    amount: params.credits_allocated,
    amount_units: allocatedUnits,
    balance_before_units: 0,
    balance_after_units: allocatedUnits,
    event_type: 'PERIOD_ALLOCATION',
    reason: `Monthly allocation: ${params.credits_allocated} credits for ${params.period_start} to ${params.period_end}`,
    actor: params.actor,
    config_version: params.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  // Update period with allocation ledger ID
  await client.entities.B2BMediaCreditPeriod.update(period.id, {
    allocation_ledger_id: ledger.id,
    credits_remaining: unitsToCredits(allocatedUnits),
    credits_used: 0,
    credits_expired: 0,
  });

  return { success: true, period, ledger_event: ledger };
}

export async function allocateB2BCapacity(client: any, params: {
  organization_id: string; contract_id: string; contract_version_id: string;
  production_standard: string; contracted_shoots: number;
  period_start: string; period_end: string; config_version: string;
  actor: string; idempotency_key: string;
}) {
  const existing = await checkIdempotency(client, 'B2BReservedCapacityLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  // Check if period already exists
  const existingPeriods = await client.entities.B2BReservedCapacityPeriod.filter({
    organization_id: params.organization_id, contract_id: params.contract_id,
    period_start: params.period_start, period_end: params.period_end,
  });
  if (existingPeriods.length > 0) {
    return { idempotent: true, period: existingPeriods[0], message: 'Period already exists' };
  }

  const period = await client.entities.B2BReservedCapacityPeriod.create({
    organization_id: params.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    production_standard: params.production_standard,
    contracted_shoots: params.contracted_shoots,
    available_shoots: params.contracted_shoots,
    reserved_shoots: 0,
    consumed_shoots: 0,
    expired_shoots: 0,
    adjusted_shoots: 0,
    overage_shoots: 0,
    used_shoots: 0,
    remaining_shoots: params.contracted_shoots,
    period_start: params.period_start,
    period_end: params.period_end,
    status: 'active',
    config_version: params.config_version,
    created_at: new Date().toISOString(),
  });

  const ledger = await client.entities.B2BReservedCapacityLedger.create({
    organization_id: params.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: period.id,
    amount: params.contracted_shoots,
    balance_before: 0,
    balance_after: params.contracted_shoots,
    event_type: 'PERIOD_ALLOCATION',
    reason: `Monthly capacity allocation: ${params.contracted_shoots} ${params.production_standard} shoots`,
    actor: params.actor,
    config_version: params.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BReservedCapacityPeriod.update(period.id, {
    allocation_ledger_id: ledger.id,
  });

  return { success: true, period, ledger_event: ledger };
}

// ============================================================================
// 3. RESERVATION — AVAILABLE → RESERVED (§6, §9 concurrency, §13 split-tender)
// ============================================================================

export async function reserveB2BMediaCredits(client: any, params: {
  period_id: string; amount_units: number; idempotency_key: string;
  reservation_id: string; booking_reference?: string;
  actor: string; acting_user_id?: string; organization_member_id?: string;
  contract_id: string; contract_version_id: string;
  allow_split_tender?: boolean; locked_snapshots?: LockedConfigSnapshots;
}) {
  const { allow_split_tender = true } = params;

  // Idempotency check
  const existing = await checkIdempotency(client, 'B2BMediaCreditLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing, result: JSON.parse(existing.reason || '{}') };

  // Read period
  const period = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };
  if (period.status !== 'active') return { success: false, reason: 'PERIOD_NOT_ACTIVE' };

  const availableBefore = period.credits_available_units || 0;
  const required = params.amount_units;

  // Determine actual reservation amount (split-tender)
  const creditApplied = Math.min(required, availableBefore);
  const creditShortfall = Math.max(0, required - availableBefore);

  if (creditApplied <= 0) {
    return {
      success: false, reason: 'INSUFFICIENT_CREDITS',
      credit_requirement: required, credit_applied: 0, credit_shortfall: required,
    };
  }

  if (creditShortfall > 0 && !allow_split_tender) {
    return {
      success: false, reason: 'INSUFFICIENT_CREDITS',
      credit_requirement: required, credit_applied: 0, credit_shortfall: creditShortfall,
    };
  }

  // Atomic conditional update: only succeed if available >= creditApplied
  const updateResult = await client.entities.B2BMediaCreditPeriod.updateMany(
    { id: params.period_id, credits_available_units: { $gte: creditApplied }, status: 'active' },
    { $inc: { credits_reserved_units: creditApplied, credits_available_units: -creditApplied } }
  );

  // Check if update succeeded (updateMany returns { updated: N })
  if (!updateResult || updateResult.updated === 0) {
    return {
      success: false, reason: 'INSUFFICIENT_CREDITS',
      credit_requirement: required, credit_applied: 0, credit_shortfall: required,
    };
  }

  // Read updated period
  const updated = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  const availableAfter = updated.credits_available_units || 0;

  // Create ledger event
  const ledger = await client.entities.B2BMediaCreditLedger.create({
    organization_id: period.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: params.period_id,
    booking_reference: params.booking_reference,
    reservation_id: params.reservation_id,
    amount: unitsToCredits(-creditApplied),
    amount_units: -creditApplied,
    balance_before_units: availableBefore,
    balance_after_units: availableAfter,
    event_type: 'RESERVATION',
    reason: JSON.stringify({
      credit_requirement: required, credit_applied: creditApplied,
      credit_shortfall: creditShortfall, reservation_id: params.reservation_id,
    }),
    actor: params.actor,
    acting_user_id: params.acting_user_id,
    organization_member_id: params.organization_member_id,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  // Update display fields
  await client.entities.B2BMediaCreditPeriod.update(params.period_id, {
    credits_remaining: unitsToCredits(availableAfter),
  });

  // Create overage record for shortfall (split-tender cash obligation)
  let overageRecord: any = null;
  if (creditShortfall > 0) {
    const lockedSnapshots = params.locked_snapshots || await getLockedConfigSnapshots(client, params.contract_version_id);
    // §XXIII: Use explicit shortfall rate if configured, otherwise derive from plan
    const creditConfig = lockedSnapshots.media_credit?.snapshot || {};
    const explicitRate = creditConfig.credit_shortfall_rate_per_credit;
    let perCreditValue: number;
    if (typeof explicitRate === 'number' && explicitRate > 0) {
      perCreditValue = explicitRate;
    } else {
      const planDef = lockedSnapshots.plan.snapshot.plans.find((p: any) => p.monthly_media_credits > 0);
      perCreditValue = planDef ? planDef.monthly_price / planDef.monthly_media_credits : 0;
    }
    const cashRemainder = unitsToCredits(creditShortfall) * perCreditValue;

    overageRecord = await client.entities.B2BContractOverage.create({
      overage_id: `b2bovg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      organization_id: period.organization_id,
      contract_id: params.contract_id,
      contract_version_id: params.contract_version_id,
      period_id: params.period_id,
      period_type: 'credit',
      booking_reference: params.booking_reference,
      overage_type: 'credit_shortfall',
      quantity: unitsToCredits(creditShortfall),
      overage_amount: cashRemainder,
      unit_economics: `${unitsToCredits(creditShortfall)} credits × $${perCreditValue.toFixed(2)}/credit = $${cashRemainder.toFixed(2)}`,
      locked_config_snapshot: JSON.stringify({ plan_version: lockedSnapshots.plan.version }),
      snapshot_json: JSON.stringify({ credit_shortfall_units: creditShortfall, per_credit_value: perCreditValue }),
      status: 'created',
      idempotency_key: `${params.idempotency_key}_shortfall`,
      created_at: new Date().toISOString(),
    });
  }

  return {
    success: true,
    reservation_id: params.reservation_id,
    ledger_event: ledger,
    overage_record: overageRecord,
    credit_requirement: required,
    credit_applied: creditApplied,
    credit_shortfall: creditShortfall,
    cash_remainder: overageRecord ? overageRecord.overage_amount : 0,
    funding_sources: creditShortfall > 0
      ? [{ type: 'media_credit', amount_units: creditApplied }, { type: 'cash', amount: overageRecord.overage_amount }]
      : [{ type: 'media_credit', amount_units: creditApplied }],
    balance_before_units: availableBefore,
    balance_after_units: availableAfter,
  };
}

export async function reserveB2BCapacity(client: any, params: {
  period_id: string; shoots: number; idempotency_key: string;
  reservation_id: string; booking_reference?: string;
  actor: string; acting_user_id?: string; organization_member_id?: string;
  contract_id: string; contract_version_id: string;
  allow_overage?: boolean;
}) {
  const { allow_overage = true } = params;

  const existing = await checkIdempotency(client, 'B2BReservedCapacityLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const period = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };
  if (period.status !== 'active') return { success: false, reason: 'PERIOD_NOT_ACTIVE' };

  const availableBefore = period.available_shoots || 0;
  const required = params.shoots;
  const applied = Math.min(required, availableBefore);
  const shortfall = Math.max(0, required - availableBefore);

  if (applied <= 0 && !allow_overage) {
    return { success: false, reason: 'INSUFFICIENT_CAPACITY', shoots_required: required, shoots_applied: 0 };
  }

  let updateResult: any = { updated: 0 };
  if (applied > 0) {
    updateResult = await client.entities.B2BReservedCapacityPeriod.updateMany(
      { id: params.period_id, available_shoots: { $gte: applied }, status: 'active' },
      { $inc: { reserved_shoots: applied, available_shoots: -applied } }
    );
    if (!updateResult || updateResult.updated === 0) {
      return { success: false, reason: 'INSUFFICIENT_CAPACITY', shoots_required: required, shoots_applied: 0 };
    }
  }

  const updated = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  const availableAfter = updated.available_shoots || 0;

  const ledger = await client.entities.B2BReservedCapacityLedger.create({
    organization_id: period.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: params.period_id,
    booking_reference: params.booking_reference,
    reservation_id: params.reservation_id,
    amount: -applied,
    balance_before: availableBefore,
    balance_after: availableAfter,
    event_type: 'RESERVATION',
    reason: `Reserved ${applied} shoot(s)${shortfall > 0 ? ` (shortfall: ${shortfall} → overage)` : ''}`,
    actor: params.actor,
    acting_user_id: params.acting_user_id,
    organization_member_id: params.organization_member_id,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BReservedCapacityPeriod.update(params.period_id, {
    remaining_shoots: availableAfter,
  });

  // Create overage for capacity shortfall
  let overageRecord: any = null;
  if (shortfall > 0 && allow_overage) {
    const lockedSnapshots = await getLockedConfigSnapshots(client, params.contract_version_id);
    const capConfig = lockedSnapshots.reserved_capacity.snapshot;
    const standard = capConfig.standards[period.production_standard];
    const band = standard.bands.find((b: any) => b.shoots === period.contracted_shoots) || standard.bands[0];
    const perShootRate = band ? band.monthly_price / band.shoots : 0;
    const overageRate = perShootRate * (capConfig.overage_rate_multiplier || 1.10);
    const overageAmount = shortfall * overageRate;

    overageRecord = await client.entities.B2BContractOverage.create({
      overage_id: `b2bovg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      organization_id: period.organization_id,
      contract_id: params.contract_id,
      contract_version_id: params.contract_version_id,
      period_id: params.period_id,
      period_type: 'capacity',
      booking_reference: params.booking_reference,
      overage_type: 'capacity_overage',
      shoots_over: shortfall,
      quantity: shortfall,
      contracted_per_shoot_rate: perShootRate,
      overage_rate_multiplier: capConfig.overage_rate_multiplier || 1.10,
      overage_per_shoot_rate: overageRate,
      overage_amount: overageAmount,
      unit_economics: `${shortfall} shoot(s) × $${overageRate.toFixed(2)} = $${overageAmount.toFixed(2)}`,
      locked_config_snapshot: JSON.stringify({ capacity_version: lockedSnapshots.reserved_capacity.version }),
      snapshot_json: JSON.stringify({ shortfall, per_shoot_rate: perShootRate, overage_rate: overageRate }),
      status: 'created',
      idempotency_key: `${params.idempotency_key}_overage`,
      created_at: new Date().toISOString(),
    });

    // Track overage shoots on period
    await client.entities.B2BReservedCapacityPeriod.update(params.period_id, {
      $inc: { overage_shoots: shortfall },
    } as any);
  }

  return {
    success: true,
    reservation_id: params.reservation_id,
    ledger_event: ledger,
    overage_record: overageRecord,
    shoots_required: required,
    shoots_applied: applied,
    shoots_shortfall: shortfall,
    overage_amount: overageRecord ? overageRecord.overage_amount : 0,
    balance_before: availableBefore,
    balance_after: availableAfter,
  };
}

// ============================================================================
// 4. COMMIT — RESERVED → CONSUMED (§6)
// ============================================================================

export async function commitB2BMediaCreditReservation(client: any, params: {
  period_id: string; reservation_id: string; amount_units: number;
  idempotency_key: string; actor: string; booking_reference?: string;
  contract_id: string; contract_version_id: string;
  acting_user_id?: string; organization_member_id?: string;
}) {
  const existing = await checkIdempotency(client, 'B2BMediaCreditLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const period = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };

  const reservedBefore = period.credits_reserved_units || 0;
  const availableBefore = period.credits_available_units || 0;
  if (reservedBefore < params.amount_units) {
    return { success: false, reason: 'INSUFFICIENT_RESERVED' };
  }

  await client.entities.B2BMediaCreditPeriod.updateMany(
    { id: params.period_id, credits_reserved_units: { $gte: params.amount_units } },
    { $inc: { credits_reserved_units: -params.amount_units, credits_consumed_units: params.amount_units } }
  );

  const updated = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  const ledger = await client.entities.B2BMediaCreditLedger.create({
    organization_id: period.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: params.period_id,
    booking_reference: params.booking_reference,
    reservation_id: params.reservation_id,
    amount: unitsToCredits(-params.amount_units),
    amount_units: -params.amount_units,
    balance_before_units: availableBefore,
    balance_after_units: updated.credits_available_units || 0,
    event_type: 'BOOKING_CONSUMPTION',
    reason: `Committed reservation ${params.reservation_id}: ${unitsToCredits(params.amount_units)} credits`,
    actor: params.actor,
    acting_user_id: params.acting_user_id,
    organization_member_id: params.organization_member_id,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BMediaCreditPeriod.update(params.period_id, {
    credits_used: unitsToCredits(updated.credits_consumed_units || 0),
    credits_remaining: unitsToCredits(updated.credits_available_units || 0),
  });

  return { success: true, ledger_event: ledger, consumed_units: params.amount_units };
}

export async function commitB2BCapacityReservation(client: any, params: {
  period_id: string; reservation_id: string; shoots: number;
  idempotency_key: string; actor: string; booking_reference?: string;
  contract_id: string; contract_version_id: string;
  acting_user_id?: string; organization_member_id?: string;
}) {
  const existing = await checkIdempotency(client, 'B2BReservedCapacityLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const period = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };

  const reservedBefore = period.reserved_shoots || 0;
  const availableBefore = period.available_shoots || 0;
  if (reservedBefore < params.shoots) {
    return { success: false, reason: 'INSUFFICIENT_RESERVED' };
  }

  await client.entities.B2BReservedCapacityPeriod.updateMany(
    { id: params.period_id, reserved_shoots: { $gte: params.shoots } },
    { $inc: { reserved_shoots: -params.shoots, consumed_shoots: params.shoots } }
  );

  const updated = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  const ledger = await client.entities.B2BReservedCapacityLedger.create({
    organization_id: period.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: params.period_id,
    booking_reference: params.booking_reference,
    reservation_id: params.reservation_id,
    amount: -params.shoots,
    balance_before: availableBefore,
    balance_after: updated.available_shoots || 0,
    event_type: 'BOOKING_CONSUMPTION',
    reason: `Committed reservation ${params.reservation_id}: ${params.shoots} shoot(s)`,
    actor: params.actor,
    acting_user_id: params.acting_user_id,
    organization_member_id: params.organization_member_id,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BReservedCapacityPeriod.update(params.period_id, {
    used_shoots: updated.consumed_shoots || 0,
    remaining_shoots: updated.available_shoots || 0,
  });

  return { success: true, ledger_event: ledger, consumed_shoots: params.shoots };
}

// ============================================================================
// 5. RELEASE — RESERVED → AVAILABLE (§6, §16)
// ============================================================================

export async function releaseB2BMediaCreditReservation(client: any, params: {
  period_id: string; reservation_id: string; amount_units: number;
  idempotency_key: string; actor: string; reason: string;
  contract_id: string; contract_version_id: string;
}) {
  const existing = await checkIdempotency(client, 'B2BMediaCreditLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const period = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };

  const availableBefore = period.credits_available_units || 0;
  const reservedBefore = period.credits_reserved_units || 0;
  const releaseAmount = Math.min(params.amount_units, reservedBefore);

  if (releaseAmount <= 0) return { success: false, reason: 'NO_RESERVED_CREDITS' };

  await client.entities.B2BMediaCreditPeriod.updateMany(
    { id: params.period_id, credits_reserved_units: { $gte: releaseAmount } },
    { $inc: { credits_reserved_units: -releaseAmount, credits_available_units: releaseAmount } }
  );

  const updated = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  const ledger = await client.entities.B2BMediaCreditLedger.create({
    organization_id: period.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: params.period_id,
    reservation_id: params.reservation_id,
    amount: unitsToCredits(releaseAmount),
    amount_units: releaseAmount,
    balance_before_units: availableBefore,
    balance_after_units: updated.credits_available_units || 0,
    event_type: 'RESERVATION_RELEASE',
    reason: params.reason,
    actor: params.actor,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BMediaCreditPeriod.update(params.period_id, {
    credits_remaining: unitsToCredits(updated.credits_available_units || 0),
  });

  return { success: true, ledger_event: ledger, released_units: releaseAmount };
}

export async function releaseB2BCapacityReservation(client: any, params: {
  period_id: string; reservation_id: string; shoots: number;
  idempotency_key: string; actor: string; reason: string;
  contract_id: string; contract_version_id: string;
}) {
  const existing = await checkIdempotency(client, 'B2BReservedCapacityLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const period = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };

  const availableBefore = period.available_shoots || 0;
  const reservedBefore = period.reserved_shoots || 0;
  const releaseAmount = Math.min(params.shoots, reservedBefore);

  if (releaseAmount <= 0) return { success: false, reason: 'NO_RESERVED_SHOOTS' };

  await client.entities.B2BReservedCapacityPeriod.updateMany(
    { id: params.period_id, reserved_shoots: { $gte: releaseAmount } },
    { $inc: { reserved_shoots: -releaseAmount, available_shoots: releaseAmount } }
  );

  const updated = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  const ledger = await client.entities.B2BReservedCapacityLedger.create({
    organization_id: period.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: params.period_id,
    reservation_id: params.reservation_id,
    amount: releaseAmount,
    balance_before: availableBefore,
    balance_after: updated.available_shoots || 0,
    event_type: 'RESERVATION_RELEASE',
    reason: params.reason,
    actor: params.actor,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BReservedCapacityPeriod.update(params.period_id, {
    remaining_shoots: updated.available_shoots || 0,
  });

  return { success: true, ledger_event: ledger, released_shoots: releaseAmount };
}

// ============================================================================
// 6. REVERSAL — CONSUMED → AVAILABLE (§16, compensating entry)
// ============================================================================

export async function reverseB2BMediaCredits(client: any, params: {
  period_id: string; original_event_id: string; amount_units: number;
  idempotency_key: string; actor: string; reason: string;
  contract_id: string; contract_version_id: string;
  booking_reference?: string;
}) {
  const existing = await checkIdempotency(client, 'B2BMediaCreditLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const period = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };

  const availableBefore = period.credits_available_units || 0;

  await client.entities.B2BMediaCreditPeriod.updateMany(
    { id: params.period_id },
    { $inc: { credits_consumed_units: -params.amount_units, credits_available_units: params.amount_units } }
  );

  const updated = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  const ledger = await client.entities.B2BMediaCreditLedger.create({
    organization_id: period.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: params.period_id,
    original_event_id: params.original_event_id,
    booking_reference: params.booking_reference,
    amount: unitsToCredits(params.amount_units),
    amount_units: params.amount_units,
    balance_before_units: availableBefore,
    balance_after_units: updated.credits_available_units || 0,
    event_type: 'BOOKING_REVERSAL',
    reason: params.reason,
    actor: params.actor,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BMediaCreditPeriod.update(params.period_id, {
    credits_used: unitsToCredits(updated.credits_consumed_units || 0),
    credits_remaining: unitsToCredits(updated.credits_available_units || 0),
  });

  return { success: true, ledger_event: ledger, reversed_units: params.amount_units };
}

export async function reverseB2BCapacity(client: any, params: {
  period_id: string; original_event_id: string; shoots: number;
  idempotency_key: string; actor: string; reason: string;
  contract_id: string; contract_version_id: string;
  booking_reference?: string;
}) {
  const existing = await checkIdempotency(client, 'B2BReservedCapacityLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const period = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };

  const availableBefore = period.available_shoots || 0;

  await client.entities.B2BReservedCapacityPeriod.updateMany(
    { id: params.period_id },
    { $inc: { consumed_shoots: -params.shoots, available_shoots: params.shoots } }
  );

  const updated = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  const ledger = await client.entities.B2BReservedCapacityLedger.create({
    organization_id: period.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: params.period_id,
    original_event_id: params.original_event_id,
    booking_reference: params.booking_reference,
    amount: params.shoots,
    balance_before: availableBefore,
    balance_after: updated.available_shoots || 0,
    event_type: 'BOOKING_REVERSAL',
    reason: params.reason,
    actor: params.actor,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BReservedCapacityPeriod.update(params.period_id, {
    used_shoots: updated.consumed_shoots || 0,
    remaining_shoots: updated.available_shoots || 0,
  });

  return { success: true, ledger_event: ledger, reversed_shoots: params.shoots };
}

// ============================================================================
// 7. ADMIN ADJUSTMENTS (§18)
// ============================================================================

export async function adjustB2BMediaCredits(client: any, params: {
  period_id: string; amount_units: number; direction: 'increase' | 'decrease';
  reason: string; actor: string; request_id: string; idempotency_key: string;
  contract_id: string; contract_version_id: string;
}) {
  const existing = await checkIdempotency(client, 'B2BMediaCreditLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const period = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };

  const availableBefore = period.credits_available_units || 0;
  const signedAmount = params.direction === 'increase' ? params.amount_units : -params.amount_units;

  await client.entities.B2BMediaCreditPeriod.updateMany(
    { id: params.period_id },
    { $inc: { credits_available_units: signedAmount, credits_adjusted_units: signedAmount } }
  );

  const updated = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  const ledger = await client.entities.B2BMediaCreditLedger.create({
    organization_id: period.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: params.period_id,
    amount: unitsToCredits(signedAmount),
    amount_units: signedAmount,
    balance_before_units: availableBefore,
    balance_after_units: updated.credits_available_units || 0,
    event_type: 'ADMIN_ADJUSTMENT',
    reason: params.reason,
    actor: params.actor,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BMediaCreditPeriod.update(params.period_id, {
    credits_remaining: unitsToCredits(updated.credits_available_units || 0),
  });

  await createAuditLog(client, {
    actor: params.actor, action: 'entitlement_adjustment',
    entity_type: 'B2BMediaCreditPeriod', entity_id: params.period_id,
    reason: `${params.direction} ${unitsToCredits(params.amount_units)} credits. ${params.reason}`,
    before_snapshot: JSON.stringify({ available_units: availableBefore }),
    after_snapshot: JSON.stringify({ available_units: updated.credits_available_units }),
  });

  return { success: true, ledger_event: ledger, adjusted_units: signedAmount };
}

export async function adjustB2BCapacity(client: any, params: {
  period_id: string; shoots: number; direction: 'increase' | 'decrease';
  reason: string; actor: string; request_id: string; idempotency_key: string;
  contract_id: string; contract_version_id: string;
}) {
  const existing = await checkIdempotency(client, 'B2BReservedCapacityLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const period = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };

  const availableBefore = period.available_shoots || 0;
  const signedAmount = params.direction === 'increase' ? params.shoots : -params.shoots;

  await client.entities.B2BReservedCapacityPeriod.updateMany(
    { id: params.period_id },
    { $inc: { available_shoots: signedAmount, adjusted_shoots: signedAmount } }
  );

  const updated = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  const ledger = await client.entities.B2BReservedCapacityLedger.create({
    organization_id: period.organization_id,
    contract_id: params.contract_id,
    contract_version_id: params.contract_version_id,
    period_id: params.period_id,
    amount: signedAmount,
    balance_before: availableBefore,
    balance_after: updated.available_shoots || 0,
    event_type: 'ADMIN_ADJUSTMENT',
    reason: params.reason,
    actor: params.actor,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BReservedCapacityPeriod.update(params.period_id, {
    remaining_shoots: updated.available_shoots || 0,
  });

  await createAuditLog(client, {
    actor: params.actor, action: 'entitlement_adjustment',
    entity_type: 'B2BReservedCapacityPeriod', entity_id: params.period_id,
    reason: `${params.direction} ${params.shoots} shoots. ${params.reason}`,
    before_snapshot: JSON.stringify({ available_shoots: availableBefore }),
    after_snapshot: JSON.stringify({ available_shoots: updated.available_shoots }),
  });

  return { success: true, ledger_event: ledger, adjusted_shoots: signedAmount };
}

// ============================================================================
// 8. PERIOD EXPIRATION (§17)
// ============================================================================

export async function expireB2BMediaCreditPeriod(client: any, params: {
  period_id: string; actor: string; idempotency_key: string;
}) {
  const existing = await checkIdempotency(client, 'B2BMediaCreditLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const period = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };
  if (period.status === 'expired') return { idempotent: true, message: 'Already expired' };

  const availableBefore = period.credits_available_units || 0;
  const reservedBefore = period.credits_reserved_units || 0;

  // Expire all available credits (no rollover)
  if (availableBefore > 0) {
    await client.entities.B2BMediaCreditPeriod.updateMany(
      { id: params.period_id },
      { $inc: { credits_expired_units: availableBefore, credits_available_units: -availableBefore } }
    );
  }

  // Flag unresolved reservations
  const hasUnresolved = reservedBefore > 0;

  const updated = await client.entities.B2BMediaCreditPeriod.get(params.period_id);
  const ledger = await client.entities.B2BMediaCreditLedger.create({
    organization_id: period.organization_id,
    contract_id: period.contract_id,
    contract_version_id: period.contract_version_id,
    period_id: params.period_id,
    amount: unitsToCredits(-availableBefore),
    amount_units: -availableBefore,
    balance_before_units: availableBefore,
    balance_after_units: 0,
    event_type: 'EXPIRATION',
    reason: `Period expired: ${availableBefore} credits expired (no rollover).${hasUnresolved ? ` ${reservedBefore} units remain reserved (flagged for reconciliation).` : ''}`,
    actor: params.actor,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BMediaCreditPeriod.update(params.period_id, {
    status: 'expired',
    credits_expired: unitsToCredits(updated.credits_expired_units || 0),
    credits_remaining: 0,
    has_unresolved_reservations: hasUnresolved,
  });

  return { success: true, ledger_event: ledger, expired_units: availableBefore, has_unresolved_reservations: hasUnresolved };
}

export async function expireB2BCapacityPeriod(client: any, params: {
  period_id: string; actor: string; idempotency_key: string;
}) {
  const existing = await checkIdempotency(client, 'B2BReservedCapacityLedger', params.idempotency_key);
  if (existing) return { idempotent: true, ledger_event: existing };

  const period = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  if (!period) return { success: false, reason: 'PERIOD_NOT_FOUND' };
  if (period.status === 'expired') return { idempotent: true, message: 'Already expired' };

  const availableBefore = period.available_shoots || 0;
  const reservedBefore = period.reserved_shoots || 0;

  if (availableBefore > 0) {
    await client.entities.B2BReservedCapacityPeriod.updateMany(
      { id: params.period_id },
      { $inc: { expired_shoots: availableBefore, available_shoots: -availableBefore } }
    );
  }

  const hasUnresolved = reservedBefore > 0;

  const updated = await client.entities.B2BReservedCapacityPeriod.get(params.period_id);
  const ledger = await client.entities.B2BReservedCapacityLedger.create({
    organization_id: period.organization_id,
    contract_id: period.contract_id,
    contract_version_id: period.contract_version_id,
    period_id: params.period_id,
    amount: -availableBefore,
    balance_before: availableBefore,
    balance_after: 0,
    event_type: 'EXPIRATION',
    reason: `Period expired: ${availableBefore} shoots expired (no rollover).${hasUnresolved ? ` ${reservedBefore} shoots remain reserved (flagged for reconciliation).` : ''}`,
    actor: params.actor,
    config_version: period.config_version,
    idempotency_key: params.idempotency_key,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BReservedCapacityPeriod.update(params.period_id, {
    status: 'expired',
    expired_shoots: updated.expired_shoots || 0,
    remaining_shoots: 0,
    has_unresolved_reservations: hasUnresolved,
  });

  return { success: true, ledger_event: ledger, expired_shoots: availableBefore, has_unresolved_reservations: hasUnresolved };
}

// ============================================================================
// 9. BALANCE INVARIANTS (§19)
// ============================================================================

export async function verifyB2BMediaCreditInvariant(client: any, period_id: string) {
  const period = await client.entities.B2BMediaCreditPeriod.get(period_id);
  if (!period) return { valid: false, reason: 'PERIOD_NOT_FOUND' };

  const allocated = period.credits_allocated_units || 0;
  const adjusted = period.credits_adjusted_units || 0;
  const available = period.credits_available_units || 0;
  const reserved = period.credits_reserved_units || 0;
  const consumed = period.credits_consumed_units || 0;
  const expired = period.credits_expired_units || 0;

  // Invariant: allocated + positive_adjustments + reversals = available + reserved + consumed + expired + negative_adjustments
  // Simplified: allocated + adjusted = available + reserved + consumed + expired
  const leftSide = allocated + adjusted;
  const rightSide = available + reserved + consumed + expired;
  const valid = leftSide === rightSide;

  return {
    valid,
    allocated, adjusted, available, reserved, consumed, expired,
    left_side: leftSide, right_side: rightSide,
    discrepancy: leftSide - rightSide,
  };
}

export async function verifyB2BReservedCapacityInvariant(client: any, period_id: string) {
  const period = await client.entities.B2BReservedCapacityPeriod.get(period_id);
  if (!period) return { valid: false, reason: 'PERIOD_NOT_FOUND' };

  const contracted = period.contracted_shoots || 0;
  const adjusted = period.adjusted_shoots || 0;
  const available = period.available_shoots || 0;
  const reserved = period.reserved_shoots || 0;
  const consumed = period.consumed_shoots || 0;
  const expired = period.expired_shoots || 0;

  // Invariant: contracted + adjusted = available + reserved + consumed + expired
  const leftSide = contracted + adjusted;
  const rightSide = available + reserved + consumed + expired;
  const valid = leftSide === rightSide;

  return {
    valid,
    contracted, adjusted, available, reserved, consumed, expired,
    left_side: leftSide, right_side: rightSide,
    discrepancy: leftSide - rightSide,
    overage_tracked_separately: period.overage_shoots || 0,
  };
}

// ============================================================================
// 10. CAPACITY REVIEW (§21)
// ============================================================================

export async function checkB2BCapacityReview(client: any, params: {
  organization_id: string; contract_id: string;
}) {
  // Find all periods with overage for this org/contract
  const periods = await client.entities.B2BReservedCapacityPeriod.filter({
    organization_id: params.organization_id, contract_id: params.contract_id,
  });

  // Sort by period_start
  periods.sort((a: any, b: any) => a.period_start.localeCompare(b.period_start));

  // Find consecutive overage periods
  let consecutiveCount = 0;
  let consecutivePeriodIds: string[] = [];
  let currentStreak: string[] = [];

  for (const period of periods) {
    if ((period.overage_shoots || 0) > 0) {
      currentStreak.push(period.id);
      if (currentStreak.length > consecutiveCount) {
        consecutiveCount = currentStreak.length;
        consecutivePeriodIds = [...currentStreak];
      }
    } else {
      currentStreak = [];
    }
  }

  if (consecutiveCount < 3) {
    return { review_triggered: false, consecutive_overage_periods: consecutiveCount };
  }

  // Check if a review already exists for these exact periods (idempotency)
  const existingReviews = await client.entities.B2BCapacityReview.filter({
    organization_id: params.organization_id, contract_id: params.contract_id,
  });

  for (const review of existingReviews) {
    const reviewPeriodIds = review.overage_period_ids || [];
    if (reviewPeriodIds.length === consecutivePeriodIds.length &&
        consecutivePeriodIds.every((id: string) => reviewPeriodIds.includes(id))) {
      return { review_triggered: false, review_already_exists: true, review_id: review.id };
    }
  }

  // Create new review
  const review = await client.entities.B2BCapacityReview.create({
    review_id: `b2brev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    organization_id: params.organization_id,
    contract_id: params.contract_id,
    consecutive_overage_periods: consecutiveCount,
    overage_period_ids: consecutivePeriodIds,
    current_capacity_band: `${periods[0]?.contracted_shoots || 0} ${periods[0]?.production_standard || ''}`,
    suggested_action: 'upgrade capacity band',
    notified_parties: [],
    status: 'open',
    created_at: new Date().toISOString(),
  });

  return { review_triggered: true, review, consecutive_overage_periods: consecutiveCount };
}

// ============================================================================
// 11. BOOKING ENTITLEMENT REQUIREMENT (Quote — Addendum §13)
// ============================================================================

export async function resolveB2BBookingEntitlementRequirement(client: any, params: {
  organization_id: string; contract_id: string;
  package: string; property_sqft: number; selected_add_ons?: AddOnInput[];
}) {
  const contract = await client.entities.B2BContract.get(params.contract_id);
  if (!contract) return { success: false, reason: 'CONTRACT_NOT_FOUND' };

  const lockedSnapshots = await getLockedConfigSnapshots(client, contract.contract_version_id);
  const fundingMode = getFundingMode(contract.contract_type);

  if (fundingMode === 'media_credit') {
    // Find active period
    const periods = await client.entities.B2BMediaCreditPeriod.filter({
      organization_id: params.organization_id, contract_id: params.contract_id, status: 'active',
    });
    const period = periods[0];
    const availableUnits = period?.credits_available_units || 0;

    // READ-ONLY retail add-on price lookup from the active MediaPricingConfig.
    // The retail config is NEVER mutated — we only read add-on customer_price
    // to compute the B2B credit conversion (retail_price / divisor).
    let resolvedAddOns: AddOnInput[] = params.selected_add_ons || [];
    const hasZeroPrices = resolvedAddOns.some(a => !a.retail_price || a.retail_price === 0);
    if (hasZeroPrices || resolvedAddOns.length === 0 && (params as any).addon_ids) {
      try {
        const pricingConfig = await getActivePricingConfig(client);
        const addonMap = new Map<string, number>();
        for (const a of (pricingConfig.add_ons || [])) {
          if (a.active) addonMap.set(a.id, a.customer_price);
        }
        // Support both AddOnInput[] and string[] (addon_ids) from frontend
        const inputIds: string[] = (params as any).addon_ids || resolvedAddOns.map(a => a.id);
        resolvedAddOns = inputIds.map(id => ({
          id,
          retail_price: addonMap.get(id) || 0,
        }));
      } catch (e) {
        // If pricing config can't be loaded, proceed with whatever prices we have
      }
    }

    const costResult = resolveCreditCost(lockedSnapshots, params.package, params.property_sqft, resolvedAddOns);

    if (costResult.requires_custom_quote) {
      return {
        success: true,
        funding_mode: 'media_credit',
        b2b_sqft_tier: costResult.b2b_sqft_tier,
        property_sqft: params.property_sqft,
        requires_custom_quote: true,
        available_credits: unitsToCredits(availableUnits),
        locked_config_versions: { plan: lockedSnapshots.plan.version, media_credit: lockedSnapshots.media_credit.version },
      };
    }

    const requiredUnits = costResult.total_credit_requirement;
    const projectedRemaining = availableUnits - requiredUnits;
    const creditShortfall = Math.max(0, requiredUnits - availableUnits);

    // Cash obligation for shortfall — §XXIII: use explicit rate if configured
    let cashObligation = 0;
    if (creditShortfall > 0) {
      const creditConfig = lockedSnapshots.media_credit?.snapshot || {};
      const explicitRate = creditConfig.credit_shortfall_rate_per_credit;
      let perCreditValue: number;
      if (typeof explicitRate === 'number' && explicitRate > 0) {
        perCreditValue = explicitRate;
      } else {
        const planDef = lockedSnapshots.plan.snapshot.plans.find((p: any) => p.monthly_media_credits > 0);
        perCreditValue = planDef ? planDef.monthly_price / planDef.monthly_media_credits : 0;
      }
      cashObligation = unitsToCredits(creditShortfall) * perCreditValue;
    }

    return {
      success: true,
      funding_mode: 'media_credit',
      b2b_sqft_tier: costResult.b2b_sqft_tier,
      property_sqft: params.property_sqft,
      base_credit_requirement: costResult.base_credit_requirement,
      addon_credit_requirement: costResult.addon_credit_requirement,
      total_credit_requirement: requiredUnits,
      total_credit_requirement_display: costResult.total_credit_requirement_display,
      available_credits: unitsToCredits(availableUnits),
      available_credits_units: availableUnits,
      projected_remaining_credits: unitsToCredits(projectedRemaining),
      projected_remaining_credits_units: projectedRemaining,
      credit_shortfall: creditShortfall,
      cash_obligation_if_applicable: cashObligation,
      requires_custom_quote: false,
      non_credit_charges: costResult.non_credit_charges,
      addon_breakdown: costResult.addon_breakdown,
      locked_config_versions: {
        plan: lockedSnapshots.plan.version,
        media_credit: lockedSnapshots.media_credit.version,
      },
    };
  }

  if (fundingMode === 'reserved_capacity') {
    const periods = await client.entities.B2BReservedCapacityPeriod.filter({
      organization_id: params.organization_id, contract_id: params.contract_id, status: 'active',
    });
    const period = periods[0];
    const availableShoots = period?.available_shoots || 0;

    const tier = determineB2BTier(params.property_sqft);
    const isCustom = isB2BCustomTier(tier);

    // Large property surcharge
    const surchargeResult = calculateB2BLargePropertySurcharge(lockedSnapshots, params.package, params.property_sqft);

    // Reserved capacity: 1 shoot per eligible booking (≤10K or >10K)
    const shootRequirement = 1;
    const projectedRemaining = availableShoots - shootRequirement;
    const overageRequired = projectedRemaining < 0;

    return {
      success: true,
      funding_mode: 'reserved_capacity',
      b2b_sqft_tier: tier,
      property_sqft: params.property_sqft,
      reserved_shoot_requirement: shootRequirement,
      large_property_tier: surchargeResult.large_property_tier,
      large_property_surcharge_obligation: surchargeResult.surcharge_amount,
      requires_custom_quote: isCustom || surchargeResult.requires_custom_quote,
      capacity_available: availableShoots,
      projected_capacity_remaining: Math.max(0, projectedRemaining),
      overage_required: overageRequired,
      locked_config_versions: {
        reserved_capacity: lockedSnapshots.reserved_capacity.version,
        sqft_surcharge: lockedSnapshots.sqft_surcharge.version,
      },
    };
  }

  return { success: false, reason: 'UNSUPPORTED_FUNDING_MODE', funding_mode: fundingMode };
}

// ============================================================================
// 12. CONTRACT VERSION LOCKING (§1)
// ============================================================================

export async function lockB2BContractVersion(client: any, params: {
  contract_id: string; version_number: number; terms_json: string;
  created_by: string; change_reason: string;
}) {
  const lockedSnapshots = await buildLockedConfigSnapshots(client);
  const lockedJson = JSON.stringify(lockedSnapshots);

  const version = await client.entities.B2BContractVersion.create({
    contract_id: params.contract_id,
    version_number: params.version_number,
    terms_json: params.terms_json,
    locked_config_snapshots: lockedJson,
    effective_at: new Date().toISOString(),
    status: 'active',
    immutable_snapshot: true,
    created_at: new Date().toISOString(),
    created_by: params.created_by,
    change_reason: params.change_reason,
  });

  return { success: true, version, locked_config_snapshots: lockedSnapshots };
}

// ============================================================================
// 13. JIT ALLOCATION FALLBACK (§XXVI)
// ============================================================================

/**
 * Just-in-time credit period allocation.
 * If an eligible organization reaches entitlement resolution and the current
 * period is missing, create the correct current period exactly once.
 * Uses concurrency protection (idempotency by period_start + period_end).
 */
async function jitAllocateCreditPeriod(
  client: any,
  org: any,
  contract: any,
  lockedSnapshots: LockedConfigSnapshots | null
): Promise<any> {
  if (!lockedSnapshots) return null;

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  // Concurrency check: see if period was already created by another request
  const existing = await client.entities.B2BMediaCreditPeriod.filter({
    organization_id: org.id, contract_id: contract.id,
    period_start: periodStart, period_end: periodEnd,
  });
  if (existing.length > 0) return existing[0];

  // Get monthly credits from locked plan config
  const monthlyCredits = getPlanMonthlyCredits(lockedSnapshots, contract.plan_id);
  if (monthlyCredits <= 0) return null;

  const allocatedUnits = creditsToUnits(monthlyCredits);
  const idempotencyKey = `jit_credit_${contract.id}_${periodStart}`;

  // Check idempotency
  const existingLedger = await checkIdempotency(client, 'B2BMediaCreditLedger', idempotencyKey);
  if (existingLedger) return null;

  // Create period
  const period = await client.entities.B2BMediaCreditPeriod.create({
    organization_id: org.id,
    contract_id: contract.id,
    contract_version_id: contract.contract_version_id || '',
    period_start: periodStart,
    period_end: periodEnd,
    credits_allocated: monthlyCredits,
    credits_allocated_units: allocatedUnits,
    credits_available_units: allocatedUnits,
    credits_reserved_units: 0,
    credits_consumed_units: 0,
    credits_expired_units: 0,
    credits_adjusted_units: 0,
    status: 'active',
    config_version: lockedSnapshots.media_credit.version,
    created_at: new Date().toISOString(),
  });

  // Create allocation ledger event
  const ledger = await client.entities.B2BMediaCreditLedger.create({
    organization_id: org.id,
    contract_id: contract.id,
    contract_version_id: contract.contract_version_id || '',
    period_id: period.id,
    amount: monthlyCredits,
    amount_units: allocatedUnits,
    balance_before_units: 0,
    balance_after_units: allocatedUnits,
    event_type: 'PERIOD_ALLOCATION',
    reason: `JIT monthly allocation: ${monthlyCredits} credits for ${periodStart} to ${periodEnd}`,
    actor: 'system_jit',
    config_version: lockedSnapshots.media_credit.version,
    idempotency_key: idempotencyKey,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BMediaCreditPeriod.update(period.id, {
    allocation_ledger_id: ledger.id,
    credits_remaining: unitsToCredits(allocatedUnits),
    credits_used: 0,
    credits_expired: 0,
  });

  return period;
}

/**
 * Just-in-time capacity period allocation.
 */
async function jitAllocateCapacityPeriod(
  client: any,
  org: any,
  contract: any,
  lockedSnapshots: LockedConfigSnapshots | null
): Promise<any> {
  if (!lockedSnapshots) return null;

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  // Concurrency check
  const existing = await client.entities.B2BReservedCapacityPeriod.filter({
    organization_id: org.id, contract_id: contract.id,
    period_start: periodStart, period_end: periodEnd,
  });
  if (existing.length > 0) return existing[0];

  // Get capacity config from locked snapshots
  const capacityConfig = lockedSnapshots.reserved_capacity.snapshot;
  const standard = org.capacity_entitlement?.production_standard || 'essentials';
  const contractedShoots = org.capacity_entitlement?.contracted_shoots || 40;

  if (contractedShoots <= 0) return null;

  const idempotencyKey = `jit_capacity_${contract.id}_${periodStart}`;

  // Check idempotency
  const existingLedger = await checkIdempotency(client, 'B2BReservedCapacityLedger', idempotencyKey);
  if (existingLedger) return null;

  // Create period
  const period = await client.entities.B2BReservedCapacityPeriod.create({
    organization_id: org.id,
    contract_id: contract.id,
    contract_version_id: contract.contract_version_id || '',
    production_standard: standard,
    contracted_shoots: contractedShoots,
    available_shoots: contractedShoots,
    reserved_shoots: 0,
    consumed_shoots: 0,
    expired_shoots: 0,
    adjusted_shoots: 0,
    overage_shoots: 0,
    period_start: periodStart,
    period_end: periodEnd,
    status: 'active',
    config_version: lockedSnapshots.reserved_capacity.version,
    created_at: new Date().toISOString(),
  });

  // Create allocation ledger event
  const ledger = await client.entities.B2BReservedCapacityLedger.create({
    organization_id: org.id,
    contract_id: contract.id,
    contract_version_id: contract.contract_version_id || '',
    period_id: period.id,
    amount: contractedShoots,
    balance_before: 0,
    balance_after: contractedShoots,
    event_type: 'PERIOD_ALLOCATION',
    reason: `JIT monthly allocation: ${contractedShoots} shoots for ${periodStart} to ${periodEnd}`,
    actor: 'system_jit',
    config_version: lockedSnapshots.reserved_capacity.version,
    idempotency_key: idempotencyKey,
    timestamp: new Date().toISOString(),
  });

  await client.entities.B2BReservedCapacityPeriod.update(period.id, {
    allocation_ledger_id: ledger.id,
  });

  return period;
}