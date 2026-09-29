// ============================================================================
// B2B GOVERNING CONTRACT RESOLVER
//
// Deterministic governing-contract resolution for a B2B organization.
// There must be ONE governing commercial relationship for booking resolution.
//
// Rules:
//   1. Only contracts in CONSUMPTION_ALLOWED_STATES can govern
//   2. If multiple qualifying contracts exist, FAIL CLOSED (ambiguous authority)
//   3. Expansions add economics but do not create competing commercial authority
//   4. A renewal supersedes its parent contract
//
// This replaces the previous "first active contract" heuristic.
// ============================================================================

import { LockedConfigSnapshots, getLockedConfigSnapshots } from './b2bContractVersionLock.ts';

const CONSUMPTION_ALLOWED_STATES = ['active', 'live', 'implementing'];

export interface GoverningContractResult {
  contract: any;
  organization: any;
  locked_snapshots: LockedConfigSnapshots | null;
  funding_mode: 'media_credit' | 'reserved_capacity' | 'custom';
  is_governing: boolean;
  ambiguous: boolean;
  reason: string;
}

/**
 * Resolve the single governing B2B contract for an organization.
 * Fails closed if multiple qualifying contracts create ambiguous authority.
 */
export async function resolveB2BGoverningContract(
  client: any,
  organizationId: string
): Promise<GoverningContractResult> {
  // Load organization
  let org: any = null;
  try { org = await client.entities.B2BOrganization.get(organizationId); } catch {}
  if (!org) {
    return { contract: null, organization: null, locked_snapshots: null, funding_mode: 'media_credit', is_governing: false, ambiguous: false, reason: 'ORGANIZATION_NOT_FOUND' };
  }

  // Load all contracts for this organization
  const allContracts = await client.entities.B2BContract.filter({ organization_id: organizationId });

  // Separate by kind: initial/renewal contracts vs expansion contracts
  // Expansions add economics but do not compete for governing authority
  const initialContracts = allContracts.filter(c =>
    (c.contract_kind === 'initial' || c.contract_kind === 'renewal' || !c.contract_kind) &&
    c.status !== 'cancelled' && c.status !== 'terminated' && c.status !== 'expired'
  );

  // Among initial/renewal contracts, find those in consumption-allowed states
  const qualifying = initialContracts.filter(c => CONSUMPTION_ALLOWED_STATES.includes(c.status));

  if (qualifying.length === 0) {
    // No active governing contract — check if any non-active contract exists
    const anyNonCancelled = allContracts.filter(c => c.status !== 'cancelled' && c.status !== 'terminated');
    return {
      contract: anyNonCancelled[0] || null,
      organization: org,
      locked_snapshots: null,
      funding_mode: 'media_credit',
      is_governing: false,
      ambiguous: false,
      reason: anyNonCancelled.length > 0 ? `CONTRACT_NOT_ACTIVE:${anyNonCancelled[0].status}` : 'NO_CONTRACT',
    };
  }

  // If exactly one qualifying contract, it governs
  if (qualifying.length === 1) {
    const contract = qualifying[0];
    const fundingMode = getFundingModeForType(contract.contract_type);
    let lockedSnapshots: LockedConfigSnapshots | null = null;
    if (contract.contract_version_id) {
      try { lockedSnapshots = await getLockedConfigSnapshots(client, contract.contract_version_id); } catch {}
    }
    return {
      contract,
      organization: org,
      locked_snapshots: lockedSnapshots,
      funding_mode: fundingMode,
      is_governing: true,
      ambiguous: false,
      reason: 'OK',
    };
  }

  // Multiple qualifying contracts — check if one is a renewal that supersedes others
  const renewals = qualifying.filter(c => c.contract_kind === 'renewal');
  const nonRenewals = qualifying.filter(c => c.contract_kind !== 'renewal');

  if (renewals.length === 1 && nonRenewals.length > 0) {
    // A renewal supersedes its parent — check if the renewal's parent is among the qualifying
    const renewal = renewals[0];
    const parentStillActive = nonRenewals.some(c => c.contract_id === renewal.parent_contract_id || c.id === renewal.parent_contract_id);
    if (parentStillActive) {
      // The renewal governs; the parent should have been superseded
      const fundingMode = getFundingModeForType(renewal.contract_type);
      let lockedSnapshots: LockedConfigSnapshots | null = null;
      if (renewal.contract_version_id) {
        try { lockedSnapshots = await getLockedConfigSnapshots(client, renewal.contract_version_id); } catch {}
      }
      return {
        contract: renewal,
        organization: org,
        locked_snapshots: lockedSnapshots,
        funding_mode: fundingMode,
        is_governing: true,
        ambiguous: false,
        reason: 'RENEWAL_GOVERNS',
      };
    }
  }

  // AMBIGUOUS — multiple qualifying contracts with no clear hierarchy
  return {
    contract: qualifying[0],
    organization: org,
    locked_snapshots: null,
    funding_mode: getFundingModeForType(qualifying[0].contract_type),
    is_governing: false,
    ambiguous: true,
    reason: `AMBIGUOUS:${qualifying.length}_qualifying_contracts`,
  };
}

function getFundingModeForType(contractType: string): 'media_credit' | 'reserved_capacity' | 'custom' {
  if (contractType === 'reserved_capacity') return 'reserved_capacity';
  if (contractType === 'custom_enterprise') return 'custom';
  return 'media_credit';
}

/**
 * Check if a contract status allows entitlement consumption.
 */
export function canConsumeWithContractStatus(status: string): boolean {
  return CONSUMPTION_ALLOWED_STATES.includes(status);
}

/**
 * Check if the organization is on hold (suspended for non-payment).
 */
export function isOrganizationOnHold(org: any, contract: any): { on_hold: boolean; reason: string } {
  if (org?.contract_status === 'suspended') {
    return { on_hold: true, reason: 'ORG_SUSPENDED' };
  }
  if (contract?.status === 'suspended') {
    return { on_hold: true, reason: 'CONTRACT_SUSPENDED' };
  }
  if (contract?.status === 'past_due') {
    return { on_hold: true, reason: 'CONTRACT_PAST_DUE' };
  }
  return { on_hold: false, reason: 'OK' };
}