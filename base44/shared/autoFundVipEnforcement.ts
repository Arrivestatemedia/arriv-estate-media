// ============================================================================
// ARRIV AUTO-FUND — VIP PROMOTIONAL-CREDIT ENFORCEMENT
// ============================================================================
// Enforced at the AUTHORITATIVE booking/payment layer, not in the interface.
//
// The approved VIP rule:
//   • VIP CASH-FUNDED Booking Value may buy unlimited standalone MLS Walkthroughs.
//   • VIP PROMOTIONAL Booking Value may NOT buy a standalone MLS Walkthrough.
//   • VIP promotional value REMAINS eligible for photography, video, premium
//     packages and qualifying genuine bundles.
//   • No monthly booking-count cap is applied — promotion is barred by SERVICE,
//     never by count.
//
// Promotional value is issued as its own credit lot (source 'promotional'), so the
// promotional portion of a wallet balance is distinguishable at redemption. The
// test is conservative: an application is refused when it would necessarily draw
// on promotional value, which is whenever the amount applied exceeds the
// non-promotional balance available. Cash-funded value is never restricted.
//
// Because this runs on the booking submission itself, the rule cannot be bypassed
// by a direct API call, a booking edit, a price change, or a UI change.
// ============================================================================

import { AUTOFUND_FINAL_FLAGS } from './autoFundFinalConfig.ts';

export const MLS_WALKTHROUGH_PACKAGE_ID = 'mls_walkthrough';
export const PROMOTIONAL_LOT_SOURCE = 'promotional';
export const VIP_TIER_AMOUNT = 1000;

export interface VipRedemptionDecision {
  allowed: boolean;
  code?: string;
  reason?: string;
  is_vip?: boolean;
  applied_cents?: number;
  promotional_remaining_cents?: number;
  cash_funded_remaining_cents?: number;
  cash_funded_usable_cents?: number;
}

/**
 * Decide whether a wallet application is permitted on this booking.
 * Fails OPEN while the restriction flag is off, so production is unchanged.
 */
export async function assertVipWalletRedemption({
  base44,
  wallet_id,
  customer_id,
  applied_cents,
  package_id,
}: {
  base44: any;
  wallet_id?: string;
  customer_id?: string;
  applied_cents: number;
  package_id?: string;
}): Promise<VipRedemptionDecision> {
  const applied = Math.max(0, Math.round(applied_cents || 0));

  // ── Production unchanged while the approved restriction is switched off ───
  if (!AUTOFUND_FINAL_FLAGS.vip_mls_promo_restriction_enabled) {
    return { allowed: true, code: 'RESTRICTION_INACTIVE', applied_cents: applied };
  }

  // ── Only a standalone MLS Walkthrough is restricted. Photography, video,
  //    premium packages and bundles keep full promotional access. ───────────
  if (package_id !== MLS_WALKTHROUGH_PACKAGE_ID) {
    return { allowed: true, code: 'SERVICE_ELIGIBLE', applied_cents: applied };
  }

  if (applied === 0 || !wallet_id) {
    return { allowed: true, code: 'NO_WALLET_APPLIED', applied_cents: applied };
  }

  // ── Identify the wallet's owner, then confirm a VIP membership ────────────
  let ownerId = customer_id || '';
  let lotsRes: any = [];
  try {
    const walletsRes = await base44.entities.PrepaidWallet.filter({ id: wallet_id }, undefined, 1);
    const wallets = Array.isArray(walletsRes) ? walletsRes : (walletsRes?.data || []);
    if (wallets.length > 0) ownerId = wallets[0].customer_id || ownerId;
  } catch { /* fall through — no VIP determination means no restriction */ }

  if (!ownerId) {
    return { allowed: true, code: 'NO_VIP_MEMBERSHIP_FOUND', applied_cents: applied };
  }

  let isVip = false;
  try {
    const subsRes = await base44.entities.AutoFundSubscription.filter(
      { customer_id: ownerId, amount: VIP_TIER_AMOUNT, status: { $in: ['active', 'paused'] } },
      undefined,
      1
    );
    const subs = Array.isArray(subsRes) ? subsRes : (subsRes?.data || []);
    isVip = subs.length > 0;
  } catch { /* leave isVip false */ }

  if (!isVip) {
    return { allowed: true, code: 'NOT_VIP_TIER', is_vip: false, applied_cents: applied };
  }

  // ── Split the wallet balance into promotional and cash-funded value ───────
  try {
    lotsRes = await base44.entities.CreditLot.filter({ wallet_id }, undefined, 200);
  } catch { lotsRes = []; }
  const lots = Array.isArray(lotsRes) ? lotsRes : (lotsRes?.data || []);

  let promotionalCents = 0;
  let totalCents = 0;
  for (const lot of lots) {
    if (lot.expired) continue;
    const remaining = lot.booking_value_remaining_cents ?? 0;
    if (remaining <= 0) continue;
    totalCents += remaining;
    if (lot.source === PROMOTIONAL_LOT_SOURCE) promotionalCents += remaining;
  }
  const cashCents = Math.max(0, totalCents - promotionalCents);

  // Refuse only when the application necessarily draws on promotional value.
  if (promotionalCents > 0 && applied > cashCents) {
    return {
      allowed: false,
      code: 'VIP_PROMOTIONAL_BLOCKED_STANDALONE_MLS',
      reason:
        `Your promotional Booking Value cannot be used on a standalone MLS Walkthrough. ` +
        `$${(cashCents / 100).toFixed(2)} of cash-funded Booking Value is available for this walkthrough, ` +
        `and $${(promotionalCents / 100).toFixed(2)} of promotional value is reserved for photography, video, ` +
        `premium packages or a qualifying bundle. Add funds or pay directly to book this walkthrough.`,
      is_vip: true,
      applied_cents: applied,
      promotional_remaining_cents: promotionalCents,
      cash_funded_remaining_cents: cashCents,
      cash_funded_usable_cents: cashCents,
    };
  }

  return {
    allowed: true,
    code: 'VIP_CASH_FUNDED_OK',
    is_vip: true,
    applied_cents: applied,
    promotional_remaining_cents: promotionalCents,
    cash_funded_remaining_cents: cashCents,
    cash_funded_usable_cents: cashCents,
  };
}

/** The promotional / cash-funded split of a wallet, for disclosure and testing. */
export async function describeVipWalletSplit({ base44, wallet_id }: { base44: any; wallet_id: string }) {
  let lots: any[] = [];
  try {
    const res = await base44.entities.CreditLot.filter({ wallet_id }, undefined, 200);
    lots = Array.isArray(res) ? res : (res?.data || []);
  } catch { lots = []; }

  let promotionalCents = 0;
  let totalCents = 0;
  for (const lot of lots) {
    if (lot.expired) continue;
    const remaining = lot.booking_value_remaining_cents ?? 0;
    if (remaining <= 0) continue;
    totalCents += remaining;
    if (lot.source === PROMOTIONAL_LOT_SOURCE) promotionalCents += remaining;
  }
  return {
    promotional_cents: promotionalCents,
    cash_funded_cents: Math.max(0, totalCents - promotionalCents),
    total_cents: totalCents,
    standalone_mls_usable_cents: Math.max(0, totalCents - promotionalCents),
  };
}