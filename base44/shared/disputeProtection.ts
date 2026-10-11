// ============================================================================
// ARRIV AUTO-FUND — DISPUTE PROTECTION
// ============================================================================
// When a charge is disputed, the value that charge created must be frozen
// immediately. This module implements that with the following properties:
//
//   * ONLY the lots funded by the disputed charge are affected. Unrelated
//     legitimate funds are never touched — if the disputed charge's lots carry
//     no remaining value, nothing is held and that is recorded as such.
//
//   * The hold removes the amount from the wallet's SPENDABLE balance
//     (booking_value_balance_cents) and counts it in dispute_held_cents. The
//     lot's own booking_value_remaining_cents is left untouched, so a won
//     dispute restores the exact amount instead of reconstructing the lot, and
//     no issued/redeemed/expired statistic is rewritten.
//
//   * Every movement is appended to the immutable WalletTransaction ledger. No
//     record is deleted or edited in place.
//
//   * A LOST dispute is a reversal of the held amount, never a silent deletion:
//     the lot is reduced and marked, and the ledger explains why.
//
//   * An evidence packet is assembled automatically on hold.
//
// IMPORTANT ACCOUNTING RULE: creating a commission-reversal event is NOT the
// same as recovering cash. `commission_recovery_confirmed` stays FALSE until
// Arriv Pay explicitly confirms recovery. Nothing in this module ever assumes a
// reversal event equals recovered cash.
// ============================================================================

import { round2, toCents, fromCents, creditsFromCents, generateId } from './prepaidEngine.ts';

export const DISPUTE_HOLD_REASON_OPEN = 'CHARGEBACK_OPEN';
export const DISPUTE_HOLD_REASON_LOST = 'CHARGEBACK_LOST';

export interface HeldLotResult {
  lot_id: string;
  entity_id: string;
  held_cents: number;
}

export interface DisputeHoldResult {
  status: 'held' | 'nothing_to_hold' | 'already_held' | 'error';
  dispute_reference: string;
  held_cents: number;
  lots: HeldLotResult[];
  wallet_balance_before_cents?: number;
  wallet_balance_after_cents?: number;
  dispute_held_cents?: number;
  unexplained?: string;
  error?: string;
}

/**
 * Choose which lot(s) a disputed charge may freeze.
 *
 * Traceability rule: a lot is eligible ONLY when it was funded by the disputed
 * charge (its stripe_transaction_id equals the disputed charge id) and still
 * carries unspent value. There is deliberately NO fallback that would freeze a
 * different, unrelated lot — a chargeback must never suspend value the customer
 * funded through a different payment.
 */
export function selectDisputableLots(
  lots: any[],
  providerChargeId: string,
  amountCents: number,
): { selected: { lot: any; held_cents: number }[]; traceable: boolean } {
  const charge = String(providerChargeId || '').trim();
  const matching = (lots || []).filter(l =>
    !l.dispute_hold &&
    (l.booking_value_remaining_cents ?? 0) > 0 &&
    charge !== '' &&
    String(l.stripe_transaction_id || '').trim() === charge
  );
  if (matching.length === 0) return { selected: [], traceable: false };

  let remainingToHold = Math.max(0, Math.round(amountCents || 0));
  const selected: { lot: any; held_cents: number }[] = [];
  // Oldest first, matching FIFO consumption order, so the hold mirrors the order
  // in which the customer's funds would have been spent.
  for (const lot of matching.sort((a, b) => (a.fifo_order ?? 0) - (b.fifo_order ?? 0))) {
    if (remainingToHold <= 0) break;
    const available = lot.booking_value_remaining_cents ?? 0;
    const held = Math.min(available, remainingToHold);
    if (held > 0) {
      selected.push({ lot, held_cents: held });
      remainingToHold -= held;
    }
  }
  return { selected, traceable: true };
}

/**
 * Suspend the unspent value funded by a disputed charge.
 * Idempotent: a repeated webhook for the same dispute returns 'already_held'
 * without holding a second time.
 */
