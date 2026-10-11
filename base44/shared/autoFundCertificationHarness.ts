// ============================================================================
// ARRIV AUTO-FUND — CERTIFICATION HARNESS (SHARED)
// ============================================================================
// The common scaffolding the Auto-Fund certification suites run on: result
// recording, synthetic-fixture tracking and cleanup, a production fingerprint,
// and enrollment through the ISOLATED certification path.
//
// It is shared rather than copied so the two suites cannot drift on the things
// that matter most — how a synthetic customer is created, and what "cleanup"
// and "production unchanged" actually mean.
//
// It never opens public enrollment: enrollment goes through the same
// `certification_bypass` the engine already gates on three conditions, and the
// caller must supply the launch configuration to exercise.
// ============================================================================

import { enrollAutoFund } from './autoFundEnrollment.ts';
import { listNoticesForSubscription } from './autoFundMembershipNotices.ts';

export interface CertHarnessContext {
  svc: any;
  adminEmail: string;
  /** The launch configuration this suite exercises. Declared input, never an activation. */
  launchConfiguration: any;
  customerName: string;
  customerPhone: string;
}

export interface CertEnrollOptions {
  email: string;
  amount: number;
  channel?: string;
  billing?: any;
  payment_method_state?: string;
  terms_accepted?: boolean;
  accepted_by?: string;
  launch_configuration?: any;
}

/**
 * Create the harness for one certification run.
 *
 * `results` is supplied by the caller so the runner can still report after a
 * failure. `configure` completes the harness once the caller has resolved its
 * service-role client and verified the calling admin.
 */
export function createCertHarness({ results = [] as any[] } = {}) {
  const created = { subs: [] as string[], wallets: [] as string[], contacts: [] as string[] };

  let ctx: CertHarnessContext = {
    svc: null,
    adminEmail: '',
    launchConfiguration: null,
    customerName: 'Certification Customer',
    customerPhone: '',
  };

  const configure = (next: Partial<CertHarnessContext>) => {
    ctx = { ...ctx, ...next };
    return ctx;
  };

  const pass = (name: string, detail?: string) => results.push({ name, status: 'PASS', detail: detail || '' });
  const fail = (name: string, detail?: string) => results.push({ name, status: 'FAIL', detail: detail || '' });
  const blocked = (name: string, detail?: string) => results.push({ name, status: 'BLOCKED', detail: detail || '' });
  const check = (name: string, condition: boolean, detail?: string) =>
    (condition ? pass(name, detail) : fail(name, detail));

  /** Register every record an enrollment created, so nothing synthetic is left behind. */
  const track = (r: any) => {
    if (r?.subscription_id) created.subs.push(r.subscription_id);
    if (r?.wallet_id) created.wallets.push(r.wallet_id);
    if (r?.contact_id) created.contacts.push(r.contact_id);
    return r;
  };

  /** Remove every synthetic record this run created, with its notices and audits. */
  const cleanupAll = async () => {
    let ok = true;
    for (const id of created.subs) {
      try {
        for (const n of await listNoticesForSubscription(ctx.svc, id, 100)) {
          try { await ctx.svc.entities.AutoFundMembershipNotice.delete(n.id); } catch { ok = false; }
        }
        const audits = await ctx.svc.entities.AutoFundJurisdictionAudit.filter({ subscription_id: id }, undefined, 100);
        for (const a of (Array.isArray(audits) ? audits : (audits?.data || []))) {
          try { await ctx.svc.entities.AutoFundJurisdictionAudit.delete(a.id); } catch { ok = false; }
        }
        await ctx.svc.entities.AutoFundSubscription.delete(id);
      } catch { ok = false; }
    }
    for (const id of created.wallets) { try { await ctx.svc.entities.PrepaidWallet.delete(id); } catch { ok = false; } }
    for (const id of created.contacts) { try { await ctx.svc.entities.Contact.delete(id); } catch { ok = false; } }
    return {
      ok,
      deleted: { subscriptions: created.subs.length, wallets: created.wallets.length, contacts: created.contacts.length },
    };
  };

  /**
   * A stable fingerprint of PRODUCTION financial records.
   * Synthetic `cert_` records are excluded, so the fingerprint proves that the
   * suite itself changed nothing that belongs to a real customer.
   */
  const fingerprint = async () => {
    const notCert = (rows: any[]) => rows.filter(r => !String(r.customer_email || '').startsWith('cert_'));
    const subs = notCert(await ctx.svc.entities.AutoFundSubscription.list('-created_date', 500));
    const wallets = notCert(await ctx.svc.entities.PrepaidWallet.list('-created_date', 500));
    const events = notCert(await ctx.svc.entities.AutoFundPaymentEvent.list('-created_date', 500));
    return {
      subscriptions: subs.length,
      wallets: wallets.length,
      wallet_balance_cents: wallets.reduce((s: number, w: any) => s + (w.booking_value_balance_cents || 0), 0),
      wallet_value_issued_cents: wallets.reduce((s: number, w: any) => s + (w.total_booking_value_issued_cents || 0), 0),
      payment_events: events.length,
      payment_amount: Math.round(events.reduce((s: number, e: any) => s + (e.amount_charged || 0), 0) * 100),
    };
  };

  /**
   * Enroll through the isolated certification path. The bypass is supplied ONLY
   * here — no user-facing route forwards it — and the launch configuration being
   * exercised must be stated explicitly by the caller.
   */
  const enrollCert = (opts: CertEnrollOptions) =>
    enrollAutoFund({
      base44: ctx.svc,
      channel: (opts.channel || 'self_service') as any,
      tier_amount: opts.amount,
      customer_email: opts.email,
      customer_name: ctx.customerName,
      customer_phone: ctx.customerPhone,
      billing_address: opts.billing,
      payment_method_state: opts.payment_method_state,
      attribution_source: opts.channel === 'sales_assisted' ? 'advisor_enrolled' : '',
      terms_accepted: opts.terms_accepted === undefined ? true : opts.terms_accepted,
      terms_accepted_by: opts.accepted_by === undefined ? opts.email : opts.accepted_by,
      certification_bypass: {
        authorized: true,
        admin_email: ctx.adminEmail,
        launch_configuration: opts.launch_configuration || ctx.launchConfiguration,
      },
      actor: ctx.adminEmail,
    });

  /** The standard suite response body, with per-suite extras merged in. */
  const summarize = (extra: Record<string, any> = {}) => {
    const failed = results.filter(r => r.status === 'FAIL');
    const blockedRows = results.filter(r => r.status === 'BLOCKED');
    return {
      status: failed.length === 0 ? 'success' : 'failed',
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'PASS').length,
        failed: failed.length,
        blocked: blockedRows.length,
      },
      results,
      blocked_checks: blockedRows.map(r => ({ name: r.name, reason: r.detail })),
      ...extra,
    };
  };

  return {
    created, configure, results, pass, fail, check, blocked, track,
    cleanupAll, fingerprint, enrollCert, summarize,
    certCustomerId: (suffix: string) => `cert_${suffix}_customer`,
  };
}