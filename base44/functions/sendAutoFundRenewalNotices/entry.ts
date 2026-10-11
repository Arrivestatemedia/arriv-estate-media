import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  isRenewalNoticeDue,
  renewalCycleKey,
  unconfirmedJurisdictions,
} from '../../shared/autoFundRenewalPolicy.ts';
import { normalizeJurisdictionState } from '../../shared/autoFundJurisdiction.ts';
import { sendRenewalNotice } from '../../shared/autoFundMembershipNotices.ts';

// ============================================================================
// SEND AUTO-FUND RENEWAL NOTICES
// ============================================================================
// Scheduled. Evaluates every actively-billing Auto-Fund subscription against the
// renewal-notice rule for ITS OWN stored billing jurisdiction and sends an
// advance notice only where one is genuinely due. Idempotent per renewal cycle,
// so a re-run, a retry, or two schedulers overlapping cannot send the same
// customer two notices for one cycle.
//
// A monthly renewal is NOT assumed to require its own advance reminder in every
// jurisdiction — eligibility is decided by the resolved rule, and every notice
// records which rule was applied and whether that cadence has been confirmed by
// counsel yet.
//
// JURISDICTION IS REQUIRED. A subscription whose jurisdiction is missing or
// invalid receives NO notice. It is reported here as `jurisdiction_missing` so
// the gap is corrected — sending a generic 7-day reminder instead would look
// like compliance while being none. There is no bulk jurisdiction override:
// each subscription answers for its own captured jurisdiction.
//
// dry_run: reports what WOULD be sent without sending anything.
// ============================================================================

const CONCURRENCY = 5;

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const certMode = body?.cert_mode === true;
    const limit = Math.min(Number(body?.limit) || 200, 500);

    const subsRes = await base44.asServiceRole.entities.AutoFundSubscription.filter(
      { status: 'active' },
      'next_billing_date',
      limit
    );
    const subs = Array.isArray(subsRes) ? subsRes : (subsRes?.data || []);

    const due = [];
    let notDue = 0;
    // Subscriptions that CANNOT be notified because the jurisdiction is unknown.
    // Surfaced rather than defaulted, and never silently given a generic rule.
    const jurisdictionMissing = [];
    const flaggedForReview = [];

    for (const sub of subs) {
      if (!normalizeJurisdictionState(sub.jurisdiction_state)) {
        jurisdictionMissing.push({
          subscription_id: sub.id,
          customer_email: sub.customer_email,
          billing_state_as_provided: sub.billing_state || '',
          reason: 'Jurisdiction missing or invalid — no notice sent. Correct the billing jurisdiction.',
        });
        continue;
      }
      if (sub.jurisdiction_needs_review === true) {
        flaggedForReview.push({
          subscription_id: sub.id,
          customer_email: sub.customer_email,
          jurisdiction_state: sub.jurisdiction_state,
          review_reason: sub.jurisdiction_review_reason || '',
        });
      }

      const verdict = isRenewalNoticeDue(sub, new Date());
      if (verdict.due) due.push({ sub, verdict });
      else notDue++;
    }

    const jurisdictionSummary = {
      missing_or_invalid: jurisdictionMissing.length,
      flagged_for_review: flaggedForReview.length,
      missing_or_invalid_subscriptions: jurisdictionMissing,
      flagged_for_review_subscriptions: flaggedForReview,
      unconfirmed_jurisdiction_cadences: unconfirmedJurisdictions(),
    };

    if (dryRun) {
      return Response.json({
        status: 'success',
        dry_run: true,
        scanned: subs.length,
        would_send: due.map(d => ({
          subscription_id: d.sub.id,
          customer_email: d.sub.customer_email,
          jurisdiction_state: d.sub.jurisdiction_state,
          renewal_date: d.verdict.renewal_date,
          rule_applied: d.verdict.rule?.rule_id || '',
          advance_notice_days: d.verdict.rule?.advance_notice_days ?? null,
          statutory_cadence_confirmed: d.verdict.rule?.statutory_cadence_confirmed ?? false,
        })),
        not_due: notDue,
        jurisdiction: jurisdictionSummary,
      });
    }

    const results = [];
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    // Small concurrent batches — bounded so a large run cannot exhaust the
    // worker's outbound connection limit or trip the mail provider's rate limit.
    for (let i = 0; i < due.length; i += CONCURRENCY) {
      const batch = due.slice(i, i + CONCURRENCY);
      const settled = await Promise.allSettled(
        batch.map(({ sub, verdict }) =>
          sendRenewalNotice({
            base44: base44.asServiceRole,
            subscription: sub,
            rule: verdict.rule,
            cycleKey: renewalCycleKey(sub.id, verdict.renewal_date),
            cert_mode: certMode,
          })
        )
      );

      settled.forEach((outcome, idx) => {
        const { sub, verdict } = batch[idx];
        if (outcome.status === 'fulfilled') {
          const r = outcome.value;
          if (r.delivery_status === 'sent') sent++;
          else if (r.delivery_status === 'skipped') skipped++;
          else failed++;
          results.push({
            subscription_id: sub.id,
            notice_id: r.notice_id,
            outcome: r.status,
            delivery_status: r.delivery_status,
            delivery_attempts: r.delivery_attempts,
            jurisdiction_state: sub.jurisdiction_state,
            rule_applied: verdict.rule?.rule_id || '',
            renewal_date: verdict.renewal_date,
          });
        } else {
          failed++;
          results.push({
            subscription_id: sub.id,
            outcome: 'error',
            error: String(outcome.reason?.message || outcome.reason).slice(0, 300),
          });
        }
      });
    }

    return Response.json({
      status: 'success',
      scanned: subs.length,
      due: due.length,
      sent,
      failed,
      skipped,
      not_due: notDue,
      jurisdiction: jurisdictionSummary,
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}