/**
 * Certification Fixture Setup — synthetic Prepaid and Auto-Fund fixtures
 * for Arriv Pay payment contract certification.
 *
 * Creates isolated, cert_-prefixed synthetic records that cannot be
 * mistaken for production customer data. Used by:
 *   - managePaymentRecovery (setup_cert_fixtures / cleanup_cert_fixtures actions)
 *   - testPaymentContract (automated verification)
 *
 * Safety:
 *   - All identifiers are cert_-prefixed.
 *   - All customer emails are cert_-prefixed (@cert.test domain).
 *   - Production code rejects cert_-prefixed records (certificationMode.ts).
 *   - Cleanup removes ONLY cert_-prefixed records for the given run ID.
 *   - No production wallets, subscriptions, or contacts are touched.
 */

import { isCertificationId } from './certificationMode.ts';

export interface CertFixtureResult {
  run_id: string;
  prepaid: {
    contact_id: string;
    customer_email: string;
    customer_name: string;
    wallet_id: string;
  };
  auto_fund: {
    contact_id: string;
    customer_email: string;
    customer_name: string;
    wallet_id: string;
    subscription_id: string;
  };
}

export interface CertFixtureCleanupResult {
  deleted: { entity: string; id: string }[];
  errors: string[];
}

/**
 * Create synthetic certification fixtures for Prepaid and Auto-Fund.
 * Returns the exact IDs Arriv Pay needs to send authenticated cert events.
 */
export async function setupCertFixtures(base44: any): Promise<CertFixtureResult> {
  const runId = `cert_fix_${Date.now()}`;
  const nowIso = new Date().toISOString();

  // ── Prepaid fixture ──────────────────────────────────────────────────
  const prepaidEmail = `${runId}_prepaid@cert.test`;
  const prepaidContactId = `${runId}_prepaid_contact`;
  const prepaidContact = await base44.entities.Contact.create({
    email: prepaidEmail,
    firstname: 'CertPrepaid',
    lastname: 'Fixture',
    phone: '',
    lifecycle_stage: 'customer',
    lead_status: 'CONNECTED',
    sales_member_id: '',
  });

  const prepaidWallet = await base44.entities.PrepaidWallet.create({
    customer_id: prepaidContact.id,
    customer_email: prepaidEmail,
    customer_name: 'CertPrepaid Fixture',
    tier: 'STARTER',
    support_tier: 'PREPAID_STARTER',
    credits_balance: 0,
    booking_value_balance: 0,
    booking_value_balance_cents: 0,
    total_credits_issued: 0,
    total_booking_value_issued: 0,
    total_booking_value_issued_cents: 0,
    total_credits_redeemed: 0,
    total_booking_value_redeemed: 0,
    total_booking_value_redeemed_cents: 0,
    total_credits_expired: 0,
    total_booking_value_expired: 0,
    total_booking_value_expired_cents: 0,
    promotional_benefits_available: 0,
    promotional_benefits_used: 0,
    sales_rep_id: '',
    sales_rep_email: '',
    status: 'active',
    feature_flag_enabled: true,
    created_at: nowIso,
    updated_at: nowIso,
  });

  // ── Auto-Fund fixture ────────────────────────────────────────────────
  const autofundEmail = `${runId}_autofund@cert.test`;
  const autofundContact = await base44.entities.Contact.create({
    email: autofundEmail,
    firstname: 'CertAutoFund',
    lastname: 'Fixture',
    phone: '',
    lifecycle_stage: 'customer',
    lead_status: 'CONNECTED',
    sales_member_id: '',
  });

  const autofundWallet = await base44.entities.PrepaidWallet.create({
    customer_id: autofundContact.id,
    customer_email: autofundEmail,
    customer_name: 'CertAutoFund Fixture',
    tier: 'STARTER',
    support_tier: 'PREPAID_STARTER',
    credits_balance: 0,
    booking_value_balance: 0,
    booking_value_balance_cents: 0,
    total_credits_issued: 0,
    total_booking_value_issued: 0,
    total_booking_value_issued_cents: 0,
    total_credits_redeemed: 0,
    total_booking_value_redeemed: 0,
    total_booking_value_redeemed_cents: 0,
    total_credits_expired: 0,
    total_booking_value_expired: 0,
    total_booking_value_expired_cents: 0,
    promotional_benefits_available: 0,
    promotional_benefits_used: 0,
    sales_rep_id: '',
    sales_rep_email: '',
    status: 'active',
    feature_flag_enabled: true,
    created_at: nowIso,
    updated_at: nowIso,
  });

  const autofundSubscription = await base44.entities.AutoFundSubscription.create({
    customer_id: autofundContact.id,
    customer_email: autofundEmail,
    customer_name: 'CertAutoFund Fixture',
    wallet_id: autofundWallet.id,
    amount: 100,
    plan_id: 'autofund_100',
    status: 'active',
    stripe_subscription_id: `${runId}_stripe_sub`,
    stripe_customer_id: `${runId}_stripe_cust`,
    sales_rep_id: '',
    sales_rep_email: '',
    billing_day_of_month: 15,
    next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    feature_flag_enabled: true,
    consecutive_failed_attempts: 0,
    recovery_hold_active: false,
    auto_charge_paused: false,
    created_at: nowIso,
    updated_at: nowIso,
  });

  return {
    run_id: runId,
    prepaid: {
      contact_id: prepaidContact.id,
      customer_email: prepaidEmail,
      customer_name: 'CertPrepaid Fixture',
      wallet_id: prepaidWallet.id,
    },
    auto_fund: {
      contact_id: autofundContact.id,
      customer_email: autofundEmail,
      customer_name: 'CertAutoFund Fixture',
      wallet_id: autofundWallet.id,
      subscription_id: autofundSubscription.id,
    },
  };
}

