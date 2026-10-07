import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { secrets } from 'base44:runtime';
import {
  PREPAID_CREDIT_VALUE,
  PREPAID_FEATURE_FLAG_KEY,
  getTierConfig,
  round2,
} from '../../shared/prepaidEngine.ts';

/**
 * Arriv Assist Support Context Endpoint
 *
 * Provides minimum-necessary Customer 360 prepaid support context to Arriv Assist.
 * Estate Media remains the source of truth — Arriv Assist does NOT own these values.
 *
 * Security: validates a shared secret (ARRIV_ASSIST_AUTH_SECRET) via HMAC or bearer token.
 * Does not expose sensitive financial information beyond what is necessary for support routing.
 *
 * Authority boundary: Prepaid may improve context and priority for Arriv Assist,
 * but MUST NOT automatically increase authority. This endpoint is read-only.
 */
export default async function(req) {
  try {
    // ── Auth: validate shared secret ────────────────────────────────────────
    const authSecret = secrets.get("ARRIV_ASSIST_AUTH_SECRET");
    if (!authSecret) {
      return Response.json({ error: 'Support context endpoint not configured' }, { status: 503 });
    }

    const authHeader = req.headers.get('authorization') || '';
    const xArrivAuth = req.headers.get('x-arriv-auth-secret') || '';
    const providedSecret = authHeader.replace(/^Bearer\s+/i, '') || xArrivAuth;

    if (providedSecret !== authSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Feature flag check ───────────────────────────────────────────────────
    const base44 = createClientFromRequest(req);
    const flagRecords = await base44.asServiceRole.entities.AppSetting.filter(
      { key: PREPAID_FEATURE_FLAG_KEY },
      undefined,
      1
    );
    const flagArr = Array.isArray(flagRecords) ? flagRecords : (flagRecords?.data || []);
    const globalEnabled = flagArr.length > 0 ? flagArr[0].value === 'true' : false;
    if (!globalEnabled) {
      return Response.json({ error: 'Prepaid feature is not enabled' }, { status: 403 });
    }

    // ── Parse request ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { customer_id, customer_email } = body;

    if (!customer_id && !customer_email) {
      return Response.json({ error: 'customer_id or customer_email is required' }, { status: 400 });
    }

    // ── Find wallet ──────────────────────────────────────────────────────────
    let wallet = null;
    if (customer_id) {
      const wallets = await base44.asServiceRole.entities.PrepaidWallet.filter({ customer_id }, undefined, 1);
      const arr = Array.isArray(wallets) ? wallets : (wallets?.data || []);
      wallet = arr[0];
    }
    if (!wallet && customer_email) {
      const wallets = await base44.asServiceRole.entities.PrepaidWallet.filter({ customer_email }, undefined, 1);
      const arr = Array.isArray(wallets) ? wallets : (wallets?.data || []);
      wallet = arr[0];
    }

    if (!wallet) {
      return Response.json({
        has_prepaid: false,
        customer_id: customer_id || '',
        customer_email: customer_email || '',
      });
    }

    // ── Get active lots for expiration summary ───────────────────────────────
    const lotsResponse = await base44.asServiceRole.entities.CreditLot.filter(
      { wallet_id: wallet.id, expired: false },
      'fifo_order',
      200
    );
    const lots = Array.isArray(lotsResponse) ? lotsResponse : (lotsResponse?.data || []);
    const now = new Date();
    const activeLots = lots.filter(l => new Date(l.expires_at) > now && l.credits_remaining > 0);

    const earliestExpiry = activeLots.length > 0
      ? activeLots.reduce((earliest, l) => new Date(l.expires_at) < earliest ? new Date(l.expires_at) : earliest, new Date(activeLots[0].expires_at))
      : null;

    const config = getTierConfig(wallet.tier);

    // ── Get active/recent bookings (limited, non-sensitive) ──────────────────
    let activeBookingIds = [];
    let recentBookingIds = [];
    try {
      const bookings = await base44.asServiceRole.entities.Booking.filter(
        { client_email: wallet.customer_email },
        '-created_date',
        10
      );
      const bookingArr = Array.isArray(bookings) ? bookings : (bookings?.data || []);
      const now = new Date();
      activeBookingIds = bookingArr.filter(b => b.status === 'pending' || b.status === 'confirmed').map(b => b.id).slice(0, 5);
      recentBookingIds = bookingArr.slice(0, 5).map(b => b.id);
    } catch {}

    // ── Return minimum-necessary support context ─────────────────────────────
    return Response.json({
      has_prepaid: true,
      customerId: wallet.customer_id,
      customerName: wallet.customer_name,
      accountRelationship: 'prepaid',
      prepaidTier: wallet.tier,
      supportTier: wallet.support_tier,
      walletBookingValue: round2(wallet.credits_balance * PREPAID_CREDIT_VALUE),
      walletCredits: round2(wallet.credits_balance),
      expirationSummary: earliestExpiry ? {
        earliest_expiry: earliestExpiry.toISOString(),
        active_lots: activeLots.length,
      } : { active_lots: 0 },
      eligibleBenefits: config ? config.benefits : [],
      priorityBookingEligible: config ? config.priority_booking : false,
      priorityProcessingEligible: config ? config.priority_processing : false,
      promotionalBenefitsAvailable: wallet.promotional_benefits_available - wallet.promotional_benefits_used,
      activeBookingIds,
      recentBookingIds,
      activeSupportCaseIds: [], // Populated by Arriv Assist integration
      walletStatus: wallet.status,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}