export async function holdDisputedLots({
  base44,
  wallet_id,
  dispute_reference,
  provider_charge_id,
  amount_cents,
  actor,
  cert_mode,
}: {
  base44: any;
  wallet_id: string;
  dispute_reference: string;
  provider_charge_id: string;
  amount_cents: number;
  actor?: string;
  cert_mode?: boolean;
}): Promise<DisputeHoldResult> {
  if (!dispute_reference) {
    return { status: 'error', dispute_reference: '', held_cents: 0, lots: [], error: 'dispute_reference is required' };
  }

  // Idempotency: has this dispute already been held?
  const priorHolds = await base44.entities.CreditLot.filter(
    { wallet_id, dispute_reference, dispute_hold: true },
    undefined,
    50,
  );
  const priorArr = Array.isArray(priorHolds) ? priorHolds : (priorHolds?.data || []);
  if (priorArr.length > 0) {
    const alreadyHeld = priorArr.reduce((s: number, l: any) => s + (l.dispute_hold_cents || 0), 0);
    return {
      status: 'already_held',
      dispute_reference,
      held_cents: alreadyHeld,
      lots: priorArr.map((l: any) => ({ lot_id: l.lot_id, entity_id: l.id, held_cents: l.dispute_hold_cents || 0 })),
    };
  }

  const walletRes = await base44.entities.PrepaidWallet.filter({ id: wallet_id }, undefined, 1);
  const walletArr = Array.isArray(walletRes) ? walletRes : (walletRes?.data || []);
  if (walletArr.length === 0) {
    return { status: 'error', dispute_reference, held_cents: 0, lots: [], error: `PrepaidWallet not found: ${wallet_id}` };
  }
  const wallet = walletArr[0];

  const lotsRes = await base44.entities.CreditLot.filter({ wallet_id }, '-fifo_order', 500);
  const lots = Array.isArray(lotsRes) ? lotsRes : (lotsRes?.data || []);

  const { selected, traceable } = selectDisputableLots(lots, provider_charge_id, amount_cents);
  if (!traceable || selected.length === 0) {
    // Nothing to freeze. Recorded explicitly rather than quietly moving on: this
    // is the correct outcome when the disputed value was already spent or expired.
    return {
      status: 'nothing_to_hold',
      dispute_reference,
      held_cents: 0,
      lots: [],
      unexplained:
        'No unspent value is traceable to the disputed charge, so no funds were suspended. Value already redeemed, expired, or funded by a different charge is not affected.',
    };
  }

  const nowIso = new Date().toISOString();
  const idPrefix = cert_mode ? 'cert_' : '';
  let heldTotal = 0;
  const held: HeldLotResult[] = [];

  for (const { lot, held_cents } of selected) {
    await base44.entities.CreditLot.update(lot.id, {
      dispute_hold: true,
      dispute_hold_cents: held_cents,
      dispute_hold_at: nowIso,
      dispute_hold_reason: DISPUTE_HOLD_REASON_OPEN,
      dispute_reference,
    });
    held.push({ lot_id: lot.lot_id, entity_id: lot.id, held_cents });
    heldTotal += held_cents;
  }

  const balanceBefore = wallet.booking_value_balance_cents ?? toCents(wallet.booking_value_balance || 0);
  const heldBefore = wallet.dispute_held_cents ?? 0;
  const balanceAfter = Math.max(0, balanceBefore - heldTotal);

  await base44.entities.PrepaidWallet.update(wallet_id, {
    booking_value_balance_cents: balanceAfter,
    booking_value_balance: fromCents(balanceAfter),
    credits_balance: creditsFromCents(balanceAfter),
    dispute_held_cents: heldBefore + heldTotal,
    updated_at: nowIso,
  });

  // Immutable ledger entry. The lot keeps its remaining value, so this entry
  // records the change in SPENDABLE balance, not a redemption.
  await base44.entities.WalletTransaction.create({
    transaction_id: idPrefix + generateId('ptxn'),
    wallet_id,
    customer_id: wallet.customer_id,
    customer_email: wallet.customer_email,
    type: 'ADMIN_ADJUSTMENT',
    cash_amount: 0,
    credits: -creditsFromCents(heldTotal),
    booking_value: -fromCents(heldTotal),
    booking_value_cents: -heldTotal,
    stripe_transaction_id: provider_charge_id || '',
    booking_id: '',
    lot_id: held.map(h => h.lot_id).join(','),
    source: 'SYSTEM',
    actor: actor || 'dispute_protection',
    description: `Dispute hold ${dispute_reference} — suspended $${fromCents(heldTotal)} of unspent Booking Value funded by charge ${provider_charge_id}. Not a redemption, not an expiry.`,
    prepaid_tier: '',
    created_at: nowIso,
  });

  return {
    status: 'held',
    dispute_reference,
    held_cents: heldTotal,
    lots: held,
    wallet_balance_before_cents: balanceBefore,
    wallet_balance_after_cents: balanceAfter,
    dispute_held_cents: heldBefore + heldTotal,
  };
}