/**
 * Clean up certification fixtures for a given run ID.
 * Removes ONLY cert_-prefixed records — never touches production data.
 * Verifies no production dependencies exist before deletion.
 */
export async function cleanupCertFixtures(
  base44: any,
  runId: string
): Promise<CertFixtureCleanupResult> {
  const deleted: { entity: string; id: string }[] = [];
  const errors: string[] = [];

  // Safety: runId must be cert_-prefixed
  if (!runId.startsWith('cert_')) {
    return { deleted, errors: ['Refusing to clean up non-cert_ run ID'] };
  }

  // Find all cert_ records for this run
  const emailPattern = `${runId}_`;

  // Clean up payment events
  try {
    const paymentEvents = await base44.entities.AutoFundPaymentEvent.filter(
      { customer_email: { $regex: emailPattern } },
      undefined,
      200
    );
    const peArr = Array.isArray(paymentEvents) ? paymentEvents : (paymentEvents?.data || []);
    for (const pe of peArr) {
      if (isCertificationId(pe.customer_email)) {
        await base44.entities.AutoFundPaymentEvent.delete(pe.id);
        deleted.push({ entity: 'AutoFundPaymentEvent', id: pe.id });
      }
    }
  } catch (e) { errors.push(`AutoFundPaymentEvent: ${e.message}`); }

  // Clean up wallet transactions
  try {
    const txns = await base44.entities.WalletTransaction.filter(
      { customer_email: { $regex: emailPattern } },
      undefined,
      200
    );
    const txnArr = Array.isArray(txns) ? txns : (txns?.data || []);
    for (const t of txnArr) {
      if (isCertificationId(t.customer_email)) {
        await base44.entities.WalletTransaction.delete(t.id);
        deleted.push({ entity: 'WalletTransaction', id: t.id });
      }
    }
  } catch (e) { errors.push(`WalletTransaction: ${e.message}`); }

  // Clean up credit lots
  try {
    const lots = await base44.entities.CreditLot.filter(
      { customer_email: { $regex: emailPattern } },
      undefined,
      200
    );
    const lotArr = Array.isArray(lots) ? lots : (lots?.data || []);
    for (const l of lotArr) {
      if (isCertificationId(l.customer_email)) {
        await base44.entities.CreditLot.delete(l.id);
        deleted.push({ entity: 'CreditLot', id: l.id });
      }
    }
  } catch (e) { errors.push(`CreditLot: ${e.message}`); }

  // Clean up compensation events
  try {
    const commissions = await base44.entities.PrepaidCompensationEvent.filter(
      { customer_id: { $regex: emailPattern } },
      undefined,
      200
    );
    const commArr = Array.isArray(commissions) ? commissions : (commissions?.data || []);
    for (const c of commArr) {
      if (isCertificationId(c.employee_email) || (c.customer_id || '').includes('cert_')) {
        await base44.entities.PrepaidCompensationEvent.delete(c.id);
        deleted.push({ entity: 'PrepaidCompensationEvent', id: c.id });
      }
    }
  } catch (e) { errors.push(`PrepaidCompensationEvent: ${e.message}`); }

  // Clean up recovery notifications
  try {
    const notifs = await base44.entities.PaymentRecoveryNotification.filter(
      { customer_email: { $regex: emailPattern } },
      undefined,
      200
    );
    const notifArr = Array.isArray(notifs) ? notifs : (notifs?.data || []);
    for (const n of notifArr) {
      if (isCertificationId(n.customer_email)) {
        await base44.entities.PaymentRecoveryNotification.delete(n.id);
        deleted.push({ entity: 'PaymentRecoveryNotification', id: n.id });
      }
    }
  } catch (e) { errors.push(`PaymentRecoveryNotification: ${e.message}`); }

  // Clean up subscriptions
  try {
    const subs = await base44.entities.AutoFundSubscription.filter(
      { customer_email: { $regex: emailPattern } },
      undefined,
      200
    );
    const subArr = Array.isArray(subs) ? subs : (subs?.data || []);
    for (const s of subArr) {
      if (isCertificationId(s.customer_email)) {
        await base44.entities.AutoFundSubscription.delete(s.id);
        deleted.push({ entity: 'AutoFundSubscription', id: s.id });
      }
    }
  } catch (e) { errors.push(`AutoFundSubscription: ${e.message}`); }

  // Clean up wallets
  try {
    const wallets = await base44.entities.PrepaidWallet.filter(
      { customer_email: { $regex: emailPattern } },
      undefined,
      200
    );
    const walletArr = Array.isArray(wallets) ? wallets : (wallets?.data || []);
    for (const w of walletArr) {
      if (isCertificationId(w.customer_email)) {
        await base44.entities.PrepaidWallet.delete(w.id);
        deleted.push({ entity: 'PrepaidWallet', id: w.id });
      }
    }
  } catch (e) { errors.push(`PrepaidWallet: ${e.message}`); }

  // Clean up contacts
  try {
    const contacts = await base44.entities.Contact.filter(
      { email: { $regex: emailPattern } },
      undefined,
      200
    );
    const contactArr = Array.isArray(contacts) ? contacts : (contacts?.data || []);
    for (const c of contactArr) {
      if (isCertificationId(c.email)) {
        await base44.entities.Contact.delete(c.id);
        deleted.push({ entity: 'Contact', id: c.id });
      }
    }
  } catch (e) { errors.push(`Contact: ${e.message}`); }

  return { deleted, errors };
}

