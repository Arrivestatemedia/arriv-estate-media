import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import {
  processFailedAutoFundPayment,
  processSuccessfulAutoFundPayment,
  sendRecoveryReminder,
  createPaymentMethodUpdateSession,
  confirmPaymentMethodUpdate,
  adminOverrideRecoveryHold,
  getRecoveryStatus,
  getRecoveryDashboard,
  processFailedPrepaidPurchase,
  getSubscriptionsNeedingReminders,
  MAX_CONSECUTIVE_FAILURES,
  NOTIFICATION_TYPES,
} from '../../shared/individualPaymentRecoveryEngine.ts';
import { isCertificationId } from '../../shared/certificationMode.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    let user = null;
    try { user = await base44.auth.me(); } catch {}

    const ADMIN_ACTIONS = [
      'get_recovery_dashboard',
      'admin_override_hold',
      'send_reminder',
      'process_reminders',
    ];
    const isAdmin = user && user.role === 'admin';

    if (ADMIN_ACTIONS.includes(action) && !isAdmin) {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // ── get_recovery_status ────────────────────────────────────────────
    if (action === 'get_recovery_status') {
      const { subscription_id, customer_email } = body;
      if (!subscription_id && !customer_email) {
        return Response.json({ error: 'subscription_id or customer_email required' }, { status: 400 });
      }

      // RLS: customer can only see their own
      if (!isAdmin && customer_email && customer_email !== user?.email) {
        return Response.json({ error: 'Access denied' }, { status: 403 });
      }

      const result = await getRecoveryStatus(base44.asServiceRole, { subscription_id, customer_email });
      if (result.error) return Response.json(result, { status: 404 });
      return Response.json(result);
    }

    // ── create_update_link ──────────────────────────────────────────────
    if (action === 'create_update_link') {
      const { subscription_id } = body;
      if (!subscription_id) return Response.json({ error: 'subscription_id required' }, { status: 400 });

      // Determine customer email
      let customerEmail = body.customer_email || user?.email || '';
      if (!customerEmail) {
        return Response.json({ error: 'customer_email required (not authenticated)' }, { status: 401 });
      }

      // RLS: customer can only create link for their own subscription
      // Admin can create for any
      const certMode = isCertificationId(customerEmail);

      const result = await createPaymentMethodUpdateSession(base44.asServiceRole, {
        subscription_id,
        customer_email: customerEmail,
        cert_mode: certMode,
      });

      if (result.status === 'error') return Response.json(result);
      return Response.json(result);
    }

    // ── confirm_method_update ──────────────────────────────────────────
    if (action === 'confirm_method_update') {
      const { subscription_id, stripe_session_id, recovery_token } = body;
      if (!subscription_id) return Response.json({ error: 'subscription_id required' }, { status: 400 });

      // Verify the caller owns this subscription (unless admin)
      const subResults = await base44.asServiceRole.entities.AutoFundSubscription.filter(
        { id: subscription_id },
        undefined,
        1
      );
      const subArr = Array.isArray(subResults) ? subResults : (subResults?.data || []);
      const sub = subArr[0];

      if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });

      if (!isAdmin && sub.customer_email !== user?.email) {
        return Response.json({ error: 'Access denied — you do not own this subscription' }, { status: 403 });
      }

      const certMode = isCertificationId(sub.customer_email);

      const result = await confirmPaymentMethodUpdate(base44.asServiceRole, {
        subscription_id,
        stripe_session_id,
        recovery_token,
        cert_mode: certMode,
      });

      if (result.status === 'error') return Response.json(result);
      return Response.json(result);
    }

    // ── get_recovery_dashboard (admin) ─────────────────────────────────
    if (action === 'get_recovery_dashboard') {
      const result = await getRecoveryDashboard(base44.asServiceRole);
      return Response.json(result);
    }

    // ── admin_override_hold (admin) ─────────────────────────────────────
    if (action === 'admin_override_hold') {
      const { subscription_id, reason } = body;
      if (!subscription_id) return Response.json({ error: 'subscription_id required' }, { status: 400 });

      const subResults = await base44.asServiceRole.entities.AutoFundSubscription.filter(
        { id: subscription_id },
        undefined,
        1
      );
      const subArr = Array.isArray(subResults) ? subResults : (subResults?.data || []);
      const sub = subArr[0];

      if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });

      const certMode = isCertificationId(sub.customer_email);

      const result = await adminOverrideRecoveryHold(base44.asServiceRole, {
        subscription_id,
        reason: reason || 'Admin override',
        admin_email: user?.email || 'admin',
        cert_mode: certMode,
      });

      if (result.status === 'error') return Response.json(result);
      return Response.json(result);
    }

    // ── send_reminder (admin/scheduled) ────────────────────────────────
    if (action === 'send_reminder') {
      const { subscription_id, reminder_type } = body;
      if (!subscription_id) return Response.json({ error: 'subscription_id required' }, { status: 400 });
      if (!['day_3', 'day_7'].includes(reminder_type)) {
        return Response.json({ error: 'reminder_type must be day_3 or day_7' }, { status: 400 });
      }

      const subResults = await base44.asServiceRole.entities.AutoFundSubscription.filter(
        { id: subscription_id },
        undefined,
        1
      );
      const subArr = Array.isArray(subResults) ? subResults : (subResults?.data || []);
      const sub = subArr[0];

      if (!sub) return Response.json({ error: 'Subscription not found' }, { status: 404 });

      const certMode = isCertificationId(sub.customer_email);

      const result = await sendRecoveryReminder(base44.asServiceRole, {
        subscription_id,
        reminder_type,
        cert_mode: certMode,
      });

      return Response.json(result);
    }

    // ── process_reminders (scheduled — processes all due reminders) ───
    if (action === 'process_reminders') {
      const { day_3, day_7 } = await getSubscriptionsNeedingReminders(base44.asServiceRole);

      const results = [];
      for (const sub of day_3) {
        const r = await sendRecoveryReminder(base44.asServiceRole, {
          subscription_id: sub.id,
          reminder_type: 'day_3',
          cert_mode: false,
        });
        results.push({ subscription_id: sub.id, type: 'day_3', ...r });
      }
      for (const sub of day_7) {
        const r = await sendRecoveryReminder(base44.asServiceRole, {
          subscription_id: sub.id,
          reminder_type: 'day_7',
          cert_mode: false,
        });
        results.push({ subscription_id: sub.id, type: 'day_7', ...r });
      }

      return Response.json({
        status: 'processed',
        day_3_sent: day_3.length,
        day_7_sent: day_7.length,
        results,
      });
    }

    // ── process_failed_payment (called internally or by cert tests) ────
    if (action === 'process_failed_payment') {
      const { payment_event_id, subscription_id, customer_id, customer_email, customer_name,
              wallet_id, amount_charged, failure_reason, event_type, cert_mode } = body;

      if (!payment_event_id) return Response.json({ error: 'payment_event_id required' }, { status: 400 });
      if (!subscription_id) return Response.json({ error: 'subscription_id required' }, { status: 400 });

      const result = await processFailedAutoFundPayment(base44.asServiceRole, {
        payment_event_id,
        subscription_id,
        customer_id,
        customer_email,
        customer_name,
        wallet_id,
        amount_charged,
        failure_reason: failure_reason || 'Payment declined',
        event_type: event_type || 'recurring',
        cert_mode: cert_mode === true,
      });

      if (result.status === 'error') return Response.json(result);
      return Response.json(result);
    }

    // ── process_successful_payment (called internally or by cert tests) ─
    if (action === 'process_successful_payment') {
      const { payment_event_id, subscription_id, customer_id, customer_email, customer_name,
              amount_charged, booking_value_added, cert_mode } = body;

      if (!payment_event_id) return Response.json({ error: 'payment_event_id required' }, { status: 400 });
      if (!subscription_id) return Response.json({ error: 'subscription_id required' }, { status: 400 });

      const result = await processSuccessfulAutoFundPayment(base44.asServiceRole, {
        payment_event_id,
        subscription_id,
        customer_id,
        customer_email,
        customer_name,
        amount_charged,
        booking_value_added: booking_value_added || 0,
        cert_mode: cert_mode === true,
      });

      return Response.json(result);
    }

    // ── process_failed_prepaid (called internally or by cert tests) ────
    if (action === 'process_failed_prepaid') {
      const { payment_event_id, customer_id, customer_email, customer_name,
              amount, failure_reason, cert_mode } = body;

      if (!payment_event_id) return Response.json({ error: 'payment_event_id required' }, { status: 400 });
      if (!customer_email) return Response.json({ error: 'customer_email required' }, { status: 400 });

      const result = await processFailedPrepaidPurchase(base44.asServiceRole, {
        payment_event_id,
        customer_id,
        customer_email,
        customer_name,
        amount,
        failure_reason: failure_reason || 'Payment declined',
        cert_mode: cert_mode === true,
      });

      return Response.json(result);
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}