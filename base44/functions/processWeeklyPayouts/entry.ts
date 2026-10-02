import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import Stripe from 'npm:stripe@17.5.0';
import { findPartnerRecord, getPayPeriodStartUTC, clientPaymentCleared } from '../../shared/stripeConnect.ts';
import { syncEarningRecord, buildEarningParamsFromJob } from '../../shared/mediaSpecialistEarningSync.ts';

// Sends an immediate SMS to the admin/owner when the weekly payout run
// hits any error or issue, so it can be investigated before partners miss
// their Friday pay.
async function notifyAdminOfPayoutIssue(summary) {
  try {
    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromPhone = Deno.env.get('TWILIO_PHONE_NUMBER');
    const toPhone = Deno.env.get('ADMIN_PHONE') || Deno.env.get('OWNER_PHONE_NUMBER');
    if (!accountSid || !authToken || !fromPhone || !toPhone) return;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ From: fromPhone, To: toPhone, Body: summary }),
      }
    );
    return response.ok;
  } catch (e) {
    console.warn('notifyAdminOfPayoutIssue: SMS failed:', e.message);
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
    const periodStart = getPayPeriodStartUTC();

    // Pull every booking job whose Media Partner fulfillment is complete (new
    // field) OR whose status is 'completed' (legacy jobs pre-migration). Merge
    // and deduplicate by job ID. Media Partner payout eligibility is based on
    // media_partner_fulfillment_status, NOT Job.status — post-production does
    // NOT delay payouts.
    const fulfilledJobs = await base44.asServiceRole.entities.Job.filter({ media_partner_fulfillment_status: 'completed' });
    const legacyCompleted = await base44.asServiceRole.entities.Job.filter({ status: 'completed' });
    const jobMap = new Map();
    for (const j of fulfilledJobs) jobMap.set(j.id, j);
    for (const j of legacyCompleted) if (!jobMap.has(j.id)) jobMap.set(j.id, j);
    const completedJobs = Array.from(jobMap.values());

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

        // Sync each earning record to Arriv Payroll (document/tax only).
        // Best-effort: a sync failure must NOT block or fail the payout.
        const payoutDate = new Date().toISOString().slice(0, 10);
        const syncResults = [];
        for (const j of jobs) {
          try {
            const params = buildEarningParamsFromJob(j, rec, { transferId: transfer.id, payoutDate });
            const r = await syncEarningRecord(base44, params);
            syncResults.push({ job_id: j.id, synced: r.success, error: r.error || "" });
          } catch (e) {
            syncResults.push({ job_id: j.id, synced: false, error: e.message });
          }
        }

        paidPartners++;
        totalTransferred += amount;
        results.push({ email, amount, transfer_id: transfer.id, jobs: jobs.length, sync: syncResults });
      } catch (err) {
        errors.push({ email, reason: err.message });
      }
    }

    // Safety net: detect fulfilled, unpaid booking jobs whose client payment
    // has cleared but were NOT included in this cycle's eligible set. These are
    // jobs that SHOULD have been paid but were silently skipped — typically
    // because completed_at fell outside the pay-period window or is missing.
    // Without this check, a fulfillment-status bug or pay-period edge case
    // causes a partner to miss their Friday pay with zero admin visibility.
    const paidJobIds = new Set(eligible.map(j => j.id));
    const skippedUnpaid = completedJobs.filter(j =>
      j.from_booking === true &&
      j.booked_by &&
      !j.paid_out_at &&
      clientPaymentCleared(j) &&
      !paidJobIds.has(j.id)
    );
    if (skippedUnpaid.length > 0) {
      const skippedList = skippedUnpaid.slice(0, 10).map(j => {
        const reason = !j.completed_at
          ? 'missing completed_at'
          : new Date(j.completed_at) < periodStart
            ? 'completed before pay-period window'
            : 'unknown';
        return `${j.title || j.id} (${j.booked_by}, $${j.pay_rate || 0}): ${reason}`;
      }).join(' | ');
      await notifyAdminOfPayoutIssue(
        `⚠️ WEEKLY PAYOUT WARNING\n${skippedUnpaid.length} fulfilled job(s) were NOT paid this cycle:\n${skippedList}`.slice(0, 1500)
      );
      for (const s of skippedUnpaid) {
        errors.push({ email: s.booked_by, reason: `Fulfilled but not paid: ${!s.completed_at ? 'missing completed_at' : 'outside pay-period window'}` });
      }
    }

    // Immediate admin SMS if any partner payout failed.
    if (errors.length > 0) {
      const errorList = errors.map(e => `${e.email}: ${e.reason}`).join(' | ');
      await notifyAdminOfPayoutIssue(
        `⚠️ WEEKLY PAYOUT ISSUE\n${errors.length} payout(s) failed:\n${errorList}`.slice(0, 1500)
      );
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
    // Immediate admin SMS on a total run failure.
    await notifyAdminOfPayoutIssue(
      `🚨 WEEKLY PAYOUT FAILED\nThe Friday payout run crashed: ${error.message}`.slice(0, 1500)
    );
    return Response.json({ error: error.message }, { status: 500 });
  }
});