/**
 * Release a hold because the dispute was resolved in the customer's favour.
 * The amount is restored exactly, because the lots were never reduced.
 */
export async function releaseDisputeHold({
  base44,
  dispute_reference,
  actor,
  cert_mode,
}: {
  base44: any;
  dispute_reference: string;
  actor?: string;
  cert_mode?: boolean;
}) {
  const res = await base44.entities.CreditLot.filter({ dispute_reference, dispute_hold: true }, undefined, 200);
  const lots = Array.isArray(res) ? res : (res?.data || []);
  if (lots.length === 0) {
    return { status: 'nothing_held', dispute_reference, released_cents: 0, lots: [] };
  }

  const nowIso = new Date().toISOString();
  const idPrefix = cert_mode ? 'cert_' : '';
  const releasedTotal = lots.reduce((s: number, l: any) => s + (l.dispute_hold_cents || 0), 0);
  const walletId = lots[0].wallet_id;

  for (const lot of lots) {
    await base44.entities.CreditLot.update(lot.id, {
      dispute_hold: false,
      dispute_hold_cents: 0,
      dispute_hold_released_at: nowIso,
    });
  }

  const walletRes = await base44.entities.PrepaidWallet.filter({ id: walletId }, undefined, 1);
  const walletArr = Array.isArray(walletRes) ? walletRes : (walletRes?.data || []);
  if (walletArr.length > 0) {
    const wallet = walletArr[0];
    const before = wallet.booking_value_balance_cents ?? toCents(wallet.booking_value_balance || 0);
    const cappedCeiling = wallet.total_booking_value_issued_cents ?? 0;
    const after = cappedCeiling > 0 ? Math.min(before + releasedTotal, cappedCeiling) : before + releasedTotal;
    const heldBefore = wallet.dispute_held_cents ?? 0;
    await base44.entities.PrepaidWallet.update(walletId, {
      booking_value_balance_cents: after,
      booking_value_balance: fromCents(after),
      credits_balance: creditsFromCents(after),
      dispute_held_cents: Math.max(0, heldBefore - releasedTotal),
      updated_at: nowIso,
    });

    await base44.entities.WalletTransaction.create({
      transaction_id: idPrefix + generateId('ptxn'),
      wallet_id: walletId,
      customer_id: wallet.customer_id,
      customer_email: wallet.customer_email,
      type: 'ADMIN_ADJUSTMENT',
      cash_amount: 0,
      credits: creditsFromCents(releasedTotal),
      booking_value: fromCents(releasedTotal),
      booking_value_cents: releasedTotal,
      stripe_transaction_id: '',
      booking_id: '',
      lot_id: lots.map((l: any) => l.lot_id).join(','),
      source: 'SYSTEM',
      actor: actor || 'dispute_protection',
      description: `Dispute ${dispute_reference} resolved in the customer's favour — released $${fromCents(releasedTotal)} of held Booking Value.`,
      prepaid_tier: '',
      created_at: nowIso,
    });
  }

  return { status: 'released', dispute_reference, released_cents: releasedTotal, lots: lots.map((l: any) => l.lot_id) };
}

/**
 * Convert a held amount into a permanent reversal because the dispute was lost.
 * This is the ONLY path that reduces a held lot's remaining value, and it leaves
 * the ledger explaining exactly why.
 */
