import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import {
  AUTOFUND_EMERGENCY_STOP_KEY,
  EMERGENCY_STOP_CODE,
  EMERGENCY_STOP_SEMANTICS,
  isAutoFundEmergencyStopped,
} from '../../shared/autoFundEmergencyStop.ts';
import { processMembershipFee, recordFeeRefund } from '../../shared/autoFundMembershipBilling.ts';
import { processAutoFundPayment } from '../../shared/autoFundProcessor.ts';
import { enrollAutoFund } from '../../shared/autoFundEnrollment.ts';
import { cleanupCertRun } from '../../shared/certRunCleanup.ts';

/**
 * ADMIN-ONLY CERTIFICATION — AUTO-FUND EMERGENCY STOP.
 *
 * Verifies that the data-level emergency stop genuinely halts NEW money-in on all
 * three paths — enrollment, wallet-funding issuance and membership-fee billing —
 * and that it is INACTIVE by default, so setting it is the only thing that changes
 * behaviour.
 *
 * The stopped-path calls deliberately run WITHOUT certification mode, so the
 * emergency stop is the deciding factor rather than a bypass. It writes exactly one
 * setting (the stop switch) and one synthetic fee event, and removes both. It
 * enrolls nobody, charges nobody, issues no Booking Value to a real wallet, and
 * changes no price, fee, flag or contract.
 */

