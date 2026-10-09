/**
 * Auto-Fund Payment Processor — shared logic for issuing wallet credits
 * when Arriv Pay confirms a successful customer payment.
 *
 * Used by both:
 *   - receiveArrivPayCustomerPayment (webhook from Arriv Pay)
 *   - manageAutoFund (top-up action)
 *
 * Boundary: Estate Media owns WHAT the payment entitles (credits, booking value).
 * Arriv Pay owns PROCESSING the payment. This module only runs AFTER Arriv Pay
 * confirms a successful payment — it never charges the customer.
 */

import {
  getAutoFundConfig,
  calculateAutoFundCommission,
  calculatePrepaidCommission,
  addMonths,
  generateId,
  round2,
  toCents,
  fromCents,
  creditsFromCents,
  PREPAID_CREDIT_VALUE,
  PREPAID_TIERS,
} from './prepaidEngine.ts';
import { isCertificationId } from './certificationMode.ts';

export interface ProcessPaymentParams {
  base44: any;
  payment_event_id: string;
  subscription_id: string;
  customer_id: string;
  customer_email: string;
  wallet_id: string;
  amount_charged: number;
  status: 'succeeded' | 'failed' | 'retry_succeeded';
  event_type: 'recurring' | 'topup' | 'retry' | 'prepaid_purchase';
  sales_rep_id?: string;
  stripe_invoice_id?: string;
  stripe_charge_id?: string;
  failure_reason?: string;
  billing_period_start?: string;
  billing_period_end?: string;
  raw_event?: string;
  actor?: string;
  /** When true, all generated child IDs are cert_-prefixed for certification isolation. */
  cert_mode?: boolean;
}

/** Reason marker written on the customer's acquisition commission event. */
export const AUTO_FUND_FIRST_PAYMENT_REASON = 'AUTO_FUND_FIRST_PAYMENT_15_PERCENT';

/**
 * Customer-level Auto-Fund acquisition eligibility.
 * Returns true ONLY for the customer's first successful Auto-Fund cycle payment.
 *
 * Persistent + customer-level: keyed on (a) prior successful cycle events for the
 * same customer identity and (b) a prior acquisition-commission marker for that
 * identity. It therefore does NOT reset on pause/resume, cancel/reactivate, tier
 * change, payment-method replacement, failed-then-retry, migration, or a
 * replacement subscription for the same customer.
 */
async function isFirstAutoFundPayment(base44, customerId, currentPaymentEventId) {
  // (a) Any prior SUCCESSFUL Auto-Fund cycle payment for this customer identity?
  const priorEventsRes = await base44.entities.AutoFundPaymentEvent.filter(
    { customer_id: customerId, status: { $in: ['succeeded', 'retry_succeeded'] } },
    undefined,
    200
  );
  const priorEvents = Array.isArray(priorEventsRes) ? priorEventsRes : (priorEventsRes?.data || []);
  const priorCyclePayments = priorEvents.filter(
    e => e.payment_event_id !== currentPaymentEventId
      && (e.event_type === 'recurring' || e.event_type === 'retry')
  );
  if (priorCyclePayments.length > 0) return false;

  // (b) Defensive customer-level acquisition marker — blocks a second acquisition
  //     award if the acquisition commission was already recorded for this identity
  //     (guards a concurrency window where two cycle events arrive together).
  const priorCommRes = await base44.entities.PrepaidCompensationEvent.filter(
    { customer_id: customerId, source_type: 'AUTO_FUND_COMMISSION' },
    undefined,
    200
  );
  const priorComm = Array.isArray(priorCommRes) ? priorCommRes : (priorCommRes?.data || []);
  if (priorComm.some(c => c.reason === AUTO_FUND_FIRST_PAYMENT_REASON)) return false;

  return true;
}