export async function reverseHeldLots({
  base44,
  dispute_reference,
  actor,
  note,
  cert_mode,
}: {
  base44: any;
  dispute_reference: string;
  actor?: string;
  note?: string;
  cert_mode?: boolean;
}) {
  const res = await base44.entities.CreditLot.filter({ dispute_reference, dispute_hold: true }, undefined, 200);
  const lots = Array.isArray(res) ? res : (res?.data || []);
  if (lots.length === 0) {
    return { status: 'nothing_held', dispute_reference, reversed_cents: 0 };
  }

  const nowIso = new Date().toISOString();
  const idPrefix = cert_mode ? 'cert_' : '';
  let reversed = 0;

  for (const lot of lots) {
    const held = lot.dispute_hold_cents || 0;
    const remaining = Math.max(0, (lot.booking_value_remaining_cents ?? 0) - held);
    await base44.entities.CreditLot.update(lot.id, {
      booking_value_remaining_cents: remaining,
      booking_value_remaining: fromCents(remaining),
      credits_remaining: creditsFromCents(remaining),
      dispute_hold: false,
      dispute_hold_cents: 0,
      dispute_hold_reason: DISPUTE_HOLD_REASON_LOST,
      dispute_hold_released_at: nowIso,
    });
    reversed += held;
  }

  const walletId = lots[0].wallet_id;
  const walletRes = await base44.entities.PrepaidWallet.filter({ id: walletId }, undefined, 1);
  const walletArr = Array.isArray(walletRes) ? walletRes : (walletRes?.data || []);
  if (walletArr.length > 0) {
    const heldBefore = walletArr[0].dispute_held_cents ?? 0;
    await base44.entities.PrepaidWallet.update(walletId, {
      dispute_held_cents: Math.max(0, heldBefore - reversed),
      updated_at: nowIso,
    });
  }

  const first = walletArr[0];
  await base44.entities.WalletTransaction.create({
    transaction_id: idPrefix + generateId('ptxn'),
    wallet_id: walletId,
    customer_id: first?.customer_id || lots[0].customer_id,
    customer_email: first?.customer_email || lots[0].customer_email,
    type: 'REFUND_REVERSAL',
    cash_amount: fromCents(reversed),
    credits: -creditsFromCents(reversed),
    booking_value: -fromCents(reversed),
    booking_value_cents: -reversed,
    stripe_transaction_id: '',
    booking_id: '',
    lot_id: lots.map((l: any) => l.lot_id).join(','),
    source: 'SYSTEM',
    actor: actor || 'dispute_protection',
    description: `Dispute ${dispute_reference} lost — reversed $${fromCents(reversed)} of suspended Booking Value. ${note || ''}`.trim(),
    prepaid_tier: '',
    created_at: nowIso,
  });

  return { status: 'reversed', dispute_reference, reversed_cents: reversed };
}

/**
 * Accounting invariants for a wallet with an open hold. Used by the test suites
 * to prove the hold moved value without creating or destroying any.
 */
export function checkHoldInvariants({ wallet, lots }: { wallet: any; lots: any[] }) {
  const spendable = wallet.booking_value_balance_cents ?? 0;
  const held = wallet.dispute_held_cents ?? 0;
  const liveLots = (lots || []).filter(l => !l.expired);
  const lotRemaining = liveLots.reduce((s, l) => s + (l.booking_value_remaining_cents ?? 0), 0);
  const heldOnLots = (lots || []).reduce((s, l) => s + (l.dispute_hold_cents ?? 0), 0);
  return {
    spendable_cents: spendable,
    dispute_held_cents: held,
    live_lot_remaining_cents: lotRemaining,
    held_on_lots_cents: heldOnLots,
    // The spendable balance plus the hold must equal the live unspent lot value.
    spendable_plus_held_equals_lots: spendable + held === lotRemaining,
    // The wallet-level hold must equal the sum of the per-lot holds.
    hold_reconciles_to_lots: held === heldOnLots,
    // A hold must never make the spendable balance negative.
    spendable_not_negative: spendable >= 0,
  };
}

/**
 * Assemble the dispute evidence packet.
 *
 * Every section is attempted independently and anything that cannot be assembled
 * is listed in `gaps`. A gap is reported, never silently omitted, because a
 * dispute response that looks complete but is missing a section is worse than a
 * packet that states what it could not gather.
 */
