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
import { AUTOFUND_ENROLLMENT_FLAG_KEY, isEnrollmentOpen } from '../../shared/autoFundFinalConfig.ts';

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

    const ADMIN_ACTIONS = ['enroll', 'change_amount', 'pause', 'resume', 'cancel', 'topup', 'list_subscriptions'];
    if (ADMIN_ACTIONS.includes(action)) {
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }
      if (!globalEnabled) {
        return Response.json({ error: 'Prepaid/Auto-Fund feature is not enabled' }, { status: 403 });
      }
    }

    // ════════════════════════════════════════════════════════════════════════
    // ENROLL — create Auto-Fund subscription + link to wallet
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'enroll') {
      // ── Owner launch gate ──────────────────────────────────────────────────
      // Enrollment stays closed until the code flag AND the AppSetting switch are
      // both explicitly on. An absent switch reads as closed, so enrollment cannot
      // reopen as a side effect of any other flag.
      const enrollFlagRecords = await base44.asServiceRole.entities.AppSetting.filter(
        { key: AUTOFUND_ENROLLMENT_FLAG_KEY },
        undefined,
        1
      );
      const enrollFlagArr = Array.isArray(enrollFlagRecords) ? enrollFlagRecords : (enrollFlagRecords?.data || []);
      const enrollmentOpen = isEnrollmentOpen(enrollFlagArr.length > 0 ? enrollFlagArr[0].value : null);
      if (!enrollmentOpen) {
        return Response.json({
          error: 'Auto-Fund enrollment is closed pending owner launch authorization.',
          enrollment_open: false,
        }, { status: 403 });
      }

      const { customer_email, customer_name, customer_phone, amount, sales_rep_id, stripe_subscription_id, stripe_customer_id, billing_day } = body;
      const config = getAutoFundConfig(amount);
      if (!config) return Response.json({ error: 'Invalid amount. Must be one of: ' + AUTO_FUND_AMOUNT_OPTIONS.join(', ') }, { status: 400 });
      if (!customer_email) return Response.json({ error: 'customer_email is required' }, { status: 400 });

      // Find or create Contact (Customer 360)
      const existingContacts = await base44.asServiceRole.entities.Contact.filter({ email: customer_email }, undefined, 1);
      const contactArr = Array.isArray(existingContacts) ? existingContacts : (existingContacts?.data || []);
      let contact = contactArr[0];
      if (!contact) {
        const nameParts = (customer_name || '').trim().split(/\s+/);
        contact = await base44.asServiceRole.entities.Contact.create({
          email: customer_email,
          firstname: nameParts[0] || customer_name || '',
          lastname: nameParts.slice(1).join(' ') || '',
          phone: customer_phone || '',
          lifecycle_stage: 'customer',
          lead_status: 'CONNECTED',
          sales_member_id: sales_rep_id || '',
        });
      }

      // Check for existing active Auto-Fund subscription
      const existingSubs = await base44.asServiceRole.entities.AutoFundSubscription.filter(
        { customer_id: contact.id, status: { $in: ['active', 'paused'] } },
        undefined,
        1
      );
      const subArr = Array.isArray(existingSubs) ? existingSubs : (existingSubs?.data || []);
      if (subArr.length > 0) {
        return Response.json({ error: 'Customer already has an active Auto-Fund subscription', subscription_id: subArr[0].id }, { status: 409 });
      }

      // Find or create wallet
      const existingWallets = await base44.asServiceRole.entities.PrepaidWallet.filter({ customer_id: contact.id }, undefined, 1);
      const walletArr = Array.isArray(existingWallets) ? existingWallets : (existingWallets?.data || []);
      let wallet = walletArr[0];
      const nowIso = new Date().toISOString();

      if (!wallet) {
        wallet = await base44.asServiceRole.entities.PrepaidWallet.create({
          customer_id: contact.id,
          customer_email: contact.email,
          customer_name: customer_name || `${contact.firstname || ''} ${contact.lastname || ''}`.trim(),
          tier: 'STARTER',
          support_tier: config.support_tier,
          credits_balance: 0,
          booking_value_balance: 0,
          total_credits_issued: 0,
          total_booking_value_issued: 0,
          total_credits_redeemed: 0,
          total_booking_value_redeemed: 0,
          total_credits_expired: 0,
          total_booking_value_expired: 0,
          promotional_benefits_available: 0,
          promotional_benefits_used: 0,
          sales_rep_id: sales_rep_id || '',
          sales_rep_email: '',
          status: 'active',
          feature_flag_enabled: true,
          created_at: nowIso,
          updated_at: nowIso,
        });
      }

      // Resolve rep email
      let repEmail = '';
      if (sales_rep_id) {
        try {
          const rep = await base44.asServiceRole.entities.SalesTeamMember.get(sales_rep_id);
          if (rep) repEmail = rep.email || '';
        } catch {}
      }

      const billingDay = billing_day || new Date().getDate();
      const nextBilling = new Date();
      nextBilling.setDate(billingDay);
      if (nextBilling <= new Date()) nextBilling.setMonth(nextBilling.getMonth() + 1);

      const subscription = await base44.asServiceRole.entities.AutoFundSubscription.create({
        customer_id: contact.id,
        customer_email: contact.email,
        customer_name: customer_name || wallet.customer_name || '',
        wallet_id: wallet.id,
        amount: config.amount,
        plan_id: config.plan_id,
        status: 'active',
        stripe_subscription_id: stripe_subscription_id || '',
        stripe_customer_id: stripe_customer_id || '',
        sales_rep_id: sales_rep_id || '',
        sales_rep_email: repEmail,
        billing_day_of_month: billingDay,
        next_billing_date: nextBilling.toISOString(),
        feature_flag_enabled: true,
        created_at: nowIso,
        updated_at: nowIso,
      });

      return Response.json({
        status: 'success',
        subscription_id: subscription.id,
        wallet_id: wallet.id,
        contact_id: contact.id,
        amount: config.amount,
        plan_id: config.plan_id,
        booking_value_per_cycle: config.booking_value,
        next_billing_date: nextBilling.toISOString(),
        benefits: config.benefits,
        support_tier: config.support_tier,
      });
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
      if (sub.status === 'cancelled') return Response.json({ error: 'Cannot change amount on a cancelled subscription' }, { status: 400 });

      const nowIso = new Date().toISOString();
      await base44.asServiceRole.entities.AutoFundSubscription.update(sub.id, {
        amount: config.amount,
        plan_id: config.plan_id,
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

      const nowIso = new Date().toISOString();
      await base44.asServiceRole.entities.AutoFundSubscription.update(sub.id, {
        status: 'cancelled',
        cancelled_at: nowIso,
        cancel_reason: reason || '',
        updated_at: nowIso,
      });

      return Response.json({
        status: 'success',
        subscription_id: sub.id,
        new_status: 'cancelled',
        message: 'Auto-Fund cancelled. Existing wallet value and transaction history preserved. Customer may continue booking with remaining balance.',
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
        payment_history: payments.map(p => ({
          payment_event_id: p.payment_event_id,
          date: p.processed_at,
          amount: p.amount_charged,
          status: p.status,
          event_type: p.event_type,
          booking_value_added: p.booking_value_issued,
          failure_reason: p.failure_reason || '',
        })),
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

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}