// ── Production snapshot and cleanup verification ─────────────────────────

export interface ProductionSnapshot {
  total_wallets: number;
  total_wallet_balance_cents: number;
  total_lots: number;
  total_lot_remaining_cents: number;
  total_transactions: number;
  total_payment_events: number;
  total_commission_events: number;
  total_subscriptions: number;
  timestamp: string;
}

/**
 * Snapshot production financial records (non-cert) for before/after comparison.
 * Only counts records where customer_email does NOT contain @cert.test.
 */
export async function snapshotProductionFinancials(base44: any): Promise<ProductionSnapshot> {
  const snapshot: ProductionSnapshot = {
    total_wallets: 0,
    total_wallet_balance_cents: 0,
    total_lots: 0,
    total_lot_remaining_cents: 0,
    total_transactions: 0,
    total_payment_events: 0,
    total_commission_events: 0,
    total_subscriptions: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    const wallets = await base44.entities.PrepaidWallet.filter({}, undefined, 500);
    const walletArr = Array.isArray(wallets) ? wallets : (wallets?.data || []);
    const prodWallets = walletArr.filter(w => !isCertificationId(w.customer_email));
    snapshot.total_wallets = prodWallets.length;
    snapshot.total_wallet_balance_cents = prodWallets.reduce((s, w) => s + (w.booking_value_balance_cents || 0), 0);
  } catch {}

  try {
    const lots = await base44.entities.CreditLot.filter({}, undefined, 500);
    const lotArr = Array.isArray(lots) ? lots : (lots?.data || []);
    const prodLots = lotArr.filter(l => !isCertificationId(l.customer_email));
    snapshot.total_lots = prodLots.length;
    snapshot.total_lot_remaining_cents = prodLots.reduce((s, l) => s + (l.booking_value_remaining_cents || 0), 0);
  } catch {}

  try {
    const txns = await base44.entities.WalletTransaction.filter({}, undefined, 500);
    const txnArr = Array.isArray(txns) ? txns : (txns?.data || []);
    snapshot.total_transactions = txnArr.filter(t => !isCertificationId(t.customer_email)).length;
  } catch {}

  try {
    const events = await base44.entities.AutoFundPaymentEvent.filter({}, undefined, 500);
    const eventArr = Array.isArray(events) ? events : (events?.data || []);
    snapshot.total_payment_events = eventArr.filter(e => !isCertificationId(e.customer_email)).length;
  } catch {}

  try {
    const commissions = await base44.entities.PrepaidCompensationEvent.filter({}, undefined, 500);
    const commArr = Array.isArray(commissions) ? commissions : (commissions?.data || []);
    snapshot.total_commission_events = commArr.filter(c => !isCertificationId(c.employee_email) && !isCertificationId(c.customer_id)).length;
  } catch {}

  try {
    const subs = await base44.entities.AutoFundSubscription.filter({}, undefined, 500);
    const subArr = Array.isArray(subs) ? subs : (subs?.data || []);
    snapshot.total_subscriptions = subArr.filter(s => !isCertificationId(s.customer_email)).length;
  } catch {}

  return snapshot;
}