export async function buildDisputeEvidencePacket({
  base44,
  subscription,
  wallet,
  dispute_reference,
  provider_charge_id,
  disputed_amount_cents,
}: {
  base44: any;
  subscription: any;
  wallet: any;
  dispute_reference: string;
  provider_charge_id: string;
  disputed_amount_cents: number;
}) {
  const arr = (r: any) => (Array.isArray(r) ? r : (r?.data || r?.items || []));
  const present: string[] = [];
  const gaps: string[] = [];

  const customerEmail = subscription?.customer_email || wallet?.customer_email || '';
  const customerId = subscription?.customer_id || wallet?.customer_id || '';

  // ── Consent and authorization ────────────────────────────────────────────
  let consent: any = null;
  try {
    const recs = arr(await base44.entities.AutoFundConsentRecord.filter(
      { subscription_id: subscription?.id || '' }, '-authorized_at', 10,
    ));
    consent = recs[0] || null;
  } catch (e) {
    gaps.push(`consent_lookup_failed: ${e.message}`);
  }
  const consentPacket = consent
    ? {
        terms_version: consent.terms_version || '',
        authorized_at: consent.authorized_at || '',
        authorized_by: consent.authorized_by || '',
        funding_amount: consent.funding_amount ?? null,
        membership_fee: consent.membership_fee ?? null,
        total_recurring_charge: consent.total_recurring_charge ?? null,
        consent_text_snapshot: consent.consent_text_snapshot || '',
        has_ip: !!consent.consent_ip,
        has_user_agent: !!consent.consent_user_agent,
      }
    : null;
  if (consentPacket) {
    present.push('consent_authorization_record');
    if (!consentPacket.consent_text_snapshot) gaps.push('consent_text_snapshot_missing');
    if (!consentPacket.has_ip) gaps.push('consent_ip_missing');
    if (!consentPacket.has_user_agent) gaps.push('consent_user_agent_missing');
  } else {
    gaps.push('consent_authorization_record_missing');
  }

  // ── Billing authorization (frozen contract terms) ────────────────────────
  const billing = subscription
    ? {
        subscription_id: subscription.id,
        plan_id: subscription.plan_id || '',
        monthly_funding_amount: subscription.amount ?? null,
        membership_fee_authorized: subscription.membership_fee ?? null,
        total_monthly_charge_authorized: subscription.total_monthly_charge ?? null,
        billing_day_of_month: subscription.billing_day_of_month ?? null,
        billing_address_recorded: !!subscription.billing_address_line1,
        jurisdiction_state: subscription.jurisdiction_state || '',
        terms_version: subscription.terms_version || '',
        terms_accepted_at: subscription.terms_accepted_at || '',
        terms_accepted_by: subscription.terms_accepted_by || '',
      }
    : null;
  if (billing) present.push('billing_authorization');
  else gaps.push('subscription_contract_missing');

  // ── Transactions ────────────────────────────────────────────────────────
  let paymentEvents: any[] = [];
  let walletTransactions: any[] = [];
  let lots: any[] = [];
  try {
    paymentEvents = arr(await base44.entities.AutoFundPaymentEvent.filter(
      { subscription_id: subscription?.id || '' }, '-processed_at', 200,
    ));
    present.push('payment_event_ledger');
  } catch (e) {
    gaps.push(`payment_event_lookup_failed: ${e.message}`);
  }
  try {
    walletTransactions = arr(await base44.entities.WalletTransaction.filter(
      { wallet_id: wallet?.id || '' }, '-created_at', 200,
    ));
    present.push('wallet_transaction_ledger');
  } catch (e) {
    gaps.push(`wallet_transaction_lookup_failed: ${e.message}`);
  }
  try {
    lots = arr(await base44.entities.CreditLot.filter({ wallet_id: wallet?.id || '' }, '-fifo_order', 200));
    present.push('credit_lot_ledger');
  } catch (e) {
    gaps.push(`credit_lot_lookup_failed: ${e.message}`);
  }

  const disputedEvents = paymentEvents.filter(e => String(e.stripe_charge_id || '') === String(provider_charge_id || ''));

  // ── Service delivery ────────────────────────────────────────────────────
  let bookings: any[] = [];
  let jobs: any[] = [];
  try {
    bookings = arr(await base44.entities.Booking.filter({ client_email: customerEmail }, '-created_date', 100));
    present.push('booking_records');
  } catch (e) {
    gaps.push(`booking_lookup_failed: ${e.message}`);
  }
  try {
    jobs = arr(await base44.entities.Job.filter({ client_email: customerEmail }, '-created_date', 100));
    present.push('job_records');
  } catch (e) {
    gaps.push(`job_lookup_failed: ${e.message}`);
  }
  if (bookings.length === 0 && jobs.length === 0) {
    gaps.push('no_service_delivery_records_found_for_customer');
  }

  // ── Communications ──────────────────────────────────────────────────────
  let notices: any[] = [];
  let recoveryNotices: any[] = [];
  try {
    notices = arr(await base44.entities.AutoFundMembershipNotice.filter(
      { subscription_id: subscription?.id || '' }, '-created_at', 100,
    ));
    present.push('membership_notices');
  } catch (e) {
    gaps.push(`membership_notice_lookup_failed: ${e.message}`);
  }
  try {
    recoveryNotices = arr(await base44.entities.PaymentRecoveryNotification.filter(
      { subscription_id: subscription?.id || '' }, undefined, 100,
    ));
    if (recoveryNotices.length > 0) present.push('payment_recovery_notifications');
  } catch (e) {
    gaps.push(`recovery_notification_lookup_failed: ${e.message}`);
  }

  return {
    packet: {
      consent: {
        record: consentPacket,
        terms_version: subscription?.terms_version || '',
        terms_accepted_at: subscription?.terms_accepted_at || '',
        terms_accepted_by: subscription?.terms_accepted_by || '',
      },
      billing_authorization: billing,
      transactions: {
        disputed_charge_id: provider_charge_id,
        disputed_amount_cents,
        matching_payment_events: disputedEvents.map(e => ({
          payment_event_id: e.payment_event_id,
          amount_charged: e.amount_charged,
          charge_component: e.charge_component || 'wallet_funding',
          booking_value_issued_cents: e.booking_value_issued_cents ?? 0,
          status: e.status,
          processed_at: e.processed_at,
        })),
        payment_events_count: paymentEvents.length,
        wallet_transactions_count: walletTransactions.length,
        lots_count: lots.length,
        lots: lots.map(l => ({
          lot_id: l.lot_id,
          source: l.source,
          booking_value_issued_cents: l.booking_value_issued_cents ?? 0,
          booking_value_remaining_cents: l.booking_value_remaining_cents ?? 0,
          stripe_transaction_id: l.stripe_transaction_id || '',
          expires_at: l.expires_at,
          dispute_hold: !!l.dispute_hold,
        })),
      },
      service_delivery: {
        bookings_count: bookings.length,
        bookings: bookings.map(b => ({
          id: b.id,
          status: b.status,
          package: b.package,
          preferred_date: b.preferred_date,
          total_price: b.total_price ?? null,
          property_address: b.property_address || b.street_address || '',
        })),
        jobs_count: jobs.length,
        jobs: jobs.map(j => ({
          id: j.id,
          status: j.status,
          job_date: j.job_date || '',
          media_partner_fulfillment_status: j.media_partner_fulfillment_status || '',
        })),
      },
      communications: {
        membership_notices: notices.map(n => ({
          notice_type: n.notice_type,
          sent_at: n.sent_at || '',
          delivery_status: n.delivery_status,
          email_subject: n.email_subject || '',
        })),
        recovery_notifications: recoveryNotices.map(n => ({
          notification_type: n.notification_type,
          sent_at: n.sent_at || '',
          email_sent: !!n.email_sent,
        })),
      },
    },
    present,
    gaps,
    dispute_reference,
    customer_email: customerEmail,
    customer_id: customerId,
  };
}

/** Mint stable IDs for the dispute-case record. */
export function generateDisputeCaseId(): string {
  return generateId('afdispute');
}

/** Money helper kept local so the module has no hidden rounding. */
export function centsOf(dollars: number): number {
  return Math.round(round2(dollars) * 100);
}