export async function processAutoFundPayment(params: ProcessPaymentParams) {
  const { base44, ...data } = params;
  const idPrefix = data.cert_mode ? 'cert_' : '';
  // Deployed payment contract — supports prepaid_purchase, topup, recurring/retry

  // ── Idempotency: check if this payment event was already processed ─────────
  const existing = await base44.entities.AutoFundPaymentEvent.filter(
    { payment_event_id: data.payment_event_id },
    undefined,
    1
  );
  const existingArr = Array.isArray(existing) ? existing : (existing?.data || []);
  if (existingArr.length > 0) {
    return { status: 'duplicate', event: existingArr[0] };
  }

  const nowIso = new Date().toISOString();
  const config = getAutoFundConfig(data.amount_charged);
  const isSuccess = data.status === 'succeeded' || data.status === 'retry_succeeded';
  const isTopup = data.event_type === 'topup';
  const isPrepaidPurchase = data.event_type === 'prepaid_purchase';

  // ── Calculate booking value and credits ──────────────────────────────────
  // Three distinct event types, each with its own bonus rule:
  //   - prepaid_purchase: applies the canonical Prepaid tier bonus (e.g., $500
  //     STARTER → $550 BV = 55,000¢ = 2 credits). Tier looked up by cash_price.
  //   - topup: 1:1 cash → BV, NO bonus (ordinary wallet top-up).
  //   - recurring/retry: Auto-Fund plan bonus (e.g., $100 → $105 BV = 10,500¢).
  // booking_value_cents is the AUTHORITATIVE value (integer, no floating-point loss).
  // credits and booking_value are DERIVED for display only.
  let bookingValue = 0;
  let bonusBv = 0;
  let lotTier = 'STARTER';
  let txnType = 'RELOAD';
  let lotSource = 'reload';

  if (isSuccess) {
    if (isPrepaidPurchase) {
      // Canonical Prepaid tier purchase — apply tier bonus
      const tierConfig = Object.values(PREPAID_TIERS).find(t => t.cash_price === data.amount_charged);
      if (tierConfig) {
        bookingValue = tierConfig.booking_value;
        bonusBv = round2(tierConfig.booking_value - data.amount_charged);
        lotTier = tierConfig.tier;
      } else {
        // Unknown tier amount — fail closed, no bonus
        bookingValue = data.amount_charged;
        bonusBv = 0;
        lotTier = 'STARTER';
      }
      txnType = 'PREPAID_PURCHASE';
      lotSource = 'purchase';
    } else if (isTopup) {
      bookingValue = data.amount_charged;
      bonusBv = 0;
      txnType = 'RELOAD';
      lotSource = 'reload';
    } else {
      // recurring/retry — Auto-Fund plan bonus
      bookingValue = config?.booking_value || data.amount_charged;
      bonusBv = config?.bonus_booking_value || 0;
      txnType = 'RELOAD';
      lotSource = 'reload';
    }
  }
  const bookingValueCents = toCents(bookingValue);
  const credits = creditsFromCents(bookingValueCents);

  let walletTxnId = '';
  let lotId = '';
  let commissionSourceEventId = '';

  if (isSuccess) {
    // ── Retrieve wallet BEFORE issuing credits ─────────────────────────────
    // data.wallet_id is the Base44 entity primary key (id) of the PrepaidWallet.
    // The PrepaidWallet entity has no custom wallet_id field — its primary key
    // IS the wallet_id used throughout the system. Since .get() throws an opaque
    // 500 when the entity is not found (and id is not a filterable field), we
    // use .filter() by customer_id (a filterable field) and then match by id
    // to retrieve exactly the right wallet. This gives controlled zero-match
    // and multiple-match behavior instead of an opaque entity-primary-key 500.
    if (!data.customer_id) {
      return {
        status: 'error',
        error: 'customer_id is required to retrieve the wallet',
        error_code: 'INVALID_REQUEST',
        retryable: false,
        payment_event_id: data.payment_event_id,
      };
    }
    const walletResults = await base44.entities.PrepaidWallet.filter(
      { customer_id: data.customer_id },
      undefined,
      10
    );
    const walletArr = Array.isArray(walletResults) ? walletResults : (walletResults?.data || []);
    const matchingWallets = walletArr.filter(w => w.id === data.wallet_id);

    if (matchingWallets.length === 0) {
      return {
        status: 'error',
        error: `PrepaidWallet not found for wallet_id: ${data.wallet_id}`,
        error_code: 'WALLET_NOT_FOUND',
        retryable: true,
        payment_event_id: data.payment_event_id,
      };
    }
    if (matchingWallets.length > 1) {
      return {
        status: 'error',
        error: `Multiple PrepaidWallets found for wallet_id: ${data.wallet_id} — data integrity issue`,
        error_code: 'DATA_INTEGRITY_MULTIPLE_WALLETS',
        retryable: false,
        payment_event_id: data.payment_event_id,
      };
    }
    const wallet = matchingWallets[0];

    // ── Certification wallet isolation ────────────────────────────────────
    // A cert_ payment ID or cert_ customer_email alone is NOT proof that the
    // wallet is synthetic. We verify against the PERSISTED wallet record:
    //
    //   1. Ownership: wallet.customer_id must match the event's customer_id
    //   2. Email match: wallet.customer_email must match the event's customer_email
    //   3. In cert mode: event customer_email must be cert_-prefixed (synthetic event)
    //   4. In cert mode: wallet customer_email must be cert_-prefixed (synthetic fixture)
    //
    // This prevents a cert_-prefixed event from crediting a production wallet.
    // Fail closed — no financial mutation if any check fails.
    if (wallet.customer_id !== data.customer_id) {
      return {
        status: 'error',
        error: 'Wallet ownership mismatch — wallet.customer_id does not match event customer_id',
        error_code: 'WALLET_OWNERSHIP_MISMATCH',
        retryable: false,
        payment_event_id: data.payment_event_id,
      };
    }
    if (wallet.customer_email !== data.customer_email) {
      return {
        status: 'error',
        error: 'Wallet email mismatch — wallet.customer_email does not match event customer_email',
        error_code: 'WALLET_EMAIL_MISMATCH',
        retryable: false,
        payment_event_id: data.payment_event_id,
      };
    }
    if (data.cert_mode) {
      if (!isCertificationId(data.customer_email)) {
        return {
          status: 'error',
          error: 'Certification mode requires cert_-prefixed customer_email in the event payload',
          error_code: 'CERT_SYNTHETIC_IDENTITY_REQUIRED',
          retryable: false,
          payment_event_id: data.payment_event_id,
        };
      }
      if (!isCertificationId(wallet.customer_email)) {
        return {
          status: 'error',
          error: 'Certification mode cannot operate on a production wallet — wallet customer_email is not cert_-prefixed',
          error_code: 'CERT_PRODUCTION_WALLET_BLOCKED',
          retryable: false,
          payment_event_id: data.payment_event_id,
        };
      }
    } else {
      // Production events must NOT operate on certification wallets (mixed identity rejection)
      if (isCertificationId(wallet.customer_email)) {
        return {
          status: 'error',
          error: 'Production event cannot operate on a certification wallet — mixed synthetic/production identity rejected',
          error_code: 'MIXED_IDENTITY_REJECTED',
          retryable: false,
          payment_event_id: data.payment_event_id,
        };
      }
    }

    // ── Create credit lot (12-month validity, FIFO) ────────────────────────
    lotId = idPrefix + generateId('lot');
    const expiresAt = addMonths(new Date(), 12).toISOString();

    const lotRecord = await base44.entities.CreditLot.create({
      wallet_id: data.wallet_id,
      customer_id: data.customer_id,
      customer_email: data.customer_email,
      lot_id: lotId,
      source: lotSource,
      source_transaction_id: '',
      tier: lotTier,
      credits_issued: credits,
      credits_remaining: credits,
      booking_value_issued: fromCents(bookingValueCents),
      booking_value_remaining: fromCents(bookingValueCents),
      booking_value_issued_cents: bookingValueCents,
      booking_value_remaining_cents: bookingValueCents,
      expires_at: expiresAt,
      expired: false,
      fifo_order: Date.now(),
      stripe_transaction_id: data.stripe_charge_id || data.stripe_invoice_id || '',
      created_at: nowIso,
    });

    // ── Create wallet transaction ──────────────────────────────────────────
    walletTxnId = idPrefix + generateId('ptxn');
    await base44.entities.WalletTransaction.create({
      transaction_id: walletTxnId,
      wallet_id: data.wallet_id,
      customer_id: data.customer_id,
      customer_email: data.customer_email,
      type: txnType,
      cash_amount: data.amount_charged,
      credits: credits,
      booking_value: fromCents(bookingValueCents),
      booking_value_cents: bookingValueCents,
      stripe_transaction_id: data.stripe_charge_id || data.stripe_invoice_id || '',
      booking_id: '',
      lot_id: lotId,
      source: 'STRIPE',
      actor: data.actor || 'arriv_pay',
      description: `${isPrepaidPurchase ? 'Prepaid' : 'Auto-Fund'} ${data.event_type} — $${data.amount_charged} → $${fromCents(bookingValueCents)} booking value${bonusBv > 0 ? ` (incl. $${round2(bonusBv)} bonus)` : ''}`,
      prepaid_tier: lotTier,
      created_at: nowIso,
    });

    // Link lot to transaction
    if (lotRecord?.id) {
      await base44.entities.CreditLot.update(lotRecord.id, { source_transaction_id: walletTxnId });
    }

    // ── Update wallet balance (wallet already retrieved above) ───────────
    // booking_value_balance_cents is AUTHORITATIVE (integer, exact).
    // credits_balance and booking_value_balance are DERIVED for display.
    const walletBvCents = wallet.booking_value_balance_cents ?? toCents(wallet.booking_value_balance || 0);
    const walletTotalIssuedCents = wallet.total_booking_value_issued_cents ?? toCents(wallet.total_booking_value_issued || 0);
    const newBvCents = walletBvCents + bookingValueCents;
    const newTotalIssuedCents = walletTotalIssuedCents + bookingValueCents;
    const newCredits = creditsFromCents(newBvCents);
    const newBv = fromCents(newBvCents);
    await base44.entities.PrepaidWallet.update(data.wallet_id, {
      credits_balance: newCredits,
      booking_value_balance: newBv,
      booking_value_balance_cents: newBvCents,
      total_credits_issued: creditsFromCents(newTotalIssuedCents),
      total_booking_value_issued: fromCents(newTotalIssuedCents),
      total_booking_value_issued_cents: newTotalIssuedCents,
      updated_at: nowIso,
    });

    // ── Commission event (if rep attributed and eligible) ──────────────────
    if (data.sales_rep_id) {
      let repEligible = false;
      let repEmail = '';
      try {
        const rep = await base44.entities.SalesTeamMember.get(data.sales_rep_id);
        if (rep) {
          repEmail = rep.email || '';
          repEligible = rep.status === 'active' || rep.status === 'ACTIVE' || !rep.status;
        }
      } catch {}

      if (repEligible) {
        // ── FINAL SALES COMMISSION POLICY ─────────────────────────────────
        // Prepaid purchases keep their own 10% rule (Prepaid program unchanged).
        // Auto-Fund: 15% on the first successful payment (customer-level,
        // persistent), 8% on every subsequent payment. Always on collected cash,
        // never on promotional bonus Booking Value.
        let commissionAmount;
        let commissionReason;
        if (isPrepaidPurchase) {
          commissionAmount = calculatePrepaidCommission(data.amount_charged);
          commissionReason = 'PREPAID_COMMISSION_10_PERCENT';
        } else {
          const isCycleEvent = data.event_type === 'recurring' || data.event_type === 'retry';
          const isFirstPayment = isCycleEvent
            ? await isFirstAutoFundPayment(base44, data.customer_id, data.payment_event_id)
            : false;
          commissionAmount = calculateAutoFundCommission(data.amount_charged, isFirstPayment);
          commissionReason = isFirstPayment
            ? AUTO_FUND_FIRST_PAYMENT_REASON
            : 'AUTO_FUND_RECURRING_8_PERCENT';
        }
        commissionSourceEventId = idPrefix + generateId('empe');
        await base44.entities.PrepaidCompensationEvent.create({
          source_event_id: commissionSourceEventId,
          source_system: 'ARRIV_ESTATE_MEDIA',
          source_type: 'AUTO_FUND_COMMISSION',
          employee_id: data.sales_rep_id,
          employee_email: repEmail,
          customer_id: data.customer_id,
          transaction_id: walletTxnId,
          gross_customer_cash: data.amount_charged,
          commission_amount: commissionAmount,
          currency: 'USD',
          earned_at: nowIso,
          status: 'APPROVED',
          reason: commissionReason,
          prepaid_tier: '',
          delivered_to_payroll: false,
          delivery_attempts: 0,
          idempotency_key: commissionSourceEventId,
          effective_at: nowIso,
        });
      }
    }
  }

  // ── Record the immutable payment event ─────────────────────────────────────
  const paymentEvent = await base44.entities.AutoFundPaymentEvent.create({
    payment_event_id: data.payment_event_id,
    subscription_id: data.subscription_id,
    customer_id: data.customer_id,
    customer_email: data.customer_email,
    amount_charged: data.amount_charged,
    booking_value_issued: fromCents(bookingValueCents),
    booking_value_issued_cents: bookingValueCents,
    bonus_booking_value: round2(bonusBv),
    credits_issued: credits,
    status: data.status,
    event_type: data.event_type,
    stripe_invoice_id: data.stripe_invoice_id || '',
    stripe_charge_id: data.stripe_charge_id || '',
    wallet_transaction_id: walletTxnId,
    lot_id: lotId,
    commission_event_id: commissionSourceEventId,
    failure_reason: data.failure_reason || '',
    billing_period_start: data.billing_period_start || '',
    billing_period_end: data.billing_period_end || '',
    processed_at: nowIso,
    idempotency_key: data.payment_event_id,
    raw_event: data.raw_event || '',
  });

  return {
    status: 'processed',
    payment_event_id: data.payment_event_id,
    credits_issued: credits,
    booking_value_issued: fromCents(bookingValueCents),
    booking_value_issued_cents: bookingValueCents,
    bonus_booking_value: round2(bonusBv),
    lot_id: lotId,
    wallet_transaction_id: walletTxnId,
    commission_event_id: commissionSourceEventId,
  };
}