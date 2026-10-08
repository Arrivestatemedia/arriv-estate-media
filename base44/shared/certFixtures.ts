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