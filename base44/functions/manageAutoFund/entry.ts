import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  AUTO_FUND_AMOUNT_OPTIONS,
  AUTO_FUND_AMOUNTS,
  getAutoFundConfig,
  PREPAID_FEATURE_FLAG_KEY,
  generateId,
  round2,
  toCents,
  fromCents,
} from '../../shared/prepaidEngine.ts';
import { processAutoFundPayment } from '../../shared/autoFundProcessor.ts';
import {
  AUTOFUND_ENROLLMENT_FLAG_KEY,
  AUTOFUND_MEMBERSHIP_FEE,
  isEnrollmentOpen,
  getMembershipFee,
  getTotalMonthlyCharge,
  buildEnrollmentDisclosure,
} from '../../shared/autoFundFinalConfig.ts';
import { enrollAutoFund, CURRENT_TERMS_VERSION } from '../../shared/autoFundEnrollment.ts';
import {
  buildBillingHistory,
  buildChargeDisclosure,
  DEFAULT_FEE_REFUND_POLICY,
} from '../../shared/autoFundMembershipBilling.ts';
import { buildComplianceDisclosure } from '../../shared/autoFundComplianceDisclosure.ts';
import {
  sendEnrollmentAcknowledgment,
  sendCancellationConfirmation,
  listNoticesForSubscription,
} from '../../shared/autoFundMembershipNotices.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    // ── Feature flag check ────────────────────────────────────────────────
    const flagRecords = await base44.asServiceRole.entities.AppSetting.filter(
      { key: PREPAID_FEATURE_FLAG_KEY },
      undefined,
      1
    );
    const flagArr = Array.isArray(flagRecords) ? flagRecords : (flagRecords?.data || []);
    const globalEnabled = flagArr.length > 0 ? flagArr[0].value === 'true' : false;

    let user = null;
    try { user = await base44.auth.me(); } catch {}

    // Actions only an administrator (or the sales-assisted channel) may perform.
    const ADMIN_ACTIONS = ['enroll', 'topup', 'list_subscriptions'];

    if (ADMIN_ACTIONS.includes(action)) {
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }
      if (!globalEnabled) {
        return Response.json({ error: 'Prepaid/Auto-Fund feature is not enabled' }, { status: 403 });
      }
    }

    const isAdmin = !!user && user.role === 'admin';

    /**
     * A signed-in customer may manage THEIR OWN membership from their dashboard; an
     * administrator may act on any. Enforced on every self-service action, so one
     * customer can never re-price, pause or cancel another customer's membership.
     */
    const assertOwnership = (sub: any) => {
      if (isAdmin) return true;
      if (!user) return false;
      return !!sub && !!sub.customer_email && sub.customer_email === user.email;
    };

    // ════════════════════════════════════════════════════════════════════════
    // GET_TIER_CATALOG — the ONE authoritative five-tier configuration
    // ════════════════════════════════════════════════════════════════════════
    // Every customer-facing surface renders from this, so a tier amount, bonus,
    // membership fee or total recurring charge is never duplicated in the UI.
    if (action === 'get_tier_catalog') {
      const switchResp = await base44.asServiceRole.entities.AppSetting.filter(
        { key: AUTOFUND_ENROLLMENT_FLAG_KEY },
        undefined,
        1
      );
      const switchArr = Array.isArray(switchResp) ? switchResp : (switchResp?.data || []);
      const switchValue = switchArr.length > 0 ? switchArr[0].value : null;

      // The renewal date a new enrollment would carry today — mirrors the exact
      // calculation the enrollment engine performs, so the pre-authorization
      // disclosure matches what the customer will actually be billed.
      const nowForDisclosure = new Date();
      const billingDayForDisclosure = nowForDisclosure.getDate();
      const nextRenewalForDisclosure = new Date();
      nextRenewalForDisclosure.setDate(billingDayForDisclosure);
      if (nextRenewalForDisclosure <= nowForDisclosure) {
        nextRenewalForDisclosure.setMonth(nextRenewalForDisclosure.getMonth() + 1);
      }

      const tiers = AUTO_FUND_AMOUNT_OPTIONS.map(amount => {
        const cfg = getAutoFundConfig(amount)!;
        const fee = AUTOFUND_MEMBERSHIP_FEE[amount] ?? 0;
        const vip = cfg.vip === true;
        return {
          amount,
          tier_name: cfg.tier_name || `$${amount}`,
          plan_id: cfg.plan_id,
          bonus_pct: cfg.bonus_pct,
          bonus_booking_value: cfg.bonus_booking_value,
          booking_value: cfg.booking_value,
          membership_fee: fee,
          total_monthly_charge: amount + fee,
          credits: cfg.credits,
          benefits: cfg.benefits,
          support_priority: cfg.support_priority,
          vip,
          promotional_credit_usable_on_standalone_mls: !vip,
          disclosure: buildEnrollmentDisclosure(amount, vip),
          // The SAME authoritative compliance package both enrollment channels
          // render, so a material pre-authorization disclosure can never differ
          // between self-service and sales-assisted enrollment.
          compliance_disclosure: buildComplianceDisclosure({
            tierAmount: amount,
            termsVersion: CURRENT_TERMS_VERSION,
            billingDay: billingDayForDisclosure,
            nextRenewalDate: nextRenewalForDisclosure.toDateString(),
            feePolicy: DEFAULT_FEE_REFUND_POLICY,
          }),
        };
      });

      return Response.json({
        status: 'success',
        tiers,
        tier_count: tiers.length,
        enrollment_open: isEnrollmentOpen(switchValue),
        enrollment_gate: {
          app_setting_key: AUTOFUND_ENROLLMENT_FLAG_KEY,
          app_setting_present: switchArr.length > 0,
          note: 'Public enrollment stays closed until the owner activates the launch gate.',
        },
        membership_fee_statement:
          'The membership fee is collected revenue. It is never spendable Booking Value, never earns promotional credit and never pays sales commission.',
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // ENROLL — create Auto-Fund subscription + link to wallet
    // ════════════════════════════════════════════════════════════════════════
    // ════════════════════════════════════════════════════════════════════════
    // ENROLL — admin / sales-assisted provisioning (shared enrollment engine)
    // ════════════════════════════════════════════════════════════════════════
    // Pricing, benefits and disclosure are resolved INSIDE the shared engine from
    // the canonical configuration. No financial value is accepted from the caller,
    // so an advisor cannot modify a bonus, a membership fee or a tier price.
    if (action === 'enroll') {
      const {
        customer_email, customer_name, customer_phone, amount,
        sales_rep_id, attribution_source, terms_accepted, terms_accepted_by,
        stripe_subscription_id, stripe_customer_id, billing_day, fee_refund_policy,
      } = body;

      const result = await enrollAutoFund({
        base44: base44.asServiceRole,
        channel: attribution_source === 'advisor_enrolled' ? 'sales_assisted' : 'admin',
        tier_amount: amount,
        customer_email,
        customer_name,
        customer_phone,
        sales_rep_id,
        attribution_source: attribution_source === 'advisor_enrolled' ? 'advisor_enrolled' : 'admin_assigned',
        terms_accepted: terms_accepted === true,
        terms_accepted_by,
        fee_refund_policy,
        stripe_subscription_id,
        stripe_customer_id,
        billing_day,
        actor: user?.email || 'admin',
      });

      if (result.status !== 'enrolled') {
        const code = result.status === 'enrollment_closed' ? 403 : (result.status === 'already_enrolled' ? 409 : 400);
        return Response.json(result, { status: code });
      }

      // Durable enrollment acknowledgment: the customer's own record of the tier,
      // the recurring-charge breakdown, billing frequency and renewal date, the
      // terms version, the refund policy and how to cancel. Recorded with its
      // delivery outcome. A delivery failure is recorded and surfaced — it never
      // rolls back a completed enrollment.
      const enrolledSub = await base44.asServiceRole.entities.AutoFundSubscription.get(result.subscription_id);
      const ack = await sendEnrollmentAcknowledgment({
        base44: base44.asServiceRole,
        subscription: enrolledSub,
        billingDay,
      });

      return Response.json({ ...result, enrollment_notice: ack });
    }

    // ════════════════════════════════════════════════════════════════════════
    // SELF_SERVICE_ENROLL — the customer enrolls themselves from the website
    // ════════════════════════════════════════════════════════════════════════
    // Same engine, same pricing, same disclosure as the assisted channel. The
    // customer accepts the recurring-charge terms themselves. A self-service
    // enrollment with no VERIFIED advisor involvement generates NO commission.
    if (action === 'self_service_enroll') {
      if (!user) return Response.json({ error: 'Sign in to enroll in Auto-Fund.' }, { status: 401 });
      if (!globalEnabled) {
        return Response.json({ error: 'Auto-Fund is not available.' }, { status: 403 });
      }

      const {
        amount, customer_name, customer_phone, sales_rep_id,
        attribution_source, terms_accepted, fee_refund_policy, billing_day,
      } = body;

      const result = await enrollAutoFund({
        base44: base44.asServiceRole,
        channel: 'self_service',
        tier_amount: amount,
        // The enrolled customer is the SIGNED-IN user — never a caller-supplied
        // address, so one customer cannot enroll another.
        customer_email: user.email,
        customer_name: customer_name || user.full_name || '',
        customer_phone,
        sales_rep_id,
        // Only a deliberate customer choice may carry attribution on this channel.
        attribution_source: attribution_source === 'customer_selected_advisor' ? 'customer_selected_advisor' : '',
        terms_accepted: terms_accepted === true,
        terms_accepted_by: terms_accepted ? user.email : '',
        fee_refund_policy,
        billing_day,
        actor: user.email,
      });

      if (result.status !== 'enrolled') {
        const code = result.status === 'enrollment_closed' ? 403 : (result.status === 'already_enrolled' ? 409 : 400);
        return Response.json(result, { status: code });
      }

      // The self-service customer receives the identical acknowledgment email.
      const enrolledSub = await base44.asServiceRole.entities.AutoFundSubscription.get(result.subscription_id);
      const ack = await sendEnrollmentAcknowledgment({
        base44: base44.asServiceRole,
        subscription: enrolledSub,
        billingDay,
      });

      return Response.json({ ...result, enrollment_notice: ack });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CHANGE_AMOUNT — change future billing amount
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'change_amount') {
      const { subscription_id, new_amount } = body;
      const config = getAutoFundConfig(new_amount);
      if (!config) return Response.json({ error: 'Invalid amount' }, { status: 400 });
      if (!subscription_id) return Response.json({ error: 'subscription_id is required' }, { status: 400 });

      const sub = await base44.asServiceRole.entities.AutoFundSubscription.get(subscription_id);
      if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });
      if (!assertOwnership(sub)) return Response.json({ error: 'Access denied' }, { status: 403 });
      if (sub.status === 'cancelled') return Response.json({ error: 'Cannot change amount on a cancelled subscription' }, { status: 400 });

      const nowIso = new Date().toISOString();
      // The membership fee follows the tier: a change that crosses a fee boundary
      // changes the recurring charge too. Both values are re-read from the
      // canonical configuration, never from the request.
      await base44.asServiceRole.entities.AutoFundSubscription.update(sub.id, {
        amount: config.amount,
        plan_id: config.plan_id,
        membership_fee: getMembershipFee(config.amount),
        total_monthly_charge: getTotalMonthlyCharge(config.amount),
        updated_at: nowIso,
      });

      return Response.json({
        status: 'success',
        subscription_id: sub.id,
        new_amount: config.amount,
        new_plan_id: config.plan_id,
        new_booking_value_per_cycle: config.booking_value,
        effective: 'next billing cycle',
        benefits: config.benefits,
        support_tier: config.support_tier,
        charges: buildChargeDisclosure(config.amount),
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // PAUSE — pause Auto-Fund (optionally until a date)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'pause') {
      const { subscription_id, paused_until } = body;
      if (!subscription_id) return Response.json({ error: 'subscription_id is required' }, { status: 400 });

      const sub = await base44.asServiceRole.entities.AutoFundSubscription.get(subscription_id);
      if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });
      if (!assertOwnership(sub)) return Response.json({ error: 'Access denied' }, { status: 403 });
      if (sub.status === 'cancelled') return Response.json({ error: 'Cannot pause a cancelled subscription' }, { status: 400 });

      const nowIso = new Date().toISOString();
      await base44.asServiceRole.entities.AutoFundSubscription.update(sub.id, {
        status: 'paused',
        paused_at: nowIso,
        paused_until: paused_until || '',
        updated_at: nowIso,
      });

      return Response.json({
        status: 'success',
        subscription_id: sub.id,
        new_status: 'paused',
        paused_until: paused_until || null,
        message: 'Auto-Fund paused. Existing wallet value remains usable. No new charges until resumed.',
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // RESUME — resume Auto-Fund
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'resume') {
      const { subscription_id } = body;
      if (!subscription_id) return Response.json({ error: 'subscription_id is required' }, { status: 400 });

      const sub = await base44.asServiceRole.entities.AutoFundSubscription.get(subscription_id);
      if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });
      if (!assertOwnership(sub)) return Response.json({ error: 'Access denied' }, { status: 403 });
      if (sub.status !== 'paused') return Response.json({ error: 'Subscription is not paused' }, { status: 400 });

      const nowIso = new Date().toISOString();
      const nextBilling = new Date();
      nextBilling.setDate(sub.billing_day_of_month || nowIso.slice(8, 10));
      if (nextBilling <= new Date()) nextBilling.setMonth(nextBilling.getMonth() + 1);

      await base44.asServiceRole.entities.AutoFundSubscription.update(sub.id, {
        status: 'active',
        paused_until: '',
        next_billing_date: nextBilling.toISOString(),
        updated_at: nowIso,
      });

      return Response.json({
        status: 'success',
        subscription_id: sub.id,
        new_status: 'active',
        next_billing_date: nextBilling.toISOString(),
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // CANCEL — cancel future Auto-Fund (preserves wallet)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'cancel') {
      const { subscription_id, reason } = body;
      if (!subscription_id) return Response.json({ error: 'subscription_id is required' }, { status: 400 });

      const sub = await base44.asServiceRole.entities.AutoFundSubscription.get(subscription_id);
      if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });
      if (!assertOwnership(sub)) return Response.json({ error: 'Access denied' }, { status: 403 });

      const nowIso = new Date().toISOString();
      // The paid membership-benefit period runs to the renewal date that was
      // scheduled when the customer cancelled, captured before it is cleared.
      const benefitPeriodEnd = sub.next_billing_date || '';

      await base44.asServiceRole.entities.AutoFundSubscription.update(sub.id, {
        status: 'cancelled',
        cancelled_at: nowIso,
        cancel_reason: reason || '',
        // Stop future scheduled recurring charges: clearing the scheduled billing
        // date means nothing can pick this subscription up for a future charge.
        next_billing_date: '',
        paused_until: '',
        updated_at: nowIso,
      });

      // Wallet balance is only ever READ here — cancelling never touches it.
      let wallet = null;
      if (sub.wallet_id) {
        try { wallet = await base44.asServiceRole.entities.PrepaidWallet.get(sub.wallet_id); } catch { wallet = null; }
      }
      const balanceCents = wallet?.booking_value_balance_cents ?? 0;

      // Durable cancellation confirmation, with its delivery outcome recorded.
      const confirmation = await sendCancellationConfirmation({
        base44: base44.asServiceRole,
        subscription: { ...sub, status: 'cancelled', cancelled_at: nowIso },
        wallet,
        cancelledAt: nowIso,
      });

      return Response.json({
        status: 'success',
        subscription_id: sub.id,
        new_status: 'cancelled',
        cancellation_effective_at: nowIso,
        benefit_period_end: benefitPeriodEnd,
        future_charges_stopped: true,
        wallet_balance_preserved: true,
        wallet_balance_cents: balanceCents,
        wallet_balance: balanceCents / 100,
        cancellation_notice: confirmation,
        message: 'Auto-Fund cancelled. No further recurring charges will be made. Existing wallet value and transaction history preserved. Customer may continue booking with remaining balance.',
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // TOPUP — one-time top-up (processes via shared payment processor)
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'topup') {
      const { subscription_id, amount, payment_event_id, stripe_charge_id, sales_rep_id } = body;
      if (!subscription_id) return Response.json({ error: 'subscription_id is required' }, { status: 400 });
      if (!amount || amount <= 0) return Response.json({ error: 'amount must be positive' }, { status: 400 });
      if (!payment_event_id) return Response.json({ error: 'payment_event_id from Arriv Pay is required' }, { status: 400 });

      const sub = await base44.asServiceRole.entities.AutoFundSubscription.get(subscription_id);
      if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });

      // Top-up: no bonus, booking_value = amount. Uses shared processor.
      const result = await processAutoFundPayment({
        base44: base44.asServiceRole,
        payment_event_id,
        subscription_id: sub.id,
        customer_id: sub.customer_id,
        customer_email: sub.customer_email,
        wallet_id: sub.wallet_id,
        amount_charged: amount,
        status: 'succeeded',
        event_type: 'topup',
        sales_rep_id: sales_rep_id || sub.sales_rep_id,
        stripe_charge_id: stripe_charge_id || '',
        actor: user?.email || 'admin',
      });

      return Response.json(result);
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET_SUBSCRIPTION — get subscription + payment history
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'get_subscription') {
      const { subscription_id, customer_id, customer_email } = body;

      let sub = null;
      if (subscription_id) {
        sub = await base44.asServiceRole.entities.AutoFundSubscription.get(subscription_id);
      } else if (customer_id) {
        const subs = await base44.asServiceRole.entities.AutoFundSubscription.filter({ customer_id }, '-created_date', 5);
        const arr = Array.isArray(subs) ? subs : (subs?.data || []);
        sub = arr[0];
      } else if (customer_email) {
        const subs = await base44.asServiceRole.entities.AutoFundSubscription.filter({ customer_email }, '-created_date', 5);
        const arr = Array.isArray(subs) ? subs : (subs?.data || []);
        sub = arr[0];
      }

      if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });

      // RLS
      if (user && user.role !== 'admin' && sub.customer_email !== user.email) {
        return Response.json({ error: 'Access denied' }, { status: 403 });
      }

      const config = getAutoFundConfig(sub.amount);

      // Get payment history
      const paymentsResp = await base44.asServiceRole.entities.AutoFundPaymentEvent.filter(
        { subscription_id: sub.id },
        '-processed_at',
        50
      );
      const payments = Array.isArray(paymentsResp) ? paymentsResp : (paymentsResp?.data || []);

      // Get wallet
      let wallet = null;
      if (sub.wallet_id) {
        wallet = await base44.asServiceRole.entities.PrepaidWallet.get(sub.wallet_id);
      }

      return Response.json({
        subscription: {
          ...sub,
          benefits: config?.benefits || [],
          support_priority: config?.support_priority || 'standard',
          next_booking_value: config?.booking_value || sub.amount,
        },
        // Billing history keeps wallet funding and membership fees visibly SEPARATE,
        // which is the customer-facing counterpart of the ledger separation.
        payment_history: buildBillingHistory(payments),
        charges: buildChargeDisclosure(sub.amount),
        billing_summary: {
          membership_fee_total_collected: round2(
            payments
              .filter(p => (p.charge_component === 'membership_fee' || p.event_type === 'membership_fee') && p.status === 'succeeded')
              .reduce((sum, p) => sum + (p.membership_fee_amount || p.amount_charged || 0), 0)
          ),
          wallet_funding_total_collected: round2(
            payments
              .filter(p => p.charge_component !== 'membership_fee' && p.event_type !== 'membership_fee' && (p.status === 'succeeded' || p.status === 'retry_succeeded'))
              .reduce((sum, p) => sum + (p.amount_charged || 0), 0)
          ),
          note: 'Membership fees are collected revenue. They are never spendable Booking Value and never generate promotional credit or sales commission.',
        },
        enrollment: {
          channel: sub.enrollment_channel || 'admin',
          attribution_verified: sub.attribution_verified === true,
          advisor: sub.attribution_verified ? (sub.sales_rep_email || '') : '',
          terms_accepted_at: sub.terms_accepted_at || '',
          terms_version: sub.terms_version || '',
        },
        wallet: wallet ? {
          credits_balance: wallet.credits_balance,
          // Booking Value must come from the AUTHORITATIVE integer cents. Deriving it
          // from rounded credits drifts on non-integer credit counts — e.g. $1,250 BV
          // is 4.5454... credits, which rounds to 4.55 and displays as $1,251.25.
          booking_value_balance: fromCents(
            wallet.booking_value_balance_cents ?? toCents(wallet.booking_value_balance || 0)
          ),
        } : null,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // LIST_SUBSCRIPTIONS — admin list
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'list_subscriptions') {
      const subsResp = await base44.asServiceRole.entities.AutoFundSubscription.filter(
        { status: { $in: ['active', 'paused'] } },
        '-created_date',
        200
      );
      const subs = Array.isArray(subsResp) ? subsResp : (subsResp?.data || []);
      return Response.json({
        subscriptions: subs.map(s => ({
          ...s,
          booking_value_per_cycle: getAutoFundConfig(s.amount)?.booking_value || s.amount,
        })),
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // REQUEST_ADVISOR — "Speak With a Sales Growth Advisor"
    // ════════════════════════════════════════════════════════════════════════
    // Records a genuine callback request for the sales team. It does NOT enroll,
    // charge, or attribute anything — an advisor may never enroll a customer or
    // accept recurring terms on their behalf.
    if (action === 'request_advisor') {
      if (!user) return Response.json({ error: 'Sign in to request an advisor.' }, { status: 401 });
      const { customer_name, customer_phone, preferred_time, notes } = body;

      const requestId = 'afadv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      await base44.asServiceRole.entities.AutoFundAdvisorRequest.create({
        request_id: requestId,
        customer_email: user.email,
        customer_name: customer_name || user.full_name || '',
        customer_phone: customer_phone || '',
        preferred_time: preferred_time || '',
        notes: notes || '',
        status: 'new',
        source: 'autofund_self_service',
        created_at: new Date().toISOString(),
      });

      return Response.json({
        status: 'success',
        request_id: requestId,
        message: 'Thanks — a Sales Growth Advisor will reach out to walk you through the tiers. You can enroll yourself at any time; an advisor cannot accept the recurring terms for you.',
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    // GET_NOTICES — the membership notice audit trail for one subscription
    // ════════════════════════════════════════════════════════════════════════
    // A customer may read the notices issued to them; an administrator may read
    // any. Every record carries what was sent, when, and whether it was delivered.
    if (action === 'get_notices') {
      const { subscription_id } = body;
      if (!subscription_id) return Response.json({ error: 'subscription_id is required' }, { status: 400 });

      const sub = await base44.asServiceRole.entities.AutoFundSubscription.get(subscription_id);
      if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });
      if (!assertOwnership(sub)) return Response.json({ error: 'Access denied' }, { status: 403 });

      const notices = await listNoticesForSubscription(base44.asServiceRole, sub.id);
      return Response.json({
        subscription_id: sub.id,
        notice_count: notices.length,
        notices: notices.map(n => ({
          notice_id: n.notice_id,
          notice_type: n.notice_type,
          delivery_status: n.delivery_status,
          delivery_attempts: n.delivery_attempts,
          sent_at: n.sent_at || '',
          last_attempt_at: n.last_attempt_at || '',
          failure_reason: n.failure_reason || '',
          terms_version: n.terms_version || '',
          fee_refund_policy: n.fee_refund_policy || '',
          jurisdiction_state: n.jurisdiction_state || '',
          renewal_rule_applied: n.renewal_rule_applied || '',
          statutory_cadence_confirmed: n.statutory_cadence_confirmed === true,
          cancellation_effective_at: n.cancellation_effective_at || '',
          benefit_period_end: n.benefit_period_end || '',
          wallet_balance_preserved: n.wallet_balance_preserved === true,
        })),
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}