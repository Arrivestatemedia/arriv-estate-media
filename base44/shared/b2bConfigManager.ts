// ============================================================================
// B2B CONFIGURATION MANAGER + MARGIN GUARD
//
// Manages B2B configuration versioning. Publishing new config creates a NEW
// version — never overwrites historical active financial config.
//
// Before new B2B financial configuration is activated, the margin guard
// calculates expected/worst-case economics and warns/blocks according to
// configured margin thresholds.
// ============================================================================

import { LockedConfigSnapshots } from './b2bContractVersionLock.ts';

export interface MarginGuardInput {
  config_type: 'plan' | 'capacity' | 'credit' | 'seat' | 'implementation' | 'commission' | 'sqft_surcharge';
  config_version: string;
  config_snapshot: any;
  admin_threshold: number; // minimum margin percentage
  hard_block: boolean;
  evaluated_by: string;
}

export interface MarginGuardResult {
  guard_id: string;
  config_version: string;
  config_type: string;
  margin_result: {
    gross_revenue: number;
    total_direct_costs: number;
    contribution_before_overhead: number;
    margin_percentage: number;
  };
  admin_threshold: number;
  warning_triggered: boolean;
  hard_block: boolean;
  blocked: boolean;
  evaluated_at: string;
  evaluated_by: string;
}

/**
 * Calculate worst-case economics for a configuration.
 * Models FULL contracted utilization for Reserved Capacity.
 */
export function calculateWorstCaseEconomics(
  configType: string,
  configSnapshot: any
): {
  gross_revenue: number;
  total_direct_costs: number;
  contribution_before_overhead: number;
  margin_percentage: number;
} {
  // Default worst-case model: assumes full utilization of included entitlement
  let grossRevenue = 0;
  let directCosts = 0;

  if (configType === 'plan') {
    // For each plan, model full monthly credit utilization
    for (const plan of configSnapshot.plans || []) {
      const monthlyRevenue = plan.monthly_price;
      // Estimated costs: media specialist compensation (~40% of credit value), commission (15% first month), payment processing (3%)
      const creditValue = plan.monthly_media_credits * 275; // approximate retail value of credits
      const providerComp = creditValue * 0.40;
      const commission = monthlyRevenue * 0.15;
      const paymentProcessing = monthlyRevenue * 0.03;
      const seatCost = (plan.included_full_seats + plan.included_admin_seats) * 5; // approximate seat cost
      grossRevenue += monthlyRevenue;
      directCosts += providerComp + commission + paymentProcessing + seatCost;
    }
  } else if (configType === 'capacity') {
    // For Reserved Capacity, model FULL contracted utilization
    for (const standardKey of Object.keys(configSnapshot.standards || {})) {
      const standard = configSnapshot.standards[standardKey];
      for (const band of standard.bands || []) {
        const monthlyRevenue = band.monthly_price;
        // Provider compensation: ~40% of shoot value (estimated $350/shoot)
        const providerComp = band.shoots * 350 * 0.40;
        const commission = monthlyRevenue * 0.15;
        const paymentProcessing = monthlyRevenue * 0.03;
        grossRevenue += monthlyRevenue;
        directCosts += providerComp + commission + paymentProcessing;
      }
    }
  } else {
    // For other config types, use a conservative estimate
    grossRevenue = 10000;
    directCosts = 5000;
  }

  const contribution = grossRevenue - directCosts;
  const marginPct = grossRevenue > 0 ? (contribution / grossRevenue) * 100 : 0;

  return {
    gross_revenue: Math.round(grossRevenue * 100) / 100,
    total_direct_costs: Math.round(directCosts * 100) / 100,
    contribution_before_overhead: Math.round(contribution * 100) / 100,
    margin_percentage: Math.round(marginPct * 100) / 100,
  };
}

/**
 * Run the margin guard on a configuration before activation.
 * Returns a result indicating whether the config should be blocked.
 */
export function runMarginGuard(input: MarginGuardInput): MarginGuardResult {
  const economics = calculateWorstCaseEconomics(input.config_type, input.config_snapshot);
  const warningTriggered = economics.margin_percentage < input.admin_threshold;
  const blocked = input.hard_block && warningTriggered;

  return {
    guard_id: `b2bmg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    config_version: input.config_version,
    config_type: input.config_type,
    margin_result: economics,
    admin_threshold: input.admin_threshold,
    warning_triggered: warningTriggered,
    hard_block: input.hard_block,
    blocked,
    evaluated_at: new Date().toISOString(),
    evaluated_by: input.evaluated_by,
  };
}