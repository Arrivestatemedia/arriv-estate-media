import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import Stripe from 'npm:stripe@17.5.0';
import { findPartnerRecord, getPayPeriodStartUTC, clientPaymentCleared } from '../../shared/stripeConnect.ts';

// Stripe instant payout fee: 1.5% with a $0.50 minimum.
const INSTANT_PAYOUT_FEE_RATE = 0.015;
const INSTANT_PAYOUT_MIN_FEE = 0.50;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const email = user.email;
    if (!email) return Response.json({ error: 'No email on account' }, { status: 400 });

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    const rec = await findPartnerRecord(base44, email);
    if (!rec) return Response.json({ error: 'No partner record found' }, { status: 404 });

    const accountId = rec.record.stripe_account_id;
    if (!accountId) {
      return Response.json({ error: 'No Stripe account found. Complete direct deposit setup first.' }, { status: 400 });
    }
    if (!rec.record.stripe_payouts_enabled) {
      return Response.json({ error: 'Stripe setup incomplete. Finish onboarding to use instant payouts.' }, { status: 400 });
    }

    // Calculate current balance from completed, unpaid jobs this pay period.
    const periodStart = getPayPeriodStartUTC();
    const completedJobs = await base44.asServiceRole.entities.Job.filter({
      status: 'completed',
      booked_by: email
    });
    const eligible = completedJobs.filter(j =>
      j.from_booking === true &&
      j.completed_at &&
      new Date(j.completed_at) >= periodStart &&
      !j.paid_out_at &&
      clientPaymentCleared(j)
    );

    // Jobs that are complete but whose client payment hasn't settled yet.
    const pendingJobs = completedJobs.filter(j =>
      j.from_booking === true &&
      j.completed_at &&
      new Date(j.completed_at) >= periodStart &&
      !j.paid_out_at &&
      !clientPaymentCleared(j)
    );
    const pendingAmount = pendingJobs.reduce((sum, j) => sum + (j.pay_rate || 0), 0);

    const grossAmount = eligible.reduce((sum, j) => sum + (j.pay_rate || 0), 0);
    if (grossAmount <= 0) {
      return Response.json({
        error: pendingAmount > 0
          ? `Your funds are still clearing. $${pendingAmount.toFixed(2)} will be available for instant payout within 1–2 business days.`
          : 'No balance available for instant payout.'
      }, { status: 400 });
    }

    // Calculate fee and net amount.
    const fee = Math.max(grossAmount * INSTANT_PAYOUT_FEE_RATE, INSTANT_PAYOUT_MIN_FEE);
    const netAmount = grossAmount - fee;

    // Transfer balance to the partner's Connect account.
    const transfer = await stripe.transfers.create({
      amount: Math.round(grossAmount * 100),
      currency: 'usd',
      destination: accountId,
      metadata: {
        media_partner_email: email,
        payout_type: 'instant',
        pay_period_start: periodStart.toISOString()
      }
    });

    // Attempt the instant payout from the Connect account to their debit card.
    let payout;
    try {
      payout = await stripe.payouts.create({
        amount: Math.round(grossAmount * 100),
        currency: 'usd',
        method: 'instant',
        metadata: {
          media_partner_email: email,
          payout_type: 'instant'
        }
      }, { stripeAccount: accountId });
    } catch (payoutErr) {
      // Reverse the transfer so the balance stays available for the next Friday payout.
      await stripe.transfers.createReversal(transfer.id);
      const msg = payoutErr.message || 'Instant payout failed.';
      return Response.json({
        error: `${msg} Make sure you have a debit card linked to your Stripe account — instant payouts require one.`
      }, { status: 400 });
    }

    // Record in PayoutHistory.
    await base44.asServiceRole.entities.PayoutHistory.create({
      media_partner_email: email,
      media_partner_name: rec.record.full_name || '',
      amount: grossAmount,
      payout_method: 'stripe_connect',
      payout_destination: accountId,
      payout_date: new Date().toISOString().slice(0, 10),
      status: 'completed',
      payout_type: 'payout',
      stripe_transfer_id: transfer.id
    });

    // Mark jobs as paid.
    await Promise.all(eligible.map(j =>
      base44.asServiceRole.entities.Job.update(j.id, { paid_out_at: new Date().toISOString() })
    ));

    return Response.json({
      success: true,
      grossAmount,
      fee,
      netAmount,
      transfer_id: transfer.id,
      payout_id: payout.id,
      jobsPaid: eligible.length
    });
  } catch (error) {
    console.error('processInstantPayout error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});