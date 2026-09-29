// ============================================================================
// B2B COMMISSION ENGINE
//
// Completely separate from retail sales commission calculation.
// B2B commission events are based on actual payment eligibility, not quotes.
//
// Commission types:
//   1. Implementation commission: 60% of collected implementation revenue
//   2. Recurring monthly: 15% first month, 8% months 2-12, 5% month 13+
//   3. Annual close bonus: 1.5% (monthly) or 3% (annual prepaid), cap $7,500
//   4. Renewal bonus: 1% of renewed ACV, cap $2,500
//   5. Expansion: independent 15% → 8% → 5% lifecycle tranche
//
// Rep departure: future recurring stops, no buyout, vested amounts preserved.
// ============================================================================

import { LockedConfigSnapshots } from './b2bContractVersionLock.ts';

export interface CommissionConfig {
  implementation_commission_rate: number;
  recurring: {
    first_month_rate: number;
    months_2_12_rate: number;
    month_13_plus_rate: number;
  };
  annual_close_bonus: {
    month_to_month_rate: number;
    twelve_month_billed_monthly_rate: number;
    annual_prepaid_rate: number;
    cap: number;
  };
  renewal_bonus: {
    rate: number;
    cap: number;
  };
  expansion: {
    first_month_rate: number;
    months_2_12_rate: number;
    month_13_plus_rate: number;
  };
  rep_departure: {
    future_recurring_stops: boolean;
    no_buyout: boolean;
    vested_amounts_preserved: boolean;
  };
}

export function getCommissionConfig(lockedSnapshots: LockedConfigSnapshots): CommissionConfig {
  return lockedSnapshots.commission.snapshot as unknown as CommissionConfig;
}

/**
 * Calculate the implementation commission.
 * 60% of collected implementation revenue.
 * Only created when implementation payment is confirmed.
 */
export function calculateImplementationCommission(
  config: CommissionConfig,
  implementationRevenue: number
): { amount: number; rate: number; basis: number } {
  const amount = Math.round(implementationRevenue * config.implementation_commission_rate * 100) / 100;
  return { amount, rate: config.implementation_commission_rate, basis: implementationRevenue };
}

/**
 * Determine the recurring commission rate based on lifecycle month.
 * Month 1: 15%, Months 2-12: 8%, Month 13+: 5%
 */
export function getRecurringRateForMonth(config: CommissionConfig, lifecycleMonth: number): number {
  if (lifecycleMonth <= 1) return config.recurring.first_month_rate;
  if (lifecycleMonth <= 12) return config.recurring.months_2_12_rate;
  return config.recurring.month_13_plus_rate;
}

/**
 * Calculate a recurring monthly commission event.
 * Based on confirmed qualifying paid recurring billing event.
 */
export function calculateRecurringCommission(
  config: CommissionConfig,
  monthlyBasis: number,
  lifecycleMonth: number
): { amount: number; rate: number; basis: number; lifecycle_month: number } {
  const rate = getRecurringRateForMonth(config, lifecycleMonth);
  const amount = Math.round(monthlyBasis * rate * 100) / 100;
  return { amount, rate, basis: monthlyBasis, lifecycle_month: lifecycleMonth };
}

/**
 * Calculate the annual close bonus.
 * Monthly commitment (12-month billed monthly): 1.5% of first-year contracted value
 * Annual prepaid: 3% of first-year contracted value
 * Cap: $7,500
 */
export function calculateAnnualCloseBonus(
  config: CommissionConfig,
  firstYearContractValue: number,
  billingFrequency: 'monthly' | 'annual_prepaid',
  termMonths: number
): { amount: number; rate: number; basis: number; capped: boolean } {
  let rate = 0;
  if (billingFrequency === 'annual_prepaid') {
    rate = config.annual_close_bonus.annual_prepaid_rate;
  } else if (termMonths >= 12) {
    rate = config.annual_close_bonus.twelve_month_billed_monthly_rate;
  } else {
    rate = config.annual_close_bonus.month_to_month_rate;
  }

  const rawAmount = firstYearContractValue * rate;
  const capped = rawAmount > config.annual_close_bonus.cap;
  const amount = Math.round(Math.min(rawAmount, config.annual_close_bonus.cap) * 100) / 100;
  return { amount, rate, basis: firstYearContractValue, capped };
}

/**
 * Calculate the renewal bonus.
 * 1% of renewed ACV, cap $2,500
 */
export function calculateRenewalBonus(
  config: CommissionConfig,
  renewedAcv: number,
  repActive: boolean
): { amount: number; rate: number; basis: number; capped: boolean; eligible: boolean; reason: string } {
  if (!repActive) {
    return { amount: 0, rate: config.renewal_bonus.rate, basis: renewedAcv, capped: false, eligible: false, reason: 'REP_NOT_ACTIVE' };
  }
  const rawAmount = renewedAcv * config.renewal_bonus.rate;
  const capped = rawAmount > config.renewal_bonus.cap;
  const amount = Math.round(Math.min(rawAmount, config.renewal_bonus.cap) * 100) / 100;
  return { amount, rate: config.renewal_bonus.rate, basis: renewedAcv, capped, eligible: true, reason: 'OK' };
}

/**
 * Calculate an expansion commission event.
 * Expansion receives a NEW independent tranche with its own 15% → 8% → 5% lifecycle.
 * The original tranche's age NEVER restarts.
 */
export function calculateExpansionCommission(
  config: CommissionConfig,
  incrementalMonthlyValue: number,
  lifecycleMonth: number
): { amount: number; rate: number; basis: number; lifecycle_month: number } {
  const rate = lifecycleMonth <= 1 ? config.expansion.first_month_rate
    : lifecycleMonth <= 12 ? config.expansion.months_2_12_rate
    : config.expansion.month_13_plus_rate;
  const amount = Math.round(incrementalMonthlyValue * rate * 100) / 100;
  return { amount, rate, basis: incrementalMonthlyValue, lifecycle_month: lifecycleMonth };
}

/**
 * Advance a tranche's lifecycle month and update its rate.
 * Called monthly when a qualifying recurring payment is confirmed.
 */
export function advanceTrancheLifecycle(
  config: CommissionConfig,
  currentMonth: number,
  monthlyBasis: number,
  trancheKind: 'initial' | 'expansion'
): { new_month: number; new_rate: number; commission_amount: number } {
  const newMonth = currentMonth + 1;
  const rates = trancheKind === 'expansion' ? config.expansion : config.recurring;
  const newRate = newMonth <= 1 ? rates.first_month_rate
    : newMonth <= 12 ? rates.months_2_12_rate
    : rates.month_13_plus_rate;
  const commissionAmount = Math.round(monthlyBasis * newRate * 100) / 100;
  return { new_month: newMonth, new_rate: newRate, commission_amount: commissionAmount };
}

/**
 * Stop a tranche due to rep departure.
 * Future recurring stops. No buyout. Vested amounts preserved.
 */
export function stopTrancheForRepDeparture(): { stopped: boolean; reason: string } {
  return { stopped: true, reason: 'REP_DEPARTURE' };
}