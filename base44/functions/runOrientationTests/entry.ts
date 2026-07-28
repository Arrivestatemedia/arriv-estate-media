import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { computeReadiness, sanitizeReadinessPayload, READINESS_EVENT_MAP } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const u = await base44.auth.me();
      if (!u || u.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });
    } catch (e) {
      return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const results = [];
    const assert = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

    // 1. A fresh orientation reports 0% readiness with pending items.
    const r1 = computeReadiness({ status: 'not_started' });
    assert('fresh orientation readiness is 0%', r1.percent === 0, 'percent=' + r1.percent);
    assert('fresh orientation lists missing items', r1.missing.length > 0);

    // 2. A fully complete orientation reports 100%.
    const full = {
      welcome_acknowledged_at: 'x',
      personal_info_status: 'submitted',
      background_check_status: 'clear',
      i9_status: 'complete',
      federal_tax_status: 'complete',
      state_tax_required: false,
      payouts_enabled: true,
      documents_complete: true,
      training_status: 'complete',
      final_review_status: 'approved',
      payroll_ready: true,
    };
    const r2 = computeReadiness(full);
    assert('complete orientation is 100%', r2.percent === 100, 'percent=' + r2.percent);

    // 3. A payroll hold surfaces a blocked entry.
    const r3 = computeReadiness({ ...full, payroll_hold: true });
    assert('payroll hold produces a blocked entry', r3.blocked.length > 0);

    // 4. Readiness payload sanitization strips SSN/banking, keeps safe status.
    const safe = sanitizeReadinessPayload({
      ssn: '123-45-6789',
      bank_account: '9999',
      routing_number: '123456789',
      tax_answers: { allowances: 3 },
      status: 'ok',
      federal_tax_status: 'complete',
      payouts_enabled: true,
    });
    assert('sanitize strips SSN', !('ssn' in safe));
    assert('sanitize strips bank_account', !('bank_account' in safe));
    assert('sanitize strips routing_number', !('routing_number' in safe));
    assert('sanitize strips tax_answers', !('tax_answers' in safe));
    assert('sanitize keeps status', safe.status === 'ok');

    // 5. The readiness event map covers the key Arriv Payroll events.
    assert('event map has payroll_employee_created', !!READINESS_EVENT_MAP.payroll_employee_created);
    assert('event map has federal_tax_setup_complete', !!READINESS_EVENT_MAP.federal_tax_setup_complete);
    assert('event map has stripe_payouts_enabled', !!READINESS_EVENT_MAP.stripe_payouts_enabled);
    assert('event map has payroll_ready', !!READINESS_EVENT_MAP.payroll_ready);
    assert('event map has payroll_hold_applied', !!READINESS_EVENT_MAP.payroll_hold_applied);

    // 6. Idempotency: payroll_ready applied sets the flag.
    assert('payroll_ready map sets payroll_ready=true', READINESS_EVENT_MAP.payroll_ready.set.payroll_ready === true);

    const passed = results.filter((r) => r.pass).length;
    return Response.json({
      success: true,
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});