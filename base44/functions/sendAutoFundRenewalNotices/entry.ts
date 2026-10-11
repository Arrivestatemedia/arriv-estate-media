import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  isRenewalNoticeDue,
  renewalCycleKey,
  unconfirmedJurisdictions,
} from '../../shared/autoFundRenewalPolicy.ts';
import { sendRenewalNotice } from '../../shared/autoFundMembershipNotices.ts';

// ============================================================================
// SEND AUTO-FUND RENEWAL NOTICES
// ============================================================================
// Scheduled. Evaluates every actively-billing Auto-Fund subscription against its
// jurisdiction's renewal-notice rule and sends an advance notice only where one
// is actually due. Idempotent per renewal cycle, so a re-run, a retry, or two
// schedulers overlapping cannot send the same customer two notices for one cycle.
//
// A monthly renewal is NOT assumed to require its own reminder in every
// jurisdiction — eligibility is decided by the resolved rule, and every notice
// records which rule was applied and whether that cadence has been confirmed by
// counsel yet.
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
    // Jurisdiction override, for a single-state rollout or an admin re-run.
    // Absent, every subscription resolves to the conservative DEFAULT rule.
    const overrideState = (body?.jurisdiction_state || '').toUpperCase().trim();
    const limit = Math.min(Number(body?.limit) || 200, 500);

    const subsRes = await base44.asServiceRole.entities.AutoFundSubscription.filter(
      { status: 'active' },
      'next_billing_date',
      limit
    );
    const subs = Array.isArray(subsRes) ? subsRes : (subsRes?.data || []);

    const due = [];
    let notDue = 0;
    for (const sub of subs) {
      const verdict = isRenewalNoticeDue(
        { ...sub, jurisdiction_state: overrideState || undefined },
        new Date()
      );
      if (verdict.due) due.push({ sub, verdict });
      else notDue++;
    }

    if (dryRun) {
      return Response.json({
        status: 'success',
        dry_run: true,
        scanned: subs.length,
        would_send: due.map(d => ({
          subscription_id: d.sub.id,
          customer_email: d.sub.customer_email,
          renewal_date: d.verdict.renewal_date,
          rule_applied: d.verdict.rule.rule_id,
          advance_notice_days: d.verdict.rule.advance_notice_days,
          statutory_cadence_confirmed: d.verdict.rule.statutory_cadence_confirmed,
        })),
        not_due: notDue,
        jurisdiction_resolution: overrideState ? 'explicit_override' : 'not_captured_at_enrollment',
        unconfirmed_jurisdiction_cadences: unconfirmedJurisdictions(),
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
            rule_applied: verdict.rule.rule_id,
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
      jurisdiction_resolution: overrideState ? 'explicit_override' : 'not_captured_at_enrollment',
      unconfirmed_jurisdiction_cadences: unconfirmedJurisdictions(),
      results,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}