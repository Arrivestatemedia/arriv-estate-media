import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import Stripe from 'npm:stripe@17.5.0';
import { findPartnerRecord, getPayPeriodStartUTC, clientPaymentCleared } from '../../shared/stripeConnect.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const periodStart = getPayPeriodStartUTC();

    // Pull every completed booking job this pay period that hasn't been paid out yet.
    const completedJobs = await base44.asServiceRole.entities.Job.filter({ status: 'completed' });
    const eligible = completedJobs.filter(j =>
      j.from_booking === true &&
      j.booked_by &&
      j.completed_at &&
      new Date(j.completed_at) >= periodStart &&
      !j.paid_out_at &&
      clientPaymentCleared(j)
    );

    // Group amounts by partner email.
    const balances = {};
    for (const job of eligible) {
      const email = String(job.booked_by).toLowerCase();
      if (!balances[email]) balances[email] = { amount: 0, jobs: [] };
      balances[email].amount += (job.pay_rate || 0);
      balances[email].jobs.push(job);
    }

    const results = [];
    let totalTransferred = 0;
    let paidPartners = 0;
    const errors = [];

    for (const email of Object.keys(balances)) {
      const { amount, jobs } = balances[email];
      if (!amount || amount <= 0) continue;

      const rec = await findPartnerRecord(base44, email);
      if (!rec) {
        errors.push({ email, reason: 'No partner record found' });
        continue;
      }

      // Only auto-pay partners who chose Stripe Connect and are fully onboarded.
      if (rec.record.payout_method !== 'stripe_connect') continue;
      const accountId = rec.record.stripe_account_id;
      if (!accountId) {
        errors.push({ email, reason: 'No Stripe account' });
        continue;
      }
      if (!rec.record.stripe_payouts_enabled) {
        errors.push({ email, reason: 'Stripe payouts not enabled (onboarding incomplete)' });
        continue;
      }

      try {
        const transfer = await stripe.transfers.create({
          amount: Math.round(amount * 100),
          currency: 'usd',
          destination: accountId,
          metadata: {
            media_partner_email: email,
            pay_period_start: periodStart.toISOString()
          }
        });

        await base44.asServiceRole.entities.PayoutHistory.create({
          media_partner_email: email,
          media_partner_name: rec.record.full_name || '',
          amount,
          payout_method: 'stripe_connect',
          payout_destination: accountId,
          payout_date: new Date().toISOString().slice(0, 10),
          status: 'completed',
          payout_type: 'payout',
          stripe_transfer_id: transfer.id
        });

        await Promise.all(jobs.map(j =>
          base44.asServiceRole.entities.Job.update(j.id, { paid_out_at: new Date().toISOString() })
        ));

        paidPartners++;
        totalTransferred += amount;
        results.push({ email, amount, transfer_id: transfer.id, jobs: jobs.length });
      } catch (err) {
        errors.push({ email, reason: err.message });
      }
    }

    return Response.json({
      success: true,
      paidPartners,
      totalTransferred,
      results,
      errors
    });
  } catch (error) {
    console.error('processWeeklyPayouts error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});