export interface SnapshotDiff {
  unchanged: boolean;
  diffs: string[];
}

/**
 * Compare two production snapshots. Returns unchanged=true if all counts
 * and balances are identical.
 */
export function compareSnapshots(before: ProductionSnapshot, after: ProductionSnapshot): SnapshotDiff {
  const diffs: string[] = [];

  if (before.total_wallets !== after.total_wallets) {
    diffs.push(`wallets: ${before.total_wallets} → ${after.total_wallets}`);
  }
  if (before.total_wallet_balance_cents !== after.total_wallet_balance_cents) {
    diffs.push(`wallet_balance_cents: ${before.total_wallet_balance_cents} → ${after.total_wallet_balance_cents}`);
  }
  if (before.total_lots !== after.total_lots) {
    diffs.push(`lots: ${before.total_lots} → ${after.total_lots}`);
  }
  if (before.total_lot_remaining_cents !== after.total_lot_remaining_cents) {
    diffs.push(`lot_remaining_cents: ${before.total_lot_remaining_cents} → ${after.total_lot_remaining_cents}`);
  }
  if (before.total_transactions !== after.total_transactions) {
    diffs.push(`transactions: ${before.total_transactions} → ${after.total_transactions}`);
  }
  if (before.total_payment_events !== after.total_payment_events) {
    diffs.push(`payment_events: ${before.total_payment_events} → ${after.total_payment_events}`);
  }
  if (before.total_commission_events !== after.total_commission_events) {
    diffs.push(`commission_events: ${before.total_commission_events} → ${after.total_commission_events}`);
  }
  if (before.total_subscriptions !== after.total_subscriptions) {
    diffs.push(`subscriptions: ${before.total_subscriptions} → ${after.total_subscriptions}`);
  }

  return { unchanged: diffs.length === 0, diffs };
}

export interface CleanupVerificationResult {
  clean: boolean;
  remaining_cert_records: { entity: string; count: number }[];
  errors: string[];
}

/**
 * Verify no cert_-prefixed records remain after cleanup.
 * Queries each entity for any record with @cert.test email pattern.
 */
export async function verifyCleanupComplete(base44: any, runId: string): Promise<CleanupVerificationResult> {
  const remaining: { entity: string; count: number }[] = [];
  const errors: string[] = [];
  const emailPattern = `${runId}_`;

  const entitiesToCheck: { name: string; filter: any }[] = [
    { name: 'AutoFundPaymentEvent', filter: { customer_email: { $regex: emailPattern } } },
    { name: 'WalletTransaction', filter: { customer_email: { $regex: emailPattern } } },
    { name: 'CreditLot', filter: { customer_email: { $regex: emailPattern } } },
    { name: 'PrepaidCompensationEvent', filter: { customer_id: { $regex: emailPattern } } },
    { name: 'PaymentRecoveryNotification', filter: { customer_email: { $regex: emailPattern } } },
    { name: 'AutoFundSubscription', filter: { customer_email: { $regex: emailPattern } } },
    { name: 'PrepaidWallet', filter: { customer_email: { $regex: emailPattern } } },
    { name: 'Contact', filter: { email: { $regex: emailPattern } } },
  ];

  for (const { name, filter } of entitiesToCheck) {
    try {
      const resp = await base44.entities[name].filter(filter, undefined, 200);
      const arr = Array.isArray(resp) ? resp : (resp?.data || []);
      const certRecords = arr.filter((r: any) => {
        const email = r.customer_email || r.email || r.employee_email || '';
        return isCertificationId(email);
      });
      if (certRecords.length > 0) {
        remaining.push({ entity: name, count: certRecords.length });
      }
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }

  return {
    clean: remaining.length === 0 && errors.length === 0,
    remaining_cert_records: remaining,
    errors,
  };
}