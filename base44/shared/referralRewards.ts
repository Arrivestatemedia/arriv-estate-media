// ============================================================================
// REFERRAL REWARDS — Determines reward amount and type based on Preferred
// membership status. $20 for standard referrers, $40 for Preferred members.
// Only genuine earned referral rewards are cash-eligible.
// ============================================================================

export const STANDARD_REFERRAL_REWARD = 20;
export const PREFERRED_REFERRAL_REWARD = 40;
export const CASH_OUT_MINIMUM = 260;

export type RewardType =
  | "STANDARD_REFERRAL_REWARD"
  | "PREFERRED_REFERRAL_REWARD"
  | "PROMOTIONAL_CREDIT"
  | "SERVICE_RECOVERY_CREDIT"
  | "ADMIN_CREDIT";

export interface RewardResult {
  amount: number; // in DOLLARS
  reward_type: RewardType;
  cash_eligible: boolean;
  is_preferred_referrer: boolean;
}

/** Determine the referral reward based on Preferred membership status. */
export function determineReferralReward(isPreferredReferrer: boolean): RewardResult {
  if (isPreferredReferrer) {
    return {
      amount: PREFERRED_REFERRAL_REWARD,
      reward_type: "PREFERRED_REFERRAL_REWARD",
      cash_eligible: true,
      is_preferred_referrer: true,
    };
  }
  return {
    amount: STANDARD_REFERRAL_REWARD,
    reward_type: "STANDARD_REFERRAL_REWARD",
    cash_eligible: true,
    is_preferred_referrer: false,
  };
}

/** Check if a customer's cash-eligible balance meets the cash-out minimum. */
export function isCashOutEligible(cashEligibleBalance: number): boolean {
  return cashEligibleBalance >= CASH_OUT_MINIMUM;
}