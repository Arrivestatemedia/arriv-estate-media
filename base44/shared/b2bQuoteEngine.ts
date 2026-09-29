// ============================================================================
// B2B QUOTE ENGINE
//
// Builds versioned B2B quotes. Quotes are immutable once created — changing
// a quote creates a new version. Accepted/signed economics are preserved.
//
// Supports:
//   - Business / Portfolio / Developer / Enterprise plans
//   - Reserved Media Capacity (essentials/cinematic/premium × 40/60/100)
//   - Monthly and annual prepaid billing
//   - Seats (included + additional)
//   - Implementation (base + deployment band)
//   - Approved commercial adjustments
//   - Contract term
//   - Retail comparison and estimated savings
// ============================================================================

import { LockedConfigSnapshots } from './b2bContractVersionLock.ts';

export interface QuoteInput {
  plan_id: string;
  contract_type: 'business' | 'portfolio' | 'developer' | 'enterprise' | 'reserved_capacity' | 'custom_enterprise';
  billing_frequency: 'monthly' | 'annual_prepaid';
  term_months: number;
  production_standard?: 'essentials' | 'cinematic' | 'premium';
  contracted_shoots?: number;
  additional_full_seats: number;
  additional_admin_seats: number;
  booking_only_seats: number;
  initial_user_count: number;
  approved_adjustments?: { description: string; amount: number }[];
}

export interface QuoteResult {
  plan_name: string;
  plan_id: string;
  contract_type: string;
  billing_frequency: string;
  term_months: number;

  // Base pricing
  monthly_price: number;
  annual_prepaid_price: number;
  effective_monthly: number;
  effective_annual: number;

  // Implementation
  base_implementation_fee: number;
  deployment_fee: number;
  total_implementation: number;

  // Seats
  included_full_seats: number;
  included_admin_seats: number;
  additional_full_seat_monthly: number;
  additional_admin_seat_monthly: number;
  booking_only_seat_monthly: number;
  monthly_seat_charges: number;
  annual_seat_charges: number;

  // Entitlement
  monthly_media_credits: number;
  capacity_standard: string | null;
  contracted_shoots: number | null;

  // Total
  first_year_total: number;
  monthly_recurring: number;

  // Retail comparison
  retail_comparison_monthly: number;
  estimated_monthly_savings: number;
  estimated_annual_savings: number;

  // Adjustments
  approved_adjustments: { description: string; amount: number }[];

  // Config versions
  config_versions: {
    plan: string;
    capacity: string;
    credit: string;
    seat: string;
    implementation: string;
    sqft_surcharge: string;
    commission: string;
  };
}

export function buildQuote(
  lockedSnapshots: LockedConfigSnapshots,
  input: QuoteInput
): QuoteResult {
  const planConfig = lockedSnapshots.plan.snapshot;
  const seatConfig = lockedSnapshots.seats.snapshot;
  const implConfig = lockedSnapshots.implementation.snapshot;
  const capacityConfig = lockedSnapshots.reserved_capacity.snapshot;

  if (input.contract_type === 'reserved_capacity') {
    return buildCapacityQuote(lockedSnapshots, input);
  }

  const plan = planConfig.plans.find((p: any) => p.plan_id === input.plan_id);
  if (!plan) throw new Error(`Plan not found: ${input.plan_id}`);

  const monthlyPrice = plan.monthly_price;
  const annualPrepaidPrice = plan.annual_prepaid_price;
  const effectiveMonthly = input.billing_frequency === 'annual_prepaid'
    ? annualPrepaidPrice / 12
    : monthlyPrice;
  const effectiveAnnual = input.billing_frequency === 'annual_prepaid'
    ? annualPrepaidPrice
    : monthlyPrice * 12;

  // Implementation
  const baseImplFee = plan.base_implementation_fee;
  const deploymentBand = implConfig.deployment_bands.find((b: any) =>
    input.initial_user_count >= b.min_users && (b.max_users === null || input.initial_user_count <= b.max_users)
  ) || implConfig.deployment_bands[0];
  const deploymentFee = deploymentBand?.additional_fee || 0;
  const totalImpl = baseImplFee + deploymentFee;

  // Seat charges
  const monthlySeatCharges =
    (input.additional_full_seats * seatConfig.additional_full_seat_monthly) +
    (input.additional_admin_seats * seatConfig.additional_admin_seat_monthly) +
    (input.booking_only_seats * seatConfig.booking_only_seat_monthly);
  const annualSeatCharges = monthlySeatCharges * 12;

  // Total first year
  const firstYearTotal = effectiveAnnual + totalImpl + annualSeatCharges;
  const monthlyRecurring = effectiveMonthly + monthlySeatCharges;

  // Retail comparison (rough estimate: retail average $400/shoot × monthly_credits)
  const retailComparisonMonthly = plan.monthly_media_credits * 400;
  const estimatedMonthlySavings = Math.max(0, retailComparisonMonthly - monthlyRecurring);
  const estimatedAnnualSavings = estimatedMonthlySavings * 12;

  // Approved adjustments
  const adjustments = input.approved_adjustments || [];

  return {
    plan_name: plan.display_name,
    plan_id: plan.plan_id,
    contract_type: input.contract_type,
    billing_frequency: input.billing_frequency,
    term_months: input.term_months,
    monthly_price: monthlyPrice,
    annual_prepaid_price: annualPrepaidPrice,
    effective_monthly: Math.round(effectiveMonthly * 100) / 100,
    effective_annual: effectiveAnnual,
    base_implementation_fee: baseImplFee,
    deployment_fee: deploymentFee,
    total_implementation: totalImpl,
    included_full_seats: plan.included_full_seats,
    included_admin_seats: plan.included_admin_seats,
    additional_full_seat_monthly: seatConfig.additional_full_seat_monthly,
    additional_admin_seat_monthly: seatConfig.additional_admin_seat_monthly,
    booking_only_seat_monthly: seatConfig.booking_only_seat_monthly,
    monthly_seat_charges: monthlySeatCharges,
    annual_seat_charges: annualSeatCharges,
    monthly_media_credits: plan.monthly_media_credits,
    capacity_standard: null,
    contracted_shoots: null,
    first_year_total: Math.round(firstYearTotal * 100) / 100,
    monthly_recurring: Math.round(monthlyRecurring * 100) / 100,
    retail_comparison_monthly: retailComparisonMonthly,
    estimated_monthly_savings: Math.round(estimatedMonthlySavings * 100) / 100,
    estimated_annual_savings: Math.round(estimatedAnnualSavings * 100) / 100,
    approved_adjustments: adjustments,
    config_versions: {
      plan: lockedSnapshots.plan.version,
      capacity: lockedSnapshots.reserved_capacity.version,
      credit: lockedSnapshots.media_credit.version,
      seat: lockedSnapshots.seats.version,
      implementation: lockedSnapshots.implementation.version,
      sqft_surcharge: lockedSnapshots.sqft_surcharge.version,
      commission: lockedSnapshots.commission.version,
    },
  };
}

