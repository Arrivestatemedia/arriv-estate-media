import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  getMlsPromotionalAllowance,
  evaluateCart,
  resolveMlsPromoEligibility,
  describeAllowance,
  MLS_ALLOWANCE_RULES_VERSION,
  MLS_ALLOWANCE_FEATURE_FLAG_KEY,
  MLS_PROMOTIONAL_ALLOWANCE,
  BUNDLE_MIN_NON_MLS_RETAIL,
  BUNDLE_MIN_MARGIN_PCT,
} from '../../shared/autoFundMlsAllowance.ts';
import { round2, fromCents, toCents } from '../../shared/prepaidEngine.ts';

/**
 * Auto-Fund MLS Promotional Allowance — enforcement, cycle management, and disclosure.
 *
 * STAGING ONLY. Customer-facing enrollment is gated by the
 * `mls_promotional_allowance_enabled` feature flag and is OFF by default.
 *
 * Actions
 *   get_status          — allowance summary for the customer's current cycle (creates it if absent)
 *   evaluate_cart       — bundle qualification + promotional eligibility for a cart
 *   consume             — consume one allowance unit for a booking (idempotent by booking_id)
 *   restore             — return one allowance unit on cancellation/refund (idempotent)
 *   reset_cycle         — open a new cycle (admin/system)
 *   set_allowance_override — admin override of the granted allowance
 *   list_allowances     — admin listing
 *   disclosure          — customer-facing allowance language
 */

