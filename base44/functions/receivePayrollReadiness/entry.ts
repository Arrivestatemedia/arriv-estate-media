import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { verifySignature, isTimestampFresh } from '../../shared/payrollCrypto.ts';
import { READINESS_EVENT_MAP, recomputeOrientation, writeOrientationAudit, sanitizeReadinessPayload } from '../../shared/orientationEngine.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const secret = Deno.env.get('ARRIV_PAYROLL_WEBHOOK_SECRET');
    const signature = req.headers.get('X-Arriv-Signature') || '';
    const timestamp = req.headers.get('X-Arriv-Timestamp') || '';
    const raw = await req.text();
    if (!secret) return Response.json({ error: 'Webhook secret not configured' }, { status: 500 });
    if (!isTimestampFresh(timestamp)) return Response.json({ error: 'Stale or missing timestamp' }, { status: 401 });
    const ok = await verifySignature(secret, raw, signature);
    if (!ok) return Response.json({ error: 'Invalid signature' }, { status: 401 });

    let body;
    try { body = JSON.parse(raw); } catch (e) { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
    const { arriv_employee_id, event_id, request_id, event_type, payload } = body;
    if (!arriv_employee_id || !event_id || !event_type) {
      return Response.json({ error: 'arriv_employee_id, event_id and event_type are required' }, { status: 400 });
    }

    // Dedup by event_id
    const existing = await base44.asServiceRole.entities.PayrollReadinessEvent.filter({ event_id });
    if (existing && existing.length) return Response.json({ received: true, duplicate: true });

    const safePayload = sanitizeReadinessPayload(payload);
    const eventRec = await base44.asServiceRole.entities.PayrollReadinessEvent.create({
      event_id,
      request_id: request_id || '',
      arriv_employee_id,
      event_type,
      payload: safePayload,
      received_at: new Date().toISOString(),
      processed: false,
      source_application: 'arriv_payroll',
    });

    const orientations = await base44.asServiceRole.entities.SalesOrientation.filter({ arriv_employee_id });
    const orientation = orientations && orientations[0];
    if (!orientation) {
      return Response.json({ received: true, orientationNotFound: true });
    }

    const mapped = READINESS_EVENT_MAP[event_type];
    if (mapped && mapped.set) {
      await base44.asServiceRole.entities.SalesOrientation.update(orientation.id, mapped.set);
    }
    const refreshed = await base44.asServiceRole.entities.SalesOrientation.get(orientation.id);
    await recomputeOrientation(base44, refreshed);
    await writeOrientationAudit(base44, { arriv_employee_id, actor: 'arriv_payroll', role: 'system', action: 'readiness_event_' + event_type, affected_record: event_id, result: 'success' });
    try {
      await base44.asServiceRole.entities.PayrollReadinessEvent.update(eventRec.id, { processed: true });
    } catch (e) {}

    return Response.json({ received: true, applied: !!(mapped && mapped.set) });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});