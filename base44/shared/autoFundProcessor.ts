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
  addMonths,
  generateId,
  round2,
  PREPAID_CREDIT_VALUE,
} from './prepaidEngine.ts';

export interface ProcessPaymentParams {
  base44: any;
  payment_event_id: string;
  subscription_id: string;
  customer_id: string;
  customer_email: string;
  wallet_id: string;
  amount_charged: number;
  status: 'succeeded' | 'failed' | 'retry_succeeded';
  event_type: 'recurring' | 'topup' | 'retry';
  sales_rep_id?: string;
  stripe_invoice_id?: string;
  stripe_charge_id?: string;
  failure_reason?: string;
  billing_period_start?: string;
  billing_period_end?: string;
  raw_event?: string;
  actor?: string;
}

export async function processAutoFundPayment(params: ProcessPaymentParams) {
  const { base44, ...data } = params;

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

  // ── Calculate booking value and credits ──────────────────────────────────
  // Top-ups get NO bonus (ordinary payment). Recurring gets plan bonus if applicable.
  const bookingValue = isSuccess
    ? (isTopup ? data.amount_charged : (config?.booking_value || data.amount_charged))
    : 0;
  const bonusBv = isSuccess
    ? (isTopup ? 0 : (config?.bonus_booking_value || 0))
    : 0;
  const credits = bookingValue / PREPAID_CREDIT_VALUE;

  let walletTxnId = '';
  let lotId = '';
  let commissionSourceEventId = '';

  if (isSuccess) {
    // ── Create credit lot (12-month validity, FIFO) ────────────────────────
    lotId = generateId('lot');
    const expiresAt = addMonths(new Date(), 12).toISOString();

    const lotRecord = await base44.entities.CreditLot.create({
      wallet_id: data.wallet_id,
      customer_id: data.customer_id,
      customer_email: data.customer_email,
      lot_id: lotId,
      source: 'reload',
      source_transaction_id: '',
      tier: 'STARTER',
      credits_issued: round2(credits),
      credits_remaining: round2(credits),
      booking_value_issued: round2(bookingValue),
      booking_value_remaining: round2(bookingValue),
      expires_at: expiresAt,
      expired: false,
      fifo_order: Date.now(),
      stripe_transaction_id: data.stripe_charge_id || data.stripe_invoice_id || '',
      created_at: nowIso,
    });

    // ── Create wallet transaction ──────────────────────────────────────────
    walletTxnId = generateId('ptxn');
    await base44.entities.WalletTransaction.create({
      transaction_id: walletTxnId,
      wallet_id: data.wallet_id,
      customer_id: data.customer_id,
      customer_email: data.customer_email,
      type: 'RELOAD',
      cash_amount: data.amount_charged,
      credits: round2(credits),
      booking_value: round2(bookingValue),
      stripe_transaction_id: data.stripe_charge_id || data.stripe_invoice_id || '',
      booking_id: '',
      lot_id: lotId,
      source: 'STRIPE',
      actor: data.actor || 'arriv_pay',
      description: `Auto-Fund ${data.event_type} — $${data.amount_charged} → $${round2(bookingValue)} booking value${bonusBv > 0 ? ` (incl. $${round2(bonusBv)} bonus)` : ''}`,
      prepaid_tier: '',
      created_at: nowIso,
    });

    // Link lot to transaction
    if (lotRecord?.id) {
      await base44.entities.CreditLot.update(lotRecord.id, { source_transaction_id: walletTxnId });
    }

    // ── Update wallet balance ──────────────────────────────────────────────
    const wallet = await base44.entities.PrepaidWallet.get(data.wallet_id);
    if (wallet) {
      const newCredits = round2(wallet.credits_balance + credits);
      const newBv = round2(wallet.booking_value_balance + bookingValue);
      await base44.entities.PrepaidWallet.update(data.wallet_id, {
        credits_balance: newCredits,
        booking_value_balance: newBv,
        total_credits_issued: round2(wallet.total_credits_issued + credits),
        total_booking_value_issued: round2(wallet.total_booking_value_issued + bookingValue),
        updated_at: nowIso,
      });
    }

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
        const commissionAmount = calculateAutoFundCommission(data.amount_charged);
        commissionSourceEventId = generateId('empe');
        await base44.entities.PrepaidCompensationEvent.create({
          source_event_id: commissionSourceEventId,
          source_system: 'ARRIV_ESTATE_MEDIA',
          source_type: 'PREPAID_RELOAD_COMMISSION',
          employee_id: data.sales_rep_id,
          employee_email: repEmail,
          customer_id: data.customer_id,
          transaction_id: walletTxnId,
          gross_customer_cash: data.amount_charged,
          commission_amount: commissionAmount,
          currency: 'USD',
          earned_at: nowIso,
          status: 'APPROVED',
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
    booking_value_issued: round2(bookingValue),
    bonus_booking_value: round2(bonusBv),
    credits_issued: round2(credits),
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
    credits_issued: round2(credits),
    booking_value_issued: round2(bookingValue),
    bonus_booking_value: round2(bonusBv),
    lot_id: lotId,
    wallet_transaction_id: walletTxnId,
    commission_event_id: commissionSourceEventId,
  };
}