function buildCapacityQuote(
  lockedSnapshots: LockedConfigSnapshots,
  input: QuoteInput
): QuoteResult {
  const capacityConfig = lockedSnapshots.reserved_capacity.snapshot;
  const seatConfig = lockedSnapshots.seats.snapshot;
  const implConfig = lockedSnapshots.implementation.snapshot;

  const standard = capacityConfig.standards[input.production_standard || 'essentials'];
  const band = standard.bands.find((b: any) => b.shoots === input.contracted_shoots) || standard.bands[0];

  const monthlyPrice = band.monthly_price;
  const annualPrepaidPrice = Math.round(monthlyPrice * 12 * (1 - capacityConfig.annual_prepay_discount) * 100) / 100;
  const effectiveMonthly = input.billing_frequency === 'annual_prepaid'
    ? annualPrepaidPrice / 12
    : monthlyPrice;
  const effectiveAnnual = input.billing_frequency === 'annual_prepaid'
    ? annualPrepaidPrice
    : monthlyPrice * 12;

  const baseImplFee = capacityConfig.base_implementation_fee || 5000;
  const deploymentBand = implConfig.deployment_bands.find((b: any) =>
    input.initial_user_count >= b.min_users && (b.max_users === null || input.initial_user_count <= b.max_users)
  ) || implConfig.deployment_bands[0];
  const deploymentFee = deploymentBand?.additional_fee || 0;
  const totalImpl = baseImplFee + deploymentFee;

  const monthlySeatCharges =
    (input.additional_full_seats * seatConfig.additional_full_seat_monthly) +
    (input.additional_admin_seats * seatConfig.additional_admin_seat_monthly) +
    (input.booking_only_seats * seatConfig.booking_only_seat_monthly);
  const annualSeatCharges = monthlySeatCharges * 12;

  const firstYearTotal = effectiveAnnual + totalImpl + annualSeatCharges;
  const monthlyRecurring = effectiveMonthly + monthlySeatCharges;

  const retailComparisonMonthly = input.contracted_shoots * 400;
  const estimatedMonthlySavings = Math.max(0, retailComparisonMonthly - monthlyRecurring);
  const estimatedAnnualSavings = estimatedMonthlySavings * 12;

  return {
    plan_name: `${standard.display_name} — ${input.contracted_shoots} shoots`,
    plan_id: 'reserved_capacity',
    contract_type: input.contract_type,
    billing_frequency: input.billing_frequency,
    term_months: input.term_months,
    monthly_price: monthlyPrice,
    annual_prepaid_price: annualPrepaidPrice,
    effective_monthly: Math.round(effectiveMonthly * 100) / 100,
    effective_annual: effectiveAnnual,
    base_implementation_fee: baseImplFee,
    deployment_fee: deploymentFee,
    total_implementation: totalImpl,
    included_full_seats: capacityConfig.included_full_seats || 100,
    included_admin_seats: capacityConfig.included_admin_seats || 15,
    additional_full_seat_monthly: seatConfig.additional_full_seat_monthly,
    additional_admin_seat_monthly: seatConfig.additional_admin_seat_monthly,
    booking_only_seat_monthly: seatConfig.booking_only_seat_monthly,
    monthly_seat_charges: monthlySeatCharges,
    annual_seat_charges: annualSeatCharges,
    monthly_media_credits: 0,
    capacity_standard: input.production_standard || 'essentials',
    contracted_shoots: input.contracted_shoots || band.shoots,
    first_year_total: Math.round(firstYearTotal * 100) / 100,
    monthly_recurring: Math.round(monthlyRecurring * 100) / 100,
    retail_comparison_monthly: retailComparisonMonthly,
    estimated_monthly_savings: Math.round(estimatedMonthlySavings * 100) / 100,
    estimated_annual_savings: Math.round(estimatedAnnualSavings * 100) / 100,
    approved_adjustments: input.approved_adjustments || [],
    config_versions: {
      plan: lockedSnapshots.plan.version,
      capacity: lockedSnapshots.reserved_capacity.version,
      credit: lockedSnapshots.media_credit.version,
      seat: lockedSnapshots.seats.version,
      implementation: lockedSnapshots.implementation.version,
      sqft_surcharge: lockedSnapshots.sqft_surcharge.version,
      commission: lockedSnapshots.commission.version,
    },
  };
}