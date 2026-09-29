// ============================================================================
// B2B CONTRACT VERSION LOCK
//
// Builds and retrieves complete immutable configuration snapshots for a
// signed B2B contract version. A signed contract must NEVER depend on the
// current mutable value of a financial configuration.
//
// For EVERY governing configuration we preserve:
//   1. configuration record ID
//   2. configuration version/version number
//   3. complete immutable configuration snapshot (parsed JSON)
//
// Runtime calculations for an existing signed contract use these locked
// snapshots, NOT the current active configuration.
// ============================================================================

import { creditsToUnits } from './b2bCreditUnits.ts';

export interface LockedConfigEntry {
  config_id: string;
  version: string;
  snapshot: any;
}

export interface LockedConfigSnapshots {
  plan: LockedConfigEntry;
  media_credit: LockedConfigEntry;
  reserved_capacity: LockedConfigEntry;
  seats: LockedConfigEntry;
  implementation: LockedConfigEntry;
  sqft_surcharge: LockedConfigEntry;
  commission: LockedConfigEntry;
}

/**
 * Load all 7 active governing configs and build complete immutable snapshots.
 * This is called at contract signing time to create B2BContractVersion.locked_config_snapshots.
 */
export async function buildLockedConfigSnapshots(client: any): Promise<LockedConfigSnapshots> {
  const [plans, credits, capacities, seats, impls, surcharges, commissions] = await Promise.all([
    client.entities.B2BPlanConfig.filter({ is_active: true }),
    client.entities.B2BMediaCreditConfig.filter({ is_active: true }),
    client.entities.B2BReservedCapacityConfig.filter({ is_active: true }),
    client.entities.B2BSeatConfig.filter({ is_active: true }),
    client.entities.B2BImplementationConfig.filter({ is_active: true }),
    client.entities.B2BSqftSurchargeConfig.filter({ is_active: true }),
    client.entities.B2BCommissionPlan.filter({ is_active: true }),
  ]);

  const plan = plans[0];
  const credit = credits[0];
  const capacity = capacities[0];
  const seat = seats[0];
  const impl = impls[0];
  const surcharge = surcharges[0];
  const commission = commissions[0];

  if (!plan || !credit || !capacity || !seat || !impl || !surcharge || !commission) {
    throw new Error('Missing one or more active B2B config records');
  }

  return {
    plan: { config_id: plan.id, version: plan.config_version, snapshot: JSON.parse(plan.config_json) },
    media_credit: { config_id: credit.id, version: credit.config_version, snapshot: JSON.parse(credit.config_json) },
    reserved_capacity: { config_id: capacity.id, version: capacity.config_version, snapshot: JSON.parse(capacity.config_json) },
    seats: { config_id: seat.id, version: seat.config_version, snapshot: JSON.parse(seat.config_json) },
    implementation: { config_id: impl.id, version: impl.config_version, snapshot: JSON.parse(impl.config_json) },
    sqft_surcharge: { config_id: surcharge.id, version: surcharge.config_version, snapshot: JSON.parse(surcharge.config_json) },
    commission: { config_id: commission.id, version: commission.config_version, snapshot: JSON.parse(commission.config_json) },
  };
}

/**
 * Retrieve locked config snapshots from a B2BContractVersion.
 * Falls back to building from active configs if not yet locked (migration safety).
 */
export async function getLockedConfigSnapshots(client: any, contractVersionId: string): Promise<LockedConfigSnapshots> {
  const version = await client.entities.B2BContractVersion.get(contractVersionId);
  if (!version) throw new Error(`B2BContractVersion not found: ${contractVersionId}`);

  if (version.locked_config_snapshots) {
    return JSON.parse(version.locked_config_snapshots);
  }

  // Fallback: build from active configs (for contracts locked before this field existed)
  return buildLockedConfigSnapshots(client);
}

/**
 * Get the monthly media credit allocation for a plan from the locked plan snapshot.
 */
export function getPlanMonthlyCredits(lockedSnapshots: LockedConfigSnapshots, planId: string): number {
  const plan = lockedSnapshots.plan.snapshot.plans.find((p: any) => p.plan_id === planId);
  return plan?.monthly_media_credits || 0;
}

/**
 * Determine the funding mode for a contract type.
 */
export function getFundingMode(contractType: string): 'media_credit' | 'reserved_capacity' | 'custom' {
  if (contractType === 'reserved_capacity') return 'reserved_capacity';
  if (contractType === 'custom_enterprise') return 'custom';
  return 'media_credit';
}