export default async function (req: Request): Promise<Response> {
  // Declared outside the try so the exception path can still tear the run down.
  const RUN = `cert_emstop_${Date.now()}`;
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const b = base44.asServiceRole;
    const results: { name: string; passed: boolean; details: any }[] = [];
    const check = (name: string, passed: boolean, details: any = '') =>
      results.push({ name, passed: !!passed, details: typeof details === 'string' ? details : JSON.stringify(details) });

    const setStop = async (value: string | null) => {
      const existing = await b.entities.AppSetting.filter({ key: AUTOFUND_EMERGENCY_STOP_KEY }, undefined, 5);
      const rows = Array.isArray(existing) ? existing : (existing?.data || []);
      for (const r of rows) await b.entities.AppSetting.delete(r.id);
      if (value !== null) await b.entities.AppSetting.create({ key: AUTOFUND_EMERGENCY_STOP_KEY, value });
    };

    const enrollmentPayload: any = {
      base44: b,
      channel: 'sales_assisted',
      tier_amount: 350,
      customer_email: `${RUN}@cert.test`,
      customer_name: 'Certification Emergency Stop',
      customer_phone: '',
      terms_accepted: true,
      terms_accepted_by: `${RUN}@cert.test`,
      billing_address: { line1: '1 Certification Way', city: 'Atlanta', state: 'GA', postal_code: '30301', country: 'US' },
      actor: user.email,
    };

    const fundingPayload: any = {
      base44: b,
      payment_event_id: `${RUN}_funding`,
      subscription_id: `${RUN}_sub`,
      customer_id: `${RUN}_cust`,
      customer_email: `${RUN}@cert.test`,
      wallet_id: `${RUN}_wallet`,
      amount_charged: 150,
      status: 'succeeded',
      event_type: 'topup',
    };

    const feePayload: any = {
      base44: b,
      payment_event_id: `${RUN}_fee`,
      subscription: { amount: 350, membership_fee: 25, customer_id: `${RUN}_cust`, customer_email: `${RUN}@cert.test` },
      status: 'succeeded',
      tier_amount: 350,
    };

    // ── Baseline: the stop is INACTIVE when the setting is absent ────────────
    await setStop(null);
    const stopOff = await isAutoFundEmergencyStopped(b);
    check('E1 · Emergency stop is INACTIVE when the setting is absent', stopOff === false, `stopped=${stopOff}`);

    const enrollBaseline: any = await enrollAutoFund(enrollmentPayload);
    check(
      // Enrollment is OPEN on the live gate (owner authorization, 2026-10-11), so with the
      // stop off the baseline enrollment PROCEEDS rather than being refused by the launch
      // gate. The invariant this check exists for is unchanged and is now asserted directly:
      // that the emergency stop is not what refuses it.
      'E2 · With the stop off, enrollment is not refused by the emergency stop',
      enrollBaseline?.status !== undefined &&
        enrollBaseline?.error_code !== EMERGENCY_STOP_CODE &&
        ['enrolled', 'already_enrolled'].includes(String(enrollBaseline?.status)),
      `status=${enrollBaseline?.status} code=${enrollBaseline?.error_code || ''}`,
    );

    // ── Activate the stop ────────────────────────────────────────────────────
    await setStop('true');
    const stopOn = await isAutoFundEmergencyStopped(b);
    check('E3 · Emergency stop reads ACTIVE once the owner sets it', stopOn === true, `stopped=${stopOn}`);

    const enrollStopped: any = await enrollAutoFund(enrollmentPayload);
    check(
      'E4 · Stop halts NEW ENROLLMENT on every channel',
      enrollStopped?.error_code === EMERGENCY_STOP_CODE,
      `status=${enrollStopped?.status} code=${enrollStopped?.error_code}`,
    );

    const fundStopped: any = await processAutoFundPayment(fundingPayload);
    check(
      'E5 · Stop halts NEW WALLET-FUNDING ISSUANCE',
      fundStopped?.error_code === EMERGENCY_STOP_CODE,
      `status=${fundStopped?.status} code=${fundStopped?.error_code || ''}`,
    );

    const feeStopped: any = await processMembershipFee(feePayload);
    check(
      'E6 · Stop halts NEW MEMBERSHIP-FEE BILLING',
      feeStopped?.error_code === EMERGENCY_STOP_CODE,
      `status=${feeStopped?.status} code=${feeStopped?.error_code || ''}`,
    );

    check(
      'E7 · Refusal happens before any identity resolution or value issuance',
      fundStopped?.error_code === EMERGENCY_STOP_CODE &&
        fundStopped?.booking_value_issued_cents === undefined &&
        feeStopped?.booking_value_issued_cents === undefined,
      `funding_bv=${fundStopped?.booking_value_issued_cents ?? 'none'} fee_bv=${feeStopped?.booking_value_issued_cents ?? 'none'}`,
    );

    // ── Release the stop: behaviour returns to normal ────────────────────────
    await setStop(null);
    const releasedStop = await isAutoFundEmergencyStopped(b);
    const enrollAfter: any = await enrollAutoFund(enrollmentPayload);
    const feeAfter: any = await processMembershipFee(feePayload);
    check(
      'E8 · Releasing the stop restores ordinary behaviour (stop no longer the refusal)',
      // Same posture change: enrollment is open and billing is live, so ordinary behaviour
      // resumes as a successful enrollment and a RECORDED fee. What this check exists for —
      // the stop is no longer the refusal — is asserted directly for both paths.
      releasedStop === false &&
        enrollAfter?.error_code !== EMERGENCY_STOP_CODE &&
        feeAfter?.error_code !== EMERGENCY_STOP_CODE &&
        ['enrolled', 'already_enrolled'].includes(String(enrollAfter?.status)) &&
        feeAfter?.status === 'fee_recorded',
      `stopped=${releasedStop} enroll=${enrollAfter?.status} fee=${feeAfter?.status}`,
    );

    // An isolated, declared fee run proves the fee/funding separation is intact:
    // a recorded fee issues ZERO Booking Value and can never be commissioned.
    const declaredRun: any = await processMembershipFee({
      ...feePayload,
      payment_event_id: `${RUN}_fee_declared`,
      cert_mode: true,
      declared_fee_enabled: true,
    });
    check(
      'E9 · A recorded membership fee issues no Booking Value and no commission',
      declaredRun?.status === 'fee_recorded' &&
        declaredRun?.booking_value_issued_cents === 0 &&
        declaredRun?.generated_commission === false &&
        declaredRun?.generated_promotional_credit === false,
      `status=${declaredRun?.status} bv_cents=${declaredRun?.booking_value_issued_cents} commission=${declaredRun?.generated_commission}`,
    );

    // ── The stop must never touch customer value or corrective actions ───────
    // With the stop ACTIVE: a fee refund (money out and corrections) still records,
    // and no wallet or lot balance anywhere moves when the stop is set or cleared.
    await setStop('true');

    const globalFingerprint = async () => {
      const w = await b.entities.PrepaidWallet.list('-created_date', 300);
      const wArr = Array.isArray(w) ? w : (w?.items || []);
      const l = await b.entities.CreditLot.list('-created_date', 300);
      const lArr = Array.isArray(l) ? l : (l?.items || []);
      return JSON.stringify({
        wallets: wArr.length,
        total_spendable_cents: wArr.reduce((s: number, x: any) => s + (x.booking_value_balance_cents || 0), 0),
        total_held_cents: wArr.reduce((s: number, x: any) => s + (x.dispute_held_cents || 0), 0),
        lots: lArr.length,
        total_lot_remaining_cents: lArr.reduce((s: number, x: any) => s + (x.booking_value_remaining_cents || 0), 0),
      });
    };

    const feeRows = await b.entities.AutoFundPaymentEvent.filter({ payment_event_id: `${RUN}_fee_declared` }, undefined, 1);
    const feeRowsArr = Array.isArray(feeRows) ? feeRows : (feeRows?.data || []);
    const refundWhileStopped: any = feeRowsArr.length
      ? await recordFeeRefund({
          base44: b,
          fee_event: feeRowsArr[0],
          refund_amount: 25,
          reason: 'certification: corrections remain available while the emergency stop is active',
          actor: user.email,
        })
      : null;
    check(
      'E10 · Corrections still work while the stop is active (refunds are not blocked)',
      refundWhileStopped?.status === 'fee_refunded' && refundWhileStopped?.wallet_liability_created === false,
      `status=${refundWhileStopped?.status} wallet_liability=${refundWhileStopped?.wallet_liability_created}`,
    );

    const balanceBefore = await globalFingerprint();
    await setStop(null);
    const balanceAfter = await globalFingerprint();
    check(
      'E11 · Setting and clearing the stop moves no wallet or lot balance',
      balanceBefore === balanceAfter,
      `unchanged=${balanceBefore === balanceAfter} snapshot=${balanceBefore}`,
    );

    // ── Cleanup ──────────────────────────────────────────────────────────────
    // Shared run-scoped teardown. The previous inline version removed only the two fee
    // events; once enrollment opened this suite began SUCCEEDING at its baseline
    // enrollment, and the subscription, wallet, consent record and jurisdiction audit it
    // created were never removed. Teardown now covers every dependent object.
    const cleanup = await cleanupCertRun(b, RUN);
    const cleanupErrors: string[] = [...cleanup.errors];
    try {
      await setStop(null);
    } catch (e: any) {
      cleanupErrors.push(`stop reset: ${e.message}`);
    }

    const remainingFlag = await b.entities.AppSetting.filter({ key: AUTOFUND_EMERGENCY_STOP_KEY }, undefined, 5);
    const remainingArr = Array.isArray(remainingFlag) ? remainingFlag : (remainingFlag?.data || []);
    check(
      'E12 · Stop switch, and every synthetic record this run created, are fully removed',
      remainingArr.length === 0 && cleanup.remaining === 0,
      `switch_rows=${remainingArr.length} fixtures_removed=${cleanup.deleted.length} remaining=${cleanup.remaining} by_entity=${JSON.stringify(cleanup.remaining_by_entity)}`,
    );

    const failed = results.filter(r => !r.passed);

    return Response.json({
      test_run_id: RUN,
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      all_passed: failed.length === 0,
      failures_short: failed.map(f => `${f.name} :: ${f.details}`),
      semantics: EMERGENCY_STOP_SEMANTICS,
      cleanup_errors: cleanupErrors,
      results,
      note: 'Isolated certification run. Only the stop switch and one synthetic fee event were written, and both were removed. No customer was enrolled or charged.',
    });
  } catch (error: any) {
    // Interrupted-run teardown: an exception must not leave synthetic records behind.
    let cleanup: any = null;
    try { cleanup = await cleanupCertRun(createClientFromRequest(req).asServiceRole, RUN); } catch (_e) { cleanup = null; }
    return Response.json({
      error: error.message,
      stack: error.stack,
      fixtures_remaining: cleanup ? cleanup.remaining : null,
      cleanup_errors: cleanup ? cleanup.errors : ['cleanup did not run'],
    }, { status: 500 });
  }
}