function cycleBounds(billingDay: number, now = new Date()) {
  const day = Math.min(Math.max(billingDay || 1, 1), 28);
  const start = new Date(now);
  start.setDate(day);
  start.setHours(0, 0, 0, 0);
  if (start > now) start.setMonth(start.getMonth() - 1);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    let user = null;
    try { user = await base44.auth.me(); } catch {}

    const flagRecords = await base44.asServiceRole.entities.AppSetting.filter(
      { key: MLS_ALLOWANCE_FEATURE_FLAG_KEY }, undefined, 1
    );
    const flagArr = Array.isArray(flagRecords) ? flagRecords : (flagRecords?.data || []);
    const globallyEnabled = flagArr.length > 0 ? flagArr[0].value === 'true' : false;

    const ADMIN_ACTIONS = ['reset_cycle', 'set_allowance_override', 'list_allowances'];
    if (ADMIN_ACTIONS.includes(action)) {
      if (!user || user.role !== 'admin') {
        return Response.json({ error: 'Admin access required' }, { status: 403 });
      }
    }

    const svc = base44.asServiceRole;

    /** Staging/certification bypass: an admin exercising a synthetic cert_ fixture may run the logic while the production flag stays off. */
    function stagingAllowed(sub: any) {
      const isCertFixture = typeof sub?.customer_email === 'string' && sub.customer_email.startsWith('cert_');
      return globallyEnabled || (user?.role === 'admin' && isCertFixture);
    }

    /** Optional admin override of the granted allowance, stored as an AppSetting (never on the subscription schema). */
    async function readAllowanceOverride(subscriptionId: string) {
      const key = `mls_allowance_override_${subscriptionId}`;
      const r = await svc.entities.AppSetting.filter({ key }, undefined, 1);
      const arr = Array.isArray(r) ? r : (r?.data || []);
      if (!arr.length) return null;
      const n = parseInt(arr[0].value, 10);
      return Number.isFinite(n) ? n : null;
    }

    // ── Resolve the subscription for a customer / subscription id ───────────
    async function resolveSubscription() {
      if (body.subscription_id) return await svc.entities.AutoFundSubscription.get(body.subscription_id);
      if (body.customer_email) {
        const r = await svc.entities.AutoFundSubscription.filter(
          { customer_email: body.customer_email, status: { $in: ['active', 'paused'] } }, '-created_date', 1
        );
        const arr = Array.isArray(r) ? r : (r?.data || []);
        return arr[0] || null;
      }
      return null;
    }

    /** Find or open the allowance record for the subscription's current cycle. */
    async function ensureCycleRecord(sub: any) {
      const { start, end } = cycleBounds(sub.billing_day_of_month);
      const override = await readAllowanceOverride(sub.id);
      const granted = override !== null ? override : getMlsPromotionalAllowance(sub.amount);
      const existing = await svc.entities.AutoFundMlsAllowance.filter(
        { subscription_id: sub.id, billing_cycle_start: start.toISOString() }, undefined, 1
      );
      const arr = Array.isArray(existing) ? existing : (existing?.data || []);
      if (arr[0]) return arr[0];
      return await svc.entities.AutoFundMlsAllowance.create({
        subscription_id: sub.id,
        customer_id: sub.customer_id,
        customer_email: sub.customer_email,
        tier_amount: sub.amount,
        billing_cycle_start: start.toISOString(),
        billing_cycle_end: end.toISOString(),
        allowance_granted: granted,
        allowance_used: 0,
        consumed_booking_ids: [],
        rules_version: MLS_ALLOWANCE_RULES_VERSION,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    if (action === 'get_status') {
      const sub = await resolveSubscription();
      if (!sub) return Response.json({ error: 'Auto-Fund subscription not found' }, { status: 404 });
      if (user && user.role !== 'admin' && sub.customer_email !== user.email) {
        return Response.json({ error: 'Access denied' }, { status: 403 });
      }
      if (!stagingAllowed(sub)) {
        return Response.json({ enabled: false, message: 'MLS promotional allowance is not enabled.' });
      }

      const rec = await ensureCycleRecord(sub);
      const wallet = sub.wallet_id ? await svc.entities.PrepaidWallet.get(sub.wallet_id) : null;
      const granted = rec.allowance_granted ?? 0;
      const used = rec.allowance_used ?? 0;

      return Response.json({
        enabled: true,
        subscription_id: sub.id,
        tier_amount: sub.amount,
        allowance_granted: granted,
        allowance_used: used,
        allowance_remaining: Math.max(0, granted - used),
        billing_cycle_start: rec.billing_cycle_start,
        billing_cycle_end: rec.billing_cycle_end,
        rules_version: rec.rules_version,
        customer_funded_bv: wallet
          ? fromCents(Math.max(0, (wallet.booking_value_balance_cents ?? toCents(wallet.booking_value_balance || 0)) - 0))
          : 0,
        promotional_bv_note: 'Promotional and cash-funded Booking Value are tracked separately. Promotional value never counts as collected cash.',
        allowance_is_a_limit_on_bookings: false,
        options_when_exhausted: [
          { key: 'bundle', label: 'Build a Bundle', description: `Add qualifying photography or video (at least $${BUNDLE_MIN_NON_MLS_RETAIL}) to use promotional Booking Value.` },
          { key: 'add_funds', label: 'Add Funds', description: 'Add cash-funded Booking Value and keep booking standalone MLS Walkthroughs without restriction.' },
          { key: 'pay_directly', label: 'Pay Directly', description: 'Pay for the standalone MLS Walkthrough at checkout. No promotional allowance is consumed.' },
        ],
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    if (action === 'evaluate_cart') {
      const items = Array.isArray(body.items) ? body.items : [];
      const evaln = evaluateCart(items);
      const allowance = getMlsPromotionalAllowance(body.tier_amount);
      const eligibility = resolveMlsPromoEligibility({
        tier_amount: body.tier_amount,
        items,
        is_standalone_mls: !!body.is_standalone_mls,
        allowance_used_this_cycle: body.allowance_used_this_cycle || 0,
      });
      return Response.json({
        enabled: globallyEnabled,
        cart: evaln,
        promotional_eligibility: eligibility,
        allowance_granted: allowance,
        rules_version: MLS_ALLOWANCE_RULES_VERSION,
      });
    }

    // ════════════════════════════════════════════════════════════════════════
    if (action === 'consume') {
      const bookingId = body.booking_id;
      if (!bookingId) return Response.json({ error: 'booking_id is required' }, { status: 400 });
      const sub = await resolveSubscription();
      if (!sub) return Response.json({ error: 'Auto-Fund subscription not found' }, { status: 404 });
      if (!stagingAllowed(sub)) return Response.json({ status: 'disabled' });

      const rec = await ensureCycleRecord(sub);
      const consumed = rec.consumed_booking_ids || [];
      if (consumed.includes(bookingId)) {
        return Response.json({ status: 'noop', reason: 'already_consumed', allowance_used: rec.allowance_used });
      }
      if ((rec.allowance_used ?? 0) >= (rec.allowance_granted ?? 0)) {
        return Response.json({
          status: 'blocked',
          reason: 'allowance_exhausted',
          allowance_granted: rec.allowance_granted,
          allowance_used: rec.allowance_used,
        }, { status: 409 });
      }
      await svc.entities.AutoFundMlsAllowance.update(rec.id, {
        allowance_used: (rec.allowance_used ?? 0) + 1,
        consumed_booking_ids: [...consumed, bookingId],
        last_consumed_at: new Date().toISOString(),
      });
      return Response.json({ status: 'consumed', allowance_used: (rec.allowance_used ?? 0) + 1, allowance_granted: rec.allowance_granted });
    }

    // ════════════════════════════════════════════════════════════════════════
    if (action === 'restore') {
      const bookingId = body.booking_id;
      if (!bookingId) return Response.json({ error: 'booking_id is required' }, { status: 400 });
      const sub = await resolveSubscription();
      if (!sub) return Response.json({ error: 'Auto-Fund subscription not found' }, { status: 404 });

      const rec = await ensureCycleRecord(sub);
      const consumed = rec.consumed_booking_ids || [];
      if (!consumed.includes(bookingId)) {
        return Response.json({ status: 'noop', reason: 'not_consumed', allowance_used: rec.allowance_used });
      }
      const nextUsed = Math.max(0, (rec.allowance_used ?? 0) - 1);
      await svc.entities.AutoFundMlsAllowance.update(rec.id, {
        allowance_used: nextUsed,
        consumed_booking_ids: consumed.filter((id: string) => id !== bookingId),
        last_restored_at: new Date().toISOString(),
      });
      return Response.json({ status: 'restored', allowance_used: nextUsed, allowance_granted: rec.allowance_granted });
    }

    // ════════════════════════════════════════════════════════════════════════
    if (action === 'reset_cycle') {
      const sub = await resolveSubscription();
      if (!sub) return Response.json({ error: 'Auto-Fund subscription not found' }, { status: 404 });
      const prior = await svc.entities.AutoFundMlsAllowance.filter(
        { subscription_id: sub.id, billing_cycle_start: body.billing_cycle_start || undefined }, undefined, 50
      );
      const arr = Array.isArray(prior) ? prior : (prior?.data || []);
      // Allowances never accumulate: a new cycle simply starts at zero used.
      const { start, end } = cycleBounds(sub.billing_day_of_month);
      const granted = getMlsPromotionalAllowance(sub.amount);
      const rec = await svc.entities.AutoFundMlsAllowance.create({
        subscription_id: sub.id,
        customer_id: sub.customer_id,
        customer_email: sub.customer_email,
        tier_amount: sub.amount,
        billing_cycle_start: start.toISOString(),
        billing_cycle_end: end.toISOString(),
        allowance_granted: granted,
        allowance_used: 0,
        consumed_booking_ids: [],
        rules_version: MLS_ALLOWANCE_RULES_VERSION,
      });
      return Response.json({ status: 'reset', prior_cycles: arr.length, new_cycle: rec.billing_cycle_start, allowance_granted: granted });
    }

    // ════════════════════════════════════════════════════════════════════════
    if (action === 'set_allowance_override') {
      const sub = await resolveSubscription();
      if (!sub) return Response.json({ error: 'Auto-Fund subscription not found' }, { status: 404 });
      const override = body.allowance_override;
      const key = `mls_allowance_override_${sub.id}`;
      const existing = await svc.entities.AppSetting.filter({ key }, undefined, 1);
      const arr = Array.isArray(existing) ? existing : (existing?.data || []);
      const value = override === null || override === undefined || override === '' ? '' : String(override);
      if (arr[0]) {
        await svc.entities.AppSetting.update(arr[0].id, { value });
      } else if (value !== '') {
        await svc.entities.AppSetting.create({ key, value });
      }
      const rec = await ensureCycleRecord(sub);
      return Response.json({ status: 'success', subscription_id: sub.id, allowance_override: value === '' ? null : Number(value), current_allowance_granted: rec.allowance_granted });
    }

    // ════════════════════════════════════════════════════════════════════════
    if (action === 'list_allowances') {
      const recs = await svc.entities.AutoFundMlsAllowance.filter({}, '-billing_cycle_start', 200);
      const arr = Array.isArray(recs) ? recs : (recs?.data || []);
      return Response.json({ allowances: arr, count: arr.length });
    }

    // ════════════════════════════════════════════════════════════════════════
    if (action === 'disclosure') {
      return Response.json({
        global_enabled: globallyEnabled,
        allowances: MLS_PROMOTIONAL_ALLOWANCE,
        tier_disclosure: Object.keys(MLS_PROMOTIONAL_ALLOWANCE).map(tier => ({
          tier: Number(tier),
          allowance: MLS_PROMOTIONAL_ALLOWANCE[Number(tier)],
          language: describeAllowance(Number(tier)),
        })),
        bundle_rule: `A qualifying bundle contains at least one MLS Walkthrough plus at least $${BUNDLE_MIN_NON_MLS_RETAIL} of non-MLS services, at a blended contribution margin of at least ${BUNDLE_MIN_MARGIN_PCT}%.`,
        not_a_booking_limit: 'The allowance limits only how many standalone MLS Walkthroughs may use promotional Booking Value. It is not a limit on how many MLS Walkthroughs a customer may book.',
        rules_version: MLS_ALLOWANCE_RULES_VERSION,
      });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}