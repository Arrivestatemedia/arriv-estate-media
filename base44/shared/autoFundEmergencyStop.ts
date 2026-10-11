// ============================================================================
// ARRIV AUTO-FUND — EMERGENCY STOP (DATA-LEVEL, INSTANT, NO PUBLISH REQUIRED)
// ============================================================================
// A launch-safety control the owner can operate instantly, without a code deploy.
// While the stop is active, Auto-Fund STOPS TAKING NEW MONEY IN:
//   • new enrollment (every channel)
//   • new membership-fee billing
//   • new wallet-funding issuance
//
// It deliberately does NOT block what would harm customers if it did:
//   • cancellation and pause/resume
//   • redemption and service access
//   • refunds, dispute handling and account corrections
//   • member support
//
// Absent, or anything other than 'true', means the stop is INACTIVE — so the
// default state matches today's behaviour exactly. Certification runs bypass it,
// so an isolated suite can still exercise the gated paths while the stop is on.
// ============================================================================

export const AUTOFUND_EMERGENCY_STOP_KEY = 'autofund_emergency_stop';

export const EMERGENCY_STOP_CODE = 'EMERGENCY_STOP_ACTIVE';

export const EMERGENCY_STOP_SEMANTICS = {
  switch_key: AUTOFUND_EMERGENCY_STOP_KEY,
  blocks: ['new_enrollment_all_channels', 'new_membership_fee_billing', 'new_wallet_funding_issuance'],
  does_not_block: [
    'cancellation',
    'pause_and_resume',
    'redemption_and_service_access',
    'refunds_and_dispute_handling',
    'member_support',
  ],
  certification_runs_bypass: true,
  default_when_absent: 'inactive',
} as const;

/** Read the stop. Any read failure resolves to INACTIVE, never to a false stop. */
export async function isAutoFundEmergencyStopped(base44: any): Promise<boolean> {
  try {
    const res = await base44.entities.AppSetting.filter({ key: AUTOFUND_EMERGENCY_STOP_KEY }, undefined, 1);
    const rows = Array.isArray(res) ? res : (res?.data || res?.items || []);
    return rows.length > 0 && String(rows[0].value) === 'true';
  } catch {
    return false;
  }
}

/** Refusal payload for a blocked operation, shaped like the existing early returns. */
export function emergencyStopRefusal(operation: string, extra: Record<string, any> = {}) {
  return {
    status: 'refused',
    error: `Auto-Fund emergency stop is active: ${operation} is suspended. Cancellation, redemptions, refunds and member support remain available.`,
    error_code: EMERGENCY_STOP_CODE,
    retryable: true,
    ...